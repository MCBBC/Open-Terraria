// NPC 快乐度 → 商店价格系数（ShopHelper.cs ProcessMood :99-180 + BiomePreferenceListTrait
// + AllPersonalitiesModifier）1:1。
// 公式（_currentPriceAdjustment 初值 1.0）：
//   ① loveStruck 魅Love药水 ×0.9（未实装略）；
//   ② 无家/离家>120 tile/玩家在腐化·猩红·地牢 → 直接 1000（价格惩罚=不卖价）；
//   ③ 拥挤：同屋（home 距离<25）>3 人后每人 ×1.05（公主 ×1.0 且孤单<2 → 1000）；
//      宽敞：同屋≤2 且村（<120）<4 → ×0.95；
//   ④ 生物群系偏好（PersonalityDatabasePopulator 全表）：喜欢(Like) ×0.94 / 不喜欢 ×1.06
//      / 爱(Love) ×0.88 / 讨厌(Hate) ×1.12（Santa 只有一档 Like）；
//   ⑤ AllPersonalitiesModifier（:12-506 全量 103 条）：互相关系=同屋目标（<25）命中连乘
//      Like ×0.94/Dislike ×1.06/Love ×0.88/Hate ×1.12；公主开店时全员 LikePrincess ×0.94，
//      公主自己从同屋池随机抽 3 个各 Love ×0.88；
//   ⑥ LimitAndRoundMultiplier：钳 [0.75, 1.5] 后四舍五入到 0.01。
// 生物群系判定 = 玩家 SceneFlags zone（AShoppingBiome.IsInBiome 读 player.Zone*）。

export interface BiomeZones {
  forest: boolean; ocean: boolean; snow: boolean; desert: boolean;
  jungle: boolean; underground: boolean; hallow: boolean; mushroom: boolean;
}

/** 生物群系偏好表（PersonalityDatabasePopulator.Populate_BiomePreferences 全 25 条；
 *  [Like 群系, Dislike 群系]——Santa(142) Love/Hate、Truffle(160) 单档 Like） */
const BIOME_PREFS: Record<number, { like?: BiomeKey; dislike?: BiomeKey }> = {
  22: { like: 'forest', dislike: 'ocean' },       // Guide
  17: { like: 'forest', dislike: 'desert' },      // Merchant
  588: { like: 'forest', dislike: 'underground' },// Golfer
  633: { like: 'forest', dislike: 'desert' },     // Zoologist
  441: { like: 'snow', dislike: 'hallow' },       // Tax Collector
  124: { like: 'snow', dislike: 'underground' },  // Mechanic
  209: { like: 'snow', dislike: 'jungle' },       // Cyborg
  142: { like: 'snow', dislike: 'desert' },       // Santa（Love 级）
  207: { like: 'desert', dislike: 'forest' },     // Dye Trader
  19: { like: 'desert', dislike: 'snow' },        // Arms Dealer
  178: { like: 'desert', dislike: 'jungle' },     // Steampunker
  20: { like: 'jungle', dislike: 'desert' },      // Dryad
  228: { like: 'jungle', dislike: 'hallow' },     // Witch Doctor
  227: { like: 'jungle', dislike: 'forest' },     // Painter
  369: { like: 'ocean', dislike: 'desert' },      // Angler
  229: { like: 'ocean', dislike: 'underground' }, // Pirate
  353: { like: 'ocean', dislike: 'snow' },        // Stylist
  38: { like: 'underground', dislike: 'ocean' },  // Demolitionist
  107: { like: 'underground', dislike: 'jungle' },// Goblin Tinkerer
  54: { like: 'underground', dislike: 'hallow' }, // Clothier
  108: { like: 'hallow', dislike: 'ocean' },      // Wizard
  18: { like: 'hallow', dislike: 'snow' },        // Nurse
  208: { like: 'hallow', dislike: 'underground' },// Party Girl
  550: { like: 'hallow', dislike: 'snow' },       // Tavernkeep
  160: { like: 'mushroom' },                      // Truffle（仅 Like 一档）
};
type BiomeKey = keyof BiomeZones;

const LIKE_MUL = 0.94, DISLIKE_MUL = 1.06, LOVE_MUL = 0.88, HATE_MUL = 1.12;

/** NPC 互相关系（AllPersonalitiesModifier.cs ModifyShopPrice_Relationships :12-506 全量 103 条；
 *  触发判定 = 目标在 owner 同屋列表（home 距离<25，GetNearbyResidentNPCs :295-332——村 25-120 不触发）；
 *  所有命中项连乘（与群系偏好的"最强命中一条"不同）。663 公主无静态表，走动态分支。 */
