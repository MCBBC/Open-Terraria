// 资源包 zip 读取 + pack.json 清单解析（M13）。
// 原版语义（ResourcePack.cs 1:1）：
//   - 包结构 = zip 根 { pack.json, icon.png?, Content/** }；无 pack.json 直接拒绝
//     （LoadManifest :121-123 FileNotFoundException "must contain a pack.json file"）。
//   - 清单字段 Name/Description/Author/Version{major,minor}；版本展示
//     GetFormattedVersion() = "Major.Minor"（ResourcePackVersion.cs）。
//   - 缺字段不致命（JToken 显式转换 null → 空串），仅缺文件致命。
// zip 解压 = fflate（既有依赖，package.json dependencies ^0.8.3，零新依赖）。
import { unzipSync, strFromU8 } from 'fflate';
import { isPackIcon, isPackManifest, mapPackAsset, stripContentRoot, type MappedAsset } from './packPaths';

/** pack.json 清单（ResourcePack.Name/Description/Author/Version） */
export interface PackManifestInfo {
  name: string;
  description: string;
  author: string;
  version: { major: number; minor: number };
}

export function formatPackVersion(v: { major: number; minor: number }): string {
  return `${v.major}.${v.minor}`;   // ResourcePackVersion.GetFormattedVersion()
}

/** 解析后的资源包（导入/启动共用形态） */
export interface ParsedResourcePack {
  manifest: PackManifestInfo;
  /** icon.png 原始字节（缺省 null → UI 用默认图标） */
  iconPng: Uint8Array | null;
  /** SpriteAtlas 键（形如 vanilla/<X>.png 或 vanilla-ui/<X>.png）→ png 字节 */
  images: Map<string, Uint8Array>;
  /** Sfx 键（sounds/<file>.wav 的 file）→ 音频字节 */
  sounds: Map<string, Uint8Array>;
  /** FontFace 族名 → 字体字节 */
  fonts: Map<string, Uint8Array>;
  /** 计数（信息页/日志）：镜像双写后的图片数 / 音频 / 字体 / 跳过明细 */
  counts: { images: number; sounds: number; fonts: number; skippedXnb: number; skippedUnknown: number };
}

/** pack.json 解析（缺字段回退空串/0.0；非 JSON 视为损坏） */
export function parsePackManifest(jsonText: string): PackManifestInfo {
  const o = JSON.parse(jsonText) as Record<string, unknown>;
  const ver = (o.Version ?? o.version) as Record<string, unknown> | undefined;
  const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? Math.trunc(x) : 0);
  return {
    name: typeof o.Name === 'string' ? o.Name : typeof o.name === 'string' ? o.name : '',
    description: typeof o.Description === 'string' ? o.Description : '',
    author: typeof o.Author === 'string' ? o.Author : '',
    version: {
      major: num(ver?.major ?? ver?.Major),
      minor: num(ver?.minor ?? ver?.Minor),
    },
  };
}

export class ResourcePackError extends Error {}

/** 读 zip 字节 → ParsedResourcePack。无 pack.json 抛 ResourcePackError（原版拒绝装）。
 *  坏 zip（fflate 抛出）向上透传为 ResourcePackError。 */
export function readResourcePack(bytes: Uint8Array): ParsedResourcePack {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (e) {
    throw new ResourcePackError(`zip 解压失败: ${(e as Error).message}`);
  }
  let manifest: PackManifestInfo | null = null;
  let iconPng: Uint8Array | null = null;
  const images = new Map<string, Uint8Array>();
  const sounds = new Map<string, Uint8Array>();
  const fonts = new Map<string, Uint8Array>();
  const counts = { images: 0, sounds: 0, fonts: 0, skippedXnb: 0, skippedUnknown: 0 };
  for (const [entry, data] of Object.entries(entries)) {
    if (isPackManifest(entry)) {
      try {
        manifest = parsePackManifest(strFromU8(data));
      } catch (e) {
        throw new ResourcePackError(`pack.json 解析失败: ${(e as Error).message}`);
      }
      continue;
    }
    if (isPackIcon(entry)) { iconPng = data; continue; }
    const rel = stripContentRoot(entry);
    if (rel === null) continue;   // 包根散件/目录条目：无视（原版同——Content 外不可见）
    const mapped: MappedAsset[] = mapPackAsset(rel);
    if (mapped.length === 0) {
      if (/\.(xnb|rawimg)$/i.test(rel)) counts.skippedXnb++;   // web 不可解码格式
      else counts.skippedUnknown++;
      continue;
    }
    for (const m of mapped) {
      if (m.kind === 'image') { images.set(m.file, data); counts.images++; }
      else if (m.kind === 'sound') { sounds.set(m.file, data); counts.sounds++; }
      else { fonts.set(m.family, data); counts.fonts++; }
    }
  }
  if (!manifest) {
    // ResourcePack.cs:121-123：缺 pack.json 的包不可用
    throw new ResourcePackError('资源包缺少 pack.json（Resource Pack must contain a pack.json file）');
  }
  return { manifest, iconPng, images, sounds, fonts, counts };
}
