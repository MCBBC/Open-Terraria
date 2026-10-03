// ★EoL 残影回退支定谳探针（2026-10-03）：光女战 ghost op 落 rawDrawImage 的【门归因】
// ——rawDrawImage 全量拦截+按 drawImage 分派表逐支复算分类（clip/argc/源完全越界=
// 2D no-op 类/源部分越界/erase/gco/filter-raster/decode-null）+presentBatch/flush
// 逐帧账 + 872/873 在场弹量对账。运行:
//   SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=280000 scripts/_eol-ghost-census.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const WINDOW_MS = Number(process.env.CENSUS_MS || 15000);

const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: console.log });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'eolcensus', size: 'small', pinRandom: 20261003, log: console.log });
console.log('createGame:', made?.ok, made?.why || '');

// —— 页内装表：拦截 rawDrawImage/presentBatch/flush,按分派表分类 ——
await page.evaluate(() => {
  const g = window.__swGame;
  const shim = g.renderer.bglEntShim;
  if (!shim) { globalThis.__censusErr = 'no-shim-instance'; return; }
  const proto = Object.getPrototypeOf(shim);

  const C = globalThis.__census = {
    fallback: 0, byCause: {}, byTex: {}, oobSySamples: [],
    present: 0, flush: 0, perFrame: [], draws: 0,
  };

  const classify = (self, img, rest) => {
    const n = rest.length;
    const iw = img?.width ?? 0, ih = img?.height ?? 0;
    let sx = 0, sy = 0, sw = iw, sh = ih;
    if (n === 2) { sx = rest[0]; sy = rest[1]; }
    else if (n === 4) { sx = rest[0]; sy = rest[1]; sw = rest[2]; sh = rest[3]; }
    else if (n === 8) { sx = rest[0]; sy = rest[1]; sw = rest[2]; sh = rest[3]; }
    if (self.clipped) return ['clip', iw, ih];
    if (n !== 2 && n !== 4 && n !== 8) return ['argc', iw, ih];
    const finite = [sx, sy, sw, sh].every(Number.isFinite);
    if (!finite) return ['nonfinite', iw, ih];
    if (sw === 0 || sh === 0) return ['zero-src', iw, ih];
    if (sw > 0 && sh > 0 && (sx >= iw || sx + sw <= 0 || sy >= ih || sy + sh <= 0)) return ['srcOOB-empty', iw, ih, sx, sy, sw, sh];
    if (!(sx >= 0 && sy >= 0 && sx + sw <= iw && sy + sh <= ih) || sw < 0 || sh < 0) return ['srcOOB-partial', iw, ih, sx, sy, sw, sh];
    if (self.gco === 'destination-out') return ['erase-nopair', iw, ih];
    if (self.gco !== 'source-over' && self.gco !== 'lighter') return ['gco', iw, ih];
    if (self.accMode && self.filterV !== 'none') return ['filter-raster', iw, ih];
    return ['decode-null', iw, ih];
  };

  const origRaw = proto.rawDrawImage;
  proto.rawDrawImage = function (img, rest) {
    C.fallback++;
    const c = classify(this, img, rest);
    const k = c[0];
    C.byCause[k] = (C.byCause[k] || 0) + 1;
    if (k === 'srcOOB-empty' || k === 'srcOOB-partial') {
      const key = `${c[1]}x${c[2]}`;
      C.byTex[key] = (C.byTex[key] || 0) + 1;
      if (k === 'srcOOB-empty' && C.oobSySamples.length < 40) {
        C.oobSySamples.push({ iw: c[1], ih: c[2], sx: c[3], sy: c[4], sw: c[5], sh: c[6] });
      }
    }
    return origRaw.call(this, img, rest);
  };
  const origPb = proto.presentBatch;
  proto.presentBatch = function (...a) { C.present++; return origPb.apply(this, a); };
  const origFl = proto.flush;
  proto.flush = function (...a) { C.flush++; return origFl.apply(this, a); };

  // 逐帧账（g.frame 包裹,帧尾快照差分）
  if (!g.__origFrameC) {
    g.__origFrameC = g.frame;
    let lastP = 0, lastF = 0, lastFb = 0, lastDr = 0;
    g.frame = function (...a) {
      const t0 = performance.now();
      const r = g.__origFrameC.apply(this, a);
      const d = performance.now() - t0;
      const projs = g.entities?.projectiles;
      let n872 = 0, n873 = 0;
      if (projs?.forEach) projs.forEach((p) => { if (p?.projId === 872) n872++; else if (p?.projId === 873) n873++; });
      C.perFrame.push({ ms: +d.toFixed(2), present: C.present - lastP, flush: C.flush - lastF, fb: C.fallback - lastFb, draws: C.draws - lastDr, n872, n873 });
      lastP = C.present; lastF = C.flush; lastFb = C.fallback; lastDr = C.draws;
      if (C.perFrame.length > 4000) C.perFrame.shift();
      return r;
    };
  }
  globalThis.__censusReady = true;
});
if (await page.evaluate(() => !globalThis.__censusReady)) {
  console.error('census install fail:', await page.evaluate(() => globalThis.__censusErr || 'unknown'));
  process.exit(1);
}

