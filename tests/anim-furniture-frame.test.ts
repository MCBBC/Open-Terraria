// 动画家具帧带偏移与零帧重建的复合（2026-08-17 炼金台贴图故障回归）。
// 故障链：DungeonPass.dgWr 系放置只写 type 帧全 0 → 渲染端零帧重建兜底
// （VanillaTiler 扫描左/上同类零帧格重建 ofx/ofy）；ChunkCache 曾把
// animYOffset 预加进 fy，重建门 (ofx===0&&ofy===0) 被破坏 → 炼金台 355/
// 巫惑台 354（Main.cs:18868-18874 8 帧动画）在 idx≥1 帧整物塌成 9 块
// 重复左上角碎片。修复=偏移移到 drawVanillaCell 重建/分带换算之后叠加。
// 断言用 recording ctx 捕获 drawImage 源矩形，不依赖真实画布。
import { describe, it, expect, beforeEach } from 'vitest';
import { drawVanillaCell } from '../src/render/VanillaTiler';
import { tileAnim } from '../src/render/TileAnim';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { SpriteAtlas, DrawRect } from '../src/assets/SpriteAtlas';

const ALCHEMY = TILE_BY_KEY['v_355_alchemy_table']!;

/** recording ctx：只记录 drawImage 的源矩形（sx,sy） */
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

/** mock atlas：Tiles_355 几何（54×432，grid16 stride18 rows24），vframeAt 原样回传偏移 */
function mockAtlas() {
  const fakeImg = { width: 54, height: 432 };
  const meta = {
    sheet: 'Tiles_355.png', name: 'Alchemy Table', key: 'v_355_alchemy_table',
    grid: [16, 16], stride: [18, 18], cols: 3, rows: 24,
  };
  return {
    vmeta: (s: number) => (s === 355 ? meta : null),
    ensureVImage: () => fakeImg as unknown as HTMLImageElement,
    vframeAt: (_s: number, x: number, y: number): DrawRect =>
      ({ img: fakeImg as unknown as HTMLImageElement, sx: x, sy: y, sw: 16, sh: 16 }),
    vImageFailed: () => false,
  } as unknown as SpriteAtlas;
}

/** mock atlas：Tiles_187 几何（1890×72 两带样式，grid16 stride18 rows4） */
function mockAtlas187() {
  const fakeImg = { width: 1890, height: 72 };
  const meta = {
    sheet: 'Tiles_187.png', name: 'Decos 3x2 Group 2', key: 'v_187_decos_3x2_group_2',
    grid: [16, 16], stride: [18, 18], cols: 105, rows: 4,
  };
  return {
    vmeta: (s: number) => (s === 187 ? meta : null),
    ensureVImage: () => fakeImg as unknown as HTMLImageElement,
    vframeAt: (_s: number, x: number, y: number): DrawRect =>
      ({ img: fakeImg as unknown as HTMLImageElement, sx: x, sy: y, sw: 16, sh: 16 }),
    vImageFailed: () => false,
  } as unknown as SpriteAtlas;
}

/** 放一张 3×3 炼金台：framed=true 写逐格帧；否则全零帧（dgWr 系放置/存量存档形态） */
function placeTable(st: TileStore, x0: number, y0: number, framed: boolean): void {
  for (let dx = 0; dx < 3; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      st.setTileSilent(x0 + dx, y0 + dy, ALCHEMY,
        framed ? dx * 18 : 0, framed ? dy * 18 : 0);
    }
  }
}

