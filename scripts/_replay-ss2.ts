// ★652:Abyss(+Abyss Decorations) pass 重放判卷(克隆 _replay-crag.ts;流语义定谳:RNG(seed) fresh)
// 边界定谳(FNV 对账):探针 PASS 行 tf=该 pass 完成后状态(WorldGenerator.cs:497 每 pass 重播);
//   输入=「Draedon Structures 完成态」快照(tf 对账锁定),输出=「Abyss 完成态」快照。
//   两 pass 连跑(真链一个 Abyss pass 的两段:Abyss.cs:40-803 主体 + :530-799 装饰归
//   gen-abyss.ts;单一连续流,Decorations 不重播)。
// gs:worldSurfaceLow=TerrainPass num5 初值式(fresh 流首掷确定,见下);
//   sulphurAtLeft=false(SulphurousSea.cs:188 dungeonX<maxTilesX/2 零掷派生);
//   sulphurYStart=gen-sea DetermineYStart 同式扫描(SulphurousSea.cs:228)。
import { readFileSync, readdirSync, writeFileSync, existsSync, createReadStream } from 'node:fs';
import readline from 'node:readline';
import { gunzipSync } from 'node:zlib';

const root = process.env.SW_GAME_ROOT ?? process.cwd();
const LOGS = process.env.SW_SNAP_DIR ?? '/Users/vinlic/Library/Application Support/Terraria/tModLoader/Logs';
const PROBE_LOG = process.env.GENPROBE_LOG ?? join2(LOGS, 'genprobe.log');
const { TILE_BY_KEY, TILE_DEFS, registerModTile } = await import('../src/data/tiles.ts');
const { ITEM_BY_KEY, registerModItem } = await import('../src/data/items.ts');
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

// 快照载入(x 主序→行主序;gzip)。★699ad v2=5 bytes/格(尾字节=slope|half<<3;
//   旧 v1=4 bytes 自动兼容——斜率补 0)
function loadSnap(pat: string) {
  const f = readdirSync(LOGS).filter((x) => x.endsWith(pat + '.bin.gz')).sort().pop();
  if (!f) throw new Error('快照未找到: ' + pat);
  const buf = gunzipSync(readFileSync(join2(LOGS, f)));
  const w = 4200, h = 1200, n = w * h;
  const stride = buf.length >= n * 5 ? 5 : 4;
  const type = new Uint16Array(n), wall = new Uint16Array(n);
  const slope = new Uint8Array(n), half = new Uint8Array(n), act = new Uint8Array(n);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * stride;
    type[y * w + x] = buf[o] | (buf[o + 1] << 8);
    wall[y * w + x] = buf[o + 2] | (buf[o + 3] << 8);
    if (stride === 5) { const fl = buf[o + 4]; slope[y * w + x] = fl & 7; half[y * w + x] = (fl >> 3) & 1; act[y * w + x] = (fl >> 4) & 1; }
    // ★699az:v3 位 bit4=active(解 type0 二义:活泥土≠空格;旧档 bit4=0 回退 type≠0)
  }
  return { type, wall, slope, half, act, file: f };
}
import { join as join2 } from 'node:path';

