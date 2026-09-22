// 悬停气泡行构建器（Main.MouseText_DrawItemTooltip_GetLinesInfo，Main.cs:20488-20920 1:1）。
// 纯函数：UI 传入物品格与玩家统计快照，产出 {text, color?, tag?} 行数组；
// tag 供测试断言行类（l10n 未载时文案回退键名）。
// 行序（原版 GetLinesInfo :20816-21540）：名(稀有度色/×N/★) → 伤害[+类型后缀] →
//   暴击 → 速度档 → 击退档 → 渔力/鱼饵 → 可装备 → 时装 → 防御 → 镐/斧/锤力 →
//   恢复生命/魔力 → 分类行(Buffs/Healing/ManaHealing/Mount) → 耗魔 →
//   可放置/弹药/消耗品 → 材料 → 可接线 → 容器/线触发 → 物品自带说明 → Buff 持续 →
//   yoyo 商标位 → 专家/大师行 → 词缀差分行(绿/红，尾接 62-80 硬编码档) → 套装奖励 →
//   研究行。
import type { ITEM_DEFS } from '../data/items';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { IS_A_MECHANISM_SHEETS, IS_A_TRIGGER_SHEETS } from '../data/tiles';   // ★BJ221 Wiring 二表单源（§6k）
import { itemCombat } from '../data/vanillaItemCombat';
import { itemFuncOfVid } from '../data/vanillaItemFunc';
import { statOfInternal } from '../data/vanillaItemStats';
import { armorSetTooltipContaining } from '../data/vanillaArmorSets';
import { equipKindOfInternal } from '../data/vanillaEquip';
import { petInfoOfVid } from '../data/vanillaPets';
import { prefixStat, prefixLines, type PrefixStat } from '../data/vanillaPrefixes';
import { RECIPE_GROUP_ITEMS, VANILLA_RECIPES } from '../data/vanillaRecipes';
import whipsJson from '../data/vanilla-whips.json';
import vanityEffectsJson from '../data/vanilla-vanity-effects.json';

/** 鞭物品表（combat json 缺鞭族 damage——数据在 vanilla-whips.json） */
const WHIP_ITEMS: Record<string, { proj: number; dmg: number; kb: number; speed: number; anim: number }> = whipsJson as never;

/** hasVanityEffects 置位面（★BJ260 S7 漏修#1 根治：手抄 4 件退役,改提取产物承载。
 *  旧表只收 Item.cs 字面 4 处（月符 485/海神贝壳 497/月光贝壳 861/天使光环 1987）,
 *  实际置位面=三 helper 通路全量：字面 18 站 33 vid（含悠悠球弦 3293-3308 十六件）
 *  +DefaultToInfoAccessory 22 站（钟表 15-18/罗盘/GPS/手机族…）+DefaultToGolfBall
 *  15 站（4242-4255+3989）+DefaultToMusicBox 85 站 101 vid——tools/extract-vanity-
 *  effects.mjs 机械提取（1456/1457/1458 三版交叉全等+era guard 四要素）→
 *  vanilla-vanity-effects.json。social=原版全集扣除 itemstats 带 van 键的 van 臂
 *  实压位 7 件（3581/3929/4563/4762/5075/5076/1987——音乐盒族 itemstats acc=1 无
 *  van 键,van 臂不压,留集=原版 Main.cs:20854 social && !vanity && !hasVanityEffects
 *  对音乐盒无警示行 1:1;勿照 S7 旧简报按 vanilla vanity 字面扣除）。 */
const SOCIAL_VANITY_EFFECTS_VIDS: ReadonlySet<number> = new Set(vanityEffectsJson.social as number[]);
import { Lang } from '../i18n/Lang';
import { ITEM_NAME_BY_ID } from '../i18n/idNames.generated';

/** 原版物品 PascalCase 名键（ItemName.Xxx 查 l10n） */
const vanillaItemNameKey = (vid: number): string => ITEM_NAME_BY_ID[vid] ?? `Item${vid}`;

