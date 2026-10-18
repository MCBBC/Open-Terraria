// ★683:Evil Island + Astral Chest pass 重放判卷(克隆 _replay-sea.ts/_replay-abyss.ts)
// 边界定谳(FNV 对账):探针 PASS 行 tf=该 pass 完成后状态(WorldGenerator.cs:499 每 pass
//   重播种=逐 pass 确定性;2026-10-14 两跑 tf 全等实证)。
//   Evil Island:  输入=after "Quick Cleanup"(75),输出=after "Evil Island"(76)
//   Astral Chest: 输入=after "Dungeon"(32),        输出=after "Astral Chest"(33)
// 快照语义(实证):genprobe-snap-XX-<kind>-<名> 的「名」=该名 pass 完成态(kind 不改语义);
//   共享 genprobe.log 可能被并行会话截断→回退 /tmp/evil-judge/ 侧存档。
// SPY 对账目标(真链 PASS 行 dN):Evil Island=2,032,079(dG=2,031,999,dM=80);
//   Astral Chest=36(dG=35,dM=1)。
import { TMOD_LOGS, needInput } from './_pathlib.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = process.env.SW_GAME_ROOT ?? process.cwd();
const LOGS = needInput(TMOD_LOGS);
const SIDE_LOG = '/tmp/evil-judge/genprobe-evil-run.log';
const SIDE_SNAPS = '/tmp/evil-judge/snaps';
const { TILE_BY_KEY, TILE_DEFS, registerModTile } = await import('../src/data/tiles.ts');
const { RNG, translateSeed } = await import('../src/core/rng.ts');
const { rollNaturalPrefixForVid } = await import('../src/data/vanillaPrefixes.ts');

// mod tile 注册(键字典序=全链分配序,stableId 从 1030 起;字段面=content JSON)
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
(globalThis as Record<string, unknown>).__calamityTileDefs = TILE_DEFS;
(globalThis as Record<string, unknown>).__calamityTileIdByKey = TILE_BY_KEY;

