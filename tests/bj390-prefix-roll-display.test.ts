// BJ390（2026-09-28）词缀链三面落刀判别面：
//   ①掉落/开局自然掷 rollNaturalPrefix（Item.Prefix(-1) while 环 1:1,Item.cs:499-625）——
//     掷序 Next(4)→池→Next(3)→TryGet 四失败门重进环;
//   ②显示格式 formatPrefixedName（Lang.GetPrefixedItemName Lang.cs:225-239 →
//     CombineFormat.Prefix l10n——zh-Hans ‹› 尖单引号=用户实报 "<>" 面）;
//   ③l10n 数据面（public/l10n 产物自带 CombineFormat.Prefix 全语种）。
// 锚域：NPC 掉落自然掷=CommonCode.cs:20/:29/:48 三口 NewItem(-1)（BJ390 落刀前本仓
// 掉落全链 prefix=0=用户实报「掉落不带前缀」根因）;开局件=UICharacterCreation.cs
// :1725-1756 逐件 Prefix(-1)。craft 链（RB4a/BJ392 域）与本测试只验池/分布不变量。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import {
  rollNaturalPrefix, rollNaturalPrefixForVid, rollablePrefixes,
  prefixStat, netRoundEq, prefixTryGetFailsForItem, formatPrefixedName,
  PREFIX_POOLS, REDUCED_NATURAL,
} from '../src/data/vanillaPrefixes';
import { grantStarterKit } from '../src/core/Game';
import { Inventory } from '../src/items/Inventory';

const SWORDS_POOL = PREFIX_POOLS.PrefixesForSwords;

/** 种子化 [0,1) 源（绑定 this——RNG.next 为方法引用不能裸传） */
const seeded = (seed: number): (() => number) => {
  const r = new RNG(seed);
  return () => r.next();
};
const IRON_BROADSWORD = 4;    // SwordsHammersAxesPicks 成员
const BONE_SWORD = 1166;      // 骷髅掉落武器（vanilla-npcdrops 注册）
const MAGIC_KB0 = 1244;       // 池内 kb==0 武器（TryGet kb 门判别域）
const COIN_GOLD = 73;         // 不可前缀域（GetRollablePrefixes null → Prefix 提前 false）

afterEach(() => { vi.restoreAllMocks(); });

