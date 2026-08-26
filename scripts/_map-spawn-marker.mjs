// 一次性:全屏地图出生点标记验证——开图居中 spawn,悬停标记截图
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 160)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.renderer, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1800));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const fm = g.renderer.fullMap;
  const st = g.world.store;
  const zoom = 1;
  fm.open = true; fm.zoom = zoom; fm.zoomTarget = zoom;
  fm.panX = zoom * (st.w / 2 - g.world.spawnX);     // 出生点居中
  fm.panY = zoom * (st.h / 2 - g.world.spawnY);
  g.world.spawnX; g.world.spawnY;
  return { spawnX: g.world.spawnX, spawnY: g.world.spawnY };
});
await new Promise((r) => setTimeout(r, 700));
// 鼠标移到屏幕中心(出生点标记处)验证悬停文案
await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseX = Math.floor(window.innerWidth / 2);
  g.input.mouseY = Math.floor(window.innerHeight / 2) - 8;
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'shots/map-spawn-marker.png' });
const hover = await page.evaluate(() => window.__swGame.renderer.fullMapHoverName);
console.log(JSON.stringify({ ...out, hoverName: hover }));
await browser.close();
