// M2+M3 验收：主菜单 → 单人 → 创建角色 → 世界列表 → 创建世界 → 进游戏
// 坐标以 dump 实测为准：选择面板 [200,70 560x460]、创建面板 [200,80 560x440]（padding 14）
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || 'http://localhost:5199';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swVUI?.ui?.current?.constructor?.name === 'TitleState', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 500));

const ui = await page.evaluate(() => {
  const d = window.__swVUI.ui.getDimensions();
  return { w: d.width, h: d.height, scale: window.innerWidth / d.width };
});
const click = async (x, y) => page.mouse.click(Math.round(x * ui.scale), Math.round(y * ui.scale));
const waitState = (name, ms = 10000) => page.waitForFunction(
  (n) => window.__swVUI.ui.current?.constructor?.name === n, { timeout: ms }, name);

mkdirSync('shots', { recursive: true });
await page.screenshot({ path: 'shots/m2-1-title.png' });

// 标题 → 角色列表
await click(ui.w / 2, 228);
await waitState('UICharacterSelectState');
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: 'shots/m2-2-charselect.png' });

// 新建角色 → DOM 版创建页
const SEL = { x: 200, y: 70, pad: 14 };
await click(SEL.x + SEL.pad + 60, SEL.y + SEL.pad + 379);
await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: 'shots/m2-3-creation.png' });

// 名字（原生 input）
await page.click('.sw-char-row input[type=text]');
await page.keyboard.type('测试勇者');
await new Promise((r) => setTimeout(r, 200));

// 外观页：点第 3 个衣服样式
await page.click('[data-tab=look]');
await new Promise((r) => setTimeout(r, 300));
const styleBtns = await page.$$('.sw-char-stylebtn');
if (styleBtns[2]) await styleBtns[2].click();
await new Promise((r) => setTimeout(r, 300));

// 发型页：点第 5 个发型
await page.click('[data-tab=hair]');
await new Promise((r) => setTimeout(r, 400));
const hairBtns = await page.$$('.sw-char-hairbtn');
if (hairBtns[4]) await hairBtns[4].click();
await new Promise((r) => setTimeout(r, 300));

// 颜色页：改发色
await page.click('[data-tab=color]');
await new Promise((r) => setTimeout(r, 300));
const colorInput = await page.$('.sw-char-row input[type=color]');
if (colorInput) {
  await colorInput.evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, '#ff5500');
}
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: 'shots/m2-3c-color.png' });

// 创建
await page.click('[data-act=create]');
await waitState('UICharacterSelectState');
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: 'shots/m2-4-charselect-after.png' });

// 双击角色 → 世界列表
const charItem = await page.evaluate(() => {
  const st = window.__swVUI.ui.current;
  const find = (el, name) => { for (const c of el.children) { if (c.constructor.name === name) return c; const r = find(c, name); if (r) return r; } return null; };
  const it = find(st, 'UICharacterListItem');
  const d = it.getDimensions();
  return { x: d.x + d.width / 2, y: d.y + d.height / 2 };
});
await click(charItem.x, charItem.y);
await new Promise((r) => setTimeout(r, 150));
await click(charItem.x, charItem.y);
await waitState('UIWorldSelectState');
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: 'shots/m3-1-worldselect.png' });

// 新建世界 → 世界创建页
await click(SEL.x + SEL.pad + 60, SEL.y + SEL.pad + 379);
await waitState('UIWorldCreationState');
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: 'shots/m3-2-worldcreation.png' });

// 选小世界（第一行 GroupOptionButton：top=100, left=0）
await click(SEL.x + SEL.pad + 48, SEL.y + SEL.pad + 100 + 19);
await new Promise((r) => setTimeout(r, 300));
// 提交创建
await click(SEL.x + SEL.pad + 410 + 23, SEL.y + SEL.pad + 396 + 19);

// 生成小世界 → 进游戏
await page.waitForFunction(() => window.__swGame && window.__swGame.player, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: 'shots/m3-3-ingame.png' });

const finalState = await page.evaluate(() => ({
  inGame: !!window.__swGame,
  charName: window.__swGame?.player?.appearance?.name ?? null,
  worldName: window.__swGame?.world?.name ?? null,
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
if (!ok) {
  console.error('CHAR+WORLD SMOKE FAILED');
  process.exit(1);
}
console.log('CHAR+WORLD SMOKE OK');
