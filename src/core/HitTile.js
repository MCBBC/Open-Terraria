export class HitTile {
    constructor() {
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
    }
    /** 命中目标格：积累伤害并重置 TTL。返回积累后的伤害值 */
    addDamage(x, y, amount, type = 1) {
        const key = `${x},${y},${type}`;
        let e = this.data.get(key);
        if (!e) {
            // 容量控制：超过上限淘汰最旧条目（原版环形缓冲的等价行为）
            if (this.data.size >= HitTile.CAP) {
                const oldest = this.data.keys().next().value;
                if (oldest !== undefined)
                    this.data.delete(oldest);
            }
            e = { damage: 0, ttl: HitTile.TTL };
            this.data.set(key, e);
        }
        e.damage += amount;
        e.ttl = HitTile.TTL;
        // 最近使用移到末尾（LRU 语义）
        this.data.delete(key);
        this.data.set(key, e);
        return e.damage;
    }
    /** 读取当前积累伤害（不改 TTL） */
    getDamage(x, y, type = 1) {
        return this.data.get(`${x},${y},${type}`)?.damage ?? 0;
    }
    /** 清除指定格（破坏完成/格已空时调用） */
    clear(x, y, type = 1) {
        this.data.delete(`${x},${y},${type}`);
    }
    clearAll() {
        this.data.clear();
    }
    /** 每帧衰减（原版 HitTile.Prune 分档） */
    update() {
        for (const [key, e] of [...this.data]) {
            e.ttl--;
            if (e.ttl <= 1) {
                this.data.delete(key);
                continue;
            }
            if (e.ttl < 12)
                e.damage -= 10;
            else if (e.ttl < 24)
                e.damage -= 7;
            else if (e.ttl < 36)
                e.damage -= 5;
            else if (e.ttl < 48)
                e.damage -= 2;
            if (e.damage < 0)
                this.data.delete(key);
        }
    }
}
Object.defineProperty(HitTile, "CAP", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 500
});
Object.defineProperty(HitTile, "TTL", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 60
});
