// ★SM2 WASM 试点离线场值闸(2026-10-03;k2/c13c fieldgate 同款方法论)。
// 浏览器内 WASM VM vs JS 引擎(codegen 主路径=运行时真身) vs JS VM(oracle 回退支)
// 逐像素对照:128² 真 Perlin × uTime∈{0,0.2,0.5,3.4,13.7,100.3,1234.5,3600.2} ×
// uColor∈{(1,1,1),(2,2,2),(1.37,1.37,1.37)}(k2 网格),验收线 maxd≤2/255。
// 另:冷跑耗时(JS 引擎 vs WASM,20 桶 min/p50/mean)、flag/回退锁在页面环境复核。
// 运行:SW_ORIGIN=http://localhost:5205 node tools/run-diag.mjs scripts/_sm2wasm-fieldgate.mjs
import { launchBrowser, openPage, bootstrap, waitForBridge } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5205';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
// ★带旗导航纪律:bootstrap 的 gotoApp 会把 origin 当裸 origin 再拼 ?t=(URL 变形),
// 查询串必须走完整 URL 直航(goto 后等待桥就绪;旗在模块 import 期与调用期双读)。
await bootstrap(page, ORIGIN);
await page.goto(ORIGIN + '/?sm2wasm=1&t=' + Date.now(), { waitUntil: 'domcontentloaded' });
await waitForBridge(page, { timeout: 120_000 });

const out = await page.evaluate(async () => {
  const smMod = await import('/src/fx/SM2Effect.ts');
  const wMod = await import('/src/wasm/sm2Wasm.ts');
  const W = 128, H = 128;

  // ---- 真 Perlin 128²(ForceFieldBubble.perlinData 同源同式) ----
  const img = new Image();
  img.src = 'sprites/vanilla/Misc_Perlin.png';
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('perlin load fail')); });
  const pcv = document.createElement('canvas');
  pcv.width = W; pcv.height = H;
  const pcx = pcv.getContext('2d', { willReadFrequently: true });
  pcx.drawImage(img, 0, 0, W, H);
  const perlin = pcx.getImageData(0, 0, W, H);

  const wasmReady = await wMod.ensureSm2Wasm();
  const pass = smMod.getPass('ForceField');
  if (!wasmReady || !pass) return { why: wasmReady ? 'no ForceField pass' : 'wasm not ready', wasmReady };

  const mkU = (uTime, uColor) => {
    const u = smMod.defaultUniforms();
    u.uTime = uTime; u.uColor = uColor;
    u.uSourceRect = [0, 0, W, H]; u.uImageSize0 = [W, H];
    return u;
  };
  const runJsEngine = (uTime, uColor) => {
    const d = new Uint8ClampedArray(perlin.data);
    smMod.runPassOnImageData(pass, d, W, H, mkU(uTime, uColor));
    return d;
  };
  const runJsVm = (uTime, uColor) => {
    smMod.setSm2CodegenEnabled(false);
    const d = new Uint8ClampedArray(perlin.data);
    smMod.runPassOnImageData(pass, d, W, H, mkU(uTime, uColor));
    smMod.setSm2CodegenEnabled(true);
    return d;
  };
  const runWasm = (uTime, uColor) => {
    const d = new Uint8ClampedArray(perlin.data);
    const ok = wMod.wasmRunPassOnImageData(pass, d, W, H, mkU(uTime, uColor));
    return ok ? d : null;
  };
  const maxdOf = (a, b) => {
    let m = 0, worst = null;
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i] - b[i]);
      if (d > m) { m = d; worst = i; }
    }
    return { m, worst };
  };

  // ---- 场值闸网格 ----
  const TIMES = [0, 0.2, 0.5, 3.4, 13.7, 100.3, 1234.5, 3600.2];
  const COLORS = [[1, 1, 1], [2, 2, 2], [1.37, 1.37, 1.37]];
  let maxdEngine = 0, worstEngine = null, maxdVm = 0, worstVm = null, determinismBad = 0;
  for (const uColor of COLORS) {
    for (const uTime of TIMES) {
      const jsA = runJsEngine(uTime, uColor);
      const jsVm = runJsVm(uTime, uColor);
      const w1 = runWasm(uTime, uColor);
      const w2 = runWasm(uTime, uColor);
      if (!w1 || !w2) return { why: 'wasm run refused', uTime, uColor };
      for (let i = 0; i < w1.length; i++) if (w1[i] !== w2[i]) { determinismBad++; break; }
      const rE = maxdOf(w1, jsA); if (rE.m > maxdEngine) { maxdEngine = rE.m; worstEngine = { uTime, uColor: [...uColor], i: rE.worst, got: w1[rE.worst], ref: jsA[rE.worst] }; }
      const rV = maxdOf(w1, jsVm); if (rV.m > maxdVm) { maxdVm = rV.m; worstVm = { uTime, uColor: [...uColor], i: rV.worst, got: w1[rV.worst], ref: jsVm[rV.worst] }; }
    }
  }

  // ---- 冷跑耗时(20 个独立桶;先预热) ----
  const warm = 3;
  for (let i = 0; i < warm; i++) { runJsEngine(500 + i * 0.2, [1, 1, 1]); runWasm(500 + i * 0.2, [1, 1, 1]); runJsVm(500 + i * 0.2, [1, 1, 1]); }
  const tJs = [], tWasm = [], tVm = [];
  for (let i = 0; i < 20; i++) {
    const t = 900 + i * 0.2;
    let t0 = performance.now(); runJsEngine(t, [1, 1, 1]); tJs.push(performance.now() - t0);
    t0 = performance.now(); runWasm(t, [1, 1, 1]); tWasm.push(performance.now() - t0);
    t0 = performance.now(); runJsVm(t, [1, 1, 1]); tVm.push(performance.now() - t0);
  }
  const stat = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const mean = a.reduce((p, x) => p + x, 0) / a.length;
    return { min: s[0], p50: s[Math.floor(a.length / 2)], mean, max: s[s.length - 1] };
  };

  // ---- 拒绝/回退面 ----
  const twPass = smMod.getPass('ArmorTwilight');       // s0+s1 采样器 pass → 形态拒
  const refusal = !wMod.wasmRunPassOnImageData(twPass, new Uint8ClampedArray(W * H * 4), W, H, mkU(0, [1, 1, 1]));
  const statsSnap = JSON.parse(JSON.stringify(wMod.__sm2WasmStats));

  return {
    maxdEngine, worstEngine, maxdVm, worstVm, determinismBad,
    tJs: stat(tJs), tWasm: stat(tWasm), tVm: stat(tVm),
    refusal, statsSnap, wasmStatsEnabled: wMod.sm2WasmEnabled(),
  };
});

