// 资源包持久化（M13）：已装列表注册表（kv 字符串通道）+ zip blob（'rp:zip:' 前缀
// 键，KvStore kv store 内）。对应原版 config.json 的 ResourcePacks JArray
// （ResourcePackList.ToJson/FromJson：FileName/Enabled/SortingOrder）——本仓行内
// 冗余 manifest 展示字段（Name/Author/Version/Description/Icon），读档免解 zip。
// 存储接口 DI（node 单测注入 Map；浏览器走 KvStore——IndexedDB 缺席时全链路静默
// 降级为会话级，不阻断）。
import { kvGet, kvSet, kvDelete, rpPutZip, rpGetZip, rpDeleteZip } from '../save/KvStore';
import type { PackRow } from './ResourcePackList';

const REGISTRY_KEY = 'sw.resourcepacks.installed';

/** kv 字符串通道 + zip blob 通道的最小存储接口（node 单测用 Map stub） */
export interface PackStorage {
  getRegistry(): Promise<string | null>;
  setRegistry(json: string): Promise<void>;
  putZip(id: string, blob: Blob): Promise<boolean>;
  getZip(id: string): Promise<Blob | null>;
  deleteZip(id: string): Promise<void>;
}

/** 浏览器实现（KvStore；IDB/localStorage 缺席 → 各操作自兜底） */
const kvStorage: PackStorage = {
  async getRegistry() { return kvGet(REGISTRY_KEY); },
  async setRegistry(json) { await kvSet(REGISTRY_KEY, json); },
  putZip: rpPutZip,
  getZip: rpGetZip,
  deleteZip: rpDeleteZip,
};

/** 行数据净化：旧档/手改坏行剔除非法字段（FromJson 对单包失败仅 Console.WriteLine
 *  跳过 :110-113 的宽容语义——这里对行内字段钳默认，整行坏则弃） */
function sanitizeRow(raw: unknown): PackRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.fileName !== 'string') return null;
  const str = (x: unknown, d = ''): string => (typeof x === 'string' ? x : d);
  const ver = (o.version ?? {}) as Record<string, unknown>;
  return {
    id: o.id,
    fileName: o.fileName,
    name: str(o.name, o.fileName),
    description: str(o.description),
    author: str(o.author),
    version: {
      major: typeof ver.major === 'number' ? Math.trunc(ver.major) : 0,
      minor: typeof ver.minor === 'number' ? Math.trunc(ver.minor) : 0,
    },
    enabled: o.enabled === true,
    sortingOrder: typeof o.sortingOrder === 'number' ? Math.trunc(o.sortingOrder) : 0,
    addedAt: typeof o.addedAt === 'number' ? o.addedAt : 0,
    fileCount: typeof o.fileCount === 'number' ? Math.trunc(o.fileCount) : 0,
    iconDataUrl: typeof o.iconDataUrl === 'string' ? o.iconDataUrl : null,
  };
}

export class ResourcePackStore {
  constructor(private storage: PackStorage = kvStorage) {}

  async listRows(): Promise<PackRow[]> {
    try {
      const raw = await this.storage.getRegistry();
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.map(sanitizeRow).filter((r): r is PackRow => r !== null);
    } catch { return []; }
  }

  async saveRows(rows: readonly PackRow[]): Promise<void> {
    await this.storage.setRegistry(JSON.stringify(rows));
  }

  async putZip(id: string, bytes: Uint8Array): Promise<boolean> {
    // zip blob 拷贝进 Blob（防调用方复用缓冲区导致存储内容漂移）
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return this.storage.putZip(id, new Blob([copy], { type: 'application/zip' }));
  }

  getZip(id: string): Promise<Blob | null> { return this.storage.getZip(id); }

  async remove(id: string): Promise<void> {
    await this.storage.deleteZip(id);
    await this.saveRows((await this.listRows()).filter((r) => r.id !== id));
  }

  /** 清注册表整键（测试用；zip 逐 id 清） */
  async clearAll(): Promise<void> {
    const rows = await this.listRows();
    for (const r of rows) await this.storage.deleteZip(r.id);
    await this.storage.setRegistry('[]');
  }
}

/** kvDelete 直通（卸载兜底；测试重置） */
export { kvDelete as _kvDeleteForTests };
