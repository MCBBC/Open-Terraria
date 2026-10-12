// ★6xx:Abyss(+Abyss Decorations) pass 重放判卷(克隆 _replay-crag.ts;流语义定谳:RNG(seed) fresh)
// 边界定谳(FNV 对账):探针 PASS 行 tf=该 pass 完成后状态(WorldGenerator.cs:497 每 pass 重播);
//   输入=「Draedon Structures 完成态」快照(tf 对账锁定),输出=「Abyss 完成态」快照。
//   两 pass 连跑(真链一个 Abyss pass 的两段:Abyss.cs:40-803 主体 + :530-799 装饰归
//   gen-abyss.ts;单一连续流,Decorations 不重播)。
// gs:sulphurAtLeft=false(真链 AtLeftSideOfWorld=SulphurousSea.cs:188 dungeonX<maxTilesX/2,
//   dungeonX=3421>2100→false,零掷);sulphurYStart=gen-sea DetermineYStart 同式扫描
//   (真链由海 pass 零掷扫描产出,此处按同一算法对 pre 快照重算)。
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = process.env.SW_GAME_ROOT ?? process.cwd();
const LOGS = '/Users/vinlic/Library/Application Support/Terraria/tModLoader/Logs';
const { TILE_BY_KEY, TILE_DEFS, registerModTile } = await import('../src/data/tiles.ts');
const { RNG, translateSeed } = await import('../src/core/rng.ts');

// mod tile 注册(带 content JSON 属性面——genSolid/实心门依赖 solid 标志;
//  键字典序=全链分配序,stableId 从 1030 起)
{
  let nextId = 1030;
  const tileDir = `${root}/mods/calamity/content/tiles`;
  for (const f of readdirSync(tileDir).sort()) {
    if (!f.endsWith('.json')) continue;
    try {
      const spec = JSON.parse(readFileSync(`${tileDir}/${f}`, 'utf8'));
      registerModTile({
        key: `mod_calamity_${f.replace('.json', '')}`,
        name: spec.name ?? f.replace('.json', ''),
        solid: spec.solid ?? false,
        platform: spec.platform ?? false,
        decor: spec.decor ?? false,
        chest: spec.chest ?? false,
        framed: spec.framed ?? false,
        w: spec.w, h: spec.h,
        opacity: spec.opacity ?? (spec.solid ? 1 : 0),
        pick: spec.pick ?? 0,
        axe: spec.axe ?? -1,
        mapColor: spec.mapColor ?? '#808080',
        blend: spec.frame === 'blend' || spec.frame === 'auto' ? true : false,
        vanilla: { frame: spec.frame ?? 'style', fw: spec.w ?? 1, fh: spec.h ?? 1 },
      }, nextId++);
    } catch { /* skip */ }
  }
}

// ── gen pass 消费的全局面(同 mods/calamity/tests/gen-pass-golden.test.ts 装载路径)──
(globalThis as Record<string, unknown>).__calamityTileDefs = TILE_DEFS;
(globalThis as Record<string, unknown>).__calamityTileIdByKey = TILE_BY_KEY;
(globalThis as unknown as { __calamityGenTiles?: Record<string, number> }).__calamityGenTiles = {};

// 快照载入(x 主序→行主序;gzip)
function loadSnap(pat: string) {
  const f = readdirSync(LOGS).filter((x) => x.endsWith(pat + '.bin.gz')).sort().pop();
  if (!f) throw new Error('快照未找到: ' + pat);
  const buf = gunzipSync(readFileSync(join2(LOGS, f)));
  const w = 4200, h = 1200, n = w * h;
  const type = new Uint16Array(n), wall = new Uint16Array(n);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * 4;
    type[y * w + x] = buf[o] | (buf[o + 1] << 8);
    wall[y * w + x] = buf[o + 2] | (buf[o + 3] << 8);
  }
  return { type, wall, file: f };
}
import { join as join2 } from 'node:path';

