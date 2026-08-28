// 城镇 NPC 贴图档案（TownNPCProfiles.cs:19-181 + Profiles.cs 全四类 Profile 的
// GetTextureNPCShouldUse 1:1）——原版城镇 NPC 的贴图不在 Images/NPC_{id}，而在
// Images/TownNPCs/{档案名}：
//   - LegacyNPCProfile（Profiles.cs:63-152）：altTexture==1 → {Name}_Default_Party
//     （uniquePartyTexture=false 时无 _Party 贴图，回落 {Name}_Default），否则 _Default
//   - TransformableNPCProfile（Profiles.cs:112-182）：altTexture==2 → {Name}_Default_Transformed
//     （633 动物学家狼人态），altTexture==3 → _Default_Credits（制作组名单专用，游戏内
//     不可达，未接），否则 _Default
//   - StackedNPCProfile（Profiles.cs:10-47）：townNpcVariationIndex 0=常态档 /
//     1=微光档（LegacyWithSimpleShimmer/TransformableWithSimpleShimmer
//     TownNPCProfiles.cs:190-198 把两档叠起来，档位由 NPC.GetShimmered 翻转
//     NPC.cs:53669 + 重生端 ShimmeredTownNPCs 回填 :81627）
// 微光档根路径 = Images/TownNPCs/Shimmered/{Name}（TownNPCProfiles.cs:9），
// 本仓素材管线已平铺为 sprites/vanilla/Shimmered_{Name}_Default{,_Party,_Transformed}.png
// （44 张全量在库，含 633 的 Shimmered_…_Default_Transformed）。
//
// 与 NPC_PORTRAITS（npcPortraits.ts）同构（原版两表同源于 NPCID.Sets.NPCPortraits/
// TownNPCProfiles 的档案名），但本表多了 party/shimmerParty 开关与 slime 族——
// NPC_PORTRAITS 无头像的 670/678-684 在此有档案。
//
// 未收录：637 猫 / 638 狗 / 656 兔（VariantNPCProfile，贴图 = {root}_{随机变体名}
// 六选一，RollVariation TownNPCProfiles.cs:142-147；变体选取未接，登记）。
export interface TownNpcProfile {
  /** Images/TownNPCs/{name} 档案根（无路径前缀/后缀） */
  name: string;
  /** LegacyWithSimpleShimmer 第 4 参 uniquePartyTexture：false = 无 _Party 贴图，
   *  altTexture=1 时用 _Default（TownNPCProfiles.cs:23-135 逐条） */
  party: boolean;
  /** 同上第 5 参 uniquePartyTextureShimmered（微光档的 _Party） */
  shimmerParty: boolean;
  /** 是否有微光档（StackedNPCProfile 只为 ShimmerTownTransform 29 只叠加；
   *  slime 八只是裸 LegacyNPCProfile，townNpcVariationIndex 不参与选档） */
  shimmer: boolean;
  /** TransformableNPCProfile（仅 633）：altTexture=2 → _Default_Transformed */
  transform?: boolean;
}

