// ★626e:灾厄实跑 oracle 提取器——tML 实跑 .wld+.twld → 本仓 id 空间合成 → 金标统计
// 产出:/tmp/cal-oracle/oracle.json {params, counts(按 Calamity 名), keyCounts(按本仓键), fnv, unmatched}
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { parseWldToSave } from '../src/wld/WldImport';
import { TILE_BY_KEY } from '../src/data/tiles';

// ★mod tile 注册(gen-terrain-golden 同款;否则 TILE_BY_KEY 无 mod 条目=映射全空)
{
  const root = process.env.SW_GAME_ROOT ?? process.cwd();
  const tileDir = `${root}/mods/calamity/content/tiles`;
  let nextId = 1030;
  for (const f of readdirSync(tileDir).sort()) {
    if (!f.endsWith('.json')) continue;
    const k = `mod_calamity_${f.replace('.json', '')}`;
    if (TILE_BY_KEY[k] === undefined) TILE_BY_KEY[k] = nextId++;
  }
}

// ---- .twld 小解析器(与 _twld-parse.ts 同构,内联) ----
import { gunzipSync } from 'node:zlib';
class BEReader {
  off = 0;
  constructor(public b: Uint8Array) {}
  u8(): number { return this.b[this.off++]; }
  i16(): number { const v = (this.b[this.off] << 8) | this.b[this.off + 1]; this.off += 2; return (v << 16) >> 16; }
  u16(): number { const v = (this.b[this.off] << 8) | this.b[this.off + 1]; this.off += 2; return v; }
  i32(): number { const v = ((this.b[this.off] << 24) | (this.b[this.off + 1] << 16) | (this.b[this.off + 2] << 8) | this.b[this.off + 3]) | 0; this.off += 4; return v; }
  i64(): bigint { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(this.b[this.off + i]); this.off += 8; return v; }
  bytes(n: number): Uint8Array { const s = this.b.subarray(this.off, this.off + n); this.off += n; return s; }
  str(): string { const n = this.i16(); return Buffer.from(this.bytes(n)).toString('utf8'); }
  // ★tileData 内部=小端(TileIO_Basic.cs:85 普通 BinaryReader over MemoryStream——
  //  BigEndianReader 只包 TagIO 容器层)
  u16le(): number { const v = this.b[this.off] | (this.b[this.off + 1] << 8); this.off += 2; return v; }
  i16le(): number { const v = this.u16le(); return (v << 16) >> 16; }
}
type Tag = { t: number; name: string; v: unknown };
function readTag(r: BEReader): Tag | null {
  if (r.off >= r.b.length) return null;
  const id = r.u8();
  if (id === 0) return null;
  const name = r.str();
  return { t: id, name, v: readPayload(id, r) };
}
function readPayload(id: number, r: BEReader): unknown {
  switch (id) {
    case 1: return r.u8();
    case 2: return r.i16();
    case 3: return r.i32();
    case 4: return r.i64();
    case 5: { const v = r.i32(); return new Float32Array(new Int32Array([v]).buffer)[0]; }
    case 6: { const v = r.i64(); return new Float64Array(new BigUint64Array([BigInt.asUintN(64, v)]).buffer)[0]; }
    case 7: return r.bytes(r.i32());
    case 8: return r.str();
    case 9: { const eid = r.u8(), n = r.i32(); const out: unknown[] = []; for (let i = 0; i < n; i++) out.push(readPayload(eid, r)); return out; }
    case 10: { const tags: Tag[] = []; for (;;) { const t = readTag(r); if (t === null) break; tags.push(t); } return tags; }
    case 11: { const n = r.i32(); const out: number[] = []; for (let i = 0; i < n; i++) out.push(r.i32()); return out; }
    default: throw new Error(`未知 payload id ${id} @${r.off - 1}`);
  }
}

// ---- 主流程 ----
const wldPath = process.argv[2] ?? '/tmp/tml-golden/cal/golden-calamity.wld';
const twldPath = process.argv[3] ?? '/tmp/tml-golden/cal/golden-calamity.twld';
const outPath = process.argv[4] ?? '/tmp/cal-oracle/oracle.json';

const wld = parseWld(new Uint8Array(readFileSync(wldPath)));
const twldBuf = new Uint8Array(readFileSync(twldPath));
let raw: Uint8Array;
try { raw = gunzipSync(twldBuf); } catch { raw = twldBuf; }
const r = new BEReader(raw);
const rootTag = readTag(r);
const root: Tag[] = rootTag && rootTag.t === 10 ? (rootTag.v as Tag[]) : [];
const tilesTag = root.find((t) => t.name === 'tiles');
if (!tilesTag) throw new Error('.twld 无 tiles 节');
const tc = tilesTag.v as Tag[];
const tileMapTag = tc.find((t) => t.name === 'tileMap')!;
const tileDataTag = tc.find((t) => t.name === 'tileData')!;

