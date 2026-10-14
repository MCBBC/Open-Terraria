// ★红队第七轮 M1 回归锁(2026-10-14):含 tile 的 mod 停用→再启用热重载——
//   旧=TILE_INTERNAL_OF_STABLE 残留→stableId 冲突门整批拒载(tile 域热重载整类失效)。
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

describe('D11-M1:tile 域热重载循环', () => {
  it('tile mod 停用→再启用:teardown 清映射→重装载不撞 stableId 门', async () => {
    const png = new Uint8Array(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
    const bytes = zipSync({
      'mod.json': strToU8(JSON.stringify({ id: 'tmod', name: 'tmod', version: '1.0.0', api: 1, side: 'both' })),
      'content/tiles/t1.json': strToU8(JSON.stringify({ key: 't1', name: 'T1', solid: true, pick: 0, mapColor: '#654', texture: 't.png' })),
      'textures/t.png': png,
    });

    // 装 1
    vi.resetModules();
    let { ModStore } = await import('../src/mods/store');
    let { readModPack } = await import('../src/mods/pack');
    let { loadModsPhase1, getModLoadResult } = await import('../src/mods/loader');
    let { TILE_BY_KEY, _resetModTilesForTests } = await import('../src/data/tiles');
    const { unloadModsForHotReload } = await import('../src/mods/teardown');
    const storage = new MemStorage();
    const store = new ModStore(storage as never);
    await store.install(readModPack(bytes).manifest, bytes);
    await loadModsPhase1(storage, { entryLoader: nodeEntryLoader });
    const tid1 = TILE_BY_KEY['mod_tmod_t1']!;
    expect(tid1).toBeGreaterThan(0);

    // teardown(停用语义)
    await store.setEnabled('tmod', false);
    unloadModsForHotReload();
    // 显式核:映射清(M1 本体)
    const tiles2 = await import('../src/data/tiles');
    expect(tiles2.TILE_BY_KEY['mod_tmod_t1']).toBeUndefined();

    // 重装载 2(再启用语义——旧=registerModTile 撞「stableId 冲突」整批拒载)
    await store.setEnabled('tmod', true);
    const { loadModsPhase1: load2 } = await import('../src/mods/loader');
    await load2(storage, { entryLoader: nodeEntryLoader });
    const { TILE_BY_KEY: TBK3 } = await import('../src/data/tiles');
    const tid2 = TBK3['mod_tmod_t1']!;
    expect(tid2).toBeGreaterThan(0);
    void tid1; void _resetModTilesForTests; void getModLoadResult;
  }, 60_000);
});
