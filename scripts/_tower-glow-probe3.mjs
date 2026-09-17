// 探针 v3:正确画布(g.renderer.canvas)上做 A/B 像素差分,逐层定谳 glow/shield 是否落屏
//  A/B1: drawNpcGlow 真 vs no-op → 差分 = glow 层实绘像素
//  A/B2: drawTowerShield 真 vs no-op(盾=100) → 差分 = 护盾层实绘像素
//  另报:全部 canvas 清单 / towerShieldTex 产物像素统计(贴 stash)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&twr3' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('我已知晓'));
  btn?.click();
});
await new Promise((r) => setTimeout(r, 300));

await page.evaluate(() => {
  const g = window.__swGame;
  const proto = Object.getPrototypeOf(g.renderer);
  window.__P = { mode: 'on' };
  const og = proto.drawNpcGlow, os = proto.drawTowerShield;
  proto.drawNpcGlow = function (e, r, bx, by) {
    if (window.__P.mode === 'noglow') return;
    return og.call(this, e, r, bx, by);
  };
  proto.drawTowerShield = function (e, world) {
    if (window.__P.mode === 'noshield') return;
    return os.call(this, e, world);
  };
  // stash towerShieldTex 产物:包装原方法,把返回 canvas 记下
  const ot = proto.towerShieldTex;
  proto.towerShieldTex = function (key, col, bright) {
    const t = ot.call(this, key, col, bright);
    if (t) {
      window.__P.tex = { key, w: t.width, h: t.height };
      const tc = t.getContext('2d');
      const d = tc.getImageData(0, 0, t.width, t.height).data;
      let aNz = 0, rgbSum = 0, n = 0;
      for (let i = 0; i < d.length; i += 40) { if (d[i + 3] > 8) aNz++; rgbSum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }
      window.__P.texStats = { sampled: n, alphaNonZeroPct: +((aNz / n) * 100).toFixed(1), avgRgb: +(rgbSum / n).toFixed(1) };
    }
    return t;
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
  g.debugSpawnNpc(517, 1, false);
  const t = [...g.entities.enemies].reverse().find((n) => n.vanillaId === 517);
  if (t) { g.player.x = t.x + t.w + 30; g.player.y = t.y + t.h - g.player.h - 4; }
  g.world.lunarEvent.shield.solar = 100;
  g.world.lunarEvent.towerActive.solar = true;
});
await new Promise((r) => setTimeout(r, 1500));

const sampleBox = (page) => page.evaluate(() => {
  const g = window.__swGame;
  const t = [...g.entities.enemies].find((n) => n.vanillaId === 517 && !n.dead);
  if (!t) return null;
  const cam = g.camera;
  const c1 = cam.worldToScreen(t.x, t.y), c2 = cam.worldToScreen(t.x + t.w, t.y + t.h);
  const cv = g.renderer.canvas;                 // ★渲染器主画布
  const ctx = g.renderer.ctx;
  const x0 = Math.max(0, Math.floor(c1[0]) - 30), y0 = Math.max(0, Math.floor(c1[1]) - 30);
  const x1 = Math.min(cv.width, Math.ceil(c2[0]) + 30), y1 = Math.min(cv.height, Math.ceil(c2[1]) + 30);
  const bw = x1 - x0, bh = y1 - y0;
  const d = ctx.getImageData(x0, y0, bw, bh).data;
  let mx = 0, sum = 0, n = 0, cnt = 0;
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(d[i], d[i + 1], d[i + 2]); if (v > mx) mx = v; sum += v; n++; if (v > 10) cnt++; }
  return { box: [x0, y0, bw, bh], maxCh: mx, avg: +(sum / n).toFixed(2), cntBright: cnt,
    canvasInfo: { w: cv.width, h: cv.height }, towerScreen: { c1, c2 } };
});
const canvases = await page.evaluate(() => [...document.querySelectorAll('canvas')].map((c) => ({
  w: c.width, h: c.height, id: c.id || null, cls: c.className || null,
  isMain: c === window.__swGame.renderer.canvas,
  isLight: c === window.__swGame.renderer.lightCanvas,
})));
const base = await sampleBox(page);
await page.evaluate(() => { window.__P.mode = 'noglow'; });
await new Promise((r) => setTimeout(r, 700));
const noGlow = await sampleBox(page);
await page.evaluate(() => { window.__P.mode = 'on'; });
await new Promise((r) => setTimeout(r, 700));
const withGlow = await sampleBox(page);
await page.evaluate(() => { window.__P.mode = 'noshield'; });
await new Promise((r) => setTimeout(r, 700));
const noShield = await sampleBox(page);
await page.screenshot({ path: '/tmp/tower3-night.png' });
await page.evaluate(() => { window.__P.mode = 'on'; });
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: '/tmp/tower3-night-full.png' });
const texInfo = await page.evaluate(() => ({ tex: window.__P.tex, texStats: window.__P.texStats }));
console.log(JSON.stringify({ canvases, base, noGlow, withGlow, noShield, texInfo, pageErrors: errors.slice(0, 3) }, null, 1));
await browser.close();
