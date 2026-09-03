// _lavaslope-oracle: 对指定簇中心跑浸润 oracle(多簇循环)。
// 用法: SW_CLUSTERS="3664,1136;1200,1104;3376,1104;1744,464;1616,496"
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const OUT = process.env.SW_OUT || '/Users/vinlic/.claude/jobs/8405c930/tmp';
const MAP = '/Users/vinlic/Downloads/map-饥饿的庄园 (1).json';
const CLUSTERS = (process.env.SW_CLUSTERS || '3664,1136;1200,1104;3376,1104;2032,1136;1744,464;1616,496')
  .split(';').map(s => s.split(',').map(Number));

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
  g.renderer.fullbright = true;
  try { g.setZoom(0.5); } catch (e) { g.camera.zoom = 0.5; }
});

const oracleFn = () => {
  const g = window.__swGame, st = g.world.store;
  const cam = g.camera;
  const canvas = g.renderer.canvas;
  const W = canvas.width, H = canvas.height;
  const buf = document.createElement('canvas');
  buf.width = W; buf.height = H;
  const bctx = buf.getContext('2d', { willReadFrequently: true });
  bctx.drawImage(canvas, 0, 0);
  const img = bctx.getImageData(0, 0, W, H).data;
  const zEff = cam.zoom * (W / canvas.clientWidth);
  const cx = cam.x, cy = cam.y;
  const sample = (wx, wy) => {
    const a = Math.round((wx - cx) * zEff + W / 2);
    const bb = Math.round((wy - cy) * zEff + H / 2);
    if (a < 0 || bb < 0 || a >= W || bb >= H) return null;
    const k = (bb * W + a) * 4;
    return [img[k], img[k + 1], img[k + 2]];
  };
  const isLavaPx = q => !!q && q[0] > 120 && q[0] > q[2] + 40 && q[1] < q[0] * 0.8;
  const isWaterPx = q => !!q && q[2] > q[0] + 15 && q[2] > 35;
  // cam.x/y 是世界像素;x/y 循环变量是 tile 序号——先换算(此前直接用像素当 tile 序号 → 全程越界 0 检查)
  const hwT = W / 2 / zEff / 16, hhT = H / 2 / zEff / 16;
  const x0 = Math.max(1, Math.ceil(cx / 16 - hwT) - 1), x1 = Math.min(st.w - 2, Math.floor(cx / 16 + hwT) + 1);
  const y0 = Math.max(1, Math.ceil(cy / 16 - hhT) - 1), y1 = Math.min(st.h - 2, Math.floor(cy / 16 + hhT) + 1);
  const triPts = sl => sl === 1 ? [[12, 3], [14, 5], [10, 2], [13, 7]]
    : sl === 2 ? [[3, 3], [5, 5], [2, 2], [7, 7]]
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
      const fL = L > 0 && !(sl === 1 || sl === 3);
      const fR = R > 0 && !(sl === 2 || sl === 4);
      const fU = U > 0 && !(sl === 3 || sl === 4);
      const fD = D > 240 && !(sl === 1 || sl === 2);
      const num4 = sl ? sl : (hf ? 1 : 0);
      const f5 = self > 0 && num4 !== 0 && (num4 !== 1 || self > 160);
      if (!fL && !fR && !fU && !fD && !f5) continue;
      checked++;
      let maxLq = 0, lt = 0;
      const side = (amt, t) => { if (amt > maxLq) { maxLq = amt; lt = t; } };
      if (f5) side(self, st.liquidType[i] || 1);
      if (fL) side(L, SLT || 1); if (fR) side(R, RLT || 1);
      if (fU) side(U, ULT || 1); if (fD) side(D, DLT || 1);
      const ltV = lt === 2 ? 1 : lt === 3 ? 2 : lt === 4 ? 3 : 0;
      let rw = 16, rh = 16, px = 0, py = 0, ry = 4;
      let flL = fL, flR = fR;
      if (fD && (flL || flR)) { flL = true; flR = true; }
      if ((!fU || !(flL || flR)) && !(fD && fU)) {
        if (fU) { rh = 4; if (hf || sl !== 0) rh = 12; }
        else if (fD && !flL && !flR) { py = 12; rh = 4; }
        else {
          const num14 = Math.floor((256 - maxLq) / 32) * 2;
          if (sl !== 0) { py = num14; ry = num14; rh = 16 - num14; }
          else if ((flL && flR) || hf) { py = num14; rh = 16 - num14; }
          else if (flL) { py = num14; rw = 4; rh = 16 - num14; }
          else { px = 12; py = num14; rw = 4; rh = 16 - num14; }
        }
      }
      let pts;
      if (sl) {
        pts = triPts(sl).filter(([qx, qy]) => qx >= px && qx < px + rw && qy >= py && qy < py + rh);
      } else {
        pts = [[6, 2], [10, 2], [3, 5], [13, 5]].filter(([qx, qy]) => qy < 8 && qx >= px && qx < px + rw && qy >= py && qy < py + rh);
      }
      if (!pts.length) continue;
      let hit = 0, seen = 0;
      for (const [qx, qy] of pts) {
        const q = sample(x * 16 + qx, y * 16 + qy);
        if (q === null) continue;
        seen++;
        if (ltV === 1 ? isLavaPx(q) : ltV === 0 ? isWaterPx(q) : false) hit++;
      }
      if (seen === 0) continue;
      if (hit === 0) {
        flagged.push({ x, y, sl, hf, L, R, U, D, self, lt, wall: st.wall[i], t: st.type[i],
          samples: pts.map(([qx, qy]) => sample(x * 16 + qx, y * 16 + qy)) });
      }
    }
  }
  return { checked, flagged };
};

for (const [ccx, ccy] of CLUSTERS) {
  await p.evaluate(({ x, y }) => {
    const g = window.__swGame, pl = g.player;
    pl.hp = pl.maxHp; pl.dead = false;
    pl.x = x * 16 - pl.w / 2; pl.y = (y - 12) * 16;
    pl.vx = 0; pl.vy = 0;
  }, { x: ccx, y: ccy });
  await new Promise(r => setTimeout(r, 2600));
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 600));
  await p.screenshot({ path: `${OUT}/lo-${ccx}-${ccy}.png` });
  const rep = await p.evaluate(oracleFn);
  const byLt = {};
  for (const f of rep.flagged) {
    const k = f.lt === 2 ? 'lava' : f.lt === 1 ? 'water' : f.lt === 3 ? 'honey' : `lt${f.lt}`;
    byLt[k] = (byLt[k] || 0) + 1;
  }
  console.log(`== cluster (${ccx},${ccy}) checked=${rep.checked} flagged=${rep.flagged.length} byType=${JSON.stringify(byLt)}`);
  for (const f of rep.flagged.slice(0, 12)) {
    console.log(`  (${f.x},${f.y}) sl=${f.sl} hf=${f.hf} t=${f.t} L=${f.L} R=${f.R} U=${f.U} D=${f.D} self=${f.self} lt=${f.lt} wall=${f.wall} px=${JSON.stringify(f.samples)}`);
  }
}
await b.close();
process.exit(0);
