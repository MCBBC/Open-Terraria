// 地狱背景探针:传送到岩浆带上方,截图+断言绘制层序
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
let r = null;
for (let att = 0; att < 12 && r === null; att++) {
  try {
    await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
    r = await page.evaluate(() => new Promise((res) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (window.__swGame?.player && window.__swGame.world) {
          clearInterval(iv);
          const g = window.__swGame;
          const h = g.world.store.h;
          // 传送到岩浆带上方(magmaLayer ≈ h-335,站 h-360 左右;底下垫个平台防掉)
          const px = Math.floor(g.world.store.w / 2);
          const py = h - 345;
          const st = g.world.store;
          for (let x = px - 4; x <= px + 4; x++) {
            st.setTileSilent(x, py + 3, 1);
            for (let y = py - 6; y < py + 3; y++) st.setTileSilent(x, y, 0);
          }
          g.player.x = px * 16; g.player.y = py * 16;
          g.player.vx = 0; g.player.vy = 0;
          g.camera.x = px * 16; g.camera.y = py * 16;
          const bg = g.renderer.biomeBackground ?? g.renderer.bg;
          setTimeout(() => {
            const cv = g.renderer.canvas;
            const ctx = cv.getContext('2d');
            const shot = ctx.getImageData(640, 400, 1, 1).data;  // 屏中心
            // 采样三段:屏上部(应为黑/岩层)、岩浆带、表面条附近
            const px2 = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
            res(JSON.stringify({
              magmaFrameT: bg ? Math.floor(bg['magmaFrameT'] ?? -1) : 'no-bg',
              top: px2(640, 50),
              mid: px2(640, 400),
              bottom: px2(640, 780),
              camY: Math.round(g.camera.y), hTiles: h,
              magmaLayerApprox: Math.floor(g.world.groundLevel + Math.floor((h - 330 - g.world.groundLevel) / 6) * 6) - 5,
              hellTexLoaded: !!(g.renderer.atlas && [...g.renderer.atlas.vimages.keys()].some(k => /Background_18[5-7]/.test(k))),
            }));
          }, 2500);
        } else if (Date.now() - t0 > 60000) { clearInterval(iv); res('timeout'); }
      }, 300);
    }));
  } catch (e) {
    if (!/navigation|detached/i.test(e.message)) throw e;
    console.log('retry', att);
    await new Promise((r2) => setTimeout(r2, 2500));
  }
}
console.log(r);
await browser.close();
