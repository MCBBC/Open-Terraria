// 假人燃烧终验:烧 3s 截图(应有火焰粒+橙字飘值,无血条),并采样 hp/hpBarT/dead。
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
  g.player.x = 3242 * 16 - 64;
  g.player.y = 348 * 16 - 40;
  const d = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 488);
  d.onFireT = 600;                                  // 燃烧 10s
});
await new Promise((r) => setTimeout(r, 3000));
const st = await page.evaluate(() => {
  const g = window.__swGame;
  const d = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 488);
  return d ? { hp: d.hp, maxHp: d.maxHp, hpBarT: d.hpBarT, immortal: d.immortal, onFireT: Math.round(d.onFireT), dead: d.dead } : null;
});
console.log('燃烧 3s 态:', JSON.stringify(st));
await page.screenshot({ path: join(HOME, '.claude/jobs/4a66e745/tmp/dummy-burn.png') });
await browser.close();
