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
  // ★P5 红蓝修正(D-n1):解压总量护栏(zip 炸弹防渲染进程 OOM;与"失败只登记"
  //  哲学一致=拒载该包而非崩进程)。256MB=与 IDB 配额同量级的保守上限
  {
    let total = 0;
    for (const data of Object.values(entries)) total += data.length;
    if (total > 256 * 1024 * 1024) {
      throw new ModPackError(`mod 包解压总量超限(${(total / 1048576).toFixed(0)}MB > 256MB)`);
    }
  }
  const files = new Map<string, Uint8Array>();
  let manifestJson: string | null = null;
  for (const [entryRaw, data] of Object.entries(entries)) {
    // ★P4 红蓝修正(D-m2):entry 名归一——Windows 工具的反斜杠/`./` 前缀会让
    //  content/mod.json 发现面静默丢失(装载"成功"但 0 内容,无任何 error)
    const entry = entryRaw.split('\\').join('/').replace(/(?:^|\/)\.\//g, '/');
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
