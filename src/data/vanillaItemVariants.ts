// 物品变体系统 1:1（Terraria.GameContent.Items/ItemVariants.cs + Item.cs SetDefaults
// 23 处 Variant 分支 + Player.cs 召唤门，1.4.5.6）。
//
// 语义：变体是【世界态运行时修饰】——同一物品在普通世界取常规数值，在对应
// 秘密种子世界（remix / getGood / mechdusa）按变体分支改写伤害/击退/速度/
// 耗魔/售价档/稀有度/防御。与原版一致：不做数据双份，进世界时（afterWorldLoad
// → setItemVariantWorld）灌入 seedFlags 投影，itemCombat/vanillaStatOfVid 各
// 取数口按当前投影叠层。
//
// 原版选择链：Item.SetDefaults(Type)（Item.cs:48269）→ variant==null 时
// ItemVariants.SelectVariant(Type)（ItemVariants.cs:87-106，按注册序取首个
// 条件满足的 entry）→ SetDefaults switch 内 Variant 分支改写属性。世界切换时
// Player.RefreshItems（Player.cs:34880-34896，onlyIfVariantChanged 门）+ Recipe.
// UpdateItemVariants（Recipe.cs:531-543）全量重算——本仓等价物 = 每个世界激活
// 时重灌上下文（数据层无持久物品实例，天然免 Refresh）。
import type { SeedFlags } from '../world/gen/SeedEasterEggs';
import type { ItemCombat } from './vanillaItemCombat';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 五种变体（ItemVariants.cs:111-115） */
export type ItemVariantKind =
  | 'stronger'              // ItemVariant.Stronger（zh「更强」）
  | 'weaker'                // ItemVariant.Weaker（zh「更弱」）
  | 'rebalanced'            // ItemVariant.Rebalanced（zh「已重新平衡」）
  | 'enabled'               // ItemVariant.Enabled（zh「启用」）
  | 'disabledBossSummon';   // ItemVariant.DisabledBossSummon（zh「Boss召唤已禁用」）

/** 激活条件（ItemVariants.cs:116-118；1457 新增第四种 SkyblockWorld :121） */
export type ItemVariantConditionKind =
  | 'remix'     // ItemVariantCondition.RemixWorld → Main.remixWorld（"don't dig up"）
  | 'getGood'   // ItemVariantCondition.GetGoodWorld → Main.getGoodWorld（"for the worthy"）
  | 'mechdusa'  // ItemVariantCondition.MechdusaWorld → SpecialSeedFeatures.Mechdusa
  | 'skyblock'; // 1457: ItemVariantCondition.SkyblockWorld → Main.skyblockWorld（ItemVariants.cs:121）

export interface ItemVariantEntry {
  variant: ItemVariantKind;
  conditions: readonly ItemVariantConditionKind[];
}

/** 变体属性覆写（Item.cs SetDefaults 各 Variant 分支逐字面） */
export interface ItemVariantStats {
  /** ItemCombat 字段覆写（damage/knockBack/useTime/useAnimation/mana/autoReuse/
   *  shootSpeed/consumable…） */
  combat?: Partial<ItemCombat>;
  /** Rebalanced 乘区（197/4060：damage*0.9 / useTime*1.1，C# (int) 强转 = 截断） */
  damageMul?: number;
  useTimeMul?: number;
  /** Item.rare 覆写（名称着色档） */
  rare?: number;
  /** Item.defense 覆写（盔甲件 5279-5281） */
  defense?: number;
  /** Item.hammer 覆写（5283 灰烬木锤 45→35） */
  hammer?: number;
  /** 1456 真 Item.value（字段名保留历史;值经 recon-item 闸门对 1457 复核,买入单位 = sellPrice 含 ×5 尾乘）。
   *  ★死资产定性（2026-09-03 清点）：全仓零运行时消费者——运行时物品价值走
   *  vanilla-itemvalue.json（2026-08-23 重定基,extract-itemrare.mjs sellPrice ×5 修复,
   *  与本表口径一致）；变体值接入无口径障碍但也无消费需求,本字段保留为对账文档。 */
  value1456?: number;
}

// ---------------------------------------------------------------------------
// 变体名 l10n 键（Terraria.Localization.ItemVariant.*，官方翻译已随 l10n 产物内置）
// ---------------------------------------------------------------------------