// ── 快照载入(x 主序→行主序;gzip)──
function loadSnapBuf(pat: string) {
  const dirs = [LOGS, SIDE_SNAPS];
  for (const d of dirs) {
    try {
      const f = readdirSync(d).filter((x) => x.endsWith(pat + '.bin.gz')).sort().pop();
      if (f) return gunzipSync(readFileSync(d === LOGS ? `${d}/${f}` : `${d}/${f}`));
    } catch { /* 目录缺则跳过 */ }
  }
  throw new Error('快照未找到: ' + pat);
}
function loadSnap(pat: string) {
  const buf = loadSnapBuf(pat);
  const w = 4200, h = 1200, n = w * h;
  const type = new Uint16Array(n), wall = new Uint16Array(n);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * 4;
    type[y * w + x] = buf[o] | (buf[o + 1] << 8);
    wall[y * w + x] = buf[o + 2] | (buf[o + 3] << 8);
  }
  return { type, wall };
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
const TF = new Map<string, string>();   // pass 名 → after-tf
{
  const candidates = [join2(LOGS, 'genprobe.log'), SIDE_LOG];
  for (const p of candidates) {
    try {
      const log = readFileSync(p, 'utf8');
      for (const line of log.split('\n')) {
        const cols = line.split('\t');
        if (cols[0] !== 'PASS') continue;
        if (!TF.has(cols[2])) TF.set(cols[2], cols[3]);
      }
      if (TF.has('Evil Island') && TF.has('Astral Chest') && TF.has('Quick Cleanup') && TF.has('Dungeon')) break;
    } catch { /* 下一个候选 */ }
  }
}
const TF_EVIL_IN = TF.get('Quick Cleanup'), TF_EVIL_OUT = TF.get('Evil Island');
const TF_AST_IN = TF.get('Dungeon'), TF_AST_OUT = TF.get('Astral Chest');
if (!TF_EVIL_IN || !TF_EVIL_OUT || !TF_AST_IN || !TF_AST_OUT) throw new Error('genprobe.log 缺四条锚 PASS 行');
const snapTfCache = new Map<string, string>();
const tfOfSnap = (pat: string): string => {
  const hit = snapTfCache.get(pat);
  if (hit) return hit;
  const tf = fnvOf(loadSnapBuf(pat));
  snapTfCache.set(pat, tf);
  return tf;
};
// 快照名→tf 对账(名=该 pass 完成态)
const EVIL_IN_FILE = 'pre-Quick_Cleanup', EVIL_OUT_FILE = 'pre-Evil_Island';
const AST_IN_FILE = 'pre-Dungeon', AST_OUT_FILE = 'pre-Astral_Chest';
const bind = (want: string | undefined, file: string, label: string) => {
  const tf = tfOfSnap(file);
  if (tf !== want) throw new Error(`FNV 对账失败[${label}]: ${file} tf=${tf} ≠ PASS 行 ${want}`);
  console.log(`[replay] FNV 边界锁定[${label}]: ${file}(tf=${tf})`);
};
bind(TF_EVIL_IN, EVIL_IN_FILE, 'Evil输入');
bind(TF_EVIL_OUT, EVIL_OUT_FILE, 'Evil输出');
bind(TF_AST_IN, AST_IN_FILE, 'Astral输入');
bind(TF_AST_OUT, AST_OUT_FILE, 'Astral输出');

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
  // ★判卷别名:cs 运行时 id 859=AstralChestLocked(tML TileLoader 按命名空间块顺序
  //   分配;终版 twld tileMap 只收「在档格」而箱被后续 pass 消费=两侧 twld 均缺 859)。
  //   钉定证据=PASS33 边界 +4 mod 格全 cs 859 且 2×2+chest(C# AstralChestGeneration
  //   唯一放置面),C# 注册序 Tiles.Astral.AstralChestLocked 前恰 106 块(反演 753+106)。
  const astralChest = TILE_BY_KEY['mod_calamity_astral_chest_locked'];
  if (astralChest !== undefined && !MOD_ID_TO_NAME.has(859)) MOD_ID_TO_NAME.set(859, astralChest);
}
const CS_TO_OURS = (cs: number): number => cs === 0 ? 0 : cs < 753 ? (SHEET_TO_INTERNAL.get(cs) ?? 0) : (MOD_ID_TO_NAME.get(cs) ?? 0);
const KEY_OF = (id: number): string => TILE_DEFS[id]?.key ?? `#${id}`;

// store 构建
const w = 4200, h = 1200, n = w * h;
function buildStore(snap: { type: Uint16Array; wall: Uint16Array }) {
  const type = new Uint16Array(n), flags = new Uint8Array(n);
  const wall = new Uint16Array(n), liquid = new Uint8Array(n), liquidType = new Uint8Array(n);
  const wire = new Uint8Array(n), half = new Uint8Array(n), slope = new Uint8Array(n);
  const paint = new Uint8Array(n);
  const frameX = new Uint16Array(n), frameY = new Uint16Array(n);
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

// ── pass fn 提取(gen-misc setupGenMisc 经 stub 注册面)──
const miscMod = await import('../mods/calamity/src/gen-misc.ts');
const wantFns: Record<string, ((...a: unknown[]) => void) | null> = {
  'Evil Island': null,
  'Astral Chest': null,
};
let curRng: RNG | null = null;
const stub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'registerGenPass') return (name: unknown, fn?: (...a: unknown[]) => void) => {
      const nm = typeof name === 'string' ? name : (name as { name: string }).name;
      if (nm in wantFns) wantFns[nm] = fn ?? null;
    };
    if (prop === 'log') return (...a: unknown[]) => console.log('[gen]', ...a);
    // 词缀掷:真链 worldgen 期 Item.Prefix(-1) 走 genRand(IslandTrace ★672);
    // 判卷 stub 把引擎 Math.random 通道换绑到当前重放流(dN 对账一致面)。
    if (prop === 'rollPrefixFor') return (vid: number) => rollNaturalPrefixForVid(vid, false, () => curRng?.next() ?? 0);
    return () => {};
  },
  has: () => true,
});
(miscMod as { setupGenMisc(sw: unknown): void }).setupGenMisc(stub);
for (const [k, v] of Object.entries(wantFns)) if (!v) throw new Error(`pass 未注册: ${k}`);
console.log('[replay] pass fn 就绪:', Object.keys(wantFns).join(', '));

