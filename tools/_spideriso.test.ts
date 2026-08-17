// 一次性：#63 SpiderCaves 隔离重放（van dump062(Water_Chests 末) → runSpiderNestPass
//   → 对拍 dump063(Spider_Caves 末)）。dump 集 = seed 9293480 x86（/tmp/sw-num4/van_x86_g）。
//   gs 捕获：真管线 generateWorld 经 __swSpiderGsCap 探针钩（pass 头）深克隆。
// 用法：SW_SPIDERISO=1 npx vitest run tools/_spideriso.test.ts
import { it } from 'vitest';
const RUN = process.env.SW_SPIDERISO === '1';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runSpiderNestPass } from '../src/world/gen/vanilla/HiveSpiderPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const IDX_IN = 62, IDX_OUT = 63;
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
SHEET[0] = 0;

function buildStore(idx: number): { st: TileStore; lt: Uint8Array | null } {
  const t = new Uint16Array(load(idx, 'typ').buffer.slice(0));
  const a = load(idx, 'act');
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
  let lt: Uint8Array | null = null;
  try { lt = readFileSync('/tmp/sw-spider-liqtype.bin'); } catch { /* 首跑无 */ }
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = lt ? (lt[i] ?? 0) : (l[i]! > 0 ? 1 : 0);
  }
  return { st, lt };
}

