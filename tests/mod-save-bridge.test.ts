// mod worker 桥语义测试(2026-10-04):模拟 worker 上下文(独立模块态、无 def 本体),
// applyModItemIds/applyModTileStableMap 补表后,序列化/读档的稳定 id 翻译对 mod 内容成立。
// 与 mod-loader-core.test.ts 分文件=各自 fresh module registry,互不污染。
import { describe, it, expect } from 'vitest';
import { ITEM_DEFS, ITEM_BY_KEY, ITEM_INTERNAL_OF_STABLE, ITEM_STABLE_OF_INTERNAL, applyModItemIds } from '../src/data/items';
import { TILE_DEFS, TILE_INTERNAL_OF_STABLE, TILE_STABLE_OF_INTERNAL, applyModTileStableMap } from '../src/data/tiles';

describe('mod id 桥(worker 侧纯 id 场景)', () => {
  it('applyModItemIds 接长恒等域并填双向映射;洞不填', () => {
    expect(ITEM_DEFS.length).toBeLessThan(30000);   // worker 态=纯原版域
    applyModItemIds([30000, 30001, 65536, 29999]);  // 越段值忽略
    expect(ITEM_STABLE_OF_INTERNAL[30001]).toBe(30001);
    expect(ITEM_INTERNAL_OF_STABLE.get(30000)).toBe(30000);
    expect(ITEM_INTERNAL_OF_STABLE.get(30001)).toBe(30001);
    // 恒等域对原版段保真
    expect(ITEM_STABLE_OF_INTERNAL[1]).toBe(1);
    expect(ITEM_STABLE_OF_INTERNAL[20753]).toBe(20753);
    // 未推送的洞段不映射(worker 收不到=读档归 0,既有兜底语义)
    expect(ITEM_INTERNAL_OF_STABLE.get(30500)).toBeUndefined();
    // 幂等
    applyModItemIds([30000]);
    expect(ITEM_INTERNAL_OF_STABLE.get(30000)).toBe(30000);
  });

  it('applyModTileStableMap 补对偶映射;原版段保真', () => {
    const vanillaLen = TILE_DEFS.length;
    applyModTileStableMap([[vanillaLen, 1030], [vanillaLen + 1, 1031], [0, 999]]);
    expect(TILE_STABLE_OF_INTERNAL[vanillaLen]).toBe(1030);
    expect(TILE_INTERNAL_OF_STABLE[1030]).toBe(vanillaLen);
    expect(TILE_INTERNAL_OF_STABLE[1031]).toBe(vanillaLen + 1);
    // 原版段逐值保真(stone internal 2 → sheet 1;dirt internal 1 → PRIV 1029,
    //  sheet 0 已让位 air 哨兵——tiles.ts:1014 注)
    expect(TILE_STABLE_OF_INTERNAL[2]).toBe(1);
    expect(TILE_STABLE_OF_INTERNAL[1]).toBe(1029);
    // 非法 stable 越段忽略(999 未映射=0 哨兵)
    expect(TILE_INTERNAL_OF_STABLE[999]).toBe(0);
    // 幂等
    applyModTileStableMap([[vanillaLen, 1030]]);
    expect(TILE_INTERNAL_OF_STABLE[1030]).toBe(vanillaLen);
  });

  it('byKey 反查不受桥影响(worker 侧无 mod 键)', () => {
    expect(ITEM_BY_KEY['mod_testmod_test_sword']).toBeUndefined();
  });
});
