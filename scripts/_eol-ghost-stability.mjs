// ★EoL 定谳刀稳定性长窗（2min 光女战）:逐 10s 采样 fallback/present/帧自耗,
// 验证风暴清零且无累积劣化（纹理缓存增长/降级常态化=两项已知劣化指纹）。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=280000 scripts/_eol-ghost-stability.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const TOTAL_MS = Number(process.env.STAB_MS || 120000);

const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'eolstab', size: 'small', pinRandom: 20261003, log: () => {} });
console.log('createGame:', made?.ok);

await page.evaluate(() => {
  const g = window.__swGame;
  const proto = Object.getPrototypeOf(g.renderer.bglEntShim);
  const C = globalThis.__census = { fallback: 0, present: 0, flush: 0, rafGaps: [] };
  const origPb = proto.presentBatch;
  proto.presentBatch = function (...a) { C.present++; return origPb.apply(this, a); };
  const origFl = proto.flush;
  proto.flush = function (...a) { C.flush++; return origFl.apply(this, a); };
  // rawDrawImage 计数（不加分类开销）
  const origRaw = proto.rawDrawImage;
  proto.rawDrawImage = function (img, rest) { C.fallback++; return origRaw.call(this, img, rest); };
  // 真 rAF 帧距（headless 口径,只看劣化趋势非绝对值）
  let last = performance.now();
  const loop = (t) => { C.rafGaps.push(t - last); last = t; if (C.rafGaps.length > 6000) C.rafGaps.shift(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  // 帧自耗
  if (!g.__origFrameS) {
    g.__origFrameS = g.frame;
    const durs = globalThis.__frameDurs = [];
    g.frame = function (...a) {
      const t0 = performance.now();
      const r = g.__origFrameS.apply(this, a);
      durs.push(performance.now() - t0);
      if (durs.length > 6000) durs.shift();
      return r;
    };
  }
  globalThis.__censusReady = true;
});

await page.evaluate(async () => {
  const g = window.__swGame;
  await window.__swFlow.spawnVanillaEnemy(636, g.player.cx, g.player.cy - 400);
});
await sleep(2000);

console.log('== 2min 光女战稳定性（每 10s 采样） ==');
console.log('t(s)  frames  fb     present  flush  frameMs(p50/p95/max)  rafGap(p50/p95)');
const t0 = Date.now();
let prev = { fb: 0, present: 0, flush: 0 };
let sec = 0;
while (Date.now() - t0 < TOTAL_MS) {
  await sleep(10000);
  sec += 10;
  const s = await page.evaluate(() => {
    const C = globalThis.__census;
    const durs = (globalThis.__frameDurs || []).slice().sort((a, b) => a - b);
    const gaps = C.rafGaps.slice().sort((a, b) => a - b);
    const p = (arr, q) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] : 0;
    const shim = window.__swGame.renderer.bglEntShim;
    return {
      fb: C.fallback, present: C.present, flush: C.flush,
      fd50: p(durs, 0.5), fd95: p(durs, 0.95), fdMax: durs[durs.length - 1] ?? 0,
      rg50: +p(gaps, 0.5).toFixed(1), rg95: +p(gaps, 0.95).toFixed(1),
      accFails: shim ? JSON.stringify(shim.stats.accFails) : 'n/a',
      fallbackStat: shim ? shim.stats.fallback : -1,
      replays: shim ? shim.stats.replays : -1,
    };
  });
  console.log(
    String(sec).padStart(4),
    String(Math.round(sec * 48)).padStart(5),   // 近似帧序号（headless ~48fps 基线）
    String(s.fb - prev.fb).padStart(6),
    String(s.present - prev.present).padStart(8),
    String(s.flush - prev.flush).padStart(6),
    `${s.fd50.toFixed(1)}/${s.fd95.toFixed(1)}/${s.fdMax.toFixed(1)}`.padStart(20),
    `${s.rg50}/${s.rg95}`.padStart(12),
    'accFails:', s.accFails, 'shimFb:', s.fallbackStat, 'replays:', s.replays,
  );
  prev = { fb: s.fb, present: s.present, flush: s.flush };
}
await page.browser().close();
