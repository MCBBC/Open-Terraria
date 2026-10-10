// ★BJ627（2026-10-10）：偏好类 localStorage→IndexedDB 迁移（BJ615 登记债「另案」
// 兑现——用户方向=存储链 LS 只留读兜底、新写全走 IDB）。
//
// 形态定谳=候选 C「IDB 权威+内存缓存」：
//  · 候选 A（消费面全 async 化）否——Options/Research/Achievements/QuickGate 均
//    构造期同步读,async 化=构造链侵入不可控；
//  · 候选 B（写侧双写过渡）否——双写=继续写 LS,违用户「避免写 LS」目标；
//  · 候选 C：启动早期一处 await（main.ts boot 链首行 preloadPrefs,单飞）把偏好
//    全量预载进内存 map,运行时同步读走内存=零闪变/零 await 扩散。
//
// 读序：内存（预载后=IDB 权威投影+本会话写穿）→ 未预载窗口退 LS（与迁移前行为
// 等价;启动时序保证消费面首读在预载完成后——module 顶层唯一早读者 InstallPrompt
// 已改为监听同步挂+判定延后）。预载完成后内存 miss=全链 miss（不退 LS——防读到
// 比 IDB 陈旧的历史副本,kvGet 同判例）。
//
// 写链：prefSet=内存写穿+IDB 单写（kvSetIdb fire-and-forget;★零 LS 写）。
//  IDB 写失败=会话内内存仍权威,刷新后由 LS 收编序自愈（与 BJ615 kvSet 单写同
//  失败域）。prefRemove 三清（内存+LS+IDB）——LS 必清防收编序复活（BJ618 件4
//  陈旧指针同族）。
//
// 迁移：preload ①IDB 扫取（kvSweepIdb 键枚举+命中取值——大值键域
// sandboxworld.*/rp:zip:/mod:zip: 永不入内存）→ ②LS 遗留收编（「LS 有而 IDB 无」
// 的登记键→内存+IDB 迁移写,fire-and-forget,失败下轮重收编=自愈）。LS 键保留
// 不删=「LS 只读不写」终态自洽（双写时代旧副本自然陈化,仅 prefRemove 时清）。
//
// 键域注册表（KvStore 头表 `sbw.*（UI 偏好散键）` 行的细目;新偏好键入域先在此
// 登记,防 sweep 漏收=预载后读恒 null）：
//   精确键: sbw.achievements.v1 / sbw.lastCharId / sbw.itemSearchConfirmed /
//           sbw.research.v1(旧全局桶) / sbw.storagePersistNoticed /
//           sbw.evictNoticeFingerprint / sbw.quotaTrend /
//           sw.welcome.announce.acked / swInstallDismissedAt / swAssetTrace
//   前缀键: sbw.journeyQuick.*(QuickGate 首用门) / sbw.bartenderGift.*(酒保首礼,
//           种子×角色名) / sbw.research.v2.p*(研究按角色) /
//           swAssetsComplete:*(资产完成旗,版本键) / swContentHash:*(manifest
//           hash 锚,hash 键)
// 不入域（登记留 LS/留读面）：DebugLinePage（debug-line.html 独立调试页,不进主
//   构建链）;渲染 dev 旗 sw_vanilla_framing*/sw_npc_foot_*/sw_slope_*（src 零写
//   面,仅 DevTools/探针手置,读面原样保留）。
import { kvDeleteIdb, kvSetIdb, kvSweepIdb } from './KvStore';

const EXACT_KEYS: ReadonlySet<string> = new Set([
  'sbw.achievements.v1',
  'sbw.lastCharId',
  'sbw.itemSearchConfirmed',
  'sbw.research.v1',
  'sbw.storagePersistNoticed',
  'sbw.evictNoticeFingerprint',
  'sbw.quotaTrend',
  'sw.welcome.announce.acked',
  'swInstallDismissedAt',
  'swAssetTrace',
]);

const PREFIX_KEYS: readonly string[] = [
  'sbw.journeyQuick.',
  'sbw.bartenderGift.',
  'sbw.research.v2.p',
  'swAssetsComplete:',
  'swContentHash:',
];

/** 键是否属偏好域（预载扫取 match;新键先登记进上方两表） */
export function isPrefKey(key: string): boolean {
  if (EXACT_KEYS.has(key)) return true;
  for (const p of PREFIX_KEYS) if (key.startsWith(p)) return true;
  return false;
}

/** 会话内存权威（预载后=IDB 投影+本会话写穿） */
const mem = new Map<string, string>();
let readyPromise: Promise<void> | null = null;
let ready = false;

function lsGet(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch { return null; }
}

/** 同步读（永不抛）：内存优先;预载完成前退 LS（等价旧行为）;完成后 miss=全链
 *  miss。★只对登记键有意义——未登记键在预载后恒 null（fail-loud,逼登记）。 */
export function prefGet(key: string): string | null {
  if (mem.has(key)) return mem.get(key) as string;
  if (ready) return null;
  return lsGet(key);
}

/** 写：内存写穿+IDB 单写（fire-and-forget）。★零 LS 写（BJ627 铁面）。 */
export function prefSet(key: string, value: string): void {
  mem.set(key, value);
  void kvSetIdb(key, value);
}

/** 删：内存+LS+IDB 三清。LS 必清——防下次启动收编序把已删键复活（BJ618 件4 同族）。 */
export function prefRemove(key: string): void {
  mem.delete(key);
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch { /* 隐私模式等 */ }
  void kvDeleteIdb(key);
}

/** StoragePersistence LsLike 注入形（提醒门纯核零改动直插——mainFlow 调用点换参） */
export function prefLsLike(): Pick<Storage, 'getItem' | 'setItem'> {
  return { getItem: (k: string) => prefGet(k), setItem: (k: string, v: string) => prefSet(k, v) };
}

/** 启动早期预载（单飞;幂等）。main.ts boot 链首行 await;module 顶层可提前
 *  fire-and-forget 起跑（与模块初始化重叠,boot 处 await 兜时序）。 */
export function preloadPrefs(): Promise<void> {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    // ① IDB 扫取（权威面;失败=空表→收编序兜底）
    let swept: Map<string, string>;
    try { swept = await kvSweepIdb(isPrefKey); } catch { swept = new Map(); }
    for (const [k, v] of swept) mem.set(k, v);
    // ② LS 遗留收编（IDB 缺位键→内存+IDB 迁移写;LS 键保留=只读兜底终态,不删）
    try {
      if (typeof localStorage !== 'undefined') {
        const n = localStorage.length;
        for (let i = 0; i < n; i++) {
          const k = localStorage.key(i);
          if (k == null || !isPrefKey(k) || swept.has(k) || mem.has(k)) continue;
          const v = lsGet(k);
          if (v == null) continue;
          mem.set(k, v);
          void kvSetIdb(k, v);   // 迁移写（一次性;失败=下轮启动重收编,自愈）
        }
      }
    } catch { /* LS 不可用（隐私模式）——纯 IDB 面 */ }
    ready = true;
  })();
  return readyPromise;
}

/** 预载完成 Promise（消费面判定延后用——InstallPrompt 冷却门） */
export function prefReady(): Promise<void> {
  return preloadPrefs();
}
