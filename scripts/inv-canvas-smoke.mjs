// M5 验收：进游戏 → Canvas 快捷栏 → E 开背包 → 左键拾取/放下 → 右键拆半 → 合成 → 关包
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
mkdirSync('shots', { recursive: true });

// 垫片进小世界
await page.evaluate(() => { const s = document.querySelector('select'); if (s) s.selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2500));
const boot = await page.evaluate(() => ({
  hotbarState: window.__swVUI.ui.current?.constructor?.name,
  invHas: window.__swGame.player.inv.slots.filter(Boolean).length,
  domHotbar: !!document.querySelector('.sw-slot'),
}));
console.log('boot:', JSON.stringify(boot));
await page.screenshot({ path: 'shots/m5-1-ingame-hotbar.png' });

// E 开背包
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__swVUI.ui.current?.constructor?.name === 'UIInventoryState', { timeout: 5000 });
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: 'shots/m5-2-inventory.png' });

const slotCenter = (i) => {
  const col = i % 10, row = Math.floor(i / 10);
  return { x: 20 + col * 56 * 0.85 + 20, y: 20 + row * 56 * 0.85 + 20 };
};

// 左键：从第一个有物的背包格（>=10）拾取 → 放到格 39
const before = await page.evaluate(() => {
  const inv = window.__swGame.player.inv;
  for (let i = 10; i < 40; i++) if (inv.slots[i]) return { i, id: inv.slots[i].id, stack: inv.slots[i].stack };
  return null;
});
console.log('pickup source:', JSON.stringify(before));

if (before) {
  const src = slotCenter(before.i);
  await click(src.x, src.y);
  await new Promise((r) => setTimeout(r, 250));
  const held = await page.evaluate(() => {
    const st = window.__swVUI.ui.current;
    return st && st.heldStack ? { id: st.heldStack.id, stack: st.heldStack.stack } : null;
  });
  console.log('after pickup held:', JSON.stringify(held),
    'src empty:', await page.evaluate((i) => !window.__swGame.player.inv.slots[i], before.i));
  const dst = slotCenter(39);
  await click(dst.x, dst.y);
  await new Promise((r) => setTimeout(r, 250));
  const moved = await page.evaluate((i) => {
    const inv = window.__swGame.player.inv;
    return { fromEmpty: !inv.slots[i], toStack: inv.slots[39]?.stack ?? 0 };
  }, before.i);
  console.log('after place:', JSON.stringify(moved));
}

// 右键拆半：格 0
const hb = await page.evaluate(() => window.__swGame.player.inv.slots[0]);
if (hb && hb.stack > 1) {
  const p0 = slotCenter(0);
  await page.mouse.click(Math.round(p0.x * ui), Math.round(p0.y * ui), { button: 'right' });
  await new Promise((r) => setTimeout(r, 250));
  const split = await page.evaluate(() => {
    const inv = window.__swGame.player.inv;
    const st = window.__swVUI.ui.current;
    return { slot0: inv.slots[0]?.stack ?? 0, held: st?.heldStack?.stack ?? 0 };
  });
  console.log('split half:', JSON.stringify(split));
  // 把持有物放回格 0
  await click(p0.x, p0.y);
  await new Promise((r) => setTimeout(r, 200));
}

// 合成列表：悬停 + 点击第一项
await page.mouse.move(Math.round(60 * ui), Math.round(420 * ui));
await new Promise((r) => setTimeout(r, 300));
const recipes = await page.evaluate(() => window.__swVUI.ui.current?.availableRecipes?.length ?? -1);
console.log('available recipes:', recipes);
if (recipes > 0) {
  await click(60, 420);
  await new Promise((r) => setTimeout(r, 300));
}
await page.screenshot({ path: 'shots/m5-3-crafting.png' });

// Esc 关包 → HotbarState
await page.keyboard.press('Escape');
await page.waitForFunction(() => window.__swVUI.ui.current?.constructor?.name === 'HotbarState', { timeout: 5000 });
console.log('closed → HotbarState ✓');

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
const ok = errors.length === 0 && boot.hotbarState === 'HotbarState' && !boot.domHotbar;
if (!ok) { console.error('INV CANVAS SMOKE FAILED'); process.exit(1); }
console.log('INV CANVAS SMOKE OK');
