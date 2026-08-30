// 原版 NPC 对话头像（NPCID.Sets.NPCPortraits → Images/TownNPCs/Portraits/Portrait_<Name>，
// NPCID.cs:214 字典逐条提取；素材已复制到 public/sprites/portraits/）。
// 2026-08-30 补齐：动物学家 633（人态 Zoologista / 狼人态 Zoologistb，altTexture==2，
// 微光两变体均带资产）+ 城镇宠物三族六变体（VariantPortraitCondition(n)=
// townNpcVariationIndex==n，NPCID.cs:4946-4959；.Default 为变体表外回退）
// + 八城镇史莱姆默认像（NPCID.cs:337-365 无变体臂只 .Default）。
export const NPC_PORTRAITS: Record<number, string> = {
  17: 'Merchant', 18: 'Nurse', 19: 'ArmsDealer', 20: 'Dryad', 22: 'Guide',
  37: 'OldMan', 38: 'Demolitionist', 54: 'Clothier', 107: 'GoblinTinkerer',
  108: 'Wizard', 124: 'Mechanic', 142: 'Santa', 160: 'Truffle', 178: 'Steampunker',
  207: 'DyeTrader', 208: 'PartyGirl', 209: 'Cyborg', 227: 'Painter',
  228: 'WitchDoctor', 229: 'Pirate', 353: 'Stylist', 368: 'TravellingMerchant',
  369: 'Angler', 441: 'TaxCollector', 453: 'SkeletonMerchant', 550: 'Tavernkeep',
  588: 'Golfer', 663: 'Princess',
};

/** 宠物三族变体表（NPCID.cs:369-371 dog / 378-380 cat / 385-388 bunny，注册序=索引） */
const CAT_VARIANTS = ['Siamese', 'Black', 'Orangetabby', 'RussianBlue', 'Silver', 'White'];
const DOG_VARIANTS = ['Labrador', 'PitBull', 'Beagle', 'Corgi', 'Dalmatian', 'Husky'];
const BUNNY_VARIANTS = ['White', 'Angora', 'Dutch', 'Flemish', 'Lop', 'Silver'];
/** .Default 兜底（variationIndex 出表回退） */
const PET_DEFAULTS = { cat: 'Black', dog: 'Labrador', bunny: 'Angora' };
/** 城镇史莱姆默认像（vid 映射 = NPCID.cs 注册段直对） */
const SLIME_PORTRAITS: Record<number, string> = {
  680: 'SlimeClumsy',   // 紫(笨拙)
  678: 'SlimeCool',     // 绿(酷)
  681: 'SlimeDiva',     // 彩虹(歌姬)
  679: 'SlimeElder',    // 老
  683: 'SlimeMystic',   // 黄(秘)
  670: 'SlimeNerdy',    // 蓝(宅)
  684: 'SlimeSquire',   // 铜(侍从)
  682: 'SlimeSurly',    // 红(闷)
};

/** 头像 URL（无头像 NPC 返回 null——原版该字典不含全部类型） */
export function portraitUrl(vanillaId: number): string | null {
  const name = NPC_PORTRAITS[vanillaId];
  return name ? `sprites/portraits/Portrait_${name}.png` : null;
}

/** portraitForNpc 的语境面（TownNPC 子集；测试/独立调用可只给 vanillaId） */
export interface PortraitNpcCtx {
  vanillaId: number;
  /** townNpcVariationIndex（宠物三族 0-5；缺省 0=首变体,原版字段缺省语义同款） */
  variationIndex?: number;
  /** IsShimmerVariant（本仓 shimmered）——仅 633 两态带微光资产,其余类型本批未扩 */
  shimmered?: boolean;
  /** altTexture==2 = 动物学家狼人态 */
  altTexture?: number;
}

/** 带 NPC 语境的选图：openNpcDialog / refreshNpcDialog / 树妖状态等走这里；
 *  无头像类型回落静态表（null 同原版不画）。 */
export function portraitForNpc(npc: PortraitNpcCtx): string | null {
  const v = npc.vanillaId;
  if (v === 637) return `sprites/portraits/Portrait_Cat_${CAT_VARIANTS[npc.variationIndex ?? 0] ?? PET_DEFAULTS.cat}.png`;
  if (v === 638) return `sprites/portraits/Portrait_Dog_${DOG_VARIANTS[npc.variationIndex ?? 0] ?? PET_DEFAULTS.dog}.png`;
  if (v === 656) return `sprites/portraits/Portrait_Bunny_${BUNNY_VARIANTS[npc.variationIndex ?? 0] ?? PET_DEFAULTS.bunny}.png`;
  if (SLIME_PORTRAITS[v]) return `sprites/portraits/Portrait_${SLIME_PORTRAITS[v]}.png`;
  if (v === 633) {
    // ShouldBestiaryGirlBeLycantrope() 门由调用方经 altTexture==2 承接；微光臂在人/
    // 狼人两分支同存在（NPCID.cs:333-337 条件优先序：微光&&人→人微光,微光&&狼人→
    // 狼人微光,非微光&&狼人→狼人,缺省→人）
    const name = npc.altTexture === 2 ? 'Zoologistb' : 'Zoologista';
    return `sprites/portraits/Portrait_${name}${npc.shimmered ? '_shimmer' : ''}.png`;
  }
  return portraitUrl(v);
}
