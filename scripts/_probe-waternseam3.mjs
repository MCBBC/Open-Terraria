import puppeteer from 'puppeteer-core';
// 水面波浪直线缝复现探针:找地表水池→定相机→多(缩放,相机子像素)组合截图→
// 页内缝检测(水线附近逐行横向亮度异常)→输出缝位置/强度/状态。
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1512, height: 982, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
let ok = null;
for (let att = 0; att < 8 && !ok; att++) {
  try { await page.goto(ORIGIN + '/?play=small' + (process.env.WQ || ''), { waitUntil: 'domcontentloaded', timeout: 60000 }); ok = 'yes'; }
  catch { await new Promise(r => setTimeout(r, 2500)); }
}
if (!ok) { console.log('GAVE UP'); await browser.close(); process.exit(1); }
const boot = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!window.__swGame?.player && Date.now() - t0 < 90000) { await new Promise(r => setTimeout(r, 500)); }
  return !!window.__swGame?.player;
});
if (!boot) { console.log('no game'); await browser.close(); process.exit(1); }

// 找水池:世界 tile 扫描地表 liquid>=0.75 且上方为空气的格,取横向连续 ≥40 格的池
const pool = await page.evaluate(() => {
  const g = window.__swGame, w = g.world;
  const st = w.store;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  const liquidAt = (x, y) => st.liquid[st.idx(x, y)] / 255;
  let best = null;
  for (let r = 0; r < 1200 && !best; r++) {
    for (let dy = -r; dy <= r && !best; dy++) {
      for (const dx of (Math.abs(dy) === r ? range(-r, r) : [-r, r])) {
        const x = px + dx, y = py + dy;
        if (x < 60 || x >= w.w - 60 || y < 60 || y >= w.h - 60) continue;
        const l = liquidAt(x, y);
        if (l < 0.6) continue;
        const above = liquidAt(x, y - 1);
        if (above > 0.05) continue;
        // 横向延展
        let wL = 0, wR = 0;
        while (wL < 120) { const q = liquidAt(x - wL - 1, y); if (q > 0.6 && liquidAt(x - wL - 1, y - 1) <= 0.05) wL++; else break; }
        while (wR < 120) { const q = liquidAt(x + wR + 1, y); if (q > 0.6 && liquidAt(x + wR + 1, y - 1) <= 0.05) wR++; else break; }
        if (wL + wR >= 40) best = { x0: x - wL, x1: x + wR, y, width: wL + wR };
      }
    }
  }
  function range(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; }
  return best;
});
console.log('pool:', JSON.stringify(pool));
if (!pool) { await browser.close(); process.exit(1); }

// 传送玩家到池上方(相机跟随),多组合截图+缝检测
const shots = await page.evaluate(async (pool) => {
  const g = window.__swGame, r = g.renderer;
  const out = [];
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const cxw = (pool.x0 + pool.x1) / 2 * 16, cyw = pool.y * 16;
  const combos = [
    { z: 1.25, jx: 0, jy: 0 },
    { z: 1.25, jx: 0.5, jy: 0 },
    { z: 1.25, jx: 0, jy: 0.5 },
    { z: 1.25, jx: 0.5, jy: 0.5 },
    { z: 1, jx: 0, jy: 0 },
    { z: 1, jx: 0.5, jy: 0 },
    { z: 1.5, jx: 0.5, jy: 0 },
  ];
  for (const c of combos) {
    g.camera.zoomTarget = c.z;
    g.camera.zoom = c.z;
    g.player.noClip = true;                    // 免下落/溺水,悬停在池上方
    g.player.x = cxw + c.jx;
    g.player.y = cyw - 40 + c.jy;
    g.player.vx = 0; g.player.vy = 0;
    await sleep(500);                          // 等相机跟随+波相位
    // 画布中心必须是水色(蓝绿),否则相机没到位
    const cv = r.canvas;
    const ctx2 = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const mid = ctx2.getImageData(Math.floor(W / 2), Math.floor(H / 2) + 20, 1, 1).data;
    const watery = mid[1] > mid[0] && mid[2] >= mid[0];
    const img = ctx2.getImageData(0, 0, W, H);
    const d = img.data;
    const y0 = Math.floor(H / 2) - 70, y1 = Math.floor(H / 2) + 70;
    const rows = [];
    for (let y = y0; y <= y1; y++) {
      let sum = 0, cnt = 0, anom = 0;
      for (let x = Math.floor(W * 0.3); x < Math.floor(W * 0.7); x += 2) {
        const i = (y * W + x) * 4;
        const j = ((y - 3) * W + x) * 4, k = ((y + 3) * W + x) * 4;
        const lum = d[i] + d[i + 1] + d[i + 2];
        const nb = (d[j] + d[j + 1] + d[j + 2] + d[k] + d[k + 1] + d[k + 2]) / 2;
        sum += lum; cnt++;
        if (lum > nb * 1.3 && lum - nb > 80) anom++;
      }
      rows.push({ y, mean: +(sum / cnt).toFixed(1), anom });
    }
    const hot = rows.filter((x) => x.anom > 40).sort((a, b) => b.anom - a.anom).slice(0, 4);
    out.push({ combo: c, watery, hot });
    const shot = document.createElement('canvas');
    shot.width = W; shot.height = 150;
    shot.getContext('2d').drawImage(cv, 0, Math.floor(H / 2) - 75, W, 150, 0, 0, W, 150);
    out[out.length - 1].dataURL = shot.toDataURL('image/png');
    g.player.noClip = false;
  }
  return out;
}, pool);
for (const s of shots) {
  console.log(JSON.stringify({ combo: s.combo, waterWavesQ: s.waterWavesQ, warpMode: s.warpMode, hot: s.hot }));
}
fsWait(shots);
async function fsWait(shots) {
  const fs = await import('node:fs');
  let i = 0;
  for (const s of shots) {
    if (s.hot?.length) {
      fs.writeFileSync(`/tmp/waterseam-${i}.png`, Buffer.from(s.dataURL.split(',')[1], 'base64'));
      console.log(`saved /tmp/waterseam-${i}.png combo=${JSON.stringify(s.combo)}`);
    }
    i++;
  }
}
await browser.close();
