import puppeteer from 'puppeteer-core';
// 水线细缝三态分流:GL 扭曲 / F9 fullbright(跳过扭曲) / wwarp=0(canvas 路径)。
// 缝若三态均在 = 液体绘制本体(源矩形/设备分区);仅 GL 态有 = 扭曲层。
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1512, height: 982, deviceScaleFactor: 2 },
});
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const fs = await import('node:fs');

async function session(q, tag) {
  const page = await browser.newPage();
  for (let att = 0; att < 8; att++) {
    try { await page.goto(ORIGIN + '/?play=small' + q, { waitUntil: 'domcontentloaded', timeout: 60000 }); break; }
    catch { await new Promise(r => setTimeout(r, 2500)); }
  }
  const r = await page.evaluate(async () => {
    const t0 = Date.now();
    while (!window.__swGame?.player && Date.now() - t0 < 90000) await new Promise(res => setTimeout(res, 500));
    const g = window.__swGame, w = g.world, st2 = w.store;
    const gl2 = w.groundLevel;
    if (w.clock && 'timeOfDay' in w.clock) { try { w.clock.timeOfDay = 0.5; } catch {} }
    const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
    const liq = (x, y) => st2.liquid[st2.idx(x, y)] / 255;
    let best = null;
    for (let rad = 0; rad < 2000 && !best; rad++)
      for (let dy = -rad; dy <= rad && !best; dy++)
        for (let dx = -rad; dx <= rad && !best; dx++) {
          const x = px + dx, y = py + dy;
          if (x < 60 || x >= w.w - 60 || y < 60 || y >= w.h - 60) continue;
          if (y > gl2 + 16) continue;
          if (liq(x, y) < 0.6 || liq(x, y - 1) > 0.05) continue;
          let wL = 0, wR = 0;
          while (wL < 120 && liq(x - wL - 1, y) > 0.6 && liq(x - wL - 1, y - 1) <= 0.05) wL++;
          while (wR < 120 && liq(x + wR + 1, y) > 0.6 && liq(x + wR + 1, y - 1) <= 0.05) wR++;
          if (wL + wR >= 30) best = { x0: x - wL, x1: x + wR, y };
        }
    if (!best) return { pool: null };
    const out = { pool: best, modes: [] };
    const cv = g.renderer.canvas, W = cv.width, H = cv.height, midY = Math.floor(H / 2);
    const ctx2 = cv.getContext('2d');
    const capture = async (label) => {
      // 钉位+jx=0.5(复现条件),断言条带含水线,重试
      // ★noClip 字段不存在(2026-09-08 实锤):16ms 重钉位循环替代
      let tries = 0, img = null;
      const pin = setInterval(() => {
        g.player.x = (best.x0 + best.x1) / 2 * 16 + 0.5;
        g.player.y = best.y * 16 - 46;
        g.player.vx = 0; g.player.vy = 0;
      }, 16);
      try {
      while (tries++ < 6) {
        g.player.x = (best.x0 + best.x1) / 2 * 16 + 0.5;
        g.player.y = best.y * 16 - 46;
        g.player.vx = 0; g.player.vy = 0;
        await new Promise(res => setTimeout(res, 380));
        img = ctx2.getImageData(0, midY - 90, W, 180);
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
      const hot = rows.filter(x => x.a > 80).sort((a, b) => b.a - a.a).slice(0, 4);
      const shot = document.createElement('canvas');
      shot.width = W; shot.height = 180;
      shot.getContext('2d').putImageData(img, 0, 0);
      out.modes.push({ label, hot, url: shot.toDataURL('image/png') });
      } finally { clearInterval(pin); }
    };
    await capture('GL默认');
    g.renderer.fullbright = true;
    await new Promise(res => setTimeout(res, 120));
    await capture('fullbright(无扭曲)');
    g.renderer.fullbright = false;
    return out;
  });
  console.log(`[${tag}] pool=${JSON.stringify(r.pool)}`);
  let i = 0;
  for (const m of r.modes) {
    console.log(`  [${tag}] ${m.label} hot=${JSON.stringify(m.hot)}`);
    fs.writeFileSync(`/tmp/s3-${tag}-${i}.png`, Buffer.from(m.url.split(',')[1], 'base64'));
    i++;
  }
  await page.close();
}

await session('', 'GL默认');
await session('&wwarp=0', 'canvas路径');
await browser.close();
