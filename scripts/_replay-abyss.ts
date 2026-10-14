// ★652:Abyss(+Abyss Decorations) pass 重放判卷(克隆 _replay-crag.ts;流语义定谳:RNG(seed) fresh)
// 边界定谳(FNV 对账):探针 PASS 行 tf=该 pass 完成后状态(WorldGenerator.cs:497 每 pass 重播);
//   输入=「Draedon Structures 完成态」快照(tf 对账锁定),输出=「Abyss 完成态」快照。
//   两 pass 连跑(真链一个 Abyss pass 的两段:Abyss.cs:40-803 主体 + :530-799 装饰归
//   gen-abyss.ts;单一连续流,Decorations 不重播)。
// gs:worldSurfaceLow=TerrainPass num5 初值式(fresh 流首掷确定,见下);
//   sulphurAtLeft=false(SulphurousSea.cs:188 dungeonX<maxTilesX/2 零掷派生);
//   sulphurYStart=gen-sea DetermineYStart 同式扫描(SulphurousSea.cs:228)。
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = process.env.SW_GAME_ROOT ?? process.cwd();
const LOGS = process.env.SW_SNAP_DIR ?? '/Users/vinlic/Library/Application Support/Terraria/tModLoader/Logs';
const PROBE_LOG = process.env.GENPROBE_LOG ?? join2(LOGS, 'genprobe.log');
const { TILE_BY_KEY, TILE_DEFS, registerModTile } = await import('../src/data/tiles.ts');
const { RNG, translateSeed } = await import('../src/core/rng.ts');
const awaitImportResetTerrain = await import('../src/world/gen/WorldGen.ts');

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
const passTf = new Map<string, string>();
{
  const log = readFileSync(PROBE_LOG, 'utf8');
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

// ── worldSurfaceLow 定谳(★652b 勘误):GenVars.worldSurfaceLow = TerrainPass 列游走
//   的 num5 运行最小值(TerrainPass.cs:91 num5=Math.Min(num3,num5) 逐列;:237 落盘)——
//   旧「首掷式」=num3 初值,漏掉游走下探;应复算整条 Reset+Terrain 流。
//   引擎已有种子等价钩 runResetAndTerrain(WorldGen.ts:970,Reset 掷骰+Terrain 1:1)
//   → 直接取其 gs.worldSurfaceLow(与真链 GenVars 同流同式)。SW_ABYSS_SURFLOW 仍可覆写。
const surfLowEquiv = Number(process.env.SW_ABYSS_SURFLOW) || (() => {
  const { gs: gsT } = (awaitImportResetTerrain as { runResetAndTerrain: (cfg: { width: number; height: number; seedText: string; evil?: number }) => { gs: { worldSurfaceLow: number; worldSurface: number; rockLevel: number } } }).runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: -1 });
  console.log(`[replay] 引擎 Reset+Terrain 复算: worldSurfaceLow=${gsT.worldSurfaceLow} worldSurface=${gsT.worldSurface} rockLevel=${gsT.rockLevel}`);
  return gsT.worldSurfaceLow;
})();

