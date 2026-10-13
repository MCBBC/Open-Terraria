// ★:神庙族四 pass 重放判卷(Living Mahogany Tree / Jungle Temple / Temple / Lihzahrd Altars)
// 模板=scripts/_replay-sea.ts;边界快照=probe 跑(2026-10-14,GENPROBE_SNAPSHOT=
// 'Living Mahogany Tree|Jungle Temple|^Temple$|Lihzahrd Altars')固化于 /tmp/genprobe-temple-snaps,
// PASS 表固化于 /tmp/genprobe-temple-pass.log。探针命名:pre-X=X 完成态(下一 pass 命中 regex
// 时以「刚完成 pass」名落盘)、post-X=X 自身命中。故:
//   Living Mahogany Tree  输入=pre-Living_Trees(44 完成态)      输出=post-Living_Mahogany_Tree
//   Jungle Temple         输入=pre-Wet_Jungle(48 完成态)        输出=post-Jungle_Temple
//   Temple                输入=pre-Moss(70 完成态;PASS 序 70 Moss→71 Temple)输出=post-Temple
//   Lihzahrd Altars       输入=pre-Tile_Cleanup(108 完成态)     输出=post-Lihzahrd_Altars
// 边界锁定=快照 type-FNV ↔ PASS 行 tf 对账(GenProbe.cs:81-84 FNV-1a,x 主序 u16 LE 双字节)。
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = process.env.SW_GAME_ROOT ?? process.cwd();
const SNAP_DIR = process.env.SW_TEMPLE_SNAPS ?? '/tmp/genprobe-temple-snaps';
const PASS_LOG = process.env.SW_TEMPLE_PASSLOG ?? '/tmp/genprobe-temple-pass.log';
const { TILE_BY_KEY, TILE_DEFS, registerModTile } = await import('../src/data/tiles.ts');
const { RNG, translateSeed } = await import('../src/core/rng.ts');

// mod tile 注册(803+;与 sea 仪同式,透传 JSON 字段)
{
  let nextId = 1030;
  for (const f of readdirSync(`${root}/mods/calamity/content/tiles`).sort()) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(readFileSync(`${root}/mods/calamity/content/tiles/${f}`, 'utf8'));
      registerModTile({
        key: `mod_calamity_${f.replace('.json', '')}`, name: '',
        solid: !!j.solid, decor: !!j.decor, framed: !!j.framed, chest: !!j.chest,
        opacity: j.opacity, pick: j.pick, axe: j.axe,
      }, nextId++);
    } catch { /* skip */ }
  }
}
(globalThis as Record<string, unknown>).__calamityTileDefs = TILE_DEFS;

// ---- PASS 表解析 ----------------------------------------------------------
type PassRow = { idx: number; name: string; tf: number; wf: number; dG: number };
const PASS_ROWS: PassRow[] = [];
{
  const lines = readFileSync(PASS_LOG, 'utf8').split('\n');
  for (const ln of lines) {
    if (!ln.startsWith('PASS\t')) continue;
    const c = ln.split('\t');
    const spy = c[6] ?? '';
    const dG = Number(/(?:^|;)dG=(\d+)/.exec(spy)?.[1] ?? '0');
    PASS_ROWS.push({ idx: Number(c[1]), name: c[2], tf: parseInt(c[3], 16), wf: parseInt(c[4], 16), dG });
  }
}
const rowOf = (idx: number) => PASS_ROWS.find((r) => r.idx === idx);

// ---- 快照载入(x 主序→行主序;gzip)+ FNV 对账 -------------------------------
function loadSnap(pat: string) {
  const f = readdirSync(SNAP_DIR).filter((x) => x.endsWith(pat + '.bin.gz')).sort().pop();
  if (!f) throw new Error('快照未找到: ' + pat);
  const buf = gunzipSync(readFileSync(`${SNAP_DIR}/${f}`));
  const w = 4200, h = 1200, n = w * h;
  const type = new Uint16Array(n), wall = new Uint16Array(n);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * 4;
    type[y * w + x] = buf[o] | (buf[o + 1] << 8);
    wall[y * w + x] = buf[o + 2] | (buf[o + 3] << 8);
  }
  return { type, wall, file: f };
}

