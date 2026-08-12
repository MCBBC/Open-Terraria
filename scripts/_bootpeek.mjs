import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?dev=1';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 8000));
const info = await page.evaluate(() => ({
  selects: document.querySelectorAll('select').length,
  buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).slice(0, 10),
  canvases: document.querySelectorAll('canvas').length,
  game: !!window.__swGame, world: !!(window.__swGame && window.__swGame.world),
  titleMenu: !!window.__swTitleMenu,
  bodySnippet: document.body.innerText.slice(0, 200),
}));
console.log(JSON.stringify(info, null, 1));
console.log('pageerrors:', errs.slice(0, 3).join(' | ').slice(0, 300));
await browser.close();
