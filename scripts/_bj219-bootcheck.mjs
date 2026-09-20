import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ protocolTimeout: 120000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLEERR:', String(m.text()).slice(0, 160)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5204') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let t = 0; t < 8; t++) {
  await new Promise((r) => setTimeout(r, 3000));
  const state = await page.evaluate(() => ({
    sp: !!document.querySelector('[data-act=sp]'),
    buttons: [...document.querySelectorAll('button,[data-act]')].slice(0, 8).map((b) => (b.textContent ?? '').slice(0, 20)),
    bodyLen: document.body.innerHTML.length,
  }));
  console.log(JSON.stringify(state));
  if (state.sp) break;
}
await page.screenshot({ path: '/tmp/bj219-bootcheck.png' });
await browser.close();