/** TownNPCProfiles._townNPCProfiles 1:1（含 slime 八只的 LegacyNPCProfile :151-180） */
export const TOWN_NPC_PROFILE: Record<number, TownNpcProfile> = {
  22: { name: 'Guide', party: false, shimmerParty: false, shimmer: true },
  20: { name: 'Dryad', party: false, shimmerParty: false, shimmer: true },
  19: { name: 'ArmsDealer', party: false, shimmerParty: false, shimmer: true },
  107: { name: 'GoblinTinkerer', party: false, shimmerParty: false, shimmer: true },
  160: { name: 'Truffle', party: false, shimmerParty: false, shimmer: true },
  208: { name: 'PartyGirl', party: false, shimmerParty: false, shimmer: true },
  228: { name: 'WitchDoctor', party: false, shimmerParty: false, shimmer: true },
  550: { name: 'Tavernkeep', party: false, shimmerParty: false, shimmer: true },
  369: { name: 'Angler', party: true, shimmerParty: false, shimmer: true },
  54: { name: 'Clothier', party: true, shimmerParty: false, shimmer: true },
  209: { name: 'Cyborg', party: true, shimmerParty: true, shimmer: true },
  38: { name: 'Demolitionist', party: true, shimmerParty: true, shimmer: true },
  207: { name: 'DyeTrader', party: true, shimmerParty: true, shimmer: true },
  588: { name: 'Golfer', party: true, shimmerParty: false, shimmer: true },
  124: { name: 'Mechanic', party: true, shimmerParty: true, shimmer: true },
  17: { name: 'Merchant', party: true, shimmerParty: true, shimmer: true },
  18: { name: 'Nurse', party: true, shimmerParty: true, shimmer: true },
  227: { name: 'Painter', party: true, shimmerParty: false, shimmer: true },
  229: { name: 'Pirate', party: true, shimmerParty: true, shimmer: true },
  142: { name: 'Santa', party: true, shimmerParty: true, shimmer: true },
  178: { name: 'Steampunker', party: true, shimmerParty: false, shimmer: true },
  353: { name: 'Stylist', party: true, shimmerParty: true, shimmer: true },
  441: { name: 'TaxCollector', party: true, shimmerParty: true, shimmer: true },
  108: { name: 'Wizard', party: true, shimmerParty: true, shimmer: true },
  663: { name: 'Princess', party: true, shimmerParty: true, shimmer: true },
  633: { name: 'BestiaryGirl', party: false, shimmerParty: false, shimmer: true, transform: true },
  // ↑ TransformableNPCProfile（Profiles.cs:112-159）无 alt==1 派对分支、也不加载
  //   _Party 贴图——且 UpdateAltTexture :91261 对 633 强制关派对，双保险恒 false
  37: { name: 'OldMan', party: false, shimmerParty: false, shimmer: true },
  453: { name: 'SkeletonMerchant', party: true, shimmerParty: true, shimmer: true },
  368: { name: 'TravelingMerchant', party: true, shimmerParty: true, shimmer: true },
  // 城镇史莱姆八只：无微光档（ShimmerImmunity，Shimmer.ts NPC_SHIMMER_IMMUNITY），
  // shimmerParty 恒不消费，取 false 防误指不存在的 Shimmered_ 文件
  670: { name: 'SlimeBlue', party: false, shimmerParty: false, shimmer: false },
  678: { name: 'SlimeGreen', party: true, shimmerParty: false, shimmer: false },
  679: { name: 'SlimeOld', party: true, shimmerParty: false, shimmer: false },
  680: { name: 'SlimePurple', party: true, shimmerParty: false, shimmer: false },
  681: { name: 'SlimeRainbow', party: true, shimmerParty: false, shimmer: false },
  682: { name: 'SlimeRed', party: true, shimmerParty: false, shimmer: false },
  683: { name: 'SlimeYellow', party: true, shimmerParty: false, shimmer: false },
  684: { name: 'SlimeCopper', party: true, shimmerParty: false, shimmer: false },
};

/**
 * 当前应使用的贴图 sheet（= DrawNPCCheckAlt Main.cs:22304-22309 →
 * TownNPCProfiles.GetProfile + profile.GetTextureNPCShouldUse 的净效果）。
 * @param id      原版 NPCID
 * @param variant townNpcVariationIndex（0 常态 / 1 微光档；本仓 = TownNPC.shimmered）
 * @param alt     altTexture（UpdateAltTexture NPC.cs:91254-91273：1=派对 2=狼人）
 * @returns sprites 相对路径（如 'vanilla/Shimmered_Guide_Default.png'）；
 *   无档案的类型（宠物 637/638/656 等未收录）返回 null——渲染端回落 NPC_{id} 竖条
 */
