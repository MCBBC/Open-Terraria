// 探针 v4:星云塔(507,AI 无小怪干扰)glow 层 A/B 像素差分(主画布 halo 带 18px 环)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&twr4' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('我已知晓'))?.click();
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  const g = window.__swGame;
  const proto = Object.getPrototypeOf(g.renderer);
  window.__P = { mode: 'on' };
  const og = proto.drawNpcGlow;
  proto.drawNpcGlow = function (e, r, bx, by) {
    if (window.__P.mode === 'noglow') return;
    return og.call(this, e, r, bx, by);
  };
  g.world.timeOfDay = 0.02;
  const st = g.world.store;
  outer: for (let x = Math.floor(st.w / 2) - 30; x < Math.floor(st.w / 2) + 30; x++) {
    for (let y = 60; y < st.h - 60; y++) {
      if (st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)) {
        g.player.x = x * 16 - g.player.w / 2;
        g.player.y = (y - 3) * 16 - g.player.h;
        break outer;
      }
    }
  }
  g.debugSpawnNpc(507, 1, false);
  const t = [...g.entities.enemies].reverse().find((n) => n.vanillaId === 507);
  if (t) { g.player.x = t.x + t.w + 30; g.player.y = t.y + t.h - g.player.h - 4; }
});
await new Promise((r) => setTimeout(r, 1200));

const sample = () => page.evaluate(() => {
  const g = window.__swGame;
  const t = [...g.entities.enemies].find((n) => n.vanillaId === 507 && !n.dead);
  if (!t) return null;
  const c1 = g.camera.worldToScreen(t.x, t.y), c2 = g.camera.worldToScreen(t.x + t.w, t.y + t.h);
  const cv = g.renderer.canvas, ctx = g.renderer.ctx;
  const B = 18;   // halo 带宽
  const x0 = Math.max(0, Math.floor(c1[0]) - B), y0 = Math.max(0, Math.floor(c1[1]) - B);
  const x1 = Math.min(cv.width, Math.ceil(c2[0]) + B), y1 = Math.min(cv.height, Math.ceil(c2[1]) + B);
  const bw = x1 - x0, bh = y1 - y0;
  const d = ctx.getImageData(x0, y0, bw, bh).data;
  const ix = Math.floor(c1[0]) - x0, ax = Math.ceil(c2[0]) - x0, iy = Math.floor(c1[1]) - y0, ay = Math.ceil(c2[1]) - y0;
  let bandSum = 0, bandN = 0, bandMax = 0, bandCnt = 0;
  for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
    if (xx >= ix && xx <= ax && yy >= iy && yy <= ay) continue;
    const i = (yy * bw + xx) * 4;
    const v = Math.max(d[i], d[i + 1], d[i + 2]);
    bandSum += v; bandN++; if (v > bandMax) bandMax = v; if (v > 10) bandCnt++;
  }
  // 远处参考框(天空,塔左 400px)
  const rx0 = Math.max(0, x0 - 420);
  const rd = ctx.getImageData(rx0, y0, Math.max(8, x0 - 8 - rx0), bh).data;
  let rSum = 0, rN = 0;
  for (let i = 0; i < rd.length; i += 4) { rSum += Math.max(rd[i], rd[i + 1], rd[i + 2]); rN++; }
  return { bandAvg: +(bandSum / bandN).toFixed(3), bandMax, bandCnt, refAvg: +(rSum / rN).toFixed(3), screenTop: +c1[1].toFixed(1) };
});
const run = async (mode, n) => {
  await page.evaluate((m) => { window.__P.mode = m; }, mode);
  await new Promise((r) => setTimeout(r, 500));
  const arr = [];
  for (let i = 0; i < n; i++) { const s = await sample(); if (s) arr.push(s); await new Promise((r) => setTimeout(r, 90)); }
  const avg = (k) => +(arr.reduce((a, b) => a + b[k], 0) / arr.length).toFixed(3);
  return { n: arr.length, bandAvg: avg('bandAvg'), bandMax: Math.max(...arr.map((s) => s.bandMax)), bandCnt: Math.round(avg('bandCnt')), refAvg: avg('refAvg') };
};
const on = await run('on', 6);
const off = await run('noglow', 6);
await page.evaluate(() => { window.__P.mode = 'on'; });
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: '/tmp/tower4-nebula-glow-on.png' });
await page.evaluate(() => { window.__P.mode = 'noglow'; });
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: '/tmp/tower4-nebula-glow-off.png' });
console.log(JSON.stringify({ on, off, delta: +(on.bandAvg - off.bandAvg).toFixed(3), pageErrors: errors.slice(0, 3) }, null, 1));
await browser.close();
