// 判决实验:overlay 同帧读 transform + 世界坐标红块;截图判空间与遮挡。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const SAVE = needInput(join(DOWNLOADS, 'map-Starter_World (27).json'));
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
await page.evaluate(() => {
  const g = window.__swGame;
  const proto = Object.getPrototypeOf(g.renderer);
  const orig = proto.drawDummyTileAnim;
  proto.drawDummyTileAnim = function (ctx, world, entities, cam, viewW, viewH, z, dev) {
    orig.call(this, ctx, world, entities, cam, viewW, viewH, z, dev);
    const t = ctx.getTransform();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);   // 设备空间
    const dx = (3242 * 16 - dev.camRX) * dev.zz + dev.ox;
    const dy2 = (348 * 16 - dev.camRY) * dev.zz + dev.oy;
    ctx.fillStyle = 'rgba(255,0,0,0.55)';
    ctx.fillRect(dx, dy2, 32 * dev.zz, 48 * dev.zz);
    ctx.restore();
    if (!window.__xfLog) window.__xfLog = { a: t.a, e: Math.round(t.e) };
  };
  g.player.x = 3242 * 16 - 48;
  g.player.y = 348 * 16 - 40;
});
await new Promise((r) => setTimeout(r, 1500));
const xf = await page.evaluate(() => window.__xfLog);
console.log('overlay 内 transform:', JSON.stringify(xf));
await page.screenshot({ path: join(HOME, '.claude/jobs/4a66e745/tmp/dummy-redbox.png') });
await browser.close();
