// ★BJ537（2026-10-06）开局三件套带前缀=【销案】判别守卫（用户实报:开场赠送三件套带前缀,
// 铜短剑显示「神级」——问符合原版吗）。
//
// ══ 定谳（亲读 1457 反编译,1456/1458 同锚零差）══
// 「原版开局无前缀」系误判——原版三版开局全部掷自然词缀:
//   · 经典新角色: UICharacterCreation.cs:1749-1756 逐件 SetDefaults(3507/3509/3506)+Prefix(-1);
//   · 旅程支:     :1720-1747 前 5 件（6/1/10/7/4281）+armor[3]=4978 各 Prefix(-1),
//                 火炬 8/绳 965/魔镜 50/钩爪 84 仅 SetDefaults;
//   · 中核死亡发还: Player.cs:55010-55015 同款三件各 Prefix(-1)。
// 【Prefix(-1) ≠ 无前缀】Item.cs:505-625:prefixWeWant==0 才是清臂(:510-512);-1 = 自然掷:
//   :526 Next(4)==0 → 1/4 无词缀早退 → :534 RollAPrefix(:1140 池均匀掷) →
//   :557 ReducedNaturalChance 成员 Next(3)!=0 2/3 降为无词缀 → :565 TryGet 四失败门
//   掷废重进环（rolledPrefix 复位 -1）→ :620 prefix=(byte)rolledPrefix。
//   三件套 ∈ PrefixLegacy.ItemSets.SwordsHammersAxesPicks（:9-10 字面含 3506/3507/3509）
//   → 池 = PrefixesForSwords（PrefixLegacy.cs:9-15,40 元,含 81=Legendary/59=Godly）。
//   PrefixID.cs:6 ReducedNaturalChance={7,8,9,10,11,22,23,24,29,30,31,39,40,56,41,47,48,49}
//   ——81/59 均不在内 → 全权重可达。
//   ★1.4.5 官方 zh-Hans 词缀名重排:Prefix.Godly(59)=「神级」、Prefix.Legendary(81)=「传奇」
//   （public/l10n/zh-Hans.json Prefix 表=官方本地化;旧版「神级=Legendary」已废）——
//   用户实报「神级」即 Godly(59)。单次命中 3/4×1/40=1.875%;含 TryGet 掷废重进环
//   （铜短剑 damage 5 上 {3 Dangerous/12 Bulky/55 Unpleasant/46 Murderous/51 Nasty}
//   五词缀乘后舍入无感=掷废,Item.cs:1067-1079）终态 P(神级)=0.02069、P(无词缀)=0.44138。
// 本仓 grantStarterKit（Game.ts:2869,BJ87 单源）经典支 ...starterPrefixOf(id) →
//   rollNaturalPrefixForVid → rollNaturalPrefix（vanillaPrefixes.ts:147-166,
//   BJ390 while 环 1:1,掷序 Next(4)→池→Next(3)→TryGet 同原版逐骰同序）;
//   表面 vanilla-prefix.json 池/降档集/词缀属性与 1457 逐字节对拍全等（本文件钉值）。
// 数值面:原版 Legendary(case 81)=kb 1.15f/dmg 1.15f/crt 5/spd 0.9f/size 1.1f（Item.cs:746-752）;
//   Godly(case 59)=kb 1.15f/dmg 1.15f/crt 5（Item.cs:978-982）;铜短剑基面板 damage 5/
//   useAnimation 13/knockBack 4（Item.cs:31406-31414）;本仓 itemCombat(3507) 同值。
// ══ 判词:符合原版,销案不动刀。剥前缀（开局 plain）反而制造偏离 ══
// 本守卫三齿:①表面钉值 ②确定性掷序（含神级 59/传奇 81 可达路径）③端到端复现+
// 禁剥前缀 tripwire+分布钉值。BJ390 已钉掷环分布不变量,本文件钉开局域判别面。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RNG } from '../src/core/rng';
import {
  rollNaturalPrefix, rollNaturalPrefixForVid, rollablePrefixes,
  prefixStat, prefixTryGetFailsForItem, PREFIX_POOLS, REDUCED_NATURAL, PREFIX_NAMES,
} from '../src/data/vanillaPrefixes';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { grantStarterKit } from '../src/core/Game';
import { Inventory } from '../src/items/Inventory';
import { VI_KEY, VI_ID } from '../src/data/itemKeys';

