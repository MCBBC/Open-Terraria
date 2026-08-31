/**
 * Player.hurtCooldowns 分桶最小忠实建模（对齐清零批 ③ WrongBugNet）。
 *
 * vanilla 链（Terarria1457）：
 *  · 表体：`public int[] hurtCooldowns = new int[ImmunityCooldownID.Count]`
 *    （Player.cs:3143）；逐 tick 无条件递减（Player.cs:19003-19009，
 *    Update 内 immuneAlpha 块之后——与 General 桶 `immune/immuneTime` 独立走表）。
 *  · 受伤门：`bool flag = (cooldownCounter == ImmunityCooldownID.General)
 *    ? (!immune) : (hurtCooldowns[cooldownCounter] <= 0)`（Hurt 入口 :38493）
 *    ——General 走旧 immune 位；其余桶各查各的计时，互不共享。
 *  · 命中后写入：`else if ((hurtCooldowns[cooldownCounter] == 0) | flag2)`
 *    → `hurtCooldowns[cooldownCounter] = num10`（:38680-38683）；num10 =
 *    pvp ? 8 : (实扣≠1 ? (longInvince?80:40) : (longInvince?40:20))（:38674）。
 *  · 全量置位：SetImmuneTimeForAllTypes（:38298-38306，圣骑士盾等）也把所有桶
 *    同步写满。
 * 调用点（本批范围内）：木网捕熔岩饵料自伤
 *   `Hurt(…, ImmunityCooldownID.WrongBugNet)`（ItemCheck_CatchCritters :45097-45103
 *   ——1457 为 :45099）→ 实扣>0 && !dead 才 AddBuff(24,300)。
 *
 * 范围铁律：只落 WrongBugNet 与 General 两桶的实际消费面并【预留】全部枚举位
 * （BossNoCheese/Lava/PaladinsShield/TileContactDamage 的调用点不在此批拉入——
 * Lava 已由 Player.ts 岩浆链独立承载、BossNoCheese 桌面语义未建模，勿冒进接错域）。
 */

/** Terraria.ID.ImmunityCooldownID（Terarria1457/Terraria.ID/ImmunityCooldownID.cs:
 *  62-75）字段值逐一对齐——运行时 key 即原版 int。 */
export const ImmunityCooldownID = {
  /** -1：player.immune/immuneTime 经典桶（敌人接触 8t 语义保留在 Player.damage，
   *  不经本表路由） */
  General: -1,
  TileContactDamage: 0,
  BossNoCheese: 1,
  LegacyUnused2: 2,
  /** 3：WrongBugNet——普通虫网(1991)硬碰熔岩饵料族（4845 地狱蝴蝶/4847 熔岩蝇/
   *  4849 熔岩蜗牛）自伤节流桶 */
  WrongBugNet: 3,
  /** 4：岩浆接触（Lava 桶，vanilla 由 :27889/:27918 使用——本仓仍由 Player 岩浆链
   *  承载，此键仅预留占位防冒号错档） */
  Lava: 4,
  PaladinsShield: 5,
} as const;

export type ImmunityCooldownId = typeof ImmunityCooldownID[keyof typeof ImmunityCooldownID];

/** vanilla Count=6（非负桶数；General=-1 在数组之外单走 immune 位）。 */
export const IMMUNITY_COOLDOWN_COUNT = 6;

/**
 * 按 ID 独立计时的受伤冷却桶。数值语义：
 *  · remaining(id) > 0 ⇒ 该桶处于无敌窗内（对应 Hurt 返回 0.0 的早退支 :38495-38498）。
 *  · set(id,ticks) 只在「该桶当前为 0」时覆盖（:38680-38682 的 `==0 | flag2` 门；
 *  flag2=远端玩家镜像面，单机恒 false 不建模）。
 */
export class HurtCooldownBuckets {
  private table = new Map<number, number>();

  remaining(id: number): number {
    return this.table.get(id) ?? 0;
  }

  /** :38493 门等价——General 恒 false（其免疫位在 Player.damage 内部）。
   *  入参放宽为 number：调用面（Player.damage 分桶门）经瞬态通道携带原版 int id。 */
  blocksHit(id: number): boolean {
    return this.remaining(id) > 0;
  }

  /** :38680-38683 写入形（仅空位可写）。 */
  applyAfterHit(id: number, ticks: number): void {
    if (!this.table.has(id) || (this.table.get(id) ?? 0) <= 0) {
      this.table.set(id, ticks);
    }
  }

  /** :19003-19009 每 tick 递减。 */
  tick(): void {
    for (const [k, v] of this.table) {
      if (v <= 1) this.table.delete(k);
      else this.table.set(k, v - 1);
    }
  }

  clear(): void {
    this.table.clear();
  }
}

/**
 * num10 折算（Player.cs:38674 单行三元展开；只取本地非 pvp 支）：
 * 实扣 == 1 → longInvince ? 40 : 20；实扣 != 1 → longInvince ? 80 : 40。
 * WrongBugNet 原始伤害恒 1 ⇒ 常规路径落在 20/40 档。
 */
export function hurtImmunityFrames(actualDamageTaken: number, longInvince: boolean): number {
  const one = actualDamageTaken === 1;
  return one ? (longInvince ? 40 : 20) : (longInvince ? 80 : 40);
}
