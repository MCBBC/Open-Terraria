import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 150)));
await page.goto('http://localhost:5399/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 });
const r = await page.evaluate(() => new Promise((res) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (window.__swGame?.player && window.__swGame.world) {
      clearInterval(iv);
      const g = window.__swGame;
      const st = g.world.store;
      const h = st.h;
      // 深地狱:h-100,垫平台防掉
      const px = Math.floor(st.w / 2), py = h - 100;
      for (let x = px - 5; x <= px + 5; x++) {
        st.setTileSilent(x, py + 3, 1);
        for (let y = py - 6; y < py + 3; y++) st.setTileSilent(x, y, 0);
      }
      g.player.x = px * 16; g.player.y = py * 16;
      g.player.vx = 0; g.player.vy = 0;
      g.camera.x = px * 16; g.camera.y = py * 16;
      setTimeout(() => {
        const ctx = g.renderer.canvas.getContext('2d');
        const grab = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3);
        res(JSON.stringify({
          tile: py, h,
          corners: [grab(5, 5), grab(1270, 5), grab(5, 790), grab(1270, 790)],
          mid: grab(640, 300),
        }));
      }, 2500);
    } else if (Date.now() - t0 > 90000) { clearInterval(iv); res('timeout'); }
  }, 400);
}));
console.log(r);
await browser.close();
