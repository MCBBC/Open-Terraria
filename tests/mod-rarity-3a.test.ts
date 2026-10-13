// ★刀3-1(2026-10-13)mod 自定义稀有度档色守卫:模块单测(注册/查表/fail-fast)+
//   plan 分配确定性 + e2e 装载(rarities 目录 → 档表;物品 rare {$rarity} → 档 id →
//   ITEM_DEFS.rare)。消费面锚:Renderer.mouseTextInnerColor / Game.popupRarityColor /
//   UI.tooltipRareOf(色面查表回退 ≥11 紫档)。
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { registerModRarity, modRarityColorOf, modRarityRgb255, modRarityIdOf, _resetModRarityForTests } from '../src/mods/rarity';
import { buildRegistrationPlan } from '../src/mods/plan';
import { loadModsPhase1, getModLoadResult, _resetModLoaderForTests } from '../src/mods/loader';
import { parseModManifest } from '../src/mods/manifest';
import { ITEM_DEFS } from '../src/data/items';
import { MOD_RARITY_ID_BASE } from '../src/mods/types';
import type { ModPack } from '../src/mods/types';
import type { ModStorage } from '../src/mods/store';

describe('mods/rarity 模块(刀3-1)', () => {
  beforeEach(() => _resetModRarityForTests());

  it('注册+查表:色串与 rgb255 双形态;miss=null(原链回退)', () => {
    registerModRarity(12, '#FF8C40', 'mod_r3_calamitic');
    expect(modRarityColorOf(12)).toBe('#FF8C40');
    expect(modRarityRgb255(12)).toEqual([255, 140, 64]);
    expect(modRarityColorOf(10)).toBeNull();       // 原版域不查
    expect(modRarityColorOf(11)).toBeNull();       // 原版词缀位移可达域(红队修正:11 不入 mod 段)
    expect(modRarityColorOf(13)).toBeNull();       // 未注册档
    expect(modRarityIdOf('mod_r3_calamitic')).toBe(12);
  });

  it('fail-fast:重复 id/重复键/坏色/域外 id', () => {
    registerModRarity(12, '#FF8C40', 'mod_r3_a');
    expect(() => registerModRarity(12, '#FF00FF', 'mod_r3_b')).toThrow(/档 id 重复/);
    expect(() => registerModRarity(13, '#FF00FF', 'mod_r3_a')).toThrow(/重复注册/);
    expect(() => registerModRarity(13, 'red', 'mod_r3_c')).toThrow(/#RRGGBB/);
    expect(() => registerModRarity(11, '#FF00FF', 'mod_r3_d')).toThrow(/档 id 须在/);
    expect(() => registerModRarity(255, '#FF00FF', 'mod_r3_e')).toThrow(/档 id 须在/);
  });
});

describe('plan 分配确定性(刀3-1:rarities 先于 items)', () => {
  it('全键字典序分配 11+ 段;allocation.rarities 满账', () => {
    const manifest = parseModManifest(JSON.stringify({
      id: 'r3', name: 'R3', version: '1.0.0', api: 1, side: 'both',
    }));
    const files = new Map<string, Uint8Array>([
      ['content/rarities/zeta.json', strToU8(JSON.stringify({ key: 'zeta', color: '#112233' }))],
      ['content/rarities/alpha.json', strToU8(JSON.stringify({ key: 'alpha', color: '#445566' }))],
      ['content/items/i1.json', strToU8(JSON.stringify({ key: 'i1', name: 'I1', rare: { $rarity: 'alpha' } }))],
      ['content/items/i2.json', strToU8(JSON.stringify({ key: 'i2', name: 'I2', rare: 3 }))],
    ]);
    const pack: ModPack = { manifest, files };
    const plan = buildRegistrationPlan([pack]);
    expect(plan.raritySpecs.map((r) => [r.rarityId, r.fullKey])).toEqual([
      [12, 'mod_r3_alpha'], [13, 'mod_r3_zeta'],      // 字典序:alpha 先于 zeta(基址 12=红队修正)
    ]);
    expect(plan.allocation.rarities.get('mod_r3_alpha')).toBe(MOD_RARITY_ID_BASE);
    expect(plan.allocation.rarities.get('mod_r3_zeta')).toBe(MOD_RARITY_ID_BASE + 1);
  });

  it('坏色/坏键 plan 级拒绝', () => {
    const manifest = parseModManifest(JSON.stringify({ id: 'r3', name: 'R3', version: '1.0.0', api: 1, side: 'both' }));
    const bad: ModPack = { manifest, files: new Map([
      ['content/rarities/x.json', strToU8(JSON.stringify({ key: 'x', color: 'pink' }))],
    ]) };
    expect(() => buildRegistrationPlan([bad])).toThrow(/校验失败/);
  });
});

// ---- e2e:zip 包装载 → 档表 + 物品 rare 解析 ----
class MemStorage implements ModStorage {
  reg = '[]';
  zips = new Map<string, Blob>();
  async getRegistry() { return this.reg; }
  async setRegistry(json: string) { this.reg = json; }
  async putZip(id: string, blob: Blob) { this.zips.set(id, blob); return true; }
  async getZip(id: string) { return this.zips.get(id) ?? null; }
  async deleteZip(id: string) { this.zips.delete(id); }
}

function buildR3ModZip(): Uint8Array {
  return zipSync({
    'mod.json': strToU8(JSON.stringify({ id: 'r3', name: 'R3', version: '1.0.0', api: 1, side: 'both' })),
    'content/rarities/calamitic.json': strToU8(JSON.stringify({ key: 'calamitic', color: '#FF8C40' })),
    'content/items/plague.json': strToU8(JSON.stringify({
      key: 'plague', name: 'Plague Blade', rare: { $rarity: 'calamitic' }, value: 50000,
    })),
  });
}

// ★红队 R3-M1 修复验证:MouseText 主链真覆盖(旧测试只到模块层=伪绿链)
describe('刀3-1 渲染链消费(mouseTextInnerColor)', () => {
  it('mod 档色覆写 ≥11 紫档;原版 11 域(词缀位移可达)仍走紫档', async () => {
    const { mouseTextInnerColor } = await import('../src/render/Renderer');
    _resetModRarityForTests();
    registerModRarity(12, '#FF8C40', 'mod_r3_test');
    const c = mouseTextInnerColor(12, 0, 255, null);
    expect(c).toBe('rgb(255,140,64)');                    // mt=255 → num3=1 原色
    expect(mouseTextInnerColor(11, 0, 255, null)).toBe('rgb(180,40,255)');   // 原版 11=紫档
    expect(mouseTextInnerColor(10, 0, 255, null)).toBe('rgb(255,40,100)');   // 原版 10 零扰动
  });
});

describe('刀3-1 e2e:装载后档表生效 + 物品 rare 解析', () => {
  beforeAll(async () => {
    _resetModLoaderForTests();
    _resetModRarityForTests();   // 单测段残留档表清账(否则档 id 11 重复注册整批拒载)
    const { ModStore } = await import('../src/mods/store');
    const { readModPack } = await import('../src/mods/pack');
    const storage = new MemStorage();
    const store = new ModStore(storage);
    const bytes = buildR3ModZip();
    await store.install(readModPack(bytes).manifest, bytes);
    await store.setEnabled('r3', true);
    await loadModsPhase1(storage);
  });

  it('档 id=11 落表;物品 rare 解析为档 id;色查表命中', () => {
    const res = getModLoadResult();
    // 装载错误可见化(errors 吞错会让 allocation=null,诊断面先行)
    expect(res?.errors ?? []).toEqual([]);
    expect(res?.allocation?.rarities.get('mod_r3_calamitic')).toBe(12);
    const stable = res?.allocation?.items.get('mod_r3_plague');
    expect(stable).toBeDefined();
    expect(ITEM_DEFS[stable!]?.rare).toBe(12);
    expect(modRarityColorOf(12)).toBe('#FF8C40');
    expect(modRarityRgb255(12)).toEqual([255, 140, 64]);
  });
});