// ── FNV 对账锁边界(genprobe.log PASS 行 tf ↔ 快照 type-FNV)──
//   ★699ad:兼容 v1(4 bytes/格)与 v2(5 bytes/格,尾字节=slope/half)——stride 探测
const fnvOf = (buf: Uint8Array): string => {
  const w = 4200, h = 1200;
  const stride = buf.length >= w * h * 5 ? 5 : 4;
  let hh = 0x811c9dc5;
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * stride;
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
const TF_IN = passTf.get('Abyss');
const TF_OUT = passTf.get('Sulphur Sea 2');
if (!TF_IN || !TF_OUT) throw new Error('genprobe.log 缺 Abyss/Sulphur Sea 2 PASS 行');
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
  { let __abyss: string[] = []; let __unk: string[] = []; for (const e of tileMap) {
    const f = (Array.isArray(e) ? e : (e as { v: unknown }).v) as Array<{ name: string; v: unknown }>;
    const get = (nm: string) => f.find((x) => x.name === nm)?.v;
    const snake = String(get('name')).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    const our = TILE_BY_KEY[`mod_calamity_${snake}`];
    const val = Number(get('value'));
    if (our !== undefined) MOD_ID_TO_NAME.set(val, our);
    if (/pyre|voidstone|abyss_gravel|sulphurous_shale/i.test(snake)) __abyss.push(snake + '=' + val);
    if (val >= 920 && val <= 935) __unk.push(snake + '=' + val);
  } console.log('[replay] census abyss:', __abyss.join(' ')); console.log('[replay] census 920-935:', __unk.join(' ')); }
  console.log('[replay] mod 名映射', MOD_ID_TO_NAME.size);

}
// ★699bx census 缺失真链 id 回退:cs≥693(C# TileID.Count=TileID.cs:2121 直读)必为
//   mod 型——绝不可回退 0(活泥土哨兵:vanilla sheet=0→Abyss 层写 flag2 true→
//   误吞整个域((4103-4108,993-999) 全变 voidstone=diff 8 格之源(929=crag_
//   stalagmite_large1(census 直证;json 缺→映射缺)。回退=762(首个 mod tile
//   (abyss_giant_kelp1):sheet=1030≥域阈(层写不吞)+判卷两侧对称(快照同
//   函数转换→两侧同显示)→diff 消。
const CS_TO_OURS = (cs: number): number => cs === 0 ? 0 : cs < 753 ? (SHEET_TO_INTERNAL.get(cs) ?? 0) : (MOD_ID_TO_NAME.get(cs) ?? (cs >= 693 ? 762 : 0));
const KEY_OF = (id: number): string => TILE_DEFS[id]?.key ?? `#${id}`;