export interface TooltipLine { text: string; color?: string; tag?: string
  /** 悠悠球商标装饰位（:20262-20290 OneDropLogo 五层影，本行文本置 " "） */
  yoyoLogo?: boolean;
  /** 研究行（:20295-20298 Colors.JourneyMode 紫） */
  journeyColor?: boolean;
}
export interface TooltipPlayerStats {
  /** 各系伤害乘区（Player.damageMult） */
  dmgMult: { melee: number; ranged: number; magic: number; summon: number };
  /** 各系装备/buff 暴击（Player.critChance——不含武器自带 4% 与词条） */
  crit: { melee: number; ranged: number; magic: number };
  /** 耗魔乘区（equipStats.manaCostMul） */
  manaCostMul: number;
  /** 击退加成（Player.cs:20195-20210：melee+kbGlove ×2 / kbBuff +0.5——
   *  击退档读的是含玩家加成后的 kb） */
  kbGlove: boolean;
  kbBuff: boolean;
}
/** 悬停上下文（低频行族的门数据——UI 侧现取注入，缺省全关） */
export interface TooltipContext {
  /** 旅程角色（difficulty==3）研究进度：have/need（TryGetSacrificeNumbers，
   *  :21163-21178 CreativeSacrificeNeeded 行 + JourneyMode 紫色） */
  research?: { have: number; need: number } | null;
  /** 商店上下文（npcShop>0，:20309-20402）：买入价（buy=true）/卖出价（铜计）。
   *  null=非商店。价格行按最高币种着色（:20380-20397 四档） */
  shop?: { buy: boolean; priceCopper: number; medalPrice?: number } | null;
  /** 专家/大师物品旗（item.expert / rare==-13，:21146-21157 GameUI.Expert/Master） */
  expert?: boolean;
  master?: boolean;
  /** 今日任务鱼 id（Game.anglerQuestItemId——任务品行 Lang.inter[65]，:20663-20666） */
  anglerQuestItemId?: number;
  /** 社交槽（armor 社交位 10-19：时装甲 10-12=context 9、时装配饰 13-19=context 11
   *  → HoverItem.social=true，ItemSlot.cs:3197——染料槽（dye 数组,context 12/25/27/33）
   *  不在置位 switch 内=原版无此行；→ tip[61] 单行,门见行块注 BJ230） */
  socialSlot?: boolean;
  /** ★BJ224 套装奖励行（Main.cs:21473-21517）悬停位门数据：worn = 悬停位 ∈ 功能
   *  甲槽 armor[0-2]（ItemSlot.MouseHover context 8 → HoverItem.wornArmor=true,
   *  ItemSlot.cs:3190-3193——时装甲 10-12=context 9 social、背包/箱/时装槽=无旗）；
   *  wornH/B/L = 玩家 GetEffectiveArmor(0/1/2) 的 vid（ArmorSetBonus.QueryContext
   *  :18-41 语义,空槽=0）。缺省（道具搜索行等无槽位上下文）= 非佩戴悬停 */
  setBonusHover?: { worn: boolean; wornH: number; wornB: number; wornL: number };
  /** ★BJ249 F1 金币枪门（Main.cs:20861，1458 同式 :20859）：vid∈[71,74]（金币
   *  25/50/100/200 伤害面）需玩家背包 58 格持有金币枪 905（Player.HasItem(int type)
   *  = inventory[0..57] 逐槽,Player.cs:56551-56561）才出伤害/暴击/速度/击退四行。
   *  UI 侧注入（BJ224 setBonusHover 注入式）;缺省 false=无金币枪 */
  hasCoinGun?: boolean;
  /** ★BJ249 F2 首用提示行（Main.cs:21519-21522 flag2 && ShowLoadoutShareHint——
   *  flag2=canLoadoutShareAt 内无共享来源且未收藏,:20823-20838）：原版行序在套装行
   *  （:21473-21517）后、研究行（:21521）前;旧实现置行族头部与原版不符。门由 UI 侧
   *  算好传入（装备/染料域 + 无共享来源 + 未收藏 + ShowLoadoutShareHint 持久化） */
  loadoutShareHint?: boolean;
}
export type TooltipSlot = { id: number; stack: number; prefix?: number; favorited?: boolean };

type ItemDef = (typeof ITEM_DEFS)[number];
const T = (key: string, ...args: (string | number)[]) => Lang.text(key, ...args) || key;

/** 材料集（物品自带 material 旗的近似 = 出现任一配方原料；原版 material 标记的
 *  实际用途就是合成提示，原料反查覆盖面等价）。
 *  ★RV3 集成审查勘误：配方 json 的 items[].id 是【原版 vid 域】（首条=凝胶 23+
 *  木材 9→火把 8），曾误当内部 id 与 slot.id（内部 id 域）直比——仅早期
 *  "内部 id≡vid"巧合段命中，4 处重复注册平移 +4 后全面失配。
 *  ★SW-BJ24 2026-09-07：①补组员臂——原版 Recipe.UpdateWhichItemsAreMaterials
 *  （Recipe.cs:15209-15243）对任一配方【用到】的 RecipeGroup 把组内全体物品标
 *  material（:15221-15233 组需臂 + :15233-15241 组员臂）。本 json 组需走 r.groups
 *  （items[] 不含 1000000 偏移 id），漏组员臂曾致 16 个仅经组出现的 vid（杏/樱桃/
 *  葡萄柚/李/辣树果/石榴、珍珠砂、7 张压力板、2 张向导陪伴指南）不入集=向导槽
 *  误拒。②双域【分池】——旧「vid+iid 并集一池」跨域碰撞（实探：钉鞋 975 是原料，
 *  其内部 iid 恰=24 ⇒ 并集 has(24)=真 ⇒ 木剑 24 误过向导槽门/误挂 Material 行；
 *  反向 vid 值撞他件 iid 同理污染 tooltip 面）。真值源仍是同一 vid 集，消费面按
 *  各自域取池：vid 域门（UI.ts 向导槽 :3186/Shift 特化支 :1563）用 materialVids()，
 *  iid 域（tooltip Material 行 :329 slot.id=内部 iid）用 materialIids() */
let MATERIAL_VIDS: Set<number> | null = null;
let MATERIAL_IIDS: Set<number> | null = null;
/** vid 域材料集（ItemID.Sets.IsAMaterial 的 vid 域真值 = 原料 ∪ 被用组全员） */
export function materialVids(): Set<number> {
  if (MATERIAL_VIDS) return MATERIAL_VIDS;
  const s = new Set<number>();
  for (const r of VANILLA_RECIPES) {
    for (const ing of r.items) s.add(ing.id);
    for (const gid of r.groups ?? []) {   // ★SW-BJ24 组员臂（Recipe.cs:15221-15241）
      for (const vid of RECIPE_GROUP_ITEMS[gid] ?? []) s.add(vid);
    }
  }
  MATERIAL_VIDS = s;
  return s;
}
/** iid 域材料集（内部 id 域；slot.id 消费面，:329 Material 行） */
export function materialIids(): Set<number> {
  if (MATERIAL_IIDS) return MATERIAL_IIDS;
  const s = new Set<number>();
  for (const vid of materialVids()) {
    const k = VANILLA_ITEM_KEY_BY_ID[vid];
    const iid = k !== undefined ? ITEM_BY_KEY[k] : undefined;
    if (iid !== undefined) s.add(iid);
  }
  MATERIAL_IIDS = s;
  return s;
}

