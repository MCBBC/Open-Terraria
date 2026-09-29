// NPC 快乐度 → 商店价格系数 + 心情报告（ShopHelper.cs 1:1）。
// 公式（_currentPriceAdjustment 初值 1.0，ProcessMood :99-180）：
//   ① loveStruck 魅Love药水 ×0.9（ShopHelper.cs:103-106——2026-09-29 刀B 已接，
//      TownNPC.lovestruckT 载体,门前乘区）;
//   ② 无家/离家>120 tile（:111-118）/玩家在腐化·猩红·地牢（:119-122）→ 价格置 1000
//      （不提前返回！后续拥挤/偏好/关系照常连乘，末尾 LimitAndRoundMultiplier
//       :182-187 钳 [0.75,1.5] → 实际生效 1.5）；
//   ③ 拥挤：同屋（home 距离<25）>3 人后每人 ×1.05（公主 ×1.0 且孤单<2 → 置 1000；
//      公主拥挤报告照发只是乘 1.0）；
//      宽敞：非公主同屋≤2 且村（<120）<4 → ×0.95；
//   ④ 生物群系偏好（PersonalityDatabasePopulator 全表 → BiomePreferenceListTrait
//      .ModifyShopPrice :40-55）：命中项中只取好感度最强的一条应用
//      （AffectionLevel Love100>Like50>Dislike-50>Hate-100）——不是 like/dislike 各自独立；
//      Love ×0.88 / Like ×0.94 / Dislike ×1.06 / Hate ×1.12；
//   ⑤ AllPersonalitiesModifier.ModifyShopPrice_Relationships :12-506 全量 103 条：
//      互相关系=同屋目标（<25）命中全部连乘，Like/Dislike/Love/HateNPC ×0.94/1.06/0.88/1.12；
//      公主开店时全员 LikePrincess ×0.94，公主自己从同屋池随机抽 3 个各
//      LoveNPCByTypeName ×0.88（键 = LoveNPC_<目标内名>）；
//   ⑥ 无任何报告行 → Content；LimitAndRoundMultiplier：钳 [0.75, 1.5] 后四舍五入 0.01。
// 生物群系判定 = 玩家 SceneFlags zone（AShoppingBiome.IsInBiome 读 player.Zone*）。
//
// 报告键 1:1（ShopHelper.AddHappinessReportText :194-203）：
//   全键 = "TownNPCMood_" + NPCID.Search.GetName(netID) + "." + 文案子键；
//   {BiomeName} ← TownNPCMoodBiomes.<nameKey>（BiomeNameByKey :189-192）；
//   {NPCName} ← NPC.GetFullnameByID（→ Lang.npcName）。
//   633 变身态（altTexture==2，血月夜/满月夜——图鉴进度无关）另有
//   TownNPCMood_BestiaryGirlTransformed 分节（computeHappiness 入参 altTexture2
//   切换，2026-08-20 接；对话侧 Lycantrope 池与商店门另见 Game.ts）。

import { NPC_NAME_BY_ID } from '../i18n/idNames.generated';
import { TOWN_PET_VIDS } from './townPets';

export interface BiomeZones {
  forest: boolean; ocean: boolean; snow: boolean; desert: boolean;
  jungle: boolean; underground: boolean; hallow: boolean; mushroom: boolean;
}

/** 心情报告行（原版 HappinessReport 的逐条等价；UI 逐行 l10n 渲染） */
export interface HappinessReportLine {
  /** l10n 全键 = TownNPCMood_<Internal>.<子键> */
  key: string;
  /** {BiomeName} 替换来源（键 = TownNPCMoodBiomes.<biomeNameKey>） */
  biomeNameKey?: string;
  /** {NPCName} 替换来源（原版 NPC id → Lang.npcName） */
  npcId?: number;
}

/** 生物群系偏好表（PersonalityDatabasePopulator.Populate_BiomePreferences 全 25 条；
 *  Santa(142) 是全表唯一 Love/Hate 级，Truffle(160) 仅 Like 一档） */
