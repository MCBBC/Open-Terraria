// 原版劈砍/挖掘伤害积累系统：Terraria1405/HitTile.cs 移植。
// 每次挥击对目标格积累伤害（阈值 100 破坏），停止攻击后按 TTL 分档衰减：
//   TTL<48 → -2/帧, <36 → -5, <24 → -7, <12 → -10；归零清除（原版 Prune 语义）
// 槽位用插入序 Map 简化（原版 500 槽 + order 换序，行为等价：最近使用的存活最久）
export interface HitTileEntry { damage: number; ttl: number }

export class HitTile {
  private data = new Map<string, HitTileEntry>();
  private static readonly CAP = 500;
  private static readonly TTL = 60;

  /** 命中目标格：积累伤害并重置 TTL。返回积累后的伤害值 */
  addDamage(x: number, y: number, amount: number, type = 1): number {
    const key = `${x},${y},${type}`;
    let e = this.data.get(key);
    if (!e) {
      // 容量控制：超过上限淘汰最旧条目（原版环形缓冲的等价行为）
      if (this.data.size >= HitTile.CAP) {
        const oldest = this.data.keys().next().value;
        if (oldest !== undefined) this.data.delete(oldest);
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
  getDamage(x: number, y: number, type = 1): number {
    return this.data.get(`${x},${y},${type}`)?.damage ?? 0;
  }

  /** 清除指定格（破坏完成/格已空时调用） */
  clear(x: number, y: number, type = 1) {
    this.data.delete(`${x},${y},${type}`);
  }

  clearAll() {
    this.data.clear();
  }

  /** 每帧衰减（原版 HitTile.Prune 分档） */
  update() {
    for (const [key, e] of [...this.data]) {
      e.ttl--;
      if (e.ttl <= 1) { this.data.delete(key); continue; }
      if (e.ttl < 12) e.damage -= 10;
      else if (e.ttl < 24) e.damage -= 7;
      else if (e.ttl < 36) e.damage -= 5;
      else if (e.ttl < 48) e.damage -= 2;
      if (e.damage < 0) this.data.delete(key);
    }
  }
}
