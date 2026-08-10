// 箭可见性验证:注入零速 Arrow,采样画布像素
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
// HMR 会整页重载:轮询到就绪后尽快在同一 evaluate 内完成注入+采样
// 全部在单次 evaluate 内完成(HMR 重载会使跨 evaluate 的句柄失效)
const result = await page.evaluate(async () => {
  const ready = await new Promise((res) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (window.__swGame && window.__swGame.player && document.querySelector('canvas')) {
        clearInterval(iv); res(true);
      } else if (Date.now() - t0 > 180000) { clearInterval(iv); res(false); }
    }, 250);
  });
  if (!ready) return { error: '游戏未就绪' };
  await new Promise((r) => setTimeout(r, 2000));
  const g = window.__swGame;
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const p = g.player;
  // 玩家右上方 60px 处放一支零速木箭
  const ax = p.x + 60, ay = p.y - 60;
  g.entities.add(new Arrow(ax, ay, 0, 0, 10, 0, 1, 'wooden_arrow'), 'projectiles');
  await new Promise((r) => setTimeout(r, 500)); // 等几帧绘制
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const cam = g.renderer ? g.renderer.lastCam : null;
  // 用 renderer 的公开相机?直接全画布找箭色像素:木箭主体 #C8A868 系棕色
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let brownish = 0;
  const samples = [];
  for (let i = 0; i < img.length; i += 4) {
    const [r, gg, b, a] = [img[i], img[i + 1], img[i + 2], img[i + 3]];
    if (a > 200 && r > 130 && r < 230 && gg > 90 && gg < 190 && b < 130 && r > gg && gg > b) {
      brownish++;
      if (samples.length < 3) samples.push([r, gg, b]);
    }
  }
  return { arrowAt: [ax, ay], brownish, samples };
});
console.log(JSON.stringify(result, null, 1));
console.log('errors:', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();