// 名表:saveType → {mod,name,framed}(★framed=byte 1 编码——TagIO 无 bool payload)
const entries: Array<{ saveType: number; mod: string; name: string; framed: boolean }> = [];
for (const e of tileMapTag.v as unknown[]) {
  const f = (Array.isArray(e) ? e : (e as Tag).v) as Tag[];
  const get = (nm: string) => f.find((x) => x.name === nm)?.v;
  const fr = get('framed');
  entries.push({
    saveType: Number(get('value') ?? 0),
    mod: String(get('mod') ?? ''),
    name: String(get('name') ?? ''),
    framed: fr !== undefined && fr !== null && Number(fr) !== 0,
  });
}
const bySaveType = new Map(entries.map((e) => [e.saveType, e]));

// tileData 逐格解(x-major:x 外层 y 内层;saveType=0=原版格)
const w = wld.tilesWide, h = wld.tilesHigh;
const dr = new BEReader(tileDataTag.v as Uint8Array);
const modCellType = new Uint16Array(w * h);      // saveType(≥753)按格
const modCellFrameX = new Int32Array(w * h);
const modCellFrameY = new Int32Array(w * h);
let modCells = 0;
const perSaveType = new Map<number, number>();
for (let x = 0; x < w; x++) {
  for (let y = 0; y < h; y++) {
    const saveType = dr.u16le();
    if (saveType === 0) continue;
    const entry = bySaveType.get(saveType);
    if (!entry) {
      // ★调试:打印漂移点前后文(hex)+已消费统计
      console.error(`[dbg] 漂移 @(${x},${y}) off=${dr.off} saveType=${saveType}(0x${saveType.toString(16)})`);
      console.error(`[dbg] modCells=${modCells} 期望 base=${(w * h * 2)} 已读=${dr.off}`);
      const ctx = (tileDataTag.v as Uint8Array).subarray(Math.max(0, dr.off - 24), dr.off + 24);
      console.error('[dbg] ctx:', Buffer.from(ctx).toString('hex').match(/.{1,4}/g)?.join(' '));
      throw new Error(`tileData 引用未知名表 saveType=${saveType} @(${x},${y})`);
    }
    dr.u8();   // color
    let fx = 0, fy = 0;
    if (entry.framed) { fx = dr.i16le(); fy = dr.i16le(); }
    const i = x * h + y;
    modCellType[i] = saveType;
    modCellFrameX[i] = fx; modCellFrameY[i] = fy;
    modCells++;
    perSaveType.set(saveType, (perSaveType.get(saveType) ?? 0) + 1);
  }
}
console.log(`[oracle] wld=${w}x${h} ver=${wld.version} seed=${wld.seed}`);
console.log(`[oracle] worldSurface≈${wld.groundLevel} rockLevel=${wld.rockLevel} dungeon=(${wld.dungeonX},${wld.dungeonY})`);
console.log(`[oracle] mod 名表 ${entries.length} 种(tile)+wallMap ${((tc.find((t) => t.name === 'wallMap'))?.v as unknown[]).length} 种;mod 活格=${modCells}`);

// Calamity 名 → 本仓键(snake;与提取管线同式) → 计数
const snake = (nm: string) => nm.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const counts: Record<string, number> = {};
const keyCounts: Record<string, number> = {};
const unmatched: Array<{ name: string; n: number }> = [];
for (const [saveType, n] of [...perSaveType.entries()].sort((a, b) => b[1] - a[1])) {
  const e = bySaveType.get(saveType)!;
  if (e.mod !== 'CalamityMod') continue;
  counts[e.name] = n;
  const key = `mod_calamity_${snake(e.name)}`;
  if (TILE_BY_KEY[key] !== undefined) keyCounts[key] = n;
  else unmatched.push({ name: e.name, n });
}

