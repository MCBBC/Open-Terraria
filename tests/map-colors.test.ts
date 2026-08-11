// MapColors（生成期预览的 tile→色公共逻辑）确定性测试
import { describe, it, expect } from 'vitest';
import { mapColor24 } from '../src/render/MapColors';
import { World } from '../src/world/World';
import { T, TILE_DEFS } from '../src/data/tiles';

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0').toUpperCase();
}

describe('mapColor24', () => {
  it('优先级：实体 tile > 液体 > 墙 > 天空', () => {
    const w = new World(4, 4, 1, 't');
    const st = w.store;
    const x = 1, y = 1;
    // 天空
    expect(hex(mapColor24(st, x, y))).toBe('#91B9FF'); // 生成期天空兜底（原版渐变浅段近似）
    // 墙
    st.setWallSilent(x, y, 1);
    expect(hex(mapColor24(st, x, y))).not.toBe('#91B9FF'); // 原版墙1=(52,52,52)
    // 液体覆盖墙
    st.setLiquid(x, y, 255, 1);
    expect(hex(mapColor24(st, x, y))).toBe('#093DBF'); // 原版水 array3=(9,61,191)
    // 岩浆
    st.setLiquid(x, y, 255, 2);
    expect(hex(mapColor24(st, x, y))).toBe('#FD2003'); // 原版岩浆 array3=(253,32,3)
    // 实体 tile 覆盖液体
    st.setTileSilent(x, y, T.STONE);
    expect(hex(mapColor24(st, x, y))).toBe('#808080'); // 原版石 sheet1=(128,128,128)
  });

  it('液体需 >32 才显示（原版 Minimap 阈值,MapHelper.cs:1983）', () => {
    const w = new World(2, 2, 1, 't');
    w.store.setLiquid(0, 0, 20, 1);
    expect(hex(mapColor24(w.store, 0, 0))).toBe('#91B9FF');
    w.store.setLiquid(0, 0, 33, 1);
    expect(hex(mapColor24(w.store, 0, 0))).toBe('#093DBF');
  });
});
