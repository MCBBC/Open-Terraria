import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5213';
const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 800));
await page.click('[data-act=sp]');
await new Promise(r => setTimeout(r, 1500));
const state = await page.evaluate(() => ({
  panels: [...document.querySelectorAll('body > div, body > [class*=sw]')].map(d => d.className.toString().slice(0, 50)).slice(0, 12),
  anySw: [...document.querySelectorAll('[class*=sw-]')].map(d => d.className.toString().split(' ')[0]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 20),
}));
console.log(JSON.stringify(state));
await page.screenshot({ path: '/tmp/menu-debug3.png' });
await browser.close();
