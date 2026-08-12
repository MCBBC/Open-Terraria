// 全链路冒烟（DOM 版）：标题 → 角色列表 → 创建角色 → 世界列表 → 创建世界 → 生成页 → 进游戏
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || '' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 500));
mkdirSync('shots', { recursive: true });
await page.screenshot({ path: 'shots/m2-1-title.png' });

// 标题 → 角色列表（DOM）
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 }); console.log('S2 charlist');
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: 'shots/m2-2-charselect.png' });

// 若无角色：新建（DOM 创建页）
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 600));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('测试勇者');
  await new Promise((r) => setTimeout(r, 200));
  // 外观 → 第 3 个衣服样式
  await page.click('[data-tab=look]');
  await new Promise((r) => setTimeout(r, 300));
  const styles = await page.$$('.sw-char-stylebtn');
  if (styles[2]) await styles[2].click();
  // 发型 → 第 5 个
  await page.click('[data-tab=hair]');
  await new Promise((r) => setTimeout(r, 400));
  const hairs = await page.$$('.sw-char-hairbtn');
  if (hairs[4]) await hairs[4].click();
  // 颜色 → 发色
  await page.click('[data-tab=color]');
  await new Promise((r) => setTimeout(r, 300));
  const colorInput = await page.$('.sw-char-row input[type=color]');
  if (colorInput) await colorInput.evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, '#ff5500');
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: 'shots/m2-3-creation.png' });
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 800));
}
await page.screenshot({ path: 'shots/m2-4-charselect-after.png' });

// 点击第一个角色行 → 世界列表（DOM）
await page.click('.sw-item');
await page.waitForFunction(() => {
  const t = document.querySelector('.sw-list-title');
  return t && t.textContent === '选择世界';
}, { timeout: 10000 });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: 'shots/m3-1-worldselect.png' });

// 新建世界 → DOM 创建页
await page.click('.sw-list-footer [data-act=new]');
await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: 'shots/m3-2-worldcreation.png' });

// 选小世界（大小组第一个选项）→ 提交
await page.click('[data-g=size] .sw-wc-opt');
await new Promise((r) => setTimeout(r, 200));
await page.click('[data-act=create]');

// 生成页（VUI Canvas，唯一保留）→ 进游戏
await page.waitForFunction(() => window.__swVUI?.ui?.current?.constructor?.name === 'UIWorldLoadState', { timeout: 10000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.player, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: 'shots/m3-3-ingame.png' });

const finalState = await page.evaluate(() => ({
  inGame: !!window.__swGame,
  charName: window.__swGame?.player?.appearance?.name ?? null,
  worldSize: window.__swGame ? [window.__swGame.world.w, window.__swGame.world.h] : null,
  worldsIndex: localStorage.getItem('sandboxworld.worlds.index'),
}));
console.log('final:', JSON.stringify(finalState, null, 1));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
const ok = errors.length === 0 && finalState.inGame
  && finalState.charName === '测试勇者'
  && finalState.worldSize && finalState.worldSize[0] === 4200
  && !!finalState.worldsIndex;
if (!ok) { console.error('CHAR+WORLD SMOKE FAILED'); process.exit(1); }
console.log('CHAR+WORLD SMOKE OK');
