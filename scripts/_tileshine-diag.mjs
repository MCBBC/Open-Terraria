// 诊断:tileShine delta 幅值/对齐逐像素测——ORE 格 48×48 邻域 ON/OFF 像素级对比。
//  全程在页内累积 grab(免 evaluate 大参数),按 lightAt 中心归一(全局乘子/火把抖动消除)
//  后中位堆叠,输出:① 每像素比值直方图 ② 最小二乘幅值 k*(期望 1.6) ③ 最优平移
//  ④ 4×4 块增益图 ⑤ OFF 自洽。运行:
//  SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=500000 scripts/_tileshine-diag.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
await page.evaluate(async () => { await window.__swGame.newWorld('12345', 4200, 1200, () => {}); });
let ready = false;
for (let i = 0; i < 150 && !ready; i++) {
  ready = await page.evaluate(() => { const g = window.__swGame; return !!(g && g.world && g.world.store && g.world.store.w === 4200); }).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 2000));
}
console.log('world ready');

// 建暗室:4×4 铁矿(sheet 6,静态 ×1.6)+ 火把; Ore 中心格 = (cx-6, cy-3)
const spot = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const T = (k) => window.__swTiles[k];
  const ore = T('ore_iron'), stone = T('stone'), torch = T('torch');
  const gy = Math.floor(g.world.groundLevel) + 120;
  let cx = -1, cy = -1;
  outer: for (let x = 200; x < st.w - 220; x += 3) {
    for (let y = gy; y < Math.min(gy + 220, st.h - 20); y += 3) {
      if (st.inBounds(x + 20, y + 12) && st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] === stone) { cx = x; cy = y; break outer; }
    }
  }
  if (cx < 0) return { err: 'no spot' };
  for (let y = cy - 8; y <= cy + 3; y++) for (let x = cx - 9; x <= cx + 9; x++) st.setTileSilent(x, y, 0, 0, 0);
  for (let x = cx - 9; x <= cx + 9; x++) { st.setTileSilent(x, cy + 4, stone, 0, 0); st.setTileSilent(x, cy + 5, stone, 0, 0); }
  for (let y = cy - 4; y <= cy - 1; y++) for (let x = cx - 7; x <= cx - 4; x++) st.setTileSilent(x, y, ore, 0, 0);
  st.setTileSilent(cx - 4, cy + 2, torch, 0, 0);
  globalThis.__grabs = { off: [], on: [], off2: [] };
  return { cx, cy };
});
if (spot.err) { console.error(spot.err); await browser.close(); process.exit(1); }
console.log('spot:', JSON.stringify(spot));

await page.evaluate(([cx, cy]) => {
  const g = window.__swGame;
  g.player.x = cx * 16; g.player.y = (cy + 4) * 16 - 22;
  g.player.vy = 0; g.player.vx = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
}, [spot.cx, spot.cy]);
await new Promise((r) => setTimeout(r, 7000));
// 开灯(fullbright)测幅值:合成跳过乘光 → OFF=sprite / ON=sprite×1.6,零光照噪声。
// 比值统计只取 OFF 亮度 ∈[30,150] 的 texel(避 255 钳位)。
await page.evaluate(() => { window.__swGame.renderer.fullbright = true; });
await new Promise((r) => setTimeout(r, 900));

const grabState = async (tag) => {
  const r = await page.evaluate(([cx, cy, tg]) => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const c2 = cv.getContext('2d');
    const cam = g.camera; const z = cam.zoom ?? 1;
    const wx = (cx - 5.5) * 16, wy = (cy - 2.5) * 16;
    const sx = Math.round((wx - (cam.x - cv.width / 2 / z)) * z) - 24;
    const sy = Math.round((wy - (cam.y - cv.height / 2 / z)) * z) - 24;
    const d = c2.getImageData(sx, sy, 48, 48).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
    const light = g.renderer.lighting ? g.renderer.lighting.lightAt(cx - 6, cy - 3) : null;
    globalThis.__grabs[tg].push({ px, light });
    return px.length;
  }, [spot.cx, spot.cy, tag]).catch((e) => { console.log(tag, 'FAIL:', e.message); return -1; });
  return r;
};
const setState = async (v) => {
  await page.evaluate((vv) => { globalThis.__SW_SHINE_OFF = vv; }, v);
  await new Promise((r) => setTimeout(r, 900));
};
for (let k = 0; k < 5; k++) { await setState(true); await grabState('off'); }
for (let k = 0; k < 5; k++) { await setState(false); await grabState('on'); }
for (let k = 0; k < 3; k++) { await setState(true); await grabState('off2'); }

