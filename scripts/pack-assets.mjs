// 资源 zip 打包（2026-08-19：12003 文件 461MB 逐文件 warm → ~10 个 zip 分片）。
// 纯函数导出 + CLI 薄壳（先例 tests/l10n-merge.test.ts 直测 .mjs）：
//   · 扫描固定输入目录超集（l10n 排除——SW 网络优先可变语义；三个 json 已进 JS bundle）
//   · sha1 内容清单：mtime+size 未变沿用旧值（快路径 <2s）；contentHash 变才重打
//   · 逐片跳过：片输入 hash 集与旧 manifest 一致 → 复用旧 zip
//   · 片名 p<i>-<zip hash8>.zip（内容寻址，HTTP 缓存天然安全）
//   · node_modules/fflate/umd → public/vendor/fflate.js（SW importScripts 用，sha256 记账）
// 产物 public/assets-zip/manifest.json + p*.zip；状态 game/.pack-assets-state.json
// （★不放 public/——vite 全量拷 dist 会泄漏）。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { zipSync } from 'fflate';

const PUB = join(import.meta.dirname, '..', 'public');
const OUT_DIR = join(PUB, 'assets-zip');
const STATE_PATH = join(import.meta.dirname, '..', '.pack-assets-state.json');

/** 输入目录（web 相对路径 = zip 条目名 = SW cache key），顺序 = 打包优先级（确定性） */
export const INPUT_DIRS = ['fonts', 'sprites/vanilla-ui', 'sprites/vanilla', 'sounds', 'audios/music'];
const DIR_PHASE = {
  'fonts': 'menu', 'sprites/vanilla-ui': 'menu', 'sprites/vanilla': 'game-sprites',
  'sounds': 'sounds', 'audios/music': 'music',
};
/** 已压缩格式 store-only（level 0）；wav/json 走 deflate-6 */
export const STORE_EXT = new Set(['.png', '.mp3', '.woff2', '.zip']);
export const ALGO_VERSION = 1;
const TARGET_UNZIPPED = 64 << 20;   // 片目标（未压缩字节）
const MAX_FILES_PER_PART = 4000;    // cache.put 逐条有开销,片内条目数也要进 SW 击杀窗口预算

export function fileExt(name) { const i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i).toLowerCase(); }

/** 递归枚举目录 → 有序 web 相对路径清单（目录优先级 + 字典序，确定性） */
export function scanInputs(pub = PUB) {
  const walk = (relDir) => {
    const abs = join(pub, relDir);
    const out = [];
    for (const ent of readdirSync(abs, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
      if (ent.isDirectory()) out.push(...walk(rel));
      else if (ent.isFile()) out.push(rel);
    }
    return out;
  };
  const files = [];
  for (const d of INPUT_DIRS) files.push(...walk(d).sort());
  return files;
}

/** 确定性分片：顺序贪心填充（unzipped 字节目标 + 条目数上限） */
export function planParts(files, sizes, opts = {}) {
  const target = opts.targetUnzipped ?? TARGET_UNZIPPED;
  const maxFiles = opts.maxFilesPerPart ?? MAX_FILES_PER_PART;
  const parts = [];
  let cur = null;
  for (const f of files) {
    const sz = sizes[f] ?? 0;
    if (!cur || cur.bytes + sz > target || cur.entries.length >= maxFiles) {
      cur = { entries: [], bytes: 0 };
      parts.push(cur);
    }
    cur.entries.push(f);
    cur.bytes += sz;
  }
  return parts;
}


/** 纯函数：条目名→字节 map → zip Uint8Array（逐文件分级：已压缩格式 store-only）。
 *  ★mtime 钉 2000-01-01：fflate zipSync 默认内嵌当前时间 → 跨进程字节不确定
 *   （同内容每次重打换名，HTTP 缓存白白失效）；钉死后同输入=同字节=同名 */
const ZIP_EPOCH = new Date('2000-01-01T00:00:00Z').getTime();
export function buildZip(entryMap) {
  const input = {};
  for (const [name, bytes] of Object.entries(entryMap)) {
    input[name] = STORE_EXT.has(fileExt(name))
      ? [bytes, { level: 0, mtime: ZIP_EPOCH }]
      : [bytes, { level: 6, mtime: ZIP_EPOCH }];
  }
  return zipSync(input);
}

export function makeManifest(partsMeta, contentHash) {
  const totalFiles = partsMeta.reduce((a, p) => a + p.files, 0);
  const totalBytes = partsMeta.reduce((a, p) => a + p.bytes, 0);
  return {
    algoVersion: ALGO_VERSION,
    contentHash,
    totalFiles,
    totalBytes,
    parts: partsMeta.map((p, i) => ({
      file: p.file, phase: p.phase, files: p.files, bytes: p.bytes,
      zipBytes: p.zipBytes, entries: p.entries, inputHash: p.inputHash,
    })),
  };
}

const sha1 = (buf) => createHash('sha1').update(buf).digest('hex');
const hash8 = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 8);