function countedRng(seed: number) {
  const rng = new RNG(seed);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  const box = { n: 0 };
  ur.internalSample = () => { box.n++; return orig(); };
  return { rng, box };
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

let gsSp: GenState | null = null;

(RUN ? it : it.skip)('#63 SpiderCaves isolated replay', async () => {
  // ── A) 真管线捕获 gs + liquidType 真值 + 管线终态 62 总数
  const g0 = globalThis as { __swSpiderGsCap?: (gs: GenState, st: TileStore) => void };
  let pipeWall62 = -1;
  g0.__swSpiderGsCap = (gs, st) => {
    if (!gsSp) {
      gsSp = cloneGs(gs);
      try { writeFileSync('/tmp/sw-spider-liqtype.bin', st.liquidType); } catch { /* ignore */ }
    }
  };
  try {
    const world = await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 });
    let n62 = 0;
    for (let i = 0; i < W * H; i++) if (world.store.wall[i] === 62) n62++;
    pipeWall62 = n62;
  } finally {
    g0.__swSpiderGsCap = undefined;
  }
  if (!gsSp) throw new Error('gs capture failed');

  // vanilla 终态 62 总数（最终 wld 不在 dump 集——以 063 出口近似 pass 内产出）
  const w63 = new Uint16Array(load(IDX_OUT, 'wal').buffer.slice(0));
  const w62v = new Uint16Array(load(IDX_IN, 'wal').buffer.slice(0));
  let van62out = 0, van62new = 0;
  for (let i = 0; i < W * H; i++) {
    if (w63[i] === 62) van62out++;
    if (w63[i] === 62 && w62v[i] !== 62) van62new++;
  }
  console.log(`vanilla 063出口 wall62=${van62out}（本 pass 新增 ${van62new}）; JS 管线终态(经 WebsInSpider 清液不改墙) 62≈${pipeWall62}(含后续 pass 覆写不可比)`);

  // ── B) dump062 → runSpiderNestPass → dump063 对拍
  const { st } = buildStore(IDX_IN);
  const { rng, box } = countedRng(gsSp.seed);
  const chests: Array<{ x: number; y: number; items: unknown[] }> = [];
  const nestLog: string[] = [];
  (globalThis as { __swSpiderNest?: (s: string) => void }).__swSpiderNest = (s) => nestLog.push(`${s}+#${box.n}`);
  try {
    runSpiderNestPass(st, rng, gsSp, chests as never);
  } finally {
    (globalThis as { __swSpiderNest?: (s: string) => void }).__swSpiderNest = undefined;
  }
  console.log('  nests:', nestLog.join('\n         '));
  // 逐巢对拍：锚点 ±30 窗内 vanilla063 的 62 格数 & 锚点自身
  const w63b = w63;
  const anchorAgree: string[] = [];
  for (const line of nestLog.filter((s) => s.startsWith('NEST#'))) {
    const m = /NEST#(\d+) x=(\d+) y=(\d+) /.exec(line)!;
    const [, n, xs, ys] = m;
    const x = +xs!, y = +ys!;
    let near = 0;
    for (let dx = -30; dx <= 30; dx++) for (let dy = -30; dy <= 30; dy++) {
      const i = (y + dy) * W + (x + dx);
      if (i >= 0 && i < W * H && w63b[i] === 62) near++;
    }
    anchorAgree.push(`#${n}@${x},${y} v62near=${near}${w63b[y * W + x] === 62 ? '' : ' ✗anchor'}`);
  }
  console.log('  anchor agree:', anchorAgree.join(' | '));
  let js62 = 0;
  const pairs = new Map<string, number>();
  const regs = new Map<string, number>();
  const samples: string[] = [];
  let wal = 0, typ = 0, act = 0;
  const tIn = new Uint16Array(load(IDX_IN, 'typ').buffer.slice(0));
  const aIn = load(IDX_IN, 'act');
  const tOut = new Uint16Array(load(IDX_OUT, 'typ').buffer.slice(0));
  const aOut = load(IDX_OUT, 'act');
  for (let i = 0; i < W * H; i++) {
    if (st.wall[i] === 62) js62++;
    let jT = st.type[i];
    if (jT !== 0) jT = SHEET[jT] ?? -1;
    const changed = jT !== tIn[i] || (st.flags[i] !== 0) !== (aIn[i] !== 0);
    const dT = changed && (jT !== tOut[i] || (st.flags[i] !== 0) !== (aOut[i] !== 0));
    const dW = st.wall[i] !== w63[i];
    if (!(dT || dW)) continue;
    if (dT) typ++;
    if (dW) { wal++; pairs.set(`W${st.wall[i]}>${w63[i]}`, (pairs.get(`W${st.wall[i]}>${w63[i]}`) ?? 0) + 1); }
    if ((st.flags[i] !== 0) !== (aOut[i] !== 0)) act++;
    const x = i % W, y = (i / W) | 0;
    const rk = `x${(x / 200) | 0}y${(y / 200) | 0}`;
    regs.set(rk, (regs.get(rk) ?? 0) + 1);
    if (samples.length < 12 && dW) samples.push(`(${x},${y})jW${st.wall[i]}>v${w63[i]}`);
  }
  console.log(`JS draws=${box.n} | 出口62: js=${js62} vanilla=${van62out} | diff wal=${wal} typ=${typ}`);
  // 新增/移除 tile 分族对拍（062→063 vanilla vs JS：active 翻转按 sheet 分族）
  const famCount = new Map<string, { v: number; j: number }>();
  const bumpFam = (k: string, side: 'v' | 'j') => {
    const e = famCount.get(k) ?? { v: 0, j: 0 };
    e[side]++;
    famCount.set(k, e);
  };
  for (let i = 0; i < W * H; i++) {
    const a0 = aIn[i] !== 0, va1 = aOut[i] !== 0, ja1 = st.flags[i] !== 0;
    let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
    if (!a0 && va1) bumpFam(`+${tOut[i]}`, 'v');
    else if (a0 && !va1) bumpFam(`-${tIn[i]}`, 'v');
    if (!a0 && ja1) bumpFam(`+${jT}`, 'j');
    else if (a0 && !ja1) bumpFam(`-${jT}`, 'j');
  }
  console.log('  active 翻转分族 v/j:', JSON.stringify([...famCount.entries()].sort((p, q) => (q[1].v + q[1].j) - (p[1].v + p[1].j)).slice(0, 16)));
  console.log('  js chests placed:', (chests as unknown[]).length);
  console.log('  wall pairs:', JSON.stringify([...pairs.entries()].sort((p, q) => q[1] - p[1]).slice(0, 12)));
  // 逐巢内饰对拍：±35 窗内 28/165/185/187 新增（v/j）
  const perNest: string[] = [];
  for (const line of nestLog.filter((s) => s.startsWith('NEST#'))) {
    const m = /NEST#(\d+) x=(\d+) y=(\d+) /.exec(line)!;
    const x = +m[2]!, y = +m[3]!;
    const cnt = { 28: [0, 0], 165: [0, 0], 185: [0, 0], 187: [0, 0] } as Record<number, [number, number]>;
    for (let dx = -35; dx <= 35; dx++) for (let dy = -35; dy <= 35; dy++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 2 || yy < 2 || xx >= W - 2 || yy >= H - 2) continue;
      const i = yy * W + xx;
      for (const fam of [28, 165, 185, 187]) {
        if (tOut[i] === fam && !aIn[i] && aOut[i]) cnt[fam]![0]++;
        let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
        if (jT === fam && !aIn[i] && st.flags[i]) cnt[fam]![1]++;
      }
    }
    perNest.push(`#${m[1]}@${x},${y}[28:${cnt[28]![0]}/${cnt[28]![1]} 165:${cnt[165]![0]}/${cnt[165]![1]} 185:${cnt[185]![0]}/${cnt[185]![1]} 187:${cnt[187]![0]}/${cnt[187]![1]}]`);
  }
  console.log('  per-nest interiors v/j:', perNest.join('\n    '));
  console.log('  regions:', JSON.stringify([...regs.entries()].sort((p, q) => q[1] - p[1]).slice(0, 10)));
  console.log('  samples:', samples.join(' '));
}, 600_000);
