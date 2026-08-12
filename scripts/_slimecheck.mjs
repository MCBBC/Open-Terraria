// 史莱姆雨史莱姆渲染检查:触发史莱姆雨 → 抓一只 vanillaNetId≠0 的史莱姆 →
// 截图其区域 → 采样不透明像素包围盒(正常帧高 ~26×scale;整条渲染 = ~52×scale 双层"气球")
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 2000));

// 触发史莱姆雨 + 清屏站定等落怪
await page.evaluate(() => {
  const g = window.__swGame;
  g.world.weather.startSlimeRain();
  // 站地表:找玩家附近地表
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 2;
  while (gy < st.h - 10 && !st.isSolid(px, gy)) gy++;
  g.player.x = px * 16; g.player.y = (gy - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
});
console.log('史莱姆雨已触发,等待落怪…');
let slime = null;
for (let i = 0; i < 60 && !slime; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  slime = await page.evaluate(() => {
    const g = window.__swGame;
    const list = g.enemies();
    for (const e of list) {
      if (e.vanillaId === 1) {
        return { x: e.cx, y: e.cy, netId: e.vanillaNetId, scale: e.vanillaScale, w: e.w, h: e.h, dead: e.dead };
      }
    }
    return null;
  });
}
if (!slime) {
  console.log('FAIL: 30 秒内没有史莱姆雨史莱姆(生成端问题?)');
} else {
  console.log('抓到史莱姆:', JSON.stringify(slime));
  // 传送玩家到它旁边(相机跟随),等一帧
  await page.evaluate((s) => {
    const g = window.__swGame;
    g.player.x = s.x - 400; g.player.y = s.y - 200;
    g.player.vx = 0; g.player.vy = 0;
  }, slime);
  await new Promise((r) => setTimeout(r, 1200));
  // 截全屏 → 找该怪附近的非背景像素包围盒(粗略:以怪屏幕位置为中心 80×80 采样)
  const pos = await page.evaluate((s) => {
    const g = window.__swGame;
    const sx = Math.round(s.x - g.camera.x + 640), sy = Math.round(s.y - g.camera.y + 400);
    return { sx, sy, zoom: g.renderer?.zoom ?? 1 };
  }, slime);
  console.log('屏幕位置:', JSON.stringify(pos));
  const png = PNG.sync.read(await page.screenshot({}));
  const { sx, sy } = pos;
  // 采样怪上下的不透明竖向分布(找精灵实际高度)
  let top = -1, bottom = -1;
  for (let dy = -60; dy <= 60; dy++) {
    const yy = Math.max(0, Math.min(png.height - 1, sy + dy));
    let opaque = 0;
    for (let dx = -20; dx <= 20; dx += 2) {
      const xx = Math.max(0, Math.min(png.width - 1, sx + dx));
      const i = (yy * png.width + xx) * 4;
      const a = png.data[i + 3];
      // 背景是天空/地形的颜色——用与天空对比粗糙判定,统计亮/彩像素
      const r = png.data[i], g2 = png.data[i + 1], b = png.data[i + 2];
      if (a > 100 && !(r > 120 && g2 > 160 && b > 200)) opaque++; // 排除天空蓝
    }
    if (opaque > 3) { if (top < 0) top = dy; bottom = dy; }
  }
  const spriteH = bottom - top + 1;
  const expect = Math.round(26 * slime.scale);
  console.log(`精灵竖向跨度 ${spriteH}px (top=${top} bottom=${bottom}); 正常应 ≈${expect}px(26帧高×scale ${slime.scale});整条渲染应 ≈${Math.round(52 * slime.scale)}px`);
  const verdict = spriteH <= expect + 8 ? 'PASS' : spriteH >= Math.round(44 * slime.scale) ? 'FAIL(整条渲染=气球)' : 'WARN';
  console.log(verdict);
  await page.screenshot({ path: '/tmp/slime-rain.png' });
}
await browser.close();