// ================= CLI（import 守卫——单测导入只拿纯函数） =================
function main() {
function loadJson(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }

const t0 = Date.now();
const prevManifest = loadJson(join(OUT_DIR, 'manifest.json'));
const state = loadJson(STATE_PATH) ?? { algoVersion: ALGO_VERSION, vendorSha: '', files: {} };
if (state.algoVersion !== ALGO_VERSION) { state.algoVersion = ALGO_VERSION; state.files = {}; }

// 1) 扫描 + 逐文件 sha1（mtime+size 未变沿用旧值）
const files = scanInputs();
const hashes = {};   // relPath -> sha1
let reusedHashes = 0, hashedBytes = 0;
for (const f of files) {
  const st = statSync(join(PUB, f));
  const prev = state.files[f];
  if (prev && prev.s === st.size && prev.m === Math.floor(st.mtimeMs) && prev.h) {
    hashes[f] = prev.h;
    reusedHashes++;
  } else {
    const buf = readFileSync(join(PUB, f));
    hashes[f] = sha1(buf);
    hashedBytes += buf.length;
    state.files[f] = { s: st.size, m: Math.floor(st.mtimeMs), h: hashes[f] };
  }
}
// 清理已消失文件的 state 条目
for (const k of Object.keys(state.files)) if (!(k in hashes)) delete state.files[k];

const contentHash = sha1(Object.entries(hashes).map(([p, h]) => `${p}:${h}\n`).join(''));

// 2) 快路径：内容未变 + 产物齐全 + vendor 就位 → 秒退
const allPartsExist = prevManifest?.parts?.every((p) => existsSync(join(OUT_DIR, p.file)));
if (prevManifest && prevManifest.contentHash === contentHash && allPartsExist && prevManifest.algoVersion === ALGO_VERSION) {
  // 同步 manifest 的 generatedAt 不动（内容寻址，无意义）；state 落盘保 mtime 漂移稳定
  writeFileSync(STATE_PATH, JSON.stringify(state));
  console.log(`[pack-assets] 无变化，跳过（${files.length} 文件 / ${reusedHashes} hash 复用 / 重哈希 ${(hashedBytes / 1048576).toFixed(1)}MB / ${Date.now() - t0}ms）`);
  process.exit(0);
}

// 3) 分片 + 逐片打包（输入 hash 集未变 → 复用旧 zip）
mkdirSync(OUT_DIR, { recursive: true });
const sizes = {};
for (const f of files) sizes[f] = statSync(join(PUB, f)).size;
const parts = planParts(files, sizes);
const prevByEntries = new Map();
for (const p of prevManifest?.parts ?? []) prevByEntries.set(p.entries.join('\n'), p);
/** 逐片输入指纹 = sha1(条目路径:文件hash 行) —— 复用必须内容与清单双不变
 *  （曾只比条目清单 → 文件内容变了仍复用旧 zip 的 bug） */
const partInputHash = (entries) => sha1(entries.map((e) => `${e}:${hashes[e]}`).join('\n'));

const partsMeta = [];
let repacked = 0, reusedParts = 0, zipBytesTotal = 0;
for (let i = 0; i < parts.length; i++) {
  const { entries, bytes } = parts[i];
  const inputHash = partInputHash(entries);
  const prev = prevByEntries.get(entries.join('\n'));
  if (prev && prev.inputHash === inputHash && existsSync(join(OUT_DIR, prev.file))) {
    partsMeta.push({ ...prev, entries, inputHash });
    reusedParts++;
    zipBytesTotal += prev.zipBytes;
    continue;
  }
  // 读片内文件 → zip → 内容寻址命名
  const entryMap = {};
  for (const e of entries) entryMap[e] = new Uint8Array(readFileSync(join(PUB, e)));
  const zipped = buildZip(entryMap);
  const file = `p${i}-${hash8(zipped)}.zip`;
  writeFileSync(join(OUT_DIR, file), zipped);
  partsMeta.push({
    file, phase: phaseOf(entries[0]), files: entries.length, bytes,
    zipBytes: zipped.length, entries, inputHash,
  });
  zipBytesTotal += zipped.length;
  repacked++;
}

function phaseOf(firstEntry) {
  const dir = firstEntry.startsWith('audios/') ? 'audios/music' : firstEntry.slice(0, firstEntry.lastIndexOf('/'));
  return DIR_PHASE[dir] ?? 'misc';
}

// 4) GC 孤儿 zip
const keep = new Set(partsMeta.map((p) => p.file));
let gc = 0;
if (existsSync(OUT_DIR)) {
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith('.zip') && !keep.has(f)) { rmSync(join(OUT_DIR, f)); gc++; }
  }
}

// 5) fflate 经 bundler 进 worker(src/net/asset-warm.worker.ts import)——
//    无需 vendor 拷贝(旧 SW importScripts 方案已废弃)

// 6) manifest + state 落盘
const manifest = makeManifest(partsMeta, contentHash);
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest));
writeFileSync(STATE_PATH, JSON.stringify(state));

const totalUnzipped = partsMeta.reduce((a, p) => a + p.bytes, 0);
console.log(`[pack-assets] ${partsMeta.length} 片（重打 ${repacked} / 复用 ${reusedParts} / GC ${gc}）：` +
  `${(totalUnzipped / 1048576).toFixed(0)}MB → ${(zipBytesTotal / 1048576).toFixed(0)}MB，` +
  `${manifest.totalFiles} 文件；hash 复用 ${reusedHashes}/${files.length}；${Date.now() - t0}ms`);
for (const p of partsMeta) {
  console.log(`  ${p.file}  ${p.phase.padEnd(12)} ${String(p.files).padStart(5)} 文件  ${(p.bytes / 1048576).toFixed(1)}MB → ${(p.zipBytes / 1048576).toFixed(1)}MB`);
}
}

import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