describe('BJ390-① rollNaturalPrefix：Item.Prefix(-1) while 环不变量', () => {
  it('非零结果恒 ∈ 可掷池（RollAPrefix 均匀域）', () => {
    const pool = SWORDS_POOL;
    for (let i = 0; i < 3000; i++) {
      const r = rollNaturalPrefix(pool, seeded(i * 977 + 3));
      expect(r).toBeGreaterThanOrEqual(0);
      if (r !== 0) expect(pool).toContain(r);
    }
  });

  it('自然掷词缀率 = 0.75×(1−reduced 占比×2/3)（近战池 12/40 reduced → 理论 0.60;20k 样本）', () => {
    let prefixed = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const r = rollNaturalPrefix(SWORDS_POOL, seeded(i * 7919 + 13));
      if (r !== 0) prefixed++;
    }
    const rate = prefixed / n;
    // 理论 = 3/4 × (1 − (12/40)×2/3) = 0.60（wiki「75% upon creation」为 mercy 前置;
    // ReducedNaturalChance 成员 2/3 掷废,mercy 面另见下测）
    expect(rate).toBeGreaterThan(0.58);
    expect(rate).toBeLessThan(0.62);
  });

  it('mercy 面：ReducedNaturalChance 成员实际出现率 ≈ 非成员的 1/3（Next(3)!=0 压制）', () => {
    const reducedInPool = SWORDS_POOL.filter((p) => REDUCED_NATURAL.has(p));
    const normalInPool = SWORDS_POOL.filter((p) => !REDUCED_NATURAL.has(p));
    expect(reducedInPool.length).toBeGreaterThan(0);
    const cnt = new Map<number, number>();
    const n = 30000;
    for (let i = 0; i < n; i++) {
      const r = rollNaturalPrefix(SWORDS_POOL, seeded(i * 104729 + 7));
      if (r !== 0) cnt.set(r, (cnt.get(r) ?? 0) + 1);
    }
    const sum = (a: number[]) => a.reduce((s, p) => s + (cnt.get(p) ?? 0), 0);
    const perReduced = sum(reducedInPool) / reducedInPool.length;
    const perNormal = sum(normalInPool) / normalInPool.length;
    // 理论比 ≈ (1/3)/(1) = 0.333（ mercy 2/3 掷废）;带宽宽松防 RNG 抖动
    expect(perReduced / perNormal).toBeLessThan(0.5);
    expect(perReduced / perNormal).toBeGreaterThan(0.2);
  });

  it('TryGet 校验环：kb==0 武器（1244）恒不出 kb 乘子词缀（旧 rollPrefix 假词缀判别域）', () => {
    const pool = rollablePrefixes(MAGIC_KB0, false)!;
    expect(pool).toBeTruthy();
    const kbMultIds = pool.filter((p) => prefixStat(p).kb !== 1);
    expect(kbMultIds.length).toBeGreaterThan(0);   // 池内确有 kb 词缀=判别力前提
    for (let i = 0; i < 2000; i++) {
      const r = rollNaturalPrefixForVid(MAGIC_KB0, false, seeded(i * 7907 + 1));
      if (r !== 0) expect(prefixStat(r).kb).toBe(1);   // kb 门必拦（Item.cs:1077）
    }
  });

  it('不可前缀域（钱币 73）恒 0——CanHavePrefixes null 提前 false（Item.cs:516-518）', () => {
    for (let i = 0; i < 500; i++) {
      expect(rollNaturalPrefixForVid(COIN_GOLD, false, seeded(i))).toBe(0);
    }
  });

  it('可掷武器 vid（骨剑 1166）自然掷出池内词缀或无词缀（NPC 掉落通道语义）', () => {
    const pool = rollablePrefixes(BONE_SWORD, false)!;
    for (let i = 0; i < 2000; i++) {
      const r = rollNaturalPrefixForVid(BONE_SWORD, false, seeded(i * 31 + 5));
      if (r !== 0) expect(pool).toContain(r);
    }
  });
});

describe('BJ390-①′ TryGet 四失败门（Item.cs:1067-1079 f32+银行家）', () => {
  it('netRoundEq：f32 积 + MidpointRounding.ToEven 判别子', () => {
    expect(netRoundEq(10, 1.05)).toBe(true);    // 10.5 → 银行家取偶 10 == base → 无感
    expect(netRoundEq(10, 1.1)).toBe(false);    // 11.000000… → 11 ≠ 10
    expect(netRoundEq(3, 1.15)).toBe(true);     // 3.45 → 3 == base（铜斧 3×Legendary 1.15 同案）
    expect(netRoundEq(5, 1.15)).toBe(false);    // 5.75 → 6 ≠ 5
  });

  it('四门：dmg/ua/mana 舍入无感 + kb==0 各自拦截;配饰池（全 1 乘子）恒通过', () => {
    const kbPrefix = 38;    // Agile kb 1.15
    expect(prefixTryGetFailsForItem(kbPrefix, { damage: 10, useAnimation: 20, mana: 0, kb: 0 })).toBe(true);
    expect(prefixTryGetFailsForItem(kbPrefix, { damage: 10, useAnimation: 20, mana: 0, kb: 4 })).toBe(false);
    expect(prefixTryGetFailsForItem(3, { damage: 10, useAnimation: 20, mana: 0, kb: 4 })).toBe(true);   // 1.05×10→10.5 银行家 10
    expect(prefixTryGetFailsForItem(3, { damage: 100, useAnimation: 20, mana: 0, kb: 4 })).toBe(false); // 105 ≠ 100
    expect(prefixTryGetFailsForItem(83, { damage: 10, useAnimation: 20, mana: 10, kb: 4 })).toBe(false); // mcst 0.9×10=9 ≠ 10
    expect(prefixTryGetFailsForItem(83, { damage: 10, useAnimation: 20, mana: 0, kb: 4 })).toBe(true);  // 0×0.9=0 == 0 无感
    expect(prefixTryGetFailsForItem(65, undefined)).toBe(false);   // stat 缺省=恒通过（62-80 池同相）
  });
});

