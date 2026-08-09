// M2 验收：主菜单 → 单人 → 角色列表 → 创建角色 → 回列表 → 双击进游戏
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
await click(ui.w / 2, 258);
await waitState('UICharacterSelectState');
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: 'shots/m2-2-charselect.png' });

// 新建 → 创建页（选择面板按钮：y=70+14+360+19, 新建 x=200+14+16+44）
const SEL = { x: 200, y: 70, pad: 14 };
await click(SEL.x + SEL.pad + 16 + 44, SEL.y + SEL.pad + 360 + 19);
await waitState('UICharacterCreationState');
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: 'shots/m2-3-creation.png' });

// 名字框（创建面板：[200,80]，内容区 top=80 left=180，名字框 top=0 高38）
const CR = { x: 200, y: 80, pad: 14 };
await click(CR.x + CR.pad + 180 + 160, CR.y + CR.pad + 80 + 19);
await page.keyboard.type('测试勇者');
await new Promise((r) => setTimeout(r, 200));
console.log('nameBox after type:', await page.evaluate(() => {
  const st = window.__swVUI.ui.current;
  const find = (el, pred) => { if (pred(el)) return el; for (const c of el.children) { const r = find(c, pred); if (r) return r; } return null; };
  const box = find(st, (el) => el.constructor.name === 'UITextBox');
  return box ? box.text : null;
}));

// 切发型页签（top=4, left=180+2*90）
await click(CR.x + CR.pad + 180 + 2 * 90 + 22, CR.y + CR.pad + 4 + 19);
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: 'shots/m2-3b-hair.png' });

// 回信息页签 → 创建（top=396 left=410 宽46）
await click(CR.x + CR.pad + 180 + 0 * 90 + 22, CR.y + CR.pad + 4 + 19);
await new Promise((r) => setTimeout(r, 300));
console.log('nameBox before create:', await page.evaluate(() => {
  const st = window.__swVUI.ui.current;
  const find = (el, pred) => { if (pred(el)) return el; for (const c of el.children) { const r = find(c, pred); if (r) return r; } return null; };
  const box = find(st, (el) => el.constructor.name === 'UITextBox');
  return box ? box.text : null;
}));
await click(CR.x + CR.pad + 410 + 23, CR.y + CR.pad + 396 + 19);
await waitState('UICharacterSelectState');
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: 'shots/m2-4-charselect-after.png' });

// 双击第一个角色条目（列表首项）
const firstItemY = await page.evaluate(() => {
  // 从布局树找 UICharacterListItem
  const st = window.__swVUI.ui.current;
  const find = (el) => {
    for (const c of el.children) {
      if (c.constructor.name === 'UICharacterListItem') return c;
      const r = find(c);
      if (r) return r;
    }
    return null;
  };
  const it = find(st);
  if (!it) return null;
  const d = it.getDimensions();
  return { x: d.x + d.width / 2, y: d.y + d.height / 2 };
});
if (!firstItemY) throw new Error('列表中没有角色');
await click(firstItemY.x, firstItemY.y);
await new Promise((r) => setTimeout(r, 150));
await click(firstItemY.x, firstItemY.y);
await page.waitForFunction(() => window.__swGame && window.__swGame.player, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: 'shots/m2-5-ingame.png' });

const finalState = await page.evaluate(() => ({
  state: window.__swVUI.ui.current ? window.__swVUI.ui.current.constructor.name : null,
  inGame: !!window.__swGame,
  charName: window.__swGame?.player?.appearance?.name ?? null,
}));
console.log('final:', JSON.stringify(finalState));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length || !finalState.inGame || finalState.charName !== '测试勇者') {
  console.error('CHAR SMOKE FAILED');
  process.exit(1);
}
console.log('CHAR SMOKE OK');
