// mod 持久 KV 存储(★Tier1-a,2026-10-14;sw.storage)。
// 底座=KvStore(LS 兜底+IDB 主链既有);键空间强制前缀 sandboxworld.mods.<modId>.
// (mod 间零碰撞/mod 卸载可整段清);值=JSON 字符串化(stringify/parse 引擎侧
// 包办——mod 侧直接存取 JS 值)。
// 配额守卫:per-mod 累计写入字节 >2MB 拒写(warn;localStorage 5MB 全局池的
//  保守份额——IDB 主链远大,但保守门防 mod 失控循环写)。
import { kvGet, kvSet, kvDelete } from '../save/KvStore';

const PREFIX = 'sandboxworld.mods.';
/** per-mod 配额(字节;超=拒写+warn) */
const QUOTA_BYTES = 2 * 1024 * 1024;

/** 存储后端(生产=KvStore IDB 主链[BJ615 单写方案:禁 LS 写];测试注入内存版) */
export interface ModStorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** 前缀扫描(配额估算/purge 用;返回 [key, value] 对) */
  scanPrefix(prefix: string): Promise<Array<[string, string]>>;
}

/** 生产后端:KvStore IDB(KvStore 无 keys 面——扫描经 LS 兜底读位
 *  [BJ615 后 LS 只剩历史副本,对新写键恒 miss=新键扫描贡献 0,配额记账
 *  依赖 set/delete 侧增量维护——首扫仅校准存量];node 无 IDB=空扫) */
const kvBackend: ModStorageBackend = {
  get: (k) => kvGet(k),
  set: async (k, v) => (await kvSet(k, v)) !== 'fail',
  delete: (k) => kvDelete(k),
  async scanPrefix(prefix) {
    const out: Array<[string, string]> = [];
    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(prefix)) out.push([k, localStorage.getItem(k) ?? '']);
        }
      }
    } catch { /* LS 不可用=空扫 */ }
    return out;
  },
};

const usage = new Map<string, number>();

function keyOf(modId: string, key: string): string {
  return `${PREFIX}${modId}.${key}`;
}

async function usageOf(modId: string, backend: ModStorageBackend): Promise<number> {
  const cached = usage.get(modId);
  if (cached !== undefined) return cached;
  let total = 0;
  for (const [, v] of await backend.scanPrefix(`${PREFIX}${modId}.`)) total += v.length;
  usage.set(modId, total);
  return total;
}

export interface ModStorageApi {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export function createModStorage(modId: string, backend: ModStorageBackend = kvBackend): ModStorageApi {
  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const raw = await backend.get(keyOf(modId, key));
        if (raw === null) return null;
        return JSON.parse(raw) as T;
      } catch { return null; }
    },
    async set<T>(key: string, value: T): Promise<boolean> {
      const raw = JSON.stringify(value);
      // 配额门(估算含新值差)
      const cur = await usageOf(modId, backend);
      const prevRaw = await backend.get(keyOf(modId, key)).catch(() => null);
      const delta = raw.length - (prevRaw?.length ?? 0);
      if (cur + delta > QUOTA_BYTES) {
        console.warn(`[mod-storage] ${modId} 配额超限(${cur + delta}/${QUOTA_BYTES}B)——拒写 key=${key}`);
        return false;
      }
      const ok = await backend.set(keyOf(modId, key), raw);
      if (ok) usage.set(modId, cur + delta);
      return ok;
    },
    async delete(key: string): Promise<void> {
      const prevRaw = await backend.get(keyOf(modId, key)).catch(() => null);
      await backend.delete(keyOf(modId, key));
      if (prevRaw) {
        const cur = usage.get(modId) ?? 0;
        usage.set(modId, Math.max(0, cur - prevRaw.length));
      }
    },
  };
}

/** mod 卸载沿:整段清(键空间前缀扫描;幂等) */
export async function purgeModStorage(modId: string, backend: ModStorageBackend = kvBackend): Promise<void> {
  try {
    for (const [k] of await backend.scanPrefix(`${PREFIX}${modId}.`)) {
      await backend.delete(k).catch(() => undefined);
    }
    usage.delete(modId);
  } catch { /* 清理失败不阻断卸载 */ }
}

/** 测试清账 */
export function _resetModStorageForTests(): void {
  usage.clear();
}
