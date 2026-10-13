// ★刀3-2(2026-10-13)mod 宠物 L1 守卫:e2e 装载(buff+proj+pet 声明)→ MOD_PETS 反查 +
//   装备分类 overlay(宠物槽准入/装备页路由 kind)。消费面锚:Game.updatePetSlot/
//   petBuffKinds/togglePetSlot、UI.petVanillaBuffs/activePetBuff、SlotActions 装备路由。
import { describe, it, expect, beforeAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { loadModsPhase1, getModLoadResult, _resetModLoaderForTests } from '../src/mods/loader';
import { _resetModHooksForTests } from '../src/mods/hooks';
import { _resetModBuffsForTests, modBuffTypeOf } from '../src/mods/buffs';
import { BUFF_DEFS } from '../src/stats/Buffs';
import { _resetModPetsForTests, modPetInfoOf } from '../src/mods/pets';
import { equipKindOfInternal, miscSlotAccepts, _resetModEquipKindsForTests } from '../src/data/vanillaEquip';
import { equipPageCapOf, selectEquipPageOf } from '../src/ui/SlotActions';
import { parseModManifest } from '../src/mods/manifest';
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

function buildPetModZip(): Uint8Array {
  return zipSync({
    'mod.json': strToU8(JSON.stringify({ id: 'p3', name: 'P3 Pet', version: '1.0.0', api: 1, side: 'both' })),
    'content/buffs/slime_pal.json': strToU8(JSON.stringify({
      key: 'slime_pal', name: 'Slime Pal', texture: 'textures/buffs/slime_pal.png',
    })),
    'content/projectiles/slime_orb.json': strToU8(JSON.stringify({
      key: 'slime_orb', texture: 'textures/proj/slime_orb.png', width: 20, height: 20,
    })),
    'content/items/slime_charm.json': strToU8(JSON.stringify({
      key: 'slime_charm', name: 'Slime Charm', rare: 2, maxStack: 1,
      pet: { buff: 'slime_pal', proj: 'proj:slime_orb', light: false },
    })),
    'content/items/glow_wisp.json': strToU8(JSON.stringify({
      key: 'glow_wisp', name: 'Glow Wisp', maxStack: 1,
      pet: { buff: 'slime_pal', proj: 'slime_orb', light: true },
    })),
    'textures/buffs/slime_pal.png': new Uint8Array(8),
    'textures/proj/slime_orb.png': new Uint8Array(8),
  });
}

describe('刀3-2 e2e:mod 宠物装载+反查+槽准入', () => {
  beforeAll(async () => {
    _resetModLoaderForTests();
    _resetModHooksForTests();
    _resetModBuffsForTests();
    _resetModPetsForTests();
    _resetModEquipKindsForTests();   // ★R3-m6:overlay 清账(二次装载卫生)
    const { ModStore } = await import('../src/mods/store');
    const { readModPack } = await import('../src/mods/pack');
    const storage = new MemStorage();
    const store = new ModStore(storage);
    const bytes = buildPetModZip();
    await store.install(readModPack(bytes).manifest, bytes);
    await store.setEnabled('p3', true);
    await loadModsPhase1(storage);
  });

  it('装载零错;MOD_PETS 反查(buff=BuffType 直域/proj 解析/light 分流)', () => {
    const res = getModLoadResult();
    expect(res?.errors ?? []).toEqual([]);
    const charm = res?.allocation?.items.get('mod_p3_slime_charm');
    const wisp = res?.allocation?.items.get('mod_p3_glow_wisp');
    expect(charm).toBeDefined();
    expect(wisp).toBeDefined();
    const bt = modBuffTypeOf('p3', 'slime_pal');
    expect(bt).toBeDefined();
    const projId = res?.allocation?.projs.get('mod_p3_slime_orb');
    expect(projId).toBeDefined();
    expect(modPetInfoOf(charm!)).toEqual({ buff: bt, proj: projId, light: false });
    expect(modPetInfoOf(wisp!)).toEqual({ buff: bt, proj: projId, light: true });
    expect(modPetInfoOf(42)).toBeNull();   // 原版件反查恒 null
  });

  it('装备分类 overlay:pet/light kind 落表;miscSlotAccepts 收口', () => {
    const res = getModLoadResult();
    const charmIid = res?.allocation?.items.get('mod_p3_slime_charm')!;
    const wispIid = res?.allocation?.items.get('mod_p3_glow_wisp')!;
    expect(equipKindOfInternal(charmIid)).toBe('pet');
    expect(equipKindOfInternal(wispIid)).toBe('light');
    expect(miscSlotAccepts(0, charmIid)).toBe(true);    // 宠物槽(0)收 pet
    expect(miscSlotAccepts(1, wispIid)).toBe(true);     // 光宠槽(1)收 light
    expect(miscSlotAccepts(0, wispIid)).toBe(false);
    expect(equipKindOfInternal(1)).toBeNull();          // 原版件(铁镐)分类零扰动
  });

  it('equipPageCapOf 装备页路由(pet→页 2)', () => {
    const res = getModLoadResult();
    const charmIid = res?.allocation?.items.get('mod_p3_slime_charm')!;
    const cap = equipPageCapOf(charmIid);
    expect(cap.vanityPet).toBe(true);
    expect(selectEquipPageOf(cap, 0)).toBe(2);
  });

  it('R2-C1 前提锁:BuffType 枚举域 ≠ 原版 buff id 域(图标链禁混查)', () => {
    // 乌龟宠=原版 buff 42;BUFF_DEFS[42] 是仓内 BuffType 42(ImbueVenom)且
    // vanillaBuff=71——若图标链把原版 id 当 BuffType 反解即错挂(48/83 碰撞)
    expect(BUFF_DEFS[42]?.vanillaBuff).toBeDefined();
    expect(BUFF_DEFS[42]?.vanillaBuff).not.toBe(42);
  });
});
