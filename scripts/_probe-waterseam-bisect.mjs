import puppeteer from 'puppeteer-core';
// 水面直线缝终局 bisect:固定种子世界,三态(默认 wamp2 / wamp1 / wwarp=0)同世界对比。
// 时序中位数成像(40帧):波动波峰被抹除,钉在静水线的静态缝保留。
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1512, height: 982, deviceScaleFactor: 2 },
});
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const STATES = [
  { name: 'default-wamp2', q: '' },
  { name: 'wamp1-原版位移', q: '&wamp=1' },
  { name: 'wwarp0-canvas路径', q: '&wwarp=0' },
];
const results = [];
for (const st of STATES) {
  const page = await browser.newPage();
  let ok = null;
  for (let att = 0; att < 8 && !ok; att++) {
    try { await page.goto(`${ORIGIN}/?play=small${st.q}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); ok = 'yes'; }
    catch { await new Promise(r => setTimeout(r, 2500)); }
  }
  if (!ok) { await page.close(); continue; }
  const boot = await page.evaluate(async () => {
    const t0 = Date.now();
    while (!window.__swGame?.player && Date.now() - t0 < 90000) await new Promise(r => setTimeout(r, 500));
    try { window.__swFlow.newWorld('seamtest', 4200, 1200); } catch (e) { return 'newWorld fail:' + e.message; }
    const t1 = Date.now();
    while (Date.now() - t1 < 120000) {
      if (window.__swGame?.world?.w === 4200 && window.__swGame?.player) break;
      await new Promise(r => setTimeout(r, 300));
    }
    return window.__swGame?.world?.w === 4200 ? 'ok' : 'world switch timeout';
  });
  if (boot !== 'ok') { console.log(`[${st.name}] boot: ${boot}`); await page.close(); continue; }
  const r2 = await page.evaluate(async () => {
    const g = window.__swGame, w = g.world, st2 = w.store;
    const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
    const liq = (x, y) => st2.liquid[st2.idx(x, y)] / 255;
    let best = null;
    for (let rad = 0; rad < 1200 && !best; rad++) {
      for (let dy = -rad; dy <= rad && !best; dy++) {
        for (const dx of (Math.abs(dy) === rad ? range(-rad, rad) : [-rad, rad])) {
          const x = px + dx, y = py + dy;
          if (x < 60 || x >= w.w - 60 || y < 60 || y >= w.h - 60) continue;
          if (liq(x, y) < 0.6 || liq(x, y - 1) > 0.05) continue;
          let wL = 0, wR = 0;
          while (wL < 120 && liq(x - wL - 1, y) > 0.6 && liq(x - wL - 1, y - 1) <= 0.05) wL++;
          while (wR < 120 && liq(x + wR + 1, y) > 0.6 && liq(x + wR + 1, y - 1) <= 0.05) wR++;
          if (wL + wR >= 40) best = { x0: x - wL, x1: x + wR, y };
        }
      }
    }
    function range(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; }
    return best;
  });
  if (!r2) { console.log(`[${st.name}] no pool`); await page.close(); continue; }
  const out = await page.evaluate(async (POOL) => {
    const g = window.__swGame, r = g.renderer;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const cxw = (POOL.x0 + POOL.x1) / 2 * 16, cyw = POOL.y * 16;
    const cv = r.canvas, W = cv.width, H = cv.height, midY = Math.floor(H / 2);
    const res = [];
    for (const c of [{ z: 1.25, jx: 0, jy: 0 }, { z: 1.25, jx: 0.5, jy: 0 }, { z: 1.25, jx: 0, jy: 0.5 }, { z: 1, jx: 0.5, jy: 0 }, { z: 1.5, jx: 0.5, jy: 0 }]) {
      g.camera.zoomTarget = c.z; g.camera.zoom = c.z;
      g.player.noClip = true;
      g.player.x = cxw + c.jx; g.player.y = cyw - 40 + c.jy; g.player.vx = 0; g.player.vy = 0;
      await sleep(450);
      // 时序采样 36 帧
      const ctx2 = cv.getContext('2d');
      const frames = [];
      for (let k = 0; k < 36; k++) {
        await new Promise((res2) => requestAnimationFrame(res2));
        frames.push(ctx2.getImageData(0, midY - 40, W, 80).data.slice());
      }
      // 时序中位数
      const med = new Uint8ClampedArray(W * 80 * 4);
      const ch = new Float32Array(frames.length);
      for (let p = 0; p < W * 80 * 4; p++) {
        for (let k = 0; k < frames.length; k++) ch[k] = frames[k][p];
        const arr = ch.slice().sort();
        med[p] = arr[arr.length >> 1];
      }
      // 行剖面:水面亮行=中位亮度较上下邻行显著高且连续列数多
      const rows = [];
      for (let y = 8; y < 72; y++) {
        let anom = 0, mean = 0;
        for (let x = Math.floor(W * 0.3); x < Math.floor(W * 0.7); x += 2) {
          const i = (y * W + x) * 4;
          const j = ((y - 3) * W + x) * 4, k = ((y + 3) * W + x) * 4;
          const lum = med[i] + med[i + 1] + med[i + 2];
          const nb = (med[j] + med[j + 1] + med[j + 2] + med[k] + med[k + 1] + med[k + 2]) / 2;
          mean += lum;
          if (lum > nb * 1.25 && lum - nb > 60) anom++;
        }
        rows.push({ y, mean: +(mean / ((W * 0.4))).toFixed(0), anom });
      }
      const hot = rows.filter((x) => x.anom > 90).sort((a, b) => b.anom - a.anom).slice(0, 3);
      // 导出中位图条带
      const shot = document.createElement('canvas');
      shot.width = W; shot.height = 80;
      shot.getContext('2d').putImageData(new ImageData(med, W, 80), 0, 0);
      res.push({ combo: c, hot, dataURL: shot.toDataURL('image/png') });
      g.player.noClip = false;
    }
    return res;
  }, r2);
  console.log(`[${st.name}]`);
  let i = 0;
  const fs = await import('node:fs');
  for (const o of out) {
    console.log(`  ${JSON.stringify(o.combo)} hot=${JSON.stringify(o.hot)}`);
    fs.writeFileSync(`/tmp/ws-${st.name}-${i}.png`, Buffer.from(o.dataURL.split(',')[1], 'base64'));
    i++;
  }
  results.push({ name: st.name, out });
  await page.close();
}
await browser.close();