/** 鞭（IsAWhip = proj aiStyle 165 全 18 枚）——鞭是 summon 但显速度档
 *  （:20545 useStyle 门 `!summon || IsAWhip[shoot]` 例外） */
const WHIP_PROJS = new Set([841, 847, 848, 849, 912, 913, 914, 915, 952,
  1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1104]);
/** 悠悠球物品（yoyoLogo 装饰位，:20845-20853） */
const YOYO_ITEMS = new Set([3262, 3282, 3283, 3284, 3285, 3286, 3316, 3315, 3317, 3291, 3389]);
/** 魔杖消耗表（item.tileWand，Item.cs 各 case：832 活木魔杖→木材 9 /
 *  932 骨魔杖→骨头 154 / 933 树叶魔杖→木材 9 / 1129 蜂巢魔杖→蜂巢块 1124 /
 *  3360+3361 红木魔杖→红木 620——泥土魔杖 114 无 tileWand（它发射移土弹非消耗） */
const TILE_WAND_CONSUME: Record<number, number> = {
  832: 9, 933: 9, 932: 154, 1129: 1124, 3360: 620, 3361: 620,
};

/** 击退档（:20602-20632） */
/** 接线集（TileID.cs:132-134 Wiring.IsAMechanism/IsATrigger（旧注 :132-134 同）+
 *  ItemID.cs:1422 IsWireableStatue，Factory.CreateBoolSet 列表成员 = true）：
 *  createTile ∈ 机制/触发器 且（createTile≠105 或物品 ∈ 可接线雕像集）→ tip Wireable
 *  ★BJ221 收编单源 data/tiles.ts:IS_A_MECHANISM_SHEETS/IS_A_TRIGGER_SHEETS（§6k） */
const WIRE_MECHANISM_TILES = IS_A_MECHANISM_SHEETS;
const WIRE_TRIGGER_TILES = IS_A_TRIGGER_SHEETS;
const WIREABLE_STATUE_ITEMS = new Set([441, 449, 466, 471, 3651, 3652, 3653, 3654, 3655, 3656, 3657,
  3658, 3659, 3660, 3661, 3662, 3708, 3709, 3710, 3711, 3712, 3713, 3714, 3715, 3716, 3717, 3718,
  3719, 3720, 4397, 4360, 4342, 4466, 5317, 5318, 5319, 440, 443, 444, 445, 446, 452, 454, 459,
  463, 464, 478, 473, 2672, 438, 453, 476, 477, 470, 4355, 4276]);

/** 配饰前缀 62-80 硬编码差分行（Main.cs:21355-21460：62..65→+1..+4 防御 tip25 /
 *  66→+20 魔力 tip31 / 67-68→+2/+4% 暴击 tip5 / 69..72→+1..+4% 伤害 tip39 /
 *  73..76→+1..+4% 移动速度 tip46 / 77..80→+1..+4% 近战速度 tip47；全绿 color2。
 *  这些词缀的 stat 表全为 multiplier=1 档——差分链不产行，只有此处硬编码行） */
const PREFIX_FIXED_ROWS: Record<number, [string, number]> = {
  62: ['+1', 25], 63: ['+2', 25], 64: ['+3', 25], 65: ['+4', 25],
  66: ['+20 ', 31],
  67: ['+2', 5], 68: ['+4', 5],
  69: ['+1', 39], 70: ['+2', 39], 71: ['+3', 39], 72: ['+4', 39],
  73: ['+1', 46], 74: ['+2', 46], 75: ['+3', 46], 76: ['+4', 46],
  77: ['+1', 47], 78: ['+2', 47], 79: ['+3', 47], 80: ['+4', 47],
};

/** tileBoost 表（Item.cs 各 case：扳手 509/510/511=20、多彩扳手 851=20、
 *  工具腰带 852=1、矿车轨 2340=5/2341=2、The Axe 1305=1——itemfunc 无该字段） */
const TILE_BOOST: Record<number, number> = {
  509: 20, 510: 20, 511: 20, 851: 20, 852: 1, 2340: 5, 2341: 2, 1305: 1,
};

/** Tooltip 伤害显示倍率表（ItemID.ToolTipDamageMultiplier，ItemID.cs:246：
 *  均为 ×2 的回响/双生武器显示档） */
const TOOLTIP_DMG_MUL: Record<number, number> = {
  162: 2, 801: 2, 163: 2, 220: 2, 389: 2, 1259: 2, 4272: 2, 5011: 2, 5012: 2, 5526: 2,
};

/** 击退档（:20602-20632） */
const KB_TIERS: Array<[number, number]> = [
  [1.5, 15], [3, 16], [4, 17], [6, 18], [7, 19], [9, 20], [11, 21],
];
function kbTierIndex(kb: number): number {
  if (kb === 0) return 14;
  for (const [max, tip] of KB_TIERS) if (kb <= max) return tip;
  return 22;
}

/** 速度档（:20545-20577，useAnimation 分档 → LegacyTooltip 6-13） */
const SPEED_TIERS: Array<[number, number]> = [
  [8, 6], [20, 7], [25, 8], [30, 9], [35, 10], [45, 11], [55, 12],
];
function speedTierIndex(anim: number): number {
  for (const [max, tip] of SPEED_TIERS) if (anim <= max) return tip;
  return 13;
}