type RelLevel = 'Love' | 'Like' | 'Dislike' | 'Hate';
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
const REL_MUL: Record<RelLevel, number> = { Love: LOVE_MUL, Like: LIKE_MUL, Dislike: DISLIKE_MUL, Hate: HATE_MUL };

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
  /** 价格乘子（1.0 = 无修正；1000 = 心情崩坏） */
  priceMul: number;
  /** 心情报告 key（原版 HappinessReport——中文提示用） */
  report: string[];
}

/** GetShoppingSettings / ProcessMood 1:1 */
export function computeHappiness(inp: HappinessInput): HappinessResult {
  let mul = 1.0;
  const report: string[] = [];
  // remix/旅行商(368)/骷髅商(453)/城镇宠物/IsNotReallyTownNPC(老人37)——直接 1.0
  if (inp.npcVanillaId === 368 || inp.npcVanillaId === 453 || inp.npcVanillaId === 37) {
    return { priceMul: 1, report: [] };
  }
  // 无家 / 离家 >120 / 危险群系 → 1000（:111-122）
  if (inp.homeless) report.push('TownNPCMoodNo.Home');
  else if (inp.distFromHome > 120) report.push('TownNPCMoodNo.FarFromHome');
  if (inp.homeless || inp.distFromHome > 120
    || inp.playerInCorrupt || inp.playerInCrimson || inp.playerInDungeon) {
    return { priceMul: 1000, report };
  }
  // 拥挤/宽敞（:126-157）
  const princess = inp.isPrincess;
  if (princess) {
    if (inp.npcsInHouse < 2 && inp.npcsInVillage < 2) {
      report.push('TownNPCMoodPrincess.HateLonely');
      return { priceMul: 1000, report };
    }
  } else if (inp.npcsInHouse > 3) {
    for (let i = 3; i < inp.npcsInHouse; i++) mul *= 1.05;
    report.push(inp.npcsInHouse > 6 ? 'TownNPCMoodShop.HateCrowded' : 'TownNPCMoodShop.DislikeCrowded');
  }
  if (!princess && inp.npcsInHouse <= 2 && inp.npcsInVillage < 4) {
    report.push('TownNPCMoodShop.LoveSpace');
    mul *= 0.95;
  }
  // 生物群系偏好（BiomePreferenceListTrait.ModifyShopPrice）
  const pref = BIOME_PREFS[inp.npcVanillaId];
  if (pref) {
    if (pref.like && inp.zones[pref.like]) {
      mul *= inp.npcVanillaId === 142 ? LOVE_MUL : LIKE_MUL;
      report.push(`TownNPCMoodShopper.${inp.npcVanillaId === 142 ? 'LoveBiome' : 'LikeBiome'}`);
    }
    if (pref.dislike && inp.zones[pref.dislike]) {
      mul *= inp.npcVanillaId === 142 ? HATE_MUL : DISLIKE_MUL;
      report.push(`TownNPCMoodShopper.${inp.npcVanillaId === 142 ? 'HateBiome' : 'DislikeBiome'}`);
    }
  }
  // NPC 互相关系（AllPersonalitiesModifier.ModifyShopPrice_Relationships :12-506——全部命中连乘）
  const near = new Set(inp.nearby);
  if (princess) {
    // 公主无静态表：同屋池随机抽 3 个各 Love ×0.88（不足 3 全 Love；:15-36）
    const pool = [...near];
    const rand = inp.rand ?? Math.random;
    for (let j = 0; j < 3 && pool.length > 0; j++) {
      const idx = Math.floor(rand() * pool.length) % pool.length;
      pool.splice(idx, 1);
      mul *= LOVE_MUL;
      report.push('TownNPCMoodShop.LoveNpc');
    }
  } else {
    if (near.has(663)) { mul *= LIKE_MUL; report.push('TownNPCMoodShop.LikePrincess'); } // :37-40
    for (const rel of NPC_RELATIONSHIPS[inp.npcVanillaId] ?? []) {
      if (near.has(rel.target)) {
        mul *= REL_MUL[rel.level];
        report.push(`TownNPCMoodShop.${rel.level}Npc`);
      }
    }
  }
  // LimitAndRoundMultiplier（:182-187）
  mul = Math.max(0.75, Math.min(1.5, mul));
  mul = Math.round(mul * 100) / 100;
  if (report.length === 0) report.push('TownNPCMoodShop.Content');
  return { priceMul: mul, report };
}
