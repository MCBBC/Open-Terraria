// 素材包格式(sw-remaster-pack/1):manifest + 镜像原版路径的混合 sheet png,
// 外壳为 ZIP_STORED(PNG 已压缩,store 零损零依赖)。
// 手写 zip writer/reader(CRC32 查表 + 本地文件头 + central directory + EOCD),
// 读取端兼容 deflate 条目(浏览器/node 通用 DecompressionStream('deflate-raw'))。
import type { PackManifest, PackEntryMeta, LoadedPack } from './types';

export const PACK_FORMAT = 'sw-remaster-pack/1';

// ---- CRC32(IEEE,查表) ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array, seed = 0): number {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- zip STORED writer ----

export interface ZipEntry { name: string; data: Uint8Array }

/** 打 ZIP_STORED 包。文件名 UTF-8(zip 通用位 0x800)。 */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const lh = new Uint8Array(30 + name.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true);   // local file header signature
    dv.setUint16(4, 20, true);           // version needed
    dv.setUint16(6, 0x0800, true);       // UTF-8 flag
    dv.setUint16(8, 0, true);            // method: store
    dv.setUint16(10, 0, true); dv.setUint16(12, 0, true); // time/date(未用)
    dv.setUint32(14, crc, true);
    dv.setUint32(18, e.data.length, true);
    dv.setUint32(22, e.data.length, true);
    dv.setUint16(26, name.length, true);
    dv.setUint16(28, 0, true);           // extra len
    lh.set(name, 30);
    chunks.push(lh, e.data);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);   // central directory signature
    cv.setUint16(4, 20, true);           // version made by
    cv.setUint16(6, 20, true);           // version needed
    cv.setUint16(8, 0x0800, true);       // UTF-8 flag
    cv.setUint16(10, 0, true);           // method: store
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);      // local header offset
    ch.set(name, 46);
    central.push(ch);
    offset += lh.length + e.data.length;
  }
  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of [...chunks, ...central, eocd]) { out.set(c, p); p += c.length; }
  return out;
}

// ---- zip reader(STORED + deflate 兜底) ----

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(zipBytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  // EOCD 在尾部 22..22+65535 内反向找
  let eocd = -1;
  for (let i = zipBytes.length - 22; i >= Math.max(0, zipBytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('非 zip 包(找不到 EOCD)');
  const count = dv.getUint16(eocd + 10, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error(`central directory 损坏 @${p}`);
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(zipBytes.subarray(p + 46, p + 46 + nameLen));
    // local header:name/extra 长度独立于 central
    const lhNameLen = dv.getUint16(lho + 26, true);
    const lhExtraLen = dv.getUint16(lho + 28, true);
    const dataStart = lho + 30 + lhNameLen + lhExtraLen;
    const raw = zipBytes.subarray(dataStart, dataStart + csize);
    out.set(name, method === 0 ? new Uint8Array(raw) : await inflateRaw(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ---- manifest ----

export interface ManifestOk { ok: true; manifest: PackManifest; warnings: string[] }
export interface ManifestBad { ok: false; reason: string }

/** 解析+校验 manifest(format 门 + 结构检查;baseVersion 不符是 warning 不是拒绝:
 *  帧定位靠 manifest 自带 rect,不依赖当前 vanilla.json)。 */
export function parseManifest(json: unknown): ManifestOk | ManifestBad {
  if (typeof json !== 'object' || json === null) return { ok: false, reason: 'manifest 非对象' };
  const m = json as Record<string, unknown>;
  if (m.format !== PACK_FORMAT) return { ok: false, reason: `不支持的素材包格式:${String(m.format)}(本框架 ${PACK_FORMAT})` };
  if (typeof m.name !== 'string') return { ok: false, reason: '缺 name' };
  if (typeof m.baseVersion !== 'string') return { ok: false, reason: '缺 baseVersion' };
  if (typeof m.entries !== 'object' || m.entries === null) return { ok: false, reason: '缺 entries' };
  for (const [file, ent] of Object.entries(m.entries as Record<string, unknown>)) {
    if (typeof file !== 'string' || !/^(vanilla|vanilla-ui)\//.test(file)) {
      return { ok: false, reason: `entries 键 "${file}" 非原版镜像路径` };
    }
    const e = ent as Record<string, unknown>;
    if (typeof e !== 'object' || e === null || typeof e.category !== 'string' || typeof e.frames !== 'object') {
      return { ok: false, reason: `entries.${file} 结构损坏` };
    }
  }
  const warnings: string[] = [];
  return { ok: true, manifest: json as unknown as PackManifest, warnings };
}

/** 组 manifest(工作台导出用)。 */
export function buildManifest(name: string, baseVersion: string, entries: Record<string, PackEntryMeta>): PackManifest {
  return { format: PACK_FORMAT, name, createdAt: new Date().toISOString(), baseVersion, entries };
}

// ---- pack 打/读(整包层) ----

export const MANIFEST_PATH = 'remaster-manifest.json';
/** sheet 在 zip 内的路径前缀(镜像原版相对路径,便于人工核对) */
export const SHEETS_PREFIX = 'sheets/';

/** 打整包:manifest + 混合 sheet png。 */
export function makePack(manifest: PackManifest, sheets: Array<{ file: string; png: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder();
  return zipStore([
    { name: MANIFEST_PATH, data: enc.encode(JSON.stringify(manifest, null, 1)) },
    ...sheets.map((s) => ({ name: SHEETS_PREFIX + s.file, data: s.png })),
  ]);
}

/** 读整包:zip → {manifest, sheets}。manifest 损坏抛错;sheets 键转 SpriteAtlas 键
 *  (去 SHEETS_PREFIX;非 vanilla|vanilla-ui 镜像路径丢弃——zip 内 `sheets/../..`
 *  逃逸条目只配静默丢,不值得拒装整包)。 */
export async function readPack(zipBytes: Uint8Array): Promise<LoadedPack> {
  const files = await unzip(zipBytes);
  const mfRaw = files.get(MANIFEST_PATH);
  if (!mfRaw) throw new Error('素材包缺 remaster-manifest.json');
  const parsed = parseManifest(JSON.parse(new TextDecoder().decode(mfRaw)));
  if (!parsed.ok) throw new Error(parsed.reason);
  const sheets = new Map<string, Blob>();
  for (const [name, data] of files) {
    if (!name.startsWith(SHEETS_PREFIX)) continue;
    const file = name.slice(SHEETS_PREFIX.length);
    if (!/^(vanilla|vanilla-ui)\//.test(file)) continue;   // 路径白名单(与 manifest 键同规)
    sheets.set(file, new Blob([data as unknown as BlobPart], { type: 'image/png' }));
  }
  // manifest 声明的 sheet 缺文件 → 只警告不拒装(局部覆盖语义)
  const missing = Object.keys(parsed.manifest.entries).filter((f) => !sheets.has(f));
  if (missing.length) console.warn(`[remaster] manifest 声明 ${missing.length} 张 sheet 缺文件,跳过:${missing.slice(0, 3).join(', ')}…`);
  const id = `pack-${parsed.manifest.name}-${parsed.manifest.baseVersion}`;
  return { id, manifest: parsed.manifest, sheets };
}