// —— 召光女（636）+ 拉开距离让其放弹幕 ——
const spawn = await page.evaluate(async () => {
  const g = window.__swGame;
  const px = g.player.cx, py = g.player.cy;
  const e = await window.__swFlow.spawnVanillaEnemy(636, px, py - 400);
  return { ok: !!e, e, px, py };
});
console.log('spawn 636:', JSON.stringify(spawn));
await sleep(2500);

// —— 计量窗 ——
await page.evaluate(() => { const C = globalThis.__census; C.__t0 = performance.now(); C.perFrame.length = 0; C.fallback = 0; C.present = 0; C.flush = 0; C.byCause = {}; C.byTex = {}; C.oobSySamples = []; });
await sleep(WINDOW_MS);
const out = await page.evaluate(() => {
  const C = globalThis.__census;
  const fr = C.perFrame.filter((f) => f.ms > 0);
  const durs = fr.map((f) => f.ms).sort((a, b) => a - b);
  const p = (q) => durs.length ? durs[Math.min(durs.length - 1, Math.floor(durs.length * q))] : 0;
  const mean = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
  const presents = fr.map((f) => f.present).sort((a, b) => a - b);
  const pp = (q) => presents.length ? presents[Math.min(presents.length - 1, Math.floor(presents.length * q))] : 0;
  const pMean = presents.length ? presents.reduce((a, b) => a + b, 0) / presents.length : 0;
  const framesWith873 = fr.filter((f) => f.n873 > 0).length;
  const framesWith872 = fr.filter((f) => f.n872 > 0).length;
  const max873 = Math.max(0, ...fr.map((f) => f.n873));
  const max872 = Math.max(0, ...fr.map((f) => f.n872));
  return {
    frames: fr.length,
    fallbackTotal: C.fallback, presentTotal: C.present, flushTotal: C.flush,
    byCause: C.byCause, byTex: C.byTex,
    oobSySamples: C.oobSySamples.slice(0, 12),
    frameMs: { mean: +mean.toFixed(2), p50: p(0.5), p95: p(0.95), p99: p(0.99), max: durs[durs.length - 1] ?? 0 },
    presentPerFrame: { mean: +pMean.toFixed(1), p50: pp(0.5), p95: pp(0.95), max: presents[presents.length - 1] ?? 0 },
    presence: { framesWith873, framesWith872, max873, max872 },
    perFrameTop10: [...fr].sort((a, b) => b.present - a.present).slice(0, 10),
    accModeSample: (() => { const g = window.__swGame; const s = g.renderer.bglEntShim; return { accMode: s?.accMode, active: s?.active, raw: !!s?.raw, stats: s ? { ...s.stats } : null }; })(),
  };
});
console.log(JSON.stringify(out, null, 1));
await page.browser().close();
