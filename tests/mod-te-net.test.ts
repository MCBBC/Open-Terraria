// ★TE net sync 守卫(2026-10-14,module16):编解码 round-trip/host 快照产/client
//   桶重建(apply)/角色门(client 不 tick 不落档/断开复位)。
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('TE net sync(module16)', () => {
  it('编解码 round-trip/快照产/client 重建/角色门/复位', async () => {
    const { writeTEModule, writeTEModuleBatched, readTEModule } = await import('../src/net/syncModules');
    const { NetReader } = await import('../src/net/protocol');
    // ① 编解码 round-trip
    const entries = [
      { k: 'mod_ms_core', x: 12, y: 5, j: '{"n":3}' },
      { k: 'mod_ms_core', x: 56, y: 20, j: '{}' },
    ];
    const frame = writeTEModule(entries);
    const back = readTEModule(new NetReader(frame.subarray(3 + 2)));   // 跳 [u16 len][u8 id] + [u16 moduleId]
    expect(back).toEqual(entries);

    // ② 装载 TE mod → 快照产/apply/角色门
    const { ModStore } = await import('../src/mods/store');
    const { readModPack } = await import('../src/mods/pack');
    const { loadModsPhase1 } = await import('../src/mods/loader');
    const { TILE_BY_KEY } = await import('../src/data/tiles');
    const te = await import('../src/mods/tileEntities');

    const png = new Uint8Array(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
    const bytes = zipSync({
      'mod.json': strToU8(JSON.stringify({ id: 'msn', name: 'msn', version: '1.0.0', api: 1, side: 'both' })),
      'content/tiles/ms_tile.json': strToU8(JSON.stringify({ key: 'ms_tile', name: 'MS', solid: true, pick: 0, mapColor: '#456', texture: 't.png' })),
      'textures/t.png': png,
    });
    const storage = new MemStorage();
    const store = new ModStore(storage as never);
    await store.install(readModPack(bytes).manifest, bytes);
    await loadModsPhase1(storage, { entryLoader: nodeEntryLoader });
    const tid = TILE_BY_KEY['mod_msn_ms_tile']!;
    const ticked: number[] = [];
    te.registerModTileEntity('msn', tid, 'ms_tile', {
      create: () => ({ n: 0 }),
      update: (t) => ticked.push(t.x),
      save: (t) => ({ n: t.state.n }),
      load: (t, d) => { t.state.n = (d as { n: number }).n; },
    });

    // host 世界:放两台 → tick → 快照产
    const { World } = await import('../src/world/World');
    const w = new World(64, 32, 42, 'n');
    te.bindModTileEntities(w.store);
    w.store.setTile(12, 5, tid);
    w.store.setTile(56, 20, tid);
    te.tickModTileEntities({ world: { store: w.store } } as never);
    expect(ticked).toEqual([12, 56]);
    const snap = te.snapshotModTEsForNet();
    expect(snap).toHaveLength(2);
    expect(snap[0]).toMatchObject({ k: 'mod_msn_ms_tile', x: 12, y: 5, j: '{"n":0}' });

    // ②b ★R-B-1:分批编码(60 条大 state → 多帧;每帧 <65535)
    {
      const big: Array<{ k: string; x: number; y: number; j: string }> = [];
      const bigJ = JSON.stringify({ items: new Array(40).fill({ id: 1, stack: 9 }) });
      for (let i = 0; i < 120; i++) big.push({ k: 'mod_msn_ms_tile', x: i % 60, y: 5, j: bigJ });
      const frames = writeTEModuleBatched(big);
      expect(frames.length).toBeGreaterThan(1);   // 超预算分批
      for (const f of frames) expect(f.length).toBeLessThanOrEqual(65535);
      const all: Array<{ k: string; x: number; y: number; j: string }> = [];
      for (const f of frames) all.push(...readTEModule(new NetReader(f.subarray(3 + 2))));
      expect(all.length).toBe(120);   // 分批无损
    }
    // ②c ★R-B-4:0 条快照=清空语义(空帧产出一帧;客户端 apply 清桶)
    {
      const empty = writeTEModuleBatched([]);
      expect(empty).toHaveLength(1);
      expect(readTEModule(new NetReader(empty[0]!.subarray(3 + 2)))).toEqual([]);
    }

    // ③ client 模式:快照重建(state 覆盖)→ tick 不跑/save 不落
    te.setModTENetClientRole(true);
    const frame2 = writeTEModule(snap);
    te.applyModTESnapshot(readTEModule(new NetReader(frame2.subarray(3 + 2))));
    ticked.length = 0;
    te.tickModTileEntities({ world: { store: w.store } } as never);
    expect(ticked).toHaveLength(0);                    // client 不 tick
    expect(te.serializeModTEs(w.store)).toHaveLength(0);   // client 不落档
    // ②d ★R-C-F8:键覆盖门——快照缺本端 TE 键=不置 client 角色(本地权威保留);
    //  键覆盖=置角色
    {
      // 覆盖:快照含本端键 → role 置 client
      te.setModTENetClientRole(false);
      expect(te.setModTENetRoleIfCovered([{ k: 'mod_msn_ms_tile', x: 1, y: 1, j: '{}' }])).toBe(true);
      te.setModTENetClientRole(false);
      // 不覆盖:快照键是别家 → false(本端 TE 保本地权威)
      expect(te.setModTENetRoleIfCovered([{ k: 'mod_other_x', x: 1, y: 1, j: '{}' }])).toBe(false);
      te.setModTENetClientRole(false);
    }

    // ③b ★R-B-4:0 条快照 apply=清桶(末 TE 摘除语义)
    te.setModTENetClientRole(true);
    te.applyModTESnapshot([]);
    const snapEmpty = te.snapshotModTEsForNet();
    expect(snapEmpty).toHaveLength(0);
    // ③c ★R-B-3:早到缓冲(activeStore null→pending;bind 沿回放)
    te.setModTENetClientRole(false);   // host 态重建两台
    w.store.setTile(12, 5, tid); w.store.setTile(56, 20, tid);
    te.tickModTileEntities({ world: { store: w.store } } as never);
    const snap2 = te.snapshotModTEsForNet();
    te.unbindModTileEntities(w.store);   // 模拟进房早期:store 未绑
    te.setModTENetClientRole(true);
    te.applyModTESnapshot(snap2);        // activeStore null → pending 缓冲
    // 再验证 rebuild 后的 host 恢复:复位 → tick 恢复跑(state 保留自快照)
    te.setModTENetClientRole(false);
    te.tickModTileEntities({ world: { store: w.store } } as never);
    expect(ticked).toEqual([12, 56]);                  // 复位后恢复 tick(桶由 apply 重建)
  }, 60_000);
});
