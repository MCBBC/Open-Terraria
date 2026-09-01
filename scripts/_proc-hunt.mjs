import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1000));
const mods = process.argv.slice(process.argv.indexOf('--') + 1);
const bad = await page.evaluate(async (list) => {
  const out = [];
  for (const m of list) {
    try { await import(m); } catch (e) { out.push([m, String(e).slice(0, 120)]); }
  }
  return out;
}, mods);
console.log(JSON.stringify(bad, null, 2));
await browser.close();
