import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
const out = await page.evaluate(() => {
  const g = window.__swGame, c = g.renderer.canvas, cam = g.camera;
  const r = c.getBoundingClientRect();
  const [sx, sy] = cam.worldToScreen(g.player.cx, g.player.cy);
  const [wx, wy] = cam.screenToWorld(sx, sy);
  return { dpr: window.devicePixelRatio, canvasWH: [c.width, c.height], cssWH: [r.width, r.height],
    playerScreen: [Math.round(sx), Math.round(sy)], roundtripWorld: [Math.round(wx), Math.round(wy)],
    playerWorld: [Math.round(g.player.cx), Math.round(g.player.cy)], cam: [Math.round(cam.x), Math.round(cam.y)], zoom: cam.zoom };
});
console.log(JSON.stringify(out));
await browser.close();
