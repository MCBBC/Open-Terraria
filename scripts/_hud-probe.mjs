import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
const navs = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url().slice(0, 80)); });
await page.goto('http://localhost:5199/?play=small&hud=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
const waitGame = () => page.evaluate(() => !!(window.__swGame && window.__swGame.player && window.__swGame.renderer)).catch(() => false);
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await waitGame();
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
console.log('inGame:', inGame, 'navs:', navs, 'errors:', errors.slice(0, 3));
if (!inGame) process.exit(1);
await new Promise((r) => setTimeout(r, 2500));
await page.mouse.move(640, 400);
await new Promise((r) => setTimeout(r, 600));
mkdirSync('shots', { recursive: true });
await page.screenshot({ path: 'shots/hud-default.png' });
const stats = await page.evaluate(() => {
  const g = window.__swGame;
  if (!g) return { gone: true };
  g.player.baseMaxHp = 420;
  g.player.hp = 420;
  g.player.baseMaxMana = 200;
  g.player.mana = 120;
  return { hp: g.player.hp, maxHp: g.player.maxHp, mana: g.player.mana, maxMana: g.player.maxMana };
});
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: 'shots/hud-expanded.png' });
const probe = await page.evaluate(() => {
  const c = document.getElementById('ui-canvas');
  const ctx = c.getContext('2d');
  const ci = ctx.getImageData(625, 385, 40, 40).data;
  let cursorPx = 0;
  for (let i = 3; i < ci.length; i += 4) if (ci[i] > 8) cursorPx++;
  return {
    cursorPx,
    gameRootCursor: getComputedStyle(document.getElementById('game-root')).cursor,
  };
});
console.log(JSON.stringify({ stats, probe, navs, errors: errors.slice(0, 5) }, null, 2));
await browser.close();