const BIOME_PREFS: Record<number, Array<{ level: 'Love' | 'Like' | 'Dislike' | 'Hate'; biome: BiomeKey }>> = {
  22: [{ level: 'Like', biome: 'forest' }, { level: 'Dislike', biome: 'ocean' }],        // Guide
  17: [{ level: 'Like', biome: 'forest' }, { level: 'Dislike', biome: 'desert' }],       // Merchant
  588: [{ level: 'Like', biome: 'forest' }, { level: 'Dislike', biome: 'underground' }], // Golfer
  633: [{ level: 'Like', biome: 'forest' }, { level: 'Dislike', biome: 'desert' }],      // Zoologist
  441: [{ level: 'Like', biome: 'snow' }, { level: 'Dislike', biome: 'hallow' }],        // Tax Collector
  124: [{ level: 'Like', biome: 'snow' }, { level: 'Dislike', biome: 'underground' }],   // Mechanic
  209: [{ level: 'Like', biome: 'snow' }, { level: 'Dislike', biome: 'jungle' }],        // Cyborg
  142: [{ level: 'Love', biome: 'snow' }, { level: 'Hate', biome: 'desert' }],           // Santa
  207: [{ level: 'Like', biome: 'desert' }, { level: 'Dislike', biome: 'forest' }],      // Dye Trader
  19: [{ level: 'Like', biome: 'desert' }, { level: 'Dislike', biome: 'snow' }],         // Arms Dealer
  178: [{ level: 'Like', biome: 'desert' }, { level: 'Dislike', biome: 'jungle' }],      // Steampunker
  20: [{ level: 'Like', biome: 'jungle' }, { level: 'Dislike', biome: 'desert' }],       // Dryad
  228: [{ level: 'Like', biome: 'jungle' }, { level: 'Dislike', biome: 'hallow' }],      // Witch Doctor
  227: [{ level: 'Like', biome: 'jungle' }, { level: 'Dislike', biome: 'forest' }],      // Painter
  369: [{ level: 'Like', biome: 'ocean' }, { level: 'Dislike', biome: 'desert' }],       // Angler
  229: [{ level: 'Like', biome: 'ocean' }, { level: 'Dislike', biome: 'underground' }],  // Pirate
  353: [{ level: 'Like', biome: 'ocean' }, { level: 'Dislike', biome: 'snow' }],         // Stylist
  38: [{ level: 'Like', biome: 'underground' }, { level: 'Dislike', biome: 'ocean' }],   // Demolitionist
  107: [{ level: 'Like', biome: 'underground' }, { level: 'Dislike', biome: 'jungle' }], // Goblin Tinkerer
  54: [{ level: 'Like', biome: 'underground' }, { level: 'Dislike', biome: 'hallow' }],  // Clothier
  108: [{ level: 'Like', biome: 'hallow' }, { level: 'Dislike', biome: 'ocean' }],       // Wizard
  18: [{ level: 'Like', biome: 'hallow' }, { level: 'Dislike', biome: 'snow' }],         // Nurse
  208: [{ level: 'Like', biome: 'hallow' }, { level: 'Dislike', biome: 'underground' }], // Party Girl（PersonalityDatabasePopulator.cs:137-141 biome7=underground——曾误抄 snow）
  550: [{ level: 'Like', biome: 'hallow' }, { level: 'Dislike', biome: 'snow' }],        // Tavernkeep
  160: [{ level: 'Like', biome: 'mushroom' }],                                           // Truffle（仅 Like 一档）
};
type BiomeKey = keyof BiomeZones;

/** 本仓 zone 键 → 原版 AShoppingBiome.NameKey（TownNPCMoodBiomes 分节键） */
const BIOME_NAME_KEY: Record<BiomeKey, string> = {
  forest: 'Forest', ocean: 'Ocean', snow: 'Snow', desert: 'Desert',
  jungle: 'Jungle', underground: 'NormalUnderground', hallow: 'Hallow', mushroom: 'Mushroom',
};

const LIKE_MUL = 0.94, DISLIKE_MUL = 1.06, LOVE_MUL = 0.88, HATE_MUL = 1.12;
/** AffectionLevel.cs:5-8（BiomePreferenceListTrait 最强命中比较用） */
const AFFECTION: Record<'Love' | 'Like' | 'Dislike' | 'Hate', number> =
  { Love: 100, Like: 50, Dislike: -50, Hate: -100 };

