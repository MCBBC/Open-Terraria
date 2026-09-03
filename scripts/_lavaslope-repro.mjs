// _lavaslope-repro: 用户实报"岩浆斜坡透明区没做浸润渲染露馅,水不会"。
// 搭水/岩浆双池 A/B:左岸都是 slope1 阶梯(复刻截图岸形),液面与坡顶齐平。
// fullbright 截图 + 岸区 ASCII 颜色分类图(水蓝/岩浆红/固体/背景),并 dump 坡面格 store 态。
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
await new Promise(r => setTimeout(r, 2000));

const rig = await p.evaluate(() => {
  const g = window.__swGame, w = g.world, st = w.store;
  g.world.clock.timeOfDay = 0.5;
  if (w.weather) { w.weather.windSpeedCurrent = 0; w.weather.windSpeedTarget = 0; w.weather.maxRaining = 0; }
  const sx = w.spawnX, sy = w.spawnY;
  // 找 spawn 附近地表:第一行实心
  let gy = 0;
  for (let y = Math.max(5, sy - 80); y < st.h - 10; y++) {
    if (st.isSolid(sx, y)) { gy = y; break; }
  }
  const X0 = sx + 8;   // rig 原点(水池左岸台阶基座)
  const STONE = 1;
  // 1) 清场 + 石台:x=X0-8..X0+24, y=gy-8..gy+10
  for (let x = X0 - 8; x <= X0 + 24; x++) {
    for (let y = gy - 8; y <= gy + 10; y++) st.setTile(x, y, 0);
  }
  // 2) 基底地形:整片从 gy+5 起实心(池底)
  for (let x = X0 - 8; x <= X0 + 24; x++) {
    for (let y = gy + 5; y <= gy + 10; y++) st.setTile(x, y, STONE);
  }
  // 3) 左岸台阶(水池):列 X0-3 顶 gy-2 / X0-2 顶 gy-1 / X0-1 顶 gy,顶部锤 slope1(缺右上)
  const stairL = [];
  for (const [dx, top] of [[-3, gy - 2], [-2, gy - 1], [-1, gy]]) {
    for (let y = top; y <= gy + 10; y++) st.setTile(X0 + dx, y, STONE);
    st.setSlope(X0 + dx, top, 1);
    stairL.push({ x: X0 + dx, y: top });
  }
  // 4) 水池 x=X0..X0+5,行 gy..gy+4 灌水 255;右壁 X0+6 从 gy-1 实心(垂直岸对照)
  for (let x = X0; x <= X0 + 5; x++) {
    for (let y = gy; y <= gy + 4; y++) {
      const i = st.idx(x, y);
      st.liquid[i] = 255; st.liquidType[i] = 1;
    }
  }
  for (let y = gy - 1; y <= gy + 10; y++) st.setTile(X0 + 6, y, STONE);
  // 5) 中央石柱 X0+7..X0+9:右缘就是岩浆池左岸台阶(列 X0+8 顶 gy-2 / X0+9 顶 gy-1 / X0+10 顶 gy,均 slope1)
  for (let y = gy - 3; y <= gy + 10; y++) st.setTile(X0 + 7, y, STONE);
  const stairR = [];
  for (const [dx, top] of [[8, gy - 2], [9, gy - 1], [10, gy]]) {
    for (let y = top; y <= gy + 10; y++) st.setTile(X0 + dx, y, STONE);
    st.setSlope(X0 + dx, top, 1);
    stairR.push({ x: X0 + dx, y: top });
  }
  // 6) 岩浆池 x=X0+11..X0+16,行 gy..gy+4 灌岩浆 255;右壁 X0+17 从 gy-1 实心
  for (let x = X0 + 11; x <= X0 + 16; x++) {
    for (let y = gy; y <= gy + 4; y++) {
      const i = st.idx(x, y);
      st.liquid[i] = 255; st.liquidType[i] = 2;
    }
  }
  for (let y = gy - 1; y <= gy + 10; y++) st.setTile(X0 + 17, y, STONE);
  g.liquid.updateLiquid = () => {};   // 冻结液面
  // 玩家钉在石柱顶上看全貌
  const pl = g.player;
  pl.x = (X0 + 8) * 16 - pl.w / 2; pl.y = (gy - 4) * 16;
  pl.vx = 0; pl.vy = 0;
  // dump 岸区 store 态
  const dump = [];
  for (let x = X0 - 2; x <= X0 + 13; x++) {
    for (let y = gy - 3; y <= gy + 2; y++) {
      const i = st.idx(x, y);
      dump.push({ x, y, t: st.type[i], f: st.flags[i], slope: st.slope[i], half: st.half[i],
        liq: st.liquid[i], lt: st.liquidType[i], wall: st.wall[i] });
    }
  }
  return { X0, gy, stairL, stairR, dump };
});
if (!rig) { console.log('FAIL rig'); await b.close(); process.exit(1); }
console.log('rig:', JSON.stringify({ X0: rig.X0, gy: rig.gy, stairL: rig.stairL, stairR: rig.stairR }));
await new Promise(r => setTimeout(r, 2500));
await p.bringToFront();
await new Promise(r => setTimeout(r, 1200));
await p.screenshot({ path: `${OUT}/lavaslope-normal.png` });
await p.evaluate(() => { window.__swGame.renderer.fullbright = true; });
await new Promise(r => setTimeout(r, 600));
await p.screenshot({ path: `${OUT}/lavaslope-bright.png` });
const cam = await p.evaluate(() => {
  const g = window.__swGame;
  return { cx: g.camera.x, cy: g.camera.y, z: g.camera.zoom, W: g.renderer.canvas.width, H: g.renderer.canvas.height };
});
console.log('cam:', JSON.stringify(cam));
console.log('pageerrors:', JSON.stringify(errs));

