// 缩放全档扫描：用报告树 (2128,217) 的真实干件序列在解剖台重建，
// 0.5→3.0 步 0.05 全扫，逐档检测交界带背景像素（缝）。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ protocolTimeout: 400000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 900 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/tree-inspect.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1500));
const REPORT = '/Users/vinlic/Downloads/debug-report-刺痛感炮轰-2026-08-19T11-04-37-270Z.json';
const full = await import('node:fs').then(m => JSON.parse(m.readFileSync(REPORT, 'utf8')));
await page.evaluate((json) => { document.getElementById('importBox').value = json; },
  JSON.stringify({ tiles: { areaPlayer: full.tiles.areaPlayer } }));
await page.click('#doImport');
await new Promise(r => setTimeout(r, 900));
const res = await page.evaluate(async () => {
  const S = window.__treeInspect;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const { TileStore } = await import('/src/world/TileStore.ts');
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const raf = () => new Promise(r => requestAnimationFrame(r));
  // 导入区真实树（世界 2128,217 → store +2 偏移）；相机=导入模式中心
  const st = S.store;
  const apX = 2128 - 2128; void apX;
  const gx = 2128 - 4563 + 2, gy = 217 - 549 + 2;   // areaPlayer 原点来自报告
  const tx = gx; void tx;
  const setWind = (m) => { [...document.querySelectorAll('#windModes button')].find((b) => b.textContent.includes(m))?.click(); };
  setWind('静止');
  const out = [];
  for (let z = 0.5; z <= 3.0 + 1e-9; z += 0.05) {
    const zz = Math.round(z * 100) / 100;
    S.zoom = zz;
    for (let k = 0; k < 5; k++) await raf();
    const camRX = Math.round((st.w * 16 / 2) * zz) / zz;   // 导入模式 cam.x = 中心
    const camRY = Math.round(((gy + 1) * 16) * zz) / zz;
    let bgRows = 0, rowDetail = [];
    for (let dy = -3; dy <= 3; dy++) {
      const sx = Math.round((gx * 16 - camRX) * zz + cv.width / 2);
      const sy = Math.round(((gy + 1) * 16 + dy - camRY) * zz + cv.height / 2);
      if (sx < 0 || sy < 0 || sx + Math.round(16 * zz) >= cv.width || sy >= cv.height) continue;
      const d = ctx.getImageData(sx, sy, Math.round(16 * zz), 1).data;
      let op = 0, n = 0;
      for (let j = 3; j < d.length; j += 4) { n++; if (d[j] > 60) op++; }
      if (op / n < 0.55) { bgRows++; rowDetail.push(dy + ':' + (op / n).toFixed(1)); }
    }
    if (bgRows > 0) out.push({ z: zz, bgRows, rowDetail });
  }
  return out;
});
if (!res.length) console.log('✅ 0.5-3.0 全 51 档：交界带零背景行');
else for (const r of res) console.log(`×${r.z}: 背景行 ${r.bgRows} [${r.rowDetail.join(' ')}]`);
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