/** NPC 互相关系（AllPersonalitiesModifier.cs ModifyShopPrice_Relationships :12-506 全量 103 条；
 *  触发判定 = 目标在 owner 同屋列表（home 距离<25，GetNearbyResidentNPCs :295-332——村 25-120 不触发）；
 *  所有命中项连乘（与群系偏好的"最强命中一条"不同）。
 *  文案子键：Like/Love/Dislike/Hate 均为通用键（ShopHelper.LikeNPC/LoveNPC/DislikeNPC/HateNPC） */
type RelLevel = 'Love' | 'Like' | 'Dislike' | 'Hate';
const REL_KEY: Record<RelLevel, string> = { Love: 'LoveNPC', Like: 'LikeNPC', Dislike: 'DislikeNPC', Hate: 'HateNPC' };
const REL_MUL: Record<RelLevel, number> = { Love: LOVE_MUL, Like: LIKE_MUL, Dislike: DISLIKE_MUL, Hate: HATE_MUL };
const NPC_RELATIONSHIPS: Record<number, { target: number; level: RelLevel }[]> = {
  17:  [{ target: 588, level: 'Like' }, { target: 18, level: 'Like' }, { target: 441, level: 'Dislike' }, { target: 369, level: 'Hate' }],
  18:  [{ target: 19, level: 'Love' }, { target: 108, level: 'Like' }, { target: 208, level: 'Dislike' }, { target: 20, level: 'Dislike' }, { target: 633, level: 'Hate' }],
  227: [{ target: 20, level: 'Love' }, { target: 208, level: 'Like' }, { target: 209, level: 'Dislike' }, { target: 160, level: 'Dislike' }],
  207: [{ target: 19, level: 'Like' }, { target: 227, level: 'Like' }, { target: 178, level: 'Dislike' }, { target: 229, level: 'Hate' }],
  208: [{ target: 108, level: 'Love' }, { target: 353, level: 'Like' }, { target: 17, level: 'Dislike' }, { target: 441, level: 'Hate' }, { target: 633, level: 'Love' }],
  369: [{ target: 208, level: 'Like' }, { target: 38, level: 'Like' }, { target: 441, level: 'Like' }, { target: 550, level: 'Hate' }],
  353: [{ target: 207, level: 'Love' }, { target: 229, level: 'Like' }, { target: 550, level: 'Dislike' }, { target: 107, level: 'Hate' }],
  38:  [{ target: 550, level: 'Love' }, { target: 124, level: 'Like' }, { target: 107, level: 'Dislike' }, { target: 19, level: 'Dislike' }],
  20:  [{ target: 228, level: 'Like' }, { target: 160, level: 'Like' }, { target: 369, level: 'Dislike' }, { target: 588, level: 'Hate' }],
  550: [{ target: 38, level: 'Love' }, { target: 107, level: 'Like' }, { target: 22, level: 'Dislike' }, { target: 207, level: 'Hate' }],
  19:  [{ target: 18, level: 'Love' }, { target: 178, level: 'Like' }, { target: 588, level: 'Dislike' }, { target: 38, level: 'Hate' }],
  107: [{ target: 124, level: 'Love' }, { target: 207, level: 'Like' }, { target: 54, level: 'Dislike' }, { target: 353, level: 'Hate' }],
  228: [{ target: 20, level: 'Like' }, { target: 22, level: 'Like' }, { target: 18, level: 'Dislike' }, { target: 160, level: 'Hate' }],
  54:  [{ target: 160, level: 'Love' }, { target: 441, level: 'Like' }, { target: 18, level: 'Dislike' }, { target: 124, level: 'Hate' }],
  124: [{ target: 107, level: 'Love' }, { target: 209, level: 'Like' }, { target: 19, level: 'Dislike' }, { target: 54, level: 'Hate' }],
  441: [{ target: 17, level: 'Love' }, { target: 208, level: 'Like' }, { target: 38, level: 'Dislike' }, { target: 124, level: 'Dislike' }, { target: 142, level: 'Hate' }],
  229: [{ target: 369, level: 'Love' }, { target: 550, level: 'Like' }, { target: 353, level: 'Dislike' }, { target: 22, level: 'Hate' }],
  108: [{ target: 588, level: 'Love' }, { target: 17, level: 'Like' }, { target: 228, level: 'Dislike' }, { target: 209, level: 'Hate' }],
  178: [{ target: 209, level: 'Love' }, { target: 227, level: 'Like' }, { target: 208, level: 'Dislike' }, { target: 108, level: 'Dislike' }, { target: 20, level: 'Dislike' }],
  209: [{ target: 353, level: 'Like' }, { target: 229, level: 'Like' }, { target: 178, level: 'Like' }, { target: 108, level: 'Hate' }, { target: 633, level: 'Dislike' }],
  142: [{ target: 441, level: 'Hate' }],
  588: [{ target: 227, level: 'Like' }, { target: 369, level: 'Love' }, { target: 17, level: 'Hate' }, { target: 229, level: 'Dislike' }, { target: 633, level: 'Like' }],
  22:  [{ target: 54, level: 'Like' }, { target: 178, level: 'Dislike' }, { target: 227, level: 'Hate' }, { target: 633, level: 'Like' }],
  160: [{ target: 22, level: 'Love' }, { target: 20, level: 'Like' }, { target: 54, level: 'Dislike' }, { target: 228, level: 'Hate' }],
  633: [{ target: 369, level: 'Dislike' }, { target: 19, level: 'Hate' }, { target: 228, level: 'Love' }, { target: 588, level: 'Like' }],
};

