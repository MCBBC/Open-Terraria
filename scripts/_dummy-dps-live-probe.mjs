// DPS 计接线终验:给玩家挂 DPS 计量器态,打假人,读 getDPS 演进。
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
const text = readFileSync(SAVE, 'utf8');
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, text);
await new Promise((r) => setTimeout(r, 2000));
const r = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  // 开 DPS 计门禁（accDreamCatcher 语义位）
  p.equipStats.infoAccs.accDreamCatcher = true;
  g.player.x = 3242 * 16 - 48; g.player.y = 348 * 16 - 40;
  const d = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 488);
  // 模拟玩家刀击:直接走 hurt 公共管线（fromPlayer=true）×10
  for (let k = 0; k < 10; k++) { d.iframes = 0; d.hurt(100, 1, 0, g, 0, false, 0, true); }
  const dps1 = p.getDPS();
  return { dps10x100: dps1, hp: d.hp, maxHp: d.maxHp };
});
console.log('DPS 终验:', JSON.stringify(r), '→', r.dps10x100 > 0 ? 'PASS(秒伤已计数)' : 'FAIL');
await browser.close();