const atLeft = false;   // SulphurousSea.cs:188:dungeonX=3421>2100 → AtLeftSideOfWorld=false
const genLimit = Math.floor(w / 2);
const chasmX = atLeft ? 170 : genLimit + (genLimit - 135) - 35;   // Abyss.cs:49
const xLo0 = chasmX - 170;
console.log(`[replay] worldSurfaceLow=${surfLowEquiv}(TerrainPass num5 初值式;SW_ABYSS_SURFLOW 可覆写)`);
// 堑壕探针命中行(与 pass 内同式:自 j 下行探首个实心;j=L+65 / L / L)
{
  const hit = (col: number, j: number) => { for (let y = Math.max(0, j); y < h - 1; y++) if (store.hasTile(col, y)) return y; return -1; };
  console.log(`[replay] 堑壕探针命中: 中(${chasmX - 125},${surfLowEquiv + 65})→${hit(chasmX - 125, surfLowEquiv + 65)} 左(${chasmX - 22 - 125},${surfLowEquiv})→${hit(chasmX - 22 - 125, surfLowEquiv)} 右(${chasmX + 22 - 125},${surfLowEquiv})→${hit(chasmX + 22 - 125, surfLowEquiv)}`);
}

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
  console.log(`[replay] sulphurYStart 重算=${sulphurYStart}(x=${xCheck0} 起扫 y=${scanFrom})`);
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
  // ★652:worldSurfaceLow=真链 GenVars 顶层字段(引擎 ctxGs[0] 同名同位;
  //  TerrainPass.ts:195 产出,位级金标背书)——gen.ts Abyss 段消费此键定堑壕起点
  worldSurfaceLow: surfLowEquiv,
  dungeonX: 3421, dungeonMaxY: 207, dungeonMinX: 0, dungeonMaxX: 4200,
  seedFlags: {},
  mods: {
    tileIdByKey: Object.fromEntries(Object.entries(TILE_BY_KEY).filter(([k]) => k.startsWith('mod_')).map(([k, v]) => [k.replace(/^mod_[a-z0-9]+_/, ''), v])),
    itemIdByKey: {},
    chests: [] as unknown[],
    // 真链状态面(SulphurousSea.cs:188 零掷派生;dungeonX=3421>2100→false)
    sulphurAtLeft: false,
    sulphurYStart,
  },
};
console.log(`[replay] atLeft=${atLeft} chasmX=${chasmX} 区 x∈[${chasmX - 170}, ${Math.min(w, chasmX + 170)}]`);

