// CCCC 批·诊断⑭:pad=20(strip 幻影 wire)全量八通道对拍 golden101——残余=#101 下游
// 自因,按段指纹聚类。一次性探针。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';

const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;
const PAD = Number(process.env.SW_CCCC_PAD ?? 20);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const b8 = (idx: number, e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
const b16 = (idx: number, e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));

const itIs = process.env.SW_CCCC === '13';

(itIs ? it : it.skip)('cccc pad20 full diff', async () => {
  const gt = b16(100, 'typ'), ga = b8(100, 'act'), gw = b16(100, 'wal'), gl = b8(100, 'liq');
  const ghf = b8(100, 'half'), gsl = b8(100, 'slope'), glt = b8(100, 'lty'), gia = b8(100, 'inact');
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
  }
  const gsB = JSON.parse(readFileSync(`${BDIR}/s52/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s52/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${BDIR}/s52/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire0 = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire0[i] = fw[q + 3]! & 0x1f; }
  for (let y = 517; y <= 541; y++) for (const x of [1122, 1123, 1124]) wire0[y * W + x] = 0;
  const iw = new Uint32Array(readFileSync(`${BDIR}/s52/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const chests = JSON.parse(readFileSync(`${BDIR}/s52/chests.json`, 'utf8')) as unknown[];
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = ga[i]!;
    st.flags[i] = act;
    if (act || gt[i]) {
      const sh = gt[i]!;
      let id = ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      st.type[i] = id < 0 ? 0 : id;
    }
    st.wall[i] = gw[i]!; st.liquid[i] = gl[i]!;
    st.liquidType[i] = gl[i] ? glt[i]! + 1 : 0;
    st.half[i] = ghf[i]!; st.slope[i] = gsl[i]!;
    st.wire[i] = (gia[i]! ? 0x20 : 0) | wire0[i];
    st.frameX[i] = fx[i]; st.frameY[i] = fy[i];
  }
  restoreGenSolid(gensolid);
  const gs = structuredClone(gsB) as GenState;
  __setGenStateForProbe(gs);
  const rng = new RNG(SEED);
  for (let q = 0; q < PAD; q++) rng.next();
  runMicroBiomesPass(st, rng, gs, chests as never);
  __setGenStateForProbe(null);

  // 八通道对拍
  const dt = b16(101, 'typ'), da = b8(101, 'act'), dw = b16(101, 'wal'), dl = b8(101, 'liq');
  const dhf = b8(101, 'half'), dsl = b8(101, 'slope'), dlt = b8(101, 'lty');
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
  const desc = new Map<number, string>();
  const pair = new Map<string, number>();
  let firstI = -1;
  for (let i = 0; i < N; i++) {
    const va = da[i]!, ja = st.flags[i]! & 1;
    const vt = va ? dt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    const vl = dl[i]! > 0 ? dlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    let d = '';
    if (va !== ja) { dA++; d += `A${va}>${ja} `; }
    if (vt !== jt) { dT++; d += `T${vt}>${jt} `; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if (dw[i]! !== st.wall[i]!) { dW++; d += `W${dw[i]}>${st.wall[i]} `; const k = `W${dw[i]}>${st.wall[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if (dl[i]! !== st.liquid[i]!) { dL++; d += `L${dl[i]}>${st.liquid[i]} `; }
    if (dhf[i]! !== st.half[i]!) { dHf++; d += `Hf `; }
    if (dsl[i]! !== st.slope[i]!) { dSl++; d += `Sl${dsl[i]}>${st.slope[i]} `; }
    if (vl !== jl) { dLt++; d += `Lt${vl}>${jl} `; }
    const via = gia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; d += `Ia `; }
    if (d) { desc.set(i, d.trim()); if (firstI < 0) firstI = i; }
  }
  console.log(`pad=${PAD}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} first=(${firstI % W},${Math.floor(firstI / W)})`);
  console.log(`pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  // 聚类
  const seen = new Uint8Array(N);
  const clusters: Array<{ cells: number[]; x0: number; x1: number; y0: number; y1: number }> = [];
  for (const c0 of desc.keys()) {
    if (seen[c0]) continue;
    const stack = [c0];
    seen[c0] = 1;
    const cells: number[] = [];
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (stack.length) {
      const i = stack.pop()!;
      cells.push(i);
      const x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const ni = ny * W + nx;
        if (!seen[ni] && desc.has(ni)) { seen[ni] = 1; stack.push(ni); }
      }
    }
    clusters.push({ cells, x0, x1, y0, y1 });
  }
  clusters.sort((a, b) => b.cells.length - a.cells.length);
  for (let ci = 0; ci < Math.min(clusters.length, 25); ci++) {
    const cl = clusters[ci]!;
    const pc = new Map<string, number>();
    for (const i of cl.cells) for (const tok of desc.get(i)!.split(' ')) pc.set(tok, (pc.get(tok) ?? 0) + 1);
    console.log(`#${ci} n=${cl.cells.length} bbox=[${cl.x0},${cl.y0}]-[${cl.x1},${cl.y1}] :: ${[...pc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' ')} :: eg ${desc.get(cl.cells[0]!)}`);
  }
}, 560_000);
