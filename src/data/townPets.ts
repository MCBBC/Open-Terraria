// 城镇宠物三件套常量（2026-08-30 从 Game.ts 抽出共用——快乐度豁免/对话按钮/台词池
// 多处消费；单源避免循环依赖）
// NPCID.Sets.IsTownPet（NPCID.cs:4446）：城镇猫/狗/兔 + 八只城镇史莱姆
export const TOWN_PET_VIDS = new Set<number>([637, 638, 656, 670, 678, 679, 680, 681, 682, 683, 684]);

/** GetPettingInfo 站距表（NPC.cs:81685-81717）：小宠按型缩距，狗等大型 =36 */
export const TOWN_PET_PETTING: Record<number, { reach: number; small: boolean }> = {
  637: { reach: 28, small: true },   // 猫
  638: { reach: 36, small: false },  // 狗
  656: { reach: 24, small: true },   // 兔
  670: { reach: 26, small: true },   // 蓝(宅)
  678: { reach: 26, small: true },   // 绿(酷)
  679: { reach: 26, small: true },   // 老
  680: { reach: 26, small: true },   // 紫(笨)
  681: { reach: 26, small: true },   // 彩虹(歌姬)
  682: { reach: 22, small: true },   // 红(闷)
  683: { reach: 26, small: true },   // 黄(秘)
  684: { reach: 20, small: true },   // 铜(侍从)
};

/** Lang.GetSlimeType（Lang.cs:377-403）：城镇史莱姆 vid → Chatter 分类名段 */
export const TOWN_SLIME_CHATTER: Record<number, string> = {
  670: 'Blue', 678: 'Green', 679: 'Old', 681: 'Rainbow',
  680: 'Purple', 682: 'Red', 683: 'Yellow', 684: 'Copper',
};
