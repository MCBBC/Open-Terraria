// ★BJ611（2026-10-10 线上事故·Chromium 磁盘紧张驱逐根治面）：持久存储统一申请+
// 授予状态追踪 + estimate 预警面 + 驱逐后首启幽灵档检测。
//
// 事故终因（主会话定谳）：用户 Windows C 盘仅剩 ~3GB → Chromium QuotaManager 主动
// 驱逐 best-effort origin 的 quota 管理存储（IDB+Cache API 整批清;localStorage 不在
// 体系内幸存）→ IndexedDB 全空/世界数据键消失/列表幽灵。此前全站只有素材暖存链
// （net/AssetCache.ts:654,2026-08-27）调过 persist() 且授予结果无追踪——存档链
// （KvStore/mainFlow）从未申请 → 存档恒 best-effort=可被整批驱逐。persist() 是
// origin 级授权（授予则全站生效）,Chrome 启发式下普通网页大概率静默拒绝。
//
// 浏览器授予启发式与驱逐机制（★R13-F7 引用更新：原注把两源并写一处——现行 MDN 页
//  已不载 Chromium 三启发式,三判据改引 web.dev 现行表述,驱逐机制引现行 MDN 页）：
//  - 授予三判据 = web.dev "Persistent storage"（web.dev/articles/persistent-storage,
//    现行版亲读 2026-10-11）,提示文案措辞的依据——Chrome/Chromium（含 Edge）无任何
//    提示自动裁决,判据=「站点参与度（site engagement）高 / 已安装为应用或已收藏
//    书签 / 已授予通知权限」三条,任一命中即静默授予,否则静默拒绝（可稍后重申,
//    同准则再评）→ 文案建议「安装为应用或收藏书签」即据此。
//  - Firefox：委派用户——弹权限框请求确认（同 web.dev 页）。
//  - Safari 15.2+：同 Chromium 自动裁决（无提示）;另有 ITP 7 天无交互主动驱逐面
//    （persist 不豁免 7 天面,只豁免存储压力 LRU 面——Safari 提示面另属）。
//  - 驱逐机制 = MDN "Storage quotas and eviction criteria"（Storage API 章节现行版,
//    developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria,亲读 2026-10-11）：
//    best-effort 数据在存储压力下按 LRU 逐 origin 驱逐,persistent 跳过;驱逐=origin
//    数据整批同删（不分片）,与事故「IDB
//    全空而 localStorage 幸存」形态吻合。★用户实测（2026-10-10 Windows C 盘剩 3GB
//    空闲）:estimate().quota=10.3GB——Chromium M97+（2022 起）quota 锚【磁盘总容量】,
//    故意不随空闲波动,quota/usage 配比与环比均不构成磁盘紧张信号——预警阈值只锚
//    usage 绝对值+持久化位（下 storagePressureKind）;quota 环比骤降预警已按用户
//    明令摘除（下 quota 区段休眠注）。
//
// 全部 API 可选面（老浏览器/隐私模式）try/catch 降级,任何残缺环境不抛。
import { kvGetIdbEx } from './KvStore';

export type StoragePersistState = 'unknown' | 'granted' | 'denied' | 'unsupported';

/** localStorage 记忆键（一次性提醒面） */
export const PERSIST_NOTICE_LS_KEY = 'sbw.storagePersistNoticed';
/** 幽灵档通知指纹键（新增驱逐才再提醒） */
export const EVICT_NOTICE_LS_KEY = 'sbw.evictNoticeFingerprint';

let persistState: StoragePersistState = 'unknown';
let persistPromise: Promise<StoragePersistState> | null = null;

/** 会话内 persist() 申请结果（unknown=尚未 settle;状态行/诊断面板读） */
export function storagePersistState(): StoragePersistState {
  return persistState;
}

/** 统一申请口（会话一次;重入返回既有 promise——幂等）。persisted() 已授予时不再
 *  发起申请。net/AssetCache.ts 既有裸 persist() 调用保留无害（幂等;且本模块在
 *  mainFlow 装配早期先到,AssetCache 二次调用只是重查同一授权）。 */
export function requestStoragePersistence(): Promise<StoragePersistState> {
  if (persistPromise) return persistPromise;   // ★一次性闸（变异锚）
  const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!st || typeof st.persist !== 'function') {
    persistState = 'unsupported';
    persistPromise = Promise.resolve(persistState);
    return persistPromise;
  }
  persistPromise = (async () => {
    try {
      const already = typeof st.persisted === 'function' ? await st.persisted() : false;
      if (already) {
        persistState = 'granted';   // 既往已授予——不重复申请
        return persistState;
      }
      persistState = (await st.persist()) ? 'granted' : 'denied';
    } catch {
      persistState = 'denied';   // 抛错=环境残缺（opaque origin/禁存储）——按拒绝处理
    }
    return persistState;
  })();
  return persistPromise;
}

