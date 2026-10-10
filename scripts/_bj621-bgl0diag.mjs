import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CON', m.type(), m.text().slice(0, 200)); });
await page.goto(ORIGIN + '/?bgl=0', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let t = 0; t < 60; t++) {
  await new Promise((r) => setTimeout(r, 2000));
  const st = await page.evaluate(() => ({ flow: !!window.__swFlow, boot: document.readyState, title: document.title }));
  console.log(t, JSON.stringify(st));
  if (st.flow) break;
}
await browser.close();
