// 现场转储:点创建房间→CharSelect→新建→[data-act=create] 后的全状态。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e.stack ?? e).slice(0, 300)));
p.on('console', (m) => { const t = m.text(); if (!/404|AudioContext/i.test(t)) errs.push('console.' + m.type() + ': ' + t.slice(0, 150)); });
await p.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:4177'}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuOk = false;
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 500));
  menuOk = await p.evaluate(() => !!document.querySelector('[data-act=mp]')).catch(() => false);
  if (menuOk) break;
}
await p.evaluate(() => { document.querySelector('[data-act=mp]').click(); });
await new Promise((r) => setTimeout(r, 800));
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('.sw-panel button')].find((b2) => b2.textContent === '创建房间');
  btn.click();
});
await new Promise((r) => setTimeout(r, 500));
await p.evaluate(() => { document.querySelector('.sw-vsel [data-act=new]')?.click(); });
await new Promise((r) => setTimeout(r, 500));
const before = await p.evaluate(() => {
  const holders = [...document.querySelectorAll('div')].filter((d2) => d2.style.zIndex === '22');
  const panel = [...document.querySelectorAll('.sw-panel')].find((x) => x.textContent?.includes('多人联机'));
  return {
    holders: holders.length,
    holderChildren: holders.map((h) => Array.from(h.children).map((c) => c.className).join(',')),
    mpDisplay: panel ? getComputedStyle(panel).display : 'panel-gone',
    createBtnInDom: !!document.querySelector('[data-act=create]'),
  };
});
console.log('BEFORE:', JSON.stringify(before));
await p.evaluate(() => { document.querySelector('[data-act=create]')?.click(); });
await new Promise((r) => setTimeout(r, 2000));
const after = await p.evaluate(() => {
  const holders = [...document.querySelectorAll('div')].filter((d2) => d2.style.zIndex === '22');
  const panel = [...document.querySelectorAll('.sw-panel')].find((x) => x.textContent?.includes('多人联机'));
  return {
    holders: holders.length,
    holderHtmlLen: holders.map((h) => h.innerHTML.length),
    holderChildren: holders.map((h) => Array.from(h.children).map((c) => c.className).join(',')),
    holderTextHead: holders.map((h) => (h.textContent ?? '').slice(0, 60)),
    mpDisplay: panel ? getComputedStyle(panel).display : 'panel-gone',
    vsel: !!document.querySelector('.sw-vsel'),
    wselText: (document.querySelector('.sw-vsel-title')?.textContent ?? '').slice(0, 20),
  };
});
console.log('AFTER:', JSON.stringify(after, null, 1));
for (const e of errs.slice(0, 5)) console.log('ERR:', e);
await b.close();
process.exit(0);
