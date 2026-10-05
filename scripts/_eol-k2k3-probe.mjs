// ★EoL 刀2+修3 活机对拍探针（2026-10-05）:
//   刀2 = 光女(636) atk8/9 残影环 tintedSprite 逐帧重烘批量化（shim uTint 切片）
//   修3 = 923 SunDance 四画改原版两遍预乘习语（Main.cs:28702-28740 A/=2 半加算）
//   STAGE=pre  : 旧代码基线（烘焙计数/帧距/923 旧路径截图+旧模型自检）
//   STAGE=post : 新代码（同会话 OFF/ON 旗切换环 A/B + 923 新路径+原版预测对拍）
// 运行:SW_ORIGIN=http://localhost:5214 node tools/run-diag.mjs --timeout=280000 scripts/_eol-k2k3-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';
import { PNG } from 'pngjs';
import fs from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5214';
const STAGE = process.env.STAGE || 'pre';
const OUT = '/tmp/eol-k2k3';
fs.mkdirSync(OUT, { recursive: true });
const out = { stage: STAGE, ring: {}, sd: {} };

const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'eolk2k3', size: 'small', pinRandom: 20261005, log: () => {} });
console.log('createGame:', made?.ok, made?.why || '');

// ---------- 页内装表:TintAtlas 烘焙计数(按前缀桶)+逐帧账+ai1 驱动 ----------
const inst = await page.evaluate(async () => {
  const g = window.__swGame;
  const T = await import('/src/render/TintAtlas.ts');
  const proto = T.TintAtlas.prototype;
  const K = globalThis.__K = {
    frames: [], cur: { ring: 0, empW: 0, empG: 0, p923: 0, other: 0 },
    total: { ring: 0, empW: 0, empG: 0, p923: 0, other: 0 }, enabled: true,
  };
  if (!proto.__k2patched) {
    proto.__k2patched = true;
    const orig = proto.bake;
    proto.bake = function (key, w, h, paint) {
      if (!K.enabled) return orig.call(this, key, w, h, paint);
      const bucket = key.startsWith('emp|') ? 'ring' : key.startsWith('empW|') ? 'empW'
        : key.startsWith('empG|') ? 'empG' : key.startsWith('p923') ? 'p923' : 'other';
      return orig.call(this, key, w, h, (...a) => {
        K.cur[bucket]++; K.total[bucket]++;
        return paint(...a);   // paint 仅 miss 时执行
      });
    };
  }
  // 逐帧账:ai1 驱动(暂停态逐 rAF 步进=复现攻击期 lum 漂移)+帧距+烘焙差分
  if (!g.__origFrameK) {
    g.__origFrameK = g.frame;
    let last = { ...K.cur };
    g.frame = function (...a) {
      const e = globalThis.__emp;
      if (e && globalThis.__ai1drive) {
        e.ai1 = (globalThis.__ai1base + globalThis.__ai1n) % 68;
        globalThis.__ai1n++;
      }
      const t0 = performance.now();
      const r = g.__origFrameK.apply(this, a);
      const ms = performance.now() - t0;
      if (K.enabled) {
        K.frames.push({ ms: +ms.toFixed(2), ring: K.cur.ring - last.ring, empW: K.cur.empW - last.empW, empG: K.cur.empG - last.empG, p923: K.cur.p923 - last.p923, other: K.cur.other - last.other });
        last = { ...K.cur };
        if (K.frames.length > 4000) K.frames.shift();
      }
      return r;
    };
  }
  // 召光女+钉态
  const px = g.player.cx, py = g.player.cy;
  await window.__swFlow.spawnVanillaEnemy(636, px, py - 120);
  await new Promise((r) => setTimeout(r, 150));
  let emp = null;
  const ens = g.enemies ? g.enemies() : (g.entities?.enemies || []);
  for (const n of ens) { if (n && n.vanillaId === 636 && !n.dead) { emp = n; break; } }
  if (!emp) return { ok: false, why: 'no-636' };
  emp.ai0 = 8; emp.ai1 = 10; emp.ai3 = 0; emp.animT = 8; emp.spawnAlpha = 0;
  emp.vx = 0; emp.vy = 0; emp.facing = 1;
  globalThis.__emp = emp;
  globalThis.__ai1drive = true; globalThis.__ai1base = 0; globalThis.__ai1n = 0;
  g.paused = true;
  g.renderer.fullbright = true;
  const R = await import('/src/render/Renderer.ts');
  return {
    ok: true, cx: emp.cx, cy: emp.cy, id: emp.id,
    bgl: !!R.Renderer.bgl, bglShim: !!R.Renderer.bglShim,
    hasSliceFlag: typeof R.Renderer.empGhostSliceOff,
    layerW: g.renderer.worldCtxLayer?.canvas?.width, layerH: g.renderer.worldCtxLayer?.canvas?.height,
  };
});
console.log('inst:', JSON.stringify(inst));
out.inst = inst;
if (!inst?.ok) { await page.browser().close(); process.exit(1); }

