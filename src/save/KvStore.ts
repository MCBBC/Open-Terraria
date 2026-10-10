// 键值存储：IndexedDB 恒权威（容量数百 MB+，大地图存档不受 localStorage ~5MB 限制），
// localStorage 仅读兜底（★BJ615 2026-10-10 单写方案：只读不写——双写时代历史副本
// 自然陈化，新数据恒单写 IDB）。async API，调用方 await。
// v2(2026-08-19 素材重制管线):新增 remaster blob store(素材包 png 持久化,
// kv 字符串通道放不下);他标签页升级时让路(关闭+清缓存,下次调用重连)。
//
// ★BJ620 件5（BJ616 F12 处置·只文档化不迁键——物理迁键须逐键改写+双读过渡,历史值
//  无法一次性转型=丢数据风险,用户「谨慎」纪律拍板不做）：【'kv' 单 store 键域注册表】
//  IDB object store 无模式,四类值型/三套前缀系混装同店;新键型入域前先读本表防误用
//  通道（字符串通道读 Blob=typeMismatch 判 null,恰是 probe F7 病根形态）：
//  ┌ 值型 ────────────┬ 键域 ────────────────────────┬ 读写通道 ─────────────────────┬ 消费方 ─────────────┐
//  ① string           │ sandboxworld.worlds.index     │ kvSet/kvSetIdb 写             │ WorldStore          │
//    （JSON 文本/      │ sandboxworld.world.<id>       │ kvGet/kvGetIdb/kvGetIdbEx 读  │ （存档索引/数据/     │
//    偏好小值）        │ sandboxworld.quicksave        │ kvHas 在判/kvDelete 双删      │   快存档）           │
//                     │ sandboxworld.players.index    │                              │ CharacterStore      │
//                     │ sandboxworld.player.<id>      │                              │ （角色索引/外观/     │
//                     │ sandboxworld.playerstate.<id> │                              │   随身态）           │
//                     │ sbw.*（UI 偏好散键）           │                              │ mainFlow            │
//  ② Blob（zip）      │ rp:zip:<id>                   │ rpPutZip/rpGetZip/rpDeleteZip │ ResourcePackStore   │
//                     │ mod:zip:<id>                  │ modPutZip/modGetZip/modDeleteZip │ ModLoader(mod 包) │
//  ③ 结构化克隆值     │ sandboxworld.fsBackup.*       │ kvPutValue 写/kvGetUnknown 读 │ FsBackup（目录句柄;  │
//    （非 string/Blob）│   （.dir=目录句柄）           │ （字符串通道读不出=typeMismatch）│ 字符串通道互不干扰） │
//  ④ 行对象           │ （独立 store 'remaster'）      │ remasterPut/All/Get/Delete    │ 素材重制管线(PackStore)│
//  └──────────────────┴───────────────────────────────┴───────────────────────────────┴─────────────────────┘
//  迁移禁令与兜底：①②③同店混装是既成事实（零 schema 变更免 DB 版本升级=onblocked
//  窗口免诱发）;kvGetIdbEx 对②③值按 typeMismatch 报因（不误报 keyMissing）;②zip 通道
//  失败一次性 console.warn 留物证（下方 warnZipChannelOnce）。
const DB_NAME = 'sandboxworld';
const STORE = 'kv';
const REMASTER_STORE = 'remaster';
let dbPromise: Promise<IDBDatabase> | null = null;

