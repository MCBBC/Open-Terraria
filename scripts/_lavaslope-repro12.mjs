// _lavaslope-repro12: 全自动浸润判定机(oracle)。
// 在用户世界泥穴岩浆湖区域:fullbright 截图 → 对视野内每个"活坡面/半砖×邻液"格,
// 按 1457 TileDrawing.DrawTile_LiquidBehindTile 原文规则算【期望液体可见区】,
// 与实际画布像素对勘 → 输出全部"应画未画"(露馅)与"不应画却画"的格。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const OUT = process.env.SW_OUT || join(HOME, '.claude/jobs/8405c930/tmp');
const MAP = needInput(join(DOWNLOADS, 'map-饥饿的庄园 (1).json'));

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 },
});
const p = await b.newPage();
let booted = false;
for (let attempt = 0; attempt < 3 && !booted; attempt++) {
  await p.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson).catch(() => false)) { booted = true; break; }
  }
}
if (!booted) { console.log('FAIL boot'); await b.close(); process.exit(1); }
await p.evaluate(async t => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
for (let i = 0; i < 240; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await p.evaluate(() => !!window.__swGame?.world?.store?.w).catch(() => false)) break;
}
await new Promise(r => setTimeout(r, 2000));
for (let i = 0; i < 10; i++) {
  const gone = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const ok = btns.find(x => /我已知晓|已知晓|OK|知道了/.test(x.textContent || ''));
    if (ok) { ok.click(); return false; }
    return true;
  }).catch(() => true);
  if (gone) break;
  await new Promise(r => setTimeout(r, 400));
}
await p.evaluate(() => {
  const g = window.__swGame;
  g.liquid.updateLiquid = () => {};
  g.world.clock.timeOfDay = 0.5;
  if (g.world.weather) { g.world.weather.windSpeedCurrent = 0; g.world.weather.windSpeedTarget = 0; g.world.weather.maxRaining = 0; }
  g.player.debugGod = true;
  g.player.hp = g.player.maxHp; g.player.dead = false;
});
// 目标区中心(泥穴岩浆湖),拉远相机
await p.evaluate(() => {
  const g = window.__swGame, pl = g.player;
  pl.x = 1420 * 16 - pl.w / 2; pl.y = (1080 - 10) * 16;
  pl.vx = 0; pl.vy = 0;
  try { g.setZoom(0.55); } catch (e) { g.camera.zoom = 0.55; }
});
await new Promise(r => setTimeout(r, 3000));
await p.bringToFront();
await new Promise(r => setTimeout(r, 800));
await p.screenshot({ path: `${OUT}/l12.png` });

