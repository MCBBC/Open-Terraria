// 一次性差异定位探针（env 门控）：JS generateWorld ↔ /tmp/vserver86 对拍，
// 针对指定差异族（wal62 / typ25 / typ28 等）输出 y 直方图 + x 聚类 + 连通块清单。
// 用法：SW_DF=62,25,28 SW_DF_SEED=111 npx vitest run tools/_difffind.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import type { World } from '../src/world/World';

const MODE = process.env.SW_DF ?? '';
const RUN = MODE !== '' && MODE !== '0';
const SEED = process.env.SW_DF_SEED ?? '111';
const SIZE = (process.env.SW_DF_SIZE ?? 's') as 's' | 'm' | 'l';
const VSRV = process.env.SW_DF_VSRV ?? '/tmp/vserver86';
const OUT = process.env.SW_DF_OUT ?? '/tmp/difffind.json';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-2);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const SIZE_ID: Record<string, 0 | 1 | 2> = { s: 0, m: 1, l: 2 };

function clusters(cells: Array<[number, number]>, w: number): Array<{ x0: number; x1: number; y0: number; y1: number; n: number }> {
  // 简单网格聚类：32 列桶内合并
  const m = new Map<number, { x0: number; x1: number; y0: number; y1: number; n: number }>();
  for (const [x, y] of cells) {
    const b = (x / 48) | 0;
    let e = m.get(b);
    if (!e) { e = { x0: x, x1: x, y0: y, y1: y, n: 0 }; m.set(b, e); }
    e.n++; e.x0 = Math.min(e.x0, x); e.x1 = Math.max(e.x1, x);
    e.y0 = Math.min(e.y0, y); e.y1 = Math.max(e.y1, y);
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}

(RUN ? it : it.skip)('difffind', async () => {
  const fams = MODE.split(',').map((s) => s.trim()).filter(Boolean);
  const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/s${SEED}.wld`)));
  const dims = SIZE_DIMS[SIZE_ID[SIZE]];
  const world: World = await generateWorld({
    size: SIZE_ID[SIZE], width: dims.width, height: dims.height,
    seedText: SEED, evil: 0,
  });
  const st = world.store;
  const w = wld.tilesWide, h = wld.tilesHigh;
  const gl = Math.floor(wld.groundLevel), rl = Math.floor(wld.rockLevel), hellTop = h - 200;
  console.log(`w=${w} h=${h} gl=${gl} rl=${rl} hellTop=${hellTop}`);
  const report: Record<string, unknown> = { w, h, gl, rl, hellTop, fams: {} };
  for (const fam of fams) {
    const isWall = fam.startsWith('w');
    const id = Number(fam.replace(/^w/, ''));
    const av: Array<[number, number]> = [];   // vanilla 有 / js 无
    const ja: Array<[number, number]> = [];   // js 有 / vanilla 无
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const i = y * w + x;
        let v: number, j: number;
        if (isWall) { v = wld.tiles.wall[i]; j = st.wall[i]; }
        else {
          v = wld.tiles.active[i] === 1 ? wld.tiles.type[i] : -1;
          const jt = st.type[i];
          j = jt !== 0 ? (SHEET[jt] >= 0 ? SHEET[jt] : -2) : -1;
        }
        if (v === id && j !== id) av.push([x, y]);
        else if (j === id && v !== id) ja.push([x, y]);
      }
    }
    const yHist = new Map<number, number>();
    for (const [, y] of av) yHist.set(y, (yHist.get(y) ?? 0) + 1);
    const yTop = [...yHist.entries()].sort((a, b) => a[0] - b[0]);
    const band = (y: number) => y < gl - 60 ? 'sky' : y < rl ? 'surface' : y < rl + ((hellTop - rl) >> 1) ? 'cave' : y < hellTop ? 'deep' : 'hell';
    const bandN = (arr: Array<[number, number]>) => {
      const m: Record<string, number> = {};
      for (const [, y] of arr) { const b = band(y); m[b] = (m[b] ?? 0) + 1; }
      return m;
    };
    console.log(`\n===== ${fam}（id=${id}）：v独有=${av.length} j独有=${ja.length} =====`);
    console.log(`  v独有 带分布=${JSON.stringify(bandN(av))}`);
    console.log(`  j独有 带分布=${JSON.stringify(bandN(ja))}`);
    console.log(`  v独有 y范围=[${av.length ? Math.min(...av.map((c) => c[1])) : '-'},${av.length ? Math.max(...av.map((c) => c[1])) : '-'}]`);
    const cav = clusters(av, w).slice(0, 12);
    const cja = clusters(ja, w).slice(0, 12);
    console.log(`  v独有 x聚类(48列桶 top12): ${cav.map((c) => `[${c.x0}-${c.x1}]y[${c.y0}-${c.y1}]n${c.n}`).join(' ')}`);
    console.log(`  j独有 x聚类(48列桶 top12): ${cja.map((c) => `[${c.x0}-${c.x1}]y[${c.y0}-${c.y1}]n${c.n}`).join(' ')}`);
    // y 直方图（按 20 行桶，取非零）
    const yb = new Map<number, number>();
    for (const [, y] of av) { const b = (y / 20) | 0; yb.set(b, (yb.get(b) ?? 0) + 1); }
    const ybj = new Map<number, number>();
    for (const [, y] of ja) { const b = (y / 20) | 0; ybj.set(b, (ybj.get(b) ?? 0) + 1); }
    console.log(`  y直方图(20行桶) v独有: ${[...yb.entries()].sort((a, b) => a[0] - b[0]).map(([b, n]) => `${b * 20}:${n}`).join(' ')}`);
    console.log(`  y直方图(20行桶) j独有: ${[...ybj.entries()].sort((a, b) => a[0] - b[0]).map(([b, n]) => `${b * 20}:${n}`).join(' ')}`);
    report.fams[fam] = { av: av.length, ja: ja.length, vClusters: cav, jClusters: cja };
  }
  writeFileSync(OUT, JSON.stringify(report));
  console.log(`\n已写 ${OUT}`);
}, 600_000);
