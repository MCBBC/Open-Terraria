import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
await p.evaluateOnNewDocument(() => {
  window.__opened = [];
  window.open = (url, target) => { window.__opened.push({ url: String(url), target: String(target) }); return null; };
});
await p.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:4177'}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuOk = false;
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 500));
  menuOk = await p.evaluate(() => !!document.querySelector('[data-act=replog]')).catch(() => false);
  if (menuOk) break;
}
const out = await p.evaluate(() => {
  const btns = [...document.querySelectorAll('.sw-title-btn')];
  const buy = btns.findIndex((b2) => b2.getAttribute('data-act') === 'buy');
  const rep = btns.findIndex((b2) => b2.getAttribute('data-act') === 'replog');
  return { acts: btns.map((b2) => b2.getAttribute('data-act')), belowBuy: rep === buy + 1, repText: btns.find((b2) => b2.getAttribute('data-act') === 'replog')?.textContent ?? null };
});
if (menuOk) await p.evaluate(() => { document.querySelector('[data-act=replog]').click(); });
await new Promise((r) => setTimeout(r, 300));
const opened = await p.evaluate(() => window.__opened);
console.log(JSON.stringify({ menuOk, ...out, opened, errs: errs.length }));
const ok = menuOk && out.belowBuy && out.repText === '复刻记录' && opened.some((o) => o.url.includes('terraria-replica-build-notes') && o.target === '_blank') && errs.length === 0;
await b.close();
process.exit(ok ? 0 : 1);
