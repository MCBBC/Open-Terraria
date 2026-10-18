import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
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
const r = await page.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const proto = Object.getPrototypeOf(g.renderer);
  const orig = proto.drawDummyTileAnim;
  const stat = { calls: 0, anchorMatch: 0, drawRects: 0, dummyId: TILE_BY_KEY['v_378_target_dummy'], camTile: null, worldMatchesView: 0 };
  proto.drawDummyTileAnim = function (ctx, world, entities, cam, viewW, viewH, z, dev) {
    stat.calls++;
    const st = world.store;
    const DUMMY = TILE_BY_KEY['v_378_target_dummy'];
    const i = st.idx(3242, 348);
    if (st.type[i] === DUMMY && st.frameX[i] % 36 === 0 && st.frameY[i] === 0) stat.anchorMatch++;
    const tx0 = Math.max(0, Math.floor((cam.x - viewW / 2 / z) / 16) - 1);
    const ty0 = Math.max(0, Math.floor((cam.y - viewH / 2 / z) / 16) - 1);
    stat.camTile = [Math.round(cam.x / 16), Math.round(cam.y / 16)];
    // 数视口内匹配格
    for (let ty = ty0; ty < ty0 + 60 && ty < st.h; ty++) {
      for (let tx = tx0; tx < tx0 + 80 && tx < st.w; tx++) {
        const ii = st.idx(tx, ty);
        if (st.type[ii] === DUMMY && st.frameX[ii] % 36 === 0 && st.frameY[ii] === 0) stat.worldMatchesView++;
      }
    }
    return orig.call(this, ctx, world, entities, cam, viewW, viewH, z, dev);
  };
  g.camera.x = 3242 * 16 + 16; g.camera.y = 348 * 16 + 24;
  await new Promise((r2) => setTimeout(r2, 1500));
  return stat;
});
console.log('猴补丁统计:', JSON.stringify(r));
await browser.close();
