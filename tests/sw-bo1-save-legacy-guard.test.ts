// ★SW-BO1 2026-09-07（RB5b 建议清偿守卫）：v3 存档 armor/dye/trash/misc/loadouts
//  裸下标解码的越界兜底——mapLegacySlot（SaveFile.ts remapPlayerSlots 内）对
//  `it.id >= LEGACY_KEY_OF_INTERNAL_V3.length` 的下标落 0（空槽），不再把越界
//  裸下标当当前内部 id 直用（物品表冻结后新件/表位移存档的错件幽灵面）。
//  行为面经 saveGame→改 version=3→loadSaveData 全链驱动（v3 面=armor 段走
//  mapLegacySlot;v4 面走 mapItem 不受影响——同测对照）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { saveGame, loadSaveData } from '../src/save/SaveFile';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { LEGACY_KEY_OF_INTERNAL_V3 } from '../src/data/itemMigration';
import { ITEM_BY_KEY } from '../src/data/items';

describe('SW-BO1 RB5b：v3 裸下标越界兜底（mapLegacySlot）', () => {
  const mk = () => {
    const world = new World(80, 40, 42, 'p');
    const player = new Player(100, 100, new Inventory());
    const data = JSON.parse(saveGame(world, player, 0));
    data.version = 3;                       // 强制 v3 面（armor/dye/trash = 裸内部下标）
    delete data.idScheme;
    return data;
  };

  it('越界裸下标（≥迁移快照表长）→ 落 0 空槽（不错件）', () => {
    const data = mk();
    data.player.armor = [{ id: 99999999, stack: 1 }];
    const { player } = loadSaveData(data);
    expect(player.armor?.[0]?.id).toBe(0);
  });

  it('负下标 → 落 0（防御档,与越界同归）', () => {
    const data = mk();
    data.player.trash = { id: -5, stack: 1 };
    const { player } = loadSaveData(data);
    expect(player.trash?.id).toBe(0);
  });

  it('表内 vi_ 键下标照常反查（兜底不伤既有迁移面）', () => {
    // 找一个表内 vi_ 键槽位（迁移快照的合法存量面）
    let idx = -1, key = '';
    for (let i = 0; i < LEGACY_KEY_OF_INTERNAL_V3.length; i++) {
      const k = LEGACY_KEY_OF_INTERNAL_V3[i];
      if (typeof k === 'string' && /^vi_\d+_/.test(k) && ITEM_BY_KEY[k] !== undefined) { idx = i; key = k; break; }
    }
    expect(idx).toBeGreaterThanOrEqual(0);   // 表必须仍有 vi_ 存量（vacuous 守卫）
    const data = mk();
    data.player.armor = [{ id: idx, stack: 1 }];
    const { player } = loadSaveData(data);
    expect(player.armor?.[0]?.id).toBe(ITEM_BY_KEY[key]);
  });

  it('v4 面（稳定 id 域）不受兜底影响：越界稳定 id 经 mapItem 归 0,表内 id 原样映射', () => {
    const data = mk();
    data.version = 5;
    data.idScheme = 'sheet';
    data.player.armor = [{ id: 99999999, stack: 1 }];   // 未知稳定 id → ITEM_INTERNAL_OF_STABLE 缺 → 0
    const { player } = loadSaveData(data);
    expect(player.armor?.[0]?.id).toBe(0);
  });
});
