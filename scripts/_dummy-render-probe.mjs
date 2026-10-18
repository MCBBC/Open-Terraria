// 假人(378/488)渲染复现:载入用户存档 → 定位 (3242,348) → 查 tile/NPC/锚/覆盖层输入。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const SAVE = needInput(join(DOWNLOADS, 'map-Starter_World (27).json'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&beh=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
  }
});
const text = readFileSync(SAVE, 'utf8');
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, text);
await new Promise((r) => setTimeout(r, 3000));
const st = await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world;
  const TX = 3242, TY = 348;
  const i = w.store.idx(TX, TY);
  const def = g.tileByKey ? null : null;
  // 找 378 的 internal id:TILE_DEFS 反查 key
  const tilesModKeys = [];
  const dummy488 = g.entities.enemies.filter((e) => !e.dead && e.vanillaId === 488)
    .map((e) => ({ anchor: e.dummyAnchor, x: Math.round(e.cx), y: Math.round(e.cy), shake: e.dummyShake }));
  // 玩家传送到假人旁
  g.player.x = TX * 16 - 40; g.player.y = TY * 16 - 20;
  return {
    tileType: w.store.type[i], frameX: w.store.frameX[i], frameY: w.store.frameY[i],
    tileKeyOf378: (window.__TILE_KEY_378 ?? null),
    dummy488count: g.entities.enemies.filter((e) => e.vanillaId === 488).length,
    dummy488: dummy488.slice(0, 3),
  };
});
console.log('载入态:', JSON.stringify(st));
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: join(HOME, '.claude/jobs/4a66e745/tmp/dummy-after.png') });
const st2 = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    dummy488: g.entities.enemies.filter((e) => !e.dead && e.vanillaId === 488)
      .map((e) => ({ anchor: e.dummyAnchor, shake: e.dummyShake })).slice(0, 5),
  };
});
console.log('传送后:', JSON.stringify(st2));
console.log('errors:', JSON.stringify(errors.slice(0, 5)));
await browser.close();