// ── FNV 对账锁边界(genprobe.log PASS 行 tf ↔ 快照 type-FNV)──
// 快照 type 流=x 主序 u16 LE;FNV-1a 32 仅 type 通道(低字节→高字节;同 _anchor-compare.ts)
const fnvOf = (buf: Uint8Array): string => {
  const w = 4200, h = 1200;
  let hh = 0x811c9dc5;
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * 4;
    hh ^= buf[o]; hh = Math.imul(hh, 0x01000193) >>> 0;
    hh ^= buf[o + 1]; hh = Math.imul(hh, 0x01000193) >>> 0;
  }
  return hh.toString(16).padStart(8, '0');
};
// 解析 genprobe.log PASS 行 → name→tf
const passTf = new Map<string, string>();
{
  const log = readFileSync(join2(LOGS, 'genprobe.log'), 'utf8');
  for (const line of log.split('\n')) {
    const cols = line.split('\t');
    if (cols[0] !== 'PASS') continue;
    passTf.set(cols[2], cols[3]);
  }
}
const TF_IN = passTf.get('Draedon Structures');
const TF_OUT = passTf.get('Abyss');
if (!TF_IN || !TF_OUT) throw new Error('genprobe.log 缺 Draedon Structures/Abyss PASS 行');
let preFile = '', postFile = '';
for (const f of readdirSync(LOGS).sort()) {
  if (!f.startsWith('genprobe-snap-') || !f.endsWith('.bin.gz')) continue;
  const tf = fnvOf(gunzipSync(readFileSync(join2(LOGS, f))));
  if (tf === TF_IN) preFile = f;
  if (tf === TF_OUT) postFile = f;
}
if (!preFile || !postFile) throw new Error(`FNV 对账失败: 输入(${TF_IN})=${preFile || '无'} 输出(${TF_OUT})=${postFile || '无'}`);
console.log(`[replay] FNV 边界锁定: 输入=${preFile}(tf=${TF_IN}) 输出=${postFile}(tf=${TF_OUT})`);

// C# id→本仓内部 id
const SHEET_TO_INTERNAL = new Map<number, number>();
for (let i = 1; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i] as { vanilla?: { sheet: number } } | undefined;
  if (d?.vanilla && d.vanilla.sheet < 753 && !SHEET_TO_INTERNAL.has(d.vanilla.sheet)) SHEET_TO_INTERNAL.set(d.vanilla.sheet, i);
}
// mod 运行时 id→名(终版 twld tileMap)
class BER { off = 0; constructor(public b: Uint8Array) {} u8() { return this.b[this.off++]; } i16() { const v = (this.b[this.off] << 8) | this.b[this.off + 1]; this.off += 2; return (v << 16) >> 16; } i32() { const v = ((this.b[this.off] << 24) | (this.b[this.off + 1] << 16) | (this.b[this.off + 2] << 8) | this.b[this.off + 3]) | 0; this.off += 4; return v; } bytes(n: number) { const s = this.b.subarray(this.off, this.off + n); this.off += n; return s; } str() { const n = this.i16(); return Buffer.from(this.bytes(n)).toString('utf8'); } }
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
const MOD_ID_TO_NAME = new Map<number, number>();   // cs id → 本仓 internal id
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
  console.log('[replay] mod 名映射', MOD_ID_TO_NAME.size);
}
const CS_TO_OURS = (cs: number): number => cs === 0 ? 0 : cs < 753 ? (SHEET_TO_INTERNAL.get(cs) ?? 0) : (MOD_ID_TO_NAME.get(cs) ?? 0);
const KEY_OF = (id: number): string => TILE_DEFS[id]?.key ?? `#${id}`;

