// Buff 系统（移植自 Maples 的 Buff 三段生命周期，改为幂等属性聚合）
// 数值来源：Assets/Scripts/Buff/impl/*.cs 与 Potions/*.asset
export enum BuffType {
  Agility = 0,    // 敏捷：移速 +25%（180s）
  Ironskin = 1,   // 铁皮：防御 +6（180s）
  Resistance = 2, // 耐药性：立即回 80 HP，期间禁用治疗药水（60s）
  Thorns = 3,     // 荆棘：受击反弹 2 伤害（180s）
  Regen = 4,      // 恢复：每 5 秒 +10 HP（30s）
  Campfire = 5,   // 篝火：范围光环(由附近篝火/心灯实体驱动,Game 每帧续期)
}

export const BUFF_DEFS: Record<BuffType, { name: string; desc: string }> = {
  [BuffType.Campfire]: { name: '篝火', desc: '附近篝火:每秒回 1 HP(心灯再+1)' },
  [BuffType.Agility]: { name: '敏捷', desc: '移动速度 +25%' },
  [BuffType.Ironskin]: { name: '铁皮', desc: '防御 +6' },
  [BuffType.Resistance]: { name: '耐药性', desc: '生命上限 +80，无法使用治疗药水' },
  [BuffType.Thorns]: { name: '荆棘', desc: '受击时反弹 2 点伤害' },
  [BuffType.Regen]: { name: '恢复', desc: '每 5 秒回复 10 点生命' },
};

export class BuffState {
  active = new Map<BuffType, number>(); // 剩余秒
  regenAccum = 0;
  campfireAccum = 0;
  lanternAccum = 0;
  /** 当前篝火光环强度(Game 每 20tick 扫描写入:篝火+1,心灯额外+1) */
  campfireHeal = 1;
  /** 心灯(lifeRegen+2 = 1 HP/s,Player.cs:12247):Game 扫描写入 0/1 */
  lanternHeal = 0;
  /** 重置为满时长（叠加 = 刷新，效果幂等） */
  apply(type: BuffType, durationSec: number) {
    this.active.set(type, durationSec);
  }
  has(type: BuffType): boolean {
    return this.active.has(type);
  }
  remove(type: BuffType) {
    this.active.delete(type);
  }
  /** 每逻辑帧（dt 秒）。返回本帧需要回复的生命值 */
  tick(dt: number): number {
    let heal = 0;
    for (const [t, time] of [...this.active]) {
      const left = time - dt;
      if (left <= 0) this.active.delete(t);
      else this.active.set(t, left);
    }
    if (this.active.has(BuffType.Regen)) {
      this.regenAccum += dt;
      if (this.regenAccum >= 5) {
        this.regenAccum -= 5;
        heal += 10;
      }
    }
    if (this.active.has(BuffType.Campfire)) {
      // 原版 lifeRegen+1 = 0.5 HP/s(Player.cs:12244-12245/12310-12324)→ 每 2 秒 1 HP
      this.campfireAccum += dt;
      if (this.campfireAccum >= 2) {
        this.campfireAccum -= 2;
        heal += this.campfireHeal;
      }
    }
    if (this.lanternHeal > 0) {
      this.lanternAccum += dt;
      if (this.lanternAccum >= 1) {
        this.lanternAccum -= 1;
        heal += this.lanternHeal;
      }
    }
    return heal;
  }
  // ---- 属性聚合（幂等读取，不做副作用写入）----
  get moveSpeedMult(): number {
    return this.active.has(BuffType.Agility) ? 1.25 : 1;
  }
  get defenseBonus(): number {
    return this.active.has(BuffType.Ironskin) ? 6 : 0;
  }
  get healthBonus(): number {
    return this.active.has(BuffType.Resistance) ? 80 : 0;
  }
  get hasThorns(): boolean {
    return this.active.has(BuffType.Thorns);
  }
  get healBlocked(): boolean {
    return this.active.has(BuffType.Resistance);
  }
}
