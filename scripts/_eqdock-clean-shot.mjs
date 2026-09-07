import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  // 关欢迎弹窗（点「我知晓」）
  const btn = [...document.querySelectorAll('button, .sw-btn')].find((b) => (b.textContent || '').includes('我知晓'));
  if (btn) btn.click();
  window.__swUI.openInventory();
});
await new Promise((r) => setTimeout(r, 600));
// 只裁右下角坞区域,放大看清
const dock = await page.$('.sw-eqdock');
if (dock) await dock.screenshot({ path: '/tmp/eqdock-clean.png' });
await browser.close();
console.log('done');