export const VARIANT_L10N_KEY: Readonly<Record<ItemVariantKind, string>> = {
  stronger: 'ItemVariant.Stronger',
  weaker: 'ItemVariant.Weaker',
  rebalanced: 'ItemVariant.Rebalanced',
  enabled: 'ItemVariant.Enabled',
  disabledBossSummon: 'ItemVariant.DisabledBossSummon',
};

// ---------------------------------------------------------------------------
// 注册表（ItemVariants.cs:119-141 静态构造，AddVariant 顺序即选择序）
// ---------------------------------------------------------------------------

const S = (conditions: ItemVariantConditionKind[]): ItemVariantEntry =>
  ({ variant: 'stronger', conditions });
const W = (conditions: ItemVariantConditionKind[]): ItemVariantEntry =>
  ({ variant: 'weaker', conditions });
const R = (conditions: ItemVariantConditionKind[]): ItemVariantEntry =>
  ({ variant: 'rebalanced', conditions });

/** remix / getGood / mechdusa 三条件（ItemVariants.cs:116-118） */
const REMIX: ItemVariantConditionKind[] = ['remix'];
const GET_GOOD: ItemVariantConditionKind[] = ['getGood'];
const MECHDUSA: ItemVariantConditionKind[] = ['mechdusa'];
const SKYBLOCK: ItemVariantConditionKind[] = ['skyblock']; // 1457 新增（ItemVariants.cs:145-146）

/** 原版 item id → 变体条目（每 id 恰一条——1456 注册表无同 id 双变体） */
export const ITEM_VARIANT_REGISTRY: Readonly<Record<number, readonly ItemVariantEntry[]>> = {
  // ---- Stronger（RemixWorld，ItemVariants.cs:119-124）----
  112: [S(REMIX)],      // Flower of Fire 火之花
  157: [S(REMIX)],      // Aqua Scepter 水魔杖
  1319: [S(REMIX)],     // Snowball Cannon 雪球炮
  1325: [S(REMIX)],     // Chain Knife 链刀
  3069: [S(REMIX)],     // Wand of Sparking 火花魔杖
  5147: [S(REMIX)],     // Wand of Frosting 冰霜魔杖
  // ---- Weaker（RemixWorld，ItemVariants.cs:125-135）----
  517: [W(REMIX)],      // Magic Dagger 魔法匕首
  683: [W(REMIX)],      // Unholy Trident 邪恶三叉戟
  725: [W(REMIX)],      // Ice Bow 冰雪弓
  1314: [W(REMIX)],     // KO Cannon KO加农炮
  2623: [W(REMIX)],     // Bubble Gun 泡泡枪
  5279: [W(REMIX)],     // Ash Wood Helmet 灰烬木头盔
  5280: [W(REMIX)],     // Ash Wood Breastplate 灰烬木胸甲
  5281: [W(REMIX)],     // Ash Wood Greaves 灰烬木护腿
  5282: [W(REMIX)],     // Ash Wood Bow 灰烬木弓
  5283: [W(REMIX)],     // Ash Wood Hammer 灰烬木锤
  5284: [W(REMIX)],     // Ash Wood Sword 灰烬木剑
  // 1457 新增（ItemVariants.cs:145-146，SkyblockWorld）
  5687: [W(SKYBLOCK)],  // Slime Spear 黏液枪矛
  5688: [W(SKYBLOCK)],  // Slime Whip 黏液鞭
  // ---- Rebalanced（GetGoodWorld，ItemVariants.cs:136-137）----
  197: [R(GET_GOOD)],   // Star Cannon 星星炮
  4060: [R(GET_GOOD)],  // Super Star Cannon 超级星星炮
  // ---- DisabledBossSummon（MechdusaWorld，ItemVariants.cs:138-140）----
  544: [{ variant: 'disabledBossSummon', conditions: MECHDUSA }], // Mechanical Eye 机械魔眼
  556: [{ variant: 'disabledBossSummon', conditions: MECHDUSA }], // Mechanical Worm 机械蠕虫
  557: [{ variant: 'disabledBossSummon', conditions: MECHDUSA }], // Mechanical Skull 机械骷髅头
  // ---- Enabled（MechdusaWorld，ItemVariants.cs:141）----
  5334: [{ variant: 'enabled', conditions: MECHDUSA }], // MechdusaSummon 奥库瑞姆剃刀
};

