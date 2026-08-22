import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000 });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(() => {
  const keys = Object.keys(window.__swItems ?? {});
  const hit = (re) => keys.filter((k) => re.test(k)).slice(0, 6);
  return { musket: hit(/火枪弹|musket/i), bullet: hit(/子弹/), shotgun: hit(/霰弹枪|shotgun/i),
    minishark: hit(/迷你鲨|minishark/i), keysTotal: keys.length, sample: keys.slice(0, 8) };
});
console.log(JSON.stringify(out));
await browser.close();
