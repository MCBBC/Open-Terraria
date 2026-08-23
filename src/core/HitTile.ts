// 原版劈砍/挖掘伤害积累系统：Terraria1457/HitTile.cs 移植。
// 每次挥击对目标格积累伤害（阈值 100 破坏）。★R4-47 差异备案（2026-08-23 蓝队复核）：
//   原版 Prune 在【每次挖掘挥击伤害非零后】调用（Player.cs:46086-46088 等）,Prune 内
//   按 ttl 分档渐次扣 damage（<12→-10、<24→-7、<36→-5、<48→-2、<=1 清除）——半挖离手
//   后进度在约 60 次别处挥击内渐次流失;本仓=墙钟每 2 tick 仅清 ttl 到期条目、damage
//   不衰减（分档衰减曾致铜镐永远挖不满 100,2026-08-13 实锤后裁决砍掉）。持续挖到破
//   路径两边逐位一致;离手衰减节奏不同=已裁决可接受近似。
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

  /** 条目数（F5 调试报告 / 泄漏排查） */
  size(): number { return this.data.size; }

  /** 按插入序取前 n 条（F5 调试报告 Top 条目转储） */
  dumpTop(n: number): Array<{ x: number; y: number; type: number; damage: number; ttl: number }> {
    const out: Array<{ x: number; y: number; type: number; damage: number; ttl: number }> = [];
    let i = 0;
    for (const [key, e] of this.data) {
      if (i++ >= n) break;
      const p = key.split(',');
      out.push({ x: +p[0], y: +p[1], type: +p[2], damage: e.damage, ttl: e.ttl });
    }
    return out;
  }

  /** 清除指定格（破坏完成/格已空时调用） */
  clear(x: number, y: number, type = 1) {
    this.data.delete(`${x},${y},${type}`);
  }

  clearAll() {
    this.data.clear();
  }

  /** 周期维护：仅 TTL 到期清条目（停止攻击 ~2×TTL tick 后清进度）。
   *  ★R4-47：原版无墙钟衰减——Prune 挂在每次挥击后（见文件头差异备案）;
   *  分档衰减 damage 曾是自创近似且速率超过铜镐积累速率 = 镐斧全体无法挖掘
   *  （2026-08-13 铜镐实锤后裁决砍掉,维持墙钟清到期条目的近似） */
  update() {
    // Map 迭代中删除"当前条目"是安全的(迭代器已越过它),无需整表快照拷贝
    // ——此前 [...this.data] 每 tick 拷最多 500 条的分配税
    for (const [key, e] of this.data) {
      e.ttl--;
      if (e.ttl <= 1) this.data.delete(key);
    }
  }
}
