// 用户林区全树接缝扫描：导入 F5 报告 → 逐冠标记（含邻树重叠）× 无风微摆/强风
// × zoom 1.27（报告值）→ 全透明行/半透明线双检测。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const full = JSON.parse(readFileSync(process.env.REPORT ?? '/Users/vinlic/Downloads/debug-report-模型根基-2026-08-17T10-48-36-594Z.json', 'utf8'));
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
      const sx0 = Math.round((m.x * 16 + 0 - camRX) * z + cv.width / 2);   // 干真带：中心±8px
      for (let dy = -4; dy <= 6; dy++) {
        const sy = Math.round((B + dy - camRY) * z + cv.height / 2);
        if (sx0 < 0 || sy < 0 || sx0 + 16 * z >= cv.width || sy >= cv.height) continue;
        const d = ctx.getImageData(sx0, sy, Math.round(16 * z), 1).data;
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
  // 报告指定树（环境变量 TREES="4590,572;4585,573;4609,574"）优先
  const want = (process.env ? null : null), TREES = window.__TREES;
  void want;
  const targets = TREES ? TREES.split(';').map((s2) => s2.split(',').map(Number).map((v, k) => k ? v + 2 - 0 : v + 2))
    .map(([x, y]) => markers.find((m) => Math.abs(m.x - x) <= 2 && Math.abs(m.y - y) <= 2)) .filter(Boolean)
    : markers.slice(0, 6);
  // 1:1 像素剖面：静止 + 微摆（干带 ±10 世界px，行 B−3..B+3）
  const profile = async (m, mode) => {
    setWind(mode);
    S.tree = { x: m.x, markerY: m.y, grassY: m.y + 8, h: 6, pieces: [] };
    S.zoom = 1.25;
    for (let k = 0; k < 6; k++) await raf();
    const B = (m.y - 2 + 1) * 16;   // 导入区 markerY 含 +2 偏移 → 世界边界 = (markerY-2+1)*16
    const rows = [];
    const st2 = S.store;
    const camX = st2.w * 16 / 2;
    void camX;
    for (let dy = -3; dy <= 3; dy++) {
      let line = '';
      const wy = B + dy;
      const camY = (m.y - 2 + 1) * 16;
      const camRX = Math.round((S.store.w * 16 / 2) * 1.25) / 1.25;
      const camRY = Math.round(camY * 1.25) / 1.25;
      for (let wx = m.x * 16 - 12 + 0; wx < m.x * 16 + 12; wx += 1) {
        const sx = Math.round((wx - camRX) * 1.25 + cv.width / 2);
        const sy = Math.round((wy - camRY) * 1.25 + cv.height / 2);
        if (sx < 0 || sy < 0 || sx >= cv.width || sy >= cv.height) { line += '?'; continue; }
        const d = ctx.getImageData(sx, sy, 1, 1).data;
        line += d[3] < 60 ? '·' : (d[0] + d[1] + d[2]) / 3 > 175 ? '.' : (d[0] + d[1] + d[2]) / 3 > 110 ? '-' : (d[0] + d[1] + d[2]) / 3 > 50 ? '=' : '#';
      }
      rows.push(String(dy).padStart(3) + '|' + line);
    }
    return rows;
  };
  const profiles = [];
  for (const m of targets) {
    profiles.push({ x: m.x, y: m.y, still: await profile(m, '静止'), idle: await profile(m, '无风微摆') });
  }
  return { n: markers.length, out, profiles, targets: targets.map((m) => [m.x, m.y]) };
});
console.log('冠标记数:', res.n);
let anyBad = false;
for (const t of res.out) {
  if (t.idleBad || t.galeBad) { anyBad = true; console.log(`树@(${t.x},${t.y}): 无风坏帧=${t.idleBad} ${JSON.stringify(t.idleWorst)} 强风坏帧=${t.galeBad} ${JSON.stringify(t.galeWorst)}`); }
}
if (!anyBad) console.log('全部树 × 无风微摆/强风 × zoom1.27 DPR2：零坏帧');
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