// store 构建
const w = 4200, h = 1200, n = w * h;
function buildStore(snap: { type: Uint16Array; wall: Uint16Array }) {
  const type = new Uint16Array(n), flags = new Uint8Array(n);
  const wall = new Uint16Array(n), liquid = new Uint8Array(n), liquidType = new Uint8Array(n);
  const wire = new Uint8Array(n), half = new Uint8Array(n), slope = new Uint8Array(n);
  const frameX = new Uint16Array(n), frameY = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const t = CS_TO_OURS(snap.type[i]);
    type[i] = t; flags[i] = t !== 0 ? 1 : 0;
    wall[i] = snap.wall[i];
  }
  return {
    w, h, type, flags, wall, liquid, liquidType, wire, half, slope, frameX, frameY,
    idx(x: number, y: number) { return y * w + x; },
    get(x: number, y: number) { return type[y * w + x]; },
    setTile(x: number, y: number, t: number, fx = 0, fy = 0) { if (x < 0 || x >= w || y < 0 || y >= h) return; const i = y * w + x; type[i] = t; flags[i] = t !== 0 ? 1 : 0; frameX[i] = fx; frameY[i] = fy; },
    setTileSilent(x: number, y: number, t: number, fx = 0, fy = 0) { this.setTile(x, y, t, fx, fy); },
    hasTile(x: number, y: number) { return (flags[y * w + x] & 1) !== 0; },
    purgeGhostTiles() { return 0; },
  };
}

const pre = loadSnap(preFile.replace(/^genprobe-snap-\d+-/, '').replace('.bin.gz', ''));
const post = loadSnap(postFile.replace(/^genprobe-snap-\d+-/, '').replace('.bin.gz', ''));
const store = buildStore(pre);

// ── worldSurfaceLow 等价值标定(★652)────────────────────────────────
// ChasmGenerator 起点 j 只通过「探针列首个实心行」起作用:probe 自 j 下行扫首个
// HasTile。若 j ≤ 列首行,probe 命中=列首行(j 取何值无关)。取三探针列
// (chasmX/chasmX∓22 各 -125)首实心行的 min-65 作安全等价值(L+65 ≤ 各列首行恒成立),
// 并用真链雕顶( PRE 有 POST 无 的最高行≈命中行-半宽)校验「真 j ≤ 列首行」前提。
const chasmX0 = 4030;
const probeCols = [chasmX0 - 125, chasmX0 - 22 - 125, chasmX0 + 22 - 125];
const ftOf = (col: number) => {
  for (let y = 1; y < h; y++) if (store.hasTile(col, y)) return y;
  return h;
};
const fts = probeCols.map(ftOf);
let realCarveTop = -1;
for (let y = 1; y < h && realCarveTop < 0; y++) {
  for (let x = chasmX0 - 60; x < chasmX0 + 60; x++) {
    const i = y * w + x;
    if (pre.type[i] !== 0 && post.type[i] === 0) { realCarveTop = y; break; }
  }
}
const surfLowEquiv = Number(process.env.SW_ABYSS_SURFLOW) || (Math.min(...fts) - 65);
console.log(`[replay] 探针列首实心行 [${probeCols.join(',')}] = [${fts.join(',')}] 真雕顶=${realCarveTop}(命中≈雕顶+13) → worldSurfaceLow 等价值=${surfLowEquiv}`);

// sulphurYStart 重算(gen-sea DetermineYStart 同式:SulphurousSea.cs:228;
//  biomeWidth=370(W=4200),atLeft=false → getActualX(371)=4200-1-371=3828;
//  surfLow=worldSurfaceLow → 自 surfLow-20 下行探第一个实心,黑檀石(sheet25)西移重试)
let sulphurYStart = 337;
{
  const xCheck0 = w - 1 - (370 + 1);
  let xCheck = xCheck0;
  const genSolid0 = (x: number, y: number) => {
    if (!store.hasTile(x, y)) return false;
    const d = TILE_DEFS[store.get(x, y)] as { solid?: boolean } | undefined;
    return !!(d && d.solid);
  };
  const scanFrom = Math.max(1, surfLowEquiv - 20);
  for (let guard = 0; guard <= 370; guard++) {
    let found = -1;
    for (let y = scanFrom; y < Math.min(h, scanFrom + 3000); y++) {
      if (genSolid0(xCheck, y)) { found = y; break; }
    }
    if (found < 0) break;
    const td = TILE_DEFS[store.get(xCheck, found)] as { vanilla?: { sheet: number } } | undefined;
    if (td?.vanilla?.sheet === 25) { xCheck += -1; continue; }
    sulphurYStart = found;
    break;
  }
  const topSolid = (() => { for (let y = 1; y < h; y++) if (genSolid0(xCheck0, y)) return y; return -1; })();
  console.log(`[replay] sulphurYStart 重算=${sulphurYStart}(x=${xCheck0} 起扫 y=${scanFrom};列顶实心=${topSolid}——同值则起点无关)`);
}

