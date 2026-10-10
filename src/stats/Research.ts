// Journey 模式物品研究（献祭）最小 1:1 内核。
//
// 权威来源（1.4.5.6 = Terarria1456）：
//   - ItemsSacrificedUnlocksTracker.cs（全类语义）
//       POSITIVE_SACRIFICE_COUNT_CAP      :10   = 9999（SetSacrificeCountDirectly 钳位）
//       GetSacrificeCount                 :38   override 解析 → 缓存计数
//       CountFullyResearchedItems         :59   0..ItemID.Count-1 逐 id 计
//                                                fully/all（all = TryGetSacrificeNumbers
//                                                可解析者，含 override 牺牲品！）
//       TryGetSacrificeNumbers            :76   override → need 表，无条目返回 false
//       IsFullyResearched                 :91   have >= need
//       RegisterItemSacrifice             :115  已满 → 直接返回（幂等）；
//                                                否则 min(已有+数量, need)，越线才返回
//                                                "本次完成"（_newlyUnlocked 语义）
//       MarkContentsDirty                 :219  LastEditId++
//   - CreativeItemSacrificesCatalog.cs:14-69    need 表加载（内嵌 Sacrifices.tsv）
//   - ContentSamples.cs:884-892                  CreativeResearchItemPersistentIdOverride
//                                                （牺牲品 id → 解锁目标 id，单步映射——
//                                                本版 8 组覆盖无链式，与原版一致）
//   - AchievementsHelper.cs CheckResearchAchievement :387-398
//       版本门（_lastResearchVersion != LastEditId 或 forced）才重数；
//       fullyResearchedItems >= allItems/2（C# 整除）→ NotifyProgressionEvent(45)
//       = 成就 TRASH_COMPACTOR（AchievementInitializer.cs:436-438）。
//       原版调用点：Player.OnEnterWorld forced:true（Player.cs:318）、
//       Player.Update 逐帧版本门（Player.cs:25418）。
//   - 成就 46（INTERDIMENSIONAL_RECYCLING）与研究无关：Main.cs:39721
//     DryadText_Do_StardewValleyBit（给树妖 Joja Cola 5275 的星露谷彩蛋）
//     → NotifyProgressionEvent(46)——勿接进本内核。
//
// 持久化：按玩家档案分键（R24 勘误+修复：原版 creativeTracker 是
// Player 字段（Player.cs:777），随 .plr 档存取（Player.cs:55569 creativeTracker.Save）
// ——【不是】此前注释所写的 ".wld CreativeTracker"，也【不应】是浏览器全局单桶；
// 旧实现 sbw.research.v1 全局共享 = 跨角色串档。现键 sbw.research.v2.p<id> 随角色，
// usePlayerProfile(cid) 在进世界装配时切换；旧全局桶由首个加载角色一次性收编
// （防多角色各拷一份）。★BJ627：持久面迁 PrefsStore（IDB 单写+内存缓存;LS 只读
// 兜底——历史 LS 键由启动收编序迁 IDB）。计数按「解析后 id」存，语义同
// _sacrificesCountByItemIdCache，只是键型数字而非 persistentId 字符串——override
// 映射确定性，二者等价【偏差登记】）。
import raw from '../data/vanilla-research.json';
import { prefGet, prefRemove, prefSet } from '../save/PrefsStore';

export interface ResearchStore {
  load(): string | null;
  save(s: string): void;
}

export interface ResearchData {
  count: number;
  need: Record<string, number>;
  override: Record<string, number>;
}

type Json = typeof raw;
const DATA = raw as Json as unknown as ResearchData;

/** ★mod 物品研究注册面（2026-10-04 P4）：need 表运行时追加（键=mod 物品 stable id
 *  30000+ 段,与 getNeed 的内部 id 求值域天然一致）。重复注册=覆写（mod 重载幂等）。 */
export function registerModResearch(vid: number, need: number): void {
  if (!(vid >= 30000) || !(need > 0)) return;
  DATA.need[String(vid)] = need;
}

export const RESEARCH_STORE_KEY = 'sbw.research.v1';

/** 玩家档案键（原版 creativeTracker 随 .plr；本仓随角色槽位 id 分键） */
export function playerResearchKey(playerId: number): string {
  return `sbw.research.v2.p${playerId}`;
}

/** 原版 CountFullyResearchedItems 的返回对（ItemsSacrificedUnlocksTracker.cs:59-74） */
export interface SacrificeTotals { fullyResearchedItems: number; allItems: number }

