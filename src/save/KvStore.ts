// 键值存储：优先 IndexedDB（容量数百 MB+，大地图存档不受 localStorage ~5MB 限制），
// localStorage 作为小存档缓存与回退。async API，调用方 await。
// v2(2026-08-19 素材重制管线):新增 remaster blob store(素材包 png 持久化,
// kv 字符串通道放不下);他标签页升级时让路(关闭+清缓存,下次调用重连)。
const DB_NAME = 'sandboxworld';
const STORE = 'kv';
const REMASTER_STORE = 'remaster';
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    // ★blocked = 他标签页持旧版本连接不让路(旧 bundle 无 onversionchange 处理,
    // 生产首次 v1→v2 部署必踩)——只告警不重试;调用方(main 装配)有超时兜底
    req.onblocked = () => console.warn('[kv] IndexedDB 升级被其他标签页阻塞(关闭旧标签页即恢复)');
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      if (!req.result.objectStoreNames.contains(REMASTER_STORE)) req.result.createObjectStore(REMASTER_STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {   // 他页要升级 → 让路,本页缓存失效(下次调用重开)
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
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
  try {
    const db = await openDb();
    return await new Promise<string | null>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
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