describe('动画家具帧偏移 × 零帧重建（炼金台 355）', () => {
  beforeEach(() => { tileAnim.tick = 0; });

  it('TILE_ANIM 表与原版一致（rate5/8帧/pitch54，Main.cs:18868-18874）', async () => {
    const { TILE_ANIM_RATE, animYOffset } = await import('../src/render/TileAnim');
    expect(TILE_ANIM_RATE[355]).toBe(5);
    expect(animYOffset(355, 432)).toBe(0);            // tick=0 → idx 0
    tileAnim.tick = 10;                                 // floor(10/5)=2
    expect(animYOffset(355, 432)).toBe(2 * 54);        // yOff 108
  });

  it('已写帧格：frameY(36) + 带偏移(108) = 144', () => {
    const st = new TileStore(32, 32);
    placeTable(st, 10, 10, true);
    const def = TILE_DEFS[ALCHEMY]!;
    tileAnim.tick = 10;   // idx=2 → yOff=108
    const { ctx, calls } = recCtx();
    drawVanillaCell(ctx, mockAtlas(), 355, def.vanilla!.frame as 'style',
      def.vanilla!.fw!, def.vanilla!.fh!, st, 12, 12, ALCHEMY,
      () => true, 0, 0, st.frameX[st.idx(12, 12)], st.frameY[st.idx(12, 12)]);
    expect(calls).toHaveLength(1);
    // 右下角格 (dx=2,dy=2)：源 (36, 36+108)
    expect(calls[0]).toEqual({ sx: 36, sy: 144 });
  });

  it('零帧格（存量存档）：重建 (36,36) + 带偏移 108 = 144（修复前塌成 sy=108）', () => {
    const st = new TileStore(32, 32);
    placeTable(st, 10, 10, false);   // 全零帧
    const def = TILE_DEFS[ALCHEMY]!;
    tileAnim.tick = 10;
    const { ctx, calls } = recCtx();
    drawVanillaCell(ctx, mockAtlas(), 355, def.vanilla!.frame as 'style',
      def.vanilla!.fw!, def.vanilla!.fh!, st, 12, 12, ALCHEMY,
      () => true, 0, 0, 0, 0);
    expect(calls).toHaveLength(1);
    // 右下角格：零帧重建得 (36,36)，动画叠加后 (36,144)——与已写帧格同源
    expect(calls[0]).toEqual({ sx: 36, sy: 144 });
  });

  it('idx=0 帧（tick<5）：零帧格重建 (36,36)，无带偏移', () => {
    const st = new TileStore(32, 32);
    placeTable(st, 10, 10, false);
    const def = TILE_DEFS[ALCHEMY]!;
    tileAnim.tick = 3;
    const { ctx, calls } = recCtx();
    drawVanillaCell(ctx, mockAtlas(), 355, def.vanilla!.frame as 'style',
      def.vanilla!.fw!, def.vanilla!.fh!, st, 12, 12, ALCHEMY,
      () => true, 0, 0, 0, 0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ sx: 36, sy: 36 });
  });

  it('相邻零帧 3×2 石堆（187）：整段 run 模数切块，ofx 序列 [0,18,36,0,18,36]（2026-08-17 沙漠石堆错位）', () => {
    const st = new TileStore(32, 32);
    const PILE = TILE_BY_KEY['v_187_decos_3x2_group_2']!;
    // 两台并排零帧 3×2（用户存量档形态：sanitize 前生成的沙漠头骨堆）
    for (const ox of [10, 13]) {
      for (let dx = 0; dx < 3; dx++) {
        for (let dy = 0; dy < 2; dy++) st.setTileSilent(ox + dx, 20 + dy, PILE, 0, 0);
      }
    }
    const def = TILE_DEFS[PILE]!;
    const atlas = mockAtlas187();
    const xs: number[] = [];
    for (let dx = 0; dx < 6; dx++) {
      const { ctx, calls } = recCtx();
      drawVanillaCell(ctx, atlas, 187, def.vanilla!.frame as 'style',
        def.vanilla!.fw!, def.vanilla!.fh!, st, 10 + dx, 21, PILE,
        () => true, 0, 0, 0, 0);
      expect(calls).toHaveLength(1);
      xs.push(calls[0].sx);
    }
    // 新重建：整段 run 边界对齐 → 列偏移按 fw=3 循环（旧截断扫描为 0,18,36,36,36,36）
    expect(xs).toEqual([0, 18, 36, 0, 18, 36]);
  });

  it('读档修复 repairZeroFramePileStyles：沙地→头骨堆 52-54、草地→14-16、幂等', async () => {
    const { repairZeroFramePileStyles } = await import('../src/world/gen/vanilla/PilesPass');
    const SAND = TILE_BY_KEY['sand']!;
    const GRASS = TILE_BY_KEY['grass']!;
    const PILE = TILE_BY_KEY['v_187_decos_3x2_group_2']!;
    const st = new TileStore(32, 32);
    // 沙地上一组零帧 3×2（底行 y=11，地面 y=12=沙）
    for (let dx = 0; dx < 3; dx++) st.setTileSilent(10 + dx, 12, SAND, 0, 0);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) st.setTileSilent(10 + dx, 10 + dy, PILE, 0, 0);
    // 草地连排两组零帧（整段 run 按 3 宽切块逐组修复——地面须铺满 run 下方）
    for (let dx = 0; dx < 6; dx++) st.setTileSilent(17 + dx, 12, GRASS, 0, 0);
    for (const ox of [17, 20]) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) st.setTileSilent(ox + dx, 10 + dy, PILE, 0, 0);
    const fixed = repairZeroFramePileStyles(st);
    expect(fixed).toBe(18);   // 3 组 × 6 格
    const styleOf = (x: number) => Math.floor(st.frameX[st.idx(x, 10)] / 54);
    expect(styleOf(10)).toBeGreaterThanOrEqual(52); expect(styleOf(10)).toBeLessThanOrEqual(54);
    expect(st.frameX[st.idx(12, 11)] - st.frameX[st.idx(10, 11)]).toBe(36);   // 组内 dx=2
    for (const ox of [17, 20]) {
      const s = styleOf(ox);
      expect(s).toBeGreaterThanOrEqual(14); expect(s).toBeLessThanOrEqual(16);
    }
    // 幂等：再跑零修复
    expect(repairZeroFramePileStyles(st)).toBe(0);
  });
});

