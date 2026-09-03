import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
page.on('console', (m) => console.log('PAGE:', m.text()));
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5210') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const atlas = g.renderer?.atlas ?? null;
  const im = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = 'sprites/vanilla/MapBG1.png'; });
  const keys = atlas ? [...atlas.vimages.keys()].filter((k) => k.includes('MapBG1')).slice(0, 5) : [];
  // 直驱 bstLoadSheet? 未导出。改测 Image 路径 + atlas 命中
  return { atlasType: atlas ? atlas.constructor.name : null, mapbgKeys: keys, imgLoaded: im ? im.width : null,
    vimagesHas: atlas ? atlas.vimages.has('vanilla/MapBG1.png') : null };
});
console.log(JSON.stringify(out));
await browser.close();
