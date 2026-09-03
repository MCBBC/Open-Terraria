// _lavaslope-repro2: 复现变体——液面【低于】岸坡砖顶(用户截图形态:岩浆面在坡砖之下)。
// 水池/岩浆池 A/B,岸 = slope1 阶梯 3 级,池顶行留空(液面低一格)。含墙(地下形态)。
// 另测:slope 砖自持液(模拟自然沉降残留)两种形态。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const OUT = process.env.SW_OUT || '/Users/vinlic/.claude/jobs/8405c930/tmp';

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
  // 清场
  for (let x = X0 - 10; x <= X0 + 30; x++)
    for (let y = gy - 10; y <= gy + 12; y++) st.setTile(x, y, 0);
  // 池底
  for (let x = X0 - 10; x <= X0 + 30; x++)
    for (let y = gy + 5; y <= gy + 12; y++) st.setTile(x, y, STONE);

  const wallId = 10; // 泥土墙近似(地下形态)
  const buildPool = (ox, liquidType, surfaceTop) => {
    // 岸:slope1 阶梯 3 级,顶部分别在 gy-2/gy-1/gy;池 x=ox..ox+5
    for (const [dx, top] of [[-3, gy - 2], [-2, gy - 1], [-1, gy]]) {
      for (let y = top; y <= gy + 12; y++) st.setTile(ox + dx, y, STONE);
      st.setSlope(ox + dx, top, 1);
    }
    for (let x = ox; x <= ox + 5; x++) {
      for (let y = surfaceTop; y <= gy + 4; y++) {
        const i = st.idx(x, y);
        st.liquid[i] = 255; st.liquidType[i] = liquidType;
      }
    }
    // 右壁(垂直岸对照):顶 gy-1
    for (let y = gy - 1; y <= gy + 12; y++) st.setTile(ox + 6, y, STONE);
    // 墙:整片区域(除池内空间)布墙,模拟地下
    for (let x = ox - 4; x <= ox + 7; x++) {
      for (let y = gy - 4; y <= gy + 4; y++) {
        const i = st.idx(x, y);
        if (!st.flags[i]) st.wall[i] = wallId;   // 只给空格布墙(池内空间也有墙,原版地下常见)
      }
    }
    for (let x = ox; x <= ox + 5; x++)
      for (let y = surfaceTop; y <= gy + 4; y++) st.wall[st.idx(x, y)] = wallId;
  };
  // 池 A(水):液面从 surfaceTop=gy+1 起(顶行 gy 留空 → 液面低于岸坡砖顶一格)
  buildPool(X0, 1, gy + 1);
  // 隔离柱
  for (let y = gy - 4; y <= gy + 12; y++) { st.setTile(X0 + 8, y, STONE); st.setTile(X0 + 9, y, STONE); }
  // 池 B(岩浆):同构
  buildPool(X0 + 10, 2, gy + 1);
  // 池 C(岩浆,顶行留液 200 模拟自然沉降的部分表面格):x=X0+18..X0+23
  for (let x = X0 + 17; x <= X0 + 22; x++) {
    for (let y = gy + 1; y <= gy + 4; y++) {
      const i = st.idx(x, y);
      st.liquid[i] = 255; st.liquidType[i] = 2;
    }
    st.liquid[st.idx(x, gy)] = 200; st.liquidType[st.idx(x, gy)] = 2;
  }
  for (const [dx, top] of [[16, gy - 2], [17 - 1 + 0, gy - 1]]) { /* noop */ }
  // 池 C 左岸阶梯
  for (const [dx, top] of [[16, gy - 2], [17 - 1, gy - 1]]) {}
  for (const [dx, top] of [[16, gy - 2], [17, gy - 1]]) {}
  for (const [dx, top] of [[X0 + 15, gy - 2], [X0 + 16, gy - 1], [X0 + 17, gy]]) {
    for (let y = top; y <= gy + 12; y++) st.setTile(dx, y, STONE);
    st.setSlope(dx, top, 1);
  }
  for (let y = gy - 1; y <= gy + 12; y++) st.setTile(X0 + 23, y, STONE);
  for (let x = X0 + 11; x <= X0 + 24; x++)
    for (let y = gy - 4; y <= gy + 4; y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) st.wall[i] = wallId;
    }
  for (let x = X0 + 18; x <= X0 + 22; x++)
    for (let y = gy; y <= gy + 4; y++) st.wall[st.idx(x, y)] = wallId;

  g.liquid.updateLiquid = () => {};
  const pl = g.player;
  pl.x = (X0 + 9) * 16 - pl.w / 2; pl.y = (gy - 5) * 16;
  pl.vx = 0; pl.vy = 0;
  // dump 三个岸区的 slope 砖与邻格
  const dump = [];
  for (const [label, x0, x1] of [['water', X0 - 2, X0 + 1], ['lava', X0 + 8, X0 + 11], ['lavaC', X0 + 16, X0 + 19]]) {
    for (let x = x0; x <= x1; x++) {
      for (let y = gy - 3; y <= gy + 2; y++) {
        const i = st.idx(x, y);
        dump.push({ label, x, y, slope: st.slope[i], half: st.half[i], liq: st.liquid[i],
          lt: st.liquidType[i], wall: st.wall[i], solid: st.isSolid(x, y) });
      }
    }
  }
  return { X0, gy, dump };
});
if (!rig) { console.log('FAIL rig'); await b.close(); process.exit(1); }
console.log('rig:', JSON.stringify({ X0: rig.X0, gy: rig.gy }));
await new Promise(r => setTimeout(r, 2500));
await p.bringToFront();
await new Promise(r => setTimeout(r, 1200));
await p.evaluate(() => { window.__swGame.renderer.fullbright = true; });
await new Promise(r => setTimeout(r, 600));
await p.screenshot({ path: `${OUT}/lavaslope2-bright.png` });
const cam = await p.evaluate(() => {
  const g = window.__swGame;
  return { cx: g.camera.x, cy: g.camera.y, z: g.camera.zoom, W: g.renderer.canvas.width, H: g.renderer.canvas.height };
});
console.log('cam:', JSON.stringify(cam));
console.log('pageerrors:', JSON.stringify(errs));

// 三岸区放大裁剪
const { execSync } = await import('node:child_process');
execSync(`python3 - << 'PYEOF'
from PIL import Image
img = Image.open('${OUT}/lavaslope2-bright.png').convert('RGB')
W, H = img.size
cx, cy, z = ${cam.cx}, ${cam.cy}, ${cam.z}
X0, gy = ${rig.X0}, ${rig.gy}
def w2s(wx, wy): return ((wx - cx) * z + W/2, (wy - cy) * z + H/2)
def crop(x0t, y0t, x1t, y1t, name, scale=6):
    ax, ay = w2s(x0t*16, y0t*16)
    bx, by = w2s(x1t*16, y1t*16)
    box = (int(ax)-2, int(ay)-2, int(bx)+2, int(by)+2)
    c = img.crop(box)
    c = c.resize((c.width*scale, c.height*scale), Image.NEAREST)
    c.save('${OUT}/' + name + '.png')
    print(name, box)
crop(X0-3, gy-3, X0+2, gy+2, 'l2-shore-water')
crop(X0+7, gy-3, X0+12, gy+2, 'l2-shore-lava')
crop(X0+15, gy-3, X0+20, gy+2, 'l2-shore-lavaC')
PYEOF`, { stdio: 'inherit' });
await b.close();
process.exit(errs.length ? 1 : 0);
