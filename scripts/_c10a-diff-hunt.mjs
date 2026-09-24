// C10a 诊断 v4:prepare 循环(解暂停→云量 200→收敛→暂停)后长窗漂移观测
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });

await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { }
  sky.maintainClouds = () => {};
  const lc = document.createElement('canvas');
  const lctx = lc.getContext('2d', { willReadFrequently: true });
  window.__snapB64 = () => {
    const c = g.renderer.canvas;
    if (lc.width !== c.width || lc.height !== c.height) { lc.width = c.width; lc.height = c.height; }
    lctx.clearRect(0, 0, lc.width, lc.height);
    lctx.drawImage(c, 0, 0);
    const d = lctx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return btoa(bin);
  };
  window.__cam = () => { const c = window.__swGame.camera; return [c.x, c.y, c.zoom]; };
  window.__full = () => {
    const c = g.renderer.canvas;
    if (lc.width !== c.width || lc.height !== c.height) { lc.width = c.width; lc.height = c.height; }
    lctx.clearRect(0, 0, lc.width, lc.height);
    lctx.drawImage(c, 0, 0);
    return Array.from(lctx.getImageData(0, 0, lc.width, lc.height).data);
  };
});
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
}));
await pump(page, 160);

// ---- prepare 循环(同 AB 探针阴天相位) ----
const w0 = await page.evaluate(() => { const w = window.__swGame.world.weather; return w ? [w.cloudAlpha, w.numClouds] : null; });
await page.evaluate(() => { window.__swGame.paused = false; });
await page.evaluate(() => { delete window.__swGame.renderer.sky.maintainClouds; });
await page.evaluate(() => {
  const w = window.__swGame.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0.5; w.maxRaining = 0.5; w.numClouds = 200; w.lightning = 0; }
});
await pump(page, 50);
await page.evaluate(() => {
  const w = window.__swGame.world.weather;
  if (w) w.update = () => {};
  window.__swGame.renderer.sky.maintainClouds = () => {};
  window.__swGame.paused = true;
});
console.log('weather before pause:', JSON.stringify(w0));
await pump(page, 120);

// ---- 长窗观测:12 帧 × 间隔 10,md5 轻量窗(首个差对再拉全量) ----
const md5b64 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');
const b64s = [];
const cams = [];
for (let i = 0; i < 12; i++) {
  b64s.push(await page.evaluate(() => window.__snapB64()));
  cams.push(await page.evaluate(() => window.__cam()));
  await pump(page, 10);
}
const hashes = b64s.map(md5b64);
console.log('cams:', JSON.stringify([cams[0], cams[11]]));
const diffs = [];
for (let i = 0; i + 1 < hashes.length; i++) diffs.push(`${i}->${i + 1}:${hashes[i] === hashes[i + 1] ? 'EQ' : 'DIFF'}`);
console.log('adjacent:', diffs.join('  '));
// 逐帧 md5;首个 DIFF 瞬间立即落全量对
let prevHash = md5b64(await page.evaluate(() => window.__snapB64()));
let prevFull = await page.evaluate(() => window.__full());
let caught = false;
for (let i = 0; i < 40 && !caught; i++) {
  await pump(page, 1);
  const h = md5b64(await page.evaluate(() => window.__snapB64()));
  if (h !== prevHash) {
    const curFull = await page.evaluate(() => window.__full());
    const r = await page.evaluate(({ P, Q }) => {
      const W = window.__swGame.renderer.canvas.width;
      const rows = new Array(1000).fill(0);
      const samples = [];
      for (let i = 0; i < P.length; i += 4) {
        const dd = Math.abs(P[i] - Q[i]) + Math.abs(P[i + 1] - Q[i + 1]) + Math.abs(P[i + 2] - Q[i + 2]);
        if (dd > 0) {
          const px = (i >> 2) % W, py = (i >> 2) / W | 0;
          rows[py]++;
          if (samples.length < 12) samples.push({ x: px, y: py, A: [P[i], P[i + 1], P[i + 2]], B: [Q[i], Q[i + 1], Q[i + 2]] });
        }
      }
      const hot = rows.map((n, y) => ({ y, n })).filter((e) => e.n > 0).sort((a, b) => b.n - a.n).slice(0, 10);
      return { hot, samples };
    }, { P: prevFull, Q: curFull });
    console.log(`DIFF at step ${i}:`);
    console.log('hot rows:', JSON.stringify(r.hot));
    console.log('samples:', JSON.stringify(r.samples));
    caught = true;
  } else {
    prevHash = h;
    prevFull = await page.evaluate(() => window.__full());
  }
}
if (!caught) console.log('NO DIFF in 40 frames');
await browser.close();
process.exit(0);
