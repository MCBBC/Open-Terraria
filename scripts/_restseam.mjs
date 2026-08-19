// 归位缝验证（rectSnap 修复）：解剖台 1.27×/1.25×/1.5× 静止 + 微摆相位扫——
// 冠底边缘行（交界行 B−1/B）半透明像素计数（修复前=整行半透明亮缝）。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ protocolTimeout: 240000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 900 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/tree-inspect.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1500));
const res = await page.evaluate(async () => {
  const S = window.__treeInspect;
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const raf = () => new Promise(r => requestAnimationFrame(r));
  const setWind = (m) => { [...document.querySelectorAll('#windModes button')].find((b) => b.textContent.includes(m))?.click(); };
  const setZoom = (z) => { [...document.querySelectorAll('#zooms button')].find((b) => b.textContent.includes(String(z)))?.click(); };
  const out = [];
  for (const z of [1.25, 1.27]) {
    setZoom(z);
    for (const mode of ['静止', '无风微摆']) {
      setWind(mode);
      S.tree = { x: 13, markerY: 30, grassY: 38, h: 7, pieces: [] };
      for (let k = 0; k < 6; k++) await raf();
      const B = 31 * 16;
      let worstSemi = 0, worstRow = null, frames = 12;
      for (let f = 0; f < frames; f++) {
        for (let k = 0; k < 2; k++) await raf();
        const camRX = Math.round((S.store.w * 16 / 2) * z) / z;
        const camRY = Math.round(B * z) / z;
        for (let dy = -2; dy <= 1; dy++) {
          const sx = Math.round((13 * 16 - 10 - camRX) * z + cv.width / 2);
          const sy = Math.round((B + dy - camRY) * z + cv.height / 2);
          if (sx < 0 || sy < 0 || sx + Math.round(20 * z) >= cv.width || sy >= cv.height) continue;
          const d = ctx.getImageData(sx, sy, Math.round(20 * z), 1).data;
          let semi = 0, n = 0;
          for (let j = 3; j < d.length; j += 4) { n++; if (d[j] > 20 && d[j] < 220) semi++; }
          if (semi > worstSemi) { worstSemi = semi; worstRow = dy; }
        }
      }
      out.push({ z, mode, worstSemi, worstRow, semiRatio: +(worstSemi / (20 * z)).toFixed(2) });
    }
  }
  return out;
});
for (const r of res) console.log(`×${r.z} ${r.mode}: 最坏半透明px=${r.worstSemi}/${Math.round(20 * r.z)} 行=${r.worstRow}（比 ${r.semiRatio}）`);
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
