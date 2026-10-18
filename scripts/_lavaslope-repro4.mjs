// _lavaslope-repro4: 岸缘构型全矩阵——水/岩浆 A/B,地下(groundLevel 之下)+泥土墙背景。
// 每构型 3×3 格间隔,枚举:坡向(1/2)×邻接(右满液/右满+下满/仅下满/右 230 表面液/上满液)
// ×半砖两态。采样缺角三角形像素,水 vs 岩浆逐对出表。
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const OUT = process.env.SW_OUT || join(HOME, '.claude/jobs/8405c930/tmp');

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 },
});
const errs = [];
const p = await b.newPage();
p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
// 并行会话在途编辑会让模块瞬断,整页重试至多 3 轮
let booted = false;
for (let attempt = 0; attempt < 3 && !booted; attempt++) {
  await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => !!window.__swGame).catch(() => false)) { booted = true; break; }
  }
  if (!booted) console.log(`attempt ${attempt}: __swGame 未就绪,重载`);
}
if (!booted) { console.log('FAIL boot'); await b.close(); process.exit(1); }
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
  let gsurf = 0;
  for (let y = Math.max(5, sy - 80); y < st.h - 10; y++) {
    if (st.isSolid(sx, y)) { gsurf = y; break; }
  }
  const RY = gsurf + 60;          // 地下基线(groundLevel 之下)
  const X0 = sx + 6;
  const STONE = 1, DIRTWALL = 10;
  // 大清场(RY-6..RY+6) + 全区泥土墙
  for (let x = X0 - 4; x <= X0 + 80; x++)
    for (let y = RY - 6; y <= RY + 6; y++) st.setTile(x, y, 0);
  for (let x = X0 - 4; x <= X0 + 80; x++)
    for (let y = RY - 6; y <= RY + 6; y++) st.wall[st.idx(x, y)] = DIRTWALL;

  // 构型表:[key, slope(1/2), 邻液配置]
  //  r  = 右邻满液255; rb = 右满+下满; bo = 仅下满; rp = 右230(部分表面液);
  //  up = 上邻满液; hr = 半砖+右满; hs = 半砖+自持液200
  const cases = [
    ['r',  1, 'r'], ['r',  2, 'r'],
    ['rb', 1, 'rb'], ['rb', 2, 'rb'],
    ['bo', 1, 'bo'], ['bo', 2, 'bo'],
    ['rp', 1, 'rp'], ['rp', 2, 'rp'],
    ['up', 1, 'up'], ['up', 2, 'up'],
    ['hr', 1, 'hr'], ['hs', 1, 'hs'],
  ];
  const cells = [];
  let ci = 0;
  for (const vt of [1, 2]) {          // 1=水 2=岩浆(st.liquidType 语义)
    for (const [key, slope, cfg] of cases) {
      const ox = X0 + (ci % 10) * 4;  // 10 列 × 2 行
      const oy = RY + Math.floor(ci / 10) * 5;
      ci++;
      const cx2 = ox, cy2 = oy;       // 测试砖位
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) st.setTile(cx2 + dx, cy2 + dy, 0);
      // 放测试砖
      st.setTile(cx2, cy2, STONE);
      if (cfg === 'hr' || cfg === 'hs') st.setHalfBrick(cx2, cy2, true);
      else st.setSlope(cx2, cy2, slope);
      // 周边支撑(防止视觉悬空误读):测试砖下方给实心(除 bo/rb 下液)
      const liqAmt = (cfg === 'rp' ? 230 : 255);
      if (cfg === 'r' || cfg === 'rp' || cfg === 'hr') {
        st.setTile(cx2 - 1, cy2, STONE); st.setTile(cx2 - 1, cy2 + 1, STONE);
        st.setTile(cx2, cy2 + 1, STONE);
        const i = st.idx(cx2 + 1, cy2); st.liquid[i] = liqAmt; st.liquidType[i] = vt;
        st.setTile(cx2 + 1, cy2 + 1, STONE);
      } else if (cfg === 'rb') {
        const i = st.idx(cx2 + 1, cy2); st.liquid[i] = 255; st.liquidType[i] = vt;
        const j = st.idx(cx2, cy2 + 1); st.liquid[j] = 255; st.liquidType[j] = vt;
        const k = st.idx(cx2 + 1, cy2 + 1); st.liquid[k] = 255; st.liquidType[k] = vt;
      } else if (cfg === 'bo') {
        st.setTile(cx2 - 1, cy2, STONE); st.setTile(cx2 - 1, cy2 + 1, STONE);
        const j = st.idx(cx2, cy2 + 1); st.liquid[j] = 255; st.liquidType[j] = vt;
        const k = st.idx(cx2 + 1, cy2 + 1); st.liquid[k] = 255; st.liquidType[k] = vt;
        st.setTile(cx2 + 1, cy2, STONE);
      } else if (cfg === 'up') {
        st.setTile(cx2 - 1, cy2, STONE); st.setTile(cx2 - 1, cy2 + 1, STONE);
        st.setTile(cx2, cy2 + 1, STONE); st.setTile(cx2 + 1, cy2 + 1, STONE);
        st.setTile(cx2 + 1, cy2, STONE);
        const i = st.idx(cx2, cy2 - 1); st.liquid[i] = 255; st.liquidType[i] = vt;
      } else if (cfg === 'hs') {
        st.setTile(cx2 - 1, cy2, STONE); st.setTile(cx2 - 1, cy2 + 1, STONE);
        st.setTile(cx2, cy2 + 1, STONE); st.setTile(cx2 + 1, cy2 + 1, STONE);
        st.setTile(cx2 + 1, cy2, STONE);
        const i = st.idx(cx2, cy2); st.liquid[i] = 200; st.liquidType[i] = vt;
      }
      cells.push({ key, vt, slope: cfg === 'hr' || cfg === 'hs' ? 0 : slope, half: (cfg === 'hr' || cfg === 'hs') ? 1 : 0, x: cx2, y: cy2, cfg });
    }
  }
  g.liquid.updateLiquid = () => {};
  const pl = g.player;
  pl.x = (X0 + 20) * 16 - pl.w / 2; pl.y = (RY - 8) * 16;
  pl.vx = 0; pl.vy = 0;
  return { X0, RY, gsurf, groundLevel: w.groundLevel, cells };
});
console.log('rig:', JSON.stringify({ X0: rig.X0, RY: rig.RY, gsurf: rig.gsurf, gl: rig.groundLevel }));
await new Promise(r => setTimeout(r, 2500));
await p.bringToFront();
await new Promise(r => setTimeout(r, 1200));
await p.evaluate(() => { window.__swGame.renderer.fullbright = true; });
await new Promise(r => setTimeout(r, 600));
await p.screenshot({ path: `${OUT}/l4-bright.png` });
const cam = await p.evaluate(() => {
  const g = window.__swGame;
  return { cx: g.camera.x, cy: g.camera.y, z: g.camera.zoom, W: g.renderer.canvas.width, H: g.renderer.canvas.height };
});
console.log('cam:', JSON.stringify(cam));

