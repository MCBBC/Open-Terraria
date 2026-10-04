// .swmod 包读取(zip 展开 + mod.json 清单)。fflate 既有依赖(ResourcePackZip 同款,
// 零新依赖)。目录条目(fflate 以 '/' 结尾)与 __MACOSX 杂项剔除。
import { unzipSync, strFromU8 } from 'fflate';
import type { ModPack } from './types';
import { ModManifestError, parseModManifest } from './manifest';

export class ModPackError extends Error {}

/** zip 字节 → ModPack。缺 mod.json / 坏清单抛 ModPackError/ModManifestError。 */
export function readModPack(bytes: Uint8Array): ModPack {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (e) {
    throw new ModPackError(`zip 解压失败: ${(e as Error).message}`);
  }
  const files = new Map<string, Uint8Array>();
  let manifestJson: string | null = null;
  for (const [entry, data] of Object.entries(entries)) {
    if (entry.endsWith('/')) continue;                       // 目录条目
    if (entry.startsWith('__MACOSX/') || entry.includes('/__MACOSX/')) continue;
    if (entry === 'mod.json') {
      manifestJson = strFromU8(data);
      continue;
    }
    files.set(entry, data);
  }
  if (manifestJson === null) {
    throw new ModPackError('mod 包缺 mod.json');
  }
  const manifest = parseModManifest(manifestJson);
  return { manifest, files };
}

/** 从文件表读文本 json(L1 内容文件通用口) */
export function readPackJson<T>(pack: ModPack, path: string): T | null {
  const raw = pack.files.get(path);
  if (raw === undefined) return null;
  try {
    return JSON.parse(strFromU8(raw)) as T;
  } catch (e) {
    throw new ModPackError(`mod ${pack.manifest.id} 文件 ${path} JSON 解析失败: ${(e as Error).message}`);
  }
}

/** 目录约定自动发现:content/<dir>/*.json(键升序=确定性,同域联机/存档一致性的根) */
export function discoverPackJsonPaths(pack: ModPack, dir: string): string[] {
  const prefix = `content/${dir}/`;
  const out: string[] = [];
  for (const path of pack.files.keys()) {
    if (path.startsWith(prefix) && path.endsWith('.json')) out.push(path);
  }
  return out.sort();
}
