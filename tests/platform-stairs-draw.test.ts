// 平台坡面连接补片（TileDrawing.cs:1537-1575）1:1 回归（2026-08-28 用户档楼梯贴图核查）：
// slope1 平台 + 下对角实心 → 背后层补片 (198/324, frameY)；下对角为平平台 → 324/306 连接帧；
// ★「实心」= 原版 Main.tileSolid 域（平台在内）——本仓 solid=false 曾漏画楼梯接平台走道补片；
// 抑制支：正下方 BlocksStairs 族 {386,387,54,328,459,541} 且 blockType∈{0,5} → 不补；
// echo 涂层(invisibleBlock)按 shouldShowInvisibleBlocks=false 排除。
// 断言用 recording ctx 捕获 drawImage 源矩形（同 anim-furniture-frame 手法）。
import { describe, it, expect } from 'vitest';
import { drawVanillaCell } from '../src/render/VanillaTiler';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import type { SpriteAtlas, DrawRect } from '../src/assets/SpriteAtlas';

const PLAT = TILE_BY_KEY['platform']!;          // vanilla sheet 19
const DIRT = TILE_BY_KEY['dirt']!;
const TRAPDOOR = TILE_BY_KEY['v_386_trapdooropen']!;   // BlocksStairs 族
expect(PLAT).toBeGreaterThan(0);
expect(DIRT).toBeGreaterThan(0);
expect(TRAPDOOR).toBeGreaterThan(0);

function recCtx() {
  const calls: Array<{ sx: number; sy: number }> = [];
  return {
    calls,
    ctx: {
      drawImage: (_img: unknown, sx: number, sy: number) => { calls.push({ sx, sy }); },
      imageSmoothingEnabled: false,
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D,
  };
}

/** mock atlas：Tiles_19 几何（486×1260 = 27×70 帧），vframeAt 像素偏移原样回传 */
function mockAtlas19() {
  const fakeImg = { width: 486, height: 1260 };
  const meta = { sheet: 'Tiles_19.png', grid: [16, 16], stride: [18, 18], cols: 27, rows: 70 };
  return {
    vmeta: (s: number) => (s === 19 ? meta : null),
    ensureVImage: () => fakeImg as unknown as HTMLImageElement,
    vframeAt: (_s: number, x: number, y: number): DrawRect =>
      ({ img: fakeImg as unknown as HTMLImageElement, sx: x, sy: y, sw: 16, sh: 16 }),
    vImageFailed: () => false,
  } as unknown as SpriteAtlas;
}

const setCell = (st: TileStore, x: number, y: number, type: number, fx: number, fy: number,
  slope = 0, half = false): void => {
  st.setTileSilent(x, y, type, fx, fy);
  if (slope) st.slope[st.idx(x, y)] = slope;
  if (half) st.half[st.idx(x, y)] = 1;
};

/** 画 (10,10) 的平台格，返回 drawImage 源矩形序列 */
function drawCell(st: TileStore, fx = 180, fy = 576): Array<{ sx: number; sy: number }> {
  const { ctx, calls } = recCtx();
  drawVanillaCell(ctx, mockAtlas19(), 19, 'style', 1, 1, st, 10, 10, PLAT,
    () => true, 0, 0, fx, fy);
  return calls;
}

describe('平台坡面连接补片（TileDrawing.cs:1537-1575）', () => {
  it('slope1 + 下对角平平台 → 整帧(180,576) + 连接补片(324,576)——原版 tileSolid 含平台（曾漏画）', () => {
    const st = new TileStore(24, 24);
    setCell(st, 10, 10, PLAT, 180, 576, 1);
    setCell(st, 11, 11, PLAT, 90, 576);          // 下右：平平台（本仓 solid=false！）
    const calls = drawCell(st);
    expect(calls).toEqual([{ sx: 180, sy: 576 }, { sx: 324, sy: 576 }]);
  });

  it('slope1 + 下对角实心块 → 整帧 + (198,576)', () => {
    const st = new TileStore(24, 24);
    setCell(st, 10, 10, PLAT, 180, 576, 1);
    setCell(st, 11, 11, DIRT, 0, 0);
    expect(drawCell(st)).toEqual([{ sx: 180, sy: 576 }, { sx: 198, sy: 576 }]);
  });

  it('slope2 + 下对角实心块 → 整帧 + (162,576)；下对角平平台 → (306,576)', () => {
    const st = new TileStore(24, 24);
    setCell(st, 10, 10, PLAT, 144, 576, 2);
    setCell(st, 9, 11, DIRT, 0, 0);
    expect(drawCell(st, 144)).toEqual([{ sx: 144, sy: 576 }, { sx: 162, sy: 576 }]);
    const st2 = new TileStore(24, 24);
    setCell(st2, 10, 10, PLAT, 144, 576, 2);
    setCell(st2, 9, 11, PLAT, 90, 576);
    expect(drawCell(st2, 144)).toEqual([{ sx: 144, sy: 576 }, { sx: 306, sy: 576 }]);
  });

  it('下对角对向坡(slope1 配右下 slope2)/半砖 → 不补', () => {
    const st = new TileStore(24, 24);
    setCell(st, 10, 10, PLAT, 180, 576, 1);
    setCell(st, 11, 11, DIRT, 0, 0, 2);          // 对向坡（:1545 slope!=2 门）
    expect(drawCell(st)).toEqual([{ sx: 180, sy: 576 }]);
    const st2 = new TileStore(24, 24);
    setCell(st2, 10, 10, PLAT, 180, 576, 1);
    setCell(st2, 11, 11, DIRT, 0, 0, 0, true);   // 半砖（:1546 !halfBrick 门）
    expect(drawCell(st2)).toEqual([{ sx: 180, sy: 576 }]);
  });

  it('正下方 BlocksStairs 族整块（blockType 0）→ 抑制补片（:1551）', () => {
    const st = new TileStore(24, 24);
    setCell(st, 10, 10, PLAT, 180, 576, 1);
    setCell(st, 10, 11, TRAPDOOR, 0, 0);          // 正下方活板门(整块)
    setCell(st, 11, 11, DIRT, 0, 0);              // 下右实心照常满足
    expect(drawCell(st)).toEqual([{ sx: 180, sy: 576 }]);
  });

  it('正下方非 BlocksStairs 整块 → 不抑制，补片照画', () => {
    const st = new TileStore(24, 24);
    setCell(st, 10, 10, PLAT, 180, 576, 1);
    setCell(st, 10, 11, DIRT, 0, 0);
    setCell(st, 11, 11, DIRT, 0, 0);
    expect(drawCell(st)).toEqual([{ sx: 180, sy: 576 }, { sx: 198, sy: 576 }]);
  });

  it('下对角 echo 涂层(invisibleBlock) → 不补（invisibleBlock 显示模式关）', () => {
    const st = new TileStore(24, 24);
    setCell(st, 10, 10, PLAT, 180, 576, 1);
    setCell(st, 11, 11, DIRT, 0, 0);
    st.coat[st.idx(11, 11)] = TileStore.COAT_INVISIBLE_BLOCK;
    expect(drawCell(st)).toEqual([{ sx: 180, sy: 576 }]);
  });

  it('平放平台（slope=0）不走坡面支：只画整帧', () => {
    const st = new TileStore(24, 24);
    setCell(st, 10, 10, PLAT, 180, 576);
    setCell(st, 11, 11, DIRT, 0, 0);
    expect(drawCell(st, 180)).toEqual([{ sx: 180, sy: 576 }]);
  });
});
