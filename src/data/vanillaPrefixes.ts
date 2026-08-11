// 重铸词缀系统运行时（tools/extract-equip-prefix.mjs 从 1456 源码提取）。
// 语义 1:1 于 Item.Prefix（Item.cs:489-602）+ GetRollablePrefixes（:1083-1119）：
//   词缀 = 属性乘区 switch（TryGetPrefixStatMultipliersForItem :691-1061）+ 配饰 value 档位
//   （:1043-1060 四组 id 1.05/1.1/1.15/1.2）+ 各武器类可掷池（PrefixLegacy.Prefixes）
//   + 物品类集合（PrefixLegacy.ItemSets / ItemID.Sets.CanGetPrefixes）。
import prefixJson from './vanilla-prefix.json';

export interface PrefixStat {
  dmg: number; kb: number; spd: number; size: number;
  shtspd: number; mcst: number;
  crt: number; tagdmg: number; arpen: number;
  /** 配饰档位乘值（:1043-1060；其余为 1） */
  tier: number;
}

const DOC = prefixJson as {
  names: Record<string, string>;
  stats: Record<string, Partial<PrefixStat>>;
  reduced: number[];
  pools: Record<string, number[]>;
  itemSets: Record<string, number[]>;
  canGetPrefixesDefault: boolean;
  canGetPrefixesExcluded: number[];
};

export const PREFIX_NAMES = DOC.names;
export const REDUCED_NATURAL = new Set(DOC.reduced);
export const PREFIX_POOLS = DOC.pools;
export const PREFIX_ITEM_SETS = DOC.itemSets;

const DEFAULT_STAT: PrefixStat = { dmg: 1, kb: 1, spd: 1, size: 1, shtspd: 1, mcst: 1, crt: 0, tagdmg: 0, arpen: 0, tier: 1 };
/** 词缀属性表（1-97 全集；缺省字段 = 1/0） */
export function prefixStat(prefix: number): PrefixStat {
  const s = DOC.stats[String(prefix)];
  return s ? { ...DEFAULT_STAT, ...s, tier: s.tier ?? 1 } : { ...DEFAULT_STAT };
}

/** value 乘区（TryGetPrefixStatMultipliersForItem 尾部公式 :1041） */
export function prefixValueMul(prefix: number): number {
  const s = prefixStat(prefix);
  return s.dmg * (2 - s.spd) * (2 - s.mcst) * s.size * s.kb * s.shtspd
    * (1 + s.crt * 0.02) * (1 + s.arpen * 0.015) * (1 + s.tagdmg * 0.03) * s.tier;
}

/** 该物品可掷词缀池（GetRollablePrefixes :1083-1119 顺序判定；null=不可重铸） */
export function rollablePrefixes(vid: number, isAccessory: boolean): number[] | null {
  const s = DOC.itemSets;
  if (s.SwordsHammersAxesPicks.includes(vid)) return DOC.pools.PrefixesForSwords;
  if (s.SpearsMacesChainsawsDrillsPunchCannon.includes(vid)) return DOC.pools.PrefixesForSpears;
  if (s.GunsBows.includes(vid)) return DOC.pools.PrefixesForGunsBows;
  if (s.Magic.includes(vid)) return DOC.pools.PrefixesForMagic;
  if (s.Summon.includes(vid)) return DOC.pools.PrefixesForSummons;
  if (s.BoomerangsChakrams.includes(vid)) return DOC.pools.PrefixesForBoomeransAndChakrums;
  if (s.ItemsThatCanHaveLegendary2.includes(vid)) return DOC.pools.PrefixesForBoomeransAndChakrums_TerrarianYoyo;
  if (isAccessory) {
    if (!DOC.canGetPrefixesDefault && !DOC.canGetPrefixesExcluded.includes(vid)) return null;
    if (DOC.canGetPrefixesDefault && DOC.canGetPrefixesExcluded.includes(vid)) return null;
    return DOC.pools.PrefixesForAccessories;
  }
  return null;
}

/** 掷词缀（Item.Prefix 主干）：
 *  wantBest=true → Prefix(-2)（保底出词缀，等概率不挑档——原版 -2 仅重掷直到非 0）
 *  wantBest=false → Prefix(-1)（1/4 概率无词缀；ReducedNaturalChance 池成员 2/3 概率降为无词缀）
 *  返回 0 = 无词缀 */
export function rollPrefix(pool: number[], wantBest: boolean): number {
  for (let guard = 0; guard < 64; guard++) {
    const rolled = pool[Math.floor(Math.random() * pool.length)];
    if (rolled === 0) { if (wantBest) continue; return 0; }
    if (!wantBest && REDUCED_NATURAL.has(rolled) && Math.random() < 2 / 3) return 0;
    if (!wantBest && Math.random() < 1 / 4) return 0; // :536 Prefix(-1) 前置 1/4 无词缀
    return rolled;
  }
  return 0;
}

/** 词缀显示行（Tooltip 红/绿对比行近似原版 Lang.prefix[...] ToTooltip） */
export function prefixLines(prefix: number): Array<{ text: string; good: boolean }> {
  const s = prefixStat(prefix);
  const out: Array<{ text: string; good: boolean }> = [];
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  const add = (mul: number, goodLabel: string, badLabel: string) => {
    if (mul !== 1) out.push({ text: `${mul > 1 ? goodLabel : badLabel} ${pct(mul - 1)}`, good: mul > 1 });
  };
  add(s.dmg, '伤害', '伤害');
  add(2 - s.spd, '速度', '速度'); // spd<1 = 更快 = 好
  add(s.kb, '击退', '击退');
  add(s.size, '大小', '大小');
  add(s.shtspd, '弹速', '弹速');
  add(2 - s.mcst, '魔力消耗', '魔力消耗'); // mcst<1 = 减耗 = 好
  if (s.crt !== 0) out.push({ text: `${s.crt > 0 ? '+' : ''}${s.crt}% 暴击率`, good: s.crt > 0 });
  if (s.arpen !== 0) out.push({ text: `护甲穿透 +${s.arpen}`, good: true });
  if (s.tagdmg !== 0) out.push({ text: `召唤伤害 +${s.tagdmg}`, good: true });
  return out;
}
