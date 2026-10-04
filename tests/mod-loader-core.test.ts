// ModLoader 核心测试(2026-10-04):manifest/pack/拓扑/确定性分配/注册 API/中立性守卫。
// 中立性判据(docs/mod-loader-design.md 零破坏铁律):mod 注册前后,原版注册表段
// 逐引用恒等(同一对象=未被改写),稳定映射表旧段逐值恒等。
import { describe, it, expect, beforeAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { parseModManifest, ModManifestError, versionSatisfies, compareSemver } from '../src/mods/manifest';
import { readModPack, ModPackError } from '../src/mods/pack';
import { topoSortMods, buildRegistrationPlan, validatePlanReferences, ModPlanError } from '../src/mods/plan';
import type { ModPack } from '../src/mods/types';
import {
  ITEM_DEFS, ITEM_BY_KEY, ITEM_INTERNAL_OF_STABLE, ITEM_STABLE_OF_INTERNAL, registerModItem,
} from '../src/data/items';
import {
  TILE_DEFS, TILE_BY_KEY, TILE_STABLE_OF_INTERNAL, TILE_INTERNAL_OF_STABLE, registerModTile,
} from '../src/data/tiles';
import { VANILLA_NPCS, vanillaNpc, registerModNpc } from '../src/data/vanillaNpcs';
import { VANILLA_RECIPES, registerModRecipes } from '../src/data/vanillaRecipes';
import { itemFuncOfVid, registerModItemFunc } from '../src/data/vanillaItemFunc';
import { itemCombat, registerModCombat } from '../src/data/vanillaItemCombat';
import { statOfInternal, registerModStats, isFunctionalAccessory } from '../src/data/vanillaItemStats';
import { resolveDrops, registerModNpcRules, type NpcDropCtx } from '../src/drops/NpcDrops';

// ---- 中立性快照(模块加载后、任何 mod 注册前;顶层求值先于 beforeAll) ----
const itemSampleIdx = [1, 2, 100, 1000, 5000, 6195, 10000, 15000, 20753];
const tileSampleIdx = [1, 2, 22, 100, 400, 700];
const itemSample = itemSampleIdx.map((i) => ITEM_DEFS[i]);
const tileSample = tileSampleIdx.map((i) => TILE_DEFS[i]);
const itemStableSample = itemSampleIdx.map((i) => ITEM_STABLE_OF_INTERNAL[i]);
const tileStableSnapshot = TILE_STABLE_OF_INTERNAL.slice();   // tile 稳定表整段拷贝(原长)
const itemLen0 = ITEM_DEFS.length;
const tileLen0 = TILE_DEFS.length;
// byKey 采样:真实存在的前 200 键(自举,不猜键名)
const byKeySampleNames = Object.keys(ITEM_BY_KEY).filter((k) => !k.startsWith('mod_')).slice(0, 200);
const byKeySample = byKeySampleNames.map((k) => ITEM_BY_KEY[k]);

// ---- 夹具 ----

function makeModZip(manifest: Record<string, unknown>, files: Record<string, string> = {}): Uint8Array {
  const entries: Record<string, Uint8Array> = { 'mod.json': strToU8(JSON.stringify(manifest)) };
  for (const [k, v] of Object.entries(files)) entries[k] = strToU8(v);
  return zipSync(entries);
}

const BASE_MANIFEST = {
  id: 'testmod', name: 'Test Mod', version: '1.0.0', api: 1, side: 'both',
};

describe('mod manifest', () => {
  it('合法清单通过', () => {
    const m = parseModManifest(JSON.stringify(BASE_MANIFEST));
    expect(m.id).toBe('testmod');
    expect(m.side).toBe('both');
    expect(m.api).toBe(1);
  });
  it('坏 id/坏版本/坏 api 拒载', () => {
    expect(() => parseModManifest(JSON.stringify({ ...BASE_MANIFEST, id: 'Bad-Id' }))).toThrow(ModManifestError);
    expect(() => parseModManifest(JSON.stringify({ ...BASE_MANIFEST, version: '1.0' }))).toThrow(ModManifestError);
    expect(() => parseModManifest(JSON.stringify({ ...BASE_MANIFEST, api: 99 }))).toThrow(ModManifestError);
    expect(() => parseModManifest('not json')).toThrow(ModManifestError);
  });
  it('依赖版本约束解析', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('1.2.4', '1.2.3')).toBe(1);
    expect(versionSatisfies('1.2.5', '^1.2.3')).toBe(true);
    expect(versionSatisfies('2.0.0', '^1.2.3')).toBe(false);
    expect(versionSatisfies('1.2.3', '1.2.3')).toBe(true);
    expect(versionSatisfies('1.2.4', '1.2.3')).toBe(false);
  });
});

