// 原版 NPC 对话头像（NPCID.Sets.NPCPortraits → Images/TownNPCs/Portraits/Portrait_<Name>，
// NPCID.cs:214 字典逐条提取；素材已复制到 public/sprites/portraits/）。
// Shimmer 变体按原版条件优先级省略（无微光态），取默认头像。
export const NPC_PORTRAITS: Record<number, string> = {
  17: 'Merchant', 18: 'Nurse', 19: 'ArmsDealer', 20: 'Dryad', 22: 'Guide',
  37: 'OldMan', 38: 'Demolitionist', 54: 'Clothier', 107: 'GoblinTinkerer',
  108: 'Wizard', 124: 'Mechanic', 142: 'Santa', 160: 'Truffle', 178: 'Steampunker',
  207: 'DyeTrader', 208: 'PartyGirl', 209: 'Cyborg', 227: 'Painter',
  228: 'WitchDoctor', 229: 'Pirate', 353: 'Stylist', 368: 'TravellingMerchant',
  369: 'Angler', 441: 'TaxCollector', 453: 'SkeletonMerchant', 550: 'Tavernkeep',
  588: 'Golfer', 663: 'Princess',
};

/** 头像 URL（无头像 NPC 返回 null——原版该字典不含全部类型） */
export function portraitUrl(vanillaId: number): string | null {
  const name = NPC_PORTRAITS[vanillaId];
  return name ? `sprites/portraits/Portrait_${name}.png` : null;
}
