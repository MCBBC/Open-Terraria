// ⑨ 焦余补丁触发行对账:从输出快照/我方终态分别提取 remains 连通域 x 范围
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
const REM_CS = 914, SLAG_CS = 902;   // twld tileMap 实测 id
const post = loadSnap('pre-Brimstone_Crag');
const pre = loadSnap('pre-Forsaken_Archive');
const w = 4200, h = 1200, n = w * h;
// 我方终态
(globalThis as Record<string, unknown>).__calamityTileDefs = TILE_DEFS;
(globalThis as Record<string, unknown>).__calamityTileIdByKey = TILE_BY_KEY;
{
  const sch: Record<string, unknown> = {};
  for (const f of readdirSync(root + '/mods/calamity/schematics').sort()) {
    if (!f.endsWith('.json')) continue;
    try { sch[f.replace('.json', '')] = JSON.parse(readFileSync(root + '/mods/calamity/schematics/' + f, 'utf8')); } catch { /* skip */ }
  }
  (globalThis as Record<string, unknown>).__calamitySchematics = sch;
}
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
const CS_TO_OURS = (cs: number): number => cs === 0 ? 0 : cs < 753 ? (SHEET_TO_INTERNAL.get(cs) ?? 0) : ((TILE_BY_KEY as any)[`mod_calamity_${''}`] ?? 0);
for (let i = 0; i < n; i++) { const t = post.type[i] >= 753 ? 0 : CS_TO_OURS(post.type[i]); store.type[i] = t; store.flags[i] = t !== 0 ? 1 : 0; }
// 仅重跑 ⑨ 之前的区段没有捷径——整 pass 重跑(输入=pre)
for (let i = 0; i < n; i++) { const t = pre.type[i] >= 753 ? 0 : (pre.type[i] < 753 ? CS_TO_OURS(pre.type[i]) : 0); store.type[i] = t; store.flags[i] = t !== 0 ? 1 : 0; }
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
(cragFn as any)(store, rng, gs);
// 我方 remains 的 cs 表示:直接用内部 id 比对
const REM_ID = (TILE_BY_KEY as any)['mod_calamity_scorched_remains'];
// 逐列统计 remains 格,找出 remains 列段(触发椭圆的 x 覆盖=trigger±(d+2))
function columnProfile(type: Uint16Array, csId: number) {
  const cols: number[] = [];
  for (let x = 3335 - 60; x < 4175 + 60; x++) {
    let c = 0;
    for (let y = 1040; y < 1190; y++) if ((type[y * w + x]) === csId) c++;
    cols.push(c);
  }
  return cols;
}
const realCols = columnProfile(post.type, REM_CS);
const mineCols: number[] = [];
for (let x = 3335 - 60; x < 4175 + 60; x++) {
  let c = 0;
  for (let y = 1040; y < 1190; y++) if (store.type[y * w + x] === REM_ID) c++;
  mineCols.push(c);
}
// 列段检测(连续非零)
function segments(cols: number[], x0: number) {
  const segs: Array<[number, number, number]> = [];
  let s = -1, sum = 0;
  for (let i = 0; i < cols.length; i++) {
    if (cols[i] > 0 && s < 0) { s = i; sum = 0; }
    if (cols[i] > 0) sum += cols[i];
    if (cols[i] === 0 && s >= 0) { segs.push([s + x0, i - 1 + x0, sum]); s = -1; }
  }
  if (s >= 0) segs.push([s + x0, cols.length - 1 + x0, sum]);
  return segs.filter((g) => g[2] > 60);
}
console.log('real remains 列段(起,止,格数):');
for (const [a, b, c] of segments(realCols, 3335 - 60)) console.log(`  ${a}..${b} 宽${b - a + 1} 格${c}`);
console.log('mine remains 列段(起,止,格数):');
for (const [a, b, c] of segments(mineCols, 3335 - 60)) console.log(`  ${a}..${b} 宽${b - a + 1} 格${c}`);
process.exit(0);
