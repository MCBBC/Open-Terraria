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

const usage = new Map<string, number>();

function keyOf(modId: string, key: string): string {
  return `${PREFIX}${modId}.${key}`;
}

async function usageOf(modId: string, game?: unknown): Promise<number> {
  const cached = usage.get(modId);
  if (cached !== undefined) return cached;
  // 估算:遍历本 mod 键(KvStore 无 keys 面——localStorage 直接扫前缀;
  //  LS 池是兜底位,IDB 主链同键共存=同值;扫 LS 即代表性)
  let total = 0;
  try {
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(`${PREFIX}${modId}.`)) total += (localStorage.getItem(k) ?? '').length;
      }
    }
  } catch { /* LS 不可用=0 */ }
  usage.set(modId, total);
  void game;
  return total;
}

export interface ModStorageApi {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export function createModStorage(modId: string): ModStorageApi {
  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const raw = await kvGet(keyOf(modId, key));
        if (raw === null) return null;
        return JSON.parse(raw) as T;
      } catch { return null; }
    },
    async set<T>(key: string, value: T): Promise<boolean> {
      const raw = JSON.stringify(value);
      // 配额门(估算含新值差)
      const cur = await usageOf(modId);
      const prevRaw = await kvGet(keyOf(modId, key)).catch(() => null);
      const delta = raw.length - (prevRaw?.length ?? 0);
      if (cur + delta > QUOTA_BYTES) {
        console.warn(`[mod-storage] ${modId} 配额超限(${cur + delta}/${QUOTA_BYTES}B)——拒写 key=${key}`);
        return false;
      }
      const r = await kvSet(keyOf(modId, key), raw);
      usage.set(modId, cur + delta);
      return r !== 'fail';
    },
    async delete(key: string): Promise<void> {
      const prevRaw = await kvGet(keyOf(modId, key)).catch(() => null);
      await kvDelete(keyOf(modId, key));
      if (prevRaw) {
        const cur = usage.get(modId) ?? 0;
        usage.set(modId, Math.max(0, cur - prevRaw.length));
      }
    },
  };
}

/** mod 卸载沿:整段清(键空间前缀扫描;幂等) */
export async function purgeModStorage(modId: string): Promise<void> {
  try {
    if (typeof localStorage === 'undefined') return;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${PREFIX}${modId}.`)) keys.push(k);
    }
    for (const k of keys) {
      // KvStore kvDelete 双删(LS+IDB)
      await kvDelete(k).catch(() => undefined);
    }
    usage.delete(modId);
  } catch { /* 清理失败不阻断卸载 */ }
}

/** 测试清账 */
export function _resetModStorageForTests(): void {
  usage.clear();
}
