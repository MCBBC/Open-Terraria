import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const SAVE = '/Users/vinlic/Downloads/map-Starter_World (27).json';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto(`${ORIGIN}/?play=small&beh=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
});
const text = readFileSync(SAVE, 'utf8');
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, text);
await new Promise((r) => setTimeout(r, 2000));
const r = await page.evaluate(() => {
  const g = window.__swGame;
  const proto = Object.getPrototypeOf(g.renderer);
  const orig = proto.drawDummyTileAnim;
  const out = { xf: null, dev: null, cam: null, worldWin: null };
  window.__xfDump = null;
  proto.drawDummyTileAnim = function (ctx, world, entities, cam, viewW, viewH, z, dev) {
    const t = ctx.getTransform();
    out.xf = { a: +t.a.toFixed(3), b: t.b, c: t.c, d: +t.d.toFixed(3), e: Math.round(t.e), f: Math.round(t.f) };
    out.dev = { zz: +dev.zz.toFixed(3), ox: dev.ox, oy: dev.oy, camRX: Math.round(dev.camRX), camRY: Math.round(dev.camRY) };
    out.cam = { x: Math.round(cam.x), y: Math.round(cam.y), z: +z.toFixed(3) };
    out.worldWin = { x: Math.round(g.player.cx), y: Math.round(g.player.cy) };
    window.__xfDump = { ...out, dev: out.dev, xf: out.xf };
    return orig.call(this, ctx, world, entities, cam, viewW, viewH, z, dev);
  };
  g.player.x = 3242 * 16 - 64;
  g.player.y = 348 * 16 - 40;
});
await new Promise((r) => setTimeout(r, 1200));
console.log('调用点态:', JSON.stringify(await page.evaluate(() => ({
  xfLast: window.__xfDump ?? null,
}))));
await browser.close();
