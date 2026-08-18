import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 120000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 160)); });
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
const has = await page.waitForFunction(() => !!window.__swFlow, { timeout: 20000 }).then(() => 'flow').catch((e) => 'NO flow: ' + String(e).slice(0, 60));
console.log(has);
await browser.close();
