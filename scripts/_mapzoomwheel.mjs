// 全屏地图滚轮缩放黑屏复现（用后即删）：真实输入路径（点击小地图开图 +
// page.mouse.wheel 滚轮 + 缓动等待）+ 元素坐标采样 + 逐档截图
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = '/Users/vinlic/Downloads/map-Starter_World (6).json';
const json = fs.readFileSync(MAP, 'utf8');

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1512, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5203', { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => window.__swFlow, { timeout: 60000 });
await page.evaluate(async (text) => { await window.__swFlow.loadJson(text); }, json);
await new Promise((r) => setTimeout(r, 1500));

// 开图：直接走游戏同款打开语义（点击路径受 UI 桩态干扰，探针用语义等价注入）
await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer, fm = r.fullMap;
  fm.open = true;
  g.refreshPylons?.();
  fm.zoom = 0.5;
  fm.zoomTarget = 2;
  fm.anchorU = g.player.cx / 16; fm.anchorV = g.player.cy / 16;
  fm.anchorMX = r.canvas.width / 2; fm.anchorMY = r.canvas.height / 2;
  fm.panX = (g.world.w * fm.zoom) / 2 - fm.anchorU * fm.zoom;
  fm.panY = (g.world.h * fm.zoom) / 2 - fm.anchorV * fm.zoom;
  r['_mapInit'] = false;
});
await new Promise((r) => setTimeout(r, 1500));   // 等开图缓动(0.5→2)+懒加载

const state = () => page.evaluate(() => {
  const r = window.__swGame.renderer;
  const fm = r.fullMap;
  return { open: fm.open, zoom: +fm.zoom.toFixed(3), zt: fm.zoomTarget, pan: [Math.round(fm.panX), Math.round(fm.panY)] };
});
console.log('opened:', JSON.stringify(await state()));

// 采样画布中心（canvas 元素坐标系）
const canvasBox = await page.evaluate(() => {
  const c = window.__swGame.renderer.canvas;
  const b = c.getBoundingClientRect();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
});
const sampleCenter = async () => page.evaluate((bx, by) => {
  const c = window.__swGame.renderer.canvas;
  const ctx = c.getContext('2d');
  const sx = Math.floor(bx * c.width / c.clientWidth);
  const sy = Math.floor(by * c.height / c.clientHeight);
  return Array.from(ctx.getImageData(sx, sy, 1, 1).data);
}, canvasBox.x + canvasBox.w / 2, canvasBox.y + canvasBox.h / 2);

// 逐档向上滚（每档 +0.4×；滚 12 次到顶 6）
for (let i = 0; i < 12; i++) {
  await page.mouse.move(canvasBox.x + canvasBox.w / 2, canvasBox.y + canvasBox.h / 2);
  await page.mouse.wheel({ deltaY: -240 });
  await new Promise((r) => setTimeout(r, 450));   // 等缓动收敛
  const s = await state();
  const c = await sampleCenter();
  const black = c[0] < 10 && c[1] < 10 && c[2] < 10;
  console.log(`wheel#${i}`, JSON.stringify(s), 'center', c.join(','), black ? '<<< BLACK' : '');
  if (s.zoom >= 5.9) break;
}
await page.screenshot({ path: '/tmp/map-wheel-max.png' });
await browser.close();
