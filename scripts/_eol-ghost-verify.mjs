// ★EoL 定谳刀活机验证（2026-10-03）：修后三账
//   A. 修后 census:srcOOB-empty 回退应归零,presentBatch/帧应≈0（对照修前 448/83）
//   B. 帧计时窗:mean/p95
//   C. 像素 A/B:暂停冻结世界态,同帧仅切 GLShimExecutor.SRC_OOB_NOOP_OFF——
//      截图字节级对拍（off=旧链回退风暴链,on=修后链;位级相等=刀面零像素差实证）
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=280000 scripts/_eol-ghost-verify.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const WINDOW_MS = Number(process.env.CENSUS_MS || 12000);

const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'eolverify', size: 'small', pinRandom: 20261003, log: () => {} });
console.log('createGame:', made?.ok, made?.why || '');

// —— 计数器装表（census 同族） ——
await page.evaluate(() => {
  const g = window.__swGame;
  const shim = g.renderer.bglEntShim;
  if (!shim) { globalThis.__censusErr = 'no-shim-instance'; return; }
  const proto = Object.getPrototypeOf(shim);
  const C = globalThis.__census = { fallback: 0, byCause: {}, present: 0, flush: 0, perFrame: [] };
  const classify = (self, img, rest) => {
    const n = rest.length;
    const iw = img?.width ?? 0, ih = img?.height ?? 0;
    let sx = 0, sy = 0, sw = iw, sh = ih;
    if (n === 2) { sx = rest[0]; sy = rest[1]; }
    else if (n === 4) { sx = rest[0]; sy = rest[1]; sw = rest[2]; sh = rest[3]; }
    else if (n === 8) { sx = rest[0]; sy = rest[1]; sw = rest[2]; sh = rest[3]; }
    if (self.clipped) return 'clip';
    if (n !== 2 && n !== 4 && n !== 8) return 'argc';
    if (![sx, sy, sw, sh].every(Number.isFinite)) return 'nonfinite';
    if (sw > 0 && sh > 0 && (sx >= iw || sx + sw <= 0 || sy >= ih || sy + sh <= 0)) return 'srcOOB-empty';
    if (!(sx >= 0 && sy >= 0 && sx + sw <= iw && sy + sh <= ih) || sw < 0 || sh < 0) return 'srcOOB-partial';
    if (self.gco === 'destination-out') return 'erase-nopair';
    if (self.gco !== 'source-over' && self.gco !== 'lighter') return 'gco';
    if (self.accMode && self.filterV !== 'none') return 'filter-raster';
    return 'decode-null';
  };
  const origRaw = proto.rawDrawImage;
  proto.rawDrawImage = function (img, rest) {
    C.fallback++;
    const k = classify(this, img, rest);
    C.byCause[k] = (C.byCause[k] || 0) + 1;
    return origRaw.call(this, img, rest);
  };
  const origPb = proto.presentBatch;
  proto.presentBatch = function (...a) { C.present++; return origPb.apply(this, a); };
  const origFl = proto.flush;
  proto.flush = function (...a) { C.flush++; return origFl.apply(this, a); };
  if (!g.__origFrameV) {
    g.__origFrameV = g.frame;
    let lastP = 0, lastFb = 0;
    g.frame = function (...a) {
      const t0 = performance.now();
      const r = g.__origFrameV.apply(this, a);
      const d = performance.now() - t0;
      C.perFrame.push({ ms: +d.toFixed(2), present: C.present - lastP, fb: C.fallback - lastFb });
      lastP = C.present; lastFb = C.fallback;
      if (C.perFrame.length > 4000) C.perFrame.shift();
      return r;
    };
  }
  globalThis.__censusReady = true;
});
if (await page.evaluate(() => !globalThis.__censusReady)) { console.error('install fail'); process.exit(1); }

// —— 召光女 ——
const spawn = await page.evaluate(async () => {
  const g = window.__swGame;
  const e = await window.__swFlow.spawnVanillaEnemy(636, g.player.cx, g.player.cy - 400);
  return { ok: !!e };
});
console.log('spawn 636:', JSON.stringify(spawn));
await sleep(2000);

