// 一次性：s111 #29 隔离重放 diff 的逐列剖析（找 JS↔vanilla 分道的具体裂隙锚点）。
import { it } from 'vitest';
const RUN = !!process.env.SW_COR29AN;
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runCorruptionPass } from '../src/world/gen/vanilla/CorruptionPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const W = 4200, H = 1200;
const D1 = '/tmp/sw-tgt111', D2 = '/tmp/sw-tgt111b';
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
const loadP = (dir: string, p: string, ext: string) => readFileSync(`${dir}/${p}.${ext}`);

function buildStore(dir: string, p: string): TileStore {
  const t = new Uint16Array(loadP(dir, p, 'typ').buffer.slice(0));
  const a = loadP(dir, p, 'act'), w = new Uint16Array(loadP(dir, p, 'wal').buffer.slice(0));
  const l = loadP(dir, p, 'liq'), lty = loadP(dir, p, 'lty');
  const half = loadP(dir, p, 'half'), slope = loadP(dir, p, 'slope');
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0; st.flags[i] = a[i] ? 1 : 0; st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!; st.liquidType[i] = l[i]! > 0 ? lty[i]! + 1 : 0;
    st.half[i] = half[i]!; st.slope[i] = slope[i]!;
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

(RUN ? it : it.skip)('s111 #29 diff column profile', async () => {
  const g0 = globalThis as { __swCorGsCap?: (gs: GenState) => void; __swCorMark?: (s: string) => void };
  let gsCor: GenState | null = null;
  g0.__swCorGsCap = (gs) => { if (!gsCor) gsCor = cloneGs(gs); };
  try { await generateWorld({ size: 0, width: W, height: H, seedText: '111', evil: 0 } as Parameters<typeof generateWorld>[0]); }
  catch (e) { console.log('pipeline EX:', String(e).slice(0, 80)); }
  finally { g0.__swCorGsCap = undefined; }
  const st = buildStore(D1, 'p28');
  const marks: Array<[string, number]> = [];
  let n = 0;
  const rng = new RNG(gsCor!.seed);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  ur.internalSample = () => { n++; return orig(); };
  g0.__swCorMark = (s) => { marks.push([s, n]); };
  try { runCorruptionPass(st, rng, gsCor!); } finally { g0.__swCorMark = undefined; }

  const aV = loadP(D2, 'p29', 'act');
  const tV = new Uint16Array(loadP(D2, 'p29', 'typ').buffer.slice(0));
  const wV = new Uint16Array(loadP(D2, 'p29', 'wal').buffer.slice(0));
  // 逐列（x2400-2900）统计：act 差 / wall 差 / 两侧 wall==3 计数（裂隙列指纹）
  const cols: Array<{ x: number; aJv: number; aVj: number; wJv: number; wVj: number; w3js: number; w3van: number }> = [];
  for (let x = 2380; x < 2920; x++) {
    let aJv = 0, aVj = 0, wJv = 0, wVj = 0, w3js = 0, w3van = 0;
    for (let y = 100; y < 700; y++) {
      const i = y * W + x;
      if ((st.flags[i] !== 0) !== (aV[i] !== 0)) { st.flags[i] ? aJv++ : aVj++; }
      if (st.wall[i] !== wV[i]) { st.wall[i] !== 3 ? wJv++ : wVj++; }
      if (st.wall[i] === 3) w3js++;
      if (wV[i] === 3) w3van++;
    }
    if (aJv + aVj + wJv + wVj > 0 || w3js || w3van) cols.push({ x, aJv, aVj, wJv, wVj, w3js, w3van });
  }
  console.log('x     aJ>0 aV>0  wJ≠ wV≠  w3js w3van');
  for (const c of cols) console.log(`${c.x}  ${String(c.aJv).padStart(4)} ${String(c.aVj).padStart(4)}  ${String(c.wJv).padStart(3)} ${String(c.wVv).padStart(3)}  ${String(c.w3js).padStart(4)} ${String(c.w3van).padStart(4)}`);
  // wall==3 列计数（裂隙竖井深度指纹）：js 侧 vs vanilla 侧
  console.log('\nmarks:', marks.map(([s, k]) => `${s}@${k}`).join(' '));
  // wall3 差的 y 剖析（x2600-2900）：判缺失者是竖井(纵向带)还是水平裂隙(y355-395 窄带)
  {
    const yb = new Int32Array(30);
    for (let x = 2600; x < 2900; x++) for (let y = 100; y < 700; y++) {
      const i = y * W + x;
      if (wV[i] === 3 && st.wall[i] !== 3) yb[Math.min(29, ((y - 100) / 20) | 0)]++;
    }
    console.log('van有3而js无3 的 y 带(x2600-2900):', [...yb.keys()].filter(k2 => yb[k2] > 0).map(k2 => `y${100 + k2 * 20}-${119 + k2 * 20}:${yb[k2]}`).join(' '));
  }
  // 首个 diff 细胞（按 x 序，前 30 个）
  {
    const cells: string[] = [];
    for (let x = 2400; x < 2900 && cells.length < 30; x++) for (let y = 100; y < 700; y++) {
      const i = y * W + x;
      const aJ = st.flags[i] !== 0, vAct = aV[i] !== 0;
      let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
      if ((aJ !== vAct) || (aJ && jT !== tV[i]) || (st.wall[i] !== wV[i])) {
        cells.push(`(${x},${y})a${aJ ? 1 : 0}>${vAct ? 1 : 0}t${aJ ? jT : -1}>${vAct ? tV[i] : -1}W${st.wall[i]}>${wV[i]}`);
        break;
      }
    }
    console.log('首列 diff 细胞:', cells.join(' '));
  }
  // vanilla 裂隙竖井列（w3van 高计数列）与 js 对照
  const shafts: string[] = [];
  for (let x = 2380; x < 2920; x++) {
    let w3van = 0, w3js = 0;
    for (let y = 100; y < 700; y++) { const i = y * W + x; if (wV[i] === 3) w3van++; if (st.wall[i] === 3) w3js++; }
    if (w3van > 30 || w3js > 30) shafts.push(`x${x}:js${w3js}/van${w3van}`);
  }
  console.log('\n竖井列(>30):', shafts.join(' '));
  try { writeFileSync('/tmp/cor29-cols.json', JSON.stringify(cols)); } catch { /* */ }
}, 480000);
