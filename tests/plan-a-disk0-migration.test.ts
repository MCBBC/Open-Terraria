// ★方案 A 阶段 2 专项回归（BJ264 2026-09-22）：disk-0 怪癖迁移——★唯一真险点。
// 旧 serialize `it.id === 0 ? 0` 特判把【旧 internal 0 号位物品】（=重排前的
// vi_109 魔力水晶）落盘为磁盘 0。方案 A 重排后 0 号位=原版 netID 0 语义（空洞、
// 无 def），读档 `.get(0)` 将静默归 0 丢水晶 → SaveFile.ts 读档边界显式迁移：
// 磁盘 0 → MANA_CRYSTAL_IID（vi_109 内部 id,恒等域下=109）。
// ★变异判据：摘除 SaveFile.ts mapItem 的 `it.id === 0 ? MANA_CRYSTAL_IID` 迁移臂
//   （改回 `?? 0` 面）→ 本件「旧档磁盘 0」两条用例红（水晶丢失）。
// ★边界钉死：
//   · serialize 写出面=写新序（水晶落盘 109 非 0;`it.id === 0` 特判已撤）；
//   · v3 armor/dye/trash/misc 裸下标段不在此迁移（快照[0]='dirt_block' 键链=独立域）；
//   · v2 直读分支不挂迁移（既有「接受破损」政策;磁盘 0 归空洞优于错件幽灵）。
import { describe, it, expect } from 'vitest';
import { saveGame, loadSaveData } from '../src/save/SaveFile';
import type { SaveData } from '../src/save/serialize';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, ITEM_DEFS, ITEM_INTERNAL_OF_STABLE } from '../src/data/items';
import { LEGACY_KEY_OF_INTERNAL_V3, viKeyOfRetired } from '../src/data/itemMigration';

const MANA = ITEM_BY_KEY['vi_109_mana_crystal']!;

const mkEmpty = () => {
  const world = new World(80, 40, 42, 'disk0');
  const player = new Player(100, 100, new Inventory());
  return JSON.parse(saveGame(world, player, 0)) as SaveData;
};

describe('方案 A disk-0 迁移（★唯一真险专项,BJ264）', () => {
  it('重排后布局锚:0 号位=空洞;魔力水晶=internal 109（恒等域）', () => {
    expect(ITEM_DEFS[0]).toBeUndefined();          // 原版 netID 0 语义（无 vi_0 def）
    expect(MANA).toBe(109);
    expect(ITEM_INTERNAL_OF_STABLE.get(109)).toBe(109);
  });

  it('旧档磁盘 0(inventory)→ 读入魔力水晶（摘迁移臂必红）', () => {
    const data = mkEmpty();
    data.player.inventory = [{ id: 0, stack: 1 }];
    const { player } = loadSaveData(data);
    expect(player.inventory[0]?.id).toBe(MANA);
    expect(ITEM_DEFS[player.inventory[0]!.id]?.key).toBe('vi_109_mana_crystal');
  });

  it('旧档磁盘 0(chest)→ 读入魔力水晶（摘迁移臂必红）', () => {
    const data = mkEmpty();
    data.chests = [{ x: 5, y: 5, items: [{ id: 0, stack: 3 }, null] }];
    const { world } = loadSaveData(data);
    expect(world.chests[0].items[0]?.id).toBe(MANA);
    expect(world.chests[0].items[0]?.stack).toBe(3);
  });

  it('round-trip(数据形):旧编码 0 → 读=水晶;新编码 109 → 读=水晶（编码归正后稳定）', () => {
    const legacy = mkEmpty();
    legacy.player.inventory = [{ id: 0, stack: 5 }];
    const l1 = loadSaveData(legacy);
    expect(l1.player.inventory[0]?.id).toBe(MANA);
    // 重存盘后的磁盘形态=109（新序;真实 saveGame 写出面由下方新档用例锁）
    // ——以其再读,水晶仍在
    const migrated = mkEmpty();
    migrated.player.inventory = [{ id: 109, stack: 5 }];
    const l2 = loadSaveData(migrated);
    expect(l2.player.inventory[0]?.id).toBe(MANA);
  });

  it('新档写出面:魔力水晶落盘=109 非 0（serialize 特判撤除）', () => {
    const world = new World(80, 40, 42, 'disk0');
    const player = new Player(100, 100, new Inventory());
    player.inv.add(MANA, 2);
    const data = JSON.parse(saveGame(world, player, 0)) as SaveData;
    const slot = data.player.inventory.find((it) => it && it.id === 109);
    expect(slot).toBeDefined();
    expect(slot!.stack).toBe(2);
    expect(slot!.id).not.toBe(0);
  });

  it('v3 armor 裸下标段磁盘 0=快照[0]=dirt_block 退役链(独立域,非水晶)', () => {
    expect(LEGACY_KEY_OF_INTERNAL_V3[0]).toBe('dirt_block');
    const data = mkEmpty();
    data.version = 3;
    delete (data as unknown as Record<string, unknown>).idScheme;
    data.player.armor = [{ id: 0, stack: 1 }];
    const { player: p3 } = loadSaveData(data);
    const wantKey = viKeyOfRetired('dirt_block')!;
    expect(p3.armor?.[0]?.id).toBe(ITEM_BY_KEY[wantKey]);   // 快照键链 → vi_2 现内部 id
    expect(ITEM_DEFS[p3.armor?.[0]?.id!].key).toMatch(/^vi_2_/);
  });
});
