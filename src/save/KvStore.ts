// 键值存储：优先 IndexedDB（容量数百 MB+，大地图存档不受 localStorage ~5MB 限制），
// localStorage 作为小存档缓存与回退。async API，调用方 await。
const DB_NAME = 'sandboxworld';
const STORE = 'kv';
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
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

/** 读取（IndexedDB 优先——大存档只进 IDB，localStorage 可能留着旧的小存档；
   读取顺序必须与写入优先级一致，否则会读到过期档） */
export async function kvGet(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    const idbVal = await new Promise<string | null>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => resolve(null);
    });
    if (idbVal !== null) return idbVal;
  } catch { /* IDB 不可用 → 回退 localStorage */ }
  return localStorage.getItem(key);
}

/** 写入：字符串 ≤ 2MB 进 localStorage（快速路径），否则只进 IndexedDB */
export async function kvSet(key: string, value: string): Promise<'local' | 'idb' | 'fail'> {
  if (value.length <= 2 * 1024 * 1024) {
    try {
      localStorage.setItem(key, value);
      return 'local';
    } catch { /* 超限或被禁 → 落 IndexedDB */ }
  }
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
