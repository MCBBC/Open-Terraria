// 最小世界耗时基线：确认 newWorld 在当前机器负载下的真实耗时
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
const t0 = Date.now();
await page.evaluate(() => window.__swFlow.newWorld('', 1200, 400));
console.log('[wg] newWorld await ms:', Date.now() - t0);
await page.waitForFunction(() => !!window.__swGame, { timeout: 20000 });
console.log('[wg] __swGame up, total ms:', Date.now() - t0);
await browser.close();
