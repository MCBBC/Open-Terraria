import { describe, it, expect } from 'vitest';
// ★BJ274（2026-09-22 用户实报"丛林草地错误渲染的半砖方块/脚下悬空"）1:1 场景对拍：
//   实报世界（有害的动物尸体树篱）x1866 处丛林草半砖唇格(halfBrick=1, 原版 worldgen 自带,
//   .wld↔存档 blocks 通道 11855 半砖位逐格 diff=0) + 左侧 1 格深满水层(255)。
//   vanilla CheckForWaterfall(WaterfallManager.cs:157-179)据此登记瀑布 → 行走支"左液右空"
//   (:615-623)沿草顶右行 → 逐格画横流条 (16+slot,0,16,16) @ y0+8。
//   原版层序（Main.cs DoDraw_WallsTilesNPCs :64240-64243 瀑布在非实心块后、DoDraw :64256
//   实心块前）= 横流带越过实心草地的下半幅被遮挡,实观只剩气格内 8px 细流线;
//   本仓瀑布画在 tile 层之后 ⇒ 16px 全幅盖草 = 实报"半砖方块"观感。
//   修 = drawFlipped 内对覆盖到的全实心格(solidT=blockType()==0 同域)做减法裁剪。
//   本测试以 1:1 store 场景断言:唇格条 16px 全幅;实心草段上的横流条裁 8px;
//   坡面扇形片(落在坡格上,形状格不遮)不裁;水面格(数据水)不受影响。
import { WaterfallRenderer } from '../src/render/WaterfallRenderer';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { pinGameTimeTicks } from '../src/core/GameTime';

const GRASS = TILE_BY_KEY['v_60_jungle_grass_block'];
if (!GRASS) throw new Error('no jungle grass');
const st = new TileStore(2200, 400);
// 实报条带 1:1（世界坐标平移 -1600 → 本地格）:
//   y=295(本地 y=95... 直接用原坐标,y<400 即可)——草行 y=295 x1866..1896, 泥行 y=296
for (let x = 1840; x <= 1930; x++) {
  st.setTile(x, 295, GRASS);
  st.setTile(x, 296, TILE_BY_KEY['mud'] ?? GRASS);
}
// 半砖唇格 (1866,294)（原版 worldgen 自带）
st.setTile(1866, 294, GRASS);
st.half[st.idx(1866, 294)] = 1;
// 左侧水层 y=294 x≤1865（255 满）
for (let x = 1840; x <= 1865; x++) st.setLiquid(x, 294, 255, 1);
// 坡面草 (1885,295) S1（实报世界同款）
st.slope[st.idx(1885, 295)] = 1;

let calls: any[] = [];
const ctx: any = {
  globalAlpha: 1,
  imageSmoothingEnabled: true,
  canvas: { width: 1512, height: 862 },
  save() {}, restore() {},
  translate(x: number, y: number) { this._tx = x; this._ty = y; },
  scale() { this._flip = true; },
  drawImage(img: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
    let px = dx, py = dy;
    if (this._flip) { px = this._tx - dw; py = this._ty; }
    this._flip = false; this._tx = 0; this._ty = 0;
    calls.push({ sx, sy, sw, sh, px, py, dw, dh, a: this.globalAlpha });
  },
};
const atlas = { ensureVImage: () => ({ width: 512, height: 40 }) };
const wf: any = new WaterfallRenderer();
wf.falls = [{ x: 1866, y: 294, type: 0 }];
// ★2026-09-27 重钉逻辑 tick 株连补钉（同 waterfall-draw.test.ts 判例）：帧钟已从
//  墙钟改 gameTickCount,本测试未钉钟 → regular=0/slot=0 ≠ 金标 slot=128。pin 12
//  → regular=⌊12/3⌋=4=旧墙钟 nowMs=1000 的帧槽（slot=128,像素金标不变,零改窗）。
pinGameTimeTicks(12);
wf.draw(ctx, atlas, st, 337, 1000, 3);

describe('BJ274 丛林草半砖唇瀑布横流带·实心遮挡裁剪', () => {
  const slot = 32 * (Math.floor(1000 / 50) % 16);
  it('唇格条 (16+slot,0,16,16) @ y0+0 全幅(唇格半砖形状格不遮,且条只在本行内)', () => {
    const lip = calls.find((c) => c.sx === 16 + slot && c.sw === 16 && c.sh === 16
      && c.px === 1866 * 16 && c.py === 294 * 16);
    expect(lip).toBeTruthy();
  });
  it('实心草段上的横流条全部裁为 8px（气格内可见部分=原版层序像素等价）', () => {
    // 行走覆盖 x1867..（草行上方气格）; 每格 y0+8 带 16px 越入草行 → 裁 8px
    const creeps = calls.filter((c) => c.sx === 16 + slot && c.sy === 0 && c.sw === 16
      && c.py === 294 * 16 + 8);
    expect(creeps.length).toBeGreaterThanOrEqual(10);
    expect(creeps.every((c) => c.sh === 8)).toBe(true);
    expect(creeps[0].px).toBe(1867 * 16);
  });
  it('坡格 (1885,295) 上的扇形片不裁（形状格非全实心;★BJ289:对原版=近似(债)非同效——原版 Solid pass 形状格不透明子域实会遮挡,本仓可见域偏大）', () => {
    const fans = calls.filter((c) => c.sw === 2 && c.sh === 8
      && c.px >= 1885 * 16 && c.px < 1886 * 16);
    expect(fans.length).toBe(8);
  });
  it('任何瀑布子域都不落在全实心格内（水面行 y296 的数据水格除外域）', () => {
    const bad = calls.filter((c) => {
      const cx0 = Math.floor(c.px / 16), cx1 = Math.ceil((c.px + c.dw) / 16) - 1;
      const cy0 = Math.floor(c.py / 16), cy1 = Math.ceil((c.py + c.dh) / 16) - 1;
      for (let y = cy0; y <= cy1; y++) {
        for (let x = cx0; x <= cx1; x++) {
          const i = st.idx(x, y);
          if (st.flags[i] && st.half[i] === 0 && st.slope[i] === 0) {
            const d = (st.type[i] !== 0) ? true : false;
            if (d && st.type[i] === GRASS && y === 295) {
              // 全实心草格:子域若与之相交即违规(裁剪应已剥离)
              const ix0 = Math.max(c.px, x * 16), ix1 = Math.min(c.px + c.dw, x * 16 + 16);
              const iy0 = Math.max(c.py, y * 16), iy1 = Math.min(c.py + c.dh, y * 16 + 16);
              if (ix1 > ix0 && iy1 > iy0) return true;
            }
          }
        }
      }
      return false;
    });
    expect(bad).toHaveLength(0);
  });
});
