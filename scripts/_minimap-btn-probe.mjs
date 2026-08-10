import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/?play=small&btn=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0,3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 2500));
// 悬停到放大按钮中心（fx=984+202+9, fy=79+240+9）
await page.mouse.move(1195, 328);
await new Promise((r) => setTimeout(r, 400));
const hover = await page.evaluate(() => ({ hover: window.__swGame.renderer.minimapUiHover, zoom: window.__swGame.renderer.minimapZoom }));
// 按住 1 秒 → zoom 应增大
await page.mouse.down();
await new Promise((r) => setTimeout(r, 1000));
await page.mouse.up();
const after = await page.evaluate(() => ({ hover: window.__swGame.renderer.minimapUiHover, zoom: window.__swGame.renderer.minimapZoom }));
await page.screenshot({ path: 'shots/minimap-btn.png' });
// 移开后再点地图本体 → 应开全屏（minimapUiHover=false 时不拦截）
await page.mouse.move(1100, 200);
await new Promise((r) => setTimeout(r, 200));
await page.mouse.down(); await new Promise((r) => setTimeout(r, 120)); await page.mouse.up();
await new Promise((r) => setTimeout(r, 500));
const fm = await page.evaluate(() => ({ fullMapOpen: window.__swGame.renderer.fullMap.open }));
console.log(JSON.stringify({ hover, after, fm, errors: errors.slice(0, 3) }, null, 2));
await browser.close();