describe('读档修复 repairZeroFrameDungeonDecor（2026-08-17 地牢陈设）', () => {
  it('蓝砖墙 7 → 家具主题 0 列样式；旗帜 16-21；幂等；非地牢墙不动', async () => {
    const { repairZeroFrameDungeonDecor } = await import('../src/world/gen/vanilla/DungeonDecorRepair');
    const st = new TileStore(48, 48);
    const CHAIR = TILE_BY_KEY['chair']!;
    const TABLE = TILE_BY_KEY['table']!;
    const BANNER = TILE_BY_KEY['v_91_banners']!;
    const setWall = (x: number, y: number, wall: number) => { st.wall[st.idx(x, y)] = wall; };
    // 蓝砖墙房：桌(3×2) + 椅(1×2) + 旗(1×3)
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) { st.setTileSilent(10 + dx, 10 + dy, TABLE, 0, 0); setWall(10 + dx, 10 + dy, 7); }
    for (let dy = 0; dy < 2; dy++) { st.setTileSilent(15, 10 + dy, CHAIR, 0, 0); setWall(15, 10 + dy, 7); }
    for (let dy = 0; dy < 3; dy++) { st.setTileSilent(18, 10 + dy, BANNER, 0, 0); setWall(18, 10 + dy, 7); }
    // 泥土地上一组桌（非地牢墙 → 不动）
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) st.setTileSilent(30 + dx, 10 + dy, TABLE, 0, 0);
    const fixed = repairZeroFrameDungeonDecor(st);
    expect(fixed).toBe(6 + 2 + 3);                       // 桌 6 + 椅 2 + 旗 3；泥桌 0
    // 桌样式 10（蓝列）→ 原始帧 fx = 10*54 = 540 + 列偏移
    expect(st.frameX[st.idx(10, 10)]).toBe(10 * 54);
    expect(st.frameX[st.idx(12, 11)]).toBe(10 * 54 + 36);
    // 椅样式 13 → fx = 13*18 = 234（1 宽）
    expect(st.frameX[st.idx(15, 10)]).toBe(13 * 18);
    // 旗样式 ∈ 16-17（蓝族 variant 0）
    const bs = st.frameX[st.idx(18, 10)] / 18;
    expect(bs).toBeGreaterThanOrEqual(16); expect(bs).toBeLessThanOrEqual(17);
    // 泥桌保持零帧
    expect(st.frameX[st.idx(30, 10)]).toBe(0);
    // 幂等
    expect(repairZeroFrameDungeonDecor(st)).toBe(0);
  });
});