{
  // mod item 注册(golden 同款;SS2 addChestWithLoot 的 vidOf/pf 消费面)
  let itemN = 0;
  const itemDir = `${root}/mods/calamity/content/items`;
  for (const f of readdirSync(itemDir).sort()) {
    if (!f.endsWith('.json')) continue;
    try { registerModItem({ key: `mod_calamity_${f.replace('.json', '')}`, name: f.replace('.json', '') }, 30000 + itemN); itemN++; } catch { /* 幂等重跑 skip */ }
  }
  console.log(`[replay] mod item 注册=${itemN}`);
}
// store 构建(★699ad:透传快照 slope/half——v2 5-byte 快照;v1 快照恒 0)
const w = 4200, h = 1200, n = w * h;
function buildStore(snap: { type: Uint16Array; wall: Uint16Array; slope?: Uint8Array; half?: Uint8Array; act?: Uint8Array }) {
  const type = new Uint16Array(n), flags = new Uint8Array(n);
  const wall = new Uint16Array(n), liquid = new Uint8Array(n), liquidType = new Uint8Array(n);
  const wire = new Uint8Array(n), half = new Uint8Array(n), slope = new Uint8Array(n);
  const frameX = new Uint16Array(n), frameY = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const t = CS_TO_OURS(snap.type[i]);
    type[i] = t; flags[i] = (snap.act?.[i] || t !== 0) ? 1 : 0;   // ★699az:v3 bit4 权威(active-dirt 载活)
    wall[i] = snap.wall[i];
    slope[i] = snap.slope?.[i] ?? 0;
    half[i] = snap.half?.[i] ?? 0;
  }
  // ★699bz slope 写追踪仪:Proxy 拦截目标格写入(env SW_SLOPE_SPY="x,y;x,y")——
  //   stack 3 帧归因(判别哪个面清零 famA 97 格/确认 famB 23 格零写入)
  let slopeOut: Uint8Array = slope;
  const __spyCells = (process.env.SW_SLOPE_SPY || '').split(';').filter(Boolean).map((c) => { const [x, y] = c.split(',').map(Number); return y * w + x; });
  if (__spyCells.length) {
    const tgt = new Set(__spyCells);
    const st0 = new Error().stack ?? '';
    slopeOut = new Proxy(slope, {
      get(t, p, r) { return Reflect.get(t, p, t); },
      set(t, p, v, r) {
        const i = typeof p === 'string' && /^\d+$/.test(p) ? +p : -1;
        if (i >= 0 && tgt.has(i) && t[i] !== v) {
          const __st = (new Error()).stack ?? '';
          const __fr = __st.split('\n').slice(2, 5).map((l: string) => { const mm = /at (\S+)/.exec(l); return mm ? mm[1].split('/').pop() + ':' + (/:(\d+):/.exec(l)?.[1] ?? '?') : '?'; }).join(' <= ');
          console.log(`[slspy] (${i % w},${Math.floor(i / w)}) ${t[i]} -> ${v} :: ${__fr}`);
        }
        return Reflect.set(t, p, v, t);
      },
    }) as unknown as Uint8Array;
  }
  return {
    w, h, type, flags, wall, liquid, liquidType, wire, half, slope: slopeOut, frameX, frameY,
    idx(x: number, y: number) { return y * w + x; },
    get(x: number, y: number) { return type[y * w + x]; },
    setTile(x: number, y: number, t: number, fx = 0, fy = 0) {
      // ★699bz 邻域清写 spy:env SW_CLEAR_SPY 目标格 5x5 邻域内的 setTile 全记(带相位)
      {
        const __cs = (globalThis as { __swClearSpyIdx?: Set<number> }).__swClearSpyIdx;
        if (__cs && __cs.has(y * w + x)) {
          const __ph = (globalThis as { __swPhase?: string }).__swPhase ?? '?';
          console.log(`[clrspy] ${__ph} (${x},${y}) <- t=${t} act_after=${t !== 0 ? 1 : 0}`);
        }
      }
      if ((globalThis as { __swWriteSpy?: boolean }).__swWriteSpy && (
            (x === 4035 && y >= 555 && y <= 561) ||
            (x >= 4009 && x <= 4010 && y >= 573 && y <= 574) ||
            (x >= 4105 && x <= 4106 && y >= 996 && y <= 999))) {
        const __st2 = (new Error()).stack ?? '';
        const __fr2 = __st2.split('\n').slice(2, 6).map((l: string) => { const mm = /at (\S+)/.exec(l); return mm ? mm[1].split('/').pop() + ':' + (/:(\d+):/.exec(l)?.[1] ?? '?') : '?'; }).join(' <= ');
        console.log(`[writespy] (${x},${y}) <- type=${t} :: ${__fr2}`);
      }
      if (x < 0 || x >= w || y < 0 || y >= h) return; const i = y * w + x; type[i] = t; flags[i] = t !== 0 ? 1 : 0; frameX[i] = fx; frameY[i] = fy; },
    setTileSilent(x: number, y: number, t: number, fx = 0, fy = 0) { this.setTile(x, y, t, fx, fy); },
    hasTile(x: number, y: number) { return (flags[y * w + x] & 1) !== 0; },
    purgeGhostTiles() { return 0; },
  };
}

const pre = loadSnap(preFile.replace(/^genprobe-snap-\d+-/, '').replace('.bin.gz', ''));
const post = loadSnap(postFile.replace(/^genprobe-snap-\d+-/, '').replace('.bin.gz', ''));
const store = buildStore(pre);
(globalThis as Record<string, unknown>).__swWriteSpy = process.env.SW_WRITE_SPY === '1';

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

