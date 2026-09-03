// _lavaslope-repro14: 深地下(groundLevel 之下)泥/土 半砖+坡面 × 邻液全包 构型,近距离截图。
// 复刻用户世界 oracle 标记格的精确条件: t=25 mud, hf=1, L=R=U=255 lava, wall=0。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const OUT = process.env.SW_OUT || '/Users/vinlic/.claude/jobs/8405c930/tmp';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 },
});
const p = await b.newPage();
let booted = false;
for (let attempt = 0; attempt < 3 && !booted; attempt++) {
  await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => !!window.__swGame).catch(() => false)) { booted = true; break; }
  }
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
    const ok = btns.find(x => /我已知晓|已知晓|OK|知道了/.test(x.textContent || ''));
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
  for (let y = Math.max(5, sy - 80); y < st.h - 10; y++) if (st.isSolid(sx, y)) { gsurf = y; break; }
  const RY = w.groundLevel + 80;   // 深地下
  const X0 = sx + 6;
  const STONE = 1, MUD = 25;
  for (let x = X0 - 4; x <= X0 + 60; x++)
    for (let y = RY - 5; y <= RY + 5; y++) st.setTile(x, y, 0);

  // 六个测试格,间隔 3 格: [材质, 形态] 形态: hf 半砖 / s1 slope1 / s2 slope2
  const cases = [
    ['mud-hf', MUD, 'hf'], ['stone-hf', STONE, 'hf'],
    ['mud-s1', MUD, 's1'], ['stone-s1', STONE, 's1'],
    ['mud-s2', MUD, 's2'], ['stone-s2', STONE, 's2'],
  ];
  const cells = [];
  cases.forEach(([key, tile, shape], i) => {
    const x = X0 + i * 3, y = RY;
    st.setTile(x, y, tile);
    if (shape === 'hf') st.setHalfBrick(x, y, true); else st.setSlope(x, y, shape === 's1' ? 1 : 2);
    // 邻液: 左/右/上 全 255,类型按 i 奇偶水/岩浆
    const lt = i % 2 === 0 ? 2 : 1;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) {
      const j = st.idx(x + dx, y + dy);
      st.liquid[j] = 255; st.liquidType[j] = lt;
    }
    cells.push({ key, x, y, lt });
  });
  g.liquid.updateLiquid = () => {};
  const pl = g.player;
  pl.x = (X0 + 8) * 16 - pl.w / 2; pl.y = (RY - 3) * 16;
  pl.vx = 0; pl.vy = 0;
  return { X0, RY, gl: w.groundLevel, cells };
});
console.log('rig:', JSON.stringify(rig));
await new Promise(r => setTimeout(r, 2500));
await p.bringToFront();
await new Promise(r => setTimeout(r, 600));
await p.evaluate(() => { window.__swGame.renderer.fullbright = true; });
await new Promise(r => setTimeout(r, 600));
await p.screenshot({ path: `${OUT}/l14.png` });
const cam = await p.evaluate(() => {
  const g = window.__swGame;
  return { cx: g.camera.x, cy: g.camera.y, z: g.camera.zoom, W: g.renderer.canvas.width, H: g.renderer.canvas.height };
});
console.log('cam:', JSON.stringify(cam));
const { execSync } = await import('node:child_process');
execSync(`python3 - << 'PYEOF'
from PIL import Image
img = Image.open('${OUT}/l14.png').convert('RGB')
W, H = img.size
cx, cy, z = ${cam.cx}, ${cam.cy}, ${cam.z}
def w2s(wx, wy): return ((wx - cx) * z + W/2, (wy - cy) * z + H/2)
cells = ${JSON.stringify(rig.cells)}
row = []
for c in cells:
    ax, ay = w2s(c['x']*16 - 8, c['y']*16 - 16)
    bx, by = w2s(c['x']*16 + 24, c['y']*16 + 24)
    row.append((c['key'], (int(ax), int(ay), int(bx), int(by))))
# 横向拼接各格 4x
crops = []
for key, box in row:
    c = img.crop(box).resize(((box[2]-box[0])*4, (box[3]-box[1])*4), Image.NEAREST)
    crops.append(c)
tw = sum(c.width for c in crops) + 10 * len(crops)
th = max(c.height for c in crops)
sheet = Image.new('RGB', (tw, th), (30, 30, 30))
ox = 0
for c in crops:
    sheet.paste(c, (ox, 0)); ox += c.width + 10
sheet.save('${OUT}/l14-cells.png')
print(' | '.join(f"{k}{b}" for k, b in row))
PYEOF`, { stdio: 'inherit' });
await b.close();
process.exit(0);
