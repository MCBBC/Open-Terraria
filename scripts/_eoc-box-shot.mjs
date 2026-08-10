import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => new Promise((res) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (window.__swGame && window.__swGame.player) {
      clearInterval(iv);
      (async () => {
        const g = window.__swGame;
        await new Promise((r2) => setTimeout(r2, 1200));
        g.world.explored.fill(1); g.world.exploredVersion++;
        g.renderer.fullbright = true;
        g.renderer.debugMode = true;
        const { Enemy } = await import('/src/entities/Enemy.ts');
        const e = Enemy.fromVanilla(4, g.player.cx, g.player.cy - 260);
        e.vx = 0; e.vy = 0;
        g.entities.add(e, 'enemies');
        const pin = setInterval(() => { e.x = g.player.cx - e.w / 2; e.y = g.player.cy - 260 - e.h / 2; e.vx = 0; e.vy = 0; }, 16);
        await new Promise((r2) => setTimeout(r2, 800));
        clearInterval(pin);
        const z = g.camera.zoom;
        const camRX = Math.round(g.camera.x * z) / z;
        const sx = Math.round((e.cx - camRX) * z + 1280 / 2);
        const sy = Math.round((e.cy - g.camera.y) * z + 800 / 2);
        const rad = 110;
        const ctx = g.renderer.canvas.getContext('2d');
        const img = ctx.getImageData(sx - rad, sy - rad, rad * 2, rad * 2).data;
        // 1) 不透明精灵的包围盒(排除调试虚线:只统计非红像素)
        let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
        for (let y = 0; y < rad * 2; y++) {
          for (let x = 0; x < rad * 2; x++) {
            const i = (y * rad * 2 + x) * 4;
            if (img[i + 3] < 40) continue;
            const r = img[i], gg = img[i + 1], b = img[i + 2];
            if (r > 200 && gg < 120 && b < 120) continue; // 红=调试盒/伤害
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
        res({
          hitbox: [e.w, e.h],
          spriteBBox: [maxX - minX + 1, maxY - minY + 1],
          bboxCenterOff: [Math.round((minX + maxX) / 2 - rad), Math.round((minY + maxY) / 2 - rad)],
          note: 'spriteBBox 单位=屏幕px(含 z 缩放),hitbox 单位=世界px',
        });
      })();
    } else if (Date.now() - t0 > 180000) { clearInterval(iv); res('timeout'); }
  }, 250);
})).then((r) => { console.log(JSON.stringify(r, null, 1)); return browser.close(); });
