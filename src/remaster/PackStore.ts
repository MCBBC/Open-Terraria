// 素材包持久化(IndexedDB remaster blob store 高层封装,KvStore v2 之上):
//   已安装 pack(manifest+混合 sheet png)与工作台按帧进度(EntryProgress JSON
//   + 帧级 RGBA blob)两类数据。进度帧像素量大(60×44×4≈10KB/帧)不能走
//   kv 字符串通道,与 pack 同住 remaster store。
import { kvGet, kvSet, kvDelete, remasterPut, remasterAll, remasterDelete, type RemasterPackRow } from '../save/KvStore';
import type { LoadedPack, EntryProgress, PackManifest } from './types';

/** 进度 JSON 的 kv 键(小,字符串通道) */
const PROGRESS_KEY = 'sw.remaster.progress';
/** 帧像素 blob 行 id(remaster store 单行) */
const FRAME_PIXELS_ID = '__workbench_frames';
/** 已安装包注册表 kv 键(轻元数据;blob 在 remaster store) */
const INSTALLED_KEY = 'sw.remaster.installed';

// ---- 已安装 pack ----

export interface InstalledMeta { id: string; name: string; enabled: boolean; addedAt: number }

export async function listInstalled(): Promise<InstalledMeta[]> {
  try {
    const raw = await kvGet(INSTALLED_KEY);
    return raw ? (JSON.parse(raw) as InstalledMeta[]) : [];
  } catch { return []; }
}

async function saveInstalled(list: InstalledMeta[]): Promise<void> {
  await kvSet(INSTALLED_KEY, JSON.stringify(list));
}

export async function savePack(pack: LoadedPack): Promise<InstalledMeta> {
  const addedAt = Date.now();
  const meta: InstalledMeta = { id: pack.id, name: pack.manifest.name, enabled: true, addedAt };
  await remasterPut({
    id: pack.id, name: pack.manifest.name, enabled: true,
    manifestJson: JSON.stringify(pack.manifest),
    sheets: Object.fromEntries(pack.sheets),
    addedAt,
  });
  const list = await listInstalled();
  await saveInstalled([...list.filter((m) => m.id !== pack.id), meta].sort((a, b) => a.addedAt - b.addedAt));
  return meta;
}

/** 读回全部已安装包(按安装序;blob → LoadedPack)。 */
export async function loadInstalledPacks(): Promise<Array<{ meta: InstalledMeta; pack: LoadedPack }>> {
  const metas = await listInstalled();
  const rows = await remasterAll();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: Array<{ meta: InstalledMeta; pack: LoadedPack }> = [];
  for (const meta of metas) {
    const row = byId.get(meta.id) as (RemasterPackRow | undefined);
    if (!row) continue;   // 注册表有、blob 无(旧库残留):跳过(导入时已警告)
    let manifest: PackManifest;
    try { manifest = JSON.parse(row.manifestJson) as PackManifest; } catch { continue; }
    out.push({ meta, pack: { id: row.id, manifest, sheets: new Map(Object.entries(row.sheets)) } });
  }
  return out;
}

export async function setPackEnabled(id: string, enabled: boolean): Promise<void> {
  const list = await listInstalled();
  await saveInstalled(list.map((m) => (m.id === id ? { ...m, enabled } : m)));
}

export async function deletePack(id: string): Promise<void> {
  await remasterDelete(id);
  await saveInstalled((await listInstalled()).filter((m) => m.id !== id));
}

// ---- 工作台按帧进度 ----

export async function loadProgress(): Promise<Record<string, EntryProgress>> {
  try {
    const raw = await kvGet(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, EntryProgress>) : {};
  } catch { return {}; }
}

export async function saveProgress(p: Record<string, EntryProgress>): Promise<void> {
  await kvSet(PROGRESS_KEY, JSON.stringify(p));
}

/** 帧像素键:`{entryKey}|{frameIdx}`。 */
export function frameKey(entryKey: string, frameIdx: number): string {
  return `${entryKey}|${frameIdx}`;
}

async function frameRow(): Promise<Record<string, Blob>> {
  const rows = await remasterAll();
  return rows.find((r) => r.id === FRAME_PIXELS_ID)?.sheets ?? {};
}

export async function putFramePixels(entryKey: string, frameIdx: number, pixels: Uint8ClampedArray): Promise<void> {
  const sheets = await frameRow();
  sheets[frameKey(entryKey, frameIdx)] = new Blob([pixels as unknown as BlobPart], { type: 'application/octet-stream' });
  await remasterPut({ id: FRAME_PIXELS_ID, name: '__workbench_frames', enabled: false, manifestJson: '{}', sheets, addedAt: 0 });
}

export async function getFramePixels(entryKey: string, frameIdx: number): Promise<Uint8ClampedArray | null> {
  const sheets = await frameRow();
  const blob = sheets[frameKey(entryKey, frameIdx)];
  if (!blob) return null;
  return new Uint8ClampedArray(await blob.arrayBuffer());
}

export async function deleteFramePixels(entryKey: string, frameIdx: number): Promise<void> {
  const sheets = await frameRow();
  delete sheets[frameKey(entryKey, frameIdx)];
  await remasterPut({ id: FRAME_PIXELS_ID, name: '__workbench_frames', enabled: false, manifestJson: '{}', sheets, addedAt: 0 });
}

/** 清全部工作进度(导出后重置;不动已安装 pack)。 */
export async function clearProgress(): Promise<void> {
  await kvDelete(PROGRESS_KEY);
  await remasterDelete(FRAME_PIXELS_ID);
}