const setSlice = (v) => page.evaluate(async (vv) => {
  const R = await import('/src/render/Renderer.ts');
  R.Renderer.empGhostSliceOff = vv;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return R.Renderer.empGhostSliceOff;
}, v);

// ★acc 态无 worldCanvas（三消,内容在 FBO('world')→收口落主画布）——统一读主画布
//  （fullbright=true 已消光照变量;HUD 静态不扰 A/B）
const readLayer = () => page.evaluate(() => window.__swGame.renderer.canvas.toDataURL('image/png'));

const grabStat = async (n) => await page.evaluate((nn) => {
  const K = globalThis.__K;
  const fr = K.frames.slice(-nn);
  const ms = fr.map((f) => f.ms).sort((a, b) => a - b);
  const q = (p) => ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] : 0;
  const sum = (k) => fr.reduce((a, f) => a + f[k], 0);
  return {
    n: fr.length, msMean: +(ms.reduce((a, b) => a + b, 0) / (ms.length || 1)).toFixed(2),
    msP50: q(0.5), msP95: q(0.95), msMax: ms[ms.length - 1] ?? 0,
    ringTotal: sum('ring'), ringMean: +(sum('ring') / (fr.length || 1)).toFixed(1),
    empW: sum('empW'), empG: sum('empG'), p923: sum('p923'), other: sum('other'),
  };
}, n);

// ---------- 刀2:残影环烘焙窗（ai1 逐帧驱动=攻击期漂移复现） ----------
await sleep(400);
await page.evaluate(() => { globalThis.__K.frames.length = 0; globalThis.__ai1n = 0; });
await sleep(1800);
out.ring.window = await grabStat(90);
console.log('ring window:', JSON.stringify(out.ring.window));

