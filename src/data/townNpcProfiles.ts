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
  /** TransformableNPCProfile（仅 633）：altTexture=2 → _Default_Transformed */
  transform?: boolean;
}

/** TownNPCProfiles._townNPCProfiles 1:1（含 slime 八只的 LegacyNPCProfile :151-180） */
export const TOWN_NPC_PROFILE: Record<number, TownNpcProfile> = {
  22:  { name: 'Guide', party: false, shimmerParty: false },             // :23
  20:  { name: 'Dryad', party: false, shimmerParty: false },             // :27
  19:  { name: 'ArmsDealer', party: false, shimmerParty: false },        // :31
  107: { name: 'GoblinTinkerer', party: false, shimmerParty: false },    // :35
  160: { name: 'Truffle', party: false, shimmerParty: false },           // :39
  208: { name: 'PartyGirl', party: false, shimmerParty: false },         // :43
  228: { name: 'WitchDoctor', party: false, shimmerParty: false },       // :47
  550: { name: 'Tavernkeep', party: false, shimmerParty: false },        // :51
  369: { name: 'Angler', party: true, shimmerParty: false },             // :55
  54:  { name: 'Clothier', party: true, shimmerParty: false },           // :59
  209: { name: 'Cyborg', party: true, shimmerParty: true },              // :63
  38:  { name: 'Demolitionist', party: true, shimmerParty: true },       // :67
  207: { name: 'DyeTrader', party: true, shimmerParty: true },           // :71
  588: { name: 'Golfer', party: true, shimmerParty: false },             // :75
  124: { name: 'Mechanic', party: true, shimmerParty: true },            // :79
  17:  { name: 'Merchant', party: true, shimmerParty: true },            // :83
  18:  { name: 'Nurse', party: true, shimmerParty: true },               // :87
  227: { name: 'Painter', party: true, shimmerParty: false },            // :91
  229: { name: 'Pirate', party: true, shimmerParty: true },              // :95
  142: { name: 'Santa', party: true, shimmerParty: true },               // :99
  178: { name: 'Steampunker', party: true, shimmerParty: false },        // :103
  353: { name: 'Stylist', party: true, shimmerParty: true },             // :107
  441: { name: 'TaxCollector', party: true, shimmerParty: true },        // :111
  108: { name: 'Wizard', party: true, shimmerParty: true },              // :115
  663: { name: 'Princess', party: true, shimmerParty: true },            // :119
  633: { name: 'BestiaryGirl', party: true, shimmerParty: true, transform: true }, // :123
  37:  { name: 'OldMan', party: false, shimmerParty: false },            // :127
  453: { name: 'SkeletonMerchant', party: true, shimmerParty: true },    // :131
  368: { name: 'TravelingMerchant', party: true, shimmerParty: true },   // :135
  // 城镇史莱姆八只：无微光档（ShimmerImmunity，Shimmer.ts NPC_SHIMMER_IMMUNITY），
  // shimmerParty 恒不消费，取 false 防误指不存在的 Shimmered_ 文件
  670: { name: 'SlimeBlue', party: false, shimmerParty: false },   // :151 uniquePartyTexture:false
  678: { name: 'SlimeGreen', party: true, shimmerParty: false },   // :155
  679: { name: 'SlimeOld', party: true, shimmerParty: false },     // :159
  680: { name: 'SlimePurple', party: true, shimmerParty: false },  // :163
  681: { name: 'SlimeRainbow', party: true, shimmerParty: false }, // :167
  682: { name: 'SlimeRed', party: true, shimmerParty: false },     // :171
  683: { name: 'SlimeYellow', party: true, shimmerParty: false },  // :175
  684: { name: 'SlimeCopper', party: true, shimmerParty: false },  // :179
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
export function townNpcProfileSheet(id: number, variant: number, alt: number): string | null {
  const p = TOWN_NPC_PROFILE[id];
  if (!p) return null;
  const root = variant === 1 ? `vanilla/Shimmered_${p.name}` : `vanilla/${p.name}`;
  const uniqueParty = variant === 1 ? p.shimmerParty : p.party;
  if (alt === 1) return `${root}_Default${uniqueParty ? '_Party' : ''}.png`;
  if (alt === 2 && p.transform) return `${root}_Default_Transformed.png`;
  return `${root}_Default.png`;
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
