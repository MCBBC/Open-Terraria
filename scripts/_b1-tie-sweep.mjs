// ★B1 tie 规则扫描:2D drawImage(CPU) 在 W=320、不同 dst offset/源偏移下 tie 像素的取档
import { launchBrowser, openPage, bootstrap } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5209';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?cloudcache=0');
const out = await page.evaluate(() => {
  const pg = document.createElement('canvas');
  pg.width = 1024; pg.height = 64;
  const pc = pg.getContext('2d', { willReadFrequently: true });
  const img = pc.createImageData(1024, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 1024; x++) {
    const i = (y * 1024 + x) * 4;
    img.data[i] = x & 255; img.data[i + 1] = 40; img.data[i + 2] = 0; img.data[i + 3] = 255;
  }
  pc.putImageData(img, 0, 0);
  const res = [];
  for (const W of [320, 325]) {
    for (const sx of [0, 256, 512, 768]) {
      for (let dx = -256; dx <= 256; dx += 32) {
        const cv = document.createElement('canvas');
        cv.width = 2048; cv.height = 64;
        const c2 = cv.getContext('2d', { willReadFrequently: true });
        c2.imageSmoothingEnabled = false;
        // 目标本地 x=207(游戏实态 tie 位置)映射:采样点 (207.5)×256/W
        const cLocal = 207.5 * 256 / W;   // 165.99..(W=320: 166.0 整=tie;W=325: 163.23 非 tie)
        const tiePx = Math.round(cLocal - 0.5 + 0.5) === Math.ceil(cLocal - 0.5) ? null : null;
        // 读 dest 本地 x=207 与 206(=tie 两侧)
        const baseX = 1024 + dx;
        c2.drawImage(pg, sx, 0, 256, 64, baseX, 0, W, 64);
        const d207 = c2.getImageData(baseX + 207, 10, 1, 1).data[0];
        const d206 = c2.getImageData(baseX + 206, 10, 1, 1).data[0];
        // 采样到的 texel(相对 sx):R 值即 texel x mod 256
        res.push({ W, sx, dx, pick207: (sx + d207) % 256 === d207 ? d207 : d207, d207, d206, cLocal: +cLocal.toFixed(4) });
      }
    }
  }
  return res;
});
console.log(JSON.stringify(out));
await browser.close();
