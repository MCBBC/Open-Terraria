// 一次性：#27 Webs 隔离重放（van dump026_Shinies → runWebsPass → 对拍 dump027_Webs）。
// dump 集 = seed 9293480 x86（/tmp/sw-num4/van_x86_g）。
//   A) 真管线 generateWorld 经 __swWebsCap 探针钩（WebsPass 头）捕获入口 gs+store：
//      JS 管线 Webs 入口 vs dump026 四通道对拍 = 上游残余债（级联量）。
//   B) dump026 干净真值 → buildStore → runWebsPass → dump027 对拍：
//      pass 自身差异数（自因量）。位级全等则 Webs 1:1，s111 51 漂移=上游噪声。
// 用法：SW_WEBISO=1 npx vitest run tools/_webiso.test.ts
import { it } from 'vitest';
const RUN = process.env.SW_WEBISO === '1';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runWebsPass } from '../src/world/gen/vanilla/WebsPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200, N = W * H;
const NAMES: Record<number, string> = { 26: 'Shinies', 27: 'Webs' };
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

/** 51 团簇（4 邻连通域）：{ cells, x0..x1, y0..y1, cx, cy } */
function webClusters(is51: (i: number) => boolean): Array<{ cells: number; cx: number; cy: number; x0: number; x1: number }> {
  const visited = new Uint8Array(N);
  const out: Array<{ cells: number; cx: number; cy: number; x0: number; x1: number }> = [];
  const stack: number[] = [];
  for (let i = 0; i < N; i++) {
    if (visited[i] || !is51(i)) continue;
    stack.length = 0; stack.push(i); visited[i] = 1;
    let cells = 0, sx = 0, sy = 0, x0 = W, x1 = 0;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % W, y = (j / W) | 0;
      cells++; sx += x; sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (x > 0 && !visited[j - 1] && is51(j - 1)) { visited[j - 1] = 1; stack.push(j - 1); }
      if (x < W - 1 && !visited[j + 1] && is51(j + 1)) { visited[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && !visited[j - W] && is51(j - W)) { visited[j - W] = 1; stack.push(j - W); }
      if (y < H - 1 && !visited[j + W] && is51(j + W)) { visited[j + W] = 1; stack.push(j + W); }
    }
    out.push({ cells, cx: Math.round(sx / cells), cy: Math.round(sy / cells), x0, x1 });
  }
  out.sort((a, b) => a.cx - b.cx || a.cy - b.cy);
  return out;
}

