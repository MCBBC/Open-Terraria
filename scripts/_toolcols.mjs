import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const full = JSON.parse(readFileSync('/Users/vinlic/Downloads/debug-report-黏腻的虫子热喷泉-2026-08-19T16-38-03-419Z.json', 'utf8'));
const browser = await puppeteer.launch({ protocolTimeout: 240000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/tree-inspect.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1500));
await page.evaluate((json) => { document.getElementById('importBox').value = json; },
  JSON.stringify({ tiles: { areaPlayer: full.tiles.areaPlayer } }));
await page.click('#doImport');
await new Promise(r => setTimeout(r, 900));
const res = await page.evaluate(async () => {
  const S = window.__treeInspect;
  const st = S.store;
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const raf = () => new Promise(r => requestAnimationFrame(r));
  const setWind = (m) => { [...document.querySelectorAll('#windModes button')].find((b) => b.textContent.includes(m))?.click(); };
  setWind('静止');
  S.zoom = 1.25;
  const ap = { x0: 2137, y0: 198 };
  const out = [];
  for (const [wx, wy] of [[2164, 219], [2174, 221]]) {
    const gx = wx - ap.x0 + 2, gy = wy - ap.y0 + 2;
    S.tree = { x: gx, markerY: gy, grassY: gy + 10, h: 8, pieces: [] };
    for (let k = 0; k < 6; k++) await raf();
    // store 帧取证
    const frames = [];
    for (let dy = -1; dy <= 4; dy++) {
      const i = st.idx(gx, gy + dy);
      frames.push(st.type[i] + ':' + st.frameX[i] + ',' + st.frameY[i] + (st.flags[i] ? '' : '!'));
    }
    // 整列覆盖剖面（行 marker−2 .. +6，16px 带）
    const B = (gy + 1) * 16;
    const camRX = Math.round((st.w * 16 / 2) * 1.25) / 1.25;
    const camRY = Math.round(B * 1.25) / 1.25;
    const prof = [];
    for (let dy = -2; dy <= 6; dy++) {
      const sx = Math.round((gx * 16 - camRX) * 1.25 + cv.width / 2);
      const sy = Math.round((B + dy - camRY) * 1.25 + cv.height / 2);
      if (sx < 0 || sy < 0 || sx + 20 >= cv.width || sy >= cv.height) { prof.push('?'); continue; }
      const d = ctx.getImageData(sx, sy, 20, 1).data;
      let op = 0, n = 0;
      for (let j = 3; j < d.length; j += 4) { n++; if (d[j] > 60) op++; }
      prof.push(Math.round(op / n * 10) / 10);
    }
    out.push({ wx, wy, frames, prof });
  }
  return out;
});
for (const r of res) {
  console.log(`=== 树@(${r.wx},${r.wy}) ===`);
  console.log('store 帧(y−1..y+4):', r.frames.join(' | '));
  console.log('列覆盖(dy−2..+6):', r.prof.join(','));
}
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