const seaMod = await import('../mods/calamity/src/gen-sea.ts');
let ss2Fn: ((...a: unknown[]) => void) | null = null;
const captured: string[] = [];
const stub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'registerGenPass') return (name: string, fn: (...a: unknown[]) => void) => {
      captured.push(name);
      if (name === 'Sulphur Sea 2') ss2Fn = fn;
    };
    if (prop === 'log') return (...a: unknown[]) => console.log('[gen]', ...a);
    return () => {};
  },
  has: () => true,
});
(seaMod as { setupGenSea(sw: unknown): void }).setupGenSea(stub);
if (!ss2Fn) throw new Error(`pass 未注册齐: captured=[${captured.join(', ')}]`);
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
    itemIdByKey: Object.fromEntries(Object.entries(ITEM_BY_KEY).filter(([k]) => k.startsWith('mod_calamity_'))),
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
    (globalThis as { __swAbyssSegs?: Array<[string, number]> }).__swAbyssSegs = segs;   // ★699at:首分歧段定位
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
// ★699at:全 pass V 值级日志启用(与真链 V 流全 pass 对拍定位首分歧)
(globalThis as Record<string, unknown>).__swPassVLogOn = true;
(globalThis as { __swPlaceLog?: number[] }).__swPlaceLog = process.env.SW_PLACE_LOG ? [] : undefined;
if (process.env.SW_DUMP_AT) {
  (globalThis as { __swDumpAt?: number }).__swDumpAt = Number(process.env.SW_DUMP_AT);
  if (process.env.SW_DUMP_BOX) (globalThis as { __swDumpBox?: number[] }).__swDumpBox = process.env.SW_DUMP_BOX.split(',').map(Number);
  (globalThis as { __swDumpOut?: string[] }).__swDumpOut = [];
}
// ★699bz slope 相位仪:120 差格三点 dump(P0=main 前/P1=decor 前/P2=终态)——
// 定位我方清零发生在 main 还是 decor pass(env SW_SLOPE_CELLS="x,y;x,y" 驱动)
const __slCells = (process.env.SW_SLOPE_CELLS || '').split(';').filter(Boolean).map((c) => c.split(',').map(Number) as [number, number]);
const __slDump = (label: string) => {
  if (!__slCells.length) return;
  const lines: string[] = [];
  for (const [x, y] of __slCells) {
    const i = y * w + x;
    lines.push(`${x},${y}: in=${pre.slope?.[i] ?? 0}/${pre.act?.[i] ?? 0} ours=${store.slope[i]}/${(store.flags[i] & 1) ? 1 : 0} t=${store.type[i]}`);
  }
  console.log(`[slphase ${label}] ${lines.join(' | ')}`);
};
__slDump('P0');
// ★699bz 邻域 spy 目标集:目标格 5x5 邻域
{
  const csEnv = (process.env.SW_CLEAR_SPY || '').split(';').filter(Boolean).map((c) => c.split(',').map(Number) as [number, number]);
  const idx = new Set<number>();
  for (const [tx, ty] of csEnv) for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const nx = tx + dx, ny = ty + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h) idx.add(ny * w + nx); }
  (globalThis as { __swClearSpyIdx?: Set<number> }).__swClearSpyIdx = idx;
}
(globalThis as { __swPhase?: string }).__swPhase = 'ss2';
(ss2Fn as (...a: unknown[]) => void)(store, rng, gs);
(globalThis as Record<string, unknown>).__swPassVLogOn = false;
console.log(`[replay] Sulphur Sea 2 pass 掷数=${drawCount}`);
for (const s2 of (globalThis as { __swDumpOut?: string[] }).__swDumpOut ?? []) console.log(s2);   // ★699at 区域快照
(globalThis as { __swAbyssSegDump?: () => void }).__swAbyssSegDump?.();
{
  // ★699at 放置坐标流对拍:我方 walk+clumps 放置 [drawN,x,y] ↔ 真链 SF 行(N,x,y)。
  //   掷值流全合而坐标差 = clumps ty 洞降漂移(无掷状态读)的直读判卷。
  const PL = (globalThis as { __swPlaceLog?: number[] }).__swPlaceLog;
  const sfLog = process.env.SW_TRUE_SF_LOG ?? '/tmp/genprobe-deent-sftf.log';
  if (PL && PL.length && existsSync(sfLog)) {
    const tN: number[] = [], tX: number[] = [], tY: number[] = [];
    const rl = readline.createInterface({ input: createReadStream(sfLog), crlfDelay: Infinity });
    for await (const line of rl) {
      if (line.charCodeAt(0) !== 83 /* 'S' */) continue;
      const c = line.split('\t');
      if (c[0] !== 'SF' || c.length < 4) continue;
      tN.push(+c[1]); tX.push(+c[2]); tY.push(+c[3]);
    }
    const ours = PL.length / 3;
    console.log(`[sf] 我方放置=${ours} 真链 SF=${tN.length}`);
    const lim = Math.min(ours, tN.length);
    let firstBad = -1, badCount = 0;
    for (let i = 0; i < lim; i++) {
      if (PL[i * 3 + 1] !== tX[i] || PL[i * 3 + 2] !== tY[i]) { if (firstBad < 0) firstBad = i; badCount++; }
    }
    console.log(`[sf] 比对 ${lim}:首坐标差@#${firstBad + 1}${firstBad >= 0 ? `(我 drawN=${PL[firstBad * 3]}↔真 N=${tN[firstBad]})` : ''} 差总数=${badCount}`);
    if (firstBad >= 0) {
      const lo = Math.max(0, firstBad - 8), hi = Math.min(lim, firstBad + 12);
      for (let i = lo; i < hi; i++) {
        const o = `(${PL[i * 3 + 1]},${PL[i * 3 + 2]})@${PL[i * 3]}`, t = `(${tX[i]},${tY[i]})@${tN[i]}`;
        console.log(`[sf]   #${i + 1}${i === firstBad ? ' ★差' : '    '} 我=${o.padEnd(18)} 真=${t.padEnd(18)}${o === t ? '' : '  ≠'}`);
      }
    } else if (ours === tN.length) {
      console.log('[sf] ★放置坐标流全合(walk+clumps 零分歧)!');
    } else {
      console.log(`[sf] ⚠前缀全合但长度差:我=${ours} 真=${tN.length}(Δ${ours - tN.length})`);
    }
  }
}
drawCount = 0;
(globalThis as Record<string, unknown>).__swDecorVLog = []; (globalThis as Record<string, unknown>).__swSlopeTrace = []; (globalThis as Record<string, unknown>).__swBlotchTrace = [];
(globalThis as Record<string, unknown>).__swSSKills = [];
__slDump('P2');
{
  const vl = (globalThis as Record<string, unknown>).__swDecorVLog as string[];
  writeFileSync('/tmp/our-decor-vlog.txt', vl.join('\n'));
{
  const st = (globalThis as { __swSlopeTrace?: string[] }).__swSlopeTrace;
  if (st && st.length) console.log('[slope-trace] ' + st.length + ' 条:\n' + st.join('\n'));
}
{
  const bt = (globalThis as { __swBlotchTrace?: string[] }).__swBlotchTrace;
  if (bt && bt.length) console.log('[blotch-trace]\n' + bt.join('\n'));
}
  console.log(`[replay] decor vlog=${vl.length} 行已落盘`);
  writeFileSync('/tmp/ss-kills.txt', ((globalThis as Record<string, unknown>).__swSSKills as string[] | undefined)?.join('\n') ?? '');
  (globalThis as Record<string, unknown>).__swDecorVLog = undefined;
}
{
  // ★699at 对拍仪:我方 PV(typed 压缩)↔ 真链 V 行(流式解析)。首值差=流位首分歧;
  //   等价类 R(0,n)≡M(n)(值恒等标签互换)不算差;重同步探测区分多掷/少掷。
  const PV = (globalThis as { __swPassVLog?: { kab: Int32Array; val: Float64Array; n: number } }).__swPassVLog;
  if (PV && PV.n > 0) {
    const trueLog = process.env.SW_TRUE_V_LOG ?? '/tmp/genprobe-ss2-oracle.log';
    console.log(`[pv] 我方 pass 掷数=${PV.n} 真链日志=${trueLog}`);
    if (existsSync(trueLog)) {
      const CAP = 41_000_000;
      const tN = new Int32Array(CAP), tKab = new Int32Array(CAP);
      const tVal = new Float64Array(CAP);
      let tRows = 0;
      const rl = readline.createInterface({ input: createReadStream(trueLog), crlfDelay: Infinity });
      for await (const line of rl) {
        if (line.charCodeAt(0) !== 86 /* 'V' */) continue;
        const c = line.split('\t');
        if (c.length < 6) continue;
        const k = c[2] === 'D' ? 2 : c[2] === 'M' ? 1 : c[2] === 'R' ? 0 : -1;
        if (k < 0 || tRows >= CAP) continue;
        tN[tRows] = +c[1];
        tKab[tRows] = (k << 26) | ((+c[3] + 512) << 13) | ((+c[4] + 512));
        tVal[tRows] = +c[5];
        tRows++;
      }
      console.log(`[pv] 真链 V 行=${tRows} N∈[${tN[0]},${tN[tRows - 1]}]`);
      const un = (kab: number): string => {
        const k = kab >>> 26, a = ((kab >>> 13) & 8191) - 512, b = (kab & 8191) - 512;
        return `${k === 0 ? 'R' : k === 1 ? 'M' : 'D'}(${a}${k === 0 ? ',' : ''}${k === 1 ? '' : ''}${k === 0 ? b : k === 1 ? '' : ''})`;
      };
      const kOf = (kab: number) => kab >>> 26;
      const aOf = (kab: number) => ((kab >>> 13) & 8191) - 512;
      const bOf = (kab: number) => (kab & 8191) - 512;
      const eq = (kabO: number, valO: number, kabT: number, valT: number): boolean => {
        if (valO !== valT) return false;
        if (kabO === kabT) return true;
        const kO = kOf(kabO), kT = kOf(kabT);   // 等价类:R(0,n)≡M(n) 值恒等
        return (kO === 0 && kT === 1 && aOf(kabO) === 0 && bOf(kabO) === aOf(kabT))
          || (kO === 1 && kT === 0 && aOf(kabT) === 0 && bOf(kabT) === aOf(kabO));
      };
      const fpMatch = (j: number, probeK: number): boolean => {
        for (let q = 0; q < probeK; q++) if (!eq(PV.kab[q], PV.val[q], tKab[j + q], tVal[j + q])) return false;
        return true;
      };
      let j0 = -1, probeUsed = 0;
      for (const probeK of [Math.min(64, PV.n, tRows), 24, 12, 6, 3, 2, 1]) {
        if (probeK < 1 || PV.n < probeK) continue;
        if (fpMatch(0, probeK)) { j0 = 0; probeUsed = probeK; break; }
        const scanLim = probeK >= 24 ? tRows : Math.min(tRows, 2_000_000);
        for (let j = 1; j + probeK <= scanLim; j++) if (fpMatch(j, probeK)) { j0 = j; probeUsed = probeK; break; }
        if (j0 >= 0) break;
      }
      const segOf = (drawN: number): string => {
        const segs = (globalThis as { __swAbyssSegs?: Array<[string, number]> }).__swAbyssSegs ?? [];
        for (let q = segs.length - 1; q >= 0; q--) if (segs[q][1] <= drawN) return `${segs[q][0]}@${segs[q][1]}`;
        return '?';
      };
      if (j0 < 0) {
        console.log('[pv] ★对齐失败:我方首 64 指纹在真链全行无匹配(首分歧<64 掷或 pass 前流位错位)');
        console.log(`[pv] 我方首 12:${Array.from({ length: 12 }, (_, q) => `${un(PV.kab[q])}=${PV.val[q]}`).join(' ')}`);
        console.log(`[pv] 真链首 12:${Array.from({ length: 12 }, (_, q) => `${un(tKab[q])}=${tVal[q]}`).join(' ')}`);
      } else {
        console.log(`[pv] 对齐(probe=${probeUsed}):我方掷#1 ↔ 真链 N=${tN[j0]}(行${j0})`);
        const lim = Math.min(PV.n, tRows - j0);
        const after = Number(process.env.SW_PV_AFTER ?? 0);
        let firstBad = -1, badCount = 0;
        for (let i = 0; i < lim; i++) {
          if (!eq(PV.kab[i], PV.val[i], tKab[j0 + i], tVal[j0 + i])) { if (firstBad < 0 && i >= after) firstBad = i; badCount++; }
        }
        console.log(`[pv] 比对 ${lim} 掷:首值差@掷#${firstBad + 1}(drawN=${firstBad + 1},段=${firstBad >= 0 ? segOf(firstBad + 1) : '-'}) 值差总数=${badCount}`);
        if (firstBad >= 0) {
          const lo = Math.max(0, firstBad - 20), hi = Math.min(lim, firstBad + 20);
          for (let i = lo; i < hi; i++) {
            const o = `${un(PV.kab[i])}=${PV.val[i]}`, t = `${un(tKab[j0 + i])}=${tVal[j0 + i]}`;
            console.log(`[pv]   #${i + 1}${i === firstBad ? ' ★差' : '     '} N=${tN[j0 + i]} 我=${o.padEnd(14)} 真=${t.padEnd(14)}${o === t ? '' : '  ≠'}`);
          }
          // 重同步探测:我方 [i+s..i+s+32) ≡ 真链 [i..i+32) ⇒ s>0 我多掷 s / s<0 我少掷 |s|
          const win = 32;
          const syncAt = (s: number): boolean => {
            if (firstBad + s < 0 || firstBad + s + win > PV.n || firstBad + win > tRows - j0) return false;
            for (let q = 0; q < win; q++) if (!eq(PV.kab[firstBad + s + q], PV.val[firstBad + s + q], tKab[j0 + firstBad + q], tVal[j0 + firstBad + q])) return false;
            return true;
          };
          const shifts: number[] = [];
          for (let s = -200; s <= 200; s++) if (syncAt(s)) shifts.push(s);
          console.log(`[pv] 重同步位移 s(我多掷为正):${shifts.length ? shifts.join(',') : '无(±200 内不复流)'}`);
        } else {
          console.log(`[pv] ★全 ${lim} 掷值级全合(地形段零分歧)!`);
        }
      }
    } else console.log('[pv] 真链日志不存在,跳过对拍');
  }
}
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
// ★699z 交集测试:diff 格集落盘(与熵域 E(C,B) 求交=系统性残差)
if (process.env.SW_DUMP_DIFF_CELLS === '1') {
  const cells: Array<[number, number]> = [];
  for (let i2 = 0; i2 < n; i2++) {
    const realT2 = CS_TO_OURS(post.type[i2]);
    const myEff2 = (store.flags[i2] & 1) ? store.type[i2] : 0;
    if (myEff2 !== realT2) cells.push([i2 % w, Math.floor(i2 / w), KEY_OF(myEff2), KEY_OF(realT2)]);
  }
  writeFileSync('/tmp/replay-diff-cells.json', JSON.stringify(cells));
  console.log(`[diffcells] ${cells.length} 格已落盘`);
}