// ---------------------------------------------------------------------------
// 属性覆写表（Item.cs SetDefaults 23 处 Variant 分支逐字面,行号锚 1456——★1457 已合并 SetDefaults1-5 → SetDefaults(int Type, ItemVariant),Variant 分支语义保留,值经 recon 闸门复核）
// ---------------------------------------------------------------------------

/**
 * 逐条注释格式：vid 名（分支行号）{ 改写 }——未列出字段 = 分支不动。
 * DisabledBossSummon（544/556/557，:7855-7861/:7987-7993/:8000-8006）分支形状
 * 是【条件不满足才设 useStyle4/consumable/useTime·useAnimation 45】——变体激活
 * 即收回使用能力，整支不可用（无覆写字段，语义由 bossSummonDisabledVid 承载）。
 */
export const ITEM_VARIANT_STATS: Readonly<Record<number, Readonly<ItemVariantStats>>> = {
  // ---- Stronger（Remix）----
  // :2698-2705（基值 damage48/anim16/time16/rare3/value=hellPrice）
  112: { combat: { damage: 85, useTime: 12, useAnimation: 12 }, rare: 6, value1456: 500000 },
  // :3252-3258（基值 damage27/anim16/time8/rare2/value=dungeonPrice）
  157: { combat: { damage: 90, useTime: 5, useAnimation: 10 }, rare: 8, value1456: 250000 },
  // :16320-16330（基值 damage10/anim19/time19/rare1/value 100000）
  1319: { combat: { damage: 22, useTime: 6, useAnimation: 6 }, rare: 5, value1456: 250000 },
  // :16404-16413（基值 damage12/anim20/time20/autoReuse false）
  1325: { combat: { damage: 60, useTime: 15, useAnimation: 15, autoReuse: true }, rare: 4, value1456: 175000 },
  // :28390-28400（基值 damage14/anim26/time26/mana2/shootSpeed7/crit10）
  3069: { combat: { damage: 40, useTime: 10, useAnimation: 10, mana: 6, shootSpeed: 12, autoReuse: true }, rare: 4, value1456: 250000 },
  // :41094-41104（基值 damage15/anim26/time26/mana2/shootSpeed7/crit10）
  5147: { combat: { damage: 42, useTime: 10, useAnimation: 10, mana: 6, shootSpeed: 12, autoReuse: true }, rare: 4, value1456: 252500 },
  // ---- Weaker（Remix）----
  // :7541-7550（基值 damage30/anim8/time8/mana6/autoReuse true/value=sellPrice(0,5)）
  517: { combat: { damage: 14, useTime: 15, useAnimation: 15, mana: 5, autoReuse: false }, rare: 1, value1456: 5000 },
  // :9422-9427（基值 damage88/mana19/value 500000/rare6）；1457 弱变体 damage 42→77
  // （Terarria1457 Item.cs:9445-9449，基值 150）
  683: { combat: { damage: 77, mana: 9 }, rare: 3, value1456: 125000 },
  // :9858-9865（基值 damage39/anim14/time14/value=sellPrice(0,5)/rare5）
  725: { combat: { damage: 8, useTime: 17, useAnimation: 17 }, rare: 1, value1456: 100000 },
  // :16258-16266（基值 damage40/anim28/time28/kb6.5/autoReuse true；分支同值重赋 rare4/value 不列）
  1314: { combat: { damage: 18, useTime: 25, useAnimation: 25, knockBack: 5, autoReuse: false } },
  // :25667-25672（基值 damage70/rare8/value=sellPrice(0,5)）
  2623: { combat: { damage: 5 }, rare: 2, value1456: 87500 },
  // :41852-41855（基值 defense 2）
  5279: { defense: 1 },
  // :41862-41865（基值 defense 3）
  5280: { defense: 1 },
  // :41872-41875（基值 defense 2）
  5281: { defense: 1 },
  // :41891-41895（基值 damage10/anim25/time25）
  5282: { combat: { damage: 6, useTime: 29, useAnimation: 29 } },
  // :41913-41917（基值 damage9/hammer45）
  5283: { combat: { damage: 4 }, hammer: 35 },
  // :41932-41937（基值 damage13/anim17/time17）
  5284: { combat: { damage: 8, useTime: 23, useAnimation: 23 } },
  // ---- 1457 新增 Weaker（Skyblock）（Terarria1457 Item.cs:44689-44691/:44696-44698）----
  // 5687 黏液枪矛（基值 damage12→弱化 9）/ 5688 黏液鞭（基值 damage15→弱化 12）。
  // ★2026-08-23 基准切换 1457：基值取 1457 终值（曾按 1456 钉 5688 基值 12,弱化档
  // 恰与基值同值的"巧合"随之消除——现 15→12 与原版 Weaker 语义一致）
  5687: { combat: { damage: 9 } },
  5688: { combat: { damage: 12 } },
  // ---- Rebalanced（GetGood/FTW）----
  // :3808-3812：damage=(int)(55*0.9)=49 / useTime=(int)(12*1.1)=13（(int)=截断）
  197: { damageMul: 0.9, useTimeMul: 1.1 },
  // :35653-35657：damage=(int)(60*0.9)=54 / useTime=(int)(18*1.1)=19
  4060: { damageMul: 0.9, useTimeMul: 1.1 },
  // ---- DisabledBossSummon（Mechdusa）544/556/557：无字段覆写（见上方注释）----
  // ---- Enabled（Mechdusa）----
  // :42279-42285（基值：无 useStyle/consumable——非 mechdusa 世界整支不可用）
  5334: { combat: { consumable: true, useTime: 45, useAnimation: 45 } },
};

