import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
const r = await page.evaluate(() => new Promise((res) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (window.__swGame && window.__swGame.player) {
      clearInterval(iv);
      (async () => {
        const g = window.__swGame;
        await new Promise((r2) => setTimeout(r2, 1200));
        g.world.explored.fill(1); g.world.exploredVersion++;
        g.renderer.fullbright = true;
        // 造一只 EoC:固定在屏幕中心左 300px,玩家在右 → 期望瞳孔朝右(朝玩家)
        const { Enemy } = await import('/src/entities/Enemy.ts');
        const ex = g.player.cx - 300, ey = g.player.cy;
        const e = Enemy.fromVanilla ? Enemy.fromVanilla(4, ex, ey) : null;
        if (!e) return res({ error: 'fromVanilla 失败' });
        e.vx = 0; e.vy = 0;
        g.entities.add(e, 'enemies');
        g.boss = e;
        // 冻 AI:直接把 visAngle 设为悬浮目标并停 40 帧让它稳定
        for (let i = 0; i < 90; i++) {
          const dx = g.player.cx - e.cx, dy = g.player.cy - e.cy;
          // 复制 hover 分支的目标(rate 小,逐步逼近)
          const target = Math.atan2(dy, dx) + Math.PI * 0.5;
          let diff = target - e.visAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          e.visAngle += diff * Math.min(1, 0.02 * 10);
          e.x = ex - e.w / 2; e.y = ey - e.h / 2; // 钉住位置
        }
        await new Promise((r2) => setTimeout(r2, 500));
        // 截取 EoC 区域,找暗瞳质心相对眼心的方位
        const z = g.camera.zoom;
        const camRX = Math.round(g.camera.x * z) / z;
        const sx = Math.round((e.cx - camRX) * z + 1280 / 2);
        const sy = Math.round((e.cy - g.camera.y) * z + 800 / 2);
        const rad = Math.round(70 * z);
        const ctx = g.renderer.canvas.getContext('2d');
        const img = ctx.getImageData(sx - rad, sy - rad, rad * 2, rad * 2).data;
        let n = 0, cx = 0, cy = 0;
        for (let y = 0; y < rad * 2; y++) {
          for (let x = 0; x < rad * 2; x++) {
            const i = (y * rad * 2 + x) * 4;
            const lum = (img[i] + img[i+1] + img[i+2]) / 3;
            if (lum < 45) { cx += x; cy += y; n++; }
          }
        }
        if (!n) return res({ error: '无暗像素', sx, sy });
        // 裁剪保存 PNG 供肉眼检查
        const crop = document.createElement('canvas');
        crop.width = rad * 2; crop.height = rad * 2;
        crop.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img), rad * 2, rad * 2), 0, 0);
        window.__eocCrop = crop.toDataURL();
        const px = cx / n / (rad * 2) - 0.5, py = cy / n / (rad * 2) - 0.5;
        const dxp = g.player.cx - e.cx, dyp = g.player.cy - e.cy;
        const phi = Math.atan2(dyp, dxp);
        res({
          playerDir: [dxp > 0 ? '右' : '左', dyp > 0 ? '下' : '上'].join('/'),
          phi: phi.toFixed(2), visAngle: e.visAngle.toFixed(2), state: e.state, phase: e.phase,
          darkCentroid: [px.toFixed(2), py.toFixed(2)],
          瞳孔方位: py < -0.05 ? '上' : py > 0.05 ? '下' : (px > 0.05 ? '右' : px < -0.05 ? '左' : '中'),
          darkPixels: n,
        });
      })();
    } else if (Date.now() - t0 > 180000) { clearInterval(iv); res({ error: 'timeout' }); }
  }, 250);
}));
console.log(JSON.stringify(r, null, 1));
const shot = await page.evaluate(() => window.__eocCrop ?? null);
if (shot) {
  const fs = await import('node:fs');
  fs.writeFileSync('/tmp/eoc-crop.png', Buffer.from(shot.split(',')[1], 'base64'));
  console.log('crop saved /tmp/eoc-crop.png');
}
await browser.close();