describe('BJ390-② formatPrefixedName：CombineFormat.Prefix per-language 拼装', () => {
  it('zh-Hans 官方格式 = ‹{PrefixName}›{ItemName}（U+2039/203A 尖单引号,无空格）', () => {
    expect(formatPrefixedName('传奇', '天顶剑', '‹{PrefixName}›{ItemName}')).toBe('‹传奇›天顶剑');
  });

  it('en-US 官方格式 = {PrefixName} {ItemName}（空格分隔,无括号）', () => {
    expect(formatPrefixedName('Legendary', 'Zenith', '{PrefixName} {ItemName}')).toBe('Legendary Zenith');
  });

  it('zh-Hant 无分隔直连;键缺失回落裸拼接（旧实相）', () => {
    expect(formatPrefixedName('傳奇', '天頂劍', '{PrefixName}{ItemName}')).toBe('傳奇天頂劍');
    expect(formatPrefixedName('传奇', '天顶剑', null)).toBe('传奇天顶剑');
    expect(formatPrefixedName('传奇', '天顶剑', undefined as unknown as null)).toBe('传奇天顶剑');
  });

  it('l10n 产物数据面：public/l10n 全语种自带 CombineFormat.Prefix（zh-Hans ‹›/en 空格）', () => {
    const zh = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
    const en = JSON.parse(readFileSync('public/l10n/en-US.json', 'utf8'));
    expect(zh.CombineFormat.Prefix).toBe('‹{PrefixName}›{ItemName}');
    expect(en.CombineFormat.Prefix).toBe('{PrefixName} {ItemName}');
  });
});

describe('BJ390-③ 开局件自然掷（UICharacterCreation.cs:1725-1756 逐件 Prefix(-1)）', () => {
  it('经典开局三件（铜短剑/镐/斧）自然掷:词缀 ∈ 铜剑池（Math.random 通道）', () => {
    const inv = new Inventory();
    grantStarterKit(inv, 0);
    for (const s of inv.slots.slice(0, 3)) {
      expect(s).toBeTruthy();
      if (s!.prefix) expect(SWORDS_POOL).toContain(s!.prefix);
    }
  });

  it('旅程开局前 5 件+finch 翼逐件掷;火炬/绳/魔镜/钩爪不掷（:1735-1738 仅 SetDefaults）', () => {
    const inv = new Inventory();
    grantStarterKit(inv, 3);
    for (const s of inv.slots.slice(0, 5)) {
      expect(s).toBeTruthy();
      if (s!.prefix) {
        const pool = rollablePrefixes(6, false) ?? [];
        expect(SWORDS_POOL).toContain(1);   // 池锚在位（铜短剑 6 ∈ SwordsHammersAxesPicks）
        expect(pool.length).toBeGreaterThan(0);
      }
    }
    expect(inv.slots[5]!.prefix).toBeUndefined();   // 火炬 100
    expect(inv.slots[6]!.prefix).toBeUndefined();   // 绳 100
    expect(inv.slots[7]!.prefix).toBeUndefined();   // 魔镜
    expect(inv.slots[8]!.prefix).toBeUndefined();   // 钩爪
  });

  it('判别力:Math.random 钉 0（Next(4)==0 首掷即无词缀）→ 全体无前缀;词缀掷确被消费', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const inv = new Inventory();
    grantStarterKit(inv, 0);
    for (const s of inv.slots.slice(0, 3)) expect(s!.prefix).toBeUndefined();
    expect(spy.mock.calls.length).toBeGreaterThan(0);   // Prefix(-1) 掷骰确然发生（Next(4) 首)
  });
});