// ---- ASCII 颜色分类图(岸区):按世界格细分 4×4 子格,分类 水/岩浆/亮固/暗背景 ----
const { execSync } = await import('node:child_process');
execSync(`python3 - << 'PYEOF'
from PIL import Image
import json
cam = ${JSON.stringify(cam)}
X0, gy = ${rig.X0}, ${rig.gy}
img = Image.open('${OUT}/lavaslope-bright.png').convert('RGB')
W, H = img.size
px = img.load()
def w2s(wx, wy):
    return (wx - cam['cx']) * cam['z'] + W/2, (wy - cam['cy']) * cam['z'] + H/2
def cls(r, g, bl):
    if r > 140 and g < 110 and bl < 90 and r - bl > 60: return 'L'   # lava
    if bl > r + 20 and bl > 40: return 'W'                            # water
    lum = 0.299*r + 0.587*g + 0.114*bl
    if lum > 110: return '#'                                          # solid lit
    if lum > 55: return '+'                                           # solid dim
    return '.'                                                        # dark/bg
print('shore ASCII (每字符=4世界px; 水池左岸 x=X0-2..X0+3, 岩浆池左岸 x=X0+8..X0+13; y=gy-4..gy+3)')
for tag, x_lo in (('WATER', -2), ('LAVA', 8)):
    print(f'-- {tag} pool left shore (cols x=X0{x_lo:+d} .. X0{x_lo+5:+d}, 行 y=gy-4..gy+3, 列内 4 子格)')
    header = '     '
    for x in range(x_lo, x_lo + 6):
        header += f'{x:+d}'.rjust(8)
    print(header)
    for y in range(gy - 4, gy + 4):
        row = f'y{y - gy:+d}: '
        for x in range(x_lo, x_lo + 6):
            seg = ''
            for sx in range(4):
                wx = (X0 + x) * 16 + sx * 4 + 2
                wy = y * 16 + 2
                a, b_ = w2s(wx, wy)
                ia, ib = int(a), int(b_)
                if 0 <= ia < W and 0 <= ib < H:
                    seg += cls(*px[ia, ib])
                else:
                    seg += '?'
            row += seg + ' '
        print(row)
print()
print('pool surface cols ASCII (池中某列垂直剖面 x=X0+3 水 / X0+14 岩浆, y=gy-2..gy+1)')
for tag, x in (('WATER', 3), ('LAVA', 14)):
    col = f'{tag} x=X0{x:+d}: '
    for y in range(gy - 2, gy + 2):
        for sy in range(4):
            wx = (X0 + x) * 16 + 8
            wy = y * 16 + sy * 4 + 2
            a, b_ = w2s(wx, wy)
            ia, ib = int(a), int(b_)
            col += cls(*px[ia, ib]) if (0 <= ia < W and 0 <= ib < H) else '?'
    print(col)
PYEOF`, { stdio: 'inherit' });
await b.close();
process.exit(errs.length ? 1 : 0);