const SWORDS_POOL = PREFIX_POOLS.PrefixesForSwords;
const COPPER_SHORTSWORD = 3507;
const GODLY = 59;       // 1457 PrefixID.cs:164 —— zh-Hans「神级」（用户实报字符串）
const LEGENDARY = 81;   // 1457 PrefixID.cs:172 —— zh-Hans「传奇」
const VANILLA_SWORDS_POOL_1457 = [   // PrefixLegacy.cs:9-15 逐字节金标
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 36, 37, 38, 53, 54,
  55, 39, 40, 56, 41, 57, 42, 43, 44, 45,
  46, 47, 48, 49, 50, 51, 59, 60, 61, 81,
];
const VANILLA_REDUCED_1457 = [7, 8, 9, 10, 11, 22, 23, 24, 29, 30, 31, 39, 40, 56, 41, 47, 48, 49];   // PrefixID.cs:6

/** 种子化 [0,1) 源（绑定 this——RNG.next 为方法引用不能裸传,BJ390 同款） */
const seeded = (seed: number): (() => number) => {
  const r = new RNG(seed);
  return () => r.next();
};

afterEach(() => { vi.restoreAllMocks(); });

describe('BJ537-① 表面钉值:1457 开局词缀域逐字节（PrefixLegacy.cs:9-15/PrefixID.cs:6）', () => {
  it('近战池 40 元与 1457 逐字节全等（含 59 Godly/81 Legendary,不含 1.4.4 旧编号 42=Legendary）', () => {
    expect(SWORDS_POOL).toEqual(VANILLA_SWORDS_POOL_1457);
    expect(SWORDS_POOL).toContain(GODLY);
    expect(SWORDS_POOL).toContain(LEGENDARY);
  });

  it('ReducedNaturalChance 与 1457 全等;59/81 均不在降档集（全权重自然掷）', () => {
    expect([...REDUCED_NATURAL].sort((a, b) => a - b)).toEqual([...VANILLA_REDUCED_1457].sort((a, b) => a - b));
    expect(REDUCED_NATURAL.has(GODLY)).toBe(false);
    expect(REDUCED_NATURAL.has(LEGENDARY)).toBe(false);
  });

  it('铜短剑 3507 ∈ SwordsHammersAxesPicks → 池=近战池（GetRollablePrefixes :1104-1107）', () => {
    expect(rollablePrefixes(COPPER_SHORTSWORD, false)).toEqual(VANILLA_SWORDS_POOL_1457);
  });

  it('基面板:铜短剑 damage 5/useAnimation 13/knockBack 4（Item.cs:31406-31414）', () => {
    expect(itemCombat(COPPER_SHORTSWORD)).toMatchObject({ damage: 5, useAnimation: 13, knockBack: 4 });
  });

  it('词缀属性:Godly(59)=dmg1.15/kb1.15/crt5（Item.cs:978-982）;Legendary(81) 多 spd0.9/size1.1（:746-752）', () => {
    expect(prefixStat(GODLY)).toMatchObject({ dmg: 1.15, kb: 1.15, crt: 5, spd: 1, size: 1 });
    expect(prefixStat(LEGENDARY)).toMatchObject({ dmg: 1.15, kb: 1.15, crt: 5, spd: 0.9, size: 1.1 });
  });

  it('显示面:zh-Hans 官方表「神级」=Godly(59)/「传奇」=Legendary(81)（1.4.5 官方本地化重排）', () => {
    const zh = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'l10n', 'zh-Hans.json'), 'utf8'));
    expect(zh.Prefix.Godly).toBe('神级');
    expect(zh.Prefix.Legendary).toBe('传奇');
    expect(PREFIX_NAMES[String(GODLY)]).toBe('Godly');
  });
});

