// 截图留证：splash 淡入完成后的三层合成（RE-LOGIC 字样透出场景）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2600));   // 淡入(1.5s起)完成 + 持满段
await page.screenshot({ path: '/tmp/splash-composite.png' });
await browser.close();
console.log('shot saved');
