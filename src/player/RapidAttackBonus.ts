// ★R2-01（蓝队二轮）Player.ApplyRapidAttackBonus 忠实移植（对齐清零批）。
//
// 权威原文：Terarria1457/Terraria/Player.cs:18367-18389
//   public int ApplyRapidAttackBonus(int damage, int itemType, bool increaseBonus = false)
//   {
//       if (!ItemID.Sets.RapidAttackBonusDamage[itemType]) return damage;
//       float num = 0.5f;                     // 上限（生效封顶）
//       float num2 = 0.12f;                   // 每次命中增量
//       float num3 = rapidAttackBonus;
//       if (num3 > num) num3 = num;
//       if (increaseBonus)
//       {
//           rapidAttackBonus += num2;
//           if (rapidAttackBonus > num + num2) rapidAttackBonus = num + num2;
//       }
//       return (int)((float)damage * (1f + num3));
//   }
// 计数衰减（ResetEffects，Player.cs:18392-18401，每 tick）：
//   if (rapidAttackBonus > 0f) { rapidAttackBonus -= 0.005f; if (<0f) = 0f; }
//
// 集合面：ItemID.Sets.RapidAttackBonusDamage（Terarria1457/Terraria.ID/ItemID.cs:70）
//   Factory.CreateBoolSet(false, 2608, 3349, 672)
//   —— 2608 FalconBlade / 3349 DyeTradersScimitar / 672 Cutlass。
// 消费位次：ProcessHitAgainstNPC 开头（Player.cs:44646，TryConsumingTimerCrit/banner/
// parry/BreakerBlade/HamBat/Keybrand 全部乘区【之前】；IncreaseBonus 实参 =
// !nPC.immortal（不朽体不蓄能但本击已生效的加成仍吃）。
import { f32 } from '../stats/ScaleStats';

export const RAPID_ATTACK_BONUS_ITEMS = new Set<number>([2608, 3349, 672]);

const CAP = 0.5;
const STEP = 0.12;

/** rapidAttackBonus 玩家侧状态载体（原版 float 字段）。 */
export interface RapidBonusState {
  value: number;
}

export function newRapidBonusState(): RapidBonusState {
  return { value: 0 };
}

/** 原版函数 1:1。increaseBonus = !NPC.immortal 调用语义由调用方传入。 */
export function applyRapidAttackBonus(
  state: RapidBonusState, damage: number, itemType: number, increaseBonus = false,
): number {
  if (!RAPID_ATTACK_BONUS_ITEMS.has(itemType)) return damage;
  let num3 = state.value;
  if (num3 > CAP) num3 = CAP;                       // :18377-18378 生效侧钳制
  if (increaseBonus) {
    // :18380-18385 蓄能侧上限 = num + num2 = 0.62（比生效上限高一档——连击中下一
    // 击仍保持满档 0.5，不会在两次命中之间回落）
    const next = Math.min(CAP + STEP, state.value + STEP);
    state.value = next;
  }
  return Math.trunc(f32(f32(damage) * f32(1 + num3)));   // :18388 (int)((float)d*(1f+n))
}

/** ResetEffects 每帧衰减（:18392-18401）：-0.005/tick 到 0 为止。 */
export function decayRapidAttackBonus(state: RapidBonusState): void {
  if (state.value > 0) {
    state.value = Math.max(0, f32(state.value - 0.005));
  }
}
