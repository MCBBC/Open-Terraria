// ★R2-06⑤（蓝队二轮）甲虫套装蓄能实扣模型（替代时间蓄能近似）。
//
// vanilla 计数域（Terarria1457/Terraria/Player.cs）：
//  · 命中加账【PVE】ApplyNPCOnHitEffects :44840-44
//      if (beetleOffense & !npc.immortal) { beetleCounter += dmgDone; beetleCountdown = 0; }
//    dmgDone = StrikeNPC 返回值 = 本拍实扣 HP（仓内对应 Enemy.lastStrikeDealt）。
//  · 命中加账【PvP】ItemCheck_MeleeHitPVP :44456-44460
//      if (beetleOffense) { beetleCounter += num2; beetleCountdown = 0; }
//  · 逐 tick 消费 ApplySetBonus_BeetleDamage :16619-16691（进攻套在身每 tick）：
//      beetleCounter -= 3f;
//      beetleCounter -= beetleCountdown / 20;     // int/int 截断
//      beetleCountdown++;
//      if (<0) = 0;
//      clamp ≤ 400+1200+3600+1200 = 6400;
//      num = counter>5200?3 : >1600?2 : >400?1 : 0   （AddBuff 100/99/98 层）
//      if (num < beetleOrbs) beetleCountdown = 0;
//      else if (num > beetleOrbs) beetleCounter += 200f;
//      （AddBuff(97+num,5)/DelBuff 清层为 buff 面的维持管道，可观察结果 = 球数）
//  · 防御套独立臂 ApplySetBonus_BeetleDefense :16596-16617：
//      beetleCounter++；≥180 且 orbs<3 → orbs+1、counter=0（满 3 时钉在 180）
//  · 受击减球 Player.Hurt :38608-38623：beetleDefense && orbs>0 → endurance += .15n、
//      orbs--、beetleCounter=0f（防御消费清空蓄能——防御侧承管）。
//  · 套离身：原版靠 buff 95-100 的 5t 刷新窗断供过期 → 记 orbLife=5t 到期 orbs=0。
//
// 旧时间蓄能近似（Player.fixedUpdate lastMeleeTick/beetleCharge 90t/球 + onMeleeHit
// 刷窗口）退役路径：Game 近战管线不再调 player.onMeleeHit()，改由本 meter 消费命中。
// Player.fixedUpdate 的旧支因 lastMeleeTick 恒 0 而惰性失效，不构成双写。

/** 单实例状态（挂在玩家对象上；本模块无 DOM/引擎依赖）。 */
export class BeetleMeter {
  /** beetleCounter（float 字段 :881） */
  private counter = 0;
  /** beetleCountdown（int 字段 :883） */
  private countdown = 0;
  /** 球 5t 续命（buffTime[j]=5 维持窗等价形）：任一套在身的 tick 刷新为 5 */
  private orbLife = 0;

  private readOrbs(p: BeetleHost): number {
    return p.beetleOrbs ?? 0;
  }
  private writeOrbs(p: BeetleHost, v: number): void {
    if ((p.beetleOrbs ?? 0) !== v) p.beetleOrbs = v;
  }

  /** PVE/PvP 命中加账（:44840-44/:44456-60）。immortal 门由调用方按 !npc.immortal
   *  传入 pass=true 才记账。 */
  registerHit(dmgDone: number, offenseSet: boolean): void {
    if (!offenseSet) return;
    this.counter += dmgDone;
    this.countdown = 0;
  }

  /** 每 tick 梯子（原版两函数合并调度；defense 臂与 offense 臂共享 counter 字段，
   *  与原版同域）。player 宿主须暴露 beetleOrbs 数值面。 */
  tick(p: BeetleHost, offenseSet: boolean, defenseSet: boolean): void {
    const orbs = this.readOrbs(p);
    if (offenseSet) {
      // ApplySetBonus_BeetleDamage :16622-16691
      this.counter -= 3;
      this.counter -= Math.trunc(this.countdown / 20);
      this.countdown++;
      if (this.counter < 0) this.counter = 0;
      const CAP_TOTAL = 400 + 1200 + 3600 + 1200;
      if (this.counter > CAP_TOTAL) this.counter = CAP_TOTAL;
      let num = 0;
      if (this.counter > 400 + 1200 + 3600) num = 3;
      else if (this.counter > 400 + 1200) num = 2;
      else if (this.counter > 400) num = 1;
      if (num < orbs) this.countdown = 0;          // :16678-16680 掉层重置消散计数
      else if (num > orbs) this.counter += 200;    // :16682-16684 升层补贴
      this.writeOrbs(p, num);                      // AddBuff(97+num,5) 可观察面
      this.orbLife = 5;                            // buffTime[j]=5 维持窗
    } else if (defenseSet) {
      // ApplySetBonus_BeetleDefense :16596-16617
      this.counter++;
      const T = 180;
      if (this.counter >= T) {
        const o = this.readOrbs(p);
        if (o < 3) {
          this.writeOrbs(p, o + 1);
          this.counter = 0;
        } else {
          this.counter = T;                        // 满 3 钉住（不累计溢出）
        }
      }
      this.orbLife = 5;
    } else {
      // 双套不在身：buff 断供过期（5t 维持窗走完 orbs=0）；counter 冻结
      // （原版无显式清零点——UpdateArmorSets 不调两臂即静态保留到重入）
      if (this.readOrbs(p) > 0 && --this.orbLife <= 0) this.writeOrbs(p, 0);
    }
  }

  /** 防御消费清零（Hurt :38612 beetlerCounter=0f 的调用侧桥；由 Game.damagePlayer
   *  后续接线消费——此处提供 API 保持单一来源）。 */
  resetCounter(): void {
    this.counter = 0;
  }

  stateForTest(): { counter: number; countdown: number } {
    return { counter: this.counter, countdown: this.countdown };
  }
}

export interface BeetleHost {
  beetleOrbs?: number;
}