// ---------- 刀2(post):同会话 OFF/ON 旗切换 像素 A/B ----------
if (STAGE === 'post' && inst.hasSliceFlag !== 'undefined') {
  await page.evaluate(() => { globalThis.__ai1drive = false; globalThis.__emp.ai1 = 45; });
  await sleep(300);
  await setSlice(true);  await sleep(350);
  const offPng = await readLayer();
  await setSlice(false); await sleep(350);
  const onPng = await readLayer();
  await page.evaluate(() => { globalThis.__emp.ai1 = 15; });
  await sleep(250);
  await setSlice(true);  await sleep(300);
  const offPng2 = await readLayer();
  await setSlice(false); await sleep(300);
  const onPng2 = await readLayer();
  fs.writeFileSync(`${OUT}/ring-off1.png`, Buffer.from(offPng.split(',')[1], 'base64'));
  fs.writeFileSync(`${OUT}/ring-on1.png`, Buffer.from(onPng.split(',')[1], 'base64'));
  fs.writeFileSync(`${OUT}/ring-off2.png`, Buffer.from(offPng2.split(',')[1], 'base64'));
  fs.writeFileSync(`${OUT}/ring-on2.png`, Buffer.from(onPng2.split(',')[1], 'base64'));
  const diffPng = (a, b) => {
    const A = PNG.sync.read(fs.readFileSync(a)), B = PNG.sync.read(fs.readFileSync(b));
    if (A.width !== B.width) return { err: 'size' };
    let n = 0, mx = 0, bbox = null;
    const hist = {};
    for (let i = 0; i < A.data.length; i += 4) {
      const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]), Math.abs(A.data[i + 3] - B.data[i + 3]));
      if (d > 0) {
        n++; const bkt = d > 8 ? 'gt8' : d > 2 ? 'gt2' : 'le2';
        hist[bkt] = (hist[bkt] || 0) + 1;
        if (d > mx) mx = d;
        const x = (i >> 2) % A.width, y = (i >> 2) / A.width | 0;
        if (!bbox) bbox = [x, y, x, y]; else {
          if (x < bbox[0]) bbox[0] = x; if (y < bbox[1]) bbox[1] = y;
          if (x > bbox[2]) bbox[2] = x; if (y > bbox[3]) bbox[3] = y;
        }
      }
    }
    return { n, maxDelta: mx, hist, bbox };
  };
  out.ring.ab1 = diffPng(`${OUT}/ring-off1.png`, `${OUT}/ring-on1.png`);
  out.ring.ab2 = diffPng(`${OUT}/ring-off2.png`, `${OUT}/ring-on2.png`);
  console.log('ring AB1:', JSON.stringify(out.ring.ab1));
  console.log('ring AB2:', JSON.stringify(out.ring.ab2));
  // ON 链同窗烘焙账(漂移窗)
  await page.evaluate(() => { globalThis.__ai1drive = true; globalThis.__ai1n = 0; globalThis.__K.frames.length = 0; });
  await sleep(1600);
  out.ring.windowOn = await grabStat(90);
  console.log('ring windowOn:', JSON.stringify(out.ring.windowOn));
}