const report = await p.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const cam = g.camera;
  const canvas = g.renderer.canvas;
  const W = canvas.width, H = canvas.height;
  const buf = document.createElement('canvas');
  buf.width = W; buf.height = H;
  const bctx = buf.getContext('2d', { willReadFrequently: true });
  bctx.drawImage(canvas, 0, 0);
  const img = bctx.getImageData(0, 0, W, H).data;
  const z = cam.zoom, cx = cam.x, cy = cam.y;
  // CSS 尺寸 vs 画布尺寸(可能 dpr 缩放)——用画布坐标
  const dpr = W / canvas.clientWidth;
  const zEff = z * dpr;
  const sample = (wx, wy) => {
    const a = Math.round((wx - cx) * zEff + W / 2);
    const bb = Math.round((wy - cy) * zEff + H / 2);
    if (a < 0 || bb < 0 || a >= W || bb >= H) return null;
    const k = (bb * W + a) * 4;
    return [img[k], img[k + 1], img[k + 2]];
  };
  const isLavaPx = q => !!q && q[0] > 120 && q[0] > q[2] + 40 && q[1] < q[0] * 0.75;
  const isWaterPx = q => !!q && q[2] > q[0] + 15 && q[2] > 35;
  // 视野 tile 界
  const hw = W / 2 / zEff, hh = H / 2 / zEff;
  const x0 = Math.max(1, Math.floor(cx - hw) - 1), x1 = Math.min(st.w - 2, Math.ceil(cx + hw) + 1);
  const y0 = Math.max(1, Math.floor(cy - hh) - 1), y1 = Math.min(st.h - 2, Math.ceil(cy + hh) + 1);
  // 缺角三角形内采样点(slope 语义: solid 集合)
  // solid: s1={y>=x} s2={y>=16-x} s3={y<=x} s4={y<=16-x}; 缺角=补集
  const triPts = sl => sl === 1 ? [[12, 3], [14, 5], [10, 2], [13, 7]]
    : sl === 2 ? [[3, 3], [5, 5], [2, 2], [7, 7]]  // 注意 s2 缺左上
    : sl === 3 ? [[3, 12], [5, 14], [2, 10], [7, 13]]
    : [[12, 12], [14, 10], [10, 14], [13, 9]];
  const flagged = [];
  let checked = 0;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const sl = st.slope[i], hf = st.half[i];
      if (!sl && !hf) continue;
      const L = st.liquid[st.idx(x - 1, y)], R = st.liquid[st.idx(x + 1, y)];
      const U = st.liquid[st.idx(x, y - 1)], D = st.liquid[st.idx(x, y + 1)];
      const SLT = st.liquidType[st.idx(x - 1, y)], RLT = st.liquidType[st.idx(x + 1, y)];
      const ULT = st.liquidType[st.idx(x, y - 1)], DLT = st.liquidType[st.idx(x, y + 1)];
      const self = st.liquid[i];
      // vanilla 旗(:3967-:4053)
      const fL = L > 0 && !(sl === 1 || sl === 3);
      const fR = R > 0 && !(sl === 2 || sl === 4);
      const fU = U > 0 && !(sl === 3 || sl === 4);
      const fD = D > 240 && !(sl === 1 || sl === 2);
      const num4 = sl ? sl : (hf ? 1 : 0);
      const f5 = self > 0 && num4 !== 0 && (num4 !== 1 || self > 160);
      if (!fL && !fR && !fU && !fD && !f5) continue;
      checked++;
      // 期望矩形(:4069-:4123) + alpha(:4126-:4151)
      let maxLq = 0, lt = 0;
      const side = (amt, t) => { if (amt > maxLq) { maxLq = amt; lt = t; } };
      if (f5) side(self, st.liquidType[i] || 1);
      if (fL) side(L, SLT || 1); if (fR) side(R, RLT || 1);
      if (fU) side(U, ULT || 1); if (fD) side(D, DLT || 1);
      const ltV = lt === 2 ? 1 : lt === 3 ? 2 : lt === 4 ? 3 : 0;  // 原版 LiquidType
      let rx = 0, ry = 4, rw = 16, rh = 16, px = 0, py = 0;        // 相对格原点
      const fD2 = fD, fU2 = fU, fL2 = fL, fR2 = fR;
      let flL = fL2, flR = fR2;
      if (fD2 && (flL || flR)) { flL = true; flR = true; }
      if (!(!fU2 || !(flL || flR)) && !(fD2 && fU2)) { /* 默认矩形 */ }
      else {
        if (fU2) { rh = 4; if (hf || sl !== 0) rh = 12; }
        else if (fD2 && !flL && !flR) { py = 12; rh = 4; }
        else {
          const num14 = Math.floor((256 - maxLq) / 32) * 2;
          if (sl !== 0) { py = num14; ry = num14; rh = 16 - num14; }
          else if ((flL && flR) || hf) { py = num14; ry = ry; rh = 16 - num14; }
          else if (flL) { py = num14; rw = 4; rh = 16 - num14; }
          else { px = 12; py = num14; rw = 4; rh = 16 - num14; }
        }
      }
      // 期望可见采样点 = 缺角三角(slope)或带区(half) ∩ 矩形
      let pts;
      if (sl) {
        pts = triPts(sl).filter(([qx, qy]) => qx >= px && qx < px + rw && qy >= py && qy < py + rh);
      } else {
        // 半砖:实心=下半,可见=上半(y<8);采样上带
        pts = [[6, 2], [10, 2], [3, 5], [13, 5]].filter(([qx, qy]) => qy < 8 && qx >= px && qx < px + rw && qy >= py && qy < py + rh);
      }
      if (!pts.length) continue;
      let hit = 0;
      for (const [qx, qy] of pts) {
        const q = sample(x * 16 + qx, y * 16 + qy);
        if (ltV === 1 ? isLavaPx(q) : ltV === 0 ? isWaterPx(q) : false) hit++;
      }
      if (hit === 0) {
        flagged.push({ x, y, sl, hf, L, R, U, D, self, ltRaw: lt, wall: st.wall[i],
          rect: [rx + px, ry + py, rw, rh], samples: pts.map(([qx, qy]) => sample(x * 16 + qx, y * 16 + qy)) });
      }
    }
  }
  return { checked, flagged, cam: { cx, cy, z, W, H } };
});
console.log('检查格数:', report.checked, ' 露馅格数:', report.flagged.length);
const byLt = {};
for (const f of report.flagged) {
  const k = f.ltRaw === 2 ? 'lava' : f.ltRaw === 1 ? 'water' : `lt${f.ltRaw}`;
  byLt[k] = (byLt[k] || 0) + 1;
}
console.log('按液体类型:', JSON.stringify(byLt));
const show = report.flagged.slice(0, 30);
for (const f of show) {
  console.log(` (${f.x},${f.y}) sl=${f.sl} hf=${f.hf} t邻液 L=${f.L} R=${f.R} U=${f.U} D=${f.D} self=${f.self} lt=${f.ltRaw} wall=${f.wall} samples=${JSON.stringify(f.samples)}`);
}
await b.close();
process.exit(0);
