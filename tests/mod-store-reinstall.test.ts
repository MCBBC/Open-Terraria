// ★2026-10-16 用户令守卫:导入已存在且启用的 mod → 保持启用(不强行关闭);
//   重装保留既有启停态;首装缺省 false(不自动启用);显式 opts 尊重。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModStore, type ModStorage, type ModRow } from '../src/mods/store';

class MemStorage implements ModStorage {
  reg = '[]';
  zips = new Map<string, Blob>();
  async getRegistry() { return this.reg; }
  async setRegistry(json: string) { this.reg = json; }
  async putZip(id: string, blob: Blob) { this.zips.set(id, blob); return true; }
  async getZip(id: string) { return this.zips.get(id) ?? null; }
  async deleteZip(id: string) { this.zips.delete(id); }
}
const mkManifest = (id: string, version = '1.0.0') => ({
  id, name: id, version, api: 1 as const, side: 'both' as const,
});

describe('store.install 重装保留启停态(2026-10-16 用户令)', () => {
  let storage: MemStorage;
  let store: ModStore;
  beforeEach(() => { vi.resetModules(); storage = new MemStorage(); store = new ModStore(storage); });

  it('已启用的 mod 重装(导入新版)→ 保持启用', async () => {
    await store.install(mkManifest('m'), new Uint8Array(8), null, { enabled: true });
    expect((await store.listRows()).find((r) => r.id === 'm')?.enabled).toBe(true);
    // 面板导入路径:enabled:false 显式传——但重装须保留 existing(true)
    const row = await store.install(mkManifest('m', '2.0.0'), new Uint8Array(8), null, { enabled: false });
    expect(row.enabled).toBe(true);   // ★用户令:不强行关闭
    expect((await store.listRows()).find((r) => r.id === 'm')?.enabled).toBe(true);
    expect((await store.listRows()).find((r) => r.id === 'm')?.version).toBe('2.0.0');   // 版本更新生效
  });

  it('已停用的 mod 重装 → 保持停用', async () => {
    await store.install(mkManifest('m'), new Uint8Array(8), null, { enabled: true });
    await store.setEnabled('m', false);
    const row = await store.install(mkManifest('m', '2.0.0'), new Uint8Array(8), null, { enabled: true });
    expect(row.enabled).toBe(false);   // 用户停用选择不被目录/重装覆盖(D-M3)
  });

  it('首装缺省=启用(程序化语义);面板导入显式 false 落「不自动启用」', async () => {
    const r1 = await store.install(mkManifest('a'), new Uint8Array(8));
    expect(r1.enabled).toBe(true);    // 程序化安装缺省(夹具/桌面/探针)
    const r2 = await store.install(mkManifest('b'), new Uint8Array(8), null, { enabled: false });
    expect(r2.enabled).toBe(false);   // 面板导入路径显式传(用户令 2026-10-14)
  });

  it('重装保留 addedAt/icon(行序原位更新非尾插)', async () => {
    const r0 = await store.install(mkManifest('m'), new Uint8Array(8), null, { enabled: true });
    await store.install(mkManifest('n'), new Uint8Array(8), null, { enabled: true });
    const rows1 = await store.listRows();
    const r2 = await store.install(mkManifest('m', '2.0.0'), new Uint8Array(8), 'data:image/png;base64,xx');
    expect(r2.addedAt).toBe(r0.addedAt);   // 首装时间保留
    expect(r2.iconDataUrl).toBe('data:image/png;base64,xx');   // 新 icon 覆盖
    const rows2 = await store.listRows();
    expect(rows2.map((r: ModRow) => r.id)).toEqual(rows1.map((r: ModRow) => r.id));   // 行序不变
  });
});
