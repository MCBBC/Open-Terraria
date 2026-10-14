// ★699c 岛后/清后中界 dump:平台盒 105 格 active 态逐段(定位归纳断裂段)
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const root = process.env.SW_GAME_ROOT ?? process.cwd();
const { TILE_BY_KEY, TILE_DEFS, registerModTile } = await import('../src/data/tiles.ts');
const { RNG, translateSeed } = await import('../src/core/rng.ts');
{
  let nextId = 1030;
  const tileDir = `${root}/mods/calamity/content/tiles`;
  for (const f of readdirSync(tileDir).sort()) {
    if (!f.endsWith('.json')) continue;
    try {
      const spec = JSON.parse(readFileSync(`${tileDir}/${f}`, 'utf8'));
      registerModTile({ key: `mod_calamity_${f.replace('.json', '')}`, name: spec.name ?? f.replace('.json', ''), solid: spec.solid ?? false, platform: spec.platform ?? false, decor: spec.decor ?? false, chest: spec.chest ?? false, framed: spec.framed ?? false, w: spec.w, h: spec.h, opacity: spec.opacity ?? (spec.solid ? 1 : 0), pick: spec.pick ?? 0, axe: spec.axe ?? -1, mapColor: spec.mapColor ?? '#808080', blend: spec.frame === 'blend' || spec.frame === 'auto' ? true : false, vanilla: { frame: spec.frame ?? 'style', fw: spec.w ?? 1, fh: spec.h ?? 1 } }, nextId++);
    } catch { /* skip */ }
  }
}
(globalThis as Record<string, unknown>).__calamityTileDefs = TILE_DEFS;
(globalThis as Record<string, unknown>).__calamityTileIdByKey = TILE_BY_KEY;
(globalThis as unknown as { __calamityGenTiles?: Record<string, number> }).__calamityGenTiles = {};
const LOGS = process.env.SW_SNAP_DIR ?? '/Users/vinlic/Library/Application Support/Terraria/tModLoader/Logs';
function loadSnap(pat: string) {
  const f = readdirSync(LOGS).filter((x) => x.endsWith(pat + '.bin.gz')).sort().pop();
  if (!f) throw new Error('快照未找到: ' + pat);
  const buf = gunzipSync(readFileSync(`${LOGS}/${f}`));
  const w = 4200, h = 1200, n = w * h;
  const type = new Uint16Array(n), wall = new Uint16Array(n);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * 4;
    type[y * w + x] = buf[o] | (buf[o + 1] << 8);
    wall[y * w + x] = buf[o + 2] | (buf[o + 3] << 8);
  }
  return { type, wall };
}
const pre = loadSnap('pre-Draedon_Structures');
const genMod = await import('../mods/calamity/src/gen.ts');
let abyssFn: ((...a: unknown[]) => void) | null = null;
const stub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'registerGenPass') return (name: string, fn: (...a: unknown[]) => void) => { if (name === 'Abyss') abyssFn = fn; };
    if (prop === 'log') return () => {};
    return () => {};
  },
  has: () => true,
});
(genMod as { setupGen(sw: unknown): void }).setupGen(stub);
if (!abyssFn) throw new Error('Abyss 未注册');
// 中界探针:__swIslandDbg3=岛后盒态,__swIslandDbg4=清后盒态(gen.ts 需埋钩——本脚本先 dump 终态对照)
const w = 4200, h = 1200, n = w * h;
function buildStore(snap: { type: Uint16Array; wall: Uint16Array }) {
  const type = new Uint16Array(n), flags = new Uint8Array(n);
  const wall = new Uint16Array(n), liquid = new Uint8Array(n), liquidType = new Uint8Array(n);
  const wire = new Uint8Array(n), half = new Uint8Array(n), slope = new Uint8Array(n);
  const frameX = new Uint16Array(n), frameY = new Uint16Array(n);
  for (let i = 0; i < n; i++) { const t = snap.type[i]; type[i] = t; flags[i] = t !== 0 ? 1 : 0; wall[i] = snap.wall[i]; }
  return { w, h, type, flags, wall, liquid, liquidType, wire, half, slope, frameX, frameY,
    idx(x: number, y: number) { return y * w + x; }, get(x: number, y: number) { return type[y * w + x]; },
    setTile(x: number, y: number, t: number, fx = 0, fy = 0) { if (x < 0 || x >= w || y < 0 || y >= h) return; const i = y * w + x; type[i] = t; flags[i] = t !== 0 ? 1 : 0; frameX[i] = fx; frameY[i] = fy; },
    setTileSilent(x: number, y: number, t: number, fx = 0, fy = 0) { this.setTile(x, y, t, fx, fy); },
    hasTile(x: number, y: number) { return (flags[y * w + x] & 1) !== 0; }, purgeGhostTiles() { return 0; } };
}
const store = buildStore(pre);
const gs = {
  seed: translateSeed('9293480'), worldSurface: 337, rockLevel: 535, worldSurfaceLow: 194,
  dungeonX: 3421, dungeonMaxY: 207, dungeonMinX: 0, dungeonMaxX: 4200, seedFlags: {},
  mods: { tileIdByKey: Object.fromEntries(Object.entries(TILE_BY_KEY).filter(([k]) => k.startsWith('mod_')).map(([k, v]) => [k.replace(/^mod_[a-z0-9]+_/, ''), v])), itemIdByKey: {}, chests: [], sulphurAtLeft: false, sulphurYStart: 248 },
};
const rng = new RNG(gs.seed as number);
(globalThis as { __drawN?: number }).__drawN = 0;
{
  const proto = rng as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of Object.getOwnPropertyNames(Object.getPrototypeOf(rng))) {
    const fn = proto[m];
    if (typeof fn === 'function' && /^(next|int|intRange|nextBool|nextFloat|nextDouble)/i.test(m)) {
      proto[m] = function (this: unknown, ...a: unknown[]) { (globalThis as { __drawN?: number }).__drawN = ((globalThis as { __drawN?: number }).__drawN ?? 0) + 1; return fn.apply(this, a) as number; };
    }
  }
}
// 盒态 dump 钩子:掷数阈值(岛#0 尾=chasm3 末+3153;清后=+1+4924)
const TH_ISLAND_END = 36198583 + 3153;
const TH_CLEARS_END = TH_ISLAND_END + 4924;
let dumped1 = false, dumped2 = false;
const origNext = rng.next.bind(rng);
(rng as { next: () => number }).next = () => {
  const v = origNext();
  const g = (globalThis as { __drawN?: number }).__drawN ?? 0;
  if (!dumped1 && g >= TH_ISLAND_END) {
    dumped1 = true;
    let a = 0;
    for (let y = 893; y <= 901; y++) for (let x = 4022; x <= 4038; x++) if (store.flags[y * w + x] & 1) a++;
    console.log(`[mid] 岛#0 后盒 active=${a}/85`);
  }
  if (!dumped2 && g >= TH_CLEARS_END) {
    dumped2 = true;
    let a = 0;
    for (let y = 893; y <= 901; y++) for (let x = 4022; x <= 4038; x++) if (store.flags[y * w + x] & 1) a++;
    console.log(`[mid] 清场后盒 active=${a}/85(真推定 pre-platform 岛格=65[盒内 894-900 域])`);
  }
  return v;
};
(abyssFn as (...a: unknown[]) => void)(store, rng, gs);
console.log(`[mid] pass 完成(探针截断)`);
process.exit(0);