// —— A/B: 计量窗（修后） ——
await page.evaluate(() => { const C = globalThis.__census; C.perFrame.length = 0; C.fallback = 0; C.present = 0; C.byCause = {}; });
await sleep(WINDOW_MS);
const census = await page.evaluate(() => {
  const C = globalThis.__census;
  const fr = C.perFrame.filter((f) => f.ms > 0);
  const durs = fr.map((f) => f.ms).sort((a, b) => a - b);
  const p = (q) => durs.length ? durs[Math.min(durs.length - 1, Math.floor(durs.length * q))] : 0;
  const mean = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
  const presents = fr.map((f) => f.present).sort((a, b) => a - b);
  const pp = (q) => presents.length ? presents[Math.min(presents.length - 1, Math.floor(presents.length * q))] : 0;
  const pMean = presents.length ? presents.reduce((a, b) => a + b, 0) / presents.length : 0;
  return {
    frames: fr.length, fallbackTotal: C.fallback, presentTotal: C.present, byCause: C.byCause,
    frameMs: { mean: +mean.toFixed(2), p50: p(0.5), p95: p(0.95), p99: p(0.99), max: durs[durs.length - 1] ?? 0 },
    presentPerFrame: { mean: +pMean.toFixed(1), p50: pp(0.5), p95: pp(0.95), max: presents[presents.length - 1] ?? 0 },
    framesWith873: fr.filter((f) => f.fb > 0 || f.present > 0).length,
  };
});
console.log('== A. 修后 census ==');
console.log(JSON.stringify(census, null, 1));

// —— C. 像素 A/B:冻结世界态,同帧切回滚口 ——
//  再补几条 873 保证拖尾在场（attack 轮换可能窗内无 873）
await page.evaluate(async () => {
  const g = window.__swGame;
  const px = g.player.cx, py = g.player.cy;
  for (let i = 0; i < 5; i++) {
    await window.__swFlow.spawnHostileProj(px + 200, py - 200 - i * 40, -4 - i, 3 + i, 40, 873, 0);
  }
});
await sleep(2500);   // 拖尾填环
await page.evaluate(() => { window.__swGame.paused = true; });
await sleep(400);

const shotOff = await page.evaluate(async () => {
  const m = await import('/src/render/glshim/GLShimExecutor.ts');
  m.GLShimExecutor.SRC_OOB_NOOP_OFF = true;   // 旧链（风暴链）
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return true;
});
await sleep(600);
const b64Off = await page.screenshot({ type: 'png' });

const shotOn = await page.evaluate(async () => {
  const m = await import('/src/render/glshim/GLShimExecutor.ts');
  m.GLShimExecutor.SRC_OOB_NOOP_OFF = false;  // 修后链
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return true;
});
await sleep(600);
const b64On = await page.screenshot({ type: 'png' });

// 暂停态两臂 present 账（同帧仅门位差）
const pausedAB = await page.evaluate(async () => {
  const m = await import('/src/render/glshim/GLShimExecutor.ts');
  const C = globalThis.__census;
  const read = () => ({ present: C.present, fallback: C.fallback });
  m.GLShimExecutor.SRC_OOB_NOOP_OFF = true;
  await new Promise((r) => setTimeout(r, 500));
  const off = read();
  m.GLShimExecutor.SRC_OOB_NOOP_OFF = false;
  await new Promise((r) => setTimeout(r, 500));
  const on = read();
  return { off, on, perFrameTail: C.perFrame.slice(-6) };
});

const same = b64Off.equals(b64On);
console.log('== C. 像素 A/B（暂停冻结态） ==');
console.log('pausedAB:', JSON.stringify(pausedAB));
console.log('screenshot bit-identical:', same, '| off bytes:', b64Off.length, 'on bytes:', b64On.length);
if (!same) {
  const d64 = Buffer.from(b64Off.toString('base64') === b64On.toString('base64') ? '' : 'diff');
  void d64;
  console.log('DIFF-NOTE: 截图不等——把两 PNG 落盘供区域归因');
}

// 复位+收尾
await page.evaluate(() => { window.__swGame.paused = false; });
await import('node:fs').then((fs) => {
  fs.mkdirSync('/tmp/eol-verify', { recursive: true });
  fs.writeFileSync('/tmp/eol-verify/shot-gate-off.png', b64Off);
  fs.writeFileSync('/tmp/eol-verify/shot-gate-on.png', b64On);
});
console.log('shots: /tmp/eol-verify/shot-gate-{off,on}.png');
await page.browser().close();
