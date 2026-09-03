// 一次性:列序 时装|装备|染料 + 追加格门控 + 行对齐 (2026-09-03)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => {
  [...document.body.children].filter((d) => d.tagName === 'DIV' && d.style?.position === 'fixed'
    && d.textContent?.includes('欢迎来到 SandboxWorld')).forEach((d) => d.remove());
  const g = window.__swGame, inv = g.player.inv;
  const it = (vid) => ({ id: g.itemId(vid), stack: 1 });
  inv.armor[8] = it('vi_492_DemonWings'); inv.dye[8] = it('vi_492_DemonWings');
  inv.armor[9] = it('vi_492_DemonWings'); inv.dye[9] = it('vi_492_DemonWings');
  inv.armor[18] = it('vi_492_DemonWings'); inv.armor[19] = it('vi_492_DemonWings');
  try { window.__swUI.openInventory(); } catch {}
});
await new Promise((r) => setTimeout(r, 400));
const out = await page.evaluate(() => {
  const dock = document.querySelector('.sw-eqdock');
  // 列标签 x 顺序
  const lblX = {};
  for (const l of dock.querySelectorAll('.sw-lbl')) {
    const t = l.textContent;
    if (['染料', '时装', '装备', '宠物', '光源', '矿车', '坐骑', '钩爪'].includes(t) && !lblX[t]) {
      lblX[t] = Math.round(l.getBoundingClientRect().left);
    }
  }
  const colY = (where, idxs) => idxs.map((i) => {
    const s = dock.querySelector(`.sw-slot[data-idx="${i}"][data-where="${where}"]`);
    const r = s.getBoundingClientRect();
    return r.height > 4 ? Math.round(r.top) : null;
  }).filter((v) => v !== null);
  const eq = colY('armor', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const va = colY('armor', [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  const dy = colY('dye', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  return {
    labelOrder: ['时装', '装备', '染料', '宠物'].map((t) => `${t}@${lblX[t] ?? '?'}`),
    orderOk: lblX['时装'] < lblX['装备'] && lblX['装备'] < lblX['染料'],
    colCounts: [eq.length, va.length, dy.length],
    aligned: eq.length === va.length && va.length === dy.length
      && eq.every((y, i) => Math.abs(y - va[i]) < 2 && Math.abs(y - dy[i]) < 2),
  };
});
console.log(JSON.stringify(out, null, 1));
console.log('ERRS', JSON.stringify(errs.slice(0, 3)));
await page.screenshot({ path: 'shots/column-order.png' });
await browser.close();