// ★699bu 残簇终态字节直读
{
  const cells2: Array<[number, number]> = [[4103,995],[4104,995],[4107,995],[4108,995],[4103,996],[4104,996],[4105,996],[4106,996],[4107,996],[4108,996],[4104,999],[4107,999],[4105,1000],[4106,1000],[4105,995],[4106,995]];
  for (const [px, py] of cells2) {
    const pi = py * w + px;
    console.log(`[STATE] (${px},${py}) type=${store.type[pi]} act=${(store.flags[pi] & 1) ? 1 : 0} slope=${store.slope[pi]} half=${store.half[pi]}`);
  }
}
console.log(`[replay] 逐格 diff=${diff}/${n}(${((diff / n) * 100).toFixed(2)}%) 区内=${diffIn} 区外=${diffOut} ${firstDiff}`);
// ★699aw:slope 对拍(藤种门/PlacePot 门读 slope——型差=0 而 slope 差=装饰段阻塞根因)
{
  let sdiff = 0, hdiff = 0;
  const scells: string[] = [];
  for (let i2 = 0; i2 < n; i2++) {
    const x2 = i2 % w;
    if (x2 < 3860 || x2 >= 4200) continue;   // 深渊域外=pass120 fallout 不涉
    if (post.slope[i2] !== store.slope[i2]) { sdiff++; if (scells.length < 400) scells.push(`${x2},${Math.floor(i2 / w)} 我=${store.slope[i2]} 真=${post.slope[i2]} t=${(store.flags[i2] & 1) ? KEY_OF(store.type[i2]).replace('mod_calamity_', '') : 'E'} 惟t=${(post.act?.[i2] ?? 1) ? KEY_OF(CS_TO_OURS(post.type[i2])).replace('mod_calamity_', '') : 'E'}`); }
    if ((post.half?.[i2] ?? 0) !== store.half[i2]) hdiff++;   // ★699bz half 轴并判(边界声明)
  }
  console.log(`[replay] slope 差=${sdiff}: ${scells.join(' | ')}`);
  console.log(`[replay] half 差=${hdiff}`);
}
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
