// Boss 伤害统计（/boss伤害 命令数据层）——Terraria.GameContent/
// NPCDamageTracker.cs + BossDamageTracker.cs 1:1 移植（此前 OldOnesArmy.ts 头注
// 登记"不移植"，本批随聊天命令系统补齐）。
//
// 语义（对照源码行号）：
//   - 每个受追踪 NPC 族一个 tracker（复合 Boss=毁灭者节/双子/月总肢体等共用一个）；
//     CreateTrackerFor：CustomBossDefinitions[type] 或 npc.boss 才建（:154-167）
//   - AddDamage(npc, owner, dmg)：realLife 归主段（GetRealActiveNPC :123-136）；
//     life<=0 早退；伤害 min(dmg, life)（:176-181 + AddDamage :263-268，溢杀不
//     膨胀百分比）；owner 0-254=玩家（按名字聚合 GetOrAddEntry :240-261，改名
//     换人位不继承）、255=世界伤害（陷阱与减益，WorldCreditEntry）
//   - Update（Main.cs:17749 每 tick）：各 tracker 计时；CheckActive——该族 NPC
//     全不在场（NPC.cs:7202-7215 npcsFoundForCheckActive 每帧重扫）即停；
//     停止后非空 tracker 进 RecentAttempts 环（上限 3，:237-245），最旧的在
//     TimeSinceLastHit > 54000t（15 分钟）后出环（:221-227）
//   - BossKilled（NPC.cs:79821 DoDeathEvents_CelebrateBossDeath）：命中 tracker
//     置 _killed——报告用"被击杀"而非"逃脱"文案
//   - GetReport（:285-346）：按伤害降序；百分比 = 最大余数法凑整 100
//     （CalculatePercentages :349-377）；对齐：百分比段左对齐 6 列、伤害段
//     左对齐 8+maxLen 列（等宽列）；本人行包 [c/FFAF00:…] 高亮；
//     击杀耗时 m:ss（Duration/60 秒，TimeSpan.FromSeconds）
import { Lang } from '../i18n/Lang';

/** 贡献条目（CreditEntry :21-59） */
interface CreditEntry { damage: number; kind: 'player' | 'world'; name: string }

/** 受击 NPC 结构视图（Enemy/TownNPC 结构兼容——伤害漏斗直传实体,免逐击建对象） */
export interface TrackerNpcLike {
  vanillaId: number | null;
  hp: number;
  /** realLife 主段（GetRealActiveNPC 归并；null=自身即主体） */
  realLifeHost: TrackerNpcLike | null;
  def?: { boss?: boolean };
}

export interface TrackerHost {
  /** npc id → 显示名（Lang.GetNPCName；复合族名在 BossDamageTracker.Name 覆写） */
  npcName(type: number): string;
}

const MAX_RECENT_TRACKERS = 3;            // :55
const EXTRA_RECENT_TRACKER_EXPIRY_TIME = 54000; // :56

/** 复合 Boss 定义（CustomDefinition :10-14）：多 npc id 共用一个 tracker + 族名覆写 */
interface CompositeDef { types: number[]; name: string | null }

/** RegisterCompositeTypeBoss 登记（static ctor :71-89 逐条） */
const CUSTOM_BOSS_DEFS = new Map<number, CompositeDef>();
/** RegisterMobsForBoss 登记：随从/部件 id → 主 Boss id（:72-88 逐条） */
const BOSS_TYPE_FOR_MOB = new Map<number, number>();

function registerCompositeTypeBoss(name: string | null, ...types: number[]): void {
  const def: CompositeDef = { types, name };
  for (const t of types) CUSTOM_BOSS_DEFS.set(t, def);
}
function registerMobsForBoss(bossType: number, mobTypes: number[]): void {
  for (const m of mobTypes) BOSS_TYPE_FOR_MOB.set(m, bossType);
}

