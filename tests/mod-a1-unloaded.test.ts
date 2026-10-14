// ★A1 守卫(2026-10-14):缺 mod 存档占位恢复(tML UnloadedItem 语义)——
//   ①缺 mod 读档:未知 stable id → 占位 def+槽位保真(不归 0)
//   ②占位期再存档:id 原样落盘(不洗档)
//   ③重启用 mod:registerModItem 覆写豁免让位真 def
//   ④TE 携带:缺 mod teMods 条目 round-trip 保真
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

class MemStorage {
  reg = '[]';
  zips = new Map<string, Blob>();
  async getRegistry() { return this.reg; }
  async setRegistry(json: string) { this.reg = json; }
  async putZip(id: string, blob: Blob) { this.zips.set(id, blob); return true; }
  async getZip(id: string) { return this.zips.get(id) ?? null; }
  async deleteZip(id: string) { this.zips.delete(id); }
}
const nodeEntryLoader = async (): Promise<unknown> => undefined;
beforeEach(() => vi.resetModules());

function unloadedSaveJson(): string {
  // 手造缺 mod 档:槽 0=mod 物品 stable 30007;teMods=缺 mod 条目
  return JSON.stringify({
    format: 'sandboxworld.save', version: 5,
    header: { name: 'a1', seed: 1, width: 64, height: 32, spawn: [10, 10], groundLevel: 20, rockLevel: 30, created: 0, playTimeMs: 0 },
    clock: { timeOfDay: 0, dayCount: 1 },
    tiles: '', walls: '', liquid: '', liquidType: '',
    chests: [], signs: [],
    teMods: [{ k: 'mod_ghost_te', x: 5, y: 6, d: { items: [] } }],
    player: {
      hp: 100, x: 100, y: 100, inventory: [
        { id: 30007, stack: 3 },
        null,
      ], selected: 0,
      baseMaxHp: 100, baseMaxMana: 20, mana: 20,
      banks: [], armor: [], dye: [], trash: null, miscEquips: [], miscDyes: [], loadouts: [],
      buffs: [],
    },
    flags: {},
  });
}

describe('A1:缺 mod 存档占位恢复', () => {
  it('占位保真:读档不归 0/占位 def 可用/再存档 id 原样/重启用让位真 def', async () => {
    // ---- 阶段 1:缺 mod 读档(纯原版域) ----
    const { loadSave, saveGame } = await import('../src/save/SaveFile');
    const { ITEM_DEFS, ITEM_BY_KEY, registerUnloadedItemPlaceholder, registerModItem } = await import('../src/data/items');
    const back = loadSave(unloadedSaveJson());
    const slot = back.player?.inventory?.[0];
    expect(slot?.id).toBe(30007);   // ★A1:保真(旧=归 0 洗档)
    expect(slot?.stack).toBe(3);
    // 占位 def:消费面拿到合法 def(不可用/无战斗面)
    const ph = ITEM_DEFS[30007] as { unloaded?: boolean; maxStack: number };
    expect(ph?.unloaded).toBe(true);
    expect(ph?.maxStack).toBe(999);
    expect(ITEM_BY_KEY['mod_unloaded_30007']).toBe(30007);

    // ---- 阶段 2:占位期再存档(不洗档) ----
    const { World } = await import('../src/world/World');
    const { Player } = await import('../src/entities/Player');
    const { Inventory } = await import('../src/items/Inventory');
    const world = back.world!;
    const player = new Player(100, 100, new Inventory());
    player.inv.slots[0] = { id: 30007, stack: 3 };
    const json2 = saveGame(world, player, 0);
    expect(json2).toContain('"id":30007');   // 槽位原样落盘

    // ---- 阶段 3:重启用 mod(registerModItem 覆写豁免让位真 def) ----
    registerModItem({ key: 'mod_reborn_sword', name: '真武器', value: 100 }, 30007);
    const real = ITEM_DEFS[30007] as { key: string; unloaded?: boolean };
    expect(real?.key).toBe('mod_reborn_sword');
    expect(real?.unloaded).toBeUndefined();   // 占位旗已让位

    // ---- 阶段 4:TE 携带 round-trip ----
    expect((world.store as unknown as { unloadedTEs?: unknown[] }).unloadedTEs).toHaveLength(1);
    const json3 = saveGame(world, new Player(100, 100, new Inventory()), 0);
    expect(json3).toContain('"k":"mod_ghost_te"');   // 缺 mod TE 条目不洗
    void registerUnloadedItemPlaceholder;
  }, 60_000);

  it('幂等:同 stable 重复占位注册=no-op', async () => {
    const { registerUnloadedItemPlaceholder, ITEM_DEFS } = await import('../src/data/items');
    expect(registerUnloadedItemPlaceholder(30123)).toBe(30123);
    const first = ITEM_DEFS[30123];
    expect(registerUnloadedItemPlaceholder(30123)).toBe(30123);   // 幂等
    expect(ITEM_DEFS[30123]).toBe(first);
  });
});