export function townNpcProfileSheet(id: number, variant: number, alt: number, variationIdx = -1): string | null {
  // 宠物三族（未入 TOWN_NPC_PROFILE——VariantNPCProfile 无 Legacy 档名表）：
  // root = 变体表键名（Cat/Dog/Bunny），变体档贴图 {root}_{Variant}.png。
  // ★原版 Profiles.GetTextureNPCShouldUse（Profiles.cs）：IndexOutOfRange → num=0
  //   缺省首变体（townNpcVariationIndex 缺省 0=Siamese/Labrador/White 即"默认外观"）
  //   ——_Default 基础档在 vanilla 素材里根本不存在（TownNPCs/ 只落 6+6+6 变体),
  //   曾对 -1 请求 Default = 404+宠物隐身（bad.log 实锤）。
  //   且宠物 Profile 未链 SetPartyTextures（TownNPCProfiles.cs:139-147）→ 无 _Party
  //   档,派对期 alt=1 同用常态变体贴图（vanilla 404 兜底=同款行为）
  const petVariants = TOWN_PET_VARIANTS[id];
  if (petVariants && !petVariants.includes('__')) {
    const vn = petVariants[variationIdx >= 0 && variationIdx < petVariants.length ? variationIdx : 0];
    return `vanilla/${id === 637 ? 'Cat' : id === 638 ? 'Dog' : 'Bunny'}_${vn}.png`;
  }
  const p = TOWN_NPC_PROFILE[id];
  if (!p) return null;
  // 微光档仅对有 StackedNPCProfile 的 29 只生效；裸 LegacyNPCProfile（slime 族）
  // 不看 townNpcVariationIndex，恒走常态档
  const useShimmer = variant === 1 && p.shimmer;
  const root = useShimmer ? `vanilla/Shimmered_${p.name}` : `vanilla/${p.name}`;
  const uniqueParty = useShimmer ? p.shimmerParty : p.party;
  if (alt === 1) return `${root}_Default${uniqueParty ? '_Party' : ''}.png`;
  if (alt === 2 && p.transform) return `${root}_Default_Transformed.png`;
  return `${root}_Default.png`;
}

/** 宠物变体名表（TownNPCProfiles.cs:131-139 VariantNPCProfile：三族各 6 变体，
 *  RollVariation = rand(6)（Profiles.cs:215-218）；贴图 = {root}_{variant}.png
 *  （GetTextureNPCShouldUse :229-238）；名字池 = {base}Names_{variant}（:220-223）） */
export const TOWN_PET_VARIANTS: Record<number, string[]> = {
  637: ['Siamese', 'Black', 'OrangeTabby', 'RussianBlue', 'Silver', 'White'],
  638: ['Labrador', 'PitBull', 'Beagle', 'Corgi', 'Dalmation', 'Husky'],
  656: ['White', 'Angora', 'Dutch', 'Flemish', 'Lop', 'Silver'],
};
/** RollVariation（Profiles.cs:215-218）：rand(n) */
export function rollTownPetVariant(npcId: number): number {
  const v = TOWN_PET_VARIANTS[npcId];
  return v ? Math.floor(Math.random() * v.length) : 0;
}
/** 变体名（供名字池/调试显示） */
export function townPetVariantName(npcId: number, idx: number): string | null {
  const v = TOWN_PET_VARIANTS[npcId];
  return v ? v[idx] ?? null : null;
}

/** ShouldBestiaryGirlBeLycantrope（NPC.cs:94961-94972，1405/1456 两版一致）：
 *  血月夜晚 或 满月(moonPhase==0)夜晚 → 狼人态。无图鉴进度条件（任务预案曾疑
 *  CompletionPercent 门——查源码两版均无，图鉴进度只影响动物学家商店货） */
export function shouldBestiaryGirlBeLycantrope(
  moonPhase: number, bloodMoon: boolean, isDay: boolean,
): boolean {
  if (!bloodMoon || isDay) {
    if (moonPhase === 0) return !isDay;
    return false;
  }
  return true;
}