export interface HappinessInput {
  npcVanillaId: number;
  /** Main.remixWorld（don't dig up 种子）——ProcessMood :107 提前 return 门（幸福价恒 1f） */
  remixWorld?: boolean;
  /** NPC 身上 Lovestruck buff（119,爱情药水弹 370 消亡 80px 圈授予 1800t）——
   *  本仓载体 = TownNPC.lovestruckT（秒,applyBuffTicks 119 映射写入;2026-09-29
   *  刀B 批）。ProcessMood :103-106 在提前 return 门【之前】×0.9——remix/旅行商
   *  368/骷髅商 453/老人 37/城镇宠物也吃此乘区（无报告行、不走钳制/取整） */
  loveStruck?: boolean;
  /** NPC 无家（homeless） */
  homeless: boolean;
  /** NPC 当前中心 tile 距家 tile 距离 */
  distFromHome: number;
  /** 玩家（购物者）所在危险群系 */
  playerInCorrupt: boolean; playerInCrimson: boolean; playerInDungeon: boolean;
  /** 玩家群系 zone 快照（偏好判定用） */
  zones: BiomeZones;
  /** 同屋人数（<25 tile 内其它城镇 NPC，含不可同住门） */
  npcsInHouse: number;
  /** 村人数（25-120 tile） */
  npcsInVillage: number;
  /** 同屋目标 vanillaId 列表（<25，GetNearbyResidentNPCs 已过滤 37/368/453；
   *  重复 id 折叠成位图语义——原版 nearbyNPCsByType 布尔） */
  nearby: number[];
  /** 本 NPC 是否公主（663） */
  isPrincess: boolean;
  /** 633 狼人变身态（npc.altTexture==2）——报告分节名换 *Transformed 后缀
   *  （AddHappinessReportText :197-200：type==633 && altTexture==2 时追加）。 */
  altTexture2?: boolean;
  /** 公主动态抽 Love 的随机源（:22-36 Main.rand.Next） */
  rand?: () => number;
}

export interface HappinessResult {
  /** 价格乘子（LimitAndRoundMultiplier 后 ∈ [0.75, 1.5]；1.0 = 无修正） */
  priceMul: number;
  /** 心情报告行（原版 HappinessReport 逐条；空 = 无按钮，ReportHappiness.Condition） */
  report: HappinessReportLine[];
}

/** 心情文案分节名（AddHappinessReportText :194-201）：
 *  "TownNPCMood_" + NPCID.Search.GetName(netID)；633 变身态（altTexture==2）
 *  追加 "Transformed" → TownNPCMood_BestiaryGirlTransformed 分节（:197-200） */
export function npcMoodCategory(npcVanillaId: number, transformed = false): string {
  const name = NPC_NAME_BY_ID[npcVanillaId] ?? '';
  return `TownNPCMood_${name}${transformed && npcVanillaId === 633 ? 'Transformed' : ''}`;
}

