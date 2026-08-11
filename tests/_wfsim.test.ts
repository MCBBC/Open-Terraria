import { describe, it, expect } from 'vitest';
// mock ctx 记录 drawImage 序列,与 1456 原版手工推导逐条对拍。
// 场景(运行时 store 实测):
//   y587: 水 x1480-1483(255) | x1484 = 花岗岩半砖 | x1485+ 空气
//   y588: 花岗岩 x1474-1484 | x1485 = 花岗岩 S1 | x1486+ 空气(1488/1489 火把)
//   y589: 花岗岩 x1474-1484 | x1485 = 花岗岩 S3 | x1488,1489 花岗岩, x1490 S1
//   y590: 花岗岩 x1474-1483 | x1484 = S3 | x1486-1488 空 | x1489 花岗岩柱
//   y591+: x1486 空腔向下直至 y604 花岗岩地板(模拟地面)
import { WaterfallRenderer } from '../src/render/WaterfallRenderer';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';

const GRANITE = TILE_BY_KEY['v_368_granite_block'];
if (!GRANITE) throw new Error('no granite');
const st = new TileStore(1600, 700);
// 西侧花岗岩体 + 池底
for (let y = 583; y <= 587; y++) for (let x = 1474; x <= 1479; x++) st.setTile(x, y, GRANITE);
for (let y = 588; y <= 589; y++) for (let x = 1474; x <= 1484; x++) st.setTile(x, y, GRANITE);
for (let y = 590; y <= 597; y++) for (let x = 1474; x <= 1483; x++) st.setTile(x, y, GRANITE);
// 唇缘半砖 (1484,587)
st.setTile(1484, 587, GRANITE); st.half[st.idx(1484, 587)] = 1;
// 坡面凸台 x1485: y588 S1 / y589 S3
st.setTile(1485, 588, GRANITE); st.slope[st.idx(1485, 588)] = 1;
st.setTile(1485, 589, GRANITE); st.slope[st.idx(1485, 589)] = 3;
// y590 x1484 S3(运行时有)
st.setTile(1484, 590, GRANITE); st.slope[st.idx(1484, 590)] = 3;
// 空腔地面 y604
for (let x = 1480; x <= 1500; x++) st.setTile(x, 604, GRANITE);
// 池水
for (let x = 1480; x <= 1483; x++) st.setLiquid(x, 587, 255, 1);
// 墙(影响 alpha,非几何)
for (let y = 583; y <= 604; y++) for (let x = 1474; x <= 1500; x++) st.wall[st.idx(x, y)] = 180;

let calls: any[] = [];
const ctx: any = {
  globalAlpha: 1,
  imageSmoothingEnabled: true,
  save() {}, restore() {},
  translate(x, y) { this._tx = x; this._ty = y; },
  scale() { this._flip = true; },
  drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
    // 还原镜像:drawFlipped 先 translate(px+dw,py) 再 scale(-1,1),画于 (0,0,dw,dh)
    let px = dx, py = dy;
    if (this._flip) { px = this._tx - dw; py = this._ty; }
    this._flip = false; this._tx = 0; this._ty = 0;
    calls.push({ sx, sy, sw, sh, px, py, dw, dh, a: this.globalAlpha });
  },
};
const atlas = { ensureVImage: () => ({ width: 512, height: 40 }) };
const wf: any = new WaterfallRenderer();
// 直接注入 falls(绕过 findWaterfalls 扫描节流)
wf.falls = [{ x: 1484, y: 587, type: 0 }];
wf.draw(ctx, atlas, st, 331, 1000, 0);
for (const c of calls) {
  console.log(
    `src(${c.sx},${c.sy},${c.sw}x${c.sh}) dst[${c.px / 16},${c.py / 16}] ${c.dw}x${c.dh} a=${c.a}`);
}
console.log('total:', calls.length);

describe('waterfall draw 1484,587 场景对拍', () => {
  it('唇缘格画 16px 横流条而非 32px 宽带(不压池面)', () => {
    expect(calls[0]).toMatchObject({ sx: 16, sy: 0, sw: 16, sh: 16, px: 1484 * 16, py: 587 * 16 });
  });
  it('坡面格:flag2 切片 + 8x2px 扇形', () => {
    const slice = calls.find((c) => c.sy === 24 && c.sh === 14 && c.py === 587 * 16 + 14);
    expect(slice).toBeTruthy();
    const fans = calls.filter((c) => c.sw === 2 && c.sh === 8);
    expect(fans.length).toBe(8);
  });
  it('坡转竖浅流片 (slot,0,16,8) @ (1486,588.5)', () => {
    const t = calls.find((c) => c.sy === 0 && c.sw === 16 && c.sh === 8 && c.px === 1486 * 16 && c.py === 588 * 16 + 8);
    expect(t).toBeTruthy();
  });
  it('持续竖直柱 32px 宽带 @ x1485 起、逐格下移', () => {
    const bands = calls.filter((c) => c.sy === 24 && c.sw === 32 && c.sh === 16 && c.px === 1485 * 16);
    expect(bands.length).toBeGreaterThanOrEqual(14); // 589..603
    expect(bands[0].py).toBe(589 * 16);
  });
  it('撞地:本格顶部 8px 溅片 + 末带高度裁剪', () => {
    const splash = calls.find((c) => c.sy === 24 && c.sw === 32 && c.sh === 8 && c.py === 603 * 16);
    expect(splash).toBeTruthy();
  });
  it('池面格 x1483 无任何瀑布绘制', () => {
    const bad = calls.filter((c) => c.px < 1484 * 16 && c.py < 588 * 16);
    expect(bad).toHaveLength(0);
  });
});
