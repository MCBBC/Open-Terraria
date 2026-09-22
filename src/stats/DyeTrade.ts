// 奇异植物换染料（Player.GetDyeTraderReward，Player.cs:55743-55779 1:1）：
//   基础池 14 + hardMode 8 + downedMechBossAny 4 + downedPlantBoss 4
//   + downedMartians 2 + downedMoonlord 1（顺序即 list.Add 序）→ 均匀随机一条
//   → stack=6 QuickSpawnItem。
//   触发链 = Main.NPCChatText_DyeTraderRarePlant（Main.cs:39411-39429）：背包
//   FindItem(ExoticPlantsForDyeTrade 3385-3388) 命中 → stack--（0 删格）+ 音效 24
//   + GetDyeTraderReward；未命中只出 NoPlant 台词。按钮门 =
//   NPCInteractions.DyeTraderRarePlant.Condition（:446-452）：TalkNPCType==207
//   && Main.hardMode（未入 hardMode 无按钮——肉前奇异植物无处消耗是原版设计）。
//   台词 = Lang.DyeTraderQuestChat（Lang.cs:296-300）：DyeTraderSpecialText.
//   HasPlant/NoPlant 前缀随机各 3 条。


/** 换染料档位门（GetDyeTraderReward :55748-55775 逐档） */
export interface DyeTraderRewardGates {
  hardMode: boolean;
  /** NPC.downedMechBossAny */
  downedMechBossAny: boolean;
  /** NPC.downedPlantBoss */
  downedPlantBoss: boolean;
  /** NPC.downedMartians */
  downedMartians: boolean;
  /** NPC.downedMoonlord */
  downedMoonlord: boolean;
}

/** 池构造 1:1（:55746-55774）——基础 14 件的顺序即原版 List 初始化序 */
export function dyeTraderRewardPool(g: DyeTraderRewardGates): number[] {
  const list = [
    3560, 3028, 3041, 3040, 3025, 3190, 3027, 3026, 3554, 3553,
    3555, 2872, 3534, 2871,
  ];
  if (g.hardMode) {
    list.push(3039, 3038, 3598, 3597, 3600, 3042, 3533, 3561);
    if (g.downedMechBossAny) list.push(2883, 2869, 2873, 2870);
    if (g.downedPlantBoss) list.push(2878, 2879, 2884, 2885);
    if (g.downedMartians) list.push(2864, 3556);
    if (g.downedMoonlord) list.push(3024);
  }
  return list;
}

/** 掷奖 1:1（:55776-55778）：list[Next(count)]，stack=6 */
export function rollDyeTraderReward(g: DyeTraderRewardGates, rand: () => number = Math.random): { id: number; stack: number } {
  const pool = dyeTraderRewardPool(g);
  return { id: pool[Math.floor(rand() * pool.length)], stack: 6 };
}

/** ItemID.Sets.ExoticPlantsForDyeTrade（ItemID.cs:1108）：奇异植物四色 */
export const EXOTIC_PLANT_ITEMS = [3385, 3386, 3387, 3388] as const;

import { ITEM_DEFS } from '../data/items';

/** Player.FindItem(types)（Player.cs:55029-55039）：0-57 首个 stack>0 命中槽；无 -1 */
export function findExoticPlantSlot(slots: ReadonlyArray<{ id: number; stack: number } | null>): number {
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s && s.stack > 0 && (EXOTIC_PLANT_ITEMS as readonly number[]).includes(ITEM_DEFS[s.id]?.vid ?? -1)) return i;
  }
  return -1;
}
