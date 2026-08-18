// IIII 批 #64 诊断④：golden64 宝石墙腔清点 + 流移位暴力搜索（vanilla site#1 落点）。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_IIII64 === '2';
const G2 = '/tmp/sw-slp/g';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const b16 = (idx: number, e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));
const b8 = (idx: number, e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));

(RUN ? it : it.skip)('iiii64b', async () => {
  const w4 = b16(64, 'wal');
  // 腔清点（4 连通）
  const seen = new Uint8Array(N);
  const cavities: Array<{ cells: number[]; seed: [number, number] }> = [];
  for (let i = 0; i < N; i++) {
    const wv = w4[i]!;
    if (!(wv >= 48 && wv <= 53) || seen[i]) continue;
    const cells: number[] = [];
    const st2 = [i];
    seen[i] = 1;
    while (st2.length) {
      const c = st2.pop()!;
      cells.push(c);
      const x = c % W, y = (c / W) | 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const j = ny * W + nx;
        const wj = w4[j]!;
        if ((wj >= 48 && wj <= 53) && !seen[j]) { seen[j] = 1; st2.push(j); }
      }
    }
    cells.sort((p, q) => p - q);
    cavities.push({ cells, seed: [cells[0]! % W, (cells[0]! / W) | 0] });
  }
  cavities.sort((p, q) => q.cells.length - p.cells.length);
  console.log(`golden64 gem-wall cavities: ${cavities.length}`);
  for (const c of cavities) console.log(`  size=${c.cells.length} min=(${c.seed[0]},${c.seed[1]})`);
  // site#0 腔 (2938,796) 的 99 格 vs JS 写集：逐格找 JS 漏掉的 10 格,并 dump 其邻域 base 态
  const t = b16(63, 'typ'), a = b8(63, 'act'), wl = b16(63, 'wal'), hf = b8(63, 'half'), sl = b8(63, 'slope');
  const cav = cavities.find((c) => c.cells.length === 99)!;
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
  const cellSet = new Set(cav.cells);
  for (const i of cav.cells) {
    const x = i % W, y = (i / W) | 0;
    // 找腔内"渡口"格：其 base 态与邻接关系——全腔 dump（99 行）
    console.log(`  C(${x},${y}) w4=${w4[i]} base[a=${a[i]} t=${t[i]} wall=${wl[i]} hf=${hf[i]} sl=${sl[i]}]`);
  }
  // JS 写集（重放 site#0 腔的 89 格——由 _wwwrep 前 probe 已知 JS 只写 89）：
  // 直接重跑 JS spread 采集其写集,对照 99 格求差集
  const TileStore = (await import('../src/world/TileStore')).TileStore;
  const { restoreGenSolid } = await import('../src/world/gen/vanilla/GenSolid');
  const { runGemCavesPass } = await import('../src/world/gen/vanilla/GemPasses');
  const BDIR = '/tmp/www-b';
  const lq = b8(63, 'liq'), lt = b8(63, 'lty');
  const gs = JSON.parse(readFileSync(`${BDIR}/s18/gs.json`, 'utf8'));
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s18/gensolid.json`, 'utf8')));
  const fw = new Uint32Array(readFileSync(`${BDIR}/s18/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N);
  for (let q = 0; q < fw.length; q += 4) { fx[fw[q]!] = fw[q + 1]!; fy[fw[q]!] = fw[q + 2]!; }
  const ids35 = new Map<number, number>();
  const iw = new Uint32Array(readFileSync(`${BDIR}/s18/ids35.bin`).buffer.slice(0));
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = a[i]!;
    st.flags[i] = act;
    let id = 0;
    if (act || t[i]) {
      id = ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== t[i]) id = REV.get(t[i]!) ?? 0;
    }
    st.type[i] = id;
    st.wall[i] = wl[i]!;
    st.liquid[i] = lq[i]!;
    st.liquidType[i] = lq[i] ? lt[i]! + 1 : 0;
    st.frameX[i] = fx[i]; st.frameY[i] = fy[i];
    st.half[i] = hf[i]!; st.slope[i] = sl[i]!;
  }
  restoreGenSolid(gensolid);
  const beforeW = st.wall.slice();
  runGemCavesPass(st, new RNG(SEED), gs);
  const jsWrites: number[] = [];
  for (let i = 0; i < N; i++) if (st.wall[i] !== beforeW[i]) jsWrites.push(i);
  const jsSet = new Set(jsWrites);
  console.log(`JS total wall writes: ${jsWrites.length}`);
  const missIn = cav.cells.filter((i) => !jsSet.has(i));
  console.log(`cavity99 cells missing from JS writes: ${missIn.length}`);
  for (const i of missIn) {
    const x = i % W, y = (i / W) | 0;
    const nb: string[] = [];
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const j = (y + dy) * W + (x + dx);
      nb.push(`(${x + dx},${y + dy}): base[a=${a[j]} t=${t[j]} w=${wl[j]}] w4=${w4[j]} jsW=${jsSet.has(j) ? st.wall[j] : '-'}`);
    }
    console.log(`  M(${x},${y}) base[a=${a[i]} t=${t[i]} w=${wl[i]} hf=${hf[i]} sl=${sl[i]}] w4=${w4[i]} || ${nb.join(' | ')}`);
  }
  console.log('--- cavity boundary cells (4-neighbors outside cavity) ---');
  const bset = new Set<number>();
  for (const i of cav.cells) {
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const j = (y + dy) * W + (x + dx);
      if (!cellSet.has(j)) bset.add(j);
    }
  }
  for (const j of [...bset].sort((p, q) => p - q)) {
    const x = j % W, y = (j / W) | 0;
    console.log(`  B(${x},${y}) w4=${w4[j]} base[a=${a[j]} t=${t[j]} wall=${wl[j]} hf=${hf[j]} sl=${sl[j]}]`);
  }
}, 560_000);
