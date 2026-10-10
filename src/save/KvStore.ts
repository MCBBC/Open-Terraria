// 键值存储：优先 IndexedDB（容量数百 MB+，大地图存档不受 localStorage ~5MB 限制），
// localStorage 作为小存档缓存与回退。async API，调用方 await。
// v2(2026-08-19 素材重制管线):新增 remaster blob store(素材包 png 持久化,
// kv 字符串通道放不下);他标签页升级时让路(关闭+清缓存,下次调用重连)。
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

/** 是否有某 key（IndexedDB 或 localStorage） */
export async function kvHas(key: string): Promise<boolean> {
  if (localStorage.getItem(key) !== null) return true;
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
      const keyExists = await new Promise<boolean>((resolve) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getKey(key);
        req.onsuccess = () => resolve(req.result !== undefined);
        req.onerror = () => resolve(false);
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

/** 读取（IndexedDB 优先——大存档只进 IDB，localStorage 可能留着旧的小存档；
   读取顺序必须与写入优先级一致，否则会读到过期档） */
export async function kvGet(key: string): Promise<string | null> {
  const idbVal = await kvGetIdb(key);
  if (idbVal !== null) return idbVal;
  return localStorage.getItem(key);
}

/** 写入：字符串 ≤ 2MB 双写 localStorage(读加速副本)+IndexedDB(权威),>2MB 只进 IDB。
 *  ★双写(2026-09-05 方案A):小记录此前只落 localStorage(唯一副本)——iOS ITP 7 天
 *  驱逐/壳浏览器单独清 localStorage 会让角色外观/随身态蒸发而 IDB 空闲;现 IDB
 *  恒为权威副本,localStorage 仅加速。localStorage 满溢不再影响数据安全
 *  (catch 后仍写 IDB,返回值如实反映落点)。 */
export async function kvSet(key: string, value: string): Promise<'local' | 'idb' | 'fail'> {
  let where: 'local' | 'idb' = 'idb';
  if (value.length <= 2 * 1024 * 1024) {
    try {
      localStorage.setItem(key, value);
      where = 'local';
    } catch { /* 超限或被禁 → IDB 单写 */ }
  }
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return where;
  } catch {
    // IDB 也不可用:快路径已成功(≤2MB)算 'local',否则整体失败
    return where === 'local' ? 'local' : 'fail';
  }
}

/** 删除（两处都清） */
export async function kvDelete(key: string): Promise<void> {
  localStorage.removeItem(key);
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
  } catch { return false; }
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
  } catch { return null; }
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
  } catch { /* IDB 不可用忽略 */ }
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
  } catch { return false; }
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
  } catch { return null; }
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
  } catch { /* IDB 不可用忽略 */ }
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