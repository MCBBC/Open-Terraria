// CCCC 批·诊断①：#101 MicroBiomes 差格聚类归属(golden100 基座重放 → 全差格按连通域聚类,
// 逐簇打印 bbox/通道/类型对样本,按段指纹归属)。一次性探针,跑完即删。
import { it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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
const BASE = 100, DUMP = 101;

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

const itIs = process.env.SW_CCCC === '1';

(itIs ? it : it.skip)('cccc cluster', async () => {
  // 基座重建(镜像 _wwwrep buildHybrid)
  const gt = b16(BASE, 'typ'), ga = b8(BASE, 'act'), gw = b16(BASE, 'wal'), gl = b8(BASE, 'liq');
  const ghf = b8(BASE, 'half'), gsl = b8(BASE, 'slope'), glt = b8(BASE, 'lty'), gia = b8(BASE, 'inact');
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
  }
  const gsB = JSON.parse(readFileSync(`${BDIR}/s52/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s52/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${BDIR}/s52/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
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
    st.wire[i] = (gia[i]! ? 0x20 : 0) | wire[i];
    st.frameX[i] = fx[i]; st.frameY[i] = fy[i];
  }
  restoreGenSolid(gensolid);
  const gs = structuredClone(gsB) as GenState;
  __setGenStateForProbe(gs);

  // RNG 采样计数(定位段流偏移用)
  const rng = new RNG(SEED);
  let draws = 0;
  const wrap = (r: RNG): void => {
    const proto = Object.getPrototypeOf(r);
    for (const name of ['next', 'int', 'range', 'nextInt']) {
      const orig = proto[name];
      if (typeof orig !== 'function') continue;
      (r as unknown as Record<string, unknown>)[name] = function (...args: unknown[]) {
        draws++;
        return orig.apply(this === r ? r : this, args);
      };
    }
  };
  wrap(rng);
  runMicroBiomesPass(st, rng, gs, chests as never);
  console.log(`RNG draws total = ${draws}`);
  __setGenStateForProbe(null);

  // 对拍 golden 101,收集差格
  const dt = b16(DUMP, 'typ'), da = b8(DUMP, 'act'), dw = b16(DUMP, 'wal'), dl = b8(DUMP, 'liq');
  const dhf = b8(DUMP, 'half'), dsl = b8(DUMP, 'slope'), dlt = b8(DUMP, 'lty');
  const diffCells: number[] = [];
  const desc = new Map<number, string>();
  for (let i = 0; i < N; i++) {
    const va = da[i]!, ja = st.flags[i]! & 1;
    const vt = va ? dt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    const vl = dl[i]! > 0 ? dlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    let d = '';
    if (va !== ja) d += `A${va}>${ja} `;
    if (vt !== jt) d += `T${vt}>${jt} `;
    if (dw[i]! !== st.wall[i]!) d += `W${dw[i]}>${st.wall[i]} `;
    if (dl[i]! !== st.liquid[i]!) d += `L${dl[i]}>${st.liquid[i]} `;
    if (dhf[i]! !== st.half[i]!) d += `Hf `;
    if (dsl[i]! !== st.slope[i]!) d += `Sl${dsl[i]}>${st.slope[i]} `;
    if (vl !== jl) d += `Lt${vl}>${jl} `;
    if (d) { diffCells.push(i); desc.set(i, d.trim()); }
  }
  console.log(`diff cells = ${diffCells.length}`);

  // 连通域聚类(8 邻域)
  const seen = new Uint8Array(N);
  const clusters: Array<{ cells: number[]; x0: number; x1: number; y0: number; y1: number }> = [];
  for (const c0 of diffCells) {
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
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const ni = ny * W + nx;
          if (!seen[ni] && desc.has(ni)) { seen[ni] = 1; stack.push(ni); }
        }
      }
    }
    clusters.push({ cells, x0, x1, y0, y1 });
  }
  clusters.sort((a, b) => b.cells.length - a.cells.length);
  console.log(`clusters = ${clusters.length}`);
  for (let ci = 0; ci < Math.min(clusters.length, 40); ci++) {
    const cl = clusters[ci]!;
    const pairCount = new Map<string, number>();
    for (const i of cl.cells) {
      for (const tok of desc.get(i)!.split(' ')) pairCount.set(tok, (pairCount.get(tok) ?? 0) + 1);
    }
    const top = [...pairCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' ');
    const ex = cl.cells[0]!;
    console.log(`#${ci} n=${cl.cells.length} bbox=[${cl.x0},${cl.y0}]-[${cl.x1},${cl.y1}] w=${cl.x1 - cl.x0 + 1} h=${cl.y1 - cl.y0 + 1} :: ${top} :: eg(${ex % W},${(ex / W) | 0}) ${desc.get(ex)}`);
  }
}, 300_000);
