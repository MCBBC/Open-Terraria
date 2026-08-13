// NPC 快乐度 → 商店价格系数 + 心情报告（ShopHelper.cs 1:1）。
// 公式（_currentPriceAdjustment 初值 1.0，ProcessMood :99-180）：
//   ① loveStruck 魅Love药水 ×0.9（未实装略）；
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
//   633 变身态（altTexture==2）另有 TownNPCMood_BestiaryGirlTransformed 分节，
//   本作未实装变身态，恒用基础分节。

import { NPC_NAME_BY_ID } from '../i18n/idNames.generated';

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
  /** 公主动态抽 Love 的随机源（:22-36 Main.rand.Next） */
  rand?: () => number;
}

export interface HappinessResult {
  /** 价格乘子（LimitAndRoundMultiplier 后 ∈ [0.75, 1.5]；1.0 = 无修正） */
  priceMul: number;
  /** 心情报告行（原版 HappinessReport 逐条；空 = 无按钮，ReportHappiness.Condition） */
  report: HappinessReportLine[];
}

/** 心情文案分节名（AddHappinessReportText :196） */
export function npcMoodCategory(npcVanillaId: number): string {
  return `TownNPCMood_${NPC_NAME_BY_ID[npcVanillaId] ?? ''}`;
}

/** GetShoppingSettings / ProcessMood 1:1 */
export function computeHappiness(inp: HappinessInput): HappinessResult {
  let mul = 1.0;
  const report: HappinessReportLine[] = [];
  const line = (sub: string, extra?: Partial<HappinessReportLine>) => {
    report.push({ key: `${npcMoodCategory(inp.npcVanillaId)}.${sub}`, ...extra });
  };
  // remix/旅行商(368)/骷髅商(453)/城镇宠物/IsNotReallyTownNPC(老人37)——1.0 且无报告（:107-110）
  if (inp.npcVanillaId === 368 || inp.npcVanillaId === 453 || inp.npcVanillaId === 37) {
    return { priceMul: 1, report: [] };
  }
  // 无家 / 离家 >120 / 危险群系 → 置 1000（:111-122；末尾钳回 1.5）
  if (inp.homeless) line('NoHome');                                  // RuinMoodIfHomeless :334-341
  else if (inp.distFromHome > 120) line('FarFromHome');              // IsFarFromHome :343-353
  for (const [flag, nameKey] of [
    [inp.playerInCorrupt, 'Corruption'], [inp.playerInCrimson, 'Crimson'], [inp.playerInDungeon, 'Dungeon'],
  ] as Array<[boolean, string]>) {
    if (flag) { line('HateBiome', { biomeNameKey: nameKey }); break; }  // IsPlayerInEvilBiomes :355-370（首命中）
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