const res = await page.evaluate(() => {
  const N = 48;
  const lum = (p) => (p[0] + p[1] + p[2]) / 3;
  const normStack = (grabs) => {
    const acc = [];
    for (const g of grabs) {
      if (!g || !g.px || !g.px.length || !g.light) continue;
      const L = g.light;
      const m = [];
      for (let i = 0; i < g.px.length; i++) {
        m.push([g.px[i][0] * 255 / Math.max(1, L[0]), g.px[i][1] * 255 / Math.max(1, L[1]), g.px[i][2] * 255 / Math.max(1, L[2])]);
      }
      acc.push(m);
    }
    if (!acc.length) return null;
    const out = [];
    for (let i = 0; i < acc[0].length; i++) {
      const p = [0, 1, 2].map((c) => {
        const v = acc.map((m) => m[i][c]).sort((a, b) => a - b);
        return v[v.length >> 1];
      });
      out.push(p);
    }
    return out;
  };
  const G = globalThis.__grabs;
  const OFFn = normStack(G.off), ONn = normStack(G.on), OFF2n = normStack(G.off2);
  if (!OFFn || !ONn) return { err: 'norm empty', counts: [G.off.length, G.on.length, G.off2.length] };
  const hist = {};
  let boosted = 0, tot = 0;
  for (let y = 16; y < 32; y++) for (let x = 16; x < 32; x++) {
    const i = y * N + x;
    const l0 = lum(OFFn[i]), l1 = lum(ONn[i]);
    if (l0 >= 30 && l0 <= 150) { tot++; const k = Math.round((l1 / l0) * 20) / 20; hist[k] = (hist[k] || 0) + 1; if (l1 / l0 > 1.2) boosted++; }
  }
  let num = 0, den = 0;
  for (let y = 16; y < 32; y++) for (let x = 16; x < 32; x++) {
    const i = y * N + x; const l0 = lum(OFFn[i]), l1 = lum(ONn[i]);
    if (l0 >= 30 && l0 <= 150) { num += l1 * l0; den += l0 * l0; }
  }
  const kStar = num / den;
  let best = null;
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
    let ssd = 0, n = 0;
    for (let y = 8; y < 40; y++) for (let x = 8; x < 40; x++) {
      const i = y * N + x, j = (y + dy) * N + (x + dx);
      const l0 = lum(OFFn[j]) * kStar, l1 = lum(ONn[i]);
      if (l0 > 25) { ssd += (l1 - l0) * (l1 - l0); n++; }
    }
    if (n > 100 && (!best || ssd < best.ssd)) best = { dx, dy, ssd: Math.round(ssd), n };
  }
  const gain = [];
  for (let by = 0; by < 12; by++) {
    let row = '';
    for (let bx = 0; bx < 12; bx++) {
      let s0 = 0, s1 = 0, n = 0;
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) {
        const i = (by * 4 + yy) * N + bx * 4 + xx;
        const l0 = lum(OFFn[i]), l1 = lum(ONn[i]);
        if (l0 > 25) { s0 += l0; s1 += l1; n++; }
      }
      row += n < 6 ? ' ' : ('' + Math.min(9, Math.round((s1 / s0) * 10))).slice(-1);
    }
    gain.push(row);
  }
  let offSelf = null;
  if (OFF2n) {
    let n0 = 0, d0 = 0;
    for (let y = 16; y < 32; y++) for (let x = 16; x < 32; x++) {
      const i = y * N + x; const l0 = lum(OFFn[i]), l2 = lum(OFF2n[i]);
      if (l0 > 25) { n0 += l2 * l0; d0 += l0 * l0; }
    }
    offSelf = +(n0 / d0).toFixed(4);
  }
  return { hist, boosted, tot, kStar: +kStar.toFixed(4), best, gain, offSelf,
    counts: [G.off.length, G.on.length, G.off2.length] };
});
console.log('grab counts:', JSON.stringify(res.counts));
console.log('中心 16×16 每像素比值直方图:', JSON.stringify(res.hist));
console.log('boosted(>1.2):', res.boosted, '/', res.tot);
console.log('最小二乘幅值 k* =', res.kStar, '(期望 1.6)');
console.log('最优平移 =', JSON.stringify(res.best));
console.log('OFF 自洽 k =', res.offSelf);
console.log('4×4 块增益图(值=比值×10 个位,空=暗):');
for (const r of res.gain) console.log(' ', r);
console.log('pageerrors:', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();
