// ★刀3-墙(2026-10-13)mod 墙 L1 守卫:e2e 装载(content/walls + item placeWall)→
//   367+ 段分配 + WALL_DEFS/WALL_BY_KEY 追加 + def.wallId 挂面 + killWall 链
//   (dropItem/unbreakable/dungeonGate)+ modWallKeyEntries 裸键装配。
//   消费面锚:VanillaWallTiler(vmeta sheet)/wallDrops 两函数/canPlayerSmashWall/
//   Game.updateUse heldDef.wallId 派发门/gen-misc wallIdByKey(D13)。
import { describe, it, expect, beforeAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { loadModsPhase1, getModLoadResult, _resetModLoaderForTests } from '../src/mods/loader';
import { _resetModHooksForTests } from '../src/mods/hooks';
import { _resetModWallsForTests, modWallMetaOf, modWallKeyEntries } from '../src/mods/walls';
import { WALL_DEFS, WALL_BY_KEY } from '../src/data/tiles';
import { wallDropItemVid, killWallCheckFailure } from '../src/data/wallDrops';
import { ITEM_DEFS } from '../src/data/items';
import type { ModPack } from '../src/mods/types';
import type { ModStorage } from '../src/mods/store';

class MemStorage implements ModStorage {
  reg = '[]';
  zips = new Map<string, Blob>();
  async getRegistry() { return this.reg; }
  async setRegistry(json: string) { this.reg = json; }
  async putZip(id: string, blob: Blob) { this.zips.set(id, blob); return true; }
  async getZip(id: string) { return this.zips.get(id) ?? null; }
  async deleteZip(id: string) { this.zips.delete(id); }
}

function buildWallModZip(): Uint8Array {
  return zipSync({
    'mod.json': strToU8(JSON.stringify({ id: 'w2', name: 'W2 Walls', version: '1.0.0', api: 1, side: 'both' })),
    'content/walls/sea_brick.json': strToU8(JSON.stringify({
      key: 'sea_brick', name: 'Sea Brick Wall', mapColor: '#0B3851',
      texture: 'textures/walls/sea_brick.png', dropItem: 'sea_brick_item',
    })),
    'content/walls/ancient_barrier.json': strToU8(JSON.stringify({
      key: 'ancient_barrier', name: 'Ancient Barrier', mapColor: '#333344',
      texture: 'textures/walls/ancient_barrier.png', unbreakable: true,
    })),
    'content/walls/sealed_gate.json': strToU8(JSON.stringify({
      key: 'sealed_gate', name: 'Sealed Gate Wall', mapColor: '#444455',
      texture: 'textures/walls/sealed_gate.png', dungeonGate: 'skeletron',
      dropItem: 'sealed_gate_item',
    })),
    'content/items/sea_brick_item.json': strToU8(JSON.stringify({
      key: 'sea_brick_item', name: 'Sea Brick Wall Item', value: 100,
      placeWall: 'sea_brick',
    })),
    'content/items/sealed_gate_item.json': strToU8(JSON.stringify({
      key: 'sealed_gate_item', name: 'Sealed Gate Item', placeWall: 'sea_brick',
    })),
    'textures/walls/sea_brick.png': fakePng(468, 180),
    'textures/walls/ancient_barrier.png': fakePng(468, 180),
    'textures/walls/sealed_gate.png': fakePng(468, 180),
  });
}

/** 最小 PNG 头(IHDR 大端 @16/@20) */
function fakePng(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}

describe('刀3-墙 e2e:装载+注册+放置+锤墙链', () => {
  beforeAll(async () => {
    _resetModLoaderForTests();
    _resetModHooksForTests();
    _resetModWallsForTests();
    const { ModStore } = await import('../src/mods/store');
    const { readModPack } = await import('../src/mods/pack');
    const storage = new MemStorage();
    const store = new ModStore(storage);
    const bytes = buildWallModZip();
    await store.install(readModPack(bytes).manifest, bytes);
    await store.setEnabled('w2', true);
    await loadModsPhase1(storage);
  });

  it('367+ 段字典序分配;WALL_DEFS/WALL_BY_KEY 直追加;原版域零扰动', () => {
    const res = getModLoadResult();
    expect(res?.errors ?? []).toEqual([]);
    expect(res?.allocation?.walls.get('mod_w2_ancient_barrier')).toBe(367);   // 字典序 ancient 先
    expect(res?.allocation?.walls.get('mod_w2_sea_brick')).toBe(368);
    expect(res?.allocation?.walls.get('mod_w2_sealed_gate')).toBe(369);
    expect(WALL_DEFS[367]?.key).toBe('mod_w2_ancient_barrier');
    expect(WALL_DEFS[367]?.mapColor).toBe('#333344');
    expect(WALL_BY_KEY['mod_w2_sea_brick']).toBe(368);
    expect(WALL_DEFS[1]?.key).toBe('w1_stone');                                // 原版域零扰动
    expect(WALL_BY_KEY['w1_stone']).toBe(1);
  });

  it('placeWall 解析:def.wallId 挂面(updateUse 派发门消费形)', () => {
    const res = getModLoadResult();
    const iid = res?.allocation?.items.get('mod_w2_sea_brick_item')!;
    expect((ITEM_DEFS[iid] as { wallId?: number }).wallId).toBe(368);   // 裸键→本 mod 墙
  });

  it('killWall 链:dropItem 二段解析/unbreakable 恒拒/dungeonGate boss 门', () => {
    expect(wallDropItemVid(368)).toBeGreaterThan(0);                    // sea_brick_item vid
    expect(wallDropItemVid(367)).toBe(0);                               // 无 dropItem
    expect(killWallCheckFailure(367, true, true)).toBe(true);           // unbreakable
    expect(killWallCheckFailure(369, false, true)).toBe(true);          // skeletron 门未斩
    expect(killWallCheckFailure(369, true, true)).toBe(false);          // 已斩可拆
    expect(killWallCheckFailure(368, false, false)).toBe(false);        // 普通墙无门
    expect(modWallMetaOf(1)).toBeNull();                                // 原版墙 meta 恒 null
    expect(wallDropItemVid(1)).toBe(26);                                // 原版语义零扰动(石墙=26 表值直通)
  });

  it('modWallKeyEntries 裸键装配面(gs.mods.wallIdByKey 同构)', () => {
    const entries = modWallKeyEntries();
    const bare = Object.fromEntries(entries.map(({ fullKey, id }) => [fullKey.replace(/^mod_[a-z0-9]+_/, ''), id]));
    expect(bare['sea_brick']).toBe(368);
    expect(bare['navystone_wall']).toBeUndefined();   // 灾厄墙不在本合成包
  });
});
