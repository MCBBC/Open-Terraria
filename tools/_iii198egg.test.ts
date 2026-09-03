// IIII198: 扫 JS 槽末#39（染料植物）快照里的 752 蛋位簇 + 227/656 分布，对 x86 金标蛋位。
// 用法：cd game && npx vitest run tools/_iii198egg.test.ts   （零主路径改动，一次性仪）
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const DIR = process.env.SW_I198_JS ?? '/tmp/iii198-out/js-slot84';
const W = Number(process.env.SW_I198_W ?? 4200), H = Number(process.env.SW_I198_H ?? 1200);

it('iii198 egg scan', () => {
  if (!existsSync(`${DIR}/base_type.bin`)) { console.log('[i198] no snapshot, skip'); return; }
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const type = new Uint16Array(readFileSync(`${DIR}/base_type.bin`).buffer);
  const flags = new Uint8Array(readFileSync(`${DIR}/base_flags.bin`).buffer);
  const wall = new Uint16Array(readFileSync(`${DIR}/base_wall.bin`).buffer);
  const targets = new Set((process.env.SW_I198_T ?? '752,656,227').split(',').map(Number));
  const hits: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if ((flags[i] & 1) && targets.has(SHEET[type[i]])) hits.push(i);
  }
  // JS TileStore idx: check src/world/TileStore idx() convention — assume x + y*W
  // (verify by cluster contiguity; report both if ambiguous)
  const xy = (i: number): [number, number] => [i % W, (i / W) | 0];
  const byType = new Map<number, number[]>();
  for (const i of hits) {
    const t = SHEET[type[i]];
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(i);
  }
  for (const [t, arr] of byType) {
    const used = new Set<number>();
    const clusters: Array<Array<[number, number]>> = [];
    const pts = arr.map(xy);
    for (let p = 0; p < pts.length; p++) {
      if (used.has(p)) continue;
      const q = [p]; used.add(p);
      const cl: Array<[number, number]> = [pts[p]];
      const R = t === 752 ? 4 : 2;
      while (q.length) {
        const [cx, cy] = pts[q.pop()!];
        for (let r = 0; r < pts.length; r++) {
          if (used.has(r)) continue;
          const [dx, dy] = pts[r];
          if (Math.abs(dx - cx) <= R && Math.abs(dy - cy) <= R) { used.add(r); q.push(r); cl.push(pts[r]); }
        }
      }
      clusters.push(cl);
    }
    clusters.sort((a, b) => a[0][0] - b[0][0]);
    console.log(`[i198] sheet ${t}: ${clusters.length} clusters (${arr.length} tiles)`);
    for (const cl of clusters) {
      const xs = cl.map(p => p[0]), ys = cl.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      // ground sample below + wall at cluster
      const [ex, ey] = cl[0];
      console.log(`  n=${cl.length} bbox=(${x0}..${x1},${y0}..${y1}) wall=${wall[ex + ey * W]}`);
    }
  }
});
