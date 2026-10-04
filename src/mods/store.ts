// mod 持久化(2026-10-04):注册表(kv 字符串键 sw.mods.installed)+ zip blob
// ('mod:zip:' 前缀)。ResourcePackStore 同构(PackStorage DI 模式照搬,node 单测
// 注入 Map;IndexedDB 缺席静默降级会话态)。
import { kvGet, kvSet, kvDelete, modPutZip, modGetZip, modDeleteZip } from '../save/KvStore';
import type { ModManifest } from './types';

const REGISTRY_KEY = 'sw.mods.installed';

/** mod 行(UI 面板/装载入口消费;冗余 manifest 展示字段免解 zip,ResourcePackStore 同款) */
export interface ModRow {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  enabled: boolean;
  addedAt: number;
}

export interface ModStorage {
  getRegistry(): Promise<string | null>;
  setRegistry(json: string): Promise<void>;
  putZip(id: string, blob: Blob): Promise<boolean>;
  getZip(id: string): Promise<Blob | null>;
  deleteZip(id: string): Promise<void>;
}

const kvStorage: ModStorage = {
  async getRegistry() { return kvGet(REGISTRY_KEY); },
  async setRegistry(json) { await kvSet(REGISTRY_KEY, json); },
  putZip: modPutZip,
  getZip: modGetZip,
  deleteZip: modDeleteZip,
};

function sanitizeRow(raw: unknown): ModRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string') return null;
  const str = (x: unknown, d = ''): string => (typeof x === 'string' ? x : d);
  return {
    id: o.id,
    name: str(o.name, o.id),
    version: str(o.version, '0.0.0'),
    author: str(o.author),
    description: str(o.description),
    enabled: o.enabled === true,
    addedAt: typeof o.addedAt === 'number' ? o.addedAt : 0,
  };
}

export class ModStore {
  constructor(private storage: ModStorage = kvStorage) {}

  async listRows(): Promise<ModRow[]> {
    try {
      const raw = await this.storage.getRegistry();
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.map(sanitizeRow).filter((r): r is ModRow => r !== null);
    } catch { return []; }
  }

  async saveRows(rows: readonly ModRow[]): Promise<void> {
    await this.storage.setRegistry(JSON.stringify(rows));
  }

  /** 安装:zip 字节落库 + 注册表行写 manifest 冗余字段。同 id 覆盖重装。
   *  ★P4 红蓝修正(D-m3):putZip 失败(IDB 不可用)即抛——旧实现注册表照写,
   *  UI 报"已安装"但 zip 未落,下次启动变"数据缺失"行 */
  async install(manifest: ModManifest, bytes: Uint8Array): Promise<ModRow> {
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    const ok = await this.storage.putZip(manifest.id, new Blob([copy], { type: 'application/zip' }));
    if (!ok) throw new Error('zip 落库失败(存储不可用)');
    const rows = (await this.listRows()).filter((r) => r.id !== manifest.id);
    const row: ModRow = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      author: manifest.author ?? '',
      description: manifest.description ?? '',
      enabled: true,
      addedAt: Date.now(),
    };
    rows.push(row);
    await this.saveRows(rows);
    return row;
  }

  async remove(id: string): Promise<void> {
    await this.storage.deleteZip(id);
    await this.saveRows((await this.listRows()).filter((r) => r.id !== id));
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const rows = await this.listRows();
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    row.enabled = enabled;
    await this.saveRows(rows);
  }

  getZipBytes(id: string): Promise<Blob | null> { return this.storage.getZip(id); }

  async clearAll(): Promise<void> {
    const rows = await this.listRows();
    for (const r of rows) await this.storage.deleteZip(r.id);
    await this.storage.setRegistry('[]');
  }
}

export { kvDelete as _kvDeleteForTests };
