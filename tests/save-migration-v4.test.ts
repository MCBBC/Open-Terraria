// 存档 v4 迁移回归:armor/dye/trash/misc 段稳定 id 化 + v3 旧档裸下标经迁移锚还原。
// v3 语义(本次退役前):inventory/banks/chests=稳定 id;armor/dye/trash/misc/loadouts=裸内部下标。
// v4:全槽位稳定 id。v3 旧档 armor 段用 LEGACY_KEY_OF_INTERNAL_V3 快照反查再转 vi_。
import { describe, it, expect } from 'vitest';
import { saveGame, loadSave, loadSaveData } from '../src/save/SaveFile';
import type { SaveData } from '../src/save/serialize';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { LEGACY_KEY_OF_INTERNAL_V3, viIdOfRetired, DELETED_KEYS } from '../src/data/itemMigration';

const mkWorld = (): World => {
  const w = new World(64, 32, 42, 'v4测试');
  w.spawnX = 30; w.spawnY = 10;
  for (let x = 0; x < 64; x++) for (let y = 20; y < 32; y++) w.store.setTileSilent(x, y, y > 26 ? 3 : 1);
  return w;
};

describe('存档 v4', () => {
  it('armor/dye/trash/misc 走稳定 id 往返(含 favorited/prefix)', () => {
    const world = mkWorld();
    const inv = new Inventory();
    const player = new Player(100, 100, inv);
    const torchId = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[8]];
    player.inv.armor[0] = { id: torchId, stack: 1, favorited: true, prefix: 62 };
    player.inv.armor[3] = { id: torchId, stack: 2, prefix: 81 };
    player.inv.trash = { id: torchId, stack: 5 };
    const json = saveGame(world, player, 0);
    const data = JSON.parse(json) as SaveData;
    // ★幽灵保域批（2026-09-02）：写侧版本 4→5（tileActive 差分通道落地）——
    //   v4 全槽位稳定 id 语义原样延续，v4 档继续可读（loadSaveData >=4 门不受扰）
    expect(data.version).toBe(5);
    expect(data.player.armor?.[0]?.favorited).toBe(true);
    expect(data.player.armor?.[0]?.prefix).toBe(62);
    const back = loadSave(json);
    expect(back.player.armor?.[0]?.id).toBe(torchId);
    expect(back.player.armor?.[0]?.favorited).toBe(true);
    expect(back.player.armor?.[3]?.prefix).toBe(81);
    expect(back.player.trash?.stack).toBe(5);
  });

  it('v3 旧档 armor 裸下标 → 迁移锚反查 → 本地键转 vi_', () => {
    // 模拟旧构建写出的 v3 档:armor 段 = 当时内部下标(iron_helmet)
    const v3Idx = LEGACY_KEY_OF_INTERNAL_V3.indexOf('iron_helmet');
    expect(v3Idx).toBeGreaterThan(0);
    const world = mkWorld();
    const player = new Player(100, 100, new Inventory());
    player.inv.armor[0] = { id: ITEM_BY_KEY['torch'], stack: 1 };
    const json = saveGame(world, player, 0);
    const data = JSON.parse(json) as SaveData;
    data.version = 3;
    data.player.armor = [{ id: v3Idx, stack: 1 }, null];
    const back = loadSaveData(data);
    // iron_helmet → 原版 90 → vi_ 键内部 id
    const expected = viIdOfRetired('iron_helmet');
    expect(expected).toBeGreaterThan(0);
    expect(back.player.armor?.[0]?.id).toBe(expected);
    expect(ITEM_DEFS[back.player.armor![0]!.id].key).toBe(VANILLA_ITEM_KEY_BY_ID[90]);
  });

  it('v3 旧档 armor 裸下标 → vi_ 键条目原地保真(同 vid 双注册归一)', () => {
    const v3Idx = LEGACY_KEY_OF_INTERNAL_V3.findIndex((k) => k.startsWith('vi_3509_'));
    expect(v3Idx).toBeGreaterThan(0);
    const world = mkWorld();
    const json = saveGame(world, new Player(100, 100, new Inventory()), 0);
    const data = JSON.parse(json) as SaveData;
    data.version = 3;
    data.player.armor = [{ id: v3Idx, stack: 1 }, null];
    const back = loadSaveData(data);
    expect(ITEM_DEFS[back.player.armor![0]!.id].key).toMatch(/^vi_3509_/);
  });

  it('v3 旧档 armor 裸下标 → 纯自创删除键(wood_pickaxe)归 0 不炸', () => {
    const v3Idx = LEGACY_KEY_OF_INTERNAL_V3.indexOf('wood_pickaxe');
    expect(v3Idx).toBeGreaterThan(0);
    expect(DELETED_KEYS.has('wood_pickaxe')).toBe(true);
    const world = mkWorld();
    const json = saveGame(world, new Player(100, 100, new Inventory()), 0);
    const data = JSON.parse(json) as SaveData;
    data.version = 3;
    data.player.armor = [{ id: v3Idx, stack: 1 }, null];
    const back = loadSaveData(data);
    expect(back.player.armor?.[0]?.id).toBe(0);
  });
});
