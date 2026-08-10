// Buff 系统（移植自 Maples 的 Buff 三段生命周期，改为幂等属性聚合）
// 数值来源：Assets/Scripts/Buff/impl/*.cs 与 Potions/*.asset
export var BuffType;
(function (BuffType) {
    BuffType[BuffType["Agility"] = 0] = "Agility";
    BuffType[BuffType["Ironskin"] = 1] = "Ironskin";
    BuffType[BuffType["Resistance"] = 2] = "Resistance";
    BuffType[BuffType["Thorns"] = 3] = "Thorns";
    BuffType[BuffType["Regen"] = 4] = "Regen";
    BuffType[BuffType["Campfire"] = 5] = "Campfire";
})(BuffType || (BuffType = {}));
export const BUFF_DEFS = {
    [BuffType.Campfire]: { name: '篝火', desc: '附近篝火:每秒回 1 HP(心灯再+1)' },
    [BuffType.Agility]: { name: '敏捷', desc: '移动速度 +25%' },
    [BuffType.Ironskin]: { name: '铁皮', desc: '防御 +6' },
    [BuffType.Resistance]: { name: '耐药性', desc: '生命上限 +80，无法使用治疗药水' },
    [BuffType.Thorns]: { name: '荆棘', desc: '受击时反弹 2 点伤害' },
    [BuffType.Regen]: { name: '恢复', desc: '每 5 秒回复 10 点生命' },
};
export class BuffState {
    constructor() {
        Object.defineProperty(this, "active", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        }); // 剩余秒
        Object.defineProperty(this, "regenAccum", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "campfireAccum", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "lanternAccum", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        /** 当前篝火光环强度(Game 每 20tick 扫描写入:篝火+1,心灯额外+1) */
        Object.defineProperty(this, "campfireHeal", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1
        });
        /** 心灯(lifeRegen+2 = 1 HP/s,Player.cs:12247):Game 扫描写入 0/1 */
        Object.defineProperty(this, "lanternHeal", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
    }
    /** 重置为满时长（叠加 = 刷新，效果幂等） */
    apply(type, durationSec) {
        this.active.set(type, durationSec);
    }
    has(type) {
        return this.active.has(type);
    }
    remove(type) {
        this.active.delete(type);
    }
    /** 每逻辑帧（dt 秒）。返回本帧需要回复的生命值 */
    tick(dt) {
        let heal = 0;
        for (const [t, time] of [...this.active]) {
            const left = time - dt;
            if (left <= 0)
                this.active.delete(t);
            else
                this.active.set(t, left);
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
    get moveSpeedMult() {
        return this.active.has(BuffType.Agility) ? 1.25 : 1;
    }
    get defenseBonus() {
        return this.active.has(BuffType.Ironskin) ? 6 : 0;
    }
    get healthBonus() {
        return this.active.has(BuffType.Resistance) ? 80 : 0;
    }
    get hasThorns() {
        return this.active.has(BuffType.Thorns);
    }
    get healBlocked() {
        return this.active.has(BuffType.Resistance);
    }
}