/** 统计行集合（名行/商店行由 UI 侧拼装——各自带稀有度色与价格上下文） */
export interface TooltipBody {
  lines: TooltipLine[];
  durationLine: TooltipLine | null;
  prefixDiff: TooltipLine[];
  yoyoLogoLine: TooltipLine | null;
  /** 套装奖励行族（Main.cs:21473-21517——原版行序在 prefix 差分之后；佩戴悬停的
   *  UI.ItemSetBonusEquipped 文案内含 \n（"套装奖励(N/D)\n{Description}"）→ DOM
   *  侧拆成同色多行,故为数组） */
  setBonusLines: TooltipLine[];
  /** 专家/大师物品行（:21254-21262——1458 原版行序在 prefix 差分【之前】：
   *  buffTime → yoyoLogo → expert → master → prefix 链。R24 勘误：头注曾引
   *  旧基线行号断言"在 prefix 之后"） */
  expertMasterLines: TooltipLine[];
  researchLine: TooltipLine | null;
}

/** 悬停气泡统计行（vi_ 全量 + legacy 兜底） */
export function buildTooltipBody(
  def: ItemDef, slot: TooltipSlot, player: TooltipPlayerStats | null,
  ctx: TooltipContext = {},
): TooltipBody {
  const lines: TooltipLine[] = [];
  // ★BJ283：键前缀 parseInt 兜底退役（BJ268 登记,方案 A ⑥回填后恒短路=items.ts:2414 等价定谳）
  const vid = def.vid ?? -1;
  const ps: PrefixStat | null = slot.prefix ? prefixStat(slot.prefix) : null;
  const pm = (k: keyof PrefixStat) => (ps ? (ps[k] as number) : 1);

  // ── legacy（非 vi_）物品：维持原近似（damage/pick/axe/防御/恢复）──
  if (vid < 0) {
    if (def.tool?.damage) {
      lines.push({ text: T('Mods.SandboxWorld.Item.Damage', Math.round(def.tool.damage * pm('dmg'))), tag: 'damage' });
    }
    if (def.tool?.power && def.tool.type !== 'sword') {
      lines.push({ text: T(def.tool.type === 'pick' ? 'Mods.SandboxWorld.Item.PickPower' : 'Mods.SandboxWorld.Item.AxePower', def.tool.power), tag: 'toolpower' });
    }
    const st0 = statOfInternal(slot.id);
    // ★def.armor 死前腿已移除（2026-09-02,字段全仓零写入——与 Player.defense 同源清理）
    const d0 = st0?.def;
    if (d0) lines.push({ text: d0 + T('LegacyTooltip.25'), tag: 'defense' });
    if (def.heal) lines.push({ text: T('CommonItemTooltip.RestoresLife', def.heal), tag: 'heallife' });
    return { lines, durationLine: null, yoyoLogoLine: null, setBonusLines: [], expertMasterLines: [], researchLine: null, prefixDiff: ps ? prefixLines(slot.prefix!).map((ln) => ({ text: ln.text, color: ln.good ? 'rgb(120,190,120)' : 'rgb(190,120,120)', tag: 'prefix' })) : [] };
  }

  const f = itemFuncOfVid(vid);
  const c = itemCombat(vid);
  const st = statOfInternal(slot.id);
  const equipKind = equipKindOfInternal(slot.id);

  // ── 社交栏提示行（ItemSlot.cs:3187-3197 case 9/11 → HoverItem.social=true；
  //    Main.cs:20854-20858（1456 同相 :20508-20512）：social && !vanity &&
  //    !hasVanityEffects → Lang.tip[61]「在社交栏中不起作用」单行,位置在伤害行族前。
  //    ★BJ230 定谳推翻 BJ224 登记债：tip[0]「装备在社交栏」/tip[1]「不会获得任何
  //    属性」在 1456/1457/1458 三版反编译零消费（Lang.cs:500 全量装载,无任何
  //    tip[0]/tip[1] 读点）=死键;染料槽（dye 数组,context 12,Main.cs:42233）不在
  //    social 置位 switch（ItemSlot.cs:3190-3196）内=原版染料槽悬停无此行,旧 dye 臂
  //    系 BJ224 登记债的伪锚定,已摘（UI.ts 门同步收窄）。van 门=st.van（vanillaItemStats
  //    提取 432 件,tip[24] 行同源）;hasVanityEffects 门=SOCIAL_VANITY_EFFECTS_VIDS）──
  if (ctx?.socialSlot && !st?.van && !SOCIAL_VANITY_EFFECTS_VIDS.has(vid)) {
    lines.push({ text: T('LegacyTooltip.61'), tag: 'social' });
  }

  // ── 伤害族四行（damage>0 门，:20511-20632；鞭族 damage 在 vanilla-whips 表，
  //    combat json 缺——按鞭档合成 c 等价物）──
  // ★鞭族在 combat json 里有残缺条目（{noUseGraphic} 等非 null 但无 damage）——
  //  `c ??` 兜底够不着；鞭档存在时无条件覆写
  const whipData = WHIP_ITEMS[String(vid)];
  const cd = whipData ? {
    ...(c ?? {}), damage: whipData.dmg, knockBack: whipData.kb, shoot: whipData.proj,
    useAnimation: whipData.anim, useTime: whipData.speed,
    summon: true, useStyle: 5,
  } as NonNullable<typeof c> : c;
  const f2 = f ?? (whipData ? { summon: 1, useStyle: 5, shoot: whipData.proj } as NonNullable<typeof f> : null);
  // ★BJ249 F1 三段门补全（Main.cs:20861，1458 同式 :20859）：damage>0 &&
  //  (!notAmmo||useStyle!=0) && (vid<71||vid>74||背包持金币枪 905)。金币 71-74
  //  SetDefaults 带战斗面（damage 25/50/100/200/ranged/shoot 158-161,Item.cs:2219-
  //  2282）但门第三段管住——无 905 时伤害/暴击/速度/击退四行整缺;第一段本仓
  //  数据面全表 notAmmo 10 件均 useStyle≠0（恒真面,仍按原式补防数据回填）。
  //  notAmmo 读 f（itemFunc 提取域,Item.notAmmo）,useStyle 读 f2（whip 合成恒 5）
  if ((cd?.damage ?? 0) > 0
    && (!(f?.notAmmo ?? false) || (f2?.useStyle ?? f?.useStyle ?? 0) !== 0)
    && (vid < 71 || vid > 74 || (ctx?.hasCoinGun ?? false))) {
    const kind = f2?.melee ? 'melee' : f2?.ranged ? 'ranged' : f2?.magic ? 'magic' : f2?.summon ? 'summon' : null;
    // :20516-20523：×ToolTipDamageMultiplier（回响族 ×2 显示）→ ×玩家乘区（+5e-6 舍入偏置）
    const mult = (player ? player.dmgMult[kind ?? 'melee'] : 1);
    const dmg = Math.round(cd!.damage! * (TOOLTIP_DMG_MUL[vid] ?? 1) * pm('dmg') * mult + 5e-6);
    const tipSuffix = kind === 'melee' ? 2 : kind === 'ranged' ? 3 : kind === 'magic' ? 4 : kind === 'summon' ? 53 : 55;
    lines.push({ text: dmg + T(`LegacyTooltip.${tipSuffix}`), tag: 'damage' });
    // 暴击（近/远/魔，:20518-20544）：视觉暴击 = 4 基础 + 装备/buff + 词条
    // （原版 playerClassCrit−选中武器+悬停武器；本仓 equipStats 不含武器 → 同式）
    if (kind === 'melee' || kind === 'ranged' || kind === 'magic') {
      // 原版 num2 = playerClassCrit(4 基+装备+持握武器crit) − 选中武器crit + 悬停
      // 武器 crit → 化简 = 武器 crit（combat json 缺省 4）+ 装备 + 词条×2。
      // 曾恒用 4——火枪 95（crit 6）等高暴武器显示偏低
      const crit = (cd!.crit ?? 4) + (player ? player.crit[kind] : 0) + (ps ? ps.crt * 2 : 0);
      lines.push({ text: crit + T('LegacyTooltip.5'), tag: 'crit' });
    }
    // 速度档（useStyle!=0 且（非召唤 || 鞭），:20545；useAnimation/词条 spd）
    const whip = WHIP_PROJS.has(cd!.shoot ?? -1);
    if ((f2?.useStyle ?? 0) !== 0 && (!f2?.summon || whip)) {
      const anim = Math.max(1, Math.round((cd!.useAnimation ?? cd!.useTime ?? 20) / pm('spd')));
      lines.push({ text: T(`LegacyTooltip.${speedTierIndex(anim)}`), tag: 'speed' });
    }
    // 击退档（:20195-20210 玩家加成先入：melee+kbGlove ×2、kbBuff +0.5；
    // ranged 蘑菇矿潜行 +（1-stealth)×0.5 略；再 ×词条 kb）
    let kb = (cd!.knockBack ?? 0) * pm('kb');
    if (kind === 'melee' && player?.kbGlove) kb *= 2;
    if (player?.kbBuff) kb += kb * 0.5;
    lines.push({ text: T(`LegacyTooltip.${kbTierIndex(kb)}`), tag: 'knockback' });
  }

  // ── 渔具/鱼饵（:20633-20646）──
  if ((f?.fishingPole ?? 0) > 0) {
    lines.push({ text: T('GameUI.PrecentFishingPower', f!.fishingPole!), tag: 'fishing' });
    lines.push({ text: T('GameUI.BaitRequired'), tag: 'baitreq' });
  }
  if ((f?.bait ?? 0) > 0) lines.push({ text: T('GameUI.BaitPower', f!.bait!), tag: 'bait' });

  // ── 可装备（:20647-20660：护甲三槽/配饰/钩爪/坐骑/照明宠/宠物）──
  const isArmor = (st?.hs ?? 0) > 0 || (st?.bs ?? 0) > 0 || (st?.ls ?? 0) > 0;
  if (isArmor || (st?.acc ?? 0) > 0 || equipKind === 'hook' || equipKind === 'mount'
    || equipKind === 'pet' || equipKind === 'light' || equipKind === 'cart') {
    lines.push({ text: T('LegacyTooltip.23'), tag: 'equippable' });
  }
  // 时装物品（itemstats van 字段；缺数据族跳过）
  if ((st?.van ?? 0) > 0) lines.push({ text: T('LegacyTooltip.24'), tag: 'vanity' });

  // ── 防御（:20671-20675）──
  if (st?.def) lines.push({ text: st.def + T('LegacyTooltip.25'), tag: 'defense' });

  // ── 镐/斧/锤力（:20676-20702；斧力 ×5 是原版口径）──
  if ((f?.pick ?? 0) > 0) lines.push({ text: f!.pick! + T('LegacyTooltip.26'), tag: 'pick' });
  if ((f?.axe ?? 0) > 0) lines.push({ text: f!.axe! * 5 + T('LegacyTooltip.27'), tag: 'axe' });
  if ((f?.hammer ?? 0) > 0) lines.push({ text: f!.hammer! + T('LegacyTooltip.28'), tag: 'hammer' });

  // ── 恢复生命/魔力（:20717-20743；3001 龙果区间档）──
  if ((f?.healLife ?? 0) > 0) {
    lines.push({ text: vid === 3001 ? T('CommonItemTooltip.RestoresLifeRange', f!.healLife!, 120)
      : T('CommonItemTooltip.RestoresLife', f!.healLife!), tag: 'heallife' });
  }
  if ((f?.healMana ?? 0) > 0) lines.push({ text: T('CommonItemTooltip.RestoresMana', f!.healMana!), tag: 'healmana' });

  // ── 分类行链（:21087-21103 if/else-if）：buffType>0 且非召唤/非光宠/非时装宠
  //    → Buffs；elif healLife>0 → Healing；elif healMana>0 → ManaHealing；
  //    elif mountType>0 且非矿车 → Mount。R24 补（T4：整块曾缺失）。
  //    光宠/时装宠门：vanilla 按 Main.lightPet/vanityPet[buffType] 查——物品侧
  //    等价于「是宠物（无论光宠与否）即排除」，用宠物表反查
  {
    const pet = petInfoOfVid(vid);
    const isSummon = !!f2?.summon;
    if ((f?.buffType ?? 0) > 0 && !isSummon && !pet) {
      lines.push({ text: T('CommonItemTooltip.Buffs'), tag: 'category' });
    } else if ((f?.healLife ?? 0) > 0) {
      lines.push({ text: T('CommonItemTooltip.Healing'), tag: 'category' });
    } else if ((f?.healMana ?? 0) > 0) {
      lines.push({ text: T('CommonItemTooltip.ManaHealing'), tag: 'category' });
    } else if (equipKind === 'mount') {   // equipKind 已分立 'cart'，互斥即非矿车
      lines.push({ text: T('CommonItemTooltip.Mount'), tag: 'category' });
    }
  }

  // ── 耗魔（:20744-20751：×玩家 manaCost；太空枪族豁免略）──
  if ((f?.mana ?? 0) > 0) {
    const mc = Math.round(f!.mana! * pm('mcst') * (player ? player.manaCostMul : 1));
    lines.push({ text: T('CommonItemTooltip.UsesMana', mc), tag: 'mana' });
  }

  // ── 可放置/弹药/消耗品（:20752-20781，else-if 链）──
  // item.ammo（=是弹药，值为弹药族 id）提取器落在 combat json（func 缺箭族）
  const placeable = f?.createWall != null || f?.createTile != null;
  if (placeable) {
    if (f?.consumable) lines.push({ text: T('LegacyTooltip.33'), tag: 'placeable' });
  } else if ((c?.ammo ?? 0) > 0 && !f?.notAmmo) {
    lines.push({ text: T('LegacyTooltip.34'), tag: 'ammo' });
  } else if (f?.consumable) {
    lines.push({ text: T('LegacyTooltip.35'), tag: 'consumable' });
  }

  // ── 材料（:20782-20786；material 旗=配方原料反查近似）──
  if (materialIids().has(slot.id)) lines.push({ text: T('LegacyTooltip.36'), tag: 'material' });

  // ── 可接线（:21127-21131）：createTile ∈ 触发器/机制集 且（≠105 或物品 ∈
  //    可接线雕像集）→ CommonItemTooltip.Wireable。R24 补（T5：机关类放置物
  //    雕像/泵/蜡烛等整族曾缺行）
  {
    const ct2 = f?.createTile ?? -1;
    if (ct2 > -1 && (WIRE_TRIGGER_TILES.has(ct2) || WIRE_MECHANISM_TILES.has(ct2))
      && (ct2 !== 105 || WIREABLE_STATUE_ITEMS.has(vid))) {
      lines.push({ text: T('CommonItemTooltip.Wireable'), tag: 'wireable' });
    }
  }

  // ── 容器/线触发（:21135-21142）──
  if (f?.createTile === 21 || f?.createTile === 467) lines.push({ text: T('CommonItemTooltip.Container'), tag: 'container' });
  if (f?.createTile === 441 || f?.createTile === 468) lines.push({ text: T('CommonItemTooltip.WireTrigger'), tag: 'wiretrigger' });

  // ── 泥土魔杖消耗行（:20666-20670 tip[52] "消耗 X"——itemfunc 无 tileWand，
  //    数据面表登记：Dirt Rod 114 → 泥土 126）──
  const wandConsume = TILE_WAND_CONSUME[vid];
  if (wandConsume !== undefined) {
    lines.push({ text: T('LegacyTooltip.52') + T(`ItemName.${vanillaItemNameKey(wandConsume)}`), tag: 'tilewand' });
  }

  // ── 任务品行（:20663-20666 Lang.inter[65] "任务物品"）──
  if (ctx?.anglerQuestItemId && ctx.anglerQuestItemId === vid) {
    lines.push({ text: T('LegacyInterface.65'), tag: 'quest' });
  }

  // ── tileBoost 范围行（:20703-20715 "+"+boost+tip54；0 不显）──
  const tb = TILE_BOOST[vid];
  if (tb !== undefined && tb !== 0) {
    lines.push({ text: `${tb >= 0 ? '+' : ''}${tb}${T('LegacyTooltip.54')}`, tag: 'range' });
  }

  // ── 悠悠球商标位（:20845-20853——文本 " " 占位 + yoyoLogo 标记，UI 画
  //    OneDropLogo 五层影；原版行序在 buffTime 之后）──
  const yoyoLogoLine: TooltipLine | null = YOYO_ITEMS.has(vid)
    ? { text: ' ', yoyoLogo: true, tag: 'yoyologo' } : null;

  // ── 研究行（:21163-21178 旅程角色：未满 → CreativeSacrificeNeeded 紫色
  //    JourneyMode；已满 → 由装配层静态注入 CreativeSacrificeComplete 行——原版
  //    TryGetTeammateUnlockCredit 联机队友署名，单机走已满省略）──
  let researchLine: TooltipLine | null = null;
  if (ctx.research && ctx.research.have < ctx.research.need) {
    researchLine = {
      text: T('CommonItemTooltip.CreativeSacrificeNeeded', ctx.research.need - ctx.research.have),
      journeyColor: true, tag: 'research',
    };
  }

  // ── Buff 持续（:20834-20843；原版排在自带说明之后——装配时并入）──
  let durationLine: TooltipLine | null = null;
  if ((f?.buffType ?? 0) > 0 && (f?.buffTime ?? 0) > 0) {
    const secs = f!.buffTime! / 60;
    durationLine = secs < 60
      ? { text: T('CommonItemTooltip.SecondDuration', Math.round(secs)), tag: 'duration' }
      : { text: T('CommonItemTooltip.MinuteDuration', Math.round(secs / 60)), tag: 'duration' };
  }

  // ── 词缀差分行（:21264+，绿/红——复用 prefixLines 表；尾接 62-80 硬编码档，
  //    :21355-21460 全绿 color2。R24 补 T7：62..80 stat 表全为 multiplier=1 档，
  //    差分链不产行，守护/秘术/幸运/暴烈等配饰词缀悬停零差分行）──
  const prefixDiff: TooltipLine[] = ps
    ? prefixLines(slot.prefix!).map((ln) => ({ text: ln.text, color: ln.good ? 'rgb(120,190,120)' : 'rgb(190,120,120)', tag: 'prefix' }))
    : [];
  {
    const fixed = slot.prefix ? PREFIX_FIXED_ROWS[slot.prefix] : undefined;
    if (fixed && vid >= 0) prefixDiff.push({ text: fixed[0] + T(`LegacyTooltip.${fixed[1]}`), color: 'rgb(120,190,120)', tag: 'prefix' });
  }

  // ── 套装奖励行（Main.cs:21473-21517，1457 ArmorSetBonus 新制——1456:21097-21141
  //    /1458:21473-21517 三基线同相；原版行序在 prefix 差分之后）：
  //    行门 = 悬停 vid ∈ 任一注册套装（SetsContaining[vid] 非空,Membership 由
  //    vanillaArmorSets tooltip lane 承载）——★BJ224 病灶修复：旧实现全局贴
  //    「玩家当前生效套装」文本（isArmor && equipStats.setBonus）→ 穿神圣套时贝壳
  //    发夹(2417)等一切可装备件 tooltip 全带神圣套奖励行,原版无此行（发夹非成员）。
  //    分二态（item.wornArmor 仅 ItemSlot.MouseHover context 8 功能甲槽为真,
  //    ItemSlot.cs:3190-3193）：
  //    · 非佩戴悬停（背包/箱/时装槽）→ array[0]（注册序首个含此 vid 的套实例）
  //      单件文本 UI.ItemSetBonusGeneral「套装奖励：{Description}」；PrimaryPart
  //      ≠None 且悬停件非主件 vid → UI.ItemSetBonusDecidedBy*「随X装备改变」
  //      （ArmorSetBonus.cs:201-212）；色 (130,130,130,190)
  //    · 佩戴悬停 → 含 vid 诸套逐个 QueryCount(:180-187) vs GetEffectiveArmor(0/1/2)
  //      vid（needed 大者胜→found 大者→注册先,Main.cs:21485-21500）→
  //      UI.ItemSetBonusEquipped「套装奖励({N}/{D})\n{Description}」（{Description}
  //      同 DecidedBy 判,判据=佩戴主件 vid vs 套主件 vid :217-220）；Complete →
  //      LimeGreen(50,205,50) 否则 (130,130,130)。
  //    l10n 占位为具名 {Token}（Language.getTextValue 仅 {0} 位置参）→ 手工命名替换 */
  const setBonusLines: TooltipLine[] = (() => {
    const containing = armorSetTooltipContaining(vid);
    if (!containing.length) return [];
    const fmt = (key: string, subs: Record<string, string | number>): string =>
      Object.entries(subs).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), T(key));
    const DECIDED_BY = ['', 'Head', 'Body', 'Legs'] as const;
    const worn = ctx?.setBonusHover;
    if (!worn?.worn) {
      const first = containing[0]!;
      const partVid = first.primary === 1 ? first.h : first.primary === 2 ? first.b : first.l;
      const desc = first.primary !== 0 && partVid !== vid
        ? T(`UI.ItemSetBonusDecidedBy${DECIDED_BY[first.primary]}`)
        : T(`ArmorSetBonus.${first.name}`);
      const text = fmt('UI.ItemSetBonusGeneral', { Description: desc });
      // Description 自带 \n（如 HallowedSummoner 双行文案）→ 同色拆行（原版 MouseText
      // 多行绘制语义;DOM 侧 white-space 不保留 \n）
      return text.split('\n').map((t) => ({ text: t, color: 'rgba(130,130,130,0.75)', tag: 'setbonus' }));
    }
    const wornAt = (p: 0 | 1 | 2) => (p === 1 ? worn.wornH : p === 2 ? worn.wornB : worn.wornL);
    let best = containing[0]!, bestFound = 0, bestNeeded = 0;
    for (const set of containing) {
      let needed = 0, found = 0;
      // TryCounting(:189-199) 逐位直比：neededItem≠0 才计数,worn vid === 套件 vid 计 found
      for (const [part, wornVid] of [[set.h, worn.wornH], [set.b, worn.wornB], [set.l, worn.wornL]] as const) {
        if (part !== 0) { needed++; if (wornVid === part) found++; }
      }
      if (needed > bestNeeded || (needed === bestNeeded && found > bestFound)) {
        best = set; bestFound = found; bestNeeded = needed;
      }
    }
    const partVid = best.primary === 1 ? best.h : best.primary === 2 ? best.b : best.l;
    const desc = best.primary !== 0 && partVid !== wornAt(best.primary)
      ? T(`UI.ItemSetBonusDecidedBy${DECIDED_BY[best.primary]}`)
      : T(`ArmorSetBonus.${best.name}`);
    const text = fmt('UI.ItemSetBonusEquipped', {
      Numerator: bestFound, Denominator: bestNeeded, Description: desc });
    const color = bestFound === bestNeeded ? 'rgb(50,205,50)' : 'rgb(130,130,130)';
    return text.split('\n').map((t) => ({ text: t, color, tag: 'setbonus' }));
  })();

  // ── 专家/大师物品行（:21254-21262——1458 行序在 prefix 差分【之前】）──
  const expertMasterLines: TooltipLine[] = [];
  if (ctx?.expert) expertMasterLines.push({ text: T('GameUI.Expert'), tag: 'expert' });
  if (ctx?.master) expertMasterLines.push({ text: T('GameUI.Master'), tag: 'master' });

  return { lines, durationLine, prefixDiff, yoyoLogoLine, setBonusLines, expertMasterLines, researchLine };
}

