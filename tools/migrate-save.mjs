#!/usr/bin/env node
// 旧存档(v1/v2,内部下标 id)→ v3 稳定 id 迁移工具。
// 原理:存档写入时的 TILE_DEFS/ITEM_DEFS 顺序可从 git 历史恢复
//   (header.created 时间戳 → 该时刻的最后一个 commit → git show 提取 def/item 注册顺序),
//   旧下标 → 当时 key → 当前稳定 id(sheet/私有段),重写 tiles/chests/inventory/banks。
// 用法:
//   node tools/migrate-save.mjs <save.json> [out.json] [--ref <git-ref>]
//   不给 --ref 时按 header.created 自动选(ref=该时间前最后一个 commit;工作区未提交的
//   改动用 --ref HEAD 近似——本次漂移源正是未提交插入,HEAD 顺序=存档写入时顺序)。
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// ---- varint/RLE 编解码(与 src/save/serialize.ts 同格式) ----
function b64ToBytes(b64) {
  return Buffer.from(b64, 'base64');
}
function readVarint(u8, pos) {
  let v = 0, shift = 0;
  while (pos.i < u8.length) {
    const b = u8[pos.i++];
    v += (b & 0x7f) * 2 ** shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return v;
}
class ByteWriter {
  buf = new Uint8Array(1 << 16);
  len = 0;
  grow(need) {
    if (this.len + need <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < this.len + need) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  }
  varint(v) {
    v = v < 0 ? 0 : v;
    this.grow(5);
    while (v >= 0x80) { this.buf[this.len++] = (v & 0x7f) | 0x80; v = Math.floor(v / 128); }
    this.buf[this.len++] = v;
  }
  bytes() { return this.buf.subarray(0, this.len); }
}
function bytesToB64(u8) { return Buffer.from(u8).toString('base64'); }

// ---- 从 git 历史提取注册顺序 ----
function keyOrderAtRef(ref, file, callRe) {
  const src = execSync(`git show ${ref}:src/data/${file}`, { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 1 << 28 });
  const keys = [];
  for (const m of src.matchAll(callRe)) keys.push(m[1]);
  // 运行时循环注册的 vi_ 批量段无法从文本提取——由调用方用稳定表兜底(vi_ key 含 id 自解析)
  return keys;
}

// ---- 当前稳定 id 源(与 src/data/*.ts 同规则;直接解析当前文件,避免引入 TS 运行时) ----
function buildStableMaps() {
  // tiles:PRIV 表(文本提取) + def 的 vanilla.sheet
  const tilesSrc = readFileSync('src/data/tiles.ts', 'utf8');
  const privTiles = {};
  {
    const m = tilesSrc.match(/const PRIV_TILE_STABLE[^{]*\{([\s\S]*?)\};/);
    // key 可能无引号(empty: 1000)或带引号('v_389_tall_gate_open': 1027)
    if (m) for (const line of m[1].matchAll(/'?([A-Za-z0-9_]+)'?:\s*(\d+)/g)) privTiles[line[1]] = Number(line[2]);
  }
  const tileStableByKey = {};
  for (const d of tilesSrc.matchAll(/def\(\{ key: '([^']+)'([\s\S]*?)\}\);/g)) {
    const [, key, body] = d;
    if (privTiles[key]) { tileStableByKey[key] = privTiles[key]; continue; }
    const sm = body.match(/sheet: (\d+)/);
    if (sm && Number(sm[1]) !== 0) tileStableByKey[key] = Number(sm[1]);
  }
  // items:PRIV 表 + vi_ key 自解析
  const itemsSrc = readFileSync('src/data/items.ts', 'utf8');
  const privItems = {};
  {
    const m = itemsSrc.match(/const PRIV_ITEM_STABLE[^{]*\{([\s\S]*?)\};/);
    if (m) for (const line of m[1].matchAll(/'?([A-Za-z0-9_]+)'?:\s*(\d+)/g)) privItems[line[1]] = Number(line[2]);
  }
  return { tileStableByKey, privItems };
}

const args = process.argv.slice(2);
const inFile = args.find((a) => !a.startsWith('--'));
const refIdx = args.indexOf('--ref');
const ref = refIdx >= 0 ? args[refIdx + 1] : null;
if (!inFile) { console.error('用法: node tools/migrate-save.mjs <save.json> [out.json] [--ref <git-ref>]'); process.exit(1); }
const outFile = args.find((a, i) => i > 0 && a !== (refIdx >= 0 ? args[refIdx + 1] : '') && !a.startsWith('--') && a !== inFile) ?? inFile.replace(/\.json$/, '.v3.json');

const save = JSON.parse(readFileSync(inFile, 'utf8'));
const created = save.header?.created ?? Date.now();
let useRef = ref;
if (!useRef) {
  useRef = execSync(`git log --before=${new Date(created).toISOString()} -1 --format=%H`, { encoding: 'utf8' }).trim();
  if (!useRef) useRef = 'HEAD';
}
console.log(`存档 created=${new Date(created).toISOString()} → ref=${useRef.slice(0, 10)}`);

const { tileStableByKey, privItems } = buildStableMaps();

// 旧 tile 下标 → 稳定 id(历史顺序)
const oldTileKeys = keyOrderAtRef(useRef, 'tiles.ts', /def\(\{ key: '([^']+)'(?:[\s\S]*?)\}\);/g);
// 注意:上面正则的非贪婪体在多 def 行会错位;改逐 def 扫描
const tileKeys = [];
{
  const src = execSync(`git show ${useRef}:src/data/tiles.ts`, { encoding: 'utf8', maxBuffer: 1 << 28 });
  let idx = 0;
  while (true) {
    const at = src.indexOf("def({ key: '", idx);
    if (at < 0) break;
    const q1 = at + "def({ key: '".length;
    const q2 = src.indexOf("'", q1);
    tileKeys.push(src.slice(q1, q2));
    idx = q2;
  }
}
// 历史 PRIV 兜底:当时还不存在的 PRIV key → tileStableByKey 缺失 → 告警
const tileOldToStable = [];
let unknownTiles = 0;
for (let i = 0; i < tileKeys.length; i++) {
  const s = tileStableByKey[tileKeys[i]];
  if (s === undefined) { unknownTiles++; tileOldToStable[i] = 0; }
  else tileOldToStable[i] = s;
}
console.log(`历史 tile defs=${tileKeys.length},无法映射=${unknownTiles}`);

// 旧 item 下标 → 稳定 id
const itemKeys = [];
{
  const src = execSync(`git show ${useRef}:src/data/items.ts`, { encoding: 'utf8', maxBuffer: 1 << 28 });
  let idx = 0;
  while (true) {
    const at = src.indexOf("item({ key: '", idx);
    if (at < 0) break;
    const q1 = at + "item({ key: '".length;
    const q2 = src.indexOf("'", q1);
    itemKeys.push(src.slice(q1, q2));
    idx = q2;
  }
}
const itemOldToStable = [];
let unknownItems = 0;
for (let i = 0; i < itemKeys.length; i++) {
  const k = itemKeys[i];
  const vm = /^vi_(\d+)_/.exec(k);
  const s = vm ? Number(vm[1]) : privItems[k];
  if (s === undefined) { unknownItems++; itemOldToStable[i] = 0; }
  else itemOldToStable[i] = s;
}
console.log(`历史 item defs=${itemKeys.length}(字面量;运行时 vi_ 批量由 key 自解析兜底),无法映射=${unknownItems}`);
// 字面量之外的运行时 vi_:旧下标 ≥ 字面量数的部分按 vi_ 批量段顺序推算——
// 历史 items.ts 的批量循环对 vanilla.json 全量按 id 升序注册,Object.entries 顺序=JSON 写入顺序;
// 无法精确重建 → 该段旧档物品保真度有限(仅影响字面量段之后注册的 vi_ 物品)。
// 实践中 wld 导入的箱子物品走 ITEM_MAP→字面量 key,受影响面小。

// ---- 重写 tiles RLE ----
{
  const u8 = b64ToBytes(save.tiles);
  const pos = { i: 0 };
  const out = new ByteWriter();
  let n = 0, mapped = 0;
  while (pos.i < u8.length) {
    const run = readVarint(u8, pos) + 1;
    const tRaw = readVarint(u8, pos);
    const fx = tRaw !== 0 ? readVarint(u8, pos) : 0;
    const fy = tRaw !== 0 ? readVarint(u8, pos) : 0;
    const t = tRaw === 0 ? 0 : (tileOldToStable[tRaw] ?? 0);
    if (tRaw !== 0 && t === 0) mapped++;
    out.varint(run - 1); out.varint(t);
    if (t !== 0) { out.varint(fx); out.varint(fy); }
    n += run;
  }
  save.tiles = bytesToB64(out.bytes());
  console.log(`tiles: ${n} 格重映射,落 0=${mapped}`);
}
// ---- 物品 ----
const mapItem = (it) => it ? { id: it.id === 0 ? 0 : (itemOldToStable[it.id] ?? 0), stack: it.stack } : it;
if (save.chests) save.chests = save.chests.map((c) => ({ ...c, items: c.items.map(mapItem) }));
if (save.player) {
  save.player.inventory = save.player.inventory.map(mapItem);
  if (save.player.banks) save.player.banks = save.player.banks.map((b) => b.map(mapItem));
}
save.version = 3;
save.idScheme = 'sheet';
writeFileSync(outFile, JSON.stringify(save));
console.log(`→ ${outFile} (v3)`);
