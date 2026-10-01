// ★K2 场值闸诊断②：SM2 常量表转储（preshader 终值）+ VM/codegen 双引擎产物对照
// + 单像素指令级 trace——定谳 maxd=244 的公式归属。
// 运行:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_k2-fdiag2.mjs
import { launchBrowser, openPage, bootstrap } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');

const out = await page.evaluate(async () => {
  const smMod = await import('/src/fx/SM2Effect.ts');
  const W = 128, H = 128;
  const img = new Image();
  img.src = 'sprites/vanilla/Misc_Perlin.png';
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('load')); });
  const pcv = document.createElement('canvas');
  pcv.width = W; pcv.height = H;
  const pcx = pcv.getContext('2d', { willReadFrequently: true });
  pcx.drawImage(img, 0, 0, W, H);
  const perlin = pcx.getImageData(0, 0, W, H);
  const pass = smMod.getPass('ForceField');

  const mkU = (uTime, uColor) => {
    const u = smMod.defaultUniforms();
    u.uTime = uTime; u.uColor = uColor;
    u.uSourceRect = [0, 0, W, H]; u.uImageSize0 = [W, H];
    return u;
  };

  // ---- 常量表（preshader 终值直读）----
  const c = pass.setupConstants(mkU(0.2, [1.37, 1.37, 1.37]));
  const consts = {};
  for (let r = 0; r < 14; r++) {
    const v = [c[r * 4], c[r * 4 + 1], c[r * 4 + 2], c[r * 4 + 3]];
    if (v.some((x) => x !== 0)) consts['c' + r] = v.map((x) => +x.toPrecision(7));
  }

  // ---- 双引擎产物（同 uTime/uColor）----
  const runEngine = (useGen) => {
    smMod.setSm2CodegenEnabled(useGen);
    const data = new Uint8ClampedArray(perlin.data);
    smMod.runPassOnImageData(pass, data, W, H, mkU(0.2, [1.37, 1.37, 1.37]));
    smMod.setSm2CodegenEnabled(true);
    return data;
  };
  const gen = runEngine(true);
  const vm = runEngine(false);
  let engineDiff = 0, worst = null;
  for (let i = 0; i < gen.length; i++) {
    const d = Math.abs(gen[i] - vm[i]);
    if (d > engineDiff) { engineDiff = d; worst = i; }
  }

  // ---- 单像素 (55,44) 指令级 trace（VM 逐步）----
  // 手工重放 VM 语义（SM2Pass.execPixelVM 的内联克隆,只取指令序列）
  const px = 55, py = 44;
  const t0x = (px + 0.5) / W, t0y = (py + 0.5) / H;
  const c2 = pass.setupConstants(mkU(0.2, [1.37, 1.37, 1.37]));
  const srcData = new Uint8ClampedArray(perlin.data);
  const samp = (uu, vv, o4) => {
    const x = uu * W - 0.5, y = vv * H - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const cl = (xx, yy) => {
      const sx = xx < 0 ? 0 : xx >= W ? W - 1 : xx;
      const sy = yy < 0 ? 0 : yy >= H ? H - 1 : yy;
      const i = ((sy | 0) * W + (sx | 0)) * 4;
      o4[0] = srcData[i] / 255; o4[1] = srcData[i + 1] / 255; o4[2] = srcData[i + 2] / 255; o4[3] = srcData[i + 3] / 255;
    };
    const a = [0,0,0,0], b = [0,0,0,0], cc = [0,0,0,0], d = [0,0,0,0];
    cl(x0, y0, a); cl(x0+1, y0, b); cl(x0, y0+1, cc); cl(x0+1, y0+1, d);
    for (let k = 0; k < 4; k++) o4[k] = (a[k] + (b[k]-a[k])*fx) + ((cc[k] + (d[k]-cc[k])*fx) - (a[k] + (b[k]-a[k])*fx))*fy;
  };
  const trace = [];
  const regs = new Float64Array(64);
  const o = new Float64Array(4);
  const texc = new Float64Array(8 * 4);
  const v0 = new Float64Array(8); v0[0]=v0[1]=v0[2]=v0[3]=1;
  texc[0] = t0x; texc[1] = t0y;
  // 直接用 VM 引擎跑单像素（禁 codegen）
  smMod.setSm2CodegenEnabled(false);
  const one = (pass2) => { /* noop */ };
  // execPixel 走 pass 内部 VM —— 调用并 trace regs（execPixel 后读 regs 终值有限,
  // 改为逐指令手写关键段:按 gen 体同序读 C 值复算）
  smMod.setSm2CodegenEnabled(true);
  // 关键寄存器复算（与 gen 体 inst#8-57 同序,读上面 dump 的常量表）
  const C = (i) => c2[i];
  const R = {};
  R.r0x = texc[0] + -C(0); R.r0y = texc[1] + -C(1);                 // inst8
  R.r0x = R.r0x * C(4) + C(20); R.r0y = R.r0y * C(5) + C(20);       // inst10 (r1.w=C[20]=c5.x)
  R.r1w = C(20);
  R.r2 = R.r0y * C(27) + C(12);                                     // inst12 (R[3]=C[27])
  const r0x_pre = R.r0x, r0y_pre = R.r0y;
  R.r0x = r0x_pre * C(21); R.r0y = r0y_pre * C(22);                 // inst13
  R.rho2 = R.r0x * R.r0x + R.r0y * R.r0y + C(23);                   // inst14 (dp2add)
  const rho = 1 / (1 / Math.sqrt(R.rho2));                          // inst15/16
  R.r1 = R.r2 * C(38);                                              // inst17
  const a1 = Math.abs(R.r1); const f1 = a1 - Math.floor(a1);        // inst18/19
  const saw = R.r2 >= 0 ? f1 : -f1;                                 // inst20 (条件源 R[2]=z)
  const t21 = saw * C(34) + C(35);                                  // inst21 → R[2]
  const t22 = saw * C(32) + C(33);                                  // inst22 → R[1]
  const f23 = t21 - Math.floor(t21);                                // inst23
  const t24 = f23 * C(40) + C(41);                                  // inst24 → R[2]
  const ang = t22 >= 0 ? C(39) : t24;                               // inst25 (条件源 R[1]=inst22!)
  const band = Math.cos(ang) * C(42) + C(43);                       // inst26/27 (C[42]=c10.z,C[43]=c10.w)
  const d = rho * C(24);                                            // inst28
  const e0 = d * C(24) + C(25);                                     // inst29 — 注意:R[0]=ρ·C24 再 +C25
  const e = Math.min(1, Math.max(0, e0 * C(26)));                   // inst30
  const sd = 1 / (1 / Math.sqrt(d));                                // inst31/32
  const puvx = (texc[0] + -C(8)) * sd + -C(20);                     // inst33/34 (C[8]=c2.x, -C[20]=-c5.x)
  const puvy = (texc[1] + -C(9)) * sd + -C(20);
  const p = [0,0,0,0]; samp(puvx, puvy, p);
  const pr = p[0];
  const t = Math.min(1, Math.max(0, (pr * band + C(28)) * C(26)));  // inst36/37 (C[28]=c7.x=-0.3)
  const s1 = (3 - 2 * t) * t * t;
  const lr = s1 / pr + (1 - s1) * C(22);                            // inst41/43 (C[22]=c5.z=1)
  const P = pr * pr * lr;
  const A = 1 - (3 - 2 * e) * e * e;
  const w1 = P * band * A;
  const w2 = A * d * d * d;
  const w = 0.75 * w2 + w1;
  const pix = {
    px, py, consts_c0_c3: [consts.c0, consts.c1, consts.c2, consts.c3],
    engineDiff, worst,
    genA: gen[((py * W) + px) * 4 + 3], vmA: vm[((py * W) + px) * 4 + 3],
    interp: { rho: +rho.toFixed(4), saw: +saw.toFixed(4), t22: +t22.toFixed(4), ang: +ang.toFixed(4),
      band: +band.toFixed(4), d: +d.toFixed(4), pr: +pr.toFixed(4), e: +e.toFixed(4),
      w: +w.toFixed(4), w1: +w1.toFixed(4), w2: +w2.toFixed(4) },
  };
  return pix;
});
console.log(JSON.stringify(out, null, 1));
process.exit(0);
