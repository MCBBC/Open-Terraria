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
 * 范围铁律：消费面已扩至 WrongBugNet(3)/Lava(4)/TileContactDamage(0)/BossNoCheese(1)/
 * LegacyUnused2(2)（岩浆/触格=环境站注入、Boss 族+食人魔近挥窗=接触链注入——见下方
 * ★Notes⑤ 与 LegacyUnused2 段）；PaladinsShield(5) 仅语义位预留（调用点不在此批拉入）。
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

  /** ★F13（2026-08-31 蓝队三批）SetImmuneTimeForAllTypes 桶表满填（Player.cs:
   *  38298-38306）：`immune=true; immuneTime=time; for(i..) hurtCooldowns[i]=time;`
   *  ——无 "仅空位" 门，无条件覆写（区别于 applyAfterHit 的 :38680 形）。
   *  ★Notes③（四轮蓝队）调用面五站勘误——原文 SetImmuneTimeForAllTypes 全部
   *  调用位：①DoMysticSashDodge :38344（神秘艺术腰布）/ ②NinjaDodge :38406
   *  （黑带·忍者大师装备）/ ③BrainOfConfusionDodge :38333（混乱之脑）/
   *  ④ShadowDodge :38310（**buff 59 幻影闪避**——此前误记成第四站缺名）/
   *  ⑤ApplyLifeAndOrMana 诡药 3001 支 :52551（**随机 i-帧档**, 第四站≠药水族,
   *  第五站才是诡药）。WrongBugNet 与 Lava 等窗一并覆盖（满填语义即含全部特殊桶）。 */
  setAll(ticks: number): void {
    for (let i = 0; i < IMMUNITY_COOLDOWN_COUNT; i++) this.table.set(i, ticks);
  }

  clear(): void {
    this.table.clear();
  }
}

export function hurtImmunityFrames(actualDamageTaken: number, longInvince: boolean): number {
  const one = actualDamageTaken === 1;
  return one ? (longInvince ? 40 : 20) : (longInvince ? 80 : 40);
}

// ---- ★F13 全局桶表登记（闪避族 SetImmuneTimeForAllTypes 满填通道） ----------------
// 桶表归 Game 级所有（player 不建第二份）；四个闪避/药水站在 Player.damage 内无
// game 钩子 → Game 构造期把表登记到模块级，闪避站经 getGlobalHurtBuckets() 取用。
let GLOBAL_HURT_BUCKETS: HurtCooldownBuckets | null = null;

/** Game 在创建桶表后调用（重复调用以最后一次为准）。 */
export function registerGlobalHurtBuckets(t: HurtCooldownBuckets | null): void {
  GLOBAL_HURT_BUCKETS = t;
}

/** 未绑定（纯单元测/极早期）返回 null——闪避站此时只落 iframes 面。 */
export function getGlobalHurtBuckets(): HurtCooldownBuckets | null {
  return GLOBAL_HURT_BUCKETS;
}

// ---- ★Notes⑤ 前半（2026-08-31 四轮蓝队）：NPC 接触分桶族 BossNoCheese ----------------
// Update_NPCCollision（Player.cs:31570-31587）：specialHitSetter 缺省 General，
// 接触敌怪 type ∈ {396,397,398,400,401} → ImmunityCooldownID.BossNoCheese(1)；
// 636 → BossNoCheese 且 ai[0]==0||10 时【整段 continue】（不判定不受伤）。
// 该族同时跳过 :31588 的 `(General && immune)` 早退 → 通用无敌帧吞不掉本桶命中，
// 免疫改由 Hurt 入口的 hurtCooldowns[1] 独立计时承担（分域不互吞）。
/** BossNoCheese 接触桶成员表（月总肢体族 + 真眼 400；400 本身接触盒清空,
 *  :96142-96145，入表只为 specialHitSetter 分道完整性）。 */
export const BOSS_NO_CHEESE_CONTACT_IDS = new Set<number>([396, 397, 398, 400, 401, 636]);

/**
 * NPC 接触伤应走哪个免疫桶：General(-1)=常规 / 1=BossNoCheese / 2=LegacyUnused2。
 * 返回 null = 原文 `continue`（连命中判定都不进）。
 *
 * ★LegacyUnused2 档（2026-08-31 GetMeleeCollisionData 玩家接触侧收口）：576/577
 * DD2 食人魔在 FindFrame 近挥帧窗（NPC.cs:96185-96235，frame.Y∈{15,16,17,18}，
 * 帧 id 由渲染端 dd2OgreNextFrame 维护）把 ref specialHitSetter 覆写为 2 ——
 * 【先于相交判定】置位：近挥窗内擦到普通盒也走本桶，与 BossNoCheese 表互斥类型
 * （vanilla 对同一怪两处覆盖不叠乘，GetMeleeCollisionData 后写赢）。门形=
 * `flag3 = hurtCooldowns[specialHitSetter]==0`（:31630-31633），写入 :38680 同槽。
 */
export function npcContactBucketId(
  vanillaId: number, ai0: number, frameY?: number | null,
): number | null {
  if (vanillaId === 636) {
    return (ai0 === 0 || ai0 === 10) ? null : ImmunityCooldownID.BossNoCheese;
  }
  if ((vanillaId === 576 || vanillaId === 577) && frameY != null
    && frameY >= 15 && frameY <= 18) {
    return ImmunityCooldownID.LegacyUnused2;
  }
  if (BOSS_NO_CHEESE_CONTACT_IDS.has(vanillaId)) return ImmunityCooldownID.BossNoCheese;
  return -1;
}
