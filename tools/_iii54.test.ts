// IIIII 批一次性探针（用毕即删）：12345 #54 Waterfalls 隔离重放 + __swWfLog 决策流。
// golden053 基座（g12345）→ runWaterfallLipPass(new RNG(12345)) → 与 golden054 八通道
// 对拍（WWWW 同法复现单差 (3845,1045) Hf=1）+ 决策流落盘对拍 vanilla WFProbe。
// 用法：cd game && SW_III54=1 npx vitest run tools/_iii54.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runWaterfallLipPass } from '../src/world/gen/vanilla/HalfBrickPass';

const RUN = process.env.SW_III54 === '1';
const G2 = '/tmp/sw-slp/g12345';
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;

function buildStore(idx: number): { st: TileStore; miss: number } {
  const t = new Uint16Array(readFileSync(gPath(idx, 'typ')).buffer.slice(0));
  const a = readFileSync(gPath(idx, 'act'));
  const w = new Uint16Array(readFileSync(gPath(idx, 'wal')).buffer.slice(0));
  const l = readFileSync(gPath(idx, 'liq'));
  const hf = readFileSync(gPath(idx, 'half'));
  const sl = readFileSync(gPath(idx, 'slope'));
  const lt = readFileSync(gPath(idx, 'lty'));
  const ia = readFileSync(gPath(idx, 'inact'));
  const st = new TileStore(W, H);
  let miss = 0;
  for (let i = 0; i < N; i++) {
    st.flags[i] = a[i]!;
    if (a[i] || t[i]) {
      const id = REV.get(t[i]!) ?? -1;
      if (id < 0) miss++;
      st.type[i] = id < 0 ? 0 : id;
    }
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = l[i] ? lt[i]! + 1 : 0;
    st.half[i] = hf[i]!;
    st.slope[i] = sl[i]!;
    st.wire[i] = ia[i]! ? 0x20 : 0;
  }
  return { st, miss };
}

(RUN ? it : it.skip)('iii54 replay 12345 waterfalls', () => {
  const { st, miss } = buildStore(53);
  console.log(`base 053 revMiss=${miss}`);
  // GenSolid 翻转时间线重放（GenSolid.ts 头注 cs 序，种子无关）→ Waterfalls 头态
  flipGenSolid([659], false);
  flipGenSolid([484], false);
  flipGenSolid([137], false);
  flipGenSolid([192], true);              // cs:16324 窗口
  flipGenSolid([481, 482, 483], true);    // cs:16510 SmoothWorld 头
  flipGenSolid([137], true);              // cs:16692 尾
  flipGenSolid([190], false);
  flipGenSolid([192], false);             // cs:16694
  flipGenSolid([481, 482, 483], false);   // cs:16695
  const wfLog: string[] = [];
  (globalThis as { __swWfLog?: (s: string) => void }).__swWfLog = (s) => wfLog.push(s);
  runWaterfallLipPass(st, new RNG(12345), undefined as never);
  (globalThis as { __swWfLog?: (s: string) => void }).__swWfLog = undefined;
  writeFileSync('/tmp/iiiii-work/wf-js-12345.txt', wfLog.join('\n') + '\n');
  console.log(`wf log lines=${wfLog.length}`);
  // 八通道对拍 golden054
  const t = new Uint16Array(readFileSync(gPath(54, 'typ')).buffer.slice(0));
  const a = readFileSync(gPath(54, 'act'));
  const w = new Uint16Array(readFileSync(gPath(54, 'wal')).buffer.slice(0));
  const l = readFileSync(gPath(54, 'liq'));
  const hf = readFileSync(gPath(54, 'half'));
  const sl = readFileSync(gPath(54, 'slope'));
  const lt = readFileSync(gPath(54, 'lty'));
  const ia = readFileSync(gPath(54, 'inact'));
  const cnt = { A: 0, T: 0, W: 0, L: 0, Hf: 0, Sl: 0, Lt: 0, Ia: 0 };
  const samples: string[] = [];
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    if (a[i] !== (st.flags[i]! & 1)) { cnt.A++; if (samples.length < 12) samples.push(`A(${x},${y}) v${a[i]} j${st.flags[i]! & 1}`); }
    const vt = a[i] ? t[i]! : 0;
    const jt = st.flags[i] & 1 ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { cnt.T++; if (samples.length < 12) samples.push(`T(${x},${y}) v${vt} j${jt}`); }
    if (w[i]! !== st.wall[i]!) { cnt.W++; if (samples.length < 12) samples.push(`W(${x},${y}) v${w[i]} j${st.wall[i]}`); }
    if (l[i]! !== st.liquid[i]!) { cnt.L++; if (samples.length < 12) samples.push(`L(${x},${y}) v${l[i]} j${st.liquid[i]}`); }
    if (hf[i]! !== st.half[i]!) { cnt.Hf++; if (samples.length < 12) samples.push(`H(${x},${y}) v${hf[i]} j${st.half[i]}`); }
    if (sl[i]! !== st.slope[i]!) { cnt.Sl++; if (samples.length < 12) samples.push(`S(${x},${y}) v${sl[i]} j${st.slope[i]}`); }
    const vl = l[i]! > 0 ? lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { cnt.Lt++; if (samples.length < 12) samples.push(`Y(${x},${y}) v${vl} j${jl}`); }
    if ((ia[i]! ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) { cnt.Ia++; if (samples.length < 12) samples.push(`I(${x},${y})`); }
  }
  console.log(`#54 diff: A=${cnt.A} T=${cnt.T} W=${cnt.W} L=${cnt.L} Hf=${cnt.Hf} Sl=${cnt.Sl} Lt=${cnt.Lt} Ia=${cnt.Ia}`);
  if (samples.length) console.log(samples.join(' | '));
}, 240_000);
