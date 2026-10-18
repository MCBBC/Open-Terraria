// 顶棚带 [1000,1025] slag 图样对账:仅 ③④ blotches(+⑱ stalactite 增格)写入——隔离 ③④ 流对齐
import { TMOD_LOGS, needInput } from './_pathlib.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const root = process.env.SW_GAME_ROOT ?? process.cwd();
const LOGS = needInput(TMOD_LOGS);
const { TILE_BY_KEY, TILE_DEFS, registerModTile } = await import(root + '/src/data/tiles.ts');
{
  let nextId = 1030;
  for (const f of readdirSync(root + '/mods/calamity/content/tiles').sort()) {
    if (!f.endsWith('.json')) continue;
    try {
      const spec = JSON.parse(readFileSync(`${root}/mods/calamity/content/tiles/${f}`, 'utf8'));
      registerModTile({ key: `mod_calamity_${f.replace('.json', '')}`, name: '', solid: spec.solid ?? false, framed: spec.framed ?? false, chest: spec.chest ?? false, w: spec.w, h: spec.h }, nextId++);
    } catch { /* skip */ }
  }
}
function loadSnap(pat: string) {
  const f = readdirSync(LOGS).filter((x) => x.endsWith(pat + '.bin.gz')).sort().pop()!;
  const buf = gunzipSync(readFileSync(LOGS + '/' + f));
  const w = 4200, h = 1200, n = w * h;
  const type = new Uint16Array(n);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * 4;
    type[y * w + x] = buf[o] | (buf[o + 1] << 8);
  }
  return { type };
}
const SHEET_TO_INTERNAL = new Map<number, number>();
for (let i = 1; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i] as { vanilla?: { sheet: number } } | undefined;
  if (d?.vanilla && d.vanilla.sheet < 753 && !SHEET_TO_INTERNAL.has(d.vanilla.sheet)) SHEET_TO_INTERNAL.set(d.vanilla.sheet, i);
}
const post = loadSnap('pre-Brimstone_Crag');
const pre = loadSnap('pre-Forsaken_Archive');
const w = 4200, h = 1200, n = w * h;
(globalThis as Record<string, unknown>).__calamityTileDefs = TILE_DEFS;
(globalThis as Record<string, unknown>).__calamityTileIdByKey = TILE_BY_KEY;
{
  const sch: Record<string, unknown> = {};
  for (const f of readdirSync(root + '/mods/calamity/schematics').sort()) {
    if (!f.endsWith('.json')) continue;
    try { sch[f.replace('.json', '')] = JSON.parse(readFileSync(root + '/mods/calamity/schematics/' + f, 'utf8')); } catch { /* skip */ }
  }
  (globalThis as Record<string, unknown>).__calamitySchematics = sch;
(globalThis as unknown as { __cragP2Roll?: number }).__cragP2Roll = 2;
(globalThis as unknown as { __cragP2Roll?: number }).__cragP2Roll = 1;
}
const SLAG_ID = (TILE_BY_KEY as any)['mod_calamity_brimstone_slag'];
const STAL_IDS = new Set(Object.keys(TILE_BY_KEY).filter((k) => k.includes('stalactite') || k.includes('stalagmite')).map((k) => (TILE_BY_KEY as any)[k]));
const store: any = {
  w, h, type: new Uint16Array(n), flags: new Uint8Array(n), wall: new Uint16Array(n),
  liquid: new Uint8Array(n), liquidType: new Uint8Array(n), wire: new Uint8Array(n),
  half: new Uint8Array(n), slope: new Uint8Array(n), frameX: new Uint16Array(n), frameY: new Uint16Array(n),
  idx(x: number, y: number) { return y * w + x; },
  get(x: number, y: number) { return this.type[y * w + x]; },
  setTile(x: number, y: number, t: number, fx = 0, fy = 0) { if (x < 0 || x >= w || y < 0 || y >= h) return; const i = y * w + x; this.type[i] = t; this.flags[i] = t !== 0 ? 1 : 0; this.frameX[i] = fx; this.frameY[i] = fy; },
  setTileSilent(x: number, y: number, t: number, fx = 0, fy = 0) { this.setTile(x, y, t, fx, fy); },
  hasTile(x: number, y: number) { return (this.flags[y * w + x] & 1) !== 0; },
  purgeGhostTiles() { return 0; },
};
const CS_TO_OURS = (cs: number): number => cs === 0 ? 0 : cs < 753 ? (SHEET_TO_INTERNAL.get(cs) ?? 0) : 0;
for (let i = 0; i < n; i++) { const t = pre.type[i] >= 753 ? 0 : CS_TO_OURS(pre.type[i]); store.type[i] = t; store.flags[i] = t !== 0 ? 1 : 0; }
const { RNG, translateSeed } = await import(root + '/src/core/rng.ts');
const cragMod = await import(root + '/mods/calamity/src/gen-crag.ts');
let cragFn: ((...a: unknown[]) => void) | null = null;
const stub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'registerGenPass') return (name: string, fn: (...a: unknown[]) => void) => { if (name === 'Brimstone Crag') cragFn = fn; };
    if (prop === 'log') return () => {};
    return () => {};
  },
  has: () => true,
});
(cragMod as any).setupGenCrag(stub);
const gs = {
  seed: translateSeed('9293480'), worldSurface: 337, rockLevel: 535,
  dungeonX: 3421, dungeonMaxY: 207, dungeonMinX: 0, dungeonMaxX: 4200, seedFlags: {},
  mods: {
    tileIdByKey: Object.fromEntries(Object.entries(TILE_BY_KEY).filter(([k]) => k.startsWith('mod_')).map(([k, v]) => [k.replace(/^mod_[a-z0-9]+_/, ''), v])),
    itemIdByKey: {}, chests: [] as unknown[],
  },
};
const rng = new RNG(gs.seed as number);
(globalThis as any).__cragTrig = [];
if ((globalThis as any).__cragPre) (rng as any).next();   // ★单样本先行假设检验
let drawCount = 0;
const origNext = rng.next.bind(rng), origNI = rng.nextInt.bind(rng), origNIR = rng.nextIntRange.bind(rng);
rng.next = (...a: unknown[]) => { drawCount++; return (origNext as any)(...a); };
rng.nextInt = (...a: unknown[]) => { drawCount++; return (origNI as any)(...a); };
rng.nextIntRange = (...a: unknown[]) => { drawCount++; return (origNIR as any)(...a); };
const origSetTile = store.setTile.bind(store);
store.setTile = (x: number, y: number, t: number, fx?: number, fy?: number) => {
  if ((y === 1083 && x === 3350) || (y === 1083 && x === 3335)) {
    console.log(`[trace] setTile(${x},${y},${t}) 掷后=${drawCount}`);
    console.log(new Error().stack?.split('\n').slice(2, 8).join('\n'));
  }
  return origSetTile(x, y, t, fx, fy);
};
(globalThis as any).__cragSec = (s: string, st: { type: Uint16Array }) => {
  if (s !== 'after3' && s !== 'after4') return;
  if (s === 'after3') console.log('前40触发(x,y,r):', JSON.stringify((globalThis as any).__cragTrig));
  console.log(`[sec ${s}] draws=${drawCount} 邻域(s=slag .=空):`);
  const ch = (t: number) => t === SLAG_ID ? 's' : '.';
  for (let y = 1085; y <= 1140; y++) {
    let row = '';
    for (let x = 3312; x <= 3460; x += 2) row += ch(st.type[y * w + x]);
    console.log(String(y).padStart(4), row);
  }
};
(cragFn as any)(store, rng, gs);
// 首 blob 邻域字符画对比
const SUEV_ID = (TILE_BY_KEY as any)['mod_calamity_infernal_suevite'];
const REM_ID2 = (TILE_BY_KEY as any)['mod_calamity_scorched_remains'];
{
  const ch = (t: number) => t === SLAG_ID ? 's' : t === REM_ID2 ? 'r' : t === SUEV_ID ? 'u' : '.';
  console.log('mine 邻域(s=slag,r=remains,u=suevite,.=其他):');
  for (let y = 1085; y <= 1135; y++) {
    let row = '';
    for (let x = 3310; x <= 3360; x++) row += ch(store.type[y * w + x]);
    console.log(String(y).padStart(4), row);
  }
}
// 顶棚带比对(slag=1;real 侧 mod slag cs=902→本仓 SLAG_ID)
let diff = 0, mineOnly = 0, realOnly = 0;
const firsts: string[] = [];
for (let y = 1000; y <= 1025; y++) {
  for (let x = 3335; x <= 4175; x++) {
    const m = store.type[y * w + x] === SLAG_ID ? 1 : 0;
    const rt = post.type[y * w + x];
    const r = rt === 902 ? 1 : 0;   // cs slag
    if (m !== r) {
      diff++;
      if (m && !r) mineOnly++; else realOnly++;
      if (firsts.length < 12) firsts.push(`(${x},${y})${m ? '我' : '真'}`);
    }
  }
}
console.log(`顶棚带 slag diff=${diff} 我有真无=${mineOnly} 真有我无=${realOnly}`);
console.log('样例:', firsts.join(' '));
// 分行统计
for (let y = 1000; y <= 1025; y += 5) {
  let d = 0;
  for (let x = 3335; x <= 4175; x++) {
    const m = store.type[y * w + x] === SLAG_ID ? 1 : 0;
    const r = post.type[y * w + x] === 902 ? 1 : 0;
    if (m !== r) d++;
  }
  console.log(`  row ${y}: diff=${d}`);
}
process.exit(0);
