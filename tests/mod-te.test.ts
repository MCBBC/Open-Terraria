// ★TE 梯队守卫(2026-10-14):mod tile entity 生命周期——放置自愈建/破坏 onDestroy/
//   逐 tick update/存读 round-trip(SaveData.teMods 段;sw.tileEntity → registry →
//   TileStore.onTileChanged → Game 沿绑定)。
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

function buildModZip(id: string, tileKey: string): Uint8Array {
  const png = new Uint8Array(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  return zipSync({
    'mod.json': strToU8(JSON.stringify({ id, name: id, version: '1.0.0', api: 1, side: 'both' })),
    [`content/tiles/${tileKey}.json`]: strToU8(JSON.stringify({
      key: tileKey, name: tileKey, solid: true, pick: 0, mapColor: '#848', texture: 'textures/t.png',
    })),
    'textures/t.png': png,
  });
}

beforeEach(() => vi.resetModules());

describe('TE 梯队:mod tile entity 生命周期', () => {
  it('放置自愈建/破坏 onDestroy/逐 tick update/存读 round-trip', async () => {
    // ---- 装载(带 TE tile 的 mod)----
    const { ModStore } = await import('../src/mods/store');
    const { readModPack } = await import('../src/mods/pack');
    const { loadModsPhase1 } = await import('../src/mods/loader');
    const { TILE_BY_KEY } = await import('../src/data/tiles');
    const { registerModTileEntity, bindModTileEntities, tickModTileEntities,
      serializeModTEs, restoreModTEs, unbindModTileEntities, hasModTileEntities } =
      await import('../src/mods/tileEntities');
    const { World } = await import('../src/world/World');
    const { Player } = await import('../src/entities/Player');
    const { Inventory } = await import('../src/items/Inventory');
    const { saveGame, loadSave } = await import('../src/save/SaveFile');

    const storage = new MemStorage();
    const store = new ModStore(storage as never);
    const bytes = buildModZip('tet', 'te_machine');
    await store.install(readModPack(bytes).manifest, bytes);
    await loadModsPhase1(storage, { entryLoader: nodeEntryLoader });

    const tid = TILE_BY_KEY['mod_tet_te_machine']!;
    const events: Array<[string, number, number, number?]> = [];
    registerModTileEntity('tet', tid, 'te_machine', {
      create: () => ({ charge: 5 }),
      update: (te) => { te.state.charge = (te.state.charge as number) + 1; events.push(['u', te.x, te.y, te.state.charge as number]); },
      onDestroy: (te) => events.push(['d', te.x, te.y]),
      save: (te) => ({ c: te.state.charge }),
      load: (te, data) => { te.state.charge = (data as { c: number }).c; },
    });
    expect(hasModTileEntities()).toBe(true);

    // ---- 放置自愈建(setTile 派发)----
    const w = new World(64, 32, 42, 'te');
    const st = w.store;
    bindModTileEntities(st);
    st.setTile(5, 5, tid);
    st.setTile(7, 7, tid);
    // tick×2 → 两实例各两拍(charge 5→7)
    tickModTileEntities({ world: { store: st } } as never);
    tickModTileEntities({ world: { store: st } } as never);
    const updates = events.filter((e) => e[0] === 'u');
    expect(updates).toHaveLength(4);
    expect(updates[0]!.slice(1)).toEqual([5, 5, 6]);

    // ---- 破坏 onDestroy ----
    st.setTile(5, 5, 0);
    expect(events.some((e) => e[0] === 'd' && e[1] === 5 && e[2] === 5)).toBe(true);
    tickModTileEntities({ world: { store: st } } as never);
    expect(events.filter((e) => e[0] === 'u')).toHaveLength(5);   // 只剩 (7,7) 一实例

    // ---- 存档 round-trip(saveGame→loadSave)----
    const world2 = new World(64, 32, 42, 'te2');
    bindModTileEntities(world2.store);   // 先绑(Game.start 同序)——实例经放置链建
    world2.store.setTile(7, 7, tid);     // (charge=5→tick×1=6)
    tickModTileEntities({ world: { store: world2.store } } as never);
    const player = new Player(100, 100, new Inventory());
    const json = saveGame(world2, player, 0);
    expect(json).toContain('"teMods"');
    expect(json).toContain('"k":"mod_tet_te_machine"');

    // 读档 → 实例回填(load 钩)+ tick 续走
    const back = loadSave(json);
    const st3 = back.world!.store;
    tickModTileEntities({ world: { store: st3 } } as never);
    const restoreTick = events.slice(-1)[0]!;
    expect(restoreTick[0]).toBe('u');
    expect(restoreTick[1]).toBe(7);
    expect(restoreTick[3]).toBe(7);   // save c=6 → load → tick +1 = 7(钩序闭环)

    // ---- 序列化直查(save 钩产物形)----
    const entries = serializeModTEs(st);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.k).toBe('mod_tet_te_machine');
    expect(entries[0]!.x).toBe(7);
    expect(entries[0]!.d).toEqual({ c: 8 });   // 5+tick×3(2 前置+1 破坏后)

    // ---- 解绑(跨世界隔离:解绑后 setTile 不再建实例)----
    unbindModTileEntities(st);
    st.setTile(9, 9, tid);
    tickModTileEntities({ world: { store: st } } as never);
    expect(events.filter((e) => e[0] === 'u' && e[1] === 9)).toHaveLength(0);
  }, 60_000);
});
