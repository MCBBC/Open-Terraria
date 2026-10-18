// _lavaslope-repro3: repro1 复跑 + 岸区 store 终态 dump + 三级台阶三角形像素采样。
// 目标:找出"水爬满三级台阶"的绘制来源与岩浆的对应状态。
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const OUT = process.env.SW_OUT || join(HOME, '.claude/jobs/8405c930/tmp');

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const errs = [];
const p = await b.newPage();
p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
for (let i = 0; i < 90; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break;
}
await p.evaluate(async () => { await window.__swGame.newWorld('12345', 4200, 1200, () => {}); });
for (let i = 0; i < 240; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await p.evaluate(() => window.__swGame?.world?.store?.liquid?.length > 0
    && window.__swGame?.world?.spawnX > 0).catch(() => false)) break;
}
await new Promise(r => setTimeout(r, 1500));
for (let i = 0; i < 10; i++) {
  const gone = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const ok = btns.find(b => /我已知晓|已知晓|OK|知道了/.test(b.textContent || ''));
    if (ok) { ok.click(); return false; }
    return true;
  }).catch(() => true);
  if (gone) break;
  await new Promise(r => setTimeout(r, 400));
}

const rig = await p.evaluate(() => {
  const g = window.__swGame, w = g.world, st = w.store;
  g.world.clock.timeOfDay = 0.5;
  if (w.weather) { w.weather.windSpeedCurrent = 0; w.weather.windSpeedTarget = 0; w.weather.maxRaining = 0; }
  const sx = w.spawnX, sy = w.spawnY;
  let gy = 0;
  for (let y = Math.max(5, sy - 80); y < st.h - 10; y++) {
    if (st.isSolid(sx, y)) { gy = y; break; }
  }
  const X0 = sx + 8;
  const STONE = 1;
  for (let x = X0 - 8; x <= X0 + 24; x++)
    for (let y = gy - 8; y <= gy + 10; y++) st.setTile(x, y, 0);
  for (let x = X0 - 8; x <= X0 + 24; x++)
    for (let y = gy + 5; y <= gy + 10; y++) st.setTile(x, y, STONE);
  const stairL = [];
  for (const [dx, top] of [[-3, gy - 2], [-2, gy - 1], [-1, gy]]) {
    for (let y = top; y <= gy + 10; y++) st.setTile(X0 + dx, y, STONE);
    st.setSlope(X0 + dx, top, 1);
    stairL.push({ x: X0 + dx, y: top });
  }
  for (let x = X0; x <= X0 + 5; x++)
    for (let y = gy; y <= gy + 4; y++) { const i = st.idx(x, y); st.liquid[i] = 255; st.liquidType[i] = 1; }
  for (let y = gy - 1; y <= gy + 10; y++) st.setTile(X0 + 6, y, STONE);
  for (let y = gy - 3; y <= gy + 10; y++) st.setTile(X0 + 7, y, STONE);
  const stairR = [];
  for (const [dx, top] of [[8, gy - 2], [9, gy - 1], [10, gy]]) {
    for (let y = top; y <= gy + 10; y++) st.setTile(X0 + dx, y, STONE);
    st.setSlope(X0 + dx, top, 1);
    stairR.push({ x: X0 + dx, y: top });
  }
  for (let x = X0 + 11; x <= X0 + 16; x++)
    for (let y = gy; y <= gy + 4; y++) { const i = st.idx(x, y); st.liquid[i] = 255; st.liquidType[i] = 2; }
  for (let y = gy - 1; y <= gy + 10; y++) st.setTile(X0 + 17, y, STONE);
  g.liquid.updateLiquid = () => {};
  const pl = g.player;
  pl.x = (X0 + 8) * 16 - pl.w / 2; pl.y = (gy - 4) * 16;
  pl.vx = 0; pl.vy = 0;
  return { X0, gy, stairL, stairR };
});
console.log('rig:', JSON.stringify(rig));
await new Promise(r => setTimeout(r, 2500));
await p.bringToFront();
await new Promise(r => setTimeout(r, 1200));
await p.evaluate(() => { window.__swGame.renderer.fullbright = true; });
await new Promise(r => setTimeout(r, 600));
await p.screenshot({ path: `${OUT}/l3-bright.png` });
const cam = await p.evaluate(() => {
  const g = window.__swGame;
  return { cx: g.camera.x, cy: g.camera.y, z: g.camera.zoom, W: g.renderer.canvas.width, H: g.renderer.canvas.height };
});
// 截图后 dump 终态(玩家可能把液踩动?已冻结,应无变化)
const dump = await p.evaluate((X0, gy) => {
  const st = window.__swGame.world.store;
  const rows = [];
  for (const [tag, bx] of [['WATER', X0 - 4], ['LAVA', X0 + 7]]) {
    for (let x = bx; x <= bx + 6; x++) {
      for (let y = gy - 4; y <= gy + 2; y++) {
        const i = st.idx(x, y);
        if (st.slope[i] || st.liquid[i] || st.half[i])
          rows.push({ tag, x, y, slope: st.slope[i], half: st.half[i], liq: st.liquid[i], lt: st.liquidType[i] });
      }
    }
  }
  return rows;
}, rig.X0, rig.gy);
console.log('store 终态(有 slope/half/liquid 的格):');
for (const r of dump) console.log(` ${r.tag} (${r.x},${r.y}) slope=${r.slope} half=${r.half} liq=${r.liq} lt=${r.lt}`);
console.log('cam:', JSON.stringify(cam));

// 像素采样:每级台阶 missing 三角中心(slope1: local(12,4)) + 斜边下沿(local(4,12) 应为固体)
const { execSync } = await import('node:child_process');
execSync(`python3 - << 'PYEOF'
from PIL import Image
img = Image.open('${OUT}/l3-bright.png').convert('RGB')
W, H = img.size
cx, cy, z = ${cam.cx}, ${cam.cy}, ${cam.z}
def s(wx, wy): return (int((wx - cx) * z + W/2), int((wy - cy) * z + H/2))
X0, gy = ${rig.X0}, ${rig.gy}
stairs = {'WATER': [(X0-3, gy-2), (X0-2, gy-1), (X0-1, gy)], 'LAVA': [(X0+8, gy-2), (X0+9, gy-1), (X0+10, gy)]}
for tag, st3 in stairs.items():
    print(tag, '台阶三角形采样(local(12,4)=缺角内 / local(4,12)=固体侧):')
    for tx, ty in st3:
        a = img.getpixel(s(tx*16+12, ty*16+4))
        c = img.getpixel(s(tx*16+4, ty*16+12))
        print(f'  ({tx},{ty}) 缺角={a} 固体={c}')
PYEOF`, { stdio: 'inherit' });
await b.close();
process.exit(errs.length ? 1 : 0);