/** GenProbe.cs:81-84 FNV-1a:x 主序、每格 tv 低字节→高字节(wf 同式)。
 *  必须在转置前按原始 buf 序算——转置=重排字节序,FNV 非交换。 */
function fnvBuf(buf: Uint8Array, off: number, stride = 4): { tf: number; wf: number } {
  let tf = 0x811c9dc5, wf = 0x811c9dc5;
  for (let o = off; o < buf.length; o += stride) {
    tf ^= buf[o]; tf = Math.imul(tf, 0x01000193) >>> 0;
    tf ^= buf[o + 1]; tf = Math.imul(tf, 0x01000193) >>> 0;
    wf ^= buf[o + 2]; wf = Math.imul(wf, 0x01000193) >>> 0;
    wf ^= buf[o + 3]; wf = Math.imul(wf, 0x01000193) >>> 0;
  }
  return { tf, wf };
}
/** 边界锁定:快照 (idx passName kind) tf/wf ↔ PASS 行 */
function lockBoundary(idx: number, passName: string, kind: 'pre' | 'post') {
  const f = readdirSync(SNAP_DIR).filter((x) => x.endsWith(`${kind}-${passName.replace(/ /g, '_')}.bin.gz`)).sort().pop();
  if (!f) throw new Error('快照未找到: ' + kind + '-' + passName);
  const buf = gunzipSync(readFileSync(`${SNAP_DIR}/${f}`));
  const { tf, wf } = fnvBuf(buf, 0);
  const snap = loadSnap(`${kind}-${passName.replace(/ /g, '_')}`);
  const row = rowOf(idx);
  if (!row) throw new Error(`PASS 行缺失 idx=${idx}`);
  const okT = tf === row.tf, okW = wf === row.wf;
  console.log(`[lock] ${kind}-${passName} (PASS ${idx}) tf=${tf.toString(16).padStart(8, '0')}${okT ? '≡' : '!'}${row.tf.toString(16).padStart(8, '0')} wf=${wf.toString(16).padStart(8, '0')}${okW ? '≡' : '!'}${row.wf.toString(16).padStart(8, '0')} ${okT && okW ? 'OK' : '✗✗边界失配✗✗'}`);
  if (!okT || !okW) throw new Error(`边界 FNV 失配: ${kind}-${passName}`);
  return snap;
}

// ---- C# id→本仓内部 id(模板同式) ----------------------------------------
const SHEET_TO_INTERNAL = new Map<number, number>();
for (let i = 1; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i] as { vanilla?: { sheet: number } } | undefined;
  if (d?.vanilla && d.vanilla.sheet < 753 && !SHEET_TO_INTERNAL.has(d.vanilla.sheet)) SHEET_TO_INTERNAL.set(d.vanilla.sheet, i);
}
class BER { off = 0; b: Uint8Array; constructor(b: Uint8Array) { this.b = b; } u8() { return this.b[this.off++]; } i16() { const v = (this.b[this.off] << 8) | this.b[this.off + 1]; this.off += 2; return (v << 16) >> 16; } i32() { const v = ((this.b[this.off] << 24) | (this.b[this.off + 1] << 16) | (this.b[this.off + 2] << 8) | this.b[this.off + 3]) | 0; this.off += 4; return v; } bytes(n: number) { const s = this.b.subarray(this.off, this.off + n); this.off += n; return s; } str() { const n = this.i16(); return Buffer.from(this.bytes(n)).toString('utf8'); } }
function payload(id: number, r: BER): unknown {
  switch (id) {
    case 1: return r.u8(); case 2: return r.i16(); case 3: return r.i32();
    case 4: { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(r.b[r.off + i]); r.off += 8; return v; }
    case 5: { const v = r.i32(); return new Float32Array(new Int32Array([v]).buffer)[0]; }
    case 6: { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(r.b[r.off + i]); r.off += 8; return v; }
    case 11: { const n = r.i32(); const o: number[] = []; for (let i = 0; i < n; i++) o.push(r.i32()); return o; }
    case 7: return r.bytes(r.i32()); case 8: return r.str();
    case 9: { const e = r.u8(), n = r.i32(); const o: unknown[] = []; for (let i = 0; i < n; i++) o.push(payload(e, r)); return o; }
    case 10: { const t: Array<{ t: number; name: string; v: unknown }> = []; for (;;) { if (r.off >= r.b.length) break; const id2 = r.u8(); if (id2 === 0) break; const nm = r.str(); t.push({ t: id2, name: nm, v: payload(id2, r) }); } return t; }
    default: throw new Error('pid ' + id);
  }
}
const MOD_ID_TO_NAME = new Map<number, number>();
{
  const twld = gunzipSync(readFileSync(`${root}/mods/calamity/golden-oracle/golden-calamity.twld`));
  const r = new BER(twld);
  r.u8(); r.str();
  const root0 = payload(10, r) as Array<{ t: number; name: string; v: unknown }>;
  const tiles = (root0.find((t) => t.name === 'tiles')?.v ?? []) as Array<{ t: number; name: string; v: unknown }>;
  const tileMap = tiles.find((t) => t.name === 'tileMap')?.v as unknown[];
  for (const e of tileMap) {
    const f = (Array.isArray(e) ? e : (e as { v: unknown }).v) as Array<{ name: string; v: unknown }>;
    const get = (nm: string) => f.find((x) => x.name === nm)?.v;
    const snake = String(get('name')).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    const our = TILE_BY_KEY[`mod_calamity_${snake}`];
    if (our !== undefined) MOD_ID_TO_NAME.set(Number(get('value')), our);
  }
}
const CS_TO_OURS = (cs: number): number => cs === 0 ? 0 : cs < 753 ? (SHEET_TO_INTERNAL.get(cs) ?? 0) : (MOD_ID_TO_NAME.get(cs) ?? 0);
const KEY_OF = (id: number): string => TILE_DEFS[id]?.key ?? `#${id}`;

