import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swVUI?.ui?.current?.constructor?.name === 'TitleState', { timeout: 120000 });
const ui = await page.evaluate(() => window.innerWidth / window.__swVUI.ui.getDimensions().width);
const click = async (x, y) => page.mouse.click(Math.round(x * ui), Math.round(y * ui));
await click(960 / 2, 258);
await page.waitForFunction(() => window.__swVUI.ui.current?.constructor?.name === 'UICharacterSelectState', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 800));
await click(200 + 14 + 60, 70 + 14 + 379);
await page.waitForFunction(() => window.__swVUI.ui.current?.constructor?.name === 'UICharacterCreationState', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
await click(200 + 14 + 180 + 160, 80 + 14 + 80 + 19);
await new Promise((r) => setTimeout(r, 200));
await page.keyboard.type('测试勇者');
await new Promise((r) => setTimeout(r, 300));
// 找名字框并打印当前文本 + input 值
const probe = await page.evaluate(() => {
  const st = window.__swVUI.ui.current;
  const find = (el, pred) => {
    if (pred(el)) return el;
    for (const c of el.children) { const r = find(c, pred); if (r) return r; }
    return null;
  };
  const box = find(st, (el) => el.constructor.name === 'UITextBox');
  return { boxText: box ? box.text : null, inputVal: document.activeElement?.value ?? null };
});
console.log('probe:', JSON.stringify(probe));
// 点创建 → 回列表 → dump 存储
await click(200 + 14 + 410 + 23, 80 + 14 + 396 + 19);
await page.waitForFunction(() => window.__swVUI.ui.current?.constructor?.name === 'UICharacterSelectState', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 1000));
const stored = await page.evaluate(() => ({
  idx: localStorage.getItem('sandboxworld.players.index'),
  // IndexedDB 可能存了记录，扫 localStorage 所有 player key
  playerKeys: Object.keys(localStorage).filter((k) => k.startsWith('sandboxworld.player')),
}));
console.log('stored:', JSON.stringify(stored));
await browser.close();