// 逐格采样缺角区(测试砖内 3×3 采样点取"最像液体"的一个)+出表
const { execSync } = await import('node:child_process');
execSync(`python3 - << 'PYEOF'
from PIL import Image
img = Image.open('${OUT}/l4-bright.png').convert('RGB')
W, H = img.size
cx, cy, z = ${cam.cx}, ${cam.cy}, ${cam.z}
def s(wx, wy): return (int((wx - cx) * z + W/2), int((wy - cy) * z + H/2))
def px(wx, wy):
    a, b_ = s(wx, wy)
    if 0 <= a < W and 0 <= b_ < H: return img.getpixel((a, b_))
    return (0,0,0)
cells = ${JSON.stringify(rig.cells)}
def is_water(p): r,g,b = p; return b > r + 20 and b > 40
def is_lava(p): r,g,b = p; return r > 140 and g < 120 and b < 90 and r - b > 50
def is_liquid(p): return is_water(p) or is_lava(p)
print(f"{'cfg':<4}{'vt':<6}{'sl':<3} 三角区3×3采样 → 液体判定 (期望:除 bo=下缘条/hs=全宽带外均应有液)")
for c in cells:
    # 采样区:坡1 缺右上 → 偏右上 x∈[9..14],y∈[2..7];坡2 缺左上 → x∈[2..7];半砖 → 上半 y∈[1..6]
    if c['half']:
        pts = [(x, y) for x in (6, 8, 10) for y in (1, 3, 5)]
    elif c['slope'] == 1:
        pts = [(x, y) for x in (9, 12, 14) for y in (2, 4, 6)]
    else:
        pts = [(x, y) for x in (2, 4, 7) for y in (2, 4, 6)]
    samples = [px(c['x']*16+a, c['y']*16+b_) for a, b_ in pts]
    n_liq = sum(1 for sp in samples if is_liquid(sp))
    tag = 'WATER' if c['vt'] == 1 else 'LAVA'
    print(f"{c['cfg']:<4}{tag:<6}{c['slope']:<3} liq={n_liq}/9  samples={samples[:3]}...")
PYEOF`, { stdio: 'inherit' });
await b.close();
process.exit(errs.length ? 1 : 0);
