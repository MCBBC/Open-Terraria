// SW-BL1 2026-09-06：442 弹幕压力垫板朝向绘制 1:1 守卫（TileDrawing.cs:5709-5720
// GetTileDrawData case 442 + :1060-1068 DrawSingleTile 手动偏移）。
//   缺省 tileWidth=tileHeight=20；取向 c = frameX/22（构向写 0/22/44/66）——
//     c1（顶装）tileTop=-4；c2（左装）tileTop=-2 且 tileWidth=24；c3（右装）tileTop=-2；
//     c0（底装）全缺省。
//   主路径消费（TileDrawing.cs:1016-1022）：src=(frameX,frameY,tileWidth,tileHeight)、
//     dest=(x*16-(tileWidth-16)/2, y*16+tileTop)；再叠手动偏移 c3 vector.X+=2。
//   ⇒ 四向 dest：c0=(-2,+0) c1=(-2,-4) c2=(-4,-2) c3=(+0,-2)（相对格左上）。
// 修复点：c2 曾恒 20×20 源（右缘缺 4px）。碰撞面（Collision.cs:3287 四向 16×10/10×16
//   子矩形）已由 Game.switchTilesScan 1:1 承载（SW-AO1,tests/sw-ao1-* 在守）。
import { describe, it, expect } from 'vitest';
import { drawVanillaCell } from '../src/render/VanillaTiler';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { SpriteAtlas, DrawRect } from '../src/assets/SpriteAtlas';

const PAD = TILE_BY_KEY['v_442_projectilepressurepad']!;
const DEF = TILE_DEFS[PAD]!;

/** recording ctx：捕获 drawImage 全参（img 之后的 sx,sy,sw,sh,dx,dy） */
function mkCtx() {
  const calls: Array<{ sx: number; sy: number; sw: number; sh: number; dx: number; dy: number }> = [];
  const ctx = {
    drawImage: (_img: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) => {
      calls.push({ sx, sy, sw, sh, dx, dy });
    },
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    save: () => {}, restore: () => {},
    translate: () => {}, scale: () => {}, rotate: () => {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

/** mock atlas：Tiles_442 几何（原版 sheet 88×20?此测只校矩形几何,图给足余量） */
function mockAtlas() {
  const fakeImg = { width: 128, height: 40 };
  const meta = {
    sheet: 'Tiles_442.png', name: 'Projectile Pressure Pad', key: 'v_442_projectilepressurepad',
    grid: [16, 16], stride: [22, 20], cols: 4, rows: 1,
  };
  return {
    vmeta: (s: number) => (s === 442 ? meta : null),
    ensureVImage: () => fakeImg as unknown as HTMLImageElement,
    vframeAt: (_s: number, x: number, y: number): DrawRect =>
      ({ img: fakeImg as unknown as HTMLImageElement, sx: x, sy: y, sw: 16, sh: 16 }),
    vImageFailed: () => false,
  } as unknown as SpriteAtlas;
}

function drawAt(fx: number) {
  const st = new TileStore(16, 16);
  st.setTileSilent(8, 8, PAD, fx, 0);
  const { ctx, calls } = mkCtx();
  drawVanillaCell(ctx, mockAtlas(), 442, DEF.vanilla!.frame as 'style',
    DEF.vanilla!.fw!, DEF.vanilla!.fh!, st, 8, 8, PAD,
    () => true, 8 * 16, 8 * 16, fx, 0);
  return calls;
}

describe('SW-BL1 442 压力垫板朝向绘制（TileDrawing.cs:5709-5720 + :1060-1068）', () => {
  it('c0 底装（fx=0）：源 20×20，dest=(px-2, py+0)', () => {
    const calls = drawAt(0);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const c = calls[calls.length - 1]!;
    expect(c.sx).toBe(0); expect(c.sy).toBe(0);
    expect(c.sw).toBe(20); expect(c.sh).toBe(20);
    expect(c.dx).toBe(8 * 16 - 2); expect(c.dy).toBe(8 * 16 + 0);
  });

  it('c1 顶装（fx=22）：源 20×20，dest=(px-2, py-4)', () => {
    const calls = drawAt(22);
    const c = calls[calls.length - 1]!;
    expect(c.sw).toBe(20); expect(c.sh).toBe(20);
    expect(c.dx).toBe(8 * 16 - 2); expect(c.dy).toBe(8 * 16 - 4);
  });

  it('c2 左装（fx=44）：源 24×20（tileWidth=24,修复点），dest=(px-4, py-2)', () => {
    const calls = drawAt(44);
    const c = calls[calls.length - 1]!;
    expect(c.sx).toBe(44);
    expect(c.sw).toBe(24); expect(c.sh).toBe(20);
    expect(c.dx).toBe(8 * 16 - 4); expect(c.dy).toBe(8 * 16 - 2);
  });

  it('c3 右装（fx=66）：源 20×20，手动偏移 +2 → dest=(px-2+2, py-2)=（px, py-2)', () => {
    const calls = drawAt(66);
    const c = calls[calls.length - 1]!;
    expect(c.sw).toBe(20); expect(c.sh).toBe(20);
    expect(c.dx).toBe(8 * 16 + 0); expect(c.dy).toBe(8 * 16 - 2);
  });
});
