// 终验:全量池+开发者授予——搜「神圣种子」应命中 vi_369 且点击即入热栏
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

const openDup = async () => await page.evaluate(async () => {
  const JP = await import('/src/ui/JourneyPowersUI.ts');
  JP.openJourneyPowersPanel(window.__swGame);
  await new Promise((r) => setTimeout(r, 500));
  const dup = [...document.querySelectorAll('.sw-jp-strip [class*=btn], .sw-jp-strip button, .sw-jp-strip [class*=row]')]
    .find((b) => b.textContent?.includes('复制'));
  if (dup) { dup.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); dup.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); }
  await new Promise((r) => setTimeout(r, 600));
});
const search = async (q) => await page.evaluate(async (q) => {
  const input = document.querySelector('.sw-jp-search input');
  input.value = q;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 700));
  const cells = [...document.querySelectorAll('.sw-jp-cell')];
  return { q, note: document.querySelector('.sw-jp-note')?.textContent ?? null,
    cells: cells.slice(0, 8).map((c) => ({ title: c.title, partial: c.className.includes('partial') })) };
}, q);
await openDup();
const r1 = await search('神圣种子');

console.log(JSON.stringify({ r1 }, null, 2));

// 点击第一个神圣种子格 → 背包热栏应出现真种子
const grant = await page.evaluate(async () => {
  const cell = [...document.querySelectorAll('.sw-jp-cell')][0];
  cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 300));
  const g = window.__swGame;
  const DEFS = await import('/src/data/items.ts');
  return {
    hotbar: g.player.inv.slots.slice(0, 10).map((s) => (s ? DEFS.ITEM_DEFS[s.id]?.key ?? `?${s.id}` : null)),
    selected: g.player.inv.selected,
  };
});
console.log('GRANT:', JSON.stringify(grant, null, 2));
if (errs.length) console.log('PAGEERRORS:', JSON.stringify(errs.slice(0, 4)));
await browser.close();