export class Research {
  /** 解析后 id → 累计献祭数（= _sacrificesCountByItemIdCache） */
  private counts = new Map<number, number>();
  /** ItemsSacrificedUnlocksTracker._newlyUnlocked（cs:18/136-141：跨线进集合，
   *  IsNewlyResearched 供旅程浏览器 ByUnlockStatus 首序位 + 图标高亮；
   *  不持久化——原版亦仅会话态（Save 只写 _sacrificeCountByItemPersistentId） */
  private newly = new Set<number>();
  /** 当前持久化键（usePlayerProfile 切换；初始 = 旧全局桶） */
  private storeKey = RESEARCH_STORE_KEY;
  private _lastEditId = 0;
  /** AchievementsHelper._lastResearchVersion（cs:385） */
  private achVersion = -1;
  /** NotifyProgressionEvent(45) 出口——Game 侧注入 ach.notifyProgressionEvent */
  onProgressionEvent: ((eventId: number) => void) | null = null;

  constructor(
    private store?: ResearchStore,
    private data: ResearchData = DATA,
  ) {
    this.load();
  }

  /** 生效存储：注入 store（测试）直用；缺省走 PrefsStore（★BJ627 IDB 单写），
   *  键随档案切换 */
  private get effStore(): ResearchStore {
    return this.store ?? {
      load: () => prefGet(this.storeKey),
      save: (s: string) => prefSet(this.storeKey, s),
    };
  }

  /**
   * 按玩家档案切换持久化（原版 creativeTracker 随角色，Player.cs:777/:55569）。
   * null = 无角色上下文（直载存档/联机房间等），维持旧共享桶语义。
   * 迁移：目标档案尚无存档且旧全局桶 sbw.research.v1 有数据 → 收编为该角色的
   * 基线并清空全局桶（一次性；防多角色各拷一份）。注入自定义 store 时仅重载。
   */
  usePlayerProfile(playerId: number | null): void {
    const key = playerId != null ? playerResearchKey(playerId) : RESEARCH_STORE_KEY;
    if (key === this.storeKey) return;
    if (!this.store) {
      // ★BJ627：收编链走 PrefsStore（prefRemove 三清——LS+IDB 同清防二次收编）
      const legacy = prefGet(RESEARCH_STORE_KEY);
      if (playerId != null && !prefGet(key) && legacy) {
        prefSet(key, legacy);
        prefRemove(RESEARCH_STORE_KEY);
      }
    }
    this.storeKey = key;
    this.counts.clear();
    this.newly.clear();
    this.load();
  }

  // ---- 解析（ContentSamples.CreativeResearchItemPersistentIdOverride 单步）----
  private resolveId(itemId: number): number {
    const o = this.data.override[String(itemId)];
    return o === undefined ? itemId : o;
  }

  // ---- 查询 ----
  /** 研究所需数量；0 = 不可研究（need 表无条目） */
  getNeed(itemId: number): number {
    return this.data.need[String(this.resolveId(itemId))] ?? 0;
  }

  /** TryGetSacrificeNumbers（cs:76-89）：不可研究返回 null */
  tryGetSacrificeNumbers(itemId: number): { have: number; need: number } | null {
    const id = this.resolveId(itemId);
    const need = this.data.need[String(id)];
    if (need === undefined) return null;
    return { have: this.counts.get(id) ?? 0, need };
  }

  /** GetSacrificeCount（cs:38-46） */
  getSacrificeCount(itemId: number): number {
    return this.tryGetSacrificeNumbers(itemId)?.have ?? 0;
  }

  /** IsFullyResearched（cs:91-98） */
  isResearched(itemId: number): boolean {
    const n = this.tryGetSacrificeNumbers(itemId);
    return n !== null && n.have >= n.need;
  }

  /** IsNewlyResearched（cs:100-102）——解析链同上（浏览器传牺牲品 id 时先过 override） */
  isNewlyResearched(itemId: number): boolean {
    return this.newly.has(this.resolveId(itemId));
  }

  /** ClearNewlyResearchedStatus（cs:104-108）——浏览器悬停/取用后消高亮 */
  clearNewlyResearchedStatus(itemId: number): void {
    this.newly.delete(this.resolveId(itemId));
  }

  get lastEditId(): number { return this._lastEditId; }