// 两 pass 连跑(真链一个 Abyss pass 的两段;单流连续)
// 环境钩(判卷仪校准):SW_ABYSS_SURFLOW(L 覆写)
if (process.env.SW_ABYSS_CLAMPMODE) (globalThis as { __swAbyssClampMode?: number }).__swAbyssClampMode = Number(process.env.SW_ABYSS_CLAMPMODE);
if (process.env.SW_ABYSS_SURFLOW) (globalThis as { __swAbyssChasmX?: number }).__swAbyssChasmX = undefined;
(globalThis as { __swAbyssChasmTrace?: string[] | null }).__swAbyssChasmTrace = process.env.SW_ABYSS_CHASM_TRACE ? [] : null;
(globalThis as { __swAbyssChasmTrace?: string[] | null }).__swAbyssChasmTrace = [];
(globalThis as { __swAbyssIslandLog?: string[] | null }).__swAbyssIslandLog = process.env.SW_ABYSS_ISLAND_LOG ? [] : null;
(globalThis as { __swAbyssCell?: [number, number] | null }).__swAbyssCell = [4082, 269];
const preHad = new Uint8Array(n);
for (let i = 0; i < n; i++) preHad[i] = store.flags[i] & 1;
const rng = new RNG(gs.seed as number);
// ★671:掷数计数(对拍真链 SPY 谱)
(globalThis as { __drawN?: number }).__drawN = 0;
// ★segment 打点(分段掷数配平)
{
  const segs: Array<[string, number]> = [];
  const rawSegs: Array<[string, number]> = [];
  (globalThis as { __swAbyssSeg?: (n: number, name: string) => void }).__swAbyssSeg = (n, name) => {
    segs.push([name, n]);
    rawSegs.push([name, (globalThis as { __rawN?: number }).__rawN ?? 0]);
  };
  (globalThis as { __swAbyssSegDump?: () => void }).__swAbyssSegDump = () => {
    let prev = 0, prevRaw = 0;
    for (let k = 0; k < segs.length; k++) {
      const [name, n] = segs[k];
      const r = rawSegs[k]?.[1] ?? 0;
      console.log(`[seg] ${name}: +${n - prev} (累计 ${n}) raw=+${r - prevRaw} (raw累计 ${r})${n - prev !== r - prevRaw ? '  ★幻差' + (n - prev - (r - prevRaw)) : ''}`);
      prev = n; prevRaw = r;
    }
  };
}
{
  const proto = rng as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of Object.getOwnPropertyNames(Object.getPrototypeOf(rng))) {
    const fn = proto[m];
    if (typeof fn === 'function' && /^(next|int|intRange|nextBool|nextFloat|nextDouble)/i.test(m)) {
      proto[m] = function (this: unknown, ...a: unknown[]) {
        (globalThis as { __drawN?: number }).__drawN = ((globalThis as { __drawN?: number }).__drawN ?? 0) + 1;
        const v = fn.apply(this, a) as number;
        // ★652b:块哈希挂 proto 层(计全掷,含 nextInt——洗牌/前缀类非 next 掷不漏)
        if (typeof v === 'number') {
          const f = new Float64Array(1); f[0] = v; const u = new Uint32Array(f.buffer);
          let hh = CHUNK_H ^ u[0]; hh = Math.imul(hh, 0x01000193) >>> 0; hh ^= u[1]; hh = Math.imul(hh, 0x01000193) >>> 0; CHUNK_H = hh;
          if (((globalThis as { __drawN?: number }).__drawN ?? 0) % 4096 === 0) { CHUNKS.push(CHUNK_H); CHUNK_H = 0x811c9dc5; }
          const dumpFrom = Number(process.env.SW_VALS_FROM ?? -1), dumpTo = Number(process.env.SW_VALS_TO ?? -1);
          const g = (globalThis as { __drawN?: number }).__drawN ?? 0;
          if (dumpFrom >= 0 && g > dumpFrom && g <= dumpTo) VALS_OUT.push(`${g}\t${v.toFixed(9)}`);
        }
        return v;
      };
    }
  }
}
let drawCount = 0;
const drawVals: number[] = [];
let CHUNK_H = 0x811c9dc5;
const CHUNKS: number[] = [];
const VALS_OUT: string[] = [];
const FILL_DRAWS = 4880;   // 填充 dither 掷总数(位对拍 查+歧义)
const fillDelta = Number(process.env.SW_ABYSS_FILLDELTA ?? 0);
let injected = false;
const rawNext = rng.next.bind(rng);
// ★693 双计数器:__rawN=真流 next() 消耗(own-property 层);__drawN=proto 方法计数。
//   两者差=幻计数(proto 层被多计的调用)——逐段对拍定位
(globalThis as { __rawN?: number }).__rawN = 0;
(rng as { next: () => number }).next = () => {
  if (!injected && drawCount >= FILL_DRAWS && fillDelta > 0) { for (let z = 0; z < fillDelta; z++) rawNext(); injected = true; }
  const v = rawNext(); drawCount++;
  (globalThis as { __rawN?: number }).__rawN = ((globalThis as { __rawN?: number }).__rawN ?? 0) + 1;
  if (drawVals.length < 16384) drawVals.push(v);
  return v;
};
(abyssFn as (...a: unknown[]) => void)(store, rng, gs);
console.log(`[replay] Abyss pass 掷数=${drawCount}`);
(globalThis as { __swAbyssSegDump?: () => void }).__swAbyssSegDump?.();
drawCount = 0;
(decorFn as (...a: unknown[]) => void)(store, rng, gs);
console.log(`[replay] Decorations 掷数=${drawCount}`);
writeFileSync('/tmp/vals-replay-chunks.txt', CHUNKS.map((h, k) => `${k}\t${(h >>> 0).toString(16)}`).join('\n'));
writeFileSync('/tmp/vals-replay.txt', VALS_OUT.join('\n'));
console.log(`[replay] chests=${gs.mods.chests.length}`);
// ★693 化石区网格 dump(env SW_FOSSIL_GRID=1):我方终态 vs 真终态(x 4015..4045, y 885..905)
if (process.env.SW_FOSSIL_GRID === '1') {
  const CH: Record<string, string> = { voidstone: 'V', pyre_mantle: 'P', pyre_mantle_molten: 'Q', abyss_gravel: 'G', sulphurous_shale: 'S', scoria_ore: 'C', planty_mush: 'M', smooth_voidstone: 'W', abyss_fossil_tile: 'F', sulphurous_sandstone: 'n', hardened_sulphurous_sandstone: 'H', sulphurous_sand: 'd', sulphurous_sand_wall: 'w' };
  const nmz = (t: number) => { if (t === 0) return '.'; const k = KEY_OF(t).replace('mod_calamity_', '').replace(/^v_/, ''); return CH[k] ?? (k[0] === 'v' ? 'v' : k[0] === 'm' ? 'm' : k[0] === 's' ? 's' : k[0] === 'h' ? 'h' : '?'); };
  for (let y = 885; y <= 905; y++) {
    let mine = '', real = '', preC = '';
    for (let x = 4015; x <= 4045; x++) {
      const i = y * w + x;
      mine += nmz((store.flags[i] & 1) ? store.type[i] : 0);
      real += nmz(CS_TO_OURS(post.type[i]));
      preC += nmz(CS_TO_OURS(pre.type[i]));
    }
    const d = [...mine].map((ch, k) => ch === real[k] ? ' ' : 'X').join('');
    console.log(`[fgrid] y${y} 前:${preC}`);
    console.log(`[fgrid] y${y} 我:${mine} 真:${real} 差:${d}`);
  }
  // 逐差格三方归因
  const cls = new Map<string, number>();
  for (let y = 885; y <= 905; y++) for (let x = 4015; x <= 4045; x++) {
    const i = y * w + x;
    const p0 = nmz(CS_TO_OURS(pre.type[i])), mo = nmz((store.flags[i] & 1) ? store.type[i] : 0), re = nmz(CS_TO_OURS(post.type[i]));
    if (mo !== re) cls.set(`(${x},${y}) 前${p0} 我${mo} 真${re}`, (cls.get(`(${x},${y}) 前${p0} 我${mo} 真${re}`) ?? 0) + 1);
  }
  // ★693 chasm 蛇形轨迹对拍:每 20 行带的 deactivate 格(我 vs 真)+蛇头首行
  console.log('[snake] 每 20 行带雕格数(我/真)与带内我方雕格 x 范围:');
  for (let y0 = 200; y0 <= 940; y0 += 20) {
    let mo = 0, re = 0, moLo = 9999, moHi = -1, reLo = 9999, reHi = -1;
    for (let y = y0; y < y0 + 20; y++) for (let x = 3950; x <= 4110; x++) {
      const i = y * w + x;
      const preHad = CS_TO_OURS(pre.type[i]) !== 0;
      const moC = preHad && !(store.flags[i] & 1);
      const reC = preHad && CS_TO_OURS(post.type[i]) === 0;
      if (moC) { mo++; if (x < moLo) moLo = x; if (x > moHi) moHi = x; }
      if (reC) { re++; if (x < reLo) reLo = x; if (x > reHi) reHi = x; }
    }
    if (mo || re) console.log(`  y${y0}-${y0+19}: 我=${mo}[${moLo},${moHi}] 真=${re}[${reLo},${reHi}]`);
  }
  // ★693 蛇身差位:y355-420 带内 我雕真留/我留真雕 的 x 坐标
  {
    const mineOnly: number[] = [], trueOnly: number[] = [];
    for (let y = 355; y <= 420; y++) for (let x = 3940; x <= 4120; x++) {
      const i = y * w + x;
      const preHad = CS_TO_OURS(pre.type[i]) !== 0;
      if (!preHad) continue;
      const moC = !(store.flags[i] & 1), reC = CS_TO_OURS(post.type[i]) === 0;
      if (moC && !reC) mineOnly.push(x);
      else if (!moC && reC) trueOnly.push(x);
    }
    const tally = (arr: number[]) => { const m = new Map<number, number>(); for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([x, c]) => `x${x}:${c}`).join(' '); };
    console.log(`[snake-diff] y355-420 我雕真留=${mineOnly.length} ${tally(mineOnly)}`);
    console.log(`[snake-diff] y355-420 我留真雕=${trueOnly.length} ${tally(trueOnly)}`);
  }
  console.log('[fcls] 差格归因(实际键名):');
  {
    const seen = new Map<string, number>();
    for (let y = 889; y <= 895; y++) for (let x = 4020; x <= 4045; x++) {
      const i = y * w + x;
      const moK = (store.flags[i] & 1) ? KEY_OF(store.type[i]) : 'empty';
      const reK = KEY_OF(CS_TO_OURS(post.type[i]));
      if (moK !== reK) {
        const k = `(${x},${y}) 前=${KEY_OF(CS_TO_OURS(pre.type[i]))} 我=${moK} 真=${reK}`;
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
    }
    for (const [k, c] of seen) console.log(`  ${k} ×${c}`);
  }
  for (const [k, c] of cls) console.log(`  ${k} ×${c}`);
}
for (const c of gs.mods.chests as Array<{ x: number; y: number }>) {
  const cells: string[] = [];
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
    const i = (c.y + dy) * w + (c.x + dx);
    cells.push(`${c.x + dx},${c.y + dy}:${KEY_OF((store.flags[i] & 1) ? store.type[i] : 0)}`);
  }
  console.log(`[chest-probe] @${c.x},${c.y}: ${cells.join(' | ')}`);
}
for (const l of (globalThis as { __swAbyssIslandLog?: string[] }).__swAbyssIslandLog ?? []) console.log('[island]', l);
for (const l of (globalThis as { __swAbyssChasmTrace?: string[] }).__swAbyssChasmTrace ?? []) console.log('[chasm-trace]', l);

