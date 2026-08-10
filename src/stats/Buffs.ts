// Buff 系统（移植自 Maples 的 Buff 三段生命周期，改为幂等属性聚合）
// 数值来源：Assets/Scripts/Buff/impl/*.cs 与 Potions/*.asset
// 名称/描述走原版 l10n(M8):BuffName.<Internal> + 自有 Mods.SandboxWorld.Buff.* 描述
import { Lang } from '../i18n/Lang';

export enum BuffType {
  Agility = 0,    // 敏捷：移速 +25%（180s）→ Swiftness(3)
  Ironskin = 1,   // 铁皮：防御 +6（180s）→ Ironskin(5)
  Resistance = 2, // 耐药性：立即回 80 HP，期间禁用治疗药水（60s）→ PotionSickness(21)
  Thorns = 3,     // 荆棘：受击反弹 2 伤害（180s）→ Thorns(14)
  Regen = 4,      // 恢复：每 5 秒 +10 HP（30s）→ Regeneration(2)
  Campfire = 5,   // 篝火：范围光环(由附近篝火/心灯实体驱动,Game 每帧续期) → Campfire(87)
}

export const BUFF_DEFS: Record<BuffType, { vanillaBuff: number; descKey: string; fallbackName: string }> = {
  [BuffType.Campfire]: { vanillaBuff: 87, descKey: 'Mods.SandboxWorld.Buff.Campfire.Desc', fallbackName: '篝火' },
  [BuffType.Agility]: { vanillaBuff: 3, descKey: 'Mods.SandboxWorld.Buff.Agility.Desc', fallbackName: '敏捷' },
  [BuffType.Ironskin]: { vanillaBuff: 5, descKey: 'Mods.SandboxWorld.Buff.Ironskin.Desc', fallbackName: '铁皮' },
  [BuffType.Resistance]: { vanillaBuff: 21, descKey: 'Mods.SandboxWorld.Buff.Resistance.Desc', fallbackName: '耐药性' },
  [BuffType.Thorns]: { vanillaBuff: 14, descKey: 'Mods.SandboxWorld.Buff.Thorns.Desc', fallbackName: '荆棘' },
  [BuffType.Regen]: { vanillaBuff: 2, descKey: 'Mods.SandboxWorld.Buff.Regen.Desc', fallbackName: '恢复' },
};

/** Buff 名:原版 BuffName.<Internal>(Lang 未就绪回退中文兜底) */
export function buffName(t: BuffType): string {
  return Lang.buffName(BUFF_DEFS[t].vanillaBuff) ?? BUFF_DEFS[t].fallbackName;
}

/** Buff 描述:自有键(机制数值是本仓库实现,不用原版通用描述) */
export function buffDesc(t: BuffType): string {
  return Lang.text(BUFF_DEFS[t].descKey);
}

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