// ---- store 构建 ------------------------------------------------------------
const w = 4200, h = 1200, n = w * h;
function buildStore(snap: { type: Uint16Array; wall: Uint16Array }) {
  const type = new Uint16Array(n), flags = new Uint8Array(n);
  const wall = new Uint16Array(n), liquid = new Uint8Array(n), liquidType = new Uint8Array(n);
  const wire = new Uint8Array(n), half = new Uint8Array(n), slope = new Uint8Array(n);
  const paint = new Uint8Array(n), frameX = new Uint16Array(n), frameY = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const t = CS_TO_OURS(snap.type[i]);
    type[i] = t; flags[i] = t !== 0 ? 1 : 0;
    wall[i] = snap.wall[i];
  }
  return {
    w, h, type, flags, wall, liquid, liquidType, wire, half, slope, paint, frameX, frameY,
    idx(x: number, y: number) { return y * w + x; },
    get(x: number, y: number) { return type[y * w + x]; },
    setTile(x: number, y: number, t: number, fx = 0, fy = 0) { if (x < 0 || x >= w || y < 0 || y >= h) return; const i = y * w + x; type[i] = t; flags[i] = t !== 0 ? 1 : 0; frameX[i] = fx; frameY[i] = fy; },
    setTileSilent(x: number, y: number, t: number, fx = 0, fy = 0) { this.setTile(x, y, t, fx, fy); },
    hasTile(x: number, y: number) { return (flags[y * w + x] & 1) !== 0; },
    purgeGhostTiles() { return 0; },
  };
}
type Store = ReturnType<typeof buildStore>;

// ---- pass fn 提取(setupGenMisc 桩) ----------------------------------------
const passFns = new Map<string, (store: Store, rng: unknown, gs: unknown) => void>();
{
  const misc = await import('../mods/calamity/src/gen-misc.ts');
  const stub = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'registerGenPass') return (p: string | { name: string; fn: unknown }, fn?: unknown) => {
        const name = typeof p === 'string' ? p : p.name;
        const f = typeof p === 'string' ? fn : (p as { fn: unknown }).fn;
        if (['Living Mahogany Tree', 'Jungle Temple', 'Temple', 'Lihzahrd Altars'].includes(name)) passFns.set(name, f as never);
      };
      return () => {};
    },
    has: () => true,
  });
  (misc as { setupGenMisc(sw: unknown): void }).setupGenMisc(stub);
  for (const nm of ['Living Mahogany Tree', 'Jungle Temple', 'Temple', 'Lihzahrd Altars'])
    if (!passFns.has(nm)) throw new Error(`pass 未注册: ${nm}`);
}
console.log('[replay] 四 pass fn 就绪');