// ---- estimate 预警面（启动/保存/存档列表打开时采样） ----

export type StoragePressureKind = 'none' | 'nearQuota' | 'unpersistedData';

/** 未持久化且存量数据 ≥100MB = 数据面已达可被驱逐的规模（警示升格阈值。
 *  配比判据不可用——estimate.quota 动态算,见文件头注）。 */
export const USAGE_WARN_BYTES = 100 * 1024 * 1024;
/** 近配额线:usage/quota ≥90% → QuotaExceededError 写失败近在眼前 */
export const QUOTA_NEAR_RATIO = 0.9;

export function storagePressureKind(usage: number, quota: number | null, persisted: boolean): StoragePressureKind {
  if (quota != null && quota > 0 && usage / quota >= QUOTA_NEAR_RATIO) return 'nearQuota';
  if (!persisted && usage >= USAGE_WARN_BYTES) return 'unpersistedData';
  return 'none';
}

export interface StorageStatus {
  persisted: boolean;          // granted 之外（denied/unsupported/未知）一律未授予
  state: StoragePersistState;
  usage: number;
  quota: number | null;
  pressure: StoragePressureKind;
  // ★摘除注（2026-10-10 用户明令）：quotaCrash/quotaCrashed 两字段随骤降预警触发面
  // 一并摘除——M97+ quota 锚总容量,环比不构成磁盘紧张信号（休眠纯核见下区段）。
}

let lastStatus: StorageStatus | null = null;

/** 最近一次 refreshStorageStatus 快照（同步读;未采样过为 null） */
export function storageStatusSnapshot(): StorageStatus | null {
  return lastStatus;
}

// ---- ★BJ611 续刀→★摘除转休眠（2026-10-10 用户实测+明令）：quota 环比骤降检测 ----
// 【摘除定谳】磁盘绝对余量无 API（隐私边界）;原判「estimate().quota 动态算≈磁盘
// 空闲比例,骤降=磁盘紧张前兆」被用户实测推翻——Windows C 盘剩 3GB 空闲时
// quota=10.3GB:Chromium M97+（2022 起）quota 锚【磁盘总容量】,故意不随空闲波动,
// 环比骤降抓不到磁盘变紧=失效。按用户明令「干脆去掉这个预警」摘除全部触发面
// （toast 链/状态行 ↓ 角标/sbw.quotaTrend 记录写入）;状态机纯核保留为休眠态
// （导出面,F 组测试锁定语义）——若未来 quota 语义再变或换用真实可用空间信号可
// 直接 re-arm。refreshStorageStatus 的 usage/quota 静态显示保留（有用信息）。
// （原阈值定谳存档：环比降幅 ≥25% 且两次采样差 ≥32MB 防抖;crashed 持续期不重报,
//  回升至骤降前基线 90% 解除 re-arm。）
export const QUOTA_TREND_LS_KEY = 'sbw.quotaTrend';
/** 骤降判定线:环比降幅 ≥25% */
export const QUOTA_CRASH_RATIO = 0.25;
/** 防抖绝对最小差:两次采样差 <32MB 不算骤降 */
export const QUOTA_CRASH_MIN_DROP_BYTES = 32 * 1024 * 1024;
/** 解除线:回升至骤降前基线的 90% */
export const QUOTA_RECOVER_RATIO = 0.9;

export type QuotaCrashKind = 'none' | 'crash' | 'recover' | 'insufficient';

export interface QuotaTrendRecord {
  q: number;             // 上次 quota 字节
  t: number;             // 上次采样时间戳
  crashed: boolean;      // 持续紧张态（true=已预警未解除,不重报）
  base?: number;         // 骤降前基线（crashed 时携带,解除判据）
}

/** 骤降状态机纯核。prev=null/无效 → 'insufficient'（采样不足,只记录不判）。 */
export function quotaCrashKind(prev: QuotaTrendRecord | null, cur: number): { kind: QuotaCrashKind; next: QuotaTrendRecord } {
  const next: QuotaTrendRecord = { q: cur, t: Date.now(), crashed: false };
  if (!prev || typeof prev.q !== 'number' || !Number.isFinite(prev.q) || prev.q <= 0) {
    return { kind: 'insufficient', next };
  }
  const drop = prev.q - cur;
  if (prev.crashed) {
    if (prev.base != null && cur >= prev.base * QUOTA_RECOVER_RATIO) {
      return { kind: 'recover', next };   // 回升解除 re-arm
    }
    return { kind: 'none', next: { ...next, crashed: true, base: prev.base } };   // 持续紧张:不重报
  }
  if (drop >= QUOTA_CRASH_MIN_DROP_BYTES && drop / prev.q >= QUOTA_CRASH_RATIO) {
    return { kind: 'crash', next: { ...next, crashed: true, base: prev.q } };
  }
  return { kind: 'none', next };
}

