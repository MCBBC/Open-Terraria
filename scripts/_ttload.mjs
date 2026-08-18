// 绕 worldgen 挂起：新世界走 worker 路径会挂（并行会话在改 worldgen）——
// 直接构造最小 world json 载入
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 180000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 160)); });
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 20000 });
// 先查 newWorld 是否真的挂（60s 上限）
const t0 = Date.now();
const ok = await page.evaluate(() => Promise.race([
  window.__swFlow.newWorld('', 1200, 400).then(() => 'ok'),
  new Promise((r) => setTimeout(() => 'timeout', 50000)),
]));
console.log('newWorld:', ok, Date.now() - t0, 'ms');
if (ok !== 'ok') { await browser.close(); process.exit(1); }
await page.waitForFunction(() => !!window.__swGame, { timeout: 60000 });
const r = await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI;
  const items = await import('/src/data/items.ts');
  const id = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[4]];
  g.player.inv.slots[0] = { id, stack: 1 };
  g.player.inv.selected = 0;
  ui['showTooltipFor'](0, 'inv');
  await new Promise((r2) => setTimeout(r2, 600));
  return { filter: ui.tooltip.style.filter, txt: ui.tooltip.innerText.slice(0, 30) };
});
console.log(JSON.stringify(r));
const el = await page.$('.sw-tooltip');
await el.screenshot({ path: '/tmp/tt-el.png' }).catch((e) => console.log('shot fail', String(e).slice(0, 80)));
console.log('done');
await browser.close();
