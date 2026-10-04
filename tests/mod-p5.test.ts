// P5 id 平移完整解 测试(2026-10-04):卸前排位 mod → 后位 mod id 平移 → 存档
// 重映射纠偏。两阶段 vi.resetModules = 独立模块态(阶段1 ra+rb 装载/存档;
// 阶段2 仅 rb 重载=平移现场 → loadSave 重映射内容不错位)。
import { describe, it, expect, vi } from 'vitest';
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

const nodeEntryLoader = async (): Promise<unknown> => undefined;   // P5 无脚本

function buildModZip(id: string, itemKey: string, tileKey?: string): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'mod.json': strToU8(JSON.stringify({ id, name: id, version: '1.0.0', api: 1, side: 'both' })),
    [`content/items/${itemKey}.json`]: strToU8(JSON.stringify({ key: itemKey, name: itemKey, value: 100 })),
  };
  if (tileKey) {
    files[`content/tiles/${tileKey}.json`] = strToU8(JSON.stringify({
      key: tileKey, name: tileKey, solid: true, pick: 0, mapColor: '#888',
      texture: 'textures/t.png', dropItem: itemKey,
    }));
    files['textures/t.png'] = new Uint8Array(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  }
  return zipSync(files);
}

describe('P5:id 平移完整解(存档映射+读档重映射)', () => {
  it('卸 ra(排位前 mod)后 rb id 平移,旧存档经重映射内容不错位', async () => {
    // ---- 阶段 1:ra+rb 双 mod 装载 → 存档(rb 物品入包+rb tile 放置) ----
    vi.resetModules();
    const { ModStore } = await import('../src/mods/store');
    const { readModPack } = await import('../src/mods/pack');
    const { loadModsPhase1, getModLoadResult } = await import('../src/mods/loader');
    const { World } = await import('../src/world/World');
    const { Player } = await import('../src/entities/Player');
    const { Inventory } = await import('../src/items/Inventory');
    const { saveGame } = await import('../src/save/SaveFile');
    const { TILE_BY_KEY } = await import('../src/data/tiles');

    const storage = new MemStorage();
    const store = new ModStore(storage as never);
    const raBytes = buildModZip('ra', 'ra_mat');
    const rbBytes = buildModZip('rb', 'rb_gem', 'rb_ore');
    await store.install(readModPack(raBytes).manifest, raBytes);
    await store.install(readModPack(rbBytes).manifest, rbBytes);
    await loadModsPhase1(storage, { entryLoader: nodeEntryLoader });

    const alloc1 = getModLoadResult()!.allocation!;
    expect(alloc1.items.get('mod_ra_ra_mat')).toBe(30000);
    expect(alloc1.items.get('mod_rb_rb_gem')).toBe(30001);
    const rbTileStable1 = alloc1.tiles.get('mod_rb_rb_ore')!;

    const world = new World(64, 32, 42, 't');
    const player = new Player(100, 100, new Inventory());
    player.inv.slots[0] = { id: alloc1.items.get('mod_rb_rb_gem')!, stack: 3 };
    const rbTileInternal = TILE_BY_KEY['mod_rb_rb_ore']!;
    world.store.setTile(12, 12, rbTileInternal);
    const json = saveGame(world, player, 0);
    expect(json).toContain('"itemIds"');   // 存档头携带分配映射

    // ---- 阶段 2:卸 ra(fresh registry)→ rb id 平移 → 旧档重映射读回 ----
    vi.resetModules();
    const L2 = await import('../src/mods/loader');
    const { ModStore: ModStore2 } = await import('../src/mods/store');
    const { loadModsPhase1: load2 } = await import('../src/mods/loader');
    const { loadSave } = await import('../src/save/SaveFile');
    const { TILE_BY_KEY: TILE_BY_KEY2 } = await import('../src/data/tiles');
    void L2;

    const store2 = new ModStore2(storage as never);
    await store2.remove('ra');                     // 卸前排位 mod = 平移触发
    const result2 = await load2(storage, { entryLoader: nodeEntryLoader });
    const alloc2 = result2.allocation!;
    // 平移实证:rb 物品从 30001 → 30000
    expect(alloc2.items.get('mod_rb_rb_gem')).toBe(30000);
    expect(alloc2.tiles.get('mod_rb_rb_ore')).toBe(1030);   // tile 段首=不变

    const back = loadSave(json);
    // 物品:旧 stable 30001 经重映射 → 当前 30000(内容=rb_gem,未错位未丢失)
    const slot = back.player?.inventory?.[0];
    expect(slot?.id).toBe(alloc2.items.get('mod_rb_rb_gem'));
    expect(slot?.stack).toBe(3);
    // tile:stable 1030 未漂 → 原位还原
    expect(back.world?.store?.get(12, 12)).toBe(TILE_BY_KEY2['mod_rb_rb_ore']);
  }, 60_000);

  it('旧档形态兼容:存档无 mods 键(预 P1 旧档)读档不炸零重映射', async () => {
    vi.resetModules();
    const { ModStore } = await import('../src/mods/store');
    const { readModPack } = await import('../src/mods/pack');
    const { loadModsPhase1 } = await import('../src/mods/loader');
    const { World } = await import('../src/world/World');
    const { Player } = await import('../src/entities/Player');
    const { Inventory } = await import('../src/items/Inventory');
    const { saveGame, loadSave } = await import('../src/save/SaveFile');

    const storage = new MemStorage();
    const store = new ModStore(storage as never);
    const bytes = buildModZip('solo', 'solo_mat');
    await store.install(readModPack(bytes).manifest, bytes);
    await loadModsPhase1(storage, { entryLoader: nodeEntryLoader });

    const world = new World(64, 32, 42, 't');
    const player = new Player(100, 100, new Inventory());
    player.inv.slots[0] = { id: 30000, stack: 2 };
    const json = saveGame(world, player, 0);
    // 抹掉 mods 键 = 预 P1 旧档形态:无 remap 来源,decode 走当前注册表(合法)
    const tampered = JSON.parse(json) as Record<string, unknown>;
    delete tampered.mods;
    const back = loadSave(JSON.stringify(tampered));
    expect(back.player?.inventory?.[0]?.id).toBe(30000);   // 同注册表内合法解出
    expect(back.player?.inventory?.[0]?.stack).toBe(2);
    // 真"缺 mod"形态(worker 无桥/未注册)由 mod-save-bridge.test.ts fresh 态覆盖
  }, 60_000);
});