describe('mod pack', () => {
  it('缺 mod.json 拒载', () => {
    expect(() => readModPack(zipSync({ 'other.txt': strToU8('x') }))).toThrow(ModPackError);
  });
  it('目录条目与 __MACOSX 剔除', () => {
    const pack = readModPack(makeModZip(BASE_MANIFEST, { 'content/items/a.json': '{}', '__MACOSX/junk': 'x' }));
    expect(pack.files.has('content/items/a.json')).toBe(true);
    expect(pack.files.has('__MACOSX/junk')).toBe(false);
  });
});

describe('拓扑排序', () => {
  const packOf = (id: string, deps: Record<string, string> = {}): ModPack =>
    readModPack(makeModZip({ ...BASE_MANIFEST, id, dependencies: Object.keys(deps).length ? deps : undefined }));
  it('依赖在前', () => {
    const a = packOf('aaa');
    const b = packOf('bbb', { aaa: '^1.0.0' });
    const order = topoSortMods([b, a]);
    expect(order.indexOf('aaa')).toBeLessThan(order.indexOf('bbb'));
  });
  it('缺依赖/版本不满足/依赖环拒载', () => {
    expect(() => topoSortMods([packOf('aaa', { ghost: '^1.0.0' })])).toThrow(ModPlanError);
    const x = readModPack(makeModZip({ ...BASE_MANIFEST, id: 'xxx', version: '2.0.0' }));
    const y = packOf('yyy', { xxx: '^1.0.0' });
    expect(() => topoSortMods([x, y])).toThrow(ModPlanError);
    const q = packOf('qqq', { rrr: '^1.0.0' });
    const r = packOf('rrr', { ppp: '^1.0.0' });
    const p2 = packOf('ppp', { qqq: '^1.0.0' });
    expect(() => topoSortMods([p2, q, r])).toThrow(/环/);
  });
});

describe('确定性 id 分配', () => {
  it('mod 字典序 + mod 内键字典序;同输入恒同分配', () => {
    const mk = (id: string, items: string[]) => readModPack(makeModZip(
      { ...BASE_MANIFEST, id },
      Object.fromEntries(items.map((k) => [`content/items/${k}.json`, JSON.stringify({ key: k, name: k })])),
    ));
    const alpha = mk('alpha', ['sword', 'apple']);
    const beta = mk('beta', ['zeta', 'coin']);
    const plan1 = buildRegistrationPlan([beta, alpha]);
    const plan2 = buildRegistrationPlan([alpha, beta]);
    expect(plan1.allocation.items.get('mod_alpha_apple')).toBe(30000);
    expect(plan1.allocation.items.get('mod_alpha_sword')).toBe(30001);
    expect(plan1.allocation.items.get('mod_beta_coin')).toBe(30002);
    expect(plan1.allocation.items.get('mod_beta_zeta')).toBe(30003);
    // 同集合不同入序 → 恒同(联机双端/存档一致性根)
    expect(plan2.allocation.items.get('mod_alpha_apple')).toBe(30000);
    expect(plan2.allocation.items.get('mod_beta_zeta')).toBe(30003);
  });
  it('键冲突/引用缺失拒载', () => {
    const dup = readModPack(makeModZip({ ...BASE_MANIFEST, id: 'dup' }, {
      'content/items/a.json': JSON.stringify({ key: 'x', name: 'x' }),
      'content/items/b.json': JSON.stringify({ key: 'x', name: 'x' }),
    }));
    expect(() => buildRegistrationPlan([dup])).toThrow(/重复/);
    const badRef = readModPack(makeModZip({ ...BASE_MANIFEST, id: 'badref' }, {
      'content/items/a.json': JSON.stringify({ key: 'x', name: 'x' }),
      'content/npcs/n.json': JSON.stringify({ key: 'n', name: 'N', aiStyle: 3, lifeMax: 10, damage: 5, defense: 0, drops: [{ item: 'ghost' }] }),
    }));
    const plan = buildRegistrationPlan([badRef]);
    expect(() => validatePlanReferences(plan)).toThrow(/未注册物品/);
  });
});

// ---- 注册 API + 中立性(真实注册表装载链) ----