describe('BJ537-② 掷序确定性:Prefix(-1) while 环逐骰（Item.cs:526→534→557→565）', () => {
  it('[0.5,0.91] → Godly 59（神级路径:1/4 门避 → 池掷 idx36）——铜短剑 stat 过 TryGet 门', () => {
    expect(prefixTryGetFailsForItem(GODLY, { damage: 5, useAnimation: 13, mana: 0, kb: 4 })).toBe(false);
    expect(rollNaturalPrefixForVid(COPPER_SHORTSWORD, false, seq(0.5, 0.91))).toBe(GODLY);
  });

  it('[0.5,0.99] 同源 → 传奇 81 可达（池尾 idx39;非降档集成员=无 mercy 骰）', () => {
    expect(prefixTryGetFailsForItem(LEGENDARY, { damage: 5, useAnimation: 13, mana: 0, kb: 4 })).toBe(false);
    expect(rollNaturalPrefix(SWORDS_POOL, seq(0.5, 0.99), undefined)).toBe(LEGENDARY);
  });

  it('[0.1] → 0（Next(4)==0 无词缀臂=1/4 plain 面;开局可以无前缀,原版同款）', () => {
    expect(rollNaturalPrefixForVid(COPPER_SHORTSWORD, false, seq(0.1))).toBe(0);
  });

  it('降档 mercy 面:[0.5,0.16,0.5] → Tiny(7) 被 Next(3) 压为 0;[0.5,0.16,0.0] → 7 存活', () => {
    expect(SWORDS_POOL.indexOf(7)).toBe(6);   // 池 idx6 → rand 0.16
    expect(REDUCED_NATURAL.has(7)).toBe(true);
    expect(rollNaturalPrefix(SWORDS_POOL, seq(0.5, 0.16, 0.5))).toBe(0);
    expect(rollNaturalPrefix(SWORDS_POOL, seq(0.5, 0.16, 0.0))).toBe(7);
  });

  it('掷序不可换（判别齿）:池掷先于 Next(3)——若先掷 mercy 骰,上述两序列结果对调', () => {
    // 反证锚:seq(0.5,0.16,0.0) 若 mercy 先掷（floor(0.5*3)=1≠0→降 0）结果 0 而非 7。
    // 本断言随实现钉死当前（=原版）骰序,任何重排立即爆红。
    expect(rollNaturalPrefix(SWORDS_POOL, seq(0.5, 0.16, 0.0))).toBe(7);
  });
});

describe('BJ537-③ 端到端:grantStarterKit 神级复现+BJ87 放置面不回归（UICharacterCreation.cs:1749-1756）', () => {
  it('队列 [0.5,0.91,0…] → [0] 铜短剑 prefix=59「神级」,[1]/[2] 无词缀;位置/数量照旧', () => {
    const spy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)    // 短剑:Next(4) 门避
      .mockReturnValueOnce(0.91)   // 短剑:池掷 floor(0.91*40)=36 → pool[36]=59 Godly
      .mockReturnValue(0);         // 镐/斧:Next(4) 首掷即无词缀臂
    const inv = new Inventory();
    grantStarterKit(inv);
    expect(spy).toHaveBeenCalled();
    expect(inv.slots[0]).toMatchObject({ id: VI_ID(3507), stack: 1, prefix: GODLY });
    expect(inv.slots[1]).toMatchObject({ id: VI_ID(3509), stack: 1 });
    expect(inv.slots[1]?.prefix).toBeUndefined();
    expect(inv.slots[2]).toMatchObject({ id: VI_ID(3506), stack: 1 });
    expect(inv.slots[2]?.prefix).toBeUndefined();
    for (let i = 3; i < inv.slots.length; i++) expect(inv.slots[i], `slot ${i}`).toBeNull();
  });

  it('队列 [0.5,0.99,0…] → [0] prefix=81（传奇面同可达;两前缀互斥随机共域）', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.99)
      .mockReturnValue(0);
    const inv = new Inventory();
    grantStarterKit(inv);
    expect(inv.slots[0]?.prefix).toBe(LEGENDARY);
  });

  it('全 0 骰 → 三件全 plain（开局无前缀形态=原版 1/4 臂,非缺省恒态）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const inv = new Inventory();
    grantStarterKit(inv);
    for (const s of inv.slots.slice(0, 3)) expect(s?.prefix).toBeUndefined();
  });

  it('旅程支同掷（:1720-1741）:队列同款 → 铁短剑(6) prefix=59;火炬/绳/魔镜/钩爪不掷照旧', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.91)
      .mockReturnValue(0);
    const inv = new Inventory();
    grantStarterKit(inv, 3);
    expect(inv.slots[0]).toMatchObject({ id: VI_ID(6), stack: 1, prefix: GODLY });
    for (const i of [5, 6, 7, 8]) expect(inv.slots[i]?.prefix, `slot ${i}`).toBeUndefined();
    expect(inv.armor[3]?.id).toBe(VI_ID(4978));   // 翼仍掷（starterPrefixOf(wings)）,此处骰尽=无词缀
  });

  it('真实随机面:词缀 ∈ 池∪无词缀,放置恒 [0..2]（BJ87 面不被词缀域扰动）', () => {
    for (let run = 0; run < 30; run++) {
      const inv = new Inventory();
      grantStarterKit(inv);
      expect(inv.slots[0]?.id).toBe(VI_ID(3507));
      expect(inv.slots[1]?.id).toBe(VI_ID(3509));
      expect(inv.slots[2]?.id).toBe(VI_ID(3506));
      for (const s of inv.slots.slice(0, 3)) {
        if (s?.prefix !== undefined) expect(SWORDS_POOL).toContain(s.prefix);
      }
    }
  });
});