const genMod = await import('../mods/calamity/src/gen.ts');
const abyssMod = await import('../mods/calamity/src/gen-abyss.ts');
let abyssFn: ((...a: unknown[]) => void) | null = null;
let decorFn: ((...a: unknown[]) => void) | null = null;
const captured: string[] = [];
const stub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'registerGenPass') return (name: string, fn: (...a: unknown[]) => void) => {
      captured.push(name);
      if (name === 'Abyss') abyssFn = fn;
      if (name === 'Abyss Decorations') decorFn = fn;
    };
    if (prop === 'log') return (...a: unknown[]) => console.log('[gen]', ...a);
    return () => {};
  },
  has: () => true,
});
(genMod as { setupGen(sw: unknown): void }).setupGen(stub);
(abyssMod as { setupGenAbyss(sw: unknown): void }).setupGenAbyss(stub);
if (!abyssFn || !decorFn) throw new Error(`pass 未注册齐: captured=[${captured.join(', ')}]`);
console.log('[replay] pass fn 就绪:', captured.join(', '));

const gs = {
  seed: translateSeed('9293480'),
  worldSurface: 337, rockLevel: 535,
  dungeonX: 3421, dungeonMaxY: 207, dungeonMinX: 0, dungeonMaxX: 4200,
  seedFlags: {},
  mods: {
    tileIdByKey: Object.fromEntries(Object.entries(TILE_BY_KEY).filter(([k]) => k.startsWith('mod_')).map(([k, v]) => [k.replace(/^mod_[a-z0-9]+_/, ''), v])),
    itemIdByKey: {},
    chests: [] as unknown[],
    // 真链状态面(SulphurousSea.cs:188 零掷派生;dungeonX=3421>2100→false;
    //  worldSurfaceLow=★652 探针列等价值——真链 TerrainPass.cs:237 游走 min,
    //  引擎全链 ctxGs[0] 自带,vanilla 全等已由 TerrainPass 位级金标背书)
    sulphurAtLeft: false,
    sulphurYStart,
    worldSurfaceLow: surfLowEquiv,
  },
};
const atLeft = gs.mods.sulphurAtLeft as boolean;
const genLimit = Math.floor(w / 2);
const chasmX = atLeft ? 170 : genLimit + (genLimit - 135) - 35;
const xLo0 = chasmX - 170;
console.log(`[replay] atLeft=${atLeft} chasmX=${chasmX} 区 x∈[${chasmX - 170}, ${Math.min(w, chasmX + 170)}]`);

// 两 pass 连跑(真链一个 Abyss pass 的两段;单流连续)
// K 扫描钩:SW_ABYSS_PREFIX_ROLLS 覆盖 Prefix(-1) 世界流掷数(校准用)
if (process.env.SW_ABYSS_PREFIX_ROLLS) (globalThis as { __swAbyssPrefixRolls?: number }).__swAbyssPrefixRolls = Number(process.env.SW_ABYSS_PREFIX_ROLLS);
const preHad = new Uint8Array(n);
for (let i = 0; i < n; i++) preHad[i] = store.flags[i] & 1;
const rng = new RNG(gs.seed as number);
(abyssFn as (...a: unknown[]) => void)(store, rng, gs);
(decorFn as (...a: unknown[]) => void)(store, rng, gs);
console.log(`[replay] chests=${gs.mods.chests.length}`);