// ---- 合成到本仓 id 空间(原版基底=parseWldToSave RLE 产物内联解码 + mod 格覆盖) ----
const imp = parseWldToSave(new Uint8Array(readFileSync(wldPath)));
const save = imp.save as unknown as { tiles: string; version: number };
const { bytesFromB64Hack } = await (async () => ({ bytesFromB64Hack: null }))();   // noop 占位
const b64 = save.tiles;
const u8 = Uint8Array.from(Buffer.from(b64, 'base64'));
const n = w * h;
const type = new Uint16Array(n);
const frameXArr = new Uint16Array(n), frameYArr = new Uint16Array(n);
const TILE_INTERNAL_OF_STABLE = (await import('../src/data/tiles')).TILE_INTERNAL_OF_STABLE;
{
  let p = 0, i = 0;
  while (i < n && p < u8.length) {
    let run = 0, s = 0;
    for (;;) { const b = u8[p++]; run |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
    let tRaw = 0; s = 0;
    for (;;) { const b = u8[p++]; tRaw |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
    const t = tRaw === 0 ? 0 : (TILE_INTERNAL_OF_STABLE[tRaw] || 0);
    let fx = 0, fy = 0;
    if (tRaw !== 0) {
      s = 0;
      for (;;) { const b = u8[p++]; fx |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      s = 0;
      for (;;) { const b = u8[p++]; fy |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
    }
    const end = Math.min(i + run + 1, n);
    for (; i < end; i++) { type[i] = t; frameXArr[i] = fx; frameYArr[i] = fy; }
  }
}
let modKeyMiss = 0;
for (let x = 0; x < w; x++) {
  for (let y = 0; y < h; y++) {
    const st = modCellType[x * h + y];
    if (st === 0) continue;
    const e = bySaveType.get(st)!;
    const key = `mod_calamity_${snake(e.name)}`;
    const id = TILE_BY_KEY[key];
    const i = y * w + x;   // 本仓=行主序(y*w+x);tileData=x 主序(x*h+y)
    if (id === undefined) { modKeyMiss++; type[i] = 0; continue; }
    type[i] = id;
    if (e.framed) { frameXArr[i] = modCellFrameX[x * h + y]; frameYArr[i] = modCellFrameY[x * h + y]; }
  }
}
// FNV(本仓 id 空间;与 gen-terrain-golden 同式)
let fnv = 0x811c9dc5;
for (let i = 0; i < type.length; i++) {
  fnv ^= type[i] & 0xff; fnv = Math.imul(fnv, 0x01000193) >>> 0;
  fnv ^= (type[i] >>> 8) & 0xff; fnv = Math.imul(fnv, 0x01000193) >>> 0;
}
// ★逐类型位置哈希(稳定面逐位性验证面):每 Calamity 类型对其活格索引序 FNV
const posHash: Record<string, string> = {};
{
  const perType = new Map<string, number[]>();
  for (const [st, n] of perSaveType) {
    const e = bySaveType.get(st)!;
    if (e.mod !== 'CalamityMod') continue;
    perType.set(e.name, []);
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const st = modCellType[x * h + y];
      if (st === 0) continue;
      const e = bySaveType.get(st)!;
      if (e.mod !== 'CalamityMod') continue;
      perType.get(e.name)!.push(x * h + y);   // x 主序(tileData 原生序)
    }
  }
  for (const [name, idxs] of perType) {
    let hsh = 0x811c9dc5;
    for (const ix of idxs) {
      hsh ^= ix & 0xff; hsh = Math.imul(hsh, 0x01000193) >>> 0;
      hsh ^= (ix >>> 8) & 0xff; hsh = Math.imul(hsh, 0x01000193) >>> 0;
      hsh ^= (ix >>> 16) & 0xff; hsh = Math.imul(hsh, 0x01000193) >>> 0;
      hsh ^= (ix >>> 24) & 0xff; hsh = Math.imul(hsh, 0x01000193) >>> 0;
    }
    posHash[name] = hsh.toString(16).padStart(8, '0');
  }
}
console.log(`[oracle] 本仓键未匹配 mod tile 种类=${unmatched.length} 覆盖格=${modKeyMiss}`);
console.log(`[oracle] fnvType(合成空间) = ${fnv.toString(16).padStart(8, '0')}`);
console.log('[oracle] Calamity tile 计数 TOP30:');
for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`   ${k}: ${n}`);

mkdirSync('/tmp/cal-oracle', { recursive: true });
writeFileSync(outPath, JSON.stringify({
  params: { w, h, version: wld.version, seed: wld.seed, groundLevel: wld.groundLevel, rockLevel: wld.rockLevel, dungeonX: wld.dungeonX, dungeonY: wld.dungeonY, isCrimson: wld.isCrimson },
  counts, keyCounts, unmatched, posHash,
  fnvTypeMerged: fnv.toString(16).padStart(8, '0'),
  modCells, entryCount: entries.length,
}, null, 1));
console.log(`[oracle] 写出 ${outPath}`);
process.exit(0);