// ---- gs(模板同面 + 神庙族依赖) ---------------------------------------------
const gs: Record<string, unknown> = {
  seed: translateSeed('9293480'),
  worldSurface: 337, worldSurfaceLow: 246, rockLevel: 535,
  waterLine: 337, lavaLine: 1040,
  crimson: false, dungeonX: 3421, dungeonSide: 1,
  dungeonMinX: 0, dungeonMaxX: 4200, dungeonMaxY: 207,
  jungleX: 2150, snowOriginLeft: 300, snowOriginRight: 3900,
  tLeft: 0, tRight: 0, tTop: 0, tBottom: 0, tRooms: 0,
  undergroundDesert: null as unknown,   // 真链 GenVars 面;先 null(搜索拒支停用),diff 指向搜索漂移再补真值
  shimmerX: 0, shimmerY: 0,
  larvaX: [], larvaY: [],
  oreTiers: { copper: 0, iron: 0, silver: 0, gold: 0 },
  genW: w, genH: h,
  protectedRects: [] as Array<{ x0: number; y0: number; x1: number; y1: number; pad: number }>,
  seedFlags: {} as Record<string, boolean>,
  mods: {
    tileIdByKey: Object.fromEntries(Object.entries(TILE_BY_KEY).filter(([k]) => k.startsWith('mod_')).map(([k, v]) => [k.replace(/^mod_[a-z0-9]+_/, ''), v])),
    itemIdByKey: {},
    chests: [] as unknown[],
  },
};

// ---- 掷数计数(对拍真链 PASS 行 dG) ----------------------------------------
function freshRng(): { rng: RNG; count: () => number } {
  const rng = new RNG(gs.seed as number);
  let draws = 0;
  const proto = rng as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of ['next', 'nextInt', 'nextIntRange', 'range', 'nextBool']) {
    const fn = proto[m];
    if (typeof fn !== 'function') continue;
    (rng as unknown as Record<string, unknown>)[m] = function (this: unknown, ...a: unknown[]) { draws++; return fn.apply(this, a); };
  }
  return { rng, count: () => draws };
}
const RNG_MODE = process.env.SW_RNG_MODE ?? 'fresh';   // fresh=每 pass 重播种(模板定谳);thread=四 pass 串行共流
console.log(`[replay] RNG 模式=${RNG_MODE}`);

// ---- 边界锁定(八快照) -------------------------------------------------------
const sPreMahogany = lockBoundary(44, 'Living Trees', 'pre');
const sPostMahogany = lockBoundary(45, 'Living Mahogany Tree', 'post');
const sPreJTemple = lockBoundary(48, 'Wet Jungle', 'pre');
const sPostJTemple = lockBoundary(49, 'Jungle Temple', 'post');
const sPreTemple = lockBoundary(70, 'Moss', 'pre');
const sPostTemple = lockBoundary(71, 'Temple', 'post');
const sPreAltars = lockBoundary(108, 'Tile Cleanup', 'pre');
const sPostAltars = lockBoundary(109, 'Lihzahrd Altars', 'post');

// ---- 逐 pass 重放 + diff ----------------------------------------------------
interface RunResult { diff: number; wallDiff: number; dG: number }
const results = new Map<string, RunResult>();

