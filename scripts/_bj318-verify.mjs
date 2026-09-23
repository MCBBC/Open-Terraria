import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  userDataDir: '/tmp/bj318-ver-' + (Date.now() % 100000),
  args: ['--no-sandbox', '--no-proxy-server'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('[data-act=sp]')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => window.__swFlow.newWorld('ver' + Date.now() % 10000, 1200, 850));
for (let i = 0; i < 240; i++) {
  if (await page.evaluate(() => !!(window.__swGame?.running)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 3000));
const before = await page.evaluate(() => ({ renderLog: typeof window.__swRenderLog, game: !!window.__swGame }));
await page.evaluate(() => window.__swFlow.quitToMenu());
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !window.__swGame && !!document.querySelector('[data-act=sp]')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const after = await page.evaluate(() => ({ renderLog: typeof window.__swRenderLog, housing: typeof window.__swHousingPanel }));
console.log('BEFORE-QUIT', JSON.stringify(before));
console.log('AFTER-QUIT', JSON.stringify(after), '→ 新代码生效判据: renderLog === "object"→null/"undefined"');
await browser.close();
process.exit(0);