// ---- static ctor 登记（NPCDamageTracker.cs :68-90 原序原参） ----
registerMobsForBoss(50, [1, 535]);
registerMobsForBoss(4, [5]);
registerMobsForBoss(222, [210, 211]);
registerCompositeTypeBoss(null, 13, 14, 15);
registerCompositeTypeBoss(null, 266, 267);
registerCompositeTypeBoss(null, 35, 36);
registerMobsForBoss(113, [115, 116, 117, 118, 119]);
registerMobsForBoss(657, [658, 659, 660]);
registerCompositeTypeBoss('Enemies.TheTwins', 126, 125);
registerCompositeTypeBoss(null, 127, 128, 129, 130, 131);
registerMobsForBoss(134, [139]);
registerMobsForBoss(262, [264]);
registerCompositeTypeBoss(null, 245, 246, 247, 248);
registerMobsForBoss(370, [372, 373]);
registerMobsForBoss(439, [454, 455, 456, 457, 458, 459]);
registerCompositeTypeBoss('Enemies.MoonLord', 398, 396, 397);

/** 单个 Boss 追踪器（BossDamageTracker :5-96） */
class BossTracker {
  private readonly list: CreditEntry[] = [];
  private ticks = 0;
  private lastHitTime = 0;
  private killed = false;

  get isEmpty(): boolean { return this.list.length === 0; }
  /** Duration => _lastHitTime（击杀耗时 = 起始至最后一击的 tick 数） */
  get duration(): number { return this.lastHitTime; }
  get timeSinceLastHit(): number { return this.ticks - this.lastHitTime; }

  private readonly type: number;
  constructor(type: number, private readonly overrides: CompositeDef | null) {
    // 构造器（BossDamageTracker :28-33）：复合族 type 取 NPCTypes[0]（表首=正主）
    this.type = overrides && overrides.types ? overrides.types[0] : type;
  }

  /** Name（BossDamageTracker :16-26）：复合族名覆写 > Lang.GetNPCName(type) */
  displayName(): string {
    if (this.overrides?.name) {
      const key = this.overrides.name;
      return Lang.has(key) ? Lang.text(key) : key;
    }
    return bossDamageHost.npcName(this.type);
  }

  /** KillTimeMessage（:18-20）：killed 只换文案——getReport 内直接取键 */
  /** IncludeDamageFor（:54-68） */
  includeDamageFor(npc: TrackerNpcLike): boolean {
    const type = npc.vanillaId ?? -1;
    if (BOSS_TYPE_FOR_MOB.get(type) === this.type) return true;
    if (!this.overrides) return type === this.type;
    return this.overrides.types.includes(type);
  }

  /** IsActive（:79-95）：族内任一类型在场（npcsFoundForCheckActive 等价） */
  isActive(present: ReadonlySet<number>): boolean {
    if (this.overrides) {
      for (const t of this.overrides.types) if (present.has(t)) return true;
      return false;
    }
    return present.has(this.type);
  }

  onBossKilled(): void { this.killed = true; }   // OnBossKilled（:73-76）
  tick(): void { this.ticks++; }                 // Tick（:261-264）

  /** AddDamage（:266-271）+ GetOrAddEntry（:240-261）：owner=255 = 世界伤害
   *  （陷阱·减益·环境,WorldCreditName"陷阱与减益"）;其余按 ownerName(槽位) 出的
   *  当前名字聚合（-1=本地玩家;改名换人位不继承旧账） */
  add(owner: number, damage: number, ownerName: (slot: number) => string): void {
    this.lastHitTime = this.ticks;
    let entry: CreditEntry;
    if (owner === 255) {
      entry = this.list.find((e) => e.kind === 'world')
        ?? (() => { const w: CreditEntry = { damage: 0, kind: 'world', name: Lang.text('BossDamageCommand.WorldCreditName') }; this.list.push(w); return w; })();
    } else {
      const name = ownerName(owner);
      entry = this.list.find((e) => e.kind === 'player' && e.name === name)
        ?? (() => { const p: CreditEntry = { damage: 0, kind: 'player', name }; this.list.push(p); return p; })();
    }
    entry.damage += damage;
  }

