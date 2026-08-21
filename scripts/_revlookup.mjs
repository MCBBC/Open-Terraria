import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 120000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__swItems, { timeout: 60000 });
const out = await page.evaluate(() => {
  const rev = {};
  for (const [k, v] of Object.entries(window.__swItems)) rev[v] = k;
  const idOf = (re) => { const k = Object.keys(window.__swItems).find((k) => re.test(k)); return [k, window.__swItems[k]]; };
  return {
    v1736: rev[1736],
    v393: rev[393],
    shotgun534: idOf(/^vi_534_/),
    onyx575: idOf(/^vi_575_/),
    bullet97: idOf(/^vi_97_/),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