(RUN ? it : it.skip)('#27 Webs isolated replay', async () => {
  // ── A) 真管线捕获 Webs 入口 gs + 入口四通道 vs dump026 ──
  const g0 = globalThis as { __swWebsCap?: (gs: GenState, st: TileStore) => void };
  let gsCap: GenState | null = null;
  let entryDiff = '';
  g0.__swWebsCap = (gs, st) => {
    if (gsCap) return;
    gsCap = cloneGs(gs);
    const t26 = new Uint16Array(load(26, 'typ').buffer.slice(0));
    const a26 = load(26, 'act');
    const w26 = new Uint16Array(load(26, 'wal').buffer.slice(0));
    const l26 = load(26, 'liq');
    let dT = 0, dA = 0, dW = 0, dL = 0;
    const pairT = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const ja = st.flags[i] !== 0;
      let jT = ja ? (SHEET[st.type[i]] ?? -1) : -1;
      const vt = a26[i] ? t26[i] : -1;
      if ((a26[i] !== 0) !== ja) dA++;
      if (vt !== jT) {
        dT++;
        const k = `${vt}>${jT}`;
        pairT.set(k, (pairT.get(k) ?? 0) + 1);
      }
      if (st.wall[i] !== w26[i]) dW++;
      if (st.liquid[i] !== l26[i]) dL++;
    }
    const top = [...pairT.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, c]) => `${k}×${c}`).join(', ');
    entryDiff = `[entry] JS管线 Webs 入口 vs dump026: typ=${dT} act=${dA} wal=${dW} liq=${dL} | top: ${top}`;
  };
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 });
  } finally {
    g0.__swWebsCap = undefined;
  }
  if (!gsCap) throw new Error('gs capture failed');
  console.log(entryDiff);
  console.log(`[gs] worldSurface=${gsCap.worldSurface} surfaceHigh=${gsCap.worldSurfaceHigh} surfaceLow=${gsCap.worldSurfaceLow} numMCaves=${gsCap.numMCaves}`);

  // ── B) dump026 → runWebsPass → dump027 对拍（干净输入 → 自因量）──
  const t26 = new Uint16Array(load(26, 'typ').buffer.slice(0));
  const a26 = load(26, 'act');
  const st = buildStore(26);
  const { RNG: RNGC } = await import('../src/core/rng');
  const rng = new RNGC(gsCap.seed);
  const webLog: string[] = [];
  (globalThis as { __swWebsLog?: (s: string) => void }).__swWebsLog = (s) => webLog.push(s);
  try {
    runWebsPass(st, rng, gsCap);
  } finally {
    (globalThis as { __swWebsLog?: (s: string) => void }).__swWebsLog = undefined;
  }
  const t27 = new Uint16Array(load(27, 'typ').buffer.slice(0));
  const a27 = load(27, 'act');
  const w27 = new Uint16Array(load(27, 'wal').buffer.slice(0));
  const l27 = load(27, 'liq');
  let dT = 0, dA = 0, dW = 0, dL = 0, jsNew51 = 0;
  const pairT = new Map<string, number>();
  const regs = new Map<string, number>();
  const samples: string[] = [];
  for (let i = 0; i < N; i++) {
    const ja = st.flags[i] !== 0;
    let jT = ja ? (SHEET[st.type[i]] ?? -1) : -1;
    const vt = a27[i] ? t27[i] : -1;
    const va = a27[i] !== 0;
    if (va !== ja) dA++;
    if (vt !== jT) {
      dT++;
      const k = `${vt}>${jT}`;
      pairT.set(k, (pairT.get(k) ?? 0) + 1);
      const x = i % W, y = (i / W) | 0;
      regs.set(`x${(x / 300) | 0}y${(y / 300) | 0}`, (regs.get(`x${(x / 300) | 0}y${(y / 300) | 0}`) ?? 0) + 1);
      if (samples.length < 15) samples.push(`(${x},${y})v${vt}>j${jT}`);
    }
    if (st.wall[i] !== w27[i]) dW++;
    if (st.liquid[i] !== l27[i]) dL++;
    if (ja && jT === 51 && !(a26[i] && t26[i] === 51)) jsNew51++;
  }
  console.log(`[iso-out] 隔离出口 vs dump027: typ=${dT} act=${dA} wal=${dW} liq=${dL} | jsNew51=${jsNew51}(van=32547)`);
  console.log('  pairs:', JSON.stringify([...pairT.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10)));
  console.log('  regions:', JSON.stringify([...regs.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10)));
  console.log('  samples:', samples.join(' '));
  console.log(`  runners fired: js=${webLog.length}`);

  // ── C) 团簇对拍：vanilla 027 新增 51 团 vs JS 出口新增 51 团（位置漂移定位）──
  if (dT > 0) {
    const vCl = webClusters((i) => a27[i] !== 0 && t27[i] === 51 && !(a26[i] && t26[i] === 51));
    const jCl = webClusters((i) => { const t = st.type[i]; return t !== 0 && SHEET[t] === 51 && !(a26[i] && t26[i] === 51); });
    console.log(`  clusters: van=${vCl.length} js=${jCl.length}`);
    // 最近邻匹配：每团找最近团,距离>12 记漂移
    const near = (list: typeof vCl, x: number, y: number) => {
      let bd = 1e9, bi = -1;
      for (let k = 0; k < list.length; k++) {
        const dx = list[k]!.cx - x, dy = list[k]!.cy - y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; bi = k; }
      }
      return { d: Math.sqrt(bd), i: bi };
    };
    let moved = 0, noMatch = 0;
    const drifts: string[] = [];
    for (const c of vCl) {
      const m = near(jCl, c.cx, c.cy);
      if (m.i < 0 || m.d > 12) { noMatch++; if (drifts.length < 8) drifts.push(`van@${c.cx},${c.cy}(${c.cells}格)无匹配(最近${m.d.toFixed(0)})`); }
      else if (m.d > 2) { moved++; if (drifts.length < 8) drifts.push(`van@${c.cx},${c.cy}(${c.cells}格)→js漂移${m.d.toFixed(0)}px`); }
    }
    console.log(`  van 团匹配: 漂移>2px=${moved} 无匹配=${noMatch}`);
    if (drifts.length) console.log('  drifts:', drifts.join(' | '));
  }
}, 300_000);
