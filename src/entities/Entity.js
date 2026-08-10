export class Entity {
    constructor() {
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "x", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "y", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        }); // 左上角 px
        Object.defineProperty(this, "w", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 16
        });
        Object.defineProperty(this, "h", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 16
        });
        Object.defineProperty(this, "vx", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "vy", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "dead", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "onGround", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "hitWall", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "hitHead", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "dropThrough", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
    }
    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    aabbOverlaps(o) {
        return this.x < o.x + o.w && this.x + this.w > o.x && this.y < o.y + o.h && this.y + this.h > o.y;
    }
}
/** 就地剔除 dead 实体(保持顺序,零分配) */
function compact(list) {
    let w = 0;
    for (let r = 0; r < list.length; r++) {
        const e = list[r];
        if (!e.dead)
            list[w++] = e;
    }
    list.length = w;
}
export class EntityManager {
    constructor() {
        Object.defineProperty(this, "nextId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1
        });
        Object.defineProperty(this, "enemies", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "drops", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "npcs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "projectiles", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "props", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        }); // 场景物件（墓碑等不可拾取物理实体）
        Object.defineProperty(this, "critters", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        }); // 小动物（无害被动生物）
    }
    add(e, bucket) {
        e.id = this.nextId++;
        this[bucket].push(e);
    }
    update(dt, game) {
        // 就地压缩替代 6×filter(2026-08 审计 G9:每 tick 6 个新数组,60Hz 恒定分配)
        for (const list of [this.enemies, this.drops, this.npcs, this.projectiles, this.props, this.critters]) {
            for (const e of list)
                e.fixedUpdate(dt, game);
            compact(list);
        }
    }
    clear() {
        this.enemies.length = 0;
        this.drops.length = 0;
        this.npcs.length = 0;
        this.projectiles.length = 0;
        this.props.length = 0;
        this.critters.length = 0;
    }
    all() {
        return [...this.enemies, ...this.drops, ...this.npcs, ...this.projectiles, ...this.props, ...this.critters];
    }
}
