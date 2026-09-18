// 重铸词缀系统运行时（tools/extract-equip-prefix.mjs 从 1456 源码提取）。
// 语义 1:1 于 Item.Prefix（Item.cs:505-631,1458 同构）+ GetRollablePrefixes（:1102 起）：
//   词缀 = 属性乘区 switch（TryGetPrefixStatMultipliersForItem :710-1076）+ 配饰 value 档位
//   （:1043-1059 四组 id 1.05/1.1/1.15/1.2）+ 各武器类可掷池（PrefixLegacy.Prefixes）
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

const f32 = Math.fround;

/** value 乘区（TryGetPrefixStatMultipliersForItem 尾部公式 Item.cs:1041）。
 *  ★BJ122（2026-09-18）f32 判例（BJ92 碎片环同族）：原版 out value 与 Prefix 的
 *  num2 都是 C# float——:1041 主链全 float 运算（f32 操作数、逐 op 最近舍入）,
 *  :1043-1059 档位各自 value *= 1.05f..1.2f 亦逐 op;num2 存 float 字段（:540）
 *  后阈值 (double)num2 与 1.2/1.05/0.8/0.95【double 字面量】比较（:588-604）。
 *  f64 直算会踩线翻错档（红蓝-E 全 97 件 fround 对拍实证六件）：
 *  · 45 Nimble/62 Hard/69 Jagged/73 Brisk/77 Wild（配饰 1.05 档）：原版
 *    num2=1.0499999523（1.05f 及 2f-0.95f 的 f32 舍入）< 1.05 → rare 不动;
 *    f64 1.05 ≥ 1.05 → 错 +1（白→蓝名色）。
 *  · 56 Weak：原版 num2=0.8000000119（0.8f 的 f32 舍入）> 0.8 → 落 0.95 档 rare
 *    −1;f64 0.8 ≤ 0.8 → 错 −2（灰→白名色）。
 *  故全链 Math.fround：先把 JSON 十进制字面量 fround 成原版 f32 操作数,再逐 op
 *  fround（f64 中转对 f32 操作数精确,fround = IEEE 最近舍入）。fround 序 =
 *  乘后即存（原版每步落 float 字段/中间量）;末位单次 fround 是错序（23 件值变、
 *  48 Large rare 位移再翻,tests/prefix-f32-threshold.test.ts 守卫）。
 *  对拍：仅上述六件 rare 位移翻转,其余 91 件值与位移零变化。 */
export function prefixValueMul(prefix: number): number {
  const s = prefixStat(prefix);
  let v = f32(s.dmg);                                                    // 1f * dmg
  v = f32(v * f32(2 - f32(s.spd)));                                      // (2f - spd)
  v = f32(v * f32(2 - f32(s.mcst)));                                     // (2f - mcst)
  v = f32(v * f32(s.size));
  v = f32(v * f32(s.kb));
  v = f32(v * f32(s.shtspd));
  v = f32(v * f32(1 + f32(f32(s.crt) * f32(0.02))));                     // (1f + crt*0.02f)
  v = f32(v * f32(1 + f32(f32(s.arpen) * f32(0.015))));                  // (1f + arpen*0.015f)
  v = f32(v * f32(1 + f32(f32(s.tagdmg) * f32(0.03))));                  // (1f + tagdmg*0.03f)
  v = f32(v * f32(s.tier));                                              // :1043-1059 档位 *=（tier=1 恒等）
  return v;
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
  // 行序 = 原版差分行链（Main.cs:20856-21010）：伤害39 → 速度40 → 暴击41 →
  // 魔力42 → 大小43 → 弹速44 → 击退45（曾把击退排第 3，视觉序偏离）
  add(s.dmg, '伤害', '伤害');
  add(2 - s.spd, '速度', '速度'); // spd<1 = 更快 = 好
  if (s.crt !== 0) out.push({ text: `${s.crt > 0 ? '+' : ''}${s.crt}% 暴击率`, good: s.crt > 0 });
  add(2 - s.mcst, '魔力消耗', '魔力消耗'); // mcst<1 = 减耗 = 好
  add(s.size, '大小', '大小');
  add(s.shtspd, '弹速', '弹速');
  add(s.kb, '击退', '击退');
  if (s.arpen !== 0) out.push({ text: `护甲穿透 +${s.arpen}`, good: true });
  if (s.tagdmg !== 0) out.push({ text: `召唤伤害 +${s.tagdmg}`, good: true });
  return out;
}
