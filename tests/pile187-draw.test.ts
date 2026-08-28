// 大石堆族 187（Decos 3x2 Group 2）绘制回归（2026-08-28 用户报"石堆贴图错位"）：
// 曾误读 C# fallthrough——把 case 184 的 tileWidth=20 落到 185/186/187（原版 :5218-5236
// 该族只设 tileTop 恒 2 + 187 分带换算，无 20 宽），且把 184 的 fy 条件 tileTop
// (:5288-5292) 错罩 185-187。症状：3×2 石堆每格多绘右邻 4px=接缝错位。
// 断言：每格源矩形 16×16（无 20 宽）、dest y 含 +2px（tileTop 恒 2）。
import { describe, it, expect } from 'vitest';
import { drawVanillaCell } from '../src/render/VanillaTiler';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { SpriteAtlas, DrawRect } from '../src/assets/SpriteAtlas';

const PILE = TILE_BY_KEY['v_187_decos_3x2_group_2']!;   // vanilla sheet 187
expect(PILE).toBeGreaterThan(0);

function recCtx() {
  const calls: Array<{ sx: number; sy: number; sw: number; sh: number; dx: number; dy: number }> = [];
  return {
    calls,
    ctx: {
      drawImage: (_img: unknown, sx: number, sy: number, sw: number, sh: number,
        dx: number, dy: number) => { calls.push({ sx, sy, sw, sh, dx, dy }); },
      imageSmoothingEnabled: false,
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D,
  };
}

function mockAtlas187() {
  const fakeImg = { width: 1890, height: 72 };
  const meta = { sheet: 'Tiles_187.png', grid: [16, 16], stride: [18, 18], cols: 105, rows: 4 };
  return {
    vmeta: (s: number) => (s === 187 ? meta : null),
    ensureVImage: () => fakeImg as unknown as HTMLImageElement,
    vframeAt: (_s: number, x: number, y: number): DrawRect =>
      ({ img: fakeImg as unknown as HTMLImageElement, sx: x, sy: y, sw: 16, sh: 16 }),
    vImageFailed: () => false,
  } as unknown as SpriteAtlas;
}

describe('大石堆 187 绘制（tileWidth=20 仅 184；tileTop 恒 2）', () => {
  it('3×2 石堆(样式15)每格源矩形 16×16、无 20 宽越取；dest y = py+2', () => {
    const st = new TileStore(24, 24);
    const cells = [[810, 0], [828, 0], [846, 0], [810, 18], [828, 18], [846, 18]];
    cells.forEach(([fx, fy], k) => {
      st.setTileSilent(10 + (k % 3), 10 + Math.floor(k / 3), PILE, fx, fy);
    });
    const { calls } = recCtx();
    for (let k = 0; k < 6; k++) {
      const x = 10 + (k % 3), y = 10 + Math.floor(k / 3);
      const i = st.idx(x, y);
      drawVanillaCell(recCtx0(calls), mockAtlas187(), 187, 'style', 3, 2, st, x, y,
        PILE, () => true, (x - 10) * 16, (y - 10) * 16, st.frameX[i], st.frameY[i]);
    }
    expect(calls).toHaveLength(6);
    for (const c of calls) {
      expect(c.sw).toBe(16);      // 修复点①：不再 20 宽越取右邻
      expect(c.sh).toBe(16);
    }
    // 逐格源坐标与存档帧一致（样式 15：810/828/846 × fy 0/18）
    expect(calls.map((c) => `${c.sx},${c.sy}`)).toEqual(
      ['810,0', '828,0', '846,0', '810,18', '828,18', '846,18']);
    // 修复点②：dest y 恒 +2（tileTop=2），行间不出现 −2 档
    for (const c of calls) expect(c.dy - Math.floor(c.dy / 16) * 16).toBe(2);
  });
});

/** 复用同一 calls 数组的 ctx 工厂 */
function recCtx0(calls: Array<{ sx: number; sy: number; sw: number; sh: number; dx: number; dy: number }>) {
  return {
    drawImage: (_img: unknown, sx: number, sy: number, sw: number, sh: number,
      dx: number, dy: number) => { calls.push({ sx, sy, sw, sh, dx, dy }); },
    imageSmoothingEnabled: false,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}