// ---------- 修3:923 SunDance 冻结态+原版语义预测对拍 ----------
const sdInst = await page.evaluate(async () => {
  const g = window.__swGame;
  // 环态冻结(防 on/off 两读间环动污染 diff bbox)
  globalThis.__ai1drive = false;
  if (globalThis.__emp) globalThis.__emp.ai1 = 45;
  const M = await import('/src/entities/bossAI_lategame.ts');
  const A = await import('/src/entities/Arrow.ts');
  const px = g.player.cx, py = g.player.cy;
  const b = new M.SunDanceBeam(px - 500 - 15, py - 140 - 15, 0, -1, 40, false);
  b.la0 = 90; b.scaleV = 1; b.rotation = 0;
  const list = g.entities?.projectiles;
  if (!Array.isArray(list)) return { ok: false, why: 'no-proj-list' };
  list.push(b);
  globalThis.__beam = b;
  globalThis.__beamHomeX = b.x; globalThis.__beamHomeY = b.y;
  // projSprite 懒加载异步——踢一脚+轮询到落地
  let img = A.projSprite(923);
  for (let i = 0; i < 120 && !img; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    img = A.projSprite(923);
  }
  if (!img) return { ok: false, why: 'sprite-923-not-loaded' };
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  cv.getContext('2d').drawImage(img, 0, 0);
  globalThis.__sdSprite = cv.getContext('2d').getImageData(0, 0, img.width, img.height);
  return { ok: true, iw: img.width, ih: img.height, cx: b.cx, cy: b.cy };
});
console.log('sdInst:', JSON.stringify(sdInst));
if (!sdInst?.ok) {
  fs.writeFileSync(`${OUT}/result-${STAGE}.json`, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await page.browser().close();
  process.exit(0);
}
await sleep(400);

const sdOn = await readLayer();
fs.writeFileSync(`${OUT}/sd-on-${STAGE}.png`, Buffer.from(sdOn.split(',')[1], 'base64'));

// ★修3 隔离画布对拍:已知背景+真实 draw()+双模型预测(几何全已知,零场景噪声)
//  - iso 640×360 不透明底(LCG 纹理),beam 钉到画布中心,cx,cy=276,190
//  - draw({ctx:isoCtx}) 走真实实现(2D 链=GL 切削 raw 直绘同语义)
//  - vanilla 模型(独立转录 Main.cs:28701-28741 cut+add)/old 模型(4×SO)
//    各对实际读回算 |Δ|:pre 期 old≈0(仪表自检)+vanilla 大(病灶);
//    post 期 vanilla≈0(修3 对拍)+old 大(回归可见)
const pred = await page.evaluate(async () => {
  const A = await import('/src/render/AuroraSky.ts');
  const hsl = A.hslToRgb255;
  const g = window.__swGame;
  const b = globalThis.__beam;
  const sp = globalThis.__sdSprite;
  const iw = sp.width, ih = sp.height, bandH = Math.floor(ih / 2);
  const la0 = 90;
  const lv = (a, bb, v) => Math.max(0, Math.min(1, (v - a) / (bb - a)));
  const num24 = (0 / (Math.PI * 2) + la0 / 180) % 1;      // baseAng=0
  const num25 = lv(0, 30, la0) * lv(180, 150, la0);
  const lerpV = lv(40, 60, la0);
  const sqY = 0.25 + (0.7 - 0.25) * lerpV;
  const whiten = (c) => [c[0] + (255 - c[0]) * 0.1, c[1] + (255 - c[1]) * 0.1, c[2] + (255 - c[2]) * 0.1];
  const c5 = hsl(num24, 1, 1);
  const v4 = whiten(hsl((num24 + 0.3) % 1, 1, 0.3 + (0.66 - 0.3) * lerpV));
  const v5 = whiten(hsl((num24 + 0.15) % 1, 1, 0.3 + (0.5 - 0.3) * lerpV));
  const passes = [
    { tint: v4, band: 1, mul: 1.2, cut: num25 * 0.5, add: num25 },
    { tint: v5, band: 1, mul: 1.1, cut: num25 * 0.5, add: num25 },
    { tint: c5, band: 0, mul: 1, cut: num25 * 0.5, add: num25 * 0.5 },
    { tint: c5, band: 1, mul: 1, cut: num25 * lerpV, add: num25 * lerpV },
  ];
  const oldGa = [num25 * 0.5, num25 * 0.5, num25 * 0.5, num25 * lerpV];

  // iso 画布:LCG 噪声纹理底(不透明,双域零疑义)
  const W = 640, H = 360, CX = 276, CY = 190, SV = 0.5;
  const iso = document.createElement('canvas');
  iso.width = W; iso.height = H;
  const g2 = iso.getContext('2d', { willReadFrequently: true });
  let seed = 0x2f6e2b1 >>> 0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const im0 = g2.createImageData(W, H);
  for (let i = 0; i < im0.data.length; i += 4) {
    im0.data[i] = 40 + Math.floor(rnd() * 160);
    im0.data[i + 1] = 30 + Math.floor(rnd() * 150);
    im0.data[i + 2] = 60 + Math.floor(rnd() * 140);
    im0.data[i + 3] = 255;
  }
  g2.putImageData(im0, 0, 0);
  // beam 钉到 iso 中心+真实 draw
  b.scaleV = SV; b.rotation = 0;
  b.x = CX - b.w / 2; b.y = CY - b.h / 2;
  const fakeR = { ctx: g2 };
  b.draw(fakeR, null);
  const rd = g2.getImageData(0, 0, W, H);
  b.scaleV = 1;
  b.x = globalThis.__beamHomeX; b.y = globalThis.__beamHomeY;

  const mk = (name) => ({ name, n: 0, sum: 0, mx: 0, hist: { le2: 0, gt2: 0, gt8: 0, gt32: 0 } });
  const acc = { van: mk('vanilla'), old: mk('old') };
  const texel = (tx, ty, band) => {
    const x = Math.max(0, Math.min(iw - 1, tx | 0)), y = Math.max(0, Math.min(bandH - 1, ty | 0)) + band * bandH;
    const i = (y * iw + x) * 4;
    return [sp.data[i], sp.data[i + 1], sp.data[i + 2], sp.data[i + 3]];
  };
  const E = 2;
  for (let py = 0; py < H; py++) {
    for (let px2 = 0; px2 < W; px2++) {
      const i = (py * W + px2) * 4;
      let pr = im0.data[i], pg = im0.data[i + 1], pb = im0.data[i + 2];   // ★模型初态=pristine 背景(非绘后 rd)
      let pa = 1;
      let qr = pr, qg = pg, qb = pb, qa = 1;
      let inside = false;
      for (let k = 0; k < 4; k++) {
        const p = passes[k];
        const dw = iw * SV * p.mul, dh = bandH * sqY * SV * p.mul;
        const dx = CX - 0.03 * dw, dy = CY - dh / 2;
        if (px2 < dx + E || px2 >= dx + dw - E || py < dy + E || py >= dy + dh - E) continue;
        inside = true;
        const tx = Math.floor((px2 + 0.5 - dx) / dw * iw);
        const ty = Math.floor((py + 0.5 - dy) / dh * bandH);
        const t = texel(tx, ty, p.band);
        const ta = t[3] / 255;
        const tint = p.tint;
        const cf = 1 - ta * p.cut;
        pr *= cf; pg *= cf; pb *= cf; pa *= cf;
        pr += t[0] * ta * (tint[0] / 255) * p.add;
        pg += t[1] * ta * (tint[1] / 255) * p.add;
        pb += t[2] * ta * (tint[2] / 255) * p.add;
        pa = Math.min(1, pa + ta * p.add);
        const sa = ta * oldGa[k];
        qr = qr * (1 - sa) + t[0] * ta * (tint[0] / 255) * oldGa[k];
        qg = qg * (1 - sa) + t[1] * ta * (tint[1] / 255) * oldGa[k];
        qb = qb * (1 - sa) + t[2] * ta * (tint[2] / 255) * oldGa[k];
        qa = sa + qa * (1 - sa);
      }
      if (!inside) continue;
      const ao = Math.max(0, Math.min(1, pa)), qo = Math.max(0, Math.min(1, qa));
      const pv = [ao > 0 ? pr / ao : 0, ao > 0 ? pg / ao : 0, ao > 0 ? pb / ao : 0];
      const qv = [qo > 0 ? qr / qo : 0, qo > 0 ? qg / qo : 0, qo > 0 ? qb / qo : 0];
      const act = [rd.data[i], rd.data[i + 1], rd.data[i + 2]];
      for (const [st, vec] of [[acc.van, pv], [acc.old, qv]]) {
        for (let c = 0; c < 3; c++) {
          const dd = Math.abs(vec[c] - act[c]);
          st.n++; st.sum += dd; if (dd > st.mx) st.mx = dd;
          st.hist[dd <= 2 ? 'le2' : dd <= 8 ? 'gt2' : dd <= 32 ? 'gt8' : 'gt32']++;
        }
      }
    }
  }
  const fin = (st) => ({ name: st.name, n: st.n, mean: +(st.sum / (st.n || 1)).toFixed(3), max: +st.mx.toFixed(1), hist: st.hist });
  return { van: fin(acc.van), old: fin(acc.old) };
});
console.log('sdPred:', JSON.stringify(pred, null, 1));
out.sd.pred = pred;

// 修3 相位帧距窗
await page.evaluate(() => { globalThis.__K.frames.length = 0; });
await sleep(1200);
out.sd.window = await grabStat(60);
console.log('sd window:', JSON.stringify(out.sd.window));

fs.writeFileSync(`${OUT}/result-${STAGE}.json`, JSON.stringify(out, null, 1));
console.log('== RESULT ==');
console.log(JSON.stringify(out, null, 1));
await page.browser().close();
