// 一次性：#56 CaveWallVariety 隔离重放（债线:055 出口 wal=157 → 056 出口 wal=78678）。
//   A) JS 链经 __swCwvCap 捕获 056 入口(含 slope/half/liquidType 近似通道)
//   B) dump055_Ice 四通道干净真值 + 链 slope/half/liqType 叠加 →
//      runCaveWallVarietyPass → 对拍 dump056_Wall_Variety(wall/typ/act/liq)
// 用法：SW_CWVISO=1 npx vitest run tools/_cwviso.test.ts
import { it } from 'vitest';
const RUN = process.env.SW_CWVISO === '1';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runCaveWallVarietyPass } from '../src/world/gen/vanilla/CaveWallsPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200, N = W * H;
const NAMES: Record<number, string> = { 55: 'Ice', 56: 'Wall_Variety' };
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

let gsCap: GenState | null = null;
let pipeSlope: Uint8Array | null = null;
let pipeHalf: Uint8Array | null = null;
let pipeLiqType: Uint8Array | null = null;

(RUN ? it : it.skip)('#56 WallVariety isolated replay', async () => {
  const g0 = globalThis as { __swCwvCap?: (gs: GenState, st: TileStore) => void };
  g0.__swCwvCap = (gs, st) => {
    if (gsCap) return;
    gsCap = cloneGs(gs);
    pipeSlope = st.slope.slice(); pipeHalf = st.half.slice(); pipeLiqType = st.liquidType.slice();
  };
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 });
  } finally {
    g0.__swCwvCap = undefined;
  }
  if (!gsCap || !pipeSlope || !pipeHalf || !pipeLiqType) throw new Error('capture failed');
  console.log(`[gs] genWorldSurface=${(gsCap as { genWorldSurface?: number }).genWorldSurface} genRockLayer=${(gsCap as { genRockLayer?: number }).genRockLayer} lavaLine=${gsCap.lavaLine} shimmer=${gsCap.shimmerX},${gsCap.shimmerY}`);

  // dump055 四通道 + 链 slope/half/liqType
  const t55 = new Uint16Array(load(55, 'typ').buffer.slice(0));
  const a55 = load(55, 'act');
  const w55 = new Uint16Array(load(55, 'wal').buffer.slice(0));
  const l55 = load(55, 'liq');
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(t55[i]!) ?? 0;
    st.flags[i] = a55[i] ? 1 : 0;
    st.wall[i] = w55[i]!;
    st.liquid[i] = l55[i]!;
    st.slope[i] = pipeSlope[i]!;
    st.half[i] = pipeHalf[i]!;
    st.liquidType[i] = pipeLiqType[i]!;
  }
  const rng = new RNG(gsCap.seed);
  // ★WallVariety 时点 GenSolid 态:fragileIce(cs:16782-83)已翻 226/162 非实心,
  //   UndergroundHouses(cs:17076)回实心在本 pass 之后——隔离重放须先翻(管线里
  //   '薄冰'槽已翻,但本测试进程的 GenSolid 单例残留管线终态)
  const { flipGenSolid } = await import('../src/world/gen/vanilla/GenSolid');
  flipGenSolid([226, 162], false);
  {
    const solidHist = new Map<number, number>();
    const seen = new Set<number>();
    const q: Array<[number, number]> = [[3671, 629]];
    let quota = 1000;
    while (q.length && quota > 0) {
      const [x, y] = q.shift()!;
      const i = y * W + x;
      if (seen.has(i)) continue;
      const qd = TILE_DEFS[st.type[i]];
      const blocked = st.flags[i] !== 0 && qd && st.type[i] !== 0 && (TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? 0) !== 0;
      // 用真实 genSolid 判定:从 pass 同款逻辑
      const { genSolidType } = await import('../src/world/gen/vanilla/GenSolid');
      const isSolid = st.flags[i] !== 0 && !!qd && genSolidType(st.type[i]) && !qd.platform;
      if (isSolid) {
        const vt = t55[i]!;
        solidHist.set(vt, (solidHist.get(vt) ?? 0) + 1);
        continue;
      }
      seen.add(i); quota--;
      if (x + 1 < W - 1) q.push([x + 1, y]);
      if (x - 1 >= 1) q.push([x - 1, y]);
      if (y + 1 < H - 1) q.push([x, y + 1]);
      if (y - 1 >= 1) q.push([x, y - 1]);
    }
    console.log(`[diag9] cells=${seen.size} quota=${quota} qleft=${q.length} | solid 拦截 vanilla type 直方图:`,
      JSON.stringify([...solidHist.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10)));
  }
  const spots: string[] = [];
  (globalThis as { __swCwvLog?: (s: string) => void }).__swCwvLog = (s) => {
    if (spots.length < 20000) spots.push(s);
  };
  try {
    runCaveWallVarietyPass(st, rng, gsCap);
  } finally {
    (globalThis as { __swCwvLog?: (s: string) => void }).__swCwvLog = undefined;
  }
  // 放置成功斑清单(从 SPOT 行提取 complete&&!invalid&&cells>50 的)
  const placed = spots.filter((s) => {
    const m = /cells=(\d+) quota=(-?\d+) qleft=(\d+) complete=(\w+) invalid=(\w+)/.exec(s)!;
    return +m[1]! > 50 && m[4] === 'true' && m[5] === 'false';
  });
  console.log(`spots logged=${spots.length} placed=${placed.length}`);
  console.log(placed.slice(0, 25).map((s) => s.replace(/quota=\S+ /, '')).join('\n'));

  // vanilla 斑:dump056 中 wall 变体族(196-199/204-207/208-215)且与 055 不同的连通域
  const VSET = new Set<number>();
  for (let k = 196; k <= 199; k++) VSET.add(k);
  for (let k = 204; k <= 207; k++) VSET.add(k);
  for (let k = 208; k <= 215; k++) VSET.add(k);
  const w56 = new Uint16Array(load(56, 'wal').buffer.slice(0));
  const visited = new Uint8Array(N);
  const vCl: Array<{ cx: number; cy: number; cells: number }> = [];
  const stack: number[] = [];
  const isSpot = (i: number) => VSET.has(w56[i]!) && w56[i] !== w55[i];
  for (let i = 0; i < N; i++) {
    if (visited[i] || !isSpot(i)) continue;
    stack.length = 0; stack.push(i); visited[i] = 1;
    let cells = 0, sx = 0, sy = 0;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % W, y = (j / W) | 0;
      cells++; sx += x; sy += y;
      if (x > 0 && !visited[j - 1] && isSpot(j - 1)) { visited[j - 1] = 1; stack.push(j - 1); }
      if (x < W - 1 && !visited[j + 1] && isSpot(j + 1)) { visited[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && !visited[j - W] && isSpot(j - W)) { visited[j - W] = 1; stack.push(j - W); }
      if (y < H - 1 && !visited[j + W] && isSpot(j + W)) { visited[j + W] = 1; stack.push(j + W); }
    }
    vCl.push({ cx: Math.round(sx / cells), cy: Math.round(sy / cells), cells });
  }
  console.log(`vanilla 变体斑=${vCl.length}(前 25):`);
  console.log(vCl.slice(0, 25).map((c) => `@${c.cx},${c.cy} (${c.cells}格)`).join(' '));

  const t56 = new Uint16Array(load(56, 'typ').buffer.slice(0));
  const a56 = load(56, 'act');
  const l56 = load(56, 'liq');
  let dT = 0, dA = 0, dW = 0, dL = 0;
  const wpairs = new Map<string, number>();
  const samples: string[] = [];
  for (let i = 0; i < N; i++) {
    const ja = st.flags[i] !== 0;
    const jT = ja ? (SHEET[st.type[i]] ?? -1) : -1;
    const vt = a56[i] ? t56[i] : -1;
    if (vt !== jT) dT++;
    if ((a56[i] !== 0) !== ja) dA++;
    if (st.wall[i] !== w56[i]) {
      dW++;
      const k = `${w56[i]}>${st.wall[i]}`;
      wpairs.set(k, (wpairs.get(k) ?? 0) + 1);
      if (samples.length < 10) samples.push(`(${i % W},${(i / W) | 0})v${w56[i]}>j${st.wall[i]}`);
    }
    if (st.liquid[i] !== l56[i]) dL++;
  }
  console.log(`[iso-out] 隔离出口 vs dump056: typ=${dT} act=${dA} wal=${dW} liq=${dL}`);
  console.log('  wall pairs:', JSON.stringify([...wpairs.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14)));
  console.log('  samples:', samples.join(' '));
}, 300_000);