/**
 * UpdateAltTexture（NPC.cs:91254-91273）1:1：
 *   altTexture=0；派对进行（PartyIsUp，441/453/633 三类强制不参派）→ 1；
 *   633 且狼人条件 → 2（对 633 派对已被强制关，二者不冲突）。
 * ForcePartyHatOn（图鉴假人强戴帽）本仓无对应，略。
 */
export function townNpcAltTexture(
  id: number, partyUp: boolean,
  moonPhase: number, bloodMoon: boolean, isDay: boolean,
): number {
  let flag = partyUp;
  if (id === 441 || id === 453 || id === 633) flag = false;  // :91261-91264
  let alt = 0;
  if (flag) alt = 1;                                          // :91265-91268
  if (id === 633 && shouldBestiaryGirlBeLycantrope(moonPhase, bloodMoon, isDay)) alt = 2; // :91269
  return alt;
}

// ==================== 月相轮换商店表（Chest.SetupShop / ShopHelper 1:1） ====================

/** 树妖(20)月相轮换货 4430-4441（Chest.cs:1650-1697）：
 *  ★归属核对——NPCInteractions.cs:491 `Shop(20, 3)` → 槽位 3 即树妖(20)，
 *   本表是【树妖】专柜，动物学家(633)无此轮换（其月相段仅 Chest.cs:3358-3379
 *   兽耳尾套装四相位对）。
 *    switch (Main.moonPhase / 2)（:1652 hardMode / :1678 非 hardMode 两段）：
 *      case 0（相0/1）: 4430,4431[,4432]    case 1（相2/3）: 4433,4434[,4435]
 *      case 2（相4/5）: 4436,4437[,4438]    default（相6/7）: 4439,4440[,4441]
 *  hardMode 各组 3 件（:1654-1673），非 hardMode 各组前 2 件（:1680-1695）；
 *  尾接主商品链（num++ 连续上架），无数量覆盖（stack=1）。 */
export function dryadMoonPhaseStock(moonPhase: number, hardMode: boolean): number[] {
  const base = Math.floor(moonPhase / 2) * 3;   // switch (Main.moonPhase / 2)（:1652/:1678）
  return [4430, 4431, 4432, 4433, 4434, 4435, 4436, 4437, 4438, 4439, 4440, 4441]
    .slice(base, base + (hardMode ? 3 : 2));
}

/** 骷髅商(453)月相定价系数（ShopHelper.cs:64-88 GetSkeletonMerchantPrices，逐分支抄）：
 *    num = 1f;                          （:66 相0=满月基价 1.0，最便宜）
 *    moonPhase==1 || 7 → num = 1.1f     （:67-70）
 *    moonPhase==2 || 6 → num = 1.2f     （:71-74）
 *    moonPhase==3 || 5 → num = 1.3f     （:75-78）
 *    moonPhase==4       → num = 1.4f     （:79-82 相4=新月，最贵）
 *    if (dayTime) num += 0.1f           （:83-86）
 *  ★1456 考古：该方法在 1.4.5.6 全源【零调用点】——ProcessMood（:107）对
 *   npc.type==453 提前 return，PriceAdjustment 恒 1f（仅 :103-106 loveStruck ×0.9）；
 *   本函数保留原表（消费点 Game.openNpcShop），如需回退 1456 死码语义删该行即可。 */
export function skeletonMerchantMoonPriceMul(moonPhase: number, isDay: boolean): number {
  let num = 1;
  if (moonPhase === 1 || moonPhase === 7) num = 1.1;
  if (moonPhase === 2 || moonPhase === 6) num = 1.2;
  if (moonPhase === 3 || moonPhase === 5) num = 1.3;
  if (moonPhase === 4) num = 1.4;
  if (isDay) num += 0.1;
  return num;
}
