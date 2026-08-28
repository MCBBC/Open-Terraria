// 历史索引帧修复纯函数（#perf2026-08-28 从 Game.repairIndexFrames 平移为
// src/world/repairIndexFrames.ts，worker 读档管线沉降前调用）：
// ① 2×2 宝箱格索引帧 → ×18 像素帧；② 幂等（二跑 0 格，值不再翻倍）；
// ③ 圣诞树 sheet171 索引帧约定豁免（锚 frameX=10 哨兵等原样保留）；
// ④ 全 0 帧是 wld 残缺帧交渲染端重建，不在此修。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { repairIndexFramesInStore } from '../src/world/repairIndexFrames';
import { TILE_DEFS } from '../src/data/tiles';

/** 按内部 id 查表 */
const CHEST = TILE_DEFS.findIndex((d) => d?.key === 'chest');
const XMAS = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 171);
expect(CHEST).toBeGreaterThan(0);
expect(XMAS).toBeGreaterThan(0);

function store10x10(): TileStore {
  const st = new TileStore(12, 12);
  return st;
}
const setCell = (st: TileStore, x: number, y: number, type: number, fx: number, fy: number) => {
  const i = st.idx(x, y);
  st.type[i] = type;
  st.flags[i] = 1;
  st.frameX[i] = fx;
  st.frameY[i] = fy;
};

describe('repairIndexFramesInStore', () => {
  it('2×2 宝箱格索引帧 → 全格 ×18（仅在左上角触发一次，4 格）', () => {
    const st = store10x10();
    // 左上角 (2,2) 起的宝箱：旧生成器写的格索引帧
    setCell(st, 2, 2, CHEST, 0, 0);
    setCell(st, 3, 2, CHEST, 1, 0);
    setCell(st, 2, 3, CHEST, 0, 1);
    setCell(st, 3, 3, CHEST, 1, 1);
    const fixed = repairIndexFramesInStore(st);
    expect(fixed).toBe(4);
    const f = (x: number, y: number) => {
      const i = st.idx(x, y);
      return [st.frameX[i], st.frameY[i]];
    };
    expect(f(2, 2)).toEqual([0, 0]);
    expect(f(3, 2)).toEqual([18, 0]);
    expect(f(2, 3)).toEqual([0, 18]);
    expect(f(3, 3)).toEqual([18, 18]);
  });

  it('幂等：第二次扫描 0 格且数值不变', () => {
    const st = store10x10();
    setCell(st, 2, 2, CHEST, 1, 1);
    setCell(st, 3, 2, CHEST, 0, 1);
    setCell(st, 2, 3, CHEST, 1, 0);
    setCell(st, 3, 3, CHEST, 1, 1);
    expect(repairIndexFramesInStore(st)).toBe(4);
    expect(repairIndexFramesInStore(st)).toBe(0);
    // 数值不被二次翻倍
    expect(() => repairIndexFramesInStore(st)).not.toThrow();
  });

  it('合法像素帧（任一格 ≥18）不触碰', () => {
    const st = store10x10();
    setCell(st, 2, 2, CHEST, 18, 0);   // 已是像素态（右列或第二行风格）
    setCell(st, 3, 2, CHEST, 36, 0);
    setCell(st, 2, 3, CHEST, 0, 18);
    setCell(st, 3, 3, CHEST, 18, 18);
    expect(repairIndexFramesInStore(st)).toBe(0);
  });

  it('全 0 帧（wld 残缺帧）不修——交渲染端锚点扫描重建', () => {
    const st = store10x10();
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) setCell(st, 4 + dx, 4 + dy, CHEST, 0, 0);
    expect(repairIndexFramesInStore(st)).toBe(0);
  });

  it('圣诞树 sheet171：wld 原生索引帧约定原样保留', () => {
    const st = store20();
    // xmas 树 4×8 锚点 frameX=10 哨兵 + 列裸索引 + frameY 位段——任何组合都不改写
    setCell(st, 4, 2, XMAS, 10, 0);
    setCell(st, 5, 2, XMAS, 5, 3);
    setCell(st, 6, 2, XMAS, 1, 7);
    setCell(st, 7, 2, XMAS, 1, 1);
    expect(repairIndexFramesInStore(st)).toBe(0);
    expect(st.frameX[st.idx(4, 2)]).toBe(10);
  });
});

function store20(): TileStore {
  return new TileStore(24, 24);
}
