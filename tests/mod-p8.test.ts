// P8 引擎面测试(2026-10-05):mod Boss 位/蠕虫链声明建链/alpha 透传。
// 独立文件=fresh module registry。
import { describe, it, expect, beforeAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { loadModsPhase1, getModLoadResult, _resetModLoaderForTests } from '../src/mods/loader';
import { Enemy, VANILLA_BOSS_IDS, registerModWormChain } from '../src/entities/Enemy';
import type { ModStorage } from '../src/mods/store';

function buildWormBossZip(): Uint8Array {
  const manifest = { id: 'wb', name: 'Worm Boss', version: '1.0.0', api: 1, side: 'both' };
  const seg = (key: string, extra: Record<string, unknown> = {}) => ({
    key, name: key, aiStyle: 6, lifeMax: 100, damage: 10, defense: 4,
    width: 104, height: 104, ...extra,
  });
  return zipSync({
    'mod.json': strToU8(JSON.stringify(manifest)),
    // 键字典序:boss_body(800) < boss_head(801) < boss_tail(802)
    'content/npcs/boss_body.json': strToU8(JSON.stringify(seg('boss_body'))),
    'content/npcs/boss_head.json': strToU8(JSON.stringify(seg('boss_head', {
      boss: true, alpha: 100, worm: { body: 'boss_body', tail: 'boss_tail', bodyCount: 15 },
    }))),
    'content/npcs/boss_tail.json': strToU8(JSON.stringify(seg('boss_tail'))),
  });
}

class MemStorage {
  reg = '[]';
  zips = new Map<string, Blob>();
  async getRegistry() { return this.reg; }
  async setRegistry(json: string) { this.reg = json; }
  async putZip(id: string, blob: Blob) { this.zips.set(id, blob); return true; }
  async getZip(id: string) { return this.zips.get(id) ?? null; }
  async deleteZip(id: string) { this.zips.delete(id); }
}

beforeAll(async () => {
  _resetModLoaderForTests();
  const { ModStore } = await import('../src/mods/store');
  const { readModPack } = await import('../src/mods/pack');
  const storage = new MemStorage();
  const store = new ModStore(storage as never);
  const bytes = buildWormBossZip();
  await store.install(readModPack(bytes).manifest, bytes);
  await loadModsPhase1(storage as never);
});

describe('P8 mod Boss 位(红蓝 M5 GAPS-02 修复)', () => {
  it('boss 声明 → 三消费点直亮(fromVanilla def.boss=true)', async () => {
    const alloc = getModLoadResult()!.allocation!;
    const headId = alloc.npcs.get('mod_wb_boss_head')!;
    const e = Enemy.fromVanilla(headId, 100, 100);
    expect(e).not.toBeNull();
    expect(e!.def.boss).toBe(true);
    expect(VANILLA_BOSS_IDS.has(headId)).toBe(true);
    // 原版域不受扰:绿史莱姆 1 无 boss 位
    const v1 = Enemy.fromVanilla(1, 100, 100);
    expect(v1!.def.boss ?? false).toBe(false);
  });

  it('mod 蠕虫链声明 → wormChainSpec 返回 segIds(头 801;体×15+尾)', () => {
    const alloc = getModLoadResult()!.allocation!;
    const headId = alloc.npcs.get('mod_wb_boss_head')!;
    const bodyId = alloc.npcs.get('mod_wb_boss_body')!;
    const tailId = alloc.npcs.get('mod_wb_boss_tail')!;
    const spec = Enemy.wormChainSpec(headId, Math.random);
    expect(spec).toBeDefined();
    expect(spec!.count).toBe(16);
    expect(spec!.segIds![0]).toBe(bodyId);
    expect(spec!.segIds![spec!.segIds!.length - 1]).toBe(tailId);
    // 原版白名单头仍走原 spec(87 飞龙 14 段)
    const v87 = Enemy.wormChainSpec(87, Math.random);
    expect(v87?.count).toBe(14);
    // 未注册 mod 头=undefined(不建链,原语义)
    expect(Enemy.wormChainSpec(899, Math.random)).toBeUndefined();
  });

  it('alpha/behindTiles 透传(VanillaNpc 可选字段)', async () => {
    const { vanillaNpc } = await import('../src/data/vanillaNpcs');
    const head = vanillaNpc(getModLoadResult()!.allocation!.npcs.get('mod_wb_boss_head')!);
    expect(head?.alpha).toBe(100);
  });

  it('链实体化:spawnWormChain 用 mod segIds 全链落地(自然生成/F6 同一 spec 消费)', async () => {
    const alloc = getModLoadResult()!.allocation!;
    const headId = alloc.npcs.get('mod_wb_boss_head')!;
    const bodyId = alloc.npcs.get('mod_wb_boss_body')!;
    const tailId = alloc.npcs.get('mod_wb_boss_tail')!;
    const head = Enemy.fromVanilla(headId, 2000, 200);
    expect(head).not.toBeNull();
    const spec = Enemy.wormChainSpec(headId, Math.random)!;
    const segs = Enemy.spawnWormChain(head as NonNullable<typeof head>, spec.count, spec.segIds, false);
    expect(segs.length).toBe(16);
    expect(segs[0].vanillaId).toBe(bodyId);
    expect(segs[15].vanillaId).toBe(tailId);
    expect(segs[0].wormFollow).toBe(head);            // 链跟随接线
    expect((head as NonNullable<typeof head>).wormNext).toBe(segs[0]);
    void registerModWormChain;
  });
});