describe('BJ537-④ 重开角色复验+分布钉值（P(神级)=0.02069,P(plain)=0.44138,含 TryGet 重进环）', () => {
  it('重开两号同队列 → 各自独立重掷、同获神级（非缓存/非首次独占）', () => {
    for (let run = 0; run < 2; run++) {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.91)
        .mockReturnValue(0);
      const inv = new Inventory();
      grantStarterKit(inv);
      expect(inv.slots[0]?.prefix, `重开#${run}`).toBe(GODLY);
      vi.restoreAllMocks();
    }
  });

  it('分布:P(=59)=P(=81)=0.02069±3σ;P(无词缀)=0.44138±3σ（16k 种子化样本,理论面见头注）', () => {
    const n = 16000;
    let godly = 0;
    let legendary = 0;
    let plain = 0;
    for (let i = 0; i < n; i++) {
      const r = rollNaturalPrefixForVid(COPPER_SHORTSWORD, false, seeded(i * 7919 + 41));
      if (r === GODLY) godly++;
      if (r === LEGENDARY) legendary++;
      if (r === 0) plain++;
    }
    // 神级/传奇:0.75×(1/40)/(1−0.75×5/40)=0.020690 → 均值 331.0;sd≈18.0 → 3σ≈54 → [277,385]
    expect(godly).toBeGreaterThanOrEqual(277);
    expect(godly).toBeLessThanOrEqual(385);
    expect(legendary).toBeGreaterThanOrEqual(277);
    expect(legendary).toBeLessThanOrEqual(385);
    // plain:(1/4 + 3/4×(12/40)×(2/3))/(1−0.75×5/40)=0.441379 → 均值 7062.1;sd≈62.8 → 3σ≈188 → [6874,7250]
    expect(plain).toBeGreaterThanOrEqual(6874);
    expect(plain).toBeLessThanOrEqual(7250);
  });
});

// ── 禁剥前缀 tripwire（销案守卫:任何「开局改 plain」刀=对原版偏离,立红）──
describe('BJ537-⑤ 写面 tripwire:grantStarterKit 经典支保留 starterPrefixOf 自然掷', () => {
  const GAME_SRC = () => readFileSync(join(__dirname, '..', 'src', 'core', 'Game.ts'), 'utf8');
  it('经典支逐槽直置仍展开 starterPrefixOf（game/src/core/Game.ts grantStarterKit）', () => {
    const src = GAME_SRC();
    expect(src).toMatch(/inv\.slots\[i\] = \{ id, stack: 1, \.\.\.starterPrefixOf\(id\) \}/);
    expect(src).toMatch(/function starterPrefixOf/);
    expect(src).toMatch(/rollNaturalPrefixForVid\(vid, isPrefixableAccessory\(id\)/);
  });
});

/** 定长 [0,1) 序列源:逐值消费,耗尽即抛（防隐式续骰掩盖掷序偏移） */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error(`BJ537 seq 耗尽:第 ${i + 1} 次掷骰无供给（掷序偏移信号）`);
    return values[i++];
  };
}