// ★BJ605（2026-10-10 线上事故定谳）openDb 失败重试预算——连续 N 次 open 失败后
// 退避 5s（防死循环打库；退避窗内调用方立刻拿到 openFailed，不排队不打库）。
const OPEN_MAX_STREAK = 3;
const OPEN_BACKOFF_MS = 5000;
// blocked 超时：他标签页持旧版本连接不让路时，旧实现只 warn 不 reject——
// promise 永久 pending，await openDb() 永挂（kvGetIdb 永不回、读档看门狗
// 超时才收场）。现 blocked 后 3s 放弃并 reject 可操作错误。
const OPEN_BLOCKED_TIMEOUT_MS = 3000;
let openFailStreak = 0;
let openBackoffUntil = 0;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  // ★BJ605 毒化修复：失败路径必须清 dbPromise（旧实现把 rejected promise 永久
  // 缓存——某次 openDb 瞬时失败（磁盘瞬时满/升级竞态/配额抖动）后本会话所有
  // IDB 读恒 null，「存档数据缺失」刷新前永不自愈）。退避窗内直接拒绝。
  if (Date.now() < openBackoffUntil) {
    return Promise.reject(new DOMException(
      `IndexedDB open 退避中（连续 ${openFailStreak} 次失败后暂停重试）`, 'InvalidStateError'));
  }
  dbPromise = new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 2);
    } catch (err) {
      // 同步抛（隐私模式 indexedDB 未定义/安全策略）同样不毒化缓存
      dbPromise = null;
      openFailStreak++;
      if (openFailStreak >= OPEN_MAX_STREAK) openBackoffUntil = Date.now() + OPEN_BACKOFF_MS;
      console.warn('[kv] IndexedDB open 同步抛出（隐私模式/安全策略?）', err);
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    let settled = false;
    let blockedTimer: ReturnType<typeof setTimeout> | null = null;
    const fail = (err: unknown, warn: string) => {
      if (settled) return;
      settled = true;
      dbPromise = null;   // ★毒化修复：失败不缓存——下次调用重试
      openFailStreak++;
      if (openFailStreak >= OPEN_MAX_STREAK) openBackoffUntil = Date.now() + OPEN_BACKOFF_MS;
      console.warn(`[kv] ${warn}`, err);
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    // ★blocked = 他标签页持旧版本连接不让路(旧 bundle 无 onversionchange 处理,
    // 生产首次 v1→v2 部署必踩)——告警后 3s 放弃 reject（对方让路则 onsuccess
    // 照常成功）;不再永久挂起。
    req.onblocked = () => {
      console.warn('[kv] IndexedDB 升级被其他标签页阻塞(关闭旧标签页即恢复)——3s 后放弃本次打开');
      blockedTimer = setTimeout(() => {
        fail(new DOMException('IndexedDB 升级被其他标签页阻塞（超时放弃）', 'VersionError'),
          'IndexedDB open 被其他标签页阻塞（超时放弃——关闭其他本站标签页即恢复）');
      }, OPEN_BLOCKED_TIMEOUT_MS);
    };
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      if (!req.result.objectStoreNames.contains(REMASTER_STORE)) req.result.createObjectStore(REMASTER_STORE);
    };
    req.onsuccess = () => {
      if (settled) { req.result.close(); return; }   // blocked 超时已放弃——让路后迟到的连接立即关闭
      settled = true;
      if (blockedTimer) clearTimeout(blockedTimer);
      openFailStreak = 0;   // 成功即清失败连击/退避
      const db = req.result;
      db.onversionchange = () => {   // 他页要升级 → 让路,本页缓存失效(下次调用重开)
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      if (blockedTimer) clearTimeout(blockedTimer);
      fail(req.error, `IndexedDB open 失败(${(req.error as DOMException | null)?.name ?? 'UnknownError'})`);
    };
  });
  return dbPromise;
}

// ---- ★R13-F2 LS 卫生垫（隐私模式/安全策略下 localStorage 访问同步抛——原语层统一
//  吞,调用方零感知）：LS 在 BJ615 单写后只是「双写时代历史副本」的兜底读面,不可用
//  =「无兜底副本」恰是本意而非错误;绝不能让 LS 抛错劫持 IDB 主链（kvDelete 曾因此
//  跳过 IDB 删除+调用方 FS 清理=隐私面,kvHas 抛曾炸 boot 门）。垫一次性 try/catch,
//  返 null/false=「LS 不可用」诚实档。 ----
/** LS 安全读（抛错返 null）。导出供原语层外消费点复用（mainFlow resolveLoadText 的
 *  lsRead 注入、Store 层 load 三段择源 LS 兜底腿——同一垫,免各处裸 try/catch 漂移）。 */
