import puppeteer from 'puppeteer-core';
// 同种子 A/B:地表水池+正午,jx=0/0.5 成对,输出条带图+行剖面
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1512, height: 982, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
for (let att = 0; att < 8; att++) { try { await page.goto(ORIGIN + '/?play=small' + (process.env.WQ || ''), { waitUntil: 'domcontentloaded', timeout: 60000 }); break; } catch { await new Promise(r => setTimeout(r, 2500)); } }
const r = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!window.__swGame?.player && Date.now() - t0 < 90000) await new Promise(r => setTimeout(r, 500));
  window.__swFlow.newWorld('seamtest2', 4200, 1200);
  const t1 = Date.now();
  while (Date.now() - t1 < 120000) { if (window.__swGame?.world?.w === 4200 && window.__swGame?.player) break; await new Promise(r2 => setTimeout(r2, 300)); }
  const g = window.__swGame, w = g.world, st2 = w.store;
  const gl2 = w.groundLevel;
  const c = w.clock; if (c && 'timeOfDay' in c) c.timeOfDay = 0.5;   // 正午
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  const liq = (x, y) => st2.liquid[st2.idx(x, y)] / 255;
  let best = null;
  for (let rad = 0; rad < 2000 && !best; rad++)
    for (let dy = -rad; dy <= rad && !best; dy++)
      for (let dx = -rad; dx <= rad && !best; dx++) {
        const x = px + dx, y = py + dy;
        if (x < 60 || x >= w.w - 60 || y < 60 || y >= w.h - 60) continue;
        if (y > gl2 + 16) continue;                      // ★限地表(放宽)
        if (liq(x, y) < 0.6 || liq(x, y - 1) > 0.05) continue;
        let wL = 0, wR = 0;
        while (wL < 120 && liq(x - wL - 1, y) > 0.6 && liq(x - wL - 1, y - 1) <= 0.05) wL++;
        while (wR < 120 && liq(x + wR + 1, y) > 0.6 && liq(x + wR + 1, y - 1) <= 0.05) wR++;
        if (wL + wR >= 30) best = { x0: x - wL, x1: x + wR, y };
      }
  if (!best) return { pool: null, gl: gl2, spawn: [px, py] };
    // ★250% 复现:记录 K 态(不强制降档,让数据说话)
    const wouldBeK = g.renderer.effectiveRenderScale();
  const out = { pool: best, combos: [] };
  const cv0 = g.renderer.canvas;
  for (const c2 of [{ jx: 0, jy: 0, tag: 'jx0' }, { jx: 0.5, jy: 0, tag: 'jx05' }, { jx: 0, jy: 0, tag: 'jx0b' }, { jx: 0.5, jy: 0, tag: 'jx05b' }]) {
    g.camera.zoomTarget = 2.5; g.camera.zoom = 2.5;
    g.player.noClip = true;
    let img = null, tries = 0;
    const cv = g.renderer.canvas, W = cv.width, H = cv.height, midY = Math.floor(H / 2);
    const ctx2 = cv.getContext('2d');
    // 重试:钉位→采样,断言条带含水线(上段亮/下段水蓝),失败重钉
    while (tries++ < 6) {
      g.player.x = (best.x0 + best.x1) / 2 * 16 + c2.jx; g.player.y = best.y * 16 - 46; g.player.vx = 0; g.player.vy = 0;
      await new Promise(r2 => setTimeout(r2, 380));
      img = ctx2.getImageData(0, midY - 90, W, 180);
      // 水线存在:某行起下半段显著蓝(b>g>r)
      let waterRows = 0;
      for (let y = 90; y < 176; y++) {
        let blue = 0;
        for (let x = Math.floor(W * 0.35); x < Math.floor(W * 0.65); x += 4) {
          const i = (y * W + x) * 4;
          if (img.data[i + 2] > img.data[i] && img.data[i + 2] > 60) blue++;
        }
        if (blue > 60) waterRows++;
      }
      if (waterRows > 30) break;
    }
    const rows = [];
    for (let y = 6; y < 174; y++) {
      let anom = 0, mean = 0;
      for (let x = Math.floor(W * 0.3); x < Math.floor(W * 0.7); x += 2) {
        const i = (y * W + x) * 4;
        const j = ((y - 3) * W + x) * 4, k = ((y + 3) * W + x) * 4;
        const lum = img.data[i] + img.data[i + 1] + img.data[i + 2];
        const nb = (img.data[j] + img.data[j + 1] + img.data[j + 2] + img.data[k] + img.data[k + 1] + img.data[k + 2]) / 2;
        mean += lum;
        if (lum > nb * 1.22 && lum - nb > 55) anom++;
      }
      rows.push({ y, m: +(mean / (W * 0.4)).toFixed(0), a: anom });
    }
    const shot = document.createElement('canvas');
    shot.width = W; shot.height = 180;
    shot.getContext('2d').putImageData(img, 0, 0);
    out.combos.push({ tag: c2.tag, hot: rows.filter(x => x.a > 80).sort((a, b) => b.a - a.a).slice(0, 3), url: shot.toDataURL('image/png'), worldLowK: g.renderer._worldLowK, wouldBeK });
  }
  g.player.noClip = false;
  return out;
});
console.log(JSON.stringify(r.combos.map(c => ({ tag: c.tag, hot: c.hot, worldLowK: c.worldLowK, wouldBeK: c.wouldBeK }))));
console.log('pool=' + JSON.stringify(r.pool));
if (!r.combos) { await browser.close(); process.exit(1); }
const fs = await import('node:fs');
for (const c of r.combos) fs.writeFileSync(`/tmp/wsab-${c.tag}.png`, Buffer.from(c.url.split(',')[1], 'base64'));
await browser.close();