// ---------------------------------------------------------------------------
// ★IIIII234（2026-09-09）：GetNearbyResidentNPCs 邻居计数谓词（ShopHelper.cs:295-332）。
//   邻居计入条件 = `nPC.active && nPC.townNPC && !IsNotReallyTownNPC(nPC)
//   && !TownManager.CanNPCsLiveWithEachOther_ShopHelper(npc, nPC)`（:312-317）：
//   ① IsNotReallyTownNPC（:373-380）= 37 老人 / 368 旅行商 / 453 骷髅商 → 不计；
//   ② CanNPCsLiveWithEachOther（TownRoomManager.cs:118-121）= `housingCategory
//      不同` → 调用点取反 = 同类别才计入。SetDefaults 赋 housingCategory=1 的
//      全集 = NPCID.Sets.IsTownPet（637/638@NPC.cs:17239、656@:17327、670@:17513、
//      678-684@:17626）——城镇宠物与普通城镇 NPC 互不计入拥挤（同屋 <25）、
//      村（25-120）计数与互相关系条目；宠物对宠物照常计入（ProcessMood 对宠物
//      提前 return,该面仅在同屋双宠物时可达）。
//   townNPC 门 = 引擎侧 TownNPC 实例 instanceof 判定（TownNPC.cs SetDefaults
//   townNPC=true 全集），不在此函数承载。
// ---------------------------------------------------------------------------
export function shopHelperCountsNeighbor(npcVid: number, neighborVid: number): boolean {
  if (neighborVid === 37 || neighborVid === 368 || neighborVid === 453) return false;
  if (TOWN_PET_VIDS.has(neighborVid) !== TOWN_PET_VIDS.has(npcVid)) return false;
  return true;
}

