// 原版劈砍/挖掘伤害积累系统：Terraria1456/HitTile.cs 移植。
// 维护语义 = 原版 Prune 全式（2026-08-25 对齐，取代 R4-47 墙钟近似）：
//   原版【无墙钟驱动】——Prune 只挂在每次【非零伤害】挥击之后（Player.cs:45083 锤支/
//   :45150 斧支/:45351 锤墙/:52902 镐支，统一 if(damage!=0) hitTile.Prune()）。
//   正被敲的格 AddDamage 即刷新 ttl=60，恒高于衰减阶梯(<48 才扣)，故持续挖到破
//   零衰减、两边逐位一致；离手进度冻结（原版同），仅被后续任意挥击逐击衰减。
//   2026-08-13"铜镐永远挖不满 100"事故根因 = 当年把分档衰减挂上墙钟节奏逐 tick 跑，
//   非本语义本身——挥击驱动下命中格恒被刷新，不可能复现该事故。
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

  /** 清除指定格（破坏完成/格已空时调用；原版 ClearMiningCacheAt → TryClearingAndPruning
   *  Player.cs:52924-52928 同语义） */
  clear(x: number, y: number, type = 1) {
    this.data.delete(`${x},${y},${type}`);
  }

  clearAll() {
    this.data.clear();
  }

  /** 原版 Prune 全式（HitTile.cs:191-249）：挂在每次非零伤害挥击后调用（挂点见文件头）。
   *  逐条目：ttl≤1 清除；否则 ttl-- 后按档扣 damage（<12/-10 <24/-7 <36/-5 <48/-2）；
   *  damage<0 清除；tile 类条目在格已非 active 时清除、wall 类条目在墙清零时清除
   *  （else-if 链序与原版一致：tile 条目不做墙检查）。回调由宿主注入（保持本类零依赖）。 */
  prune(tileActive: (x: number, y: number) => boolean, wallNonzero: (x: number, y: number) => boolean): void {
    for (const [key, e] of this.data) {
      if (e.ttl <= 1) { this.data.delete(key); continue; }
      e.ttl--;
      if (e.ttl < 12) e.damage -= 10;
      else if (e.ttl < 24) e.damage -= 7;
      else if (e.ttl < 36) e.damage -= 5;
      else if (e.ttl < 48) e.damage -= 2;
      const p = key.split(',');
      const x = +p[0], y = +p[1], type = +p[2];
      if (e.damage < 0 || (type === 1 && !tileActive(x, y)) || (type === 2 && !wallNonzero(x, y))) {
        this.data.delete(key);
      }
    }
  }
}
