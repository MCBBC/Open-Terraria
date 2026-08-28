import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e.message).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ` + m.text().slice(0, 300)); });
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
const state = await page.evaluate(() => ({
  flow: !!window.__swFlow, viki: !!window.__swVANILLA_ITEM_KEY_BY_ID,
  game: !!window.__swGame, bodyChildren: document.body.children.length,
  hasSplash: !!document.querySelector('.sw-splash, #splash'),
}));
console.log(JSON.stringify(state));
console.log(errs.slice(0, 12).join('\n'));
await browser.close();
