// XXXXX 批·#97 自因差全格清单（9293480）：_wwwrep 槽 49 复刻 + 全差格分区打印。
// 用毕即删。用法：cd game && SW_XX=1 npx vitest run tools/_xxxx1.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { settleWorldLiquids } from '../src/world/liquid/settle';

const RUN = process.env.SW_XX === '1';
const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

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
const b8 = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));
const b16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));

interface Ch { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array }
function chans(idx: number): Ch {
  return { t: b16(gPath(idx, 'typ')), a: b8(gPath(idx, 'act')), w: b16(gPath(idx, 'wal')), l: b8(gPath(idx, 'liq')), hf: b8(gPath(idx, 'half')), sl: b8(gPath(idx, 'slope')), lt: b8(gPath(idx, 'lty')), ia: b8(gPath(idx, 'inact')) };
}

(RUN ? it : it.skip)('#97 all-diff cell census', async () => {
  const c = chans(96);          // 基座（#96 Larva 末态）
  const g = chans(97);          // 金标 #97 末态
  const gs = JSON.parse(readFileSync(`${BDIR}/s48/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s48/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${BDIR}/s48/frames.bin`).buffer.slice(0));
  const iw = new Uint32Array(readFileSync(`${BDIR}/s48/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);

  const st = new TileStore(W, H);
  let revMiss = 0;
  for (let i = 0; i < N; i++) {
    const act = c.a[i]!;
    st.flags[i] = act;
    if (act || c.t[i]) {
      const sh = c.t[i]!;
      let id = ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      if (id < 0) { id = 0; revMiss++; }
      st.type[i] = id;
    } else st.type[i] = 0;
    st.wall[i] = c.w[i]!;
    st.liquid[i] = c.l[i]!;
    st.liquidType[i] = c.l[i] ? c.lt[i]! + 1 : 0;
    st.half[i] = c.hf[i]!;
    st.slope[i] = c.sl[i]!;
    st.wire[i] = c.ia[i]! ? 0x20 : 0;
  }
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; st.frameX[i] = fw[q + 1]!; st.frameY[i] = fw[q + 2]!; st.wire[i] |= fw[q + 3]! & 0x1f; }
  console.log(`revMiss=${revMiss}`);

  const world = new World(W, H, SEED);
  world.store = st;
  world.shimmerX = gs.shimmerX; world.shimmerY = gs.shimmerY;
  world.genWaterLine = gs.waterLine;
  if ((gs.dungeonSide as number) === 0) world.genDungeonExempt = null;
  else {
    const edge = Math.floor(world.w * 0.05), mid = Math.floor(world.w * 0.55);
    world.genDungeonExempt = gs.dungeonSide < 0
      ? { x0: edge, x1: Math.floor(world.w * 0.45), y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 }
      : { x0: mid, x1: world.w - edge, y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 };
  }
  restoreGenSolid(gensolid);
  // XXXXX 反事实：两残格 t83 帧强制 72（stage4——CheckLavaDeath=true 档）——
  // 若 JS 随之全杀归零 → 坐实 x86 输入帧债（fx72 vs JS 捕获 fx90）
  if (process.env.SW_XX_CF === '1') {
    for (const [x, y] of [[3800, 1085], [3317, 1097]]) {
      const i = y * W + x;
      console.log(`  [CF] (${x},${y}) fx ${st.frameX[i]} → 72`);
      st.frameX[i] = 72;
    }
  }
  await settleWorldLiquids(world, 'gen', undefined, new RNG(SEED));

  // 全差格清点 + 分区
  const cells: Array<{ x: number; y: number; ch: string; v: number; j: number; extra: string }> = [];
  const tsheet = (i: number) => (st.flags[i]! & 1) ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    let d = '';
    let v = 0, j = 0, extra = '';
    if (g.a[i]! !== (st.flags[i]! & 1)) { d = 'A'; v = g.a[i]!; j = st.flags[i]! & 1; }
    else if ((g.a[i]! ? g.t[i]! : 0) !== tsheet(i)) { d = 'T'; v = g.a[i]! ? g.t[i]! : 0; j = tsheet(i); }
    else if (g.l[i]! !== st.liquid[i]!) { d = 'L'; v = g.l[i]!; j = st.liquid[i]!; extra = `lt v${g.l[i]! ? g.lt[i]! + 1 : 0} j${st.liquid[i]! ? st.liquidType[i]! : 0}`; }
    else {
      const vl = g.l[i]! > 0 ? g.lt[i]! + 1 : 0;
      const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
      if (vl !== jl) { d = 'Y'; v = vl; j = jl; extra = `liq v${g.l[i]!} j${st.liquid[i]!}`; }
      else if (g.w[i]! !== st.wall[i]!) { d = 'W'; v = g.w[i]!; j = st.wall[i]!; }
      else if (g.sl[i]! !== st.slope[i]!) { d = 'S'; v = g.sl[i]!; j = st.slope[i]!; }
      else if (g.hf[i]! !== st.half[i]!) { d = 'H'; v = g.hf[i]!; j = st.half[i]!; }
    }
    if (d) cells.push({ x, y, ch: d, v, j, extra });
  }
  console.log(`total diff cells: ${cells.length}`);
  // 守恒统计：全图液体总量（基座/金标/JS）
  let sumB = 0, sumG = 0, sumJ = 0, cntB = 0, cntG = 0, cntJ = 0;
  for (let i = 0; i < N; i++) {
    if (c.l[i]!) { sumB += c.l[i]!; cntB++; }
    if (g.l[i]!) { sumG += g.l[i]!; cntG++; }
    if (st.liquid[i]!) { sumJ += st.liquid[i]!; cntJ++; }
  }
  console.log(`liquid total: base96=${sumB}(${cntB}) golden97=${sumG}(${cntG}) js=${sumJ}(${cntJ})`);
  let vGTj = 0, jGTv = 0;
  let nVg = 0, nJg = 0;
  for (const q of cells) if (q.ch === 'L') { if (q.v > q.j) nVg++; else if (q.j > q.v) nJg++; }
  console.log(`L-diff direction: vanilla>js ×${nVg}  js>vanilla ×${nJg}`);
  cells.sort((a, b) => a.y - b.y || a.x - b.x);
  // L 差按 y 行聚合；非 L 差全列
  const lRows = new Map<number, { n: number; xs: number[]; pairs: Record<string, number> }>();
  const nonL: typeof cells = [];
  for (const q of cells) {
    if (q.ch === 'L') {
      const r = lRows.get(q.y) ?? { n: 0, xs: [], pairs: {} };
      r.n++; r.xs.push(q.x);
      const k = `${q.v}>${q.j}`;
      r.pairs[k] = (r.pairs[k] ?? 0) + 1;
      lRows.set(q.y, r);
    } else nonL.push(q);
  }
  console.log(`L-diff rows (${lRows.size}):`);
  for (const [y, r] of [...lRows.entries()].sort((a, b) => a[0] - b[0])) {
    const xs = r.xs.sort((a, b) => a - b);
    // 连续段压缩
    const segs: string[] = [];
    let s0 = xs[0]!, prev = xs[0]!;
    for (const x of xs.slice(1)) { if (x > prev + 1) { segs.push(s0 === prev ? `${s0}` : `${s0}-${prev}`); s0 = x; } prev = x; }
    segs.push(s0 === prev ? `${s0}` : `${s0}-${prev}`);
    console.log(`  y=${y} n=${r.n} ${Object.entries(r.pairs).map(([k, n]) => `${k}×${n}`).join(' ')} x:${segs.join(',')}`);
  }
  console.log(`non-L diff cells (${nonL.length}):`);
  for (const q of nonL) console.log(`  (${q.x},${q.y}) ${q.ch} v${q.v} j${q.j} ${q.extra} | 基座96: t${c.t[q.y * W + q.x]!} a${c.a[q.y * W + q.x]!} l${c.l[q.y * W + q.x]!} lt${c.lt[q.y * W + q.x]!} sl${c.sl[q.y * W + q.x]!}`);
}, 300_000);
