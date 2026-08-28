// 一次性:P0 控件效果目检截图(T2 横屏 + T3 竖屏)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
async function shot(vp, name) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
  await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let inGame = false;
  for (let i = 0; i < 90 && !inGame; i++) {
    inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
    if (!inGame) await new Promise((r) => setTimeout(r, 2000));
  }
  // 唤醒控件态(SC on/药水显隐)、等待两帧 HUD 刷新
  await new Promise((r) => setTimeout(r, 2600));
  const f = `shots/${name}.png`;
  await page.screenshot({ path: f });
  console.log('saved', f);
  await page.close();
}
await shot({ width: 844, height: 390, hasTouch: true, isMobile: true }, 'm-p0-t2-landscape');
await shot({ width: 390, height: 844, hasTouch: true, isMobile: true }, 'm-p0-t3-portrait');
await browser.close();