  /** GetReport（:285-346）。forPlayerName：本人行 [c/FFAF00:…] 高亮（null=不高亮） */
  getReport(forPlayerName: string | null): string {
    const entries = [...this.list].sort((a, b) => b.damage - a.damage);
    const damages = entries.map((e) => e.damage);
    const pcts = calculatePercentages(damages);
    const maxLen = String(Math.max(...damages)).length;
    const subs: string[] = [Lang.text('BossDamageCommand.Title', this.displayName())];
    let fmt = '{0}';
    {
      // KillTimeMessage 非空（BossDamageTracker 恒有——killed 分支只换文案）→ 恒加耗时行（:296-303）
      const totalSec = this.duration / 60;
      const m = Math.floor(totalSec / 60);
      const s = Math.floor(totalSec % 60);
      const time = `${m}:${String(s).padStart(2, '0')}`;
      fmt += '\n{1}';
      subs.push(Lang.text(this.killed ? 'BossDamageCommand.KillTime' : 'BossDamageCommand.KillTimeEscaped', time));
    }
    for (let i = 0; i < entries.length; i++) {
      let row = `${pcts[i]}%`;
      while (row.length < 6) row += ' ';
      row += damages[i];
      while (row.length < 8 + maxLen) row += ' ';
      const entry = entries[i];
      let line = row + `{${subs.length}}`;
      subs.push(entry.name);
      if (forPlayerName != null && entry.kind === 'player' && entry.name === forPlayerName) {
        line = `[c/FFAF00:${line}]`;
      }
      fmt += '\n' + line;
    }
    // NetworkText.FromFormattable：{N} 逐位代入
    return fmt.replace(/\{(\d+)\}/g, (_, n) => subs[Number(n)] ?? '');
  }
}

/** CalculatePercentages（:349-377）：向下取整 + 最大余数法凑整到 100 */
function calculatePercentages(damages: number[]): number[] {
  const total = damages.reduce((a, b) => a + b, 0);
  const out = damages.map((d) => Math.trunc((d * 100) / total));
  const rem = damages.map((d) => (d * 100) / total - Math.trunc((d * 100) / total));
  let acc = out.reduce((a, b) => a + b, 0);
  for (; acc < 100; acc++) {
    let best = 0;
    let bestRem = 0;
    for (let k = 0; k < rem.length; k++) {
      if (rem[k] > bestRem) { bestRem = rem[k]; best = k; }
    }
    rem[best] = 0;
    out[best]++;
  }
  return out;
}

// ---- 全局注册表（static 字段 :46-53） ----
let activeTrackers: BossTracker[] = [];
let recentFinished: BossTracker[] = [];
/** owner 槽位 → 名字（Main.player[owner].name；Game 注入） */
const bossDamageHost: TrackerHost & { ownerName?: (slot: number) => string } = {
  npcName: (type) => Lang.npcName(type) ?? `NPC ${type}`,
};

export function bindBossDamageHost(host: Partial<TrackerHost> & { ownerName?: (slot: number) => string }): void {
  if (host.npcName) bossDamageHost.npcName = host.npcName;
  if (host.ownerName) bossDamageHost.ownerName = host.ownerName;
}

function getRealActive(npc: TrackerNpcLike): TrackerNpcLike | null {
  // GetRealActiveNPC（:123-136）：realLife 归主段；主段失活 → null
  let n = npc;
  if (n.realLifeHost) n = n.realLifeHost;
  return n;
}

function tryGetTrackerFor(npc: TrackerNpcLike): BossTracker | null {
  for (const t of activeTrackers) if (t.includeDamageFor(npc)) return t;
  return null;
}

/** NPCDamageTracker.AddDamage（:176-181 + CreateTrackerFor :154-167）。
 *  flag2 门（NPC.cs:82128-82130）：世界伤害 ≥9999（内部死亡管线的 9999 哨兵,
 *  如天亮自灭/生成消散）不入账 */
