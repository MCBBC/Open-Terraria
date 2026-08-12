// F11 像素方块群导入回归:放置扫描 / 透明跳过 / RGB 编码往返 / 存档序列化往返
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { findArtPlacement, placeArt, type ArtGrid } from '../src/dev/PixelArtImport';

const PIX = TILE_BY_KEY['pixel_block']!;
const DIRT = TILE_BY_KEY['dirt']!;

function grid2x2(colors: Array<[number, number, number, number]>): ArtGrid {
  // 2×2 RGBA 手工构造(绕开 DOM canvas):colors 顺序 [tl, tr, bl, br]
  const rgba = new Uint8ClampedArray(16);
  colors.forEach((c, i) => { rgba.set(c, i * 4); });
  return { w: 2, h: 2, rgba };
}

function ground(st: TileStore, y: number, from = 0, to = 40): void {
  for (let x = from; x < to; x++) st.setTileSilent(x, y, DIRT);
}

describe('像素方块群导入', () => {
  it('放置扫描:平地 → 底边贴地表', () => {
    const st = new TileStore(60, 60);
    ground(st, 40);
    const pos = findArtPlacement(st, 20, 10, 4, 3);
    expect(pos).toEqual({ x: 20, y: 37 }); // 底行 39 = 地表上一格
  });

  it('放置扫描:地面有障碍 → 逐格抬升到矩形全空', () => {
    const st = new TileStore(60, 60);
    ground(st, 40);
    st.setTileSilent(21, 38, DIRT); // 地表上方 2 格处一坨障碍
    st.setTileSilent(21, 39, DIRT);
    const pos = findArtPlacement(st, 20, 10, 4, 3);
    expect(pos).not.toBeNull();
    // 4×3 矩形须完全避开障碍:底边最多 38 → y = 35
    expect(pos!.y).toBeLessThanOrEqual(35);
    for (let y = pos!.y; y < pos!.y + 3; y++) {
      for (let x = pos!.x; x < pos!.x + 4; x++) {
        expect(st.flags[st.idx(x, y)]).toBe(0);
      }
    }
  });

  it('放置扫描:找不到全空位(整柱实心) → null', () => {
    const st = new TileStore(60, 60);
    for (let y = 0; y < 60; y++) st.setTileSilent(20, y, DIRT);
    expect(findArtPlacement(st, 20, 10, 4, 3)).toBeNull();
  });

  it('placeArt:透明格跳过 / 已占用格跳过 / RGB 编码往返', () => {
    const st = new TileStore(60, 60);
    ground(st, 50);
    const g = grid2x2([
      [255, 0, 0, 255],      // 红
      [0, 0, 0, 0],          // 透明(跳过)
      [0, 255, 0, 255],      // 绿
      [10, 20, 30, 255],     // 深色(量化后 8,16,24? 本测试不量化,手工值直编码)
    ]);
    st.setTileSilent(10, 45, DIRT); // (10,45) 已占用 → 跳过
    const n = placeArt(st, g, { x: 10, y: 45 });
    expect(n).toBe(2); // 红/绿放置,透明与占用跳过(深色落在占用格)
    // 编码往返:2×2 格位 tl(10,45)=红→占用跳过;tr(11,45)=透明;bl(10,46)=绿;br(11,46)=深色
    const gi = st.idx(10, 46);
    expect(st.type[gi]).toBe(PIX);
    // 绿 (0,255,0):fx = ((0||1)<<8)|(255||1) = 511;解码 r=fx>>8=1(纯0红||1), g=fx&255=255, b=fy=1
    expect(st.frameX[gi]).toBe(511);
    expect(st.frameX[gi] & 255).toBe(255);
    expect(st.frameX[gi] >> 8).toBe(1);
    expect(st.frameY[gi]).toBe(1);
    // 深色格
    const di = st.idx(11, 46);
    expect(st.type[di]).toBe(PIX);
    expect((st.frameX[di] >> 8)).toBe(10);
    expect(st.frameX[di] & 255).toBe(20);
    expect(st.frameY[di]).toBe(30);
  });

  it('持久化契约:稳定 id 1028 双向注册(自定义 tile 进存档的机制,mushroom/flower 同款)', async () => {
    const { TILE_STABLE_OF_INTERNAL, TILE_INTERNAL_OF_STABLE } = await import('../src/data/tiles');
    expect(TILE_STABLE_OF_INTERNAL[PIX]).toBe(1028);
    expect(TILE_INTERNAL_OF_STABLE[1028]).toBe(PIX);
    // RGB 走 frameX/frameY(Uint16 持久化路径,与 v_ 家具同字段)——类型+帧的
    // rleTiles 序列化已由既有 save 测试覆盖,此处只锁注册契约
  });
});
