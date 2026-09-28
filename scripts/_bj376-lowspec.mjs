import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({
  protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 3000));
const out = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  return {
    canvasW: r.canvas.width, canvasH: r.canvas.height,
    lowW: r._worldLowW, lowH: r._worldLowH, lowK: r._worldLowK,
    autoRungIdx: r._autoRungIdx,
    accMode: r._accMode,
    renderScaleOpt: window.__swGame ? 'see-options' : null,
  };
});
console.log(JSON.stringify(out));
await browser.close();
