// 一次性:极光带遮挡关系定谳——极光 GL 画布(无遮挡全貌) vs 主画布(最终合成)
// 同帧对比;顺带查 bg GL 层山体像素 alpha(半透明合成 bug 排查)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log('GAME NOT READY'); await browser.close(); process.exit(1); }

// 复用雪原落点逻辑(与 _aurora-snow-shot.mjs 相同)
const spot = await page.evaluate(async () => {
  const td = await import('/src/data/tiles.ts');
  const defs = td.TILE_DEFS;
  const snowIds = new Set();
  for (let id = 0; id < defs.length; id++) {
    const v = defs[id]?.vanilla?.sheet;
    if (v === 147 || v === 161) snowIds.add(id);
  }
  const g = window.__swGame;
  const w = g.world, st = w.store, p = g.player;
  const gy = w.groundLevel;
  const colSnow = [];
  for (let x = 10; x < st.w - 10; x++) {
    let n = 0;
    for (let y = Math.max(5, gy - 80); y < Math.min(st.h - 5, gy + 40); y++) {
      if (snowIds.has(st.type[st.idx(x, y)])) n++;
    }
    colSnow.push(n);
  }
  const cand = [];
  for (let x = 16; x < colSnow.length - 16; x++) {
    let s = 0;
    for (let k = -16; k <= 16; k++) s += colSnow[x + k];
    cand.push({ x, s });
  }
  cand.sort((a, b) => b.s - a.s);
  let ty = -1, bx = -1;
  for (const cd of cand.slice(0, 40)) {
    const cx = cd.x;
    for (let y = Math.max(4, gy - 100); y <= gy + 40; y++) {
      if (st.isSolid(cx, y)) {
        let open = true;
        for (let k = 1; k <= 6; k++) if (st.isSolid(cx, y - k)) { open = false; break; }
        if (open) { bx = cx; ty = y; }
        break;
      }
    }
    if (ty >= 0) break;
  }
  if (ty < 0) return { found: false };
  p.x = bx * 16 - p.w / 2;
  p.y = (ty - 3) * 16 - p.h;
  p.vx = 0; p.vy = 0;
  return { found: true, x: bx, y: ty };
});
await page.evaluate(() => {
  const c = window.__swGame.world.clock;
  if (typeof c.timeOfDay === 'number') c.timeOfDay = 0.9;
  if ('moonPhase' in c) { try { c.moonPhase = 0; } catch { /* noop */ } }
});
await new Promise((r) => setTimeout(r, 9000));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const aur = g.renderer.sky.aurora;
  const gl = aur.glAurora;
  if (!gl.canvas || gl.canvas.width === 0) return { err: 'gl canvas empty' };
  const rd = (src, w, h) => {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    c2.drawImage(src, 0, 0);
    return c2.getImageData(0, 0, w, h).data;
  };
  const W = gl.canvas.width, H = gl.canvas.height;
  const da = rd(gl.canvas, W, H);            // 极光全貌(无遮挡)
  // 行剖面:每行点亮像素数 → 判断带是连续帘还是散点
  const rowLit = new Array(H).fill(0);
  let lit = 0, minY = H, maxY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (da[i] + da[i + 1] + da[i + 2] > 24) { rowLit[y]++; lit++; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  }
  // 主画布同帧(缩小读,只统计带区亮度轮廓)
  const main = g.renderer.canvas;
  const dm = rd(main, main.width, main.height);
  // 极光行区间内,主画布同行点亮(>24 增亮)对比——被遮挡比例的粗测
  let mainLitSameRows = 0;
  for (let y = minY; y <= maxY; y += 2) {
    const my = Math.floor(y * main.height / H);
    for (let x = 0; x < W; x += 2) {
      const mx = Math.floor(x * main.width / W);
      const i = (my * main.width + mx) * 4;
      if (dm[i] + dm[i + 1] + dm[i + 2] > 24) mainLitSameRows++;
    }
  }
  // bg GL 层山体 alpha(半透明合成排查):取主画布中心山体区一像素的 alpha 无意义
  // (2D 合成后恒 255)——改查 glbg 画布是否存在及其 context 属性不可读,跳过,以
  // 极光行主画布保留率代替。
  const peakRows = rowLit.map((n, y) => ({ y, n })).sort((a, b) => b.n - a.n).slice(0, 5);
  return {
    lit, litPct: (lit * 100 / (W * H)).toFixed(1) + '%',
    bandRows: [minY, maxY],
    topRows: peakRows,
    mainRetainPct: (mainLitSameRows * 100 / Math.max(1, lit / 4)).toFixed(0) + '%',
    aurOpacity: aur.opacity, aurPhase: aur.phase,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
