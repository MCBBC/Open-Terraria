// 一次性:游戏内回归——统一后 BiomeBackground 游戏内路径(menuMode=false)行为不变:
// 森林地表截图 + bgStyle/alphaFront/menuMode 状态 dump。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await new Promise((r) => setTimeout(r, 2500));
// 正午定光(排除时辰差异)+ 传回地表出生点
await page.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  const p = g.player;
  p.x = g.world.store.w * 16 / 2; p.vx = 0;
});
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: '/tmp/menu-unify/ingame-forest-noon.png' });
const state = await page.evaluate(() => {
  const g = window.__swGame;
  const bb = g.renderer.biomeBg;
  return {
    menuMode: bb.menuMode, bgStyle: bb.bgStyle,
    alphaFront0: +bb.alphaFront[0].toFixed(3),
    ugStyle: bb.ugStyle, flashSum: Array.from(bb.bgFlash).reduce((a, b) => a + b, 0),
    forestStyles: bb.forestStyles, camY: Math.round(g.renderer.cam?.y ?? g.renderer.camera?.y ?? -1),
  };
});
console.log('INGAME:', JSON.stringify(state));
await browser.close();
