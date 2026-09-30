// ★BJ419 探针：热键栏顶部单行名（.sw-hotbar-name）+ 热键栏悬停气泡头行——
// 带前缀物品 = ‹前缀›名（CombineFormat.Prefix zh 官方格式）;无前缀/空手不变。
// 运行：SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj419-hotbar-title.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let hotbar = false;
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  hotbar = await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false);
  if (hotbar) break;
}
await new Promise((r) => setTimeout(r, 1500));
if (!hotbar) { console.log(JSON.stringify({ fail: 'hotbar 未出现' })); await browser.close(); process.exit(1); }

const grant = async (vid, prefix) => page.evaluate(async (vid, prefix) => {
  const g = window.__swGame;
  g.setupDevMode();
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const inv = g.player.inv;
  const id = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];
  inv.slots[0] = prefix ? { id, stack: 1, prefix } : { id, stack: 1 };
  inv.selected = 0;
  inv.cursorMirror = null;
  window.__swUI.refreshHotbar();   // 实机刷新链（rAF 合并面跳过,直调同 bj157 直调 openInventory 习语）
  return document.querySelector('.sw-hotbar-name')?.textContent ?? null;
}, vid, prefix);

const out = {};
out.sword_legendary = await grant(4, 81);      // 铁阔剑+传奇 → 期望 ‹传奇›铁阔剑
out.necklace_violent = await grant(3212, 80);  // 鲨牙项链+暴力 → 期望 ‹暴力›鲨牙项链
out.sword_bare = await grant(4, 0);            // 无前缀 → 期望 铁阔剑
out.empty_hand = await page.evaluate(() => {
  const inv = window.__swGame.player.inv;
  inv.slots[0] = null;
  window.__swUI.refreshHotbar();
  return document.querySelector('.sw-hotbar-name')?.textContent ?? null;
});

// 热键栏悬停气泡头行（关包态,真鼠标悬停槽 0）
await grant(4, 81);
await page.evaluate(() => {
  document.querySelector('#sw-welcome-announce')?.remove();   // 欢迎公告遮罩(z=60 全页拦截)摘除（bj157 同法）
});
const slot = await page.$('.sw-hotbar .sw-slot[data-where="inv"][data-idx="0"], .sw-hotbar [data-where="inv"]');
if (slot) {
  const box = await slot.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await new Promise((r) => setTimeout(r, 500));
  out.hover_tooltip_head = await page.evaluate(() => {
    const t = document.querySelector('.sw-tooltip');
    if (!t || t.style.display === 'none') return null;
    return (t.textContent ?? '').split('\n')[0].slice(0, 30);
  });
} else out.hover_tooltip_head = 'slot el 未找到';
out.pageerrors = errs;

console.log(JSON.stringify(out, null, 2));
await page.screenshot({ path: '/tmp/bj419-hotbar-title.png' });
await browser.close();