// ── 填充 dither 位流对拍(★652):真 POST 反推 coin 位 vs 我方掷值序 ──
// 可写格=!has||vanilla;三 dither 带:1-2(525-535) coin→gravel(806) else shale(847);
// 2-3(707-709) coin→pyre(815) else gravel(806);3-4(857-859) coin→void(852) else pyre(815)。
// POST 被后期覆盖/雕除的格跳过(歧义)。j=全带掷序游标。
{
  const CS_INV = new Map<number, number>();
  for (const [cs, internal] of MOD_ID_TO_NAME) CS_INV.set(internal, cs);
  const pyreCs = 815, voidCs = 852, gravelCs = 806, shaleCs = 847;
  let j = 0, mismatch = 0, checked = 0, skipped = 0;
  let firstMis = '';
  for (let x = 3870; x < 4200; x++) for (let y = 0; y < 1000; y++) {
    const i = y * w + x;
    const has = pre.type[i] !== 0;
    if (has && pre.type[i] >= 753) continue;         // mod tile=不可写,零掷
    let upperCs = -1;
    if (y >= 525 && y <= 535) upperCs = gravelCs;    // rock-10=525,11 行
    else if (y >= 707 && y <= 709) upperCs = pyreCs;
    else if (y >= 857 && y <= 859) upperCs = voidCs;
    else continue;
    const myVal = drawVals[j];
    if (myVal === undefined) break;
    const realCs = CS_TO_OURS(post.type[i]) !== 0 ? CS_INV.get(CS_TO_OURS(post.type[i])) ?? -1 : 0;
    if (realCs !== upperCs && realCs !== (upperCs === pyreCs ? gravelCs : upperCs === voidCs ? pyreCs : shaleCs)) { skipped++; j++; continue; }
    checked++;
    if ((myVal < 0.5) !== (realCs === upperCs)) {
      mismatch++;
      if (!firstMis) firstMis = `首分歧 掷#${j} (${x},${y}) 真=${realCs === upperCs ? 1 : 0}`;
    }
    j++;
  }
  console.log(`[replay] dither 位对拍: 查=${checked} 歧义=${skipped} 分歧=${mismatch}/${checked} ${firstMis}(分歧=岛屿/堑壕覆盖污染,首分歧前全合=填充零差)`);

  // ── δ 追凶(★652):真链 chasm1 cw@py≈300 ∈[36,45](y300 走廊宽 87 反演)——
  // 纯数组模拟 cw 游走(2 掷/步,与盒尺寸无关),扫 δ=填充尾部多掷数。
  {
    const F = Math.fround;
    const Nx = (v: number, a: number, b: number) => a + Math.floor(v * (b - a));
    // 探针命中按 L 预算(列 3905/3883/3927,起点 L+65/L/L)
    const hit = (col: number, j: number) => { for (let y = Math.max(0, j); y < h - 1; y++) if (store.hasTile(col, y)) return y; return -1; };
    const results: Array<[number, number, number, number]> = [];
    for (let L2 = 162; L2 <= 305; L2++) {
    const hits = [hit(3905, L2 + 65), hit(3883, L2), hit(3927, L2)];
    for (let d = 0; d <= 4000; d++) {
      // 三条 chasm 顺序模拟;chasm1 的 cw@py≈300 与 chasm3 的 cw@py≈270-285 记账
      let pos = 4880 + d;   // d=0 = 我方当前模型
      const cwAt: number[][] = [[], [], []];
      const pyAt: number[][] = [[], [], []];
      let ok = true;
      for (let ci = 0; ci < 3; ci++) {
        const jHit = hits[ci];
        const vX = drawVals[pos]; const vY = drawVals[pos + 1]; const vW = drawVals[pos + 2];
        if (vX === undefined || vY === undefined || vW === undefined) { ok = false; break; }
        pos += 3;
        let cw = Nx(vW, 5, 7) + 20;
        const offY = F(Nx(vY, 3, 8) * F(0.2) + F(0.5));
        let maxChasm = 850;
        let py = jHit;
        let guard = 0;
        while (cw > 0 && guard < 900) {
          guard++;
          if (maxChasm > 0) {
            const vA = drawVals[pos]; const vB = drawVals[pos + 1];
            if (vA === undefined || vB === undefined) { ok = false; break; }
            cw += Nx(vA, 0, 10); cw -= Nx(vB, 0, 10);
            if (maxChasm > 790) { if (cw < 7) cw = 7; if (cw > 45) cw = 45; }
            else { if (cw < 30) cw = 30; if (cw > 70) cw = 70; }
          } else if (py > 850) {
            const vN = drawVals[pos];
            if (vN === undefined) { ok = false; break; }
            cw -= Nx(vN, 0, 5) + 8;
          }
          if (maxChasm > 0 && py > 850) maxChasm = 0;
          maxChasm -= 1;
          // 盒掷数:0.5-box + 2×1.1-box 的每格 1 掷(近似=盒面积;dist 通过率 ~0.6 略去,
          // 但 chasm 间对消——同模型同偏)——此处用占位常数会破坏步长对齐,故完整模拟:
          // 为保数组可行,盒掷数按面积/步估计:0.5-box=cw², 1.1-box=2×(2.2cw)²——噪声门恒掷
          const b05 = Math.max(0, Math.min(1200, (cw * 1) * (cw * 1))) | 0;
          const b11 = Math.max(0, Math.min(6000, Math.round(2 * (cw * 2.2) * (cw * 2.2)))) | 0;
          pos += b05 + b11;
          py += offY;
          cwAt[ci].push(cw); pyAt[ci].push(py);
        }
        if (!ok) break;
      }
      if (!ok) continue;
      // chasm1 cw@py≈300;k=(300-281)/offY —— pyAt[0] 找最近 300 的下标
      const idx1 = pyAt[0].findIndex((p) => p >= 300);
      if (idx1 < 0) continue;
      const cw1 = cwAt[0][idx1];
      // chasm3 cw@py≈270-285 的均值
      const i3a = pyAt[2].findIndex((p) => p >= 270);
      const i3b = pyAt[2].findIndex((p) => p >= 285);
      if (i3a < 0 || i3b < 0 || i3b <= i3a) continue;
      const cw3avg = cwAt[2].slice(i3a, i3b).reduce((a, b) => a + b, 0) / (i3b - i3a);
      if (cw1 >= 36 && cw1 <= 45 && cw3avg >= 17 && cw3avg <= 28) results.push([L2, d, cw1, cw3avg]);
    }
    }
    console.log(`[replay] δ×L 追凶: 双约束命中 ${results.length} 个(L, δ, cw1, chasm3 cw@270-285):`);
    for (const [l2, d, c1, c3] of results.slice(0, 30)) console.log(`  L=${l2} δ=${d} cw1=${c1.toFixed(0)} cw3avg=${c3.toFixed(1)}`);
  }
}