/** GetShoppingSettings / ProcessMood 1:1 */
export function computeHappiness(inp: HappinessInput): HappinessResult {
  let mul = 1.0;
  const report: HappinessReportLine[] = [];
  const line = (sub: string, extra?: Partial<HappinessReportLine>) => {
    report.push({ key: `${npcMoodCategory(inp.npcVanillaId, inp.altTexture2)}.${sub}`, ...extra });
  };
  // ★loveStruck ×0.9（ShopHelper.cs:103-106）——在提前 return 门【之前】（原版
  //  语句序 :103-106 先于 :107-110）：remix/旅行商368/骷髅商453/老人37/城镇宠物
  //  恋爱中同样 ×0.9,且提前 return 跳过 LimitAndRoundMultiplier（0.9 本身可精确
  //  表示,钳/圆等价——结构差异登记为门序断言,见 townnpc-lovestruck 测试）
  if (inp.loveStruck) mul *= 0.9;
  // remix(Dig Up)/旅行商(368)/骷髅商(453)/城镇宠物/IsNotReallyTownNPC(老人37)——
  // 门前乘区保留、报告行不产（ShopHelper.ProcessMood :107-110 `Main.remixWorld ||
  // 368 || 453 || IsTownPet || IsNotReallyTownNPC` 提前 return）。
  // ★2026-08-30 补漏：注释声称含城镇宠物但条件表漏排（ShopHelper.cs:104-110 含
  // IsTownPet 分支）——潜伏债已清（宠物因永无家被 canShowHomelessText 遮蔽才无表象）
  // ★清偿刀 H（2026-09-29）：补 remixWorld 门（本仓 seedFlags.remix 已有世界态,
  //  同源 World.ts:265 IsItDay）——remix 世界城镇 NPC 幸福价恒 1f
  // ★清偿刀 B（2026-09-29）：loveStruck 门前 ×0.9 已接（上方）——TownNPC
  //  .lovestruckT 载体（X4-债10 清偿）
  if (inp.remixWorld || inp.npcVanillaId === 368 || inp.npcVanillaId === 453
    || inp.npcVanillaId === 37 || TOWN_PET_VIDS.has(inp.npcVanillaId)) {
    return { priceMul: mul, report: [] };
  }
  // 无家 / 离家 >120 / 危险群系 → 置 1000（:111-122；末尾钳回 1.5）
  const ruined = inp.homeless || inp.distFromHome > 120;
  if (inp.homeless) line('NoHome');                                  // RuinMoodIfHomeless :334-341
  else if (inp.distFromHome > 120) line('FarFromHome');              // IsFarFromHome :343-353
  // HateBiome 守门对齐 ShopHelper.cs:116-124 `_currentPriceAdjustment < 1000f`——
  // NoHome/FarFromHome 已把价乘置 1000 时不再叠发（审查 P2：原版差一行语义）
  for (const [flag, nameKey] of [
    [inp.playerInCorrupt, 'Corruption'], [inp.playerInCrimson, 'Crimson'], [inp.playerInDungeon, 'Dungeon'],
  ] as Array<[boolean, string]>) {
    if (flag && mul < 1000) { line('HateBiome', { biomeNameKey: nameKey }); break; }  // IsPlayerInEvilBiomes :355-370（首命中）
  }
  if (ruined || inp.playerInCorrupt || inp.playerInCrimson || inp.playerInDungeon) {
    mul = 1000;
  }
  if (inp.homeless || inp.distFromHome > 120
    || inp.playerInCorrupt || inp.playerInCrimson || inp.playerInDungeon) {
    mul = 1000;
  }
  // 拥挤/宽敞（:123-157）。公主：拥挤系数 1.0（报告照发）且不吃 LoveSpace
  const princess = inp.isPrincess;
  const crowdPer = princess ? 1.0 : 1.05;
  if (princess && inp.npcsInHouse < 2 && inp.npcsInVillage < 2) {
    line('HateLonely');                                              // :132-137
    mul = 1000;
  }
  if (inp.npcsInHouse > 3) {
    for (let i = 3; i < inp.npcsInHouse; i++) mul *= crowdPer;       // :138-143
    line(inp.npcsInHouse > 6 ? 'HateCrowded' : 'DislikeCrowded');
  }
  if (!princess && inp.npcsInHouse <= 2 && inp.npcsInVillage < 4) {
    line('LoveSpace');                                               // :153-157
    mul *= 0.95;
  }
  // 生物群系偏好（BiomePreferenceListTrait.ModifyShopPrice :40-55：命中中取好感最强一条）
  const prefs = BIOME_PREFS[inp.npcVanillaId];
  if (prefs) {
    let best: { level: 'Love' | 'Like' | 'Dislike' | 'Hate'; biome: BiomeKey } | null = null;
    for (const p of prefs) {
      if (inp.zones[p.biome] && (!best || AFFECTION[p.level] > AFFECTION[best.level])) best = p;
    }
    if (best) {
      line(`${best.level}Biome`, { biomeNameKey: BIOME_NAME_KEY[best.biome] });
      mul *= REL_MUL[best.level];
    }
  }
  // NPC 互相关系（AllPersonalitiesModifier.ModifyShopPrice_Relationships :12-506——全部命中连乘）
  const near = new Set(inp.nearby);
  if (princess) {
    // 公主无静态表：同屋池随机抽 3 个各 LoveNPCByTypeName ×0.88（:15-26；不足 3 全 Love）
    const pool = [...near];
    const rand = inp.rand ?? Math.random;
    for (let j = 0; j < 3 && pool.length > 0; j++) {
      const idx = Math.floor(rand() * pool.length) % pool.length;
      const target = pool.splice(idx, 1)[0];
      mul *= LOVE_MUL;
      line(`LoveNPC_${NPC_NAME_BY_ID[target] ?? ''}`, { npcId: target });
    }
  } else {
    if (near.has(663)) {                                             // :37-40
      mul *= LIKE_MUL;
      line('LikeNPC_Princess', { npcId: 663 });
    }
    for (const rel of NPC_RELATIONSHIPS[inp.npcVanillaId] ?? []) {
      if (near.has(rel.target)) {
        mul *= REL_MUL[rel.level];
        line(REL_KEY[rel.level], { npcId: rel.target });
      }
    }
  }
  // 无报告 → Content；LimitAndRoundMultiplier（:175-186）
  if (report.length === 0) line('Content');
  mul = Math.max(0.75, Math.min(1.5, mul));
  mul = Math.round(mul * 100) / 100;
  return { priceMul: mul, report };
}