if (out.why) {
  chk('场值闸前置(wasm 就绪+pass 在场)', false, JSON.stringify(out).slice(0, 300));
} else {
  chk('?sm2wasm=1 页面旗生效', out.wasmStatsEnabled === true);
  chk('WASM 产物位级确定性(同输入两次逐字节)', out.determinismBad === 0, `bad=${out.determinismBad}`);
  chk('场值闸:WASM vs JS 引擎(codegen 主路径)maxd≤2/255', out.maxdEngine <= 2,
    `maxd=${out.maxdEngine} worst=${JSON.stringify(out.worstEngine)}`);
  chk('场值闸:WASM vs JS VM(oracle 回退支)maxd≤2/255', out.maxdVm <= 2,
    `maxd=${out.maxdVm} worst=${JSON.stringify(out.worstVm)}`);
  chk('冷跑耗时:WASM 达 ≤5ms 目标 ∧ ≥5× vs JS VM 解释器基线', out.tWasm.p50 <= 5 && out.tWasm.p50 * 5 <= out.tVm.p50,
    `JS引擎(codegen 主路径,无旗缺省) min=${out.tJs.min.toFixed(2)}/p50=${out.tJs.p50.toFixed(2)}/mean=${out.tJs.mean.toFixed(2)}/max=${out.tJs.max.toFixed(2)}ms | ` +
    `WASM min=${out.tWasm.min.toFixed(2)}/p50=${out.tWasm.p50.toFixed(2)}/mean=${out.tWasm.mean.toFixed(2)}/max=${out.tWasm.max.toFixed(2)}ms | ` +
    `JS VM(oracle 解释器) p50=${out.tVm.p50.toFixed(2)}ms | WASM/VM=${(out.tVm.p50 / out.tWasm.p50).toFixed(1)}× WASM/codegen=${(out.tWasm.p50 / out.tJs.p50).toFixed(2)}×`);
  chk('s1/s2 采样器 pass 形态拒(ArmorTwilight)', out.refusal === true);
  chk('WASM 计数面在账', out.statsSnap.runs > 0, JSON.stringify(out.statsSnap));
}
chk('页面零错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);
