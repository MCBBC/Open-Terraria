// 终验(用户真实面板):背包道具搜索器 搜「神圣种子」→ 条目出现 → 点击 → 热栏落 vi_369
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
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const UI = g.ui ?? (window.__swUI ?? null);
  // 找 UI 实例:Game 挂的 ui 字段名探测
  const ui = g.ui || g._ui || (window.__swUI);
  const out = { hasUI: !!ui };
  if (!ui) return out;
  try { localStorage.setItem('sbw.itemSearchConfirmed', '1'); } catch {}
  ui.openItemSearch();
  await new Promise((r) => setTimeout(r, 400));
  const input = [...document.querySelectorAll('input')].find((i) => i.placeholder?.includes('原版 id'));
  if (!input) return { ...out, err: 'no input' };
  input.value = '神圣种子';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  const rows = [...document.querySelectorAll('div[title]')].filter((d) => d.style.cssText.includes('170px'));
  out.rows = rows.map((r) => r.title);
  // 点击第一行 → 背包
  if (rows[0]) { rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 300)); }
  const DEFS = await import('/src/data/items.ts');
  out.hotbar = g.player.inv.slots.slice(0, 10).map((s) => (s ? DEFS.ITEM_DEFS[s.id]?.key ?? `?${s.id}` : null));
  return out;
});
console.log(JSON.stringify(res, null, 2));
if (errs.length) console.log('PAGEERRORS:', errs.slice(0, 3));
await browser.close();
