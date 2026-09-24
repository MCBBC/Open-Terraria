// ★B1 tie 规则拟合:候选 float32 组合式 vs 扫描实测
import { launchBrowser, openPage, bootstrap } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5209';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?cloudcache=0');
const out = await page.evaluate(() => {
  const fr = Math.fround;
  const pg = document.createElement('canvas');
  pg.width = 1024; pg.height = 64;
  const pc = pg.getContext('2d', { willReadFrequently: true });
  const img = pc.createImageData(1024, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 1024; x++) {
    const i = (y * 1024 + x) * 4;
    img.data[i] = x & 255; img.data[i + 1] = 40; img.data[i + 2] = 0; img.data[i + 3] = 255;
  }
  pc.putImageData(img, 0, 0);
  const rows = [];
  for (const W of [320, 325, 400, 160]) {
    for (const sx of [0, 256, 512]) {
      for (let dx = -256; dx <= 256; dx += 32) {
        const dstX = 1024 + dx;
        const cv = document.createElement('canvas');
        cv.width = 2048; cv.height = 64;
        const c2 = cv.getContext('2d', { willReadFrequently: true });
        c2.imageSmoothingEnabled = false;
        c2.drawImage(pg, sx, 0, 256, 64, dstX, 0, W, 64);
        const d207 = c2.getImageData(dstX + 207, 10, 1, 1).data[0];   // page x = sx+d207
        const a = fr(256 / W);
        const J = dstX + 207.5;                           // 设备像素中心
        const e1 = fr(sx - fr(dstX * a));                 // e = sx - dstX*a (f32 逐项)
        const R1 = Math.floor(fr(fr(J * a) + e1));        // 乘、加各一次 f32 舍入
        const R2 = Math.floor(fr(J * a + e1));            // 乘加合并(潜在 FMA)后一次舍入
        const e2 = fr(sx - dstX * a);                     // e 在 f64 算再 f32
        const R3 = Math.floor(fr(fr(J * a) + e2));
        const R4 = Math.floor(fr(J * a + e2));
        const R5 = Math.floor(fr(fr(fr(J) * fr(a)) + e1));
        const R6 = Math.floor(fr(fr((dstX - dstX + 207.5) * a) + e1));  // 本地化退化(对照)
        const L1 = sx + Math.floor(fr(207.5 * a));        // 本地式(无 dstX 参与;对照)
        rows.push({ W, sx, dx, obs: sx + d207, R1, R2, R3, R4, R5, R6, L1 });
        rows.push({ W, sx, dx, obs: sx + d207, R1, R2, R3, R4, L1 });
      }
    }
  }
  return rows;
});
const names = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'L1'];
const score = {};
for (const n of names) score[n] = 0;
for (const r of out) for (const n of names) if (r[n] === r.obs) score[n]++;
console.log('samples:', out.length, 'scores:', JSON.stringify(score));
// 展示 W=320 sx=512 的逐点
for (const r of out.filter((r) => r.W === 320 && r.sx === 512)) {
  console.log(`dx=${r.dx} obs=${r.obs} R1=${r.R1} R2=${r.R2} R3=${r.R3} R4=${r.R4} L1=${r.L1}`);
}
await browser.close();
