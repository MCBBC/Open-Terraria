import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 800));
console.log(JSON.stringify(await page.evaluate(() => {
  const items = window.__swItems;
  const baitKeys = Object.keys(items).filter(k => /bait/i.test(k)).slice(0, 8);
  // 检查它们的 itemfunc.bait
  return baitKeys;
})));
await browser.close();
