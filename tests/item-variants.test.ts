// M2 物品变体系统（ItemVariants，1.4.5.6）：
//   注册表（ItemVariants.cs:108-142）/ 激活门（remix/getGood/mechdusa = remix×getGood，
//   SpecialSeedFeatures.cs:119-129）/ 属性乘区（Item.cs SetDefaults 23 处 Variant 分支）/
//   召唤禁用（Item.cs:7855/:7987/:8000 + Player.cs:43125/:43143/:43159）/
//   getfixedboi 补置 remix（WorldSeedOption_Everything.cs 依赖表全开 7 项）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseSeed } from '../src/world/gen/SeedEasterEggs';
import {
  ITEM_VARIANT_REGISTRY, ITEM_VARIANT_STATS, VARIANT_L10N_KEY,
  selectVariant, isMechdusaWorld, setItemVariantWorld, activeVariantOfVid,
  activeVariantStatsOfVid, variantRareOfVid, bossSummonDisabledVid,
} from '../src/data/vanillaItemVariants';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { vanillaStatOfVid } from '../src/data/vanillaItemStats';
import zhHans from '../public/l10n/zh-Hans.json';
import enUS from '../public/l10n/en-US.json';

beforeEach(() => setItemVariantWorld(null));
afterEach(() => setItemVariantWorld(null));

// ---------------------------------------------------------------------------
// 注册表全表（ItemVariants.cs:119-141，AddVariant 逐条）
// ---------------------------------------------------------------------------

/** 预期全表：vid → [kind, conditions[]]（与源码 AddVariant 一一对应） */
const EXPECTED_REGISTRY: Record<number, [string, string[]]> = {
  112: ['stronger', ['remix']],
  157: ['stronger', ['remix']],
  1319: ['stronger', ['remix']],
  1325: ['stronger', ['remix']],
  3069: ['stronger', ['remix']],
  5147: ['stronger', ['remix']],
  517: ['weaker', ['remix']],
  683: ['weaker', ['remix']],
  725: ['weaker', ['remix']],
  1314: ['weaker', ['remix']],
  2623: ['weaker', ['remix']],
  5279: ['weaker', ['remix']],
  5280: ['weaker', ['remix']],
  5281: ['weaker', ['remix']],
  5282: ['weaker', ['remix']],
  5283: ['weaker', ['remix']],
  5284: ['weaker', ['remix']],
  197: ['rebalanced', ['getGood']],
  4060: ['rebalanced', ['getGood']],
  544: ['disabledBossSummon', ['mechdusa']],
  556: ['disabledBossSummon', ['mechdusa']],
  557: ['disabledBossSummon', ['mechdusa']],
  5334: ['enabled', ['mechdusa']],
};

describe('注册表（ItemVariants.cs:119-141）', () => {
  it('23 条逐项：变体种类 + 激活条件', () => {
    expect(Object.keys(ITEM_VARIANT_REGISTRY)).toHaveLength(23);
    for (const [vidStr, [kind, conditions]] of Object.entries(EXPECTED_REGISTRY)) {
      const vid = Number(vidStr);
      const entries = ITEM_VARIANT_REGISTRY[vid];
      expect(entries, `vid ${vid}`).toBeDefined();
      expect(entries).toHaveLength(1);                 // 1456 注册表无同 id 双变体
      expect(entries[0].variant).toBe(kind);
      expect([...entries[0].conditions]).toEqual(conditions);
    }
  });

  it('变体名 l10n 键（ItemVariant.*）在官方语言产物内全量存在', () => {
    const zh = zhHans as Record<string, Record<string, string>>;
    const en = enUS as Record<string, Record<string, string>>;
    for (const key of Object.values(VARIANT_L10N_KEY)) {
      const [cat, name] = key.split('.');
      expect(zh[cat]?.[name], `zh-Hans ${key}`).toBeTruthy();
      expect(en[cat]?.[name], `en-US ${key}`).toBeTruthy();
    }
    expect(zh.ItemVariant.Stronger).toBe('更强');
    expect(zh.ItemVariant.DisabledBossSummon).toBe('Boss召唤已禁用');
  });
});

// ---------------------------------------------------------------------------
// 激活门（SelectVariant :87-106 + SpecialSeedFeatures.Mechdusa :119-129）
// ---------------------------------------------------------------------------