// gs(同 _replay-sea 模板;真链 1.4.4.9 实跑参数;dungeon=(3421,207) golden.wld 实证;
//   evil 0=corruption(golden-calamity.wld isCrimson=false))
// ★Astral Chest 界=GenVars.dMinX/dMaxX/dMaxY(地牢爬行器 reach,1.4.0.5 WorldGen.cs:
//   18040-18059 语义;dungeonMaxY=入口 207≠此)——真值不可由 tile 快照直读,按真箱
//   (3821,974)+真链 dG=35 反演:dMaxX=3852/dMaxY=1000 唯一窄窗(att=12,P 前缀 4 掷),
//   dMinX 在 x₁₂ 窗 [3188,3304) 内不敏感,取爬行界砖合值 3270(SW_ASTDMINX 可覆写)。
function mkGs() {
  return {
    seed: translateSeed('9293480'),
    worldSurface: 337, rockLevel: 535, worldSurfaceLow: 246,
    // dungeonMaxY=GenVars.dMaxY(地牢爬行界;Astral 消费此值非入口 Y 207;引擎管线
    //   由 DungeonPass 回填同口径 ★114 刀)。(3477,3909,1013)=att=13×真箱(3821,974)
    //   唯一窗簇取值(2×13+7+P₂=dG 35;前 12 attempt 全斥实证;1.4.0.5 WorldGen.cs:
    //   18040-18059 reach 语义与砖 bbox 的偏差=待深债;SW_ASTDMINX/ASTDMAXX/ASTDMAXY
    //   可覆写)
    dungeonX: 3421,
    dungeonMinX: Number(process.env.SW_ASTDMINX ?? 3477),
    dungeonMaxX: Number(process.env.SW_ASTDMAXX ?? 3909),
    dungeonMaxY: Number(process.env.SW_ASTDMAXY ?? 1013),
    crimson: false,
    seedFlags: {},
    mods: {
      tileIdByKey: Object.fromEntries(Object.entries(TILE_BY_KEY).filter(([k]) => k.startsWith('mod_')).map(([k, v]) => [k.replace(/^mod_[a-z0-9]+_/, ''), v])),
      itemIdByKey: Object.fromEntries(readdirSync(`${root}/mods/calamity/content/items`).filter((f) => f.endsWith('.json')).map((f, i) => [`mod_calamity_${f.replace('.json', '')}`, 9001 + i])),
      chests: [] as unknown[],
    },
    protectedRects: [] as unknown[],
  } as unknown as Record<string, unknown>;
}

