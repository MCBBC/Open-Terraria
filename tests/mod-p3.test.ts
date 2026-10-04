// P3 商店/图鉴/桌面同步面测试(2026-10-04):mod 商店货架/图鉴条目/NPC 名解析。
// 独立文件=fresh module registry。
import { describe, it, expect, beforeAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { loadModsPhase1, _resetModLoaderForTests } from '../src/mods/loader';
import { _resetModHooksForTests } from '../src/mods/hooks';
import { _resetModShopsForTests, modShopStockOf } from '../src/mods/shops';
import { modNpcName } from '../src/data/vanillaNpcs';
import { bestiaryEntries } from '../src/data/Bestiary';
import { Lang } from '../src/i18n/Lang';
import { ITEM_DEFS } from '../src/data/items';
import type { ModStorage } from '../src/mods/store';

function buildP3ModZip(): Uint8Array {
  const manifest = { id: 'p3', name: 'P3 Mod', version: '1.0.0', api: 1, side: 'both' };
  return zipSync({
    'mod.json': strToU8(JSON.stringify(manifest)),
    'content/items/p3_wand.json': strToU8(JSON.stringify({
      key: 'p3_wand', name: 'P3 法杖', value: 1200, maxStack: 1,
    })),
    'content/npcs/p3_vendor.json': strToU8(JSON.stringify({
      key: 'p3_vendor', name: 'P3 商人', aiStyle: 7, lifeMax: 250, damage: 0, defense: 15,
      friendly: true, townNPC: true, width: 18, height: 40,
    })),
    'content/shops.json': strToU8(JSON.stringify([
      { npcId: 17, items: [{ item: 'p3_wand' }, { item: 3, price: 42 }] },   // 17=商人;3=原版 vid
    ])),
  });
}

class MemStorage implements ModStorage {
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
  _resetModHooksForTests();
  _resetModShopsForTests();
  const { ModStore } = await import('../src/mods/store');
  const { readModPack } = await import('../src/mods/pack');
  const storage = new MemStorage();
  const store = new ModStore(storage);
  const bytes = buildP3ModZip();
  await store.install(readModPack(bytes).manifest, bytes);
  await store.setEnabled('p3', true);
  await loadModsPhase1(storage);
});

describe('mod 商店货架(P3)', () => {
  it('货架按 npcId 追加;price 缺省=物品 value', () => {
    const stock = modShopStockOf(17);
    const wandId = ITEM_DEFS.findIndex((d) => d?.key === 'mod_p3_p3_wand');
    expect(stock).toContainEqual([wandId, 1200]);       // 缺省价=value
    expect(stock).toContainEqual([3, 42]);              // 原版 vid 显式价
    expect(modShopStockOf(20)).toEqual([]);             // 其他 NPC 零货架
  });
});

describe('mod 图鉴(P3)', () => {
  it('mod NPC 进条目表(enemy kind/击杀解锁/creditId=id 字符串)', () => {
    const entries = bestiaryEntries();
    const mod = entries.find((e) => e.id === 800);
    expect(mod).toBeDefined();
    expect(mod!.kind).toBe('town');                     // townNPC:true → town/chat 解锁
    expect(mod!.creditId).toBe('800');
    expect(mod!.sources[0]!.t).toBe('chat');
  });

  it('Lang.npcName mod 段回退;原版域不受扰', () => {
    expect(Lang.npcName(800)).toBe('P3 商人');
    expect(modNpcName(1)).toBeNull();                   // 原版域=原链路
    expect(modNpcName(999)).toBeNull();
  });
});