describe('激活门', () => {
  it('普通世界（无旗标）全表 null', () => {
    for (const vidStr of Object.keys(EXPECTED_REGISTRY)) {
      expect(selectVariant(Number(vidStr), {}), `vid ${vidStr}`).toBeNull();
    }
  });

  it('remix 世界（dontdigup）：Stronger/Weaker 激活，其余不激活', () => {
    const sf = parseSeed('dontdigup').flags;
    expect(sf.remix).toBe(true);
    expect(isMechdusaWorld(sf)).toBe(false);
    expect(selectVariant(112, sf)).toBe('stronger');
    expect(selectVariant(517, sf)).toBe('weaker');
    expect(selectVariant(5279, sf)).toBe('weaker');
    expect(selectVariant(197, sf)).toBeNull();          // Rebalanced 要 getGood
    expect(selectVariant(544, sf)).toBeNull();          // mechdusa 要 remix×getGood
    expect(selectVariant(5334, sf)).toBeNull();
  });

  it('getGood 世界（for the worthy）：仅 Rebalanced 激活', () => {
    const sf = parseSeed('for the worthy').flags;
    expect(sf.getGoodWorld).toBe(true);
    expect(selectVariant(197, sf)).toBe('rebalanced');
    expect(selectVariant(4060, sf)).toBe('rebalanced');
    expect(selectVariant(112, sf)).toBeNull();
    expect(selectVariant(556, sf)).toBeNull();
  });

  it('mechdusa = remix × getGood（SpecialSeedFeatures.cs:119-129 亲核）', () => {
    expect(isMechdusaWorld({ remix: true })).toBe(false);
    expect(isMechdusaWorld({ getGoodWorld: true })).toBe(false);
    expect(isMechdusaWorld({ remix: true, getGoodWorld: true })).toBe(true);
    const sf = { remix: true, getGoodWorld: true };
    expect(selectVariant(544, sf)).toBe('disabledBossSummon');
    expect(selectVariant(556, sf)).toBe('disabledBossSummon');
    expect(selectVariant(557, sf)).toBe('disabledBossSummon');
    expect(selectVariant(5334, sf)).toBe('enabled');
    // mechdusa 世界同时为 remix → Stronger/Weaker 亦激活（getfixedboi 全激活）
    expect(selectVariant(112, sf)).toBe('stronger');
    expect(selectVariant(517, sf)).toBe('weaker');
  });

  it('getfixedboi 补置 remix（WorldSeedOption_Everything 依赖表含 Remix）', () => {
    const sf = parseSeed('getfixedboi').flags;
    expect(sf.everything).toBe(true);
    expect(sf.getGoodWorld).toBe(true);
    expect(sf.remix).toBe(true);                        // 2026-08-20 补（此前缺）
    expect(isMechdusaWorld(sf)).toBe(true);             // → 变体全家族激活
    setItemVariantWorld(sf);
    expect(activeVariantOfVid(5334)).toBe('enabled');
    expect(bossSummonDisabledVid(556)).toBe(true);
  });

  it('种子归一化同门（"get fixed boi!" / "don\'t dig up"）', () => {
    expect(parseSeed('get fixed boi!').flags.remix).toBe(true);
    expect(parseSeed("don't dig up").flags.remix).toBe(true);
    expect(parseSeed('05162020').flags.remix).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 属性乘区（itemCombat 世界态叠层 = Item.cs SetDefaults Variant 分支）
// ---------------------------------------------------------------------------

describe('属性覆写 · Stronger（remix）', () => {
  beforeEach(() => setItemVariantWorld({ remix: true }));

  it('112 火之花（:2698-2705）：damage 85 / useTime·useAnimation 12', () => {
    const c = itemCombat(112)!;
    expect(c.damage).toBe(85);
    expect(c.useTime).toBe(12);
    expect(c.useAnimation).toBe(12);
  });

  it('157 水魔杖（:3252-3258）：damage 90 / useTime 5 / useAnimation 10', () => {
    const c = itemCombat(157)!;
    expect(c.damage).toBe(90);
    expect(c.useTime).toBe(5);
    expect(c.useAnimation).toBe(10);
  });

  it('1319 雪球炮（:16320-16330）：damage 22 / useTime·useAnimation 6', () => {
    const c = itemCombat(1319)!;
    expect(c.damage).toBe(22);
    expect(c.useTime).toBe(6);
    expect(c.useAnimation).toBe(6);
  });

  it('1325 链刀（:16404-16413）：damage 60 / 15·15 / autoReuse 翻 true', () => {
    const c = itemCombat(1325)!;
    expect(c.damage).toBe(60);
    expect(c.useTime).toBe(15);
    expect(c.useAnimation).toBe(15);
    expect(c.autoReuse).toBe(true);                     // 基值 false
  });

  it('3069 火花魔杖（:28390-28400）：damage 40 / mana 6 / shootSpeed 12 / autoReuse', () => {
    const c = itemCombat(3069)!;
    expect(c.damage).toBe(40);
    expect(c.useTime).toBe(10);
    expect(c.mana).toBe(6);
    expect(c.shootSpeed).toBe(12);
    expect(c.autoReuse).toBe(true);
  });

  it('5147 冰霜魔杖（:41094-41104）：damage 42 / mana 6 / shootSpeed 12 / autoReuse', () => {
    const c = itemCombat(5147)!;
    expect(c.damage).toBe(42);
    expect(c.useTime).toBe(10);
    expect(c.mana).toBe(6);
    expect(c.shootSpeed).toBe(12);
    expect(c.autoReuse).toBe(true);
  });
});

describe('属性覆写 · Weaker（remix）', () => {
  beforeEach(() => setItemVariantWorld({ remix: true }));

  it('517 魔法匕首（:7541-7550）：damage 14 / 15·15 / mana 5 / autoReuse false', () => {
    const c = itemCombat(517)!;
    expect(c.damage).toBe(14);
    expect(c.useTime).toBe(15);
    expect(c.useAnimation).toBe(15);
    expect(c.mana).toBe(5);
    expect(c.autoReuse).toBe(false);                    // 基值 true
  });

  it('683 邪恶三叉戟（:9422-9427）：damage 42 / mana 9', () => {
    const c = itemCombat(683)!;
    expect(c.damage).toBe(42);
    expect(c.mana).toBe(9);
  });

  it('725 冰雪弓（:9858-9865）：damage 8 / 17·17', () => {
    const c = itemCombat(725)!;
    expect(c.damage).toBe(8);
    expect(c.useTime).toBe(17);
    expect(c.useAnimation).toBe(17);
  });

  it('1314 KO加农炮（:16258-16266）：damage 18 / 25·25 / kb 5 / autoReuse false', () => {
    const c = itemCombat(1314)!;
    expect(c.damage).toBe(18);
    expect(c.useTime).toBe(25);
    expect(c.knockBack).toBe(5);
    expect(c.autoReuse).toBe(false);
  });

  it('2623 泡泡枪（:25667-25672）：damage 5', () => {
    expect(itemCombat(2623)!.damage).toBe(5);
  });

  it('灰烬木武器三件（:41891-41937）：5282 6·29 / 5283 damage4+hammer35 / 5284 8·23', () => {
    const b = itemCombat(5282)!;
    expect(b.damage).toBe(6);
    expect(b.useTime).toBe(29);
    expect(b.useAnimation).toBe(29);
    const h = itemCombat(5283)!;
    expect(h.damage).toBe(4);
    expect(activeVariantStatsOfVid(5283)?.hammer).toBe(35);   // 基值 45
    const s = itemCombat(5284)!;
    expect(s.damage).toBe(8);
    expect(s.useTime).toBe(23);
    expect(s.useAnimation).toBe(23);
  });

  it('灰烬木甲三件防御全降 1（:41852-41875，statOf 消费链 Player.cs:630）', () => {
    expect(vanillaStatOfVid(5279)?.def).toBe(1);       // 基值 2
    expect(vanillaStatOfVid(5280)?.def).toBe(1);       // 基值 3
    expect(vanillaStatOfVid(5281)?.def).toBe(1);       // 基值 2
    setItemVariantWorld(null);
    expect(vanillaStatOfVid(5279)?.def).toBe(2);       // 普通世界回基值
    expect(vanillaStatOfVid(5280)?.def).toBe(3);
  });
});

describe('属性覆写 · Rebalanced（getGood，C# (int) 截断）', () => {
  beforeEach(() => setItemVariantWorld({ getGoodWorld: true }));

  it('197 星星炮（:3808-3812）：damage (int)(55×0.9)=49 / useTime (int)(12×1.1)=13', () => {
    const c = itemCombat(197)!;
    expect(c.damage).toBe(49);
    expect(c.useTime).toBe(13);
  });

  it('4060 超级星星炮（:35653-35657）：damage (int)(60×0.9)=54 / useTime (int)(18×1.1)=19', () => {
    const c = itemCombat(4060)!;
    expect(c.damage).toBe(54);
    expect(c.useTime).toBe(19);
  });
});

describe('普通世界无变体（同物品常规值）', () => {
  it('itemCombat 全表回基值', () => {
    expect(itemCombat(112)!.damage).toBe(48);
    expect(itemCombat(112)!.useTime).toBe(16);
    expect(itemCombat(157)!.damage).toBe(27);
    expect(itemCombat(1319)!.damage).toBe(10);
    expect(itemCombat(3069)!.damage).toBe(14);
    expect(itemCombat(3069)!.autoReuse).toBeUndefined();
    expect(itemCombat(517)!.damage).toBe(30);
    expect(itemCombat(517)!.autoReuse).toBe(true);
    expect(itemCombat(683)!.damage).toBe(88);
    expect(itemCombat(683)!.mana).toBe(19);
    expect(itemCombat(725)!.damage).toBe(39);
    expect(itemCombat(1314)!.damage).toBe(40);
    expect(itemCombat(2623)!.damage).toBe(70);
    expect(itemCombat(5282)!.damage).toBe(10);
    expect(itemCombat(5283)!.damage).toBe(9);
    expect(itemCombat(5284)!.damage).toBe(13);
    // Rebalanced 基值不受 getGood 乘区影响
    expect(itemCombat(197)!.damage).toBe(55);
    expect(itemCombat(197)!.useTime).toBe(12);
    expect(itemCombat(4060)!.damage).toBe(60);
    expect(itemCombat(4060)!.useTime).toBe(18);
    // mechdusa 专属件普通世界整支不可用（Item.cs:42279 条件块不设）
    expect(itemCombat(5334)).toBeNull();
  });

  it('稀有度覆写仅变体世界生效', () => {
    expect(variantRareOfVid(112)).toBeUndefined();
    setItemVariantWorld({ remix: true });
    expect(variantRareOfVid(112)).toBe(6);
    expect(variantRareOfVid(157)).toBe(8);
    expect(variantRareOfVid(1319)).toBe(5);
    expect(variantRareOfVid(1325)).toBe(4);
    expect(variantRareOfVid(3069)).toBe(4);
    expect(variantRareOfVid(5147)).toBe(4);
    expect(variantRareOfVid(517)).toBe(1);
    expect(variantRareOfVid(683)).toBe(3);
    expect(variantRareOfVid(725)).toBe(1);
    expect(variantRareOfVid(2623)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 召唤禁用（mechdusa 世界 544/556/557 整支不可用）
// ---------------------------------------------------------------------------

describe('DisabledBossSummon（Player.cs:43125/:43143/:43159 同门）', () => {
  it('mechdusa 世界三件全禁；普通/remix/getGood 世界可用', () => {
    setItemVariantWorld({ remix: true, getGoodWorld: true });
    expect(bossSummonDisabledVid(544)).toBe(true);
    expect(bossSummonDisabledVid(556)).toBe(true);
    expect(bossSummonDisabledVid(557)).toBe(true);
    setItemVariantWorld({ remix: true });
    expect(bossSummonDisabledVid(556)).toBe(false);
    setItemVariantWorld({ getGoodWorld: true });
    expect(bossSummonDisabledVid(556)).toBe(false);
    setItemVariantWorld(null);
    expect(bossSummonDisabledVid(556)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 覆写表完整性（防漏注册/漂移）
// ---------------------------------------------------------------------------

describe('覆写表 ITEM_VARIANT_STATS', () => {
  it('有属性改写的 20 件均在表（544/556/557 纯语义禁用无字段）', () => {
    const withStats = [112, 157, 1319, 1325, 3069, 5147, 517, 683, 725, 1314, 2623,
      5279, 5280, 5281, 5282, 5283, 5284, 197, 4060, 5334];
    for (const vid of withStats) expect(ITEM_VARIANT_STATS[vid], `vid ${vid}`).toBeDefined();
    for (const vid of [544, 556, 557]) expect(ITEM_VARIANT_STATS[vid]).toBeUndefined();
    // 注册表 24 件全可达
    expect(Object.keys(ITEM_VARIANT_REGISTRY).length)
      .toBe(Object.keys(EXPECTED_REGISTRY).length);
  });
});