// 我方雕除带(PRE 有 tile → pass 后无)vs 真链雕除带——堑壕路径对拍
{
  const yB = new Map<number, number>(), xB = new Map<number, number>();
  for (let x = xLo0; x < w; x++) for (let y = 0; y < h; y++) {
    const i = y * w + x;
    if (preHad[i] && !(store.flags[i] & 1)) {
      yB.set(Math.floor(y / 50) * 50, (yB.get(Math.floor(y / 50) * 50) ?? 0) + 1);
      xB.set(Math.floor(x / 25) * 25, (xB.get(Math.floor(x / 25) * 25) ?? 0) + 1);
    }
  }
  console.log('[replay] 我雕 y 带:', [...yB.entries()].sort((a, b) => a[0] - b[0]).map(([b, c]) => `${b}:${c}`).join(' '));
  console.log('[replay] 我雕 x 带:', [...xB.entries()].sort((a, b) => a[0] - b[0]).map(([b, c]) => `${b}:${c}`).join(' '));
}

// ── diff 剖面 ──
let diff = 0, diffIn = 0, diffOut = 0;
const diffByType = new Map<string, number>();
let firstDiff = '';
const xLo = chasmX - 170, xHi = Math.min(w, chasmX + 170);
const yBands = new Map<number, number>();
const xBands = new Map<number, number>();
for (let i = 0; i < n; i++) {
  const realT = CS_TO_OURS(post.type[i]);
  if (store.type[i] !== realT) {
    diff++;
    const x = i % w, y = Math.floor(i / w);
    if (x >= xLo && x < xHi) diffIn++; else diffOut++;
    yBands.set(Math.floor(y / 100) * 100, (yBands.get(Math.floor(y / 100) * 100) ?? 0) + 1);
    xBands.set(Math.floor(x / 50) * 50, (xBands.get(Math.floor(x / 50) * 50) ?? 0) + 1);
    const key = `${KEY_OF(store.type[i])}→${KEY_OF(realT)}`;
    diffByType.set(key, (diffByType.get(key) ?? 0) + 1);
    if (!firstDiff) firstDiff = `首格(${x},${y}) 我=${KEY_OF(store.type[i])} 真=${KEY_OF(realT)}`;
  }
}
console.log(`[replay] 逐格 diff=${diff}/${n}(${((diff / n) * 100).toFixed(2)}%) 区内=${diffIn} 区外=${diffOut} ${firstDiff}`);
console.log('[replay] y 带差格(y:count):', [...yBands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([b, c]) => `${b}:${c}`).join(' '));
console.log('[replay] x 带差格(x:count):', [...xBands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([b, c]) => `${b}:${c}`).join(' '));
console.log('[replay] 迁移对 TOP15(我→真):');
for (const [k, c] of [...diffByType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${k}: ${c}`);

// 双侧聚合(全图)
const cnt = (arr: Uint16Array) => { const m = new Map<string, number>(); for (let i = 0; i < n; i++) { const k = KEY_OF(arr[i]); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
const oursC = cnt(store.type), realC = cnt(Array.from(post.type, CS_TO_OURS));
const keys = new Set([...oursC.keys(), ...realC.keys()]);
const rows = [...keys].map((k) => [k, oursC.get(k) ?? 0, realC.get(k) ?? 0] as [string, number, number]).filter((r) => Math.abs(r[1] - r[2]) > 0).sort((a, b) => Math.abs(b[1] - b[2]) - Math.abs(a[1] - a[2]));
console.log('[replay] 聚合差全列(tile 我 真 Δ):');
for (const [k, a, b] of rows) console.log(`  ${k}: ${a} vs ${b}  Δ${b - a}`);
process.exit(0);
