import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?p2=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await page.mouse.move(640, 400);
await new Promise((r) => setTimeout(r, 300));
const probe = await page.evaluate(async () => {
  const c = document.getElementById('ui-canvas');
  const ctx = c.getContext('2d');
  const snap1 = ctx.getImageData(0, 0, c.width, c.height).data;
  let nonEmpty1 = 0;
  for (let i = 3; i < snap1.length; i += 4) if (snap1[i] > 8) nonEmpty1++;
  await new Promise((r) => setTimeout(r, 400));
  const snap2 = ctx.getImageData(0, 0, c.width, c.height).data;
  let nonEmpty2 = 0;
  for (let i = 3; i < snap2.length; i += 4) if (snap2[i] > 8) nonEmpty2++;
  return {
    canvasW: c.width, canvasH: c.height,
    nonEmpty1, nonEmpty2, changing: nonEmpty1 !== nonEmpty2,
  };
});
probe.errors = errors.slice(0, 5);
console.log(JSON.stringify(probe, null, 2));
await browser.close();
