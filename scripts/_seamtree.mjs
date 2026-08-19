// 用带缝帧（黏腻的虫子热喷泉报告）在解剖台复现树 (2164,219) 的交界缝
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
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const raf = () => new Promise(r => requestAnimationFrame(r));
  const setWind = (m) => { [...document.querySelectorAll('#windModes button')].find((b) => b.textContent.includes(m))?.click(); };
  const ap = { x0: 2137, y0: 198 };
  // 缝树 (2164,219) / 无缝树 (2174,221) —— store 坐标 = 世界 − 原点 + 2
  const trees = [[2164, 219], [2174, 221]];
  const out = [];
  for (const z of [1.25]) {
    S.zoom = z;
    for (const [wx, wy] of trees) {
      for (const mode of ['静止', '无风微摆']) {
        setWind(mode);
        const gx = wx - ap.x0 + 2, gy = wy - ap.y0 + 2;
        S.tree = { x: gx, markerY: gy, grassY: gy + 10, h: 8, pieces: [] };
        for (let k = 0; k < 6; k++) await raf();
        const B = (gy + 1) * 16;
        const camRX = Math.round((S.store.w * 16 / 2) * z) / z;
        const camRY = Math.round(B * z) / z;
        const rows = [];
        for (let dy = -2; dy <= 2; dy++) {
          const sx = Math.round((gx * 16 - camRX) * z + cv.width / 2);
          const sy = Math.round((B + dy - camRY) * z + cv.height / 2);
          if (sx < 0 || sy < 0 || sx + Math.round(16 * z) >= cv.width || sy >= cv.height) { rows.push(-1); continue; }
          const d = ctx.getImageData(sx, sy, Math.round(16 * z), 1).data;
          let op = 0, n = 0;
          for (let j = 3; j < d.length; j += 4) { n++; if (d[j] > 60) op++; }
          rows.push(Math.round(op / n * 100) / 100);
        }
        out.push({ wx, wy, mode, z, rows });
      }
    }
  }
  return out;
});
for (const r of res) console.log(`树@(${r.wx},${r.wy}) ${r.mode} ×${r.z} 行覆盖[dy−2..+2]: ${r.rows.join(', ')}`);
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