function adjudicate(name: string, idx: number, pre: { type: Uint16Array; wall: Uint16Array }, post: { type: Uint16Array; wall: Uint16Array }, store: Store, rng: RNG, count: () => number) {
  const t0 = Date.now();
  (passFns.get(name) as (s: Store, r: RNG, g: unknown) => void)(store, rng, gs);
  const draws = count();
  const real = rowOf(idx)!;
  // diff(type)
  let diff = 0, wallDiff = 0;
  const diffByType = new Map<string, number>();
  const wallDiffBy = new Map<string, number>();
  let firstDiff = '', firstW = '';
  let minX = 1 << 30, maxX = -1, minY = 1 << 30, maxY = -1;
  for (let i = 0; i < n; i++) {
    const realT = CS_TO_OURS(post.type[i]);
    if (store.type[i] !== realT) {
      diff++;
      const x = i % w, y = Math.floor(i / w);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      const key = `${KEY_OF(store.type[i])}→${KEY_OF(realT)}`;
      diffByType.set(key, (diffByType.get(key) ?? 0) + 1);
      if (!firstDiff) firstDiff = `首格(${x},${y}) 我=${KEY_OF(store.type[i])} 真=${KEY_OF(realT)}`;
    }
    const realW = post.wall[i];
    if (store.wall[i] !== realW) {
      wallDiff++;
      const key = `${store.wall[i]}→${realW}`;
      wallDiffBy.set(key, (wallDiffBy.get(key) ?? 0) + 1);
      if (!firstW) { const x = i % w, y = Math.floor(i / w); firstW = `首墙(${x},${y}) 我=${store.wall[i]} 真=${realW}`; }
    }
  }
  const bbox = maxX >= 0 ? `bbox=[${minX},${minY}..${maxX},${maxY}]` : 'bbox=∅';
  console.log(`[${name}] 逐格 diff=${diff}/${n}(${((diff / n) * 100).toFixed(3)}%) wallDiff=${wallDiff} ${bbox}`);
  if (firstDiff) console.log(`[${name}] ${firstDiff} | ${firstW}`);
  console.log(`[${name}] 掷数 我=${draws} vs 真链dG=${real.dG} ${draws === real.dG ? '≡' : '✗流面差'}`);
  console.log(`[${name}] 耗时=${Date.now() - t0}ms`);
  // 聚合差 TOP
  const cnt = (arr: Uint16Array) => { const m = new Map<string, number>(); for (let i = 0; i < n; i++) { const k = KEY_OF(arr[i]); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
  const oursC = cnt(store.type), realC = cnt(Array.from(post.type, CS_TO_OURS));
  const keys = new Set([...oursC.keys(), ...realC.keys()]);
  const rows = [...keys].map((k) => [k, oursC.get(k) ?? 0, realC.get(k) ?? 0] as [string, number, number]).filter((r) => Math.abs(r[1] - r[2]) > 20).sort((a, b) => Math.abs(b[1] - b[2]) - Math.abs(a[1] - a[2]));
  console.log(`[${name}] 聚合差 TOP10(tile 我 真):`);
  for (const [k, a, b] of rows.slice(0, 10)) console.log(`    ${k}: ${a} vs ${b}`);
  if (wallDiff > 50) {
    const wrows = [...wallDiffBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    console.log(`[${name}] 墙差 TOP6: ${wrows.map(([k, c]) => `${k}:${c}`).join(' ')}`);
  }
  results.set(name, { diff, wallDiff, dG: draws });
}

// ① Living Mahogany Tree
{
  const store = buildStore(sPreMahogany);
  const { rng, count } = freshRng();
  adjudicate('Living Mahogany Tree', 45, sPreMahogany, sPostMahogany, store, rng, count);
}
// ② Jungle Temple
{
  const store = buildStore(sPreJTemple);
  const { rng, count } = freshRng();
  adjudicate('Jungle Temple', 49, sPreJTemple, sPostJTemple, store, rng, count);
}
// ③ Temple(消费 ② 写的 gs.t*——② 若 diff≠0,此域误差=链式传播,属真依赖)
{
  const store = buildStore(sPreTemple);
  const { rng, count } = freshRng();
  console.log(`[Temple] 输入 gs.t* = L${gs.tLeft} R${gs.tRight} T${gs.tTop} B${gs.tBottom} rooms=${gs.tRooms} NewAlter=${JSON.stringify(gs.__calamityNewAlter ?? null)}`);
  adjudicate('Temple', 71, sPreTemple, sPostTemple, store, rng, count);
}
// ④ Lihzahrd Altars
{
  const store = buildStore(sPreAltars);
  const { rng, count } = freshRng();
  adjudicate('Lihzahrd Altars', 109, sPreAltars, sPostAltars, store, rng, count);
}

console.log('\n[replay] ===== 总表 =====');
let total = 0;
for (const [k, v] of results) { total += v.diff; console.log(`  ${k}: tileDiff=${v.diff} wallDiff=${v.wallDiff} draws=${v.dG}`); }
console.log(`  TOTAL tileDiff=${total}`);
process.exit(0);