// ── diff 剖面(逐格+分类型;有效型=flags&1?type:0 对齐探针 HasTile 归一口径)──
function profile(store: ReturnType<typeof buildStore>, post: { type: Uint16Array; wall: Uint16Array }, label: string, region?: { x0: number; x1: number; y0: number; y1: number }) {
  let diff = 0, diffIn = 0;
  const diffByType = new Map<string, number>();
  const wallDiff = new Map<string, number>();
  const yBands = new Map<number, number>();
  let firstDiff = '';
  for (let i = 0; i < n; i++) {
    const realT = CS_TO_OURS(post.type[i]);
    const myEff = (store.flags[i] & 1) ? store.type[i] : 0;
    if (myEff !== realT) {
      diff++;
      const x = i % w, y = Math.floor(i / w);
      if (region && x >= region.x0 && x < region.x1 && y >= region.y0 && y < region.y1) diffIn++;
      yBands.set(Math.floor(y / 50) * 50, (yBands.get(Math.floor(y / 50) * 50) ?? 0) + 1);
      const key = `${KEY_OF(myEff)}→${KEY_OF(realT)}`;
      diffByType.set(key, (diffByType.get(key) ?? 0) + 1);
      if (!firstDiff) firstDiff = `首格(${x},${y}) 我=${KEY_OF(myEff)} 真=${KEY_OF(realT)}`;
    }
    const rw = post.wall[i];
    if (store.wall[i] !== rw) {
      const key = `${store.wall[i]}→${rw}`;
      wallDiff.set(key, (wallDiff.get(key) ?? 0) + 1);
    }
  }
  console.log(`[${label}] 逐格 diff=${diff}/${n}(${((diff / n) * 100).toFixed(3)}%) 区内=${diffIn} ${firstDiff}`);
  console.log(`[${label}] 迁移 TOP12:`);
  for (const [k, c] of [...diffByType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${k}: ${c}`);
  console.log(`[${label}] 墙差 TOP6:`, [...wallDiff.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, c]) => `${k}:${c}`).join(' ') || '(无)');
  console.log(`[${label}] y 带差:`, [...yBands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([b, c]) => `${b}:${c}`).join(' '));
  return { diff, diffByType };
}

// ── 双侧聚合(本 pass 涉及域)──
function aggregate(store: ReturnType<typeof buildStore>, post: { type: Uint16Array }, label: string) {
  const cnt = (arr: Uint16Array | Uint16Array[], eff = false) => {
    const m = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const v = eff ? ((store.flags[i] & 1) ? (arr as Uint16Array)[i] : 0) : (arr as Uint16Array)[i];
      const k = KEY_OF(v as number);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const oursC = cnt(store.type, true), realC = cnt(Array.from(post.type, CS_TO_OURS));
  const keys = new Set([...oursC.keys(), ...realC.keys()]);
  const rows = [...keys].map((k) => [k, oursC.get(k) ?? 0, realC.get(k) ?? 0] as [string, number, number]).filter((r) => r[1] !== r[2]).sort((a, b) => Math.abs(b[1] - b[2]) - Math.abs(a[1] - a[2]));
  console.log(`[${label}] 聚合差(tile 我 真 Δ):`);
  for (const [k, a, b] of rows.slice(0, 14)) console.log(`  ${k}: ${a} vs ${b}  Δ${b - a}`);
}

// ── 真岛定位(后快照天空域 cloud=sheet189 包围盒)──
function realIslandBox(snap: { type: Uint16Array }) {
  let x0 = 1 << 30, x1 = -1, y0 = 1 << 30, y1 = -1, cnt = 0;
  for (let x = 0; x < w; x++) for (let y = 0; y < 300; y++) {
    if (CS_TO_OURS(snap.type[y * w + x]) === SHEET_TO_INTERNAL.get(189)) {
      cnt++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { x0, x1, y0, y1, cnt };
}

// ═══════════ Evil Island 重放 ═══════════
{
  const pre = loadSnap(EVIL_IN_FILE), post = loadSnap(EVIL_OUT_FILE);
  const store = buildStore(pre);
  const gs = mkGs();
  const rng = new RNG(gs.seed as number);
  curRng = rng;
  let draws = 0;
  const segs: Array<[string, number]> = [];
  (globalThis as { __evilSegMark?: (n: string) => void }).__evilSegMark = (nm: string) => segs.push([nm, draws]);
  {
    const proto = rng as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const m of ['next', 'nextInt', 'nextIntRange', 'range', 'nextBool', 'nextDouble']) {
      const fn = proto[m];
      if (typeof fn !== 'function') continue;
      proto[m] = function (this: unknown, ...a: unknown[]) { draws++; return fn.apply(this, a); };
    }
  }
  (globalThis as { __evilBlotchN?: number }).__evilBlotchN = 0;
  (wantFns['Evil Island'] as (...a: unknown[]) => void)(store, rng, gs);
  curRng = null;
  (globalThis as { __evilSegMark?: (n: string) => void }).__evilSegMark = undefined;
  console.log(`[EvilIsland] 掷数=${draws}(真链 SPY dN=2032079 偏差=${draws - 2032079}) blotch调用=${(globalThis as { __evilBlotchN?: number }).__evilBlotchN}(真链 SEGDELTA=332461)`);
  {
    let prev = 0;
    const parts: string[] = [];
    for (const [nm, at] of segs) { parts.push(`${nm}+${at - prev}`); prev = at; }
    parts.push(`tail+${draws - prev}`);
    console.log('[EvilIsland] 段谱:', parts.join(' '));
  }
  console.log(`[EvilIsland] chests=${(gs.mods.chests as unknown[]).length}`, JSON.stringify(gs.mods.chests));
  const rbox = realIslandBox(post);
  {   // 我方岛盒(有效型)
    let bx0 = 1 << 30, bx1 = -1, cnt = 0;
    const cloudId = SHEET_TO_INTERNAL.get(189) ?? -1;
    for (let x = 0; x < w; x++) for (let y = 0; y < 300; y++) {
      const i = y * w + x;
      if ((store.flags[i] & 1) && store.type[i] === cloudId) { cnt++; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; }
    }
    console.log(`[EvilIsland] 我岛 cloud 包围盒: x∈[${bx0},${bx1}] n=${cnt}`);
  }
  console.log(`[EvilIsland] 真岛 cloud 包围盒: x∈[${rbox.x0},${rbox.x1}] y∈[${rbox.y0},${rbox.y1}] n=${rbox.cnt}`);
  profile(store, post, 'EvilIsland', { x0: Math.max(0, rbox.x0 - 40), x1: Math.min(w, rbox.x1 + 40), y0: 0, y1: 400 });
  aggregate(store, post, 'EvilIsland');
}

// ═══════════ Astral Chest 重放 ═══════════
{
  const pre = loadSnap(AST_IN_FILE), post = loadSnap(AST_OUT_FILE);
  const store = buildStore(pre);
  const gs = mkGs();
  const rng = new RNG(gs.seed as number);
  curRng = rng;
  let draws = 0;
  {
    const proto = rng as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const m of ['next', 'nextInt', 'nextIntRange', 'range', 'nextBool', 'nextDouble']) {
      const fn = proto[m];
      if (typeof fn !== 'function') continue;
      proto[m] = function (this: unknown, ...a: unknown[]) { draws++; return fn.apply(this, a); };
    }
  }
  (wantFns['Astral Chest'] as (...a: unknown[]) => void)(store, rng, gs);
  curRng = null;
  console.log(`[AstralChest] 掷数=${draws}(真链 SPY dN=36 偏差=${draws - 36})`);
  for (const c of gs.mods.chests as Array<{ x: number; y: number }>) {
    const cells: string[] = [];
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      const i = (c.y + dy) * w + (c.x + dx);
      cells.push(`${c.x + dx},${c.y + dy}:${KEY_OF((store.flags[i] & 1) ? store.type[i] : 0)}`);
    }
    console.log(`[AstralChest] 我方箱 @${c.x},${c.y}: ${cells.join(' | ')}`);
  }
  // 真箱定位(后快照 − 前快照 的 mod 格增量)
  const chestIdCands = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    if (pre.type[i] === post.type[i]) continue;
    if (post.type[i] >= 753 || pre.type[i] >= 753) chestIdCands.set(post.type[i], (chestIdCands.get(post.type[i]) ?? 0) + 1);
  }
  console.log('[AstralChest] mod 格增量:', [...chestIdCands.entries()].map(([k, v]) => `${KEY_OF(MOD_ID_TO_NAME.get(k) ?? k)}:${v}`).join(' '));
  for (let i = 0; i < n; i++) {
    if (pre.type[i] !== post.type[i] && post.type[i] >= 753) {
      const x = i % w, y = Math.floor(i / w);
      console.log(`[AstralChest] 真箱格(${x},${y}) cs=${post.type[i]}→${KEY_OF(MOD_ID_TO_NAME.get(post.type[i]) ?? -1)}`);
    }
  }
  profile(store, post, 'AstralChest');
  aggregate(store, post, 'AstralChest');
}
process.exit(0);
