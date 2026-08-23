// 一次性:游戏内黑闪遮罩实证——强制 bgFlash[0]=1,截 t0(暗)与 t+500ms(衰减尽)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log('GAME NOT READY'); await browser.close(); process.exit(1); }
await new Promise((r) => setTimeout(r, 1000));

// 帧内亮度采样(降采样 1/16)
const lum = await page.evaluate(() => {
  const cv = document.createElement('canvas');
  cv.width = 80; cv.height = 50;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(window.__swGame.renderer.canvas, 0, 0, 80, 50);
  const d = g.getImageData(0, 0, 80, 50).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
  return s / (80 * 50);
});

await page.evaluate(() => { window.__swGame.renderer.biomeBg.bgFlash[0] = 1; });
await new Promise((r) => setTimeout(r, 30));    // ~2 帧后:flash≈0.9 应显著变暗
const lumFlashed = await page.evaluate(() => {
  const cv = document.createElement('canvas');
  cv.width = 80; cv.height = 50;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(window.__swGame.renderer.canvas, 0, 0, 80, 50);
  const d = g.getImageData(0, 0, 80, 50).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
  const f = window.__swGame.renderer.biomeBg.bgFlash[0];
  return { lum: s / (80 * 50), flash: +f.toFixed(3) };
});
await new Promise((r) => setTimeout(r, 600));   // 20 帧后应衰减归零
const lumDecayed = await page.evaluate(() => {
  const cv = document.createElement('canvas');
  cv.width = 80; cv.height = 50;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(window.__swGame.renderer.canvas, 0, 0, 80, 50);
  const d = g.getImageData(0, 0, 80, 50).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
  return { lum: s / (80 * 50), flash: +window.__swGame.renderer.biomeBg.bgFlash[0].toFixed(3) };
});
console.log(JSON.stringify({ base: +lum.toFixed(1), flashed: lumFlashed, decayed: lumDecayed }));
await browser.close();
