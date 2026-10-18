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
    const st = world.store;
    const DUMMY = 238;
    for (let ty = 340; ty < 360; ty++) {
      for (let tx = 3230; tx < 3260; tx++) {
        const i = st.idx(tx, ty);
        if (st.type[i] === DUMMY && st.frameX[i] % 36 === 0 && st.frameY[i] === 0) {
          const wx = tx * 16, wy = ty * 16;
          const dxa = dev.ox + (wx - dev.camRX) * dev.zz;
          const yda = dev.oy + (wy - dev.camRY) * dev.zz;
          ctx.strokeStyle = '#FF2020';
          ctx.lineWidth = 3;
          ctx.strokeRect(dxa, yda, 32 * dev.zz, 48 * dev.zz);
          ctx.font = '16px monospace';
          ctx.fillStyle = '#FF2020';
          ctx.fillText(`zz=${dev.zz.toFixed(2)} cam=${Math.round(dev.camRX)},${Math.round(dev.camRY)} ox=${dev.ox},oy=${dev.oy}`, dxa - 40, yda - 10);
          return;   // 只标第一个
        }
      }
    }
  };
  g.player.x = 3242 * 16 - 64;
  g.player.y = 348 * 16 - 40;
});
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: join(HOME, '.claude/jobs/4a66e745/tmp/dummy-marker.png') });
console.log('marker screenshot saved');
await browser.close();