/** 完整装配（静态说明 + 持续行按原版序并入 + 研究行/悠悠球位 + 商店价格行 +
 *  差分收尾）——UI 侧消费。行序尾段（原版 :21195-21540）：ToolTip → 特殊种子行(略)
 *  → buffTime → yoyoLogo → expert → master(rare==-13) → prefix 差分(含 62-80 档)
 *  → 套装奖励 → 研究行（白名单门略）→ BestiaryNotes(略) → 商店价格行
 *  （AddShopLines 在 GetLinesInfo 全部之后）。R24 勘误 T3：曾把 expert/master
 *  排在差分之后、setBonus 排在差分之前——均与 1458 行序相反 */
export function assembleTooltipLines(
  def: ItemDef, slot: TooltipSlot, player: TooltipPlayerStats | null,
  staticTipText: string | null, ctx: TooltipContext = {},
): TooltipLine[] {
  const body = buildTooltipBody(def, slot, player, ctx);
  const out = [...body.lines];
  if (staticTipText) for (const ln of staticTipText.split('\n')) out.push({ text: ln, tag: 'static' });
  if (body.durationLine) out.push(body.durationLine);
  if (body.yoyoLogoLine) out.push(body.yoyoLogoLine);
  out.push(...body.expertMasterLines);
  out.push(...body.prefixDiff);
  out.push(...body.setBonusLines);
  // ★BJ249 F2 首用提示行（Main.cs:21519-21522,1458 同位 :21519）：行序=套装行后、
  //  研究行前。色 OurFavoriteColor(255,231,69) α190≈0.75（:21520,UI.ts 旧串同值）
  if (ctx.loadoutShareHint) {
    out.push({ text: T('UI.ItemLoadoutShareHint'), color: 'rgba(255,231,69,0.75)', tag: 'loadouthint' });
  }
  if (body.researchLine) out.push(body.researchLine);
  // 商店价格行（:20309-20402）：买入 tip[50]/卖出 tip[49]，币种四档着色
  // （:20380-20397 铂 220,220,198 / 金 224,201,92 / 银 181,192,193 / 铜 246,138,96；
  //  价格 0 → tip[51] 无价值 灰 120,120,120）
  if (ctx.shop) {
    // 勋章条目（shopSpecialCurrency≠-1，Main.cs:20313-20316 → CustomCurrency
    // SingleCoin.GetPriceText :103-107）：「买入价: N 护卫奖章」，色 (240,100,120)
    if (ctx.shop.medalPrice !== undefined) {
      out.push({
        text: `${T('LegacyTooltip.50')} ${ctx.shop.medalPrice} ${T('Currency.DefenderMedals').toLowerCase()}`,
        color: 'rgb(240,100,120)', tag: 'shopprice',
      });
    } else {
      const pc = ctx.shop.priceCopper;
      if (pc > 0) {
        const plat = Math.floor(pc / 1000000), gold = Math.floor(pc % 1000000 / 10000);
        const silver = Math.floor(pc % 10000 / 100);
        const color = plat > 0 ? 'rgb(220,220,198)' : gold > 0 ? 'rgb(224,201,92)'
          : silver > 0 ? 'rgb(181,192,193)' : 'rgb(246,138,96)';
        out.push({ text: `${T(ctx.shop.buy ? 'LegacyTooltip.50' : 'LegacyTooltip.49')} ${coinText(pc)}`, color, tag: 'shopprice' });
      } else {
        out.push({ text: T('LegacyTooltip.51'), color: 'rgb(120,120,120)', tag: 'noworth' });
      }
    }
  }
  return out;
}

/** 币种串（Lang.inter[15-18]，:20357-20373） */
function coinText(copper: number): string {
  const plat = Math.floor(copper / 1000000), gold = Math.floor(copper % 1000000 / 10000);
  const silver = Math.floor(copper % 10000 / 100), cop = copper % 100;
  let text = '';
  if (plat > 0) text += `${plat} ${T('LegacyInterface.15')} `;
  if (gold > 0) text += `${gold} ${T('LegacyInterface.16')} `;
  if (silver > 0) text += `${silver} ${T('LegacyInterface.17')} `;
  if (cop > 0) text += `${cop} ${T('LegacyInterface.18')} `;
  return text.trim();
}