  // ---- 献祭 ----
  /**
   * RegisterItemSacrifice（cs:115-143）。
   * @returns 本次调用是否「刚研究完成」（跨过 need 线 = _newlyUnlocked 语义）；
   *          不可研究 / 已研究满 → false 且不产生任何状态变化（幂等）。
   */
  sacrifice(itemId: number, amount: number): boolean {
    if (!(amount > 0)) return false;
    const n = this.tryGetSacrificeNumbers(itemId);
    if (!n) return false;                       // 无 persistentId / 无 need 条目 → 早退
    const id = this.resolveId(itemId);
    if (n.have >= n.need) return false;         // cs:126-129 已满直接返回
    const value = Math.min(n.have + Math.floor(amount), n.need);
    this.counts.set(id, value);
    if (value >= n.need) this.newly.add(id);    // cs:134-136 _newlyUnlocked.Add
    this.markContentsDirty();
    this.save();                                // 每次有效推进即落盘（原版由世界脏标记承担）
    return value >= n.need;
  }

  /** SetSacrificeCountDirectly（cs:145-154）：0..9999 钳位，按解析后 id 记 */
  setSacrificeCountDirectly(itemId: number, sacrificeCount: number): void {
    const v = Math.max(0, Math.min(9999, Math.floor(sacrificeCount)));
    this.counts.set(this.resolveId(itemId), v);
    this.markContentsDirty();
    this.save();
  }

  /** 解析后 id 暴露（联机研究上报接收端 / 浏览器进度遍历用——只读视图） */
  resolvedIdsWithProgress(): number[] {
    const out: number[] = [];
    for (const [id, v] of this.counts) if (v > 0) out.push(id);
    return out;
  }

  // ---- 统计（成就 45 门）----
  /** CountFullyResearchedItems（cs:59-74）：0..ItemID.Count-1 全域数 */
  countFullyResearchedItems(): SacrificeTotals {
    let fully = 0, all = 0;
    for (let i = 0; i < this.data.count; i++) {
      const n = this.tryGetSacrificeNumbers(i);
      if (!n) continue;
      all++;
      if (n.have >= n.need) fully++;
    }
    return { fullyResearchedItems: fully, allItems: all };
  }

  /** 已研究完成数（allItems 的对偶，供 UI/成就门） */
  completedCount(): number { return this.countFullyResearchedItems().fullyResearchedItems; }

  /** 可研究物品总数（≠ need 表长度：override 牺牲品可解析也计入——原版全域迭代语义） */
  totalItems(): number { return this.countFullyResearchedItems().allItems; }

  /**
   * AchievementsHelper.CheckResearchAchievement（cs:387-398）1:1。
   * 版本门 + 整除半数门；过门 → 触发 onProgressionEvent(45)（成就 TRASH_COMPACTOR）。
   * @param forced 原 forced:true（Player.OnEnterWorld, Player.cs:318）
   * @returns 本次是否过半数门（true 即已 NotifyProgressionEvent(45)）
   */
  checkResearchAchievement(forced = false): boolean {
    if (!forced && this.achVersion === this._lastEditId) return false;
    this.achVersion = this._lastEditId;
    const { fullyResearchedItems, allItems } = this.countFullyResearchedItems();
    if (fullyResearchedItems >= Math.floor(allItems / 2)) {
      this.onProgressionEvent?.(45);
      return true;
    }
    return false;
  }

  // ---- 持久化 ----
  private load(): void {
    const raw2 = this.effStore.load();
    if (!raw2) return;
    try {
      const data = JSON.parse(raw2) as { v?: number; c?: Record<string, number> };
      if (data.v !== 1 || !data.c) return;
      for (const [k, v] of Object.entries(data.c)) {
        const id = Number(k);
        if (!Number.isInteger(id) || !(v >= 0)) continue;
        this.counts.set(id, Math.min(9999, Math.floor(v)));
      }
    } catch { /* 损坏静默丢弃 */ }
  }

  private save(): void {
    const c: Record<string, number> = {};
    for (const [id, v] of this.counts) c[String(id)] = v;
    this.effStore.save(JSON.stringify({ v: 1, c }));
  }

  /** Reset（cs:205-213）：清计数并置脏 */
  reset(): void {
    this.counts.clear();
    this.newly.clear();                          // cs:211 _newlyUnlocked.Clear()
    this.markContentsDirty();
    this.save();
  }

  private markContentsDirty(): void { this._lastEditId++; }
}