export function lsGetSafe(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsHasSafe(key: string): boolean {
  try { return localStorage.getItem(key) !== null; } catch { return false; }
}
function lsRemoveSafe(key: string): void {
  try { localStorage.removeItem(key); } catch { /* 隐私模式:LS 清不掉=残留副本留,但 IDB 删除与调用方清理面必须继续 */ }
}

/** 是否有某 key（IndexedDB 或 localStorage） */
export async function kvHas(key: string): Promise<boolean> {
  if (lsHasSafe(key)) return true;
  try {
    const db = await openDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getKey(key);
      req.onsuccess = () => resolve(req.result !== undefined);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/** 只读 IndexedDB（worker 安全：无 localStorage 依赖；大存档只进 IDB）。
 *  命中返回字符串，未命中/不可用返回 null */
export async function kvGetIdb(key: string): Promise<string | null> {
  return (await kvGetIdbEx(key)).value;
}

export type KvIdbReadCause = 'ok' | 'keyMissing' | 'typeMismatch' | 'openFailed' | 'txFailed';

/** ★BJ605（2026-10-10）只读 IndexedDB 精细版：与 kvGetIdb 同读取语义（kvGetIdb
 *  即本函数的 value 投影薄壳），但区分「键不存在 / 类型异常 / 打开失败 / 事务
 *  失败」——worker saveParse「存档数据缺失」三态错误分类的数据源。
 *  键不存在 = open/tx 都健康但 get 返回 undefined（cause:'keyMissing'），
 *  与「打不开库」（cause:'openFailed'，含退避窗拒绝）是两种可操作面完全不同的态。 */
export async function kvGetIdbEx(key: string): Promise<{ value: string | null; cause: KvIdbReadCause; detail?: string }> {
  try {
    const db = await openDb();
    try {
      return await new Promise<{ value: string | null; cause: KvIdbReadCause; detail?: string }>((resolve) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => {
          if (typeof req.result === 'string') resolve({ value: req.result, cause: 'ok' });
          else if (req.result === undefined) resolve({ value: null, cause: 'keyMissing' });
          else resolve({ value: null, cause: 'typeMismatch', detail: typeof req.result });
        };
        req.onerror = () => resolve({ value: null, cause: 'txFailed', detail: (req.error as DOMException | null)?.name });
      });
    } catch (err) {
      return { value: null, cause: 'txFailed', detail: err instanceof Error ? err.message : String(err) };
    }
  } catch (err) {
    return { value: null, cause: 'openFailed', detail: err instanceof Error ? err.message : String(err) };
  }
}

/** ★BJ605 诊断探测（只读面，不改变任何存储语义）：主线程报「存档数据缺失」
 *  时留物证——IDB 能否打开/失败原因/目标键是否存在于 IDB。用户自查指引与
 *  开发排查（DevTools 物证请求）共同依赖此输出。 */
export async function kvIdbStatus(key?: string): Promise<{ open: boolean; reason?: string; keyExists: boolean | 'unknown' }> {
  try {
    const db = await openDb();
    if (!key) return { open: true, keyExists: 'unknown' };
    try {
      const keyExists = await new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getKey(key);
        req.onsuccess = () => resolve(req.result !== undefined);
        // ★BJ620 件4（BJ616 F13）：tx 失败旧实现 resolve(false)→「键不存在」——诊断
        //  物证面失真（键在不在无从判定≠键不在,误导「存档数据缺失」归因）。改 reject
        //  落入下方 catch → { open:true, reason, keyExists:'unknown' } 诚实档。
        req.onerror = () => reject(tx.error ?? req.error ?? new Error('kvIdbStatus tx failed'));
      });
      return { open: true, keyExists };
    } catch (err) {
      return { open: true, reason: err instanceof Error ? err.message : String(err), keyExists: 'unknown' };
    }
  } catch (err) {
    return { open: false, reason: err instanceof Error ? err.message : String(err), keyExists: 'unknown' };
  }
}

/** 写入只进 IndexedDB(不占 localStorage)——大 JSON 专用:重制进度(含 prompt
 *  全文历史)/prompt 微调等随验收无界增长,kvSet 的 ≤2MB localStorage 快路径
 *  会把 5MB 全局上限撑爆(kvSet 超限兜底也进 IDB,但小数据仍占 localStorage)。 */
export async function kvSetIdb(key: string, value: string): Promise<'idb' | 'fail'> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return 'idb';
  } catch {
    return 'fail';
  }
}

/** 读取（IndexedDB 优先；★BJ615 单写后 LS 只剩双写时代历史副本——IDB miss 才兜底,
 *  保证有 IDB 档时绝不读到更陈旧的 LS 副本） */
export async function kvGet(key: string): Promise<string | null> {
  const idbVal = await kvGetIdb(key);
  if (idbVal !== null) return idbVal;
  return lsGetSafe(key);   // ★R13-F2：裸读曾随 LS 抛炸调用链——垫收
}

