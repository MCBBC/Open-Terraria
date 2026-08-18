// 一次性：#63 SpiderCaves 分叉定位（WW 修后隔离残余 wal=15108/7 锚错位）。
// van 062→063 新增 62 团簇质心清单 ↔ JS NEST 锚点序列最近邻匹配：
//   - 锚点 (x,y) 序列由重掷门决定（countTiles 差→流错位）
//   - spreadSpider 内掷骰数差→下一巢锚点错位但再下一巢可能回正
// 用法：SW_SPIDER2=1 npx vitest run tools/_spider2.test.ts
import { it } from 'vitest';
const RUN = process.env.SW_SPIDER2 === '1';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runSpiderNestPass } from '../src/world/gen/vanilla/HiveSpiderPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200, N = W * H;
const NAMES: Record<number, string> = { 62: 'Water_Chests', 63: 'Spider_Caves' };
const load = (idx: number, ext: string) => readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${NAMES[idx]}.${ext}`);

const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

function buildStore(idx: number): TileStore {
  const t = new Uint16Array(load(idx, 'typ').buffer.slice(0));
  const a = load(idx, 'act');
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = l[i]! > 0 ? 1 : 0;
  }
  return st;
}

function cloneGs(gs: GenState): GenState {
  const c = { ...gs } as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (Array.isArray(v)) c[k] = v.map((e) => (e && typeof e === 'object' ? { ...(e as object) } : e));
    else if (v instanceof Int32Array) c[k] = v.slice();
    else if (v && typeof v === 'object') c[k] = { ...(v as Record<string, unknown>) };
  }
  return c as unknown as GenState;
}

/** 62 团簇（4 邻）质心清单 */
function clusters(isMember: (i: number) => boolean): Array<{ cells: number; cx: number; cy: number }> {
  const visited = new Uint8Array(N);
  const out: Array<{ cells: number; cx: number; cy: number }> = [];
  const stack: number[] = [];
  for (let i = 0; i < N; i++) {
    if (visited[i] || !isMember(i)) continue;
    stack.length = 0; stack.push(i); visited[i] = 1;
    let cells = 0, sx = 0, sy = 0;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % W, y = (j / W) | 0;
      cells++; sx += x; sy += y;
      if (x > 0 && !visited[j - 1] && isMember(j - 1)) { visited[j - 1] = 1; stack.push(j - 1); }
      if (x < W - 1 && !visited[j + 1] && isMember(j + 1)) { visited[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && !visited[j - W] && isMember(j - W)) { visited[j - W] = 1; stack.push(j - W); }
      if (y < H - 1 && !visited[j + W] && isMember(j + W)) { visited[j + W] = 1; stack.push(j + W); }
    }
    out.push({ cells, cx: Math.round(sx / cells), cy: Math.round(sy / cells) });
  }
  return out;
}

function countedRng(seed: number) {
  const rng = new RNG(seed);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  const box = { n: 0 };
  ur.internalSample = () => { box.n++; return orig(); };
  return { rng, box };
}

let gsSp: GenState | null = null;
let pipeSlope: Uint8Array | null = null;
let pipeHalf: Uint8Array | null = null;
let pipeLiqType: Uint8Array | null = null;
let pipeWire: Uint8Array | null = null;

(RUN ? it : it.skip)('#63 SpiderCaves divergence hunt', async () => {
  const g0 = globalThis as { __swSpiderGsCap?: (gs: GenState, st: TileStore) => void };
  g0.__swSpiderGsCap = (gs, st) => {
    if (!gsSp) {
      gsSp = cloneGs(gs);
      pipeSlope = st.slope.slice(); pipeHalf = st.half.slice();
      pipeLiqType = st.liquidType.slice(); pipeWire = st.wire.slice();
    }
  };
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 });
  } finally {
    g0.__swSpiderGsCap = undefined;
  }
  if (!gsSp) throw new Error('gs capture failed');

  // vanilla 062→063 新增 62 团簇质心
  const w62 = new Uint16Array(load(62, 'wal').buffer.slice(0));
  const w63 = new Uint16Array(load(63, 'wal').buffer.slice(0));
  let pre62 = 0;
  for (let i = 0; i < N; i++) if (w62[i] === 62) pre62++;
  const vCl = clusters((i) => w63[i] === 62 && w62[i] !== 62);
  console.log(`van: 062 已有62=${pre62}; 063 新增 62 团簇=${vCl.length}（按 cells 降序前 25）`);
  const sorted = [...vCl].sort((a, b) => b.cells - a.cells);
  console.log('  van clusters:', sorted.slice(0, 30).map((c) => `@${c.cx},${c.cy}(${c.cells})`).join(' '));

  // JS 隔离重放,逐 nest 记录锚点 + RNG 消费增量。
  // ★B 实验:叠加真管线 spider 入口的 slope/half/liquidType(测量噪声对照——
  //   dump 集缺 slope 通道,全 0 会让 solidTile 误判实心 → 洪泛收缩/countTiles 门漂)
  const usePipeAux = process.env.SW_SPIDER2_AUX === '1';
  const st = buildStore(62);
  if (usePipeAux && pipeSlope && pipeHalf && pipeLiqType && pipeWire) {
    for (let i = 0; i < N; i++) {
      st.slope[i] = pipeSlope[i]!;
      st.half[i] = pipeHalf[i]!;
      st.liquidType[i] = pipeLiqType[i]!;
      st.wire[i] = pipeWire[i]!;
    }
  }
  console.log(`[aux] usePipeAux=${usePipeAux}`);
  const { rng, box } = countedRng(gsSp.seed);
  const chests: Array<{ x: number; y: number; items: unknown[] }> = [];
  const logs: Array<{ n: number; x: number; y: number; count: number; shroom: number; tries: number; rngAt: number }> = [];
  (globalThis as { __swSpiderNest?: (s: string) => void }).__swSpiderNest = (s) => {
    const m = /NEST#(\d+) x=(-?\d+) y=(-?\d+) count=(-?\d+) shroom=(-?\d+) tries=(-?\d+)/.exec(s);
    if (m) logs.push({ n: +m[1]!, x: +m[2]!, y: +m[3]!, count: +m[4]!, shroom: +m[5]!, tries: +m[6]!, rngAt: box.n });
  };
  try {
    runSpiderNestPass(st, rng, gsSp, chests as never);
  } finally {
    (globalThis as { __swSpiderNest?: (s: string) => void }).__swSpiderNest = undefined;
  }
  // JS 出口 62 团簇
  const jCl = clusters((i) => st.wall[i] === 62 && w62[i] !== 62);
  let walDiff = 0, new62js = 0, new62van = 0;
  for (let i = 0; i < N; i++) {
    if (st.wall[i] !== w63[i]) walDiff++;
    if (st.wall[i] === 62 && w62[i] !== 62) new62js++;
    if (w63[i] === 62 && w62[i] !== 62) new62van++;
  }
  console.log(`JS: nests=${logs.length} 出口新增62团簇=${jCl.length} draws=${box.n}`);
  console.log(`[exit] walDiff(全图 vs 063)=${walDiff} | 新增62格 js=${new62js} van=${new62van}`);
  console.log('  js clusters:', [...jCl].sort((a, b) => b.cells - a.cells).slice(0, 30).map((c) => `@${c.cx},${c.cy}(${c.cells})`).join(' '));

  // 每个 JS nest:与全部 van 团簇最近邻
  const near = (list: typeof vCl, x: number, y: number) => {
    let bd = 1e9, bi = -1;
    for (let k = 0; k < list.length; k++) {
      const dx = list[k]!.cx - x, dy = list[k]!.cy - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = k; }
    }
    return { d: Math.sqrt(bd), i: bi };
  };
  const lines: string[] = [];
  for (const L of logs) {
    const m = near(vCl, L.x, L.y);
    lines.push(`#${L.n} @${L.x},${L.y} cnt=${L.count} shm=${L.shroom} tries=${L.tries} rng@${L.rngAt} → 最近 van 团 ${m.d.toFixed(0)}px${m.i >= 0 ? `(@${vCl[m.i]!.cx},${vCl[m.i]!.cy},${vCl[m.i]!.cells}格)` : ''}`);
  }
  console.log(lines.join('\n'));
  // 每个 van 团:与 JS 锚最近邻(找 vanilla 有而 JS 锚不指向的团)
  const orphan: string[] = [];
  for (const c of vCl) {
    const m = near([], 0, 0); // placeholder
    let bd = 1e9, bx = -1, by = -1;
    for (const L of logs) {
      const dx = L.x - c.cx, dy = L.y - c.cy, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bx = L.x; by = L.y; }
    }
    if (Math.sqrt(bd) > 40) orphan.push(`van@${c.cx},${c.cy}(${c.cells}格) 最近JS锚${Math.sqrt(bd).toFixed(0)}px(@${bx},${by})`);
  }
  console.log(`van 孤儿团（无 JS 锚 40px 内）= ${orphan.length}`);
  if (orphan.length) console.log('  ' + orphan.join(' | '));
}, 300_000);
