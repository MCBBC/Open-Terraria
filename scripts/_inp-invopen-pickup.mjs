// ②追加取证:背包开着点快捷栏/背包格拾取是否一次生效(M9 案 picked=false 复核)
// 运行:SW_ORIGIN=http://localhost:5225 node tools/run-diag.mjs scripts/_inp-invopen-pickup.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5225';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await sleep(800);
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
await sleep(150);

console.log(await page.evaluate(() => ({
  layout: window.__swUI._builtLayout ?? 'unknown',
  invOpen: window.__swUI.inventoryOpen,
})));

await page.evaluate(() => window.__swUI.openInventory());
await sleep(400);
const els = await page.evaluate(() => {
  const out = [];
  for (const sel of ['.sw-hotbar .sw-slot[data-idx="1"]', '.sw-invgrid .sw-slot[data-idx="1"]', '[data-idx="1"][data-where="inv"]']) {
    const e = document.querySelector(sel);
    if (!e) { out.push({ sel, missing: true }); continue; }
    const r = e.getBoundingClientRect();
    const st = getComputedStyle(e);
    out.push({ sel, x: r.x, y: r.y, w: r.width, h: r.height, display: st.display, topEl: (() => { const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return t ? t.className.toString().slice(0, 60) + (t.dataset?.idx !== undefined ? `[idx=${t.dataset.idx}]` : '') : 'null'; })() });
  }
  return out;
});
console.log('槽位几何/顶层元素:', JSON.stringify(els, null, 1));

for (const sel of ['.sw-hotbar .sw-slot[data-idx="1"]', '.sw-invgrid .sw-slot[data-idx="1"]']) {
  const pos = await page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    if (r.width === 0) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sel);
  if (!pos) { console.log(`${sel}: 不可点(0尺寸/缺)`); continue; }
  await page.mouse.click(pos.x, pos.y);
  await sleep(250);
  const st = await page.evaluate(() => ({ held: window.__swUI.heldStack ? { id: window.__swUI.heldStack.id, stack: window.__swUI.heldStack.stack } : null }));
  console.log(`${sel} 点击后 heldStack=`, JSON.stringify(st));
  // 放回(再点同格)防污染下一轮
  const pos2 = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; }, sel);
  if (pos2) { await page.mouse.click(pos2.x, pos2.y); await sleep(200); }
}
await browser.close();
process.exit(0);
