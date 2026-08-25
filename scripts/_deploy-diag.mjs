// 隐藏验证:菜单按钮序列不含 replog,其余按钮完好。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:4177'}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuOk = false;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 500));
  menuOk = await p.evaluate(() => !!document.querySelector('.sw-title-btns')).catch(() => false);
  if (menuOk) break;
}
const out = await p.evaluate(() => ({
  acts: [...document.querySelectorAll('.sw-title-btn')].map((b2) => b2.getAttribute('data-act')),
  repInDom: !!document.querySelector('[data-act=replog]'),
}));
console.log(JSON.stringify(out));
const ok = !out.repInDom && !out.acts.includes('replog') && out.acts.includes('buy') && out.acts.includes('quit');
await b.close();
process.exit(ok ? 0 : 1);
