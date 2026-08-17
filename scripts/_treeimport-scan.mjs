// 用户林区全树接缝扫描：导入 F5 报告 → 逐冠标记（含邻树重叠）× 无风微摆/强风
// × zoom 1.27（报告值）→ 全透明行/半透明线双检测。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const full = JSON.parse(readFileSync('/Users/vinlic/Downloads/debug-report-模型根基-2026-08-17T10-48-36-594Z.json', 'utf8'));
const report = JSON.stringify({ tiles: { areaPlayer: full.tiles.areaPlayer } });
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/tree-inspect.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1500));
await page.evaluate((json) => { document.getElementById('importBox').value = json; }, report);
await page.click('#doImport');
await new Promise(r => setTimeout(r, 800));
const res = await page.evaluate(async () => {
  const S = window.__treeInspect;
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const raf = () => new Promise(r => requestAnimationFrame(r));
  const setWind = (mode) => {
    [...document.querySelectorAll('#windModes button')].find((b) => b.textContent.includes(mode))?.click();
  };
  // 修 zoom 1.27（点 ×2 再直写）
  S.zoom = 1.27;
  const z = 1.27;
  const st = S.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const TREE = TILE_BY_KEY['tree'];
  // 收导入区全部冠标记
  const markers = [];
  for (let y = 2; y < st.h - 2; y++) for (let x = 2; x < st.w - 2; x++) {
    const i = st.idx(x, y);
    if (st.type[i] === TREE && st.frameY[i] >= 198 && (st.frameX[i] === 22 || st.frameX[i] === 0)) markers.push({ x, y, fx: st.frameX[i] });
  }
  const scanTree = async (m, mode, frames) => {
    setWind(mode);
    S.tree = { x: m.x, markerY: m.y, grassY: m.y + 8, h: 6, pieces: [] };
    // 相机钉到该树（imported 模式下 render 用 boundaryY 定 cam.y）
    let bad = 0, worst = null;
    for (let f = 0; f < frames; f++) {
      for (let k = 0; k < 3; k++) await raf();
      const B = (m.y + 1) * 16;
      const camY = B;   // render 里 imported 分支 cam.y=boundaryY
      const camRY = Math.round(camY * z) / z;
      const camRX = Math.round((st.w * 16 / 2) * z) / z;
      const sx0 = Math.round((m.x * 16 - 2 - camRX) * z + cv.width / 2);
      for (let dy = -4; dy <= 6; dy++) {
        const sy = Math.round((B + dy - camRY) * z + cv.height / 2);
        if (sx0 < 0 || sy < 0 || sx0 + 26 >= cv.width || sy >= cv.height) continue;
        const d = ctx.getImageData(sx0, sy, 26, 1).data;
        let op = 0, semi = 0, n = 0;
        for (let j = 3; j < d.length; j += 4) { n++; if (d[j] > 200) op++; else if (d[j] > 10) semi++; }
        const isGap = op / n === 0;
        const isSemi = dy >= -2 && dy <= 3 && op / n < 0.6 && op + semi < 0.92;
        if (isGap || isSemi) { bad++; if (!worst) worst = { dy, op: +(op / n).toFixed(2), semi: +(semi / n).toFixed(2), gap: isGap }; break; }
      }
    }
    return { bad, worst };
  };
  const out = [];
  for (const m of markers) {
    const idle = await scanTree(m, '无风微摆', 16);
    const gale = await scanTree(m, '强风', 16);
    out.push({ x: m.x, y: m.y, idleBad: idle.bad, idleWorst: idle.worst, galeBad: gale.bad, galeWorst: gale.worst });
  }
  return { n: markers.length, out };
});
console.log('冠标记数:', res.n);
let anyBad = false;
for (const t of res.out) {
  if (t.idleBad || t.galeBad) { anyBad = true; console.log(`树@(${t.x},${t.y}): 无风坏帧=${t.idleBad} ${JSON.stringify(t.idleWorst)} 强风坏帧=${t.galeBad} ${JSON.stringify(t.galeWorst)}`); }
}
if (!anyBad) console.log('全部树 × 无风微摆/强风 × zoom1.27 DPR2：零坏帧');
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
