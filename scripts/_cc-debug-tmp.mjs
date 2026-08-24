import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 860 } });
const page = await browser.newPage();
await page.goto('http://localhost:5204/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu [data-act=sp]', { timeout: 30000 });
await page.waitForSelector('#sw-splash', { hidden: true, timeout: 90000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 500));
await page.click('.sw-title-menu [data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 15000 });
await page.click('.sw-vsel [data-act=new]');
await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
await page.click('.sw-cc-tab[data-tab=look]');
await new Promise((r) => setTimeout(r, 900));
const m = await page.evaluate(() => {
  const act = document.querySelector('.sw-cc-stylebtn.active');
  if (!act) return 'NO ACTIVE BTN';
  const hl = act.querySelector('.hl');
  const cs = getComputedStyle(hl);
  const r = hl.getBoundingClientRect();
  return {
    actTitle: act.title, hlDisplay: cs.display, hlRect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    hlSrc: cs.borderImageSource.slice(0, 50), hlInset: cs.top + '/' + cs.left,
    cathlVar: getComputedStyle(document.documentElement).getPropertyValue('--cc-cathl').slice(0, 50),
  };
});
console.log(JSON.stringify(m, null, 1));
await browser.close();