/** 写入：恒走 IndexedDB（★BJ615 2026-10-10 单写方案：摘 LS 写、留 LS 读兜底——
 *  用户明令「存储链避免把任何信息写入 localStorage，第一优先 IndexedDB」）。
 *  史注：2026-09-05 方案A 曾 ≤2MB 双写 localStorage（读加速副本）+IDB（权威），
 *  解 iOS ITP 7 天驱逐/壳浏览器单独清 LS 的蒸发面;现 IDB 恒权威已由 BJ605（open
 *  毒化修复+失败重试退避+blocked 超时）与 BJ611（persist 持久化申请+幽灵档扫描）
 *  双面加固,LS ~5MB 全局上限+多一写路径多一分维护面不再值得。LS 兜底读保留：
 *  双写时代 IDB 写失败过用户的旧副本仍可经 kvGet 救回（自然陈化）;kvDelete 双删
 *  清残留。返回值 'idb'|'fail'（'local' 档随单写退役——全库普查零消费方,BJ605
 *  写失败检测链只判 'fail',不受影响）。 */
export async function kvSet(key: string, value: string): Promise<'idb' | 'fail'> {
  return kvSetIdb(key, value);
}

/** 删除（两处都清：IDB + LS——★BJ615 单写后 LS 残留只来自双写时代旧副本,
 *  一并清掉防 kvGet 兜底读到已删数据）。★R13-F2：首语句裸 removeItem 曾随 LS 抛
 *  整体炸出——IDB 删除+调用方 FS 备份清理（onDeleted 链）全跳过=已删数据经恢复链
 *  复活的隐私面;现 LS 垫收,LS 清不掉不劫持 IDB 主删链。 */
export async function kvDelete(key: string): Promise<void> {
  lsRemoveSafe(key);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* IDB 不可用则忽略 */ }
}

/** ★BJ627（2026-10-10 偏好域 LS→IDB 迁移）扫取：getAllKeys 只枚举键串（键是小
 *  字符串——worlds/players 索引+zip 大值键混店也不入内存），命中 match 的键在
 *  同一 readonly 事务内逐个 get（string 通道；非 string 值=静默跳过）。任意
 *  失败=空表（调用方退 LS 收编序，自愈）。偏好域预载专用——绝不对全店取值。 */
export async function kvSweepIdb(match: (key: string) => boolean): Promise<Map<string, string>> {
  try {
    const db = await openDb();
    return await new Promise<Map<string, string>>((resolve) => {
      const out = new Map<string, string>();
      try {
        const tx = db.transaction(STORE, 'readonly');
        const store = tx.objectStore(STORE);
        const keysReq = store.getAllKeys();
        keysReq.onsuccess = () => {
          const all = (keysReq.result ?? []) as IDBValidKey[];
          for (const k of all) {
            const ks = String(k);
            if (!match(ks)) continue;
            const g = store.get(ks);
            g.onsuccess = () => { if (typeof g.result === 'string') out.set(ks, g.result); };
          }
        };
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => resolve(out);
        tx.onabort = () => resolve(out);
      } catch { resolve(out); }
    });
  } catch { return new Map(); }
}

/** ★BJ627 只删 IndexedDB（localStorage 不动，LS 清理由调用方自管——prefRemove
 *  需 try/catch 环境安全地清 LS）。kvDelete 的偏好域变体；IDB 不可用=静默。 */
export async function kvDeleteIdb(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* IDB 不可用则忽略 */ }
}

// ---- 资源包 zip blob(kv store 复用,'rp:zip:' 前缀键;2026-08-20 M13) ----
// ★不新开 object store(免 DB 版本升级 → 免多标签页 onblocked 阻塞窗口):
// IDB object store 无模式,键上放 Blob 与字符串同存;kvGet/kvSet 只走字符串
// 通道互不干扰。容量走 IndexedDB 配额(与 remaster blob store 同量级)。

// ★BJ620 件5（BJ616 F12 附刀）：rp/mod zip 通道失败旧实现全静默吞（put 返 false/
//  get 返 null）——资源包/mod 包装不上与存不进零物证。加一次性 console.warn 留物证
//  （同会话只报首例,防驱逐态每装一个包刷一条;读 miss 走 onsuccess 判型不算失败）。
let zipChannelWarned = false;
function warnZipChannelOnce(op: string, key: string, e: unknown): void {
  if (zipChannelWarned) return;
  zipChannelWarned = true;
  console.warn(`[kv] rp/mod zip 通道失败（一次性告警,后续静默）: ${op} ${key}`, e);
}