// ---------------------------------------------------------------------------
// 条件求值 + SelectVariant（ItemVariants.cs:28-31/87-106）
// ---------------------------------------------------------------------------

/** SpecialSeedFeatures.Mechdusa（SpecialSeedFeatures.cs:119-129）=
 *  remixWorld && getGoodWorld（getfixedboi 是唯一双真组合种子） */
export function isMechdusaWorld(sf: SeedFlags | null | undefined): boolean {
  return !!sf?.remix && !!sf?.getGoodWorld;
}

function conditionMet(c: ItemVariantConditionKind, sf: SeedFlags | null | undefined): boolean {
  switch (c) {
    case 'remix': return !!sf?.remix;
    case 'getGood': return !!sf?.getGoodWorld;
    case 'mechdusa': return isMechdusaWorld(sf);
    case 'skyblock': return !!sf?.skyblock;
  }
}

/** ItemVariants.SelectVariant 1:1（:87-106）：注册序首个条件满足的条目；无则 null */
export function selectVariant(
  vid: number,
  sf: SeedFlags | null | undefined,
): ItemVariantKind | null {
  const entries = ITEM_VARIANT_REGISTRY[vid];
  if (!entries) return null;
  for (const e of entries) {
    if (e.conditions.some((c) => conditionMet(c, sf))) return e.variant;
  }
  return null;
}

/** vid → 变体属性覆写（无条目 null；DisabledBossSummon 类无字段也返回壳对象） */
export function variantStatsOfVid(vid: number, kind: ItemVariantKind): ItemVariantStats | null {
  const entries = ITEM_VARIANT_REGISTRY[vid];
  if (!entries || !entries.some((e) => e.variant === kind)) return null;
  return ITEM_VARIANT_STATS[vid] ?? {};
}

// ---------------------------------------------------------------------------
// 世界态上下文（Main.remixWorld / Main.getGoodWorld 全局位的等价物；
// Game.afterWorldLoad 进世界时灌入，菜单期保持上一世界（与原版 Main 静态位一致））
// ---------------------------------------------------------------------------

let variantWorld: SeedFlags | null = null;

/** 灌入当前世界 seedFlags（null/{} = 普通世界，全部变体关闭） */
export function setItemVariantWorld(sf: SeedFlags | null | undefined): void {
  variantWorld = sf ? { ...sf } : null;
}

/** 当前世界态下 vid 的激活变体（普通世界恒 null） */
export function activeVariantOfVid(vid: number): ItemVariantKind | null {
  return selectVariant(vid, variantWorld);
}

/** 当前世界态下 vid 的激活属性覆写（无变体 null） */
export function activeVariantStatsOfVid(vid: number): ItemVariantStats | null {
  const kind = activeVariantOfVid(vid);
  return kind ? variantStatsOfVid(vid, kind) : null;
}

/** 当前世界态下 vid 的稀有度覆写（无则 undefined） */
export function variantRareOfVid(vid: number): number | undefined {
  return activeVariantStatsOfVid(vid)?.rare;
}

/** DisabledBossSummon 门（Player.cs:43125/:43143/:43159 同款使用拦截）：
 *  mechdusa 世界 544/556/557 整支不可用 */
export function bossSummonDisabledVid(vid: number): boolean {
  return activeVariantOfVid(vid) === 'disabledBossSummon';
}
