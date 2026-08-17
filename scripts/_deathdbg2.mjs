// 眼睑盒校准：按实际外观色在画布定位玩家 + 眼区暗像素闭眼对比
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const cv = g.renderer.canvas, cam = g.camera;
  const a = p.appearance;
  if (!a) return { noAppearance: true };
  // 用实际皮肤色全画布找簇
  const img = g.renderer.ctx.getImageData(0, 0, cv.width, cv.height).data;
  const near = (v, t, tol) => Math.abs(v - t) <= tol;
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0;
  for (let y = 0; y < cv.height; y += 2) {
    for (let x = 0; x < cv.width; x += 2) {
      const i = (y * cv.width + x) * 4;
      if (img[i + 3] > 100 && near(img[i], a.skinColor.r, 34) && near(img[i + 1], a.skinColor.g, 36) && near(img[i + 2], a.skinColor.b, 34)) {
        n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const expX = Math.round((p.cx - cam.x) * cam.zoom + cv.width / 2);
  const expFootY = Math.round((p.y + p.h - cam.y) * cam.zoom + cv.height / 2);
  const expTopY = Math.round((p.y + p.h - 56 + 2 - cam.y) * cam.zoom + cv.height / 2);
  // 眼区暗像素（瞳/眉/发际暗色，排除皮肤色）
  const eyeBox = () => {
    const w = Math.round(30 * cam.zoom), h = Math.round(22 * cam.zoom);
    const reg = g.renderer.ctx.getImageData(Math.max(0, expX - w / 2), Math.max(0, expTopY + Math.round(4 * cam.zoom)), w, h).data;
    let dark = 0, tot = 0;
    for (let i = 0; i < reg.length; i += 4) {
      if (reg[i + 3] > 100) { tot++; if (reg[i] < 165 && reg[i + 1] < 150) dark++; }
    }
    return { dark, tot };
  };
  const open = eyeBox();
  p.eyeBlinkHurt();
  await new Promise(r => setTimeout(r, 130));
  const closed = eyeBox();
  return {
    skin: a.skinColor, hair: a.hairColor, eye: a.eyeColor, skinVariant: a.skinVariant,
    cluster: { n, bbox: [minX, minY, maxX, maxY] },
    expected: { x: expX, footY: expFootY, topY: expTopY },
    zoom: cam.zoom, open, closed,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
