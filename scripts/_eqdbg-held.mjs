import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
const warns = [];
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warns.push(m.text().slice(0, 200)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await page.waitForFunction(() => window.__swUI?.quickStackBtn && window.__swUI?.qsSmartBtn, { timeout: 60000, polling: 200 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  [...document.body.children].filter((d) => d.tagName === 'DIV' && d.style?.position === 'fixed'
    && d.textContent?.includes('欢迎来到 SandboxWorld')).forEach((d) => d.remove());
  try { window.__swUI.openInventory(); } catch {}
});
await new Promise((r) => setTimeout(r, 400));
const out = await page.evaluate(() => {
  const ui = window.__swUI, panel = document.querySelector('.sw-panel');
  const qs = ui.quickStackBtn?.getBoundingClientRect();
  const sm = ui.qsSmartBtn?.getBoundingClientRect();
  const cluster = qs?.parentElement;
  const em = ui.itemSearchBtn?.getBoundingClientRect();
  const card = panel.querySelector('.sw-ach-advisor');
  const ig = panel.querySelector('.sw-invgrid');
  const s10 = ig?.querySelector('.sw-slot[data-idx="10"]')?.getBoundingClientRect();
  const s11 = ig?.querySelector('.sw-slot[data-idx="11"]')?.getBoundingClientRect();
  const s20 = ig?.querySelector('.sw-slot[data-idx="20"]')?.getBoundingClientRect();
  return {
    gridPitchX: s10 && s11 ? Math.round(s11.left - s10.left) : null,
    gridPitchY: s10 && s20 ? Math.round(s20.top - s10.top) : null,
    cardExists: !!card,
    cardTopVsClusterBottom: card && cluster ? Math.round(card.getBoundingClientRect().top - cluster.getBoundingClientRect().bottom) : 'no-card',
    advisorElField: ui.achAdvisorEl ? 'set' : 'null',
  };
});
const alive = await page.evaluate(() => ({ root: !!document.querySelector('.sw-root'), dock: !!document.querySelector('.sw-eqdock') }));
console.log(JSON.stringify({ ...out, alive }, null, 1));
console.log('WARNS', JSON.stringify(warns.slice(0, 4)));
await page.screenshot({ path: 'shots/batch6-grid.png' });
await browser.close();
