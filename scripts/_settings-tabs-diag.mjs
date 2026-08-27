// 一次性:设置页分栏断言(2026-08-27 用户要求摘除资源包/数据入口)——
//  开设置 → 左栏应恰为 音量/界面/游戏/按键绑定 四项,无 资源包/数据。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById('sw-boot-prime') && !document.getElementById('sw-splash'), { timeout: 240000, polling: 500 });
await new Promise((r) => setTimeout(r, 400));
await page.click('[data-act=set]');
await page.waitForSelector('.sw-set-panel', { timeout: 5000 });
await new Promise((r) => setTimeout(r, 300));
const cats = await page.$$eval('.sw-set-cats div', (xs) => xs.map((x) => x.textContent));
console.log(JSON.stringify({ cats, hasPacks: cats.includes('资源包'), hasData: cats.includes('数据') }));
await page.screenshot({ path: '/tmp/settings-tabs.png' });
await browser.close();
