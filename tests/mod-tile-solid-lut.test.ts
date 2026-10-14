// ★SOLID_LUT 扩容债(2026-10-14):TileStore.SOLID_LUT 模块加载期按当时
// TILE_DEFS.length 定长物化,mod tile 运行期注册(762+)越界读 undefined=永非实心
// → 灾厄地形全程不可踩踏(碰撞/刷怪/天气/烘焙五消费面同表同伤)。
// 修复=registerModTile 注册后置钩 + TileStore 订阅扩容。本测试锁三序:
//   ①后注册(TileStore 先加载=运行时常态)扩容回填
//   ②实心/非实心二值正确(消费面 `=== 1` 谓词)
//   ③store.isSolid 端到端(真消费路径)
import { describe, expect, it } from 'vitest';
import { TILE_DEFS, registerModTile, TILE_BY_KEY, TILE_INTERNAL_OF_STABLE } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

// 挑两个未被同 worker 其他用例占用的 stable id(并发测试文件共享 tiles 模块)
function freeStableIds(n: number): number[] {
  const out: number[] = [];
  for (let s = 4095; out.length < n && s >= 1030; s--) {
    if (TILE_INTERNAL_OF_STABLE[s] === 0) out.push(s);
  }
  return out;
}

describe('mod tile SOLID_LUT 扩容钩', () => {
  it('注册后 LUT 扩容且回填实心位(后注册序=运行时常态)', () => {
    const [sidA, sidB] = freeStableIds(2);
    const lenBefore = TILE_DEFS.length;
    const solidId = registerModTile({ key: 'mod_test_solid_lut_a', name: 'a', solid: true }, sidA);
    const softId = registerModTile({ key: 'mod_test_solid_lut_b', name: 'b', solid: false }, sidB);
    expect(solidId).toBe(lenBefore);
    expect(softId).toBe(lenBefore + 1);
    // LUT 与 TILE_DEFS 同长(越界读消失)
    expect(TileStore.SOLID_LUT.length).toBe(TILE_DEFS.length);
    expect(TileStore.SOLID_LUT[solidId]).toBe(1);
    expect(TileStore.SOLID_LUT[softId]).toBe(0);
  });

  it('store.isSolid 端到端(mod 实心地形可踩,原版谓词路径不回归)', () => {
    const st = new TileStore(8, 8);
    const id = TILE_BY_KEY['mod_test_solid_lut_a'];
    expect(id).toBeGreaterThan(752);   // mod id 段(1030 起 stable,内部 id 762+)
    st.setTile(3, 4, id);
    expect(st.isSolid(3, 4)).toBe(true);
    st.setTile(5, 4, TILE_BY_KEY['mod_test_solid_lut_b']);
    expect(st.isSolid(5, 4)).toBe(false);
    // 原版抽查不回归(dirt(sheet0)=内部1 实心 / 树(sheet5) 非实心;内部0=air 空哨)
    const treeId = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 5);
    st.setTile(1, 4, 1);
    expect(st.isSolid(1, 4)).toBe(true);
    st.setTile(2, 4, treeId);
    expect(st.isSolid(2, 4)).toBe(false);
  });
});
