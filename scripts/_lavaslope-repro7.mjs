// _lavaslope-repro7: 定点解剖用户世界 (31,968) 岩浆 slope3 岸缘——
// dump 7×7 tile 终态 + 4px/子格 ASCII 颜色分类图,标出浸润缺失带的世界格位置。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const OUT = process.env.SW_OUT || join(HOME, '.claude/jobs/8405c930/tmp');
const MAP = needInput(join(DOWNLOADS, 'map-饥饿的庄园 (1).json'));
const CX = Number(process.env.SW_CX || 31), CY = Number(process.env.SW_CY || 968);

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
  g.renderer.fullbright = true;
});
await p.evaluate(({ x, y }) => {
  const g = window.__swGame, pl = g.player;
  pl.x = x * 16 - pl.w / 2; pl.y = (y - 6) * 16;
  pl.vx = 0; pl.vy = 0;
}, { x: CX, y: CY });
await new Promise(r => setTimeout(r, 1200));
await p.bringToFront();
await new Promise(r => setTimeout(r, 500));
await p.screenshot({ path: `${OUT}/l7.png` });
const cam = await p.evaluate(() => {
  const g = window.__swGame;
  return { cx: g.camera.x, cy: g.camera.y, z: g.camera.zoom, W: g.renderer.canvas.width, H: g.renderer.canvas.height };
});
const dump = await p.evaluate(({ x, y }) => {
  const st = window.__swGame.world.store, TILE_DEFS = window.__swITEMS;
  const rows = [];
  for (let tx = x - 3; tx <= x + 3; tx++) {
    for (let ty = y - 3; ty <= y + 3; ty++) {
      const i = st.idx(tx, ty);
      rows.push({ x: tx, y: ty, t: st.type[i], f: st.flags[i], slope: st.slope[i], half: st.half[i],
        liq: st.liquid[i], lt: st.liquidType[i], wall: st.wall[i], wire: st.wire[i] });
    }
  }
  return rows;
}, { x: CX, y: CY });
console.log('tile dump (7×7):');
for (const r of dump) {
  if (r.f || r.liq || r.wall) console.log(` (${r.x},${r.y}) t=${r.t} slope=${r.slope} half=${r.half} liq=${r.liq} lt=${r.lt} wall=${r.wall} wire=${r.wire}`);
}
console.log('cam:', JSON.stringify(cam));

const { execSync } = await import('node:child_process');
execSync(`python3 - << 'PYEOF'
from PIL import Image
img = Image.open('${OUT}/l7.png').convert('RGB')
W, H = img.size
cx, cy, z = ${cam.cx}, ${cam.cy}, ${cam.z}
CX, CY = ${CX}, ${CY}
def w2s(wx, wy): return ((wx - cx) * z + W/2, (wy - cy) * z + H/2)
def px(wx, wy):
    a, b_ = w2s(wx, wy)
    ia, ib = int(a), int(b_)
    if 0 <= ia < W and 0 <= ib < H: return img.getpixel((ia, ib))
    return (0, 0, 0)
def cls(p):
    r, g, b = p
    if r > 150 and g < 120 and b < 90 and r - b > 50: return 'L'   # lava(体/浸润)
    if r > 150 and g >= 120 and b < 90: return 'S'                  # 表面带橙
    lum = 0.299*r + 0.587*g + 0.114*b
    if lum > 100: return '#'
    if lum > 45: return '+'
    return '.'
print('ASCII 4px/字符 (每格4字符宽): 行=世界y, 列=世界x, L=岩浆红 S=表面橙')
print('      ' + ''.join(f'{x:<5}' for x in range(CX-3, CX+4)))
for ty in range(CY-3, CY+4):
    row = f'y={ty}: '
    for tx in range(CX-3, CX+4):
        for sy in range(4):
            seg = ''
            for sx in range(4):
                seg += cls(px(tx*16 + sx*4 + 2, ty*16 + sy*4 - 0))
            row += seg + ' '
    # 每格只打第2子行,避免过长;完整 4 子行分 4 行打
    print(row)
PYEOF`, { stdio: 'inherit' });
await b.close();
process.exit(0);
