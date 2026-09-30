import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('我已知晓'));
  if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 500));
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 900));
const out = await page.evaluate(() => {
  const chain = (e) => {
    const arr = [];
    let cur = e;
    while (cur && cur !== document.body) {
      const cs = getComputedStyle(cur);
      arr.push(`${(cur.className + '').slice(0, 40)}|d=${cs.display}|v=${cs.visibility}|o=${cs.opacity}|tf=${(cs.transform || 'none').slice(0, 40)}`);
      cur = cur.parentElement;
    }
    return arr;
  };
  const adv = document.querySelector('.sw-ach-advisor');
  const sword = [...document.querySelectorAll('button')].find((b) => ((b.style.backgroundImage || getComputedStyle(b).backgroundImage || '') + '').includes('UI_PVP_0'));
  return {
    invPanel: (() => { const p = document.querySelector('.sw-vinv'); return p ? { d: getComputedStyle(p).display, r: p.getBoundingClientRect().toJSON() } : null; })(),
    advChain: adv ? chain(adv) : null,
    swordChain: sword ? chain(sword) : null,
    keyEWorks: !!document.querySelector('.sw-vinv') && getComputedStyle(document.querySelector('.sw-vinv')).display !== 'none',
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
