// M1 验收：VUI 主菜单 → 兼容垫片建世界 → 进游戏 端到端
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || '' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
// 全量素材加载较慢（6000+ PNG），给足等待
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
mkdirSync('shots', { recursive: true });
await page.screenshot({ path: 'shots/m1-title.png' });

// 兼容垫片：旧脚本模式（select + button）建小世界
await page.evaluate(() => {
  const sel = document.querySelector('select');
  if (sel) sel.selectedIndex = 0; // 小世界
});
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: 'shots/m1-ingame.png' });

const state = await page.evaluate(() => ({
  world: window.__swGame ? [window.__swGame.world.w, window.__swGame.world.h] : null,
  flow: typeof window.__swFlow,
}));
console.log('state:', JSON.stringify(state), 'errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length || !state.world || state.flow !== 'object') {
  console.error('TITLE SMOKE FAILED');
  process.exit(1);
}
console.log('TITLE SMOKE OK');
