// 探索标记/迷雾缓存失效语义（修 wld 导入白屏崩溃：无条件 bump → GC 风暴）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';

describe('markExplored 版本与脏包围盒（迷雾增量更新数据源）', () => {
  it('首次点亮：bump 版本并记录精确包围盒', () => {
    const w = new World(100, 100, 42);
    w.markExplored(50, 50, 5);
    expect(w.exploredVersion).toBe(1);
    expect(w.exploredDirty).toEqual({ x0: 45, y0: 45, x1: 55, y1: 55 });
    expect(w.explored[50 * 100 + 50]).toBe(1);
  });

  it('重复点亮同一区域：版本不 bump（修复点：旧版无条件 ++ 导致每 15 tick 全量重建雾画布）', () => {
    const w = new World(100, 100, 42);
    w.markExplored(50, 50, 5);
    const v = w.exploredVersion;
    w.markExplored(50, 50, 5);
    w.markExplored(50, 50, 5);
    expect(w.exploredVersion).toBe(v); // 站定不动：不产生任何重建
  });

  it('移动到新区域：bump 且脏包围盒与新区域取并', () => {
    const w = new World(100, 100, 42);
    w.markExplored(50, 50, 5);
    w.markExplored(60, 60, 5);
    expect(w.exploredVersion).toBe(2);
    expect(w.exploredDirty).toEqual({ x0: 45, y0: 45, x1: 65, y1: 65 });
  });

  it('半径裁剪到世界边界：包围盒不越界', () => {
    const w = new World(100, 100, 42);
    w.markExplored(2, 2, 5);
    expect(w.exploredDirty).toEqual({ x0: 0, y0: 0, x1: 7, y1: 7 });
  });
});
