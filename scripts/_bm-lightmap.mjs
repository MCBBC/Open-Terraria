// 一次性:血月世界层解剖——lightCanvas 像素/worldCanvas 像素/主画布对照
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await p.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.8125 + (16200 / 32400) * 0.375 - 0.0005;
  g.world.clock.moonPhase = 0;
  g.world.clock.bloodMoon = true;
  const pl = g.player;
  pl.x = g.world.store.w * 16 / 2;
  pl.vx = 0;
});
await sleep(3000);
await p.evaluate(() => {
  const r = window.__swGame.renderer;
  r.screenFxEnabled = false;
  r.__kill = setInterval(() => { if (r.monoFilters) r.monoFilters.bloodMoonUseOpacity = 0; }, 30);
});
await sleep(1000);
const st = await p.evaluate(() => {
  const r = window.__swGame.renderer;
  const grab = (cv, x, y, w, h) => {
    if (!cv || !cv.width) return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cc = c.getContext('2d');
    cc.drawImage(cv, x, y, w, h, 0, 0, w, h);
    const d = cc.getImageData(0, 0, w, h).data;
    let rr = 0, gg = 0, bb = 0, aa = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; aa += d[i + 3]; n++; }
    return [Math.round(rr / n), Math.round(gg / n), Math.round(bb / n), Math.round(aa / n)];
  };
  const lc = r.lightCanvas;
  const wc = r.worldCanvas;
  return {
    lightCanvasSize: lc ? [lc.width, lc.height] : null,
    // 光照图:屏中心/屏顶/屏底(超采样坐标系)
    lightCenter: lc ? grab(lc, Math.floor(lc.width / 2), Math.floor(lc.height / 2), 8, 8) : null,
    lightTop: lc ? grab(lc, Math.floor(lc.width / 2), 0, 8, 8) : null,
    lightBottom: lc ? grab(lc, Math.floor(lc.width / 2), lc.height - 8, 8, 8) : null,
    worldCanvasSize: wc ? [wc.width, wc.height] : null,
    worldCenter: wc ? grab(wc, Math.floor(wc.width / 2), Math.floor(wc.height / 2), 16, 16) : null,
    worldTop: wc ? grab(wc, Math.floor(wc.width / 2), 10, 16, 16) : null,
    fullbright: !!r.fullbright,
    worldLayerActive: !!r.worldLayerActive
  };
});
console.log('ANATOMY:', JSON.stringify(st));
await p.evaluate(() => { const r = window.__swGame.renderer; if (r.__kill) clearInterval(r.__kill); });
await b.close();
console.log('DONE');
