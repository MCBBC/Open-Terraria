// Misc_water_0 纹理块对照:批化 UV 块 vs shim region 块的原始 texel
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await page.goto(ORIGIN + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
{ const t0 = Date.now(); let ok = false;
  while (Date.now() - t0 < 120000) {
    ok = await page.evaluate(() => typeof window.__swFlow === 'object').catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 500));
  }
}
// 直接 Image 载入(vite public 静态文件)
const out2 = await page.evaluate(async () => {
  const img = new Image();
  img.src = '/sprites/vanilla/Misc_water_0.png';
  await new Promise((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('load fail')); });
  await img.decode().catch(() => {});
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const px = (sx, sy) => Array.from(x.getImageData(sx, sy, 1, 1).data.slice(0, 3));
  return {
    dim: [img.width, img.height],
    midBlockRows: [48, 50, 52, 55, 58, 62].map((r) => ({ y: r, at16: px(16, r), at20: px(20, r), at24: px(24, r) })),
    topBlock: [0, 4, 8, 12].map((r) => ({ y: r, at0: px(0, r), at8: px(8, r), at16: px(16, r) })),
    surfBand: [1280, 1284, 1288].map((r) => ({ y: r, at0: px(0, r), at16: px(16, r) })),
  };
});
console.log(JSON.stringify(out2, null, 1));
process.exit(0);
void 0;