export function readQuotaTrend(ls: LsLike): QuotaTrendRecord | null {
  try {
    const raw = ls.getItem(QUOTA_TREND_LS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as QuotaTrendRecord;
    if (typeof j?.q !== 'number' || !Number.isFinite(j.q)) return null;
    return j;
  } catch { return null; }
}

export function writeQuotaTrend(ls: LsLike, rec: QuotaTrendRecord): void {
  try { ls.setItem(QUOTA_TREND_LS_KEY, JSON.stringify(rec)); } catch { /* 隐私模式:状态机退化为会话内 */ }
}

/** 采样落账:算 kind+写回记录（环比=对最近一次样本）。
 *  ★休眠态:无生产调用方（触发面已摘）——仅供测试与未来 re-arm。 */
export function noteQuotaSample(ls: LsLike, quota: number): QuotaCrashKind {
  const prev = readQuotaTrend(ls);
  const r = quotaCrashKind(prev, quota);
  writeQuotaTrend(ls, r.next);
  return r.kind;
}

/** 采样存储状态（幂等:内部走 requestStoragePersistence 一次闸）。estimate 不可用时
 *  usage=0/quota=null,持久化位仍如实显示。 */
export async function refreshStorageStatus(): Promise<StorageStatus | null> {
  const state = await requestStoragePersistence();
  const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  let usage = 0;
  let quota: number | null = null;
  try {
    const est = await st?.estimate?.();
    usage = est?.usage ?? 0;
    quota = est?.quota ?? null;
  } catch { /* estimate 残缺:零值面,状态行仍显示持久化位 */ }
  // ★摘除注：quota 环比骤降检测/记录写入已随触发面摘除（用户明令,M97+ quota 锚
  // 总容量环比失效）——此处只保留 usage/quota 静态快照。
  lastStatus = {
    persisted: state === 'granted',
    state,
    usage,
    quota,
    pressure: storagePressureKind(usage, quota, state === 'granted'),
  };
  return lastStatus;
}

// ---- 一次性提醒门（纯决策,ls 注入可单测） ----

export type LsLike = Pick<Storage, 'getItem' | 'setItem'>;

/** persisted=false 一次性提醒门:localStorage 记忆,跨会话只弹一次（读失败=可提醒） */
export function shouldShowPersistNotice(ls: LsLike): boolean {
  try { return ls.getItem(PERSIST_NOTICE_LS_KEY) !== '1'; } catch { return true; }
}
export function markPersistNoticeShown(ls: LsLike): void {
  try { ls.setItem(PERSIST_NOTICE_LS_KEY, '1'); } catch { /* 隐私模式:会话内可能重弹,可接受 */ }
}

/** 幽灵档通知指纹（kind:id 排序拼接——新增驱逐/条目变化才再提醒,已提醒过不重弹） */
export function evictNoticeFingerprint(evicted: ReadonlyArray<{ kind: string; id: number }>): string {
  return [...evicted].map((e) => `${e.kind}:${e.id}`).sort().join('|');
}
export function shouldShowEvictNotice(ls: LsLike, fingerprint: string): boolean {
  if (fingerprint === '') return false;
  try { return ls.getItem(EVICT_NOTICE_LS_KEY) !== fingerprint; } catch { return true; }
}
export function markEvictNoticeShown(ls: LsLike, fingerprint: string): void {
  try { ls.setItem(EVICT_NOTICE_LS_KEY, fingerprint); } catch { /* 同上 */ }
}

// ---- 驱逐后首启检测（幽灵档扫描） ----

export type EvictProbeCause = 'keyMissing' | 'present' | 'unavailable';

export interface EvictedEntry { kind: 'world' | 'player' | 'playerstate' | 'quicksave'; id: number; name: string; }

export interface EvictScanResult {
  evicted: EvictedEntry[];
  /** false=IDB 本会话打不开/读写失败——驱逐与打不开无法区分,整体弃检（evicted 恒空） */
  conclusive: boolean;
}

/** 幽灵档扫描:传入两列 index meta（调用方先 ensureLoaded）,对每个数据键探测。
 *  数据键在 IDB 缺失 = 被驱逐形态（★BJ615 2026-10-10 单写后新档天然无 localStorage
 *  副本,keyMissing 即幽灵;defaultEvictProbe 保留的 LS 副本检查只对双写时代旧用户
 *  生效——副本在=kvGet 兜底仍可读,不算幽灵）。'unavailable'
 *  （openFailed/txFailed）→ 不可定谳,整扫作废（防把「IDB 打不开」误报成「被清理」;
 *  BJ605 修后本会话内 IDB 健康态稳定,弃检安全）。probe 可注入单测（BJ605 习语）。
 *  ★BJ618 件3（BJ616 probe F6）：quicksave 补探测项——单键草稿不在任何 index（无
 *  对照）,仅当本轮已有确认驱逐条目（evicted 非空=驱逐实锤,旁证本机确曾使用）才补
 *  测:quicksave 键 keyMissing 且 LS 无副本=幽灵。健康态/全新安装（evicted 空）不
 *  补测——单键探测无「曾经存在」物证,防「从未存过 quicksave」被误报成被清理
 *  （写入侧 doSave 每次存档都写 quicksave 键,有 index 的用户缺失该键只可能是
 *  驱逐/写败,后者非本扫描职责）。★R13-F4：playerstate 补进扫描面——仅当同角色
 *  外观键也缺（驱逐实锤=双缺）才补测,防「新角色未进过世界」的合法缺失误报。 */
export async function scanEvictedSaves(
  worlds: ReadonlyArray<{ id: number; name: string }>,
  players: ReadonlyArray<{ id: number; name: string }>,
  probe: (key: string) => Promise<EvictProbeCause> = defaultEvictProbe,
): Promise<EvictScanResult> {
  const evicted: EvictedEntry[] = [];
  for (const m of worlds) {
    const c = await probe(`sandboxworld.world.${m.id}`);   // WorldStore dataKey 同构
    if (c === 'unavailable') return { evicted: [], conclusive: false };
    if (c === 'keyMissing') evicted.push({ kind: 'world', id: m.id, name: m.name });
  }
  for (const m of players) {
    const c = await probe(`sandboxworld.player.${m.id}`);   // CharacterStore dataKey 同构
    if (c === 'unavailable') return { evicted: [], conclusive: false };
    if (c === 'keyMissing') {
      evicted.push({ kind: 'player', id: m.id, name: m.name });
      // ★R13-F4：playerstate（随身态）补进扫描面——外观与随身态同库,驱逐=整批同删
      //  （双缺=实锤,补测恢复面见 fsBackupRestoreEvicted kind 扩 playerstate）。
      //  ★门=外观键同缺才补测：随身态键缺失有合法形态（新角色未进过世界/前代角色
      //  无随身态段——doSave 首存前/stateKey 从未写过）,单键缺失≠被清理,quicksave
      //  同款「驱逐实锤才补测」纪律防误报。
      const cs = await probe(`sandboxworld.playerstate.${m.id}`);   // CharacterStore stateKey 同构
      if (cs === 'unavailable') return { evicted: [], conclusive: false };
      if (cs === 'keyMissing') evicted.push({ kind: 'playerstate', id: m.id, name: m.name });
    }
  }
  if (evicted.length > 0) {   // ★BJ618 件3：驱逐实锤后补测 quicksave（id=0 无槽位语义）
    const c = await probe('sandboxworld.quicksave');
    if (c === 'unavailable') return { evicted: [], conclusive: false };
    if (c === 'keyMissing') evicted.push({ kind: 'quicksave', id: 0, name: 'quicksave' });
  }
  return { evicted, conclusive: true };
}

/** 真实探测（KvStore 精细读 + localStorage 副本检查——★BJ615 后 LS 检查只对双写
 *  时代旧副本生效,新档无 LS 副本=判据退化为纯 IDB keyMissing）。typeMismatch=键在
 *  （非驱逐,损坏面归 BJ605 分类文案）;openFailed/txFailed=不可定谳。 */
async function defaultEvictProbe(key: string): Promise<EvictProbeCause> {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(key) !== null) return 'present';
  } catch { /* 隐私模式 localStorage 不可用——继续看 IDB */ }
  const r = await kvGetIdbEx(key);
  if (r.cause === 'keyMissing') return 'keyMissing';
  if (r.cause === 'ok' || r.cause === 'typeMismatch') return 'present';   // 键在=非驱逐
  return 'unavailable';   // openFailed / txFailed——IDB 健康态不可知
}