// ── diff 剖面 ──
let diff = 0, diffIn = 0, diffOut = 0;
const diffByType = new Map<string, number>();
let firstDiff = '';
const xHi = Math.min(w, chasmX + 170);
const yBands = new Map<number, number>();
const xBands = new Map<number, number>();
for (let i = 0; i < n; i++) {
  const realT = CS_TO_OURS(post.type[i]);
  // ★652 终谳:chasm 清除只动 flags,type 数组留 stale——真链快照对 carved 格规范化 0,
  // 判卷口径同式:有效型 = flags&1 ? type : 0(否则 carved 格全是假差)
  const myEff = (store.flags[i] & 1) ? store.type[i] : 0;
  if (myEff !== realT) {
    diff++;
    const x = i % w, y = Math.floor(i / w);
    if (x >= xLo0 && x < xHi) diffIn++; else diffOut++;
    yBands.set(Math.floor(y / 100) * 100, (yBands.get(Math.floor(y / 100) * 100) ?? 0) + 1);
    xBands.set(Math.floor(x / 50) * 50, (xBands.get(Math.floor(x / 50) * 50) ?? 0) + 1);
    const key = `${KEY_OF(myEff)}→${KEY_OF(realT)}`;
    diffByType.set(key, (diffByType.get(key) ?? 0) + 1);
    if (!firstDiff) firstDiff = `首格(${x},${y}) 我=${KEY_OF(myEff)} 真=${KEY_OF(realT)}`;
  }
}
console.log(`[replay] 逐格 diff=${diff}/${n}(${((diff / n) * 100).toFixed(2)}%) 区内=${diffIn} 区外=${diffOut} ${firstDiff}`);
// 局部堑壕形状指标(y∈[260,380):mound+上层走廊,岛带 382 起,岛污染不入)
{
  let band = 0;
  for (let y = 260; y < 380; y++) for (let x = chasmX - 170; x < Math.min(w, chasmX + 170); x++) {
    const i = y * w + x;
    if (store.type[i] !== CS_TO_OURS(post.type[i])) band++;
  }
  console.log(`[replay] 局部堑壕带 diff(y[260,380))=${band}`);
  // 带内差格三分类 + 空间分布
  {
    let myExtra = 0, myMiss = 0, typeMis = 0;
    const by20 = new Map<string, number>();
    for (let y = 260; y < 380; y++) for (let x = chasmX - 170; x < Math.min(w, chasmX + 170); x++) {
      const i = y * w + x;
      const myT = store.type[i], rT = CS_TO_OURS(post.type[i]);
      if (myT === rT) continue;
      const myE = myT === 0, rE = rT === 0;
      let cls;
      if (myE && !rE) { cls = 'A我多雕'; myExtra++; }
      else if (!myE && rE) { cls = 'B我漏雕'; myMiss++; }
      else { cls = 'C异型'; typeMis++; }
      const key = `${cls}@y${Math.floor(y / 20) * 20}`;
      by20.set(key, (by20.get(key) ?? 0) + 1);
      if (cls === 'B我漏雕') { const kx = `B@x${Math.floor(x / 20) * 20}`; by20.set(kx, (by20.get(kx) ?? 0) + 1); }
      if (myMiss <= 20) console.log(`[replay] B#${myMiss} (${x},${y}) pre=${pre.type[i]} 我=${myT} 真=${rT}`);
    }
    console.log(`[replay] 带内分类: A我多雕=${myExtra} B我漏雕=${myMiss} C异型=${typeMis}`);
  // y360/y340 雕 mask 并排(mine vs real,x3900-4160)
  for (const yy of [300, 310, 320, 330, 345, 355, 365, 370]) {
    let a = '', b = '', c = '';
    for (let x = 3900; x <= 4160; x++) {
      const i = yy * w + x;
      const m = preHad[i] && !(store.flags[i] & 1);
      const r = pre.type[i] !== 0 && post.type[i] === 0;
      a += m ? '#' : (pre.type[i] !== 0 ? 'o' : '.');
      b += r ? '#' : (pre.type[i] !== 0 ? 'o' : '.');
      c += (m && !r) ? 'X' : (r && !m) ? '?' : ' ';
    }
    console.log(`[replay] y${yy} 我:${a}`);
    console.log(`[replay]       真:${b}`);
    console.log(`[replay]       差:${c}  (X=我多雕 ?=我漏雕)`);
  }
    const keys = [...by20.keys()].sort();
    let line = '';
    for (const k of keys) line += `${k}:${by20.get(k)} `;
    console.log('[replay] 带内分布:', line);
  }
  // 雕量对账:双方 carve 总格数(PRE 有 tile → 各自 post 空)
  {
    let mineCarve = 0, realCarve = 0;
    for (let x = chasmX - 170; x < Math.min(w, chasmX + 170); x++) for (let y = 0; y < h; y++) {
      const i = y * w + x;
      const m = preHad[i] && !(store.flags[i] & 1);
      const r = pre.type[i] !== 0 && post.type[i] === 0;
      if (m) mineCarve++; if (r) realCarve++;
    }
    console.log(`[replay] 雕量: 我=${mineCarve} 真=${realCarve}`);
    // carved 按类型直方图(PRE 型 → 计数)
    const mm = new Map<number, number>(), rm = new Map<number, number>();
    for (let x = chasmX - 170; x < Math.min(w, chasmX + 170); x++) for (let y = 0; y < h; y++) {
      const i = y * w + x;
      const pt = pre.type[i];
      if (pt === 0) continue;
      if (preHad[i] && !(store.flags[i] & 1)) mm.set(pt, (mm.get(pt) ?? 0) + 1);
      if (pt !== 0 && post.type[i] === 0) rm.set(pt, (rm.get(pt) ?? 0) + 1);
    }
    const nmz = (v: number) => v === 810 ? 'h' : v === 845 ? 's' : v === 1 ? 'dirt' : v === 53 ? 't53' : v < 753 ? 'v' + v : 'm' + v;
    const all = new Set([...mm.keys(), ...rm.keys()]);
    console.log('[replay] carved 按型(我/真):', [...all].map((v) => `${nmz(v)}:${mm.get(v) ?? 0}/${rm.get(v) ?? 0}`).join(' '));
    // 逐 50 行带 carve 量
    const rows: string[] = [];
    for (let y0 = 250; y0 <= 900; y0 += 50) {
      let m = 0, r = 0;
      for (let x = chasmX - 170; x < Math.min(w, chasmX + 170); x++) for (let y = y0; y < y0 + 50; y++) {
        const i = y * w + x;
        if (preHad[i] && !(store.flags[i] & 1)) m++;
        if (pre.type[i] !== 0 && post.type[i] === 0) r++;
      }
      rows.push(`y${y0}:${m}/${r}`);
    }
    console.log('[replay] 雕量带(我/真):', rows.join(' '));
  }
}
console.log('[replay] y 带差格(y:count):', [...yBands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([b, c]) => `${b}:${c}`).join(' '));
console.log('[replay] x 带差格(x:count):', [...xBands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([b, c]) => `${b}:${c}`).join(' '));
// ── 走廊边缘剖面(★652b):逐 10 行雕格 x 极差(我 vs 真)——反演 cw 轨迹分歧起点
{
  const lines: string[] = [];
  for (let y = 250; y < 900; y += 10) {
    let mLo = -1, mHi = -1, rLo = -1, rHi = -1, mN = 0, rN = 0;
    for (let x = chasmX - 170; x < Math.min(w, chasmX + 170); x++) {
      const i = y * w + x;
      if (preHad[i] && !(store.flags[i] & 1)) { if (mLo < 0) mLo = x; mHi = x; mN++; }
      if (pre.type[i] !== 0 && post.type[i] === 0) { if (rLo < 0) rLo = x; rHi = x; rN++; }
    }
    if (mN || rN) lines.push(`y${y}: 我[${mLo},${mHi}]×${mN} 真[${rLo},${rHi}]×${rN}`);
  }
  for (const l of lines) console.log('[corridor]', l);
}
console.log('[replay] 迁移对 TOP15(我→真):');
for (const [k, c] of [...diffByType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${k}: ${c}`);

// 双侧聚合(全图)
const cnt = (arr: Uint16Array) => { const m = new Map<string, number>(); for (let i = 0; i < n; i++) { const k = KEY_OF(arr[i]); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
const myEffArr = new Uint16Array(n);
for (let i = 0; i < n; i++) myEffArr[i] = (store.flags[i] & 1) ? store.type[i] : 0;
const oursC = cnt(myEffArr), realC = cnt(Array.from(post.type, CS_TO_OURS));
const keys = new Set([...oursC.keys(), ...realC.keys()]);
const rows = [...keys].map((k) => [k, oursC.get(k) ?? 0, realC.get(k) ?? 0] as [string, number, number]).filter((r) => Math.abs(r[1] - r[2]) > 0).sort((a, b) => Math.abs(b[1] - b[2]) - Math.abs(a[1] - a[2]));
console.log('[replay] 聚合差全列(tile 我 真 Δ):');
for (const [k, a, b] of rows) console.log(`  ${k}: ${a} vs ${b}  Δ${b - a}`);
process.exit(0);
