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
await new Promise((r) => setTimeout(r, 2500));
const r = await page.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const DUMMY = TILE_BY_KEY['v_378_target_dummy'];
  const st = g.world.store;
  const i = st.idx(3242, 348);
  const vf = g.renderer.atlas.vframeAt(378, 0, 0);
  const img = g.renderer.atlas.ensureVImage('vanilla/Tiles_378.png');
  // 相机对准锚点
  g.camera.x = 3242 * 16 + 16; g.camera.y = 348 * 16 + 24;
  return {
    DUMMY, tileType: st.type[i], match: st.type[i] === DUMMY,
    frameX: st.frameX[i], frameY: st.frameY[i],
    vframe: vf ? { sx: vf.sx, sy: vf.sy, sw: vf.sw, sh: vf.sh, imgW: vf.img.width } : null,
    imgOk: img ? `${img.width}x${img.height}` : null,
    drawYOff: g.renderer['DRAW_Y_OFFSET']?.[378] ?? 'n/a',
    dummyNpc: g.entities.enemies.filter((e) => !e.dead && e.vanillaId === 488).length,
  };
});
console.log('覆盖层输入:', JSON.stringify(r));
await new Promise((r2) => setTimeout(r2, 1200));
await page.screenshot({ path: '/Users/vinlic/.claude/jobs/4a66e745/tmp/dummy-anchor.png' });
await browser.close();