describe('mod 注册 API(真实注册表)', () => {
  beforeAll(() => {
    // 与 loader 相同的注册序列(直测 API 面;loader E2E 在 mod-e2e 测试)
    const tid = registerModTile({
      key: 'mod_testmod_stone_brick', name: '测试砖', solid: true, opacity: 1,
      pick: 0, mapColor: '#888',
    }, 1030);
    expect(tid).toBe(TILE_DEFS.length - 1);
    registerModItemFunc(30000, { useStyle: 1, pick: 0 });
    registerModCombat(30000, { damage: 42, useTime: 20, useAnimation: 20, melee: true, knockBack: 6 });
    registerModItem({
      key: 'mod_testmod_test_sword', name: '测试剑', rare: 3, value: 5000,
      maxStack: 1,
    }, 30000);
    registerModNpc(800, {
      id: 800, name: '测试史莱姆', frames: 2, lifeMax: 25, damage: 7, defense: 5,
      knockBackResist: 0.2, aiStyle: 1, width: 22, height: 18, npcSlots: 1,
      noGravity: false, noTileCollide: false, friendly: false, townNPC: false,
      HitSound: 'NPC_Hit_1', DeathSound: 'NPC_Killed_1', scale: 1,
    });
    registerModNpcRules(800, [{ k: 'common', item: 30000, min: 1, max: 2, num: 1, denom: 1, noLuck: true }]);
    registerModRecipes([{ create: 30000, createStack: 1, tile: 13, items: [{ id: 3, stack: 5 }], groups: [] }]);
    registerModStats(30001, { def: 3, s: 'h', acc: 1 }, 30001);
  });

  it('中立性:原版段逐引用恒等/稳定表旧段逐值恒等', () => {
    itemSampleIdx.forEach((i, k) => expect(ITEM_DEFS[i]).toBe(itemSample[k]));
    tileSampleIdx.forEach((i, k) => expect(TILE_DEFS[i]).toBe(tileSample[k]));
    // 稳定表旧段逐值(ITEMS 恒等域=自身下标;TILE 非恒等域=快照对拍)
    itemSampleIdx.forEach((i, k) => expect(ITEM_STABLE_OF_INTERNAL[i]).toBe(itemStableSample[k]));
    for (let i = 0; i < tileLen0; i++) expect(TILE_STABLE_OF_INTERNAL[i]).toBe(tileStableSnapshot[i]);
    // 原 vanilla 键仍指向原位(自举采样对账)
    byKeySampleNames.forEach((k, idx) => expect(ITEM_BY_KEY[k]).toBe(byKeySample[idx]));
    // vanilla NPC 段不被波及
    expect(vanillaNpc(1)?.name).toBe(VANILLA_NPCS['1'].name);
    expect(VANILLA_NPCS['696']).toBeDefined();
  });

  it('mod 物品落在 30000 恒等域', () => {
    expect(ITEM_BY_KEY['mod_testmod_test_sword']).toBe(30000);
    expect(ITEM_DEFS[30000]?.key).toBe('mod_testmod_test_sword');
    expect(ITEM_DEFS[30000]?.vid).toBe(30000);
    expect(ITEM_INTERNAL_OF_STABLE.get(30000)).toBe(30000);
    expect(itemFuncOfVid(30000)?.useStyle).toBe(1);
    expect(itemCombat(30000)?.damage).toBe(42);
  });

  it('mod tile 稳定段映射', () => {
    const tid = TILE_BY_KEY['mod_testmod_stone_brick'];
    expect(tid).toBeGreaterThan(700);
    expect(TILE_STABLE_OF_INTERNAL[tid]).toBe(1030);
    expect(TILE_INTERNAL_OF_STABLE[1030]).toBe(tid);
  });

  it('mod NPC 经 vanillaNpc 访问器贯通(fromVanilla 同链)', () => {
    const v = vanillaNpc(800);
    expect(v?.name).toBe('测试史莱姆');
    expect(v?.aiStyle).toBe(1);
  });

  it('mod 掉落经 resolveDrops 求值', () => {
    const ctx = {
      netId: 800, type: 800,
      rng: { next: () => 0.01, int: (a: number) => a },   // int(a,b)=a → 恒取下界
      isExpert: false, isMaster: false,
    } as unknown as NpcDropCtx;
    const out = resolveDrops(ctx);
    const hit = out.drops.find((d) => d.id === 30000);
    expect(hit?.n).toBeGreaterThan(0);
  });

  it('mod 配方追加且强制 notDecraftable', () => {
    const r = VANILLA_RECIPES[VANILLA_RECIPES.length - 1];
    expect(r.create).toBe(30000);
    expect(r.notDecraftable).toBe(true);
    expect(r.items[0]?.id).toBe(3);
  });

  it('mod 盔甲 stats 三表贯通', () => {
    expect(statOfInternal(30001)?.def).toBe(3);
    expect(isFunctionalAccessory(30001)).toBe(true);
  });

  it('重复注册/越段 fail-fast', () => {
    expect(() => registerModItem({ key: 'mod_testmod_test_sword', name: 'x' }, 30100)).toThrow(/重复/);
    expect(() => registerModItem({ key: 'mod_testmod_y', name: 'y' }, 29999)).toThrow(/越段/);
    expect(() => registerModItem({ key: 'bad_prefix', name: 'z' }, 30101)).toThrow(/mod_ 前缀/);
    expect(() => registerModNpc(800, vanillaNpc(800)!)).toThrow(/冲突/);
    expect(() => registerModTile({ key: 'mod_testmod_dup' }, 1030)).toThrow(/冲突/);
  });
});