export async function rpPutZip(id: string, blob: Blob): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, `rp:zip:${id}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch (e) { warnZipChannelOnce('rpPutZip', `rp:zip:${id}`, e); return false; }
}

export async function rpGetZip(id: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    return await new Promise<Blob | null>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(`rp:zip:${id}`);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch (e) { warnZipChannelOnce('rpGetZip', `rp:zip:${id}`, e); return null; }
}

export async function rpDeleteZip(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(`rp:zip:${id}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) { warnZipChannelOnce('rpDeleteZip', `rp:zip:${id}`, e); /* IDB 不可用忽略 */ }
}

// ---- mod 包 zip blob('mod:zip:' 前缀键;2026-10-04 mod loader,与 rp 同款零升级策略) ----

export async function modPutZip(id: string, blob: Blob): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, `mod:zip:${id}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch (e) { warnZipChannelOnce('modPutZip', `mod:zip:${id}`, e); return false; }
}

export async function modGetZip(id: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    return await new Promise<Blob | null>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(`mod:zip:${id}`);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch (e) { warnZipChannelOnce('modGetZip', `mod:zip:${id}`, e); return null; }
}

export async function modDeleteZip(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(`mod:zip:${id}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) { warnZipChannelOnce('modDeleteZip', `mod:zip:${id}`, e); /* IDB 不可用忽略 */ }
}

// ---- 结构化克隆通用值存取（★BJ614 File System Access 目录句柄持久化） ----
// FileSystemDirectoryHandle 原生可结构化克隆但不是 string 也不是 Blob——kvSet/kvGet
// 字符串通道读不出（kvGetIdbEx 会按 typeMismatch 判掉）。同一 'kv' store 键域隔离
// （专用键 sandboxworld.fsBackup.*），零 schema 变更免 DB 版本升级（rp/mod zip 同策略）。

/** 写入任意结构化克隆值（句柄等）。true=落库成功。 */
export async function kvPutValue(key: string, value: unknown): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch { return false; }
}

/** 读取结构化克隆值；键不存在/库不可用/值非预期形状由调用方自行判型（返回 unknown）。 */
export async function kvGetUnknown(key: string): Promise<unknown> {
  try {
    const db = await openDb();
    return await new Promise<unknown>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

// ---- remaster blob store(v2;素材包混合 sheet png 持久化) ----

export interface RemasterPackRow {
  id: string;
  name: string;
  enabled: boolean;
  /** PackManifest 序列化(rect/hash/prompt 等元数据) */
  manifestJson: string;
  /** 'vanilla/NPC_1.png' → png Blob */
  sheets: Record<string, Blob>;
  addedAt: number;
}

/** 写入/覆盖一个素材包行。 */
export async function remasterPut(row: RemasterPackRow): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REMASTER_STORE, 'readwrite');
    tx.objectStore(REMASTER_STORE).put(row, row.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 全部已存素材包(按 addedAt 升序 = 安装序)。 */
export async function remasterAll(): Promise<RemasterPackRow[]> {
  const db = await openDb();
  return await new Promise<RemasterPackRow[]>((resolve, reject) => {
    const tx = db.transaction(REMASTER_STORE, 'readonly');
    const req = tx.objectStore(REMASTER_STORE).getAll();
    req.onsuccess = () => resolve(((req.result ?? []) as RemasterPackRow[]).sort((a, b) => a.addedAt - b.addedAt));
    req.onerror = () => reject(req.error);
  });
}

export async function remasterGet(id: string): Promise<RemasterPackRow | null> {
  const db = await openDb();
  return await new Promise<RemasterPackRow | null>((resolve, reject) => {
    const tx = db.transaction(REMASTER_STORE, 'readonly');
    const req = tx.objectStore(REMASTER_STORE).get(id);
    req.onsuccess = () => resolve((req.result as RemasterPackRow) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function remasterDelete(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REMASTER_STORE, 'readwrite');
    tx.objectStore(REMASTER_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}


/** 二进制存取助手已随 v6 二进制快路径退役（★BJ90 2026-09-15 债④死路径移除,BJ71 登记②
 *  ——kvSetCompat 同 key 双写竞态使二进制副本恒被 JSON 覆盖=零活跃消费方;唯一读方
 *  worldGen.worker 二进制分支同批退役,BinarySave.ts 已删）。守卫=tests/save-binary-deadpath.test.ts */