export function bossDamageAddDamage(npc: TrackerNpcLike, owner: number, damage: number): void {
  if (owner === 255 && damage >= 9999) return;
  const real = getRealActive(npc);
  if (!real || real.hp <= 0) return;
  const type = real.vanillaId ?? -1;
  let tracker = tryGetTrackerFor(real);
  if (!tracker) {
    if (!CUSTOM_BOSS_DEFS.get(type) && !real.def?.boss) return;
    tracker = new BossTracker(type, CUSTOM_BOSS_DEFS.get(type) ?? null);
    activeTrackers.push(tracker);
  }
  tracker.add(owner, Math.min(damage, real.hp), bossDamageHost.ownerName ?? (() => ''));
}

/** NPCDamageTracker.BossKilled（:189-194 + BossDamageTracker.OnBossKilled） */
export function bossDamageKilled(npc: TrackerNpcLike): void {
  const real = getRealActive(npc);
  if (!real) return;
  const tracker = tryGetTrackerFor(real);
  tracker?.onBossKilled();
}

// ---- 伤害漏斗注入点（entityNet 同模式：entities 层不反向依赖 Game/聊天层）----
/** owner 约定：-1=本地玩家 / 255=世界（陷阱·减益·环境）/ 0-254=远端玩家 net 槽位
 *  （房主结算访客 msg42 打击时 Game 置 pendingStrikeOwner） */
export const bossDamageSink = {
  add: null as null | ((npc: TrackerNpcLike, owner: number, damage: number) => void),
};

/** 下一击归账覆写（远端访客伤害：msg42 打击到达时 Game 置打击者槽位,Enemy.hurt
 *  漏斗消费一次即清——fromPlayer 标记无法区分本地/远端,房主侧由此归账） */
let pendingStrikeOwner: number | null = null;
export function setPendingStrikeOwner(slot: number | null): void { pendingStrikeOwner = slot; }
export function consumePendingStrikeOwner(): number | null {
  const o = pendingStrikeOwner;
  pendingStrikeOwner = null;
  return o;
}

/** 进行中 tracker 数（>0 才需要本帧在场类型集——Game 侧免常态扫实体表） */
export function activeBossTrackerCount(): number { return activeTrackers.length; }

/** NPCDamageTracker.Update（:208-235）。presentTypes = 惰性在场 npc 类型集
 *  （NPC.cs:7202-7215 npcsFoundForCheckActive 每帧重扫的等价注入;无进行中
 *  tracker 时跳过扫描——RecentAttempts 过期仍按 tick 推进） */
export function bossDamageUpdate(presentTypes: () => ReadonlySet<number>): void {
  for (const t of activeTrackers) t.tick();
  for (const t of recentFinished) t.tick();
  if (activeTrackers.length > 0) {
    const present = presentTypes();
    // CheckActive（:229-234 + BossDamageTracker.CheckActive :70-74）：族全不在场即停
    for (let i = activeTrackers.length - 1; i >= 0; i--) {
      if (!activeTrackers[i].isActive(present)) {
        const t = activeTrackers.splice(i, 1)[0];
        stopTracking(t);
      }
    }
  }
  while (recentFinished.length > 1 && recentFinished[0].timeSinceLastHit > EXTRA_RECENT_TRACKER_EXPIRY_TIME) {
    recentFinished.shift();
  }
}

function stopTracking(tracker: BossTracker): void {   // StopTracking（:237-245）
  if (!tracker.isEmpty) {
    recentFinished.push(tracker);
    if (recentFinished.length > MAX_RECENT_TRACKERS) recentFinished.shift();
  }
}

/** RecentAttempts（:199-204）：最近至多 3 场（含进行中刚结束的） */
export function recentBossReports(forPlayerName: string | null): string[] {
  return recentFinished.map((t) => t.getReport(forPlayerName));
}

/** Reset（:196-204 static Reset）：读档/清世界 */
export function resetBossDamage(): void {
  activeTrackers = [];
  recentFinished = [];
}

// ---- 测试口：内部态暴露（仅 tests 用；游戏代码勿消费） ----
export const __bossTrackerTest = {
  activeCount(): number { return activeTrackers.length; },
  recentCount(): number { return recentFinished.length; },
};
