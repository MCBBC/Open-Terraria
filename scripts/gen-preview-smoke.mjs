// M4 验收：世界创建 → 生成页（双进度条/阶段文案）+ 实时地图预览增量刷新 → 进游戏
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

const ui = await page.evaluate(() => window.innerWidth / window.__swVUI.ui.getDimensions().width);
const click = async (x, y) => page.mouse.click(Math.round(x * ui), Math.round(y * ui));
const waitState = (name, ms = 10000) => page.waitForFunction(
  (n) => window.__swVUI.ui.current?.constructor?.name === n, { timeout: ms }, name);

mkdirSync('shots', { recursive: true });

// 直接用垫片建小世界 —— 但垫片走 DOM 进度路径。改走 UI：标题→单人→选第一个角色→新建世界→小→创建
// 为省时间：若无角色先创建一个默认角色
await click(480, 258);
await waitState('UICharacterSelectState');
await new Promise((r) => setTimeout(r, 800));
let hasChar = await page.evaluate(() => {
  const st = window.__swVUI.ui.current;
  const find = (el, name) => { for (const c of el.children) { if (c.constructor.name === name) return true; const r = find(c, name); if (r) return r; } return false; };
  return find(st, 'UICharacterListItem');
});
if (!hasChar) {
  await click(200 + 14 + 60, 70 + 14 + 379);
  await waitState('UICharacterCreationState');
  await new Promise((r) => setTimeout(r, 500));
  await click(647, 499); // 直接创建（随机名）
  await waitState('UICharacterSelectState');
  await new Promise((r) => setTimeout(r, 800));
}
const charItem = await page.evaluate(() => {
  const st = window.__swVUI.ui.current;
  const find = (el, name) => { for (const c of el.children) { if (c.constructor.name === name) return c; const r = find(c, name); if (r) return r; } return null; };
  const d = find(st, 'UICharacterListItem').getDimensions();
  return { x: d.x + d.width / 2, y: d.y + d.height / 2 };
});
await click(charItem.x, charItem.y);
await new Promise((r) => setTimeout(r, 150));
await click(charItem.x, charItem.y);
await waitState('UIWorldSelectState');
await new Promise((r) => setTimeout(r, 800));

// 新建世界 → 创建页 → 小 → 创建
await click(200 + 14 + 60, 70 + 14 + 379);
await waitState('UIWorldCreationState');
await new Promise((r) => setTimeout(r, 600));
await click(200 + 14 + 48, 70 + 14 + 119);
await new Promise((r) => setTimeout(r, 300));
await click(200 + 14 + 433, 70 + 14 + 415);

// 生成页出现
await waitState('UIWorldLoadState');
await page.waitForFunction(() => window.__swVUI.ui.current && window.__swVUI.ui.current.hasPreview === true, { timeout: 30000 });
// 立即采样（小世界生成快，state 可能随时被清空进游戏）
const sample = () => page.evaluate(() => {
  const st = window.__swVUI.ui.current;
  if (!st) return null;
  return { pct: st.pct, header: st.header.text, hasPreview: st.hasPreview };
});
await page.screenshot({ path: 'shots/m4-1-gen-early.png' });
const early = await sample();
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: 'shots/m4-2-gen-mid.png' });
const mid = await sample();

await page.waitForFunction(() => window.__swGame && window.__swGame.player, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: 'shots/m4-3-ingame.png' });

const final = await page.evaluate(() => ({
  inGame: !!window.__swGame,
  worldSize: window.__swGame ? [window.__swGame.world.w, window.__swGame.world.h] : null,
}));
console.log('early:', JSON.stringify(early));
console.log('mid:  ', JSON.stringify(mid));
console.log('final:', JSON.stringify(final));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
// hasPreview 已由 waitForFunction 断言；这里只看最终进游戏 + 无错误
const ok = errors.length === 0 && final.inGame;
if (!ok) {
  console.error('GEN PREVIEW SMOKE FAILED');
  process.exit(1);
}
console.log('GEN PREVIEW SMOKE OK');
