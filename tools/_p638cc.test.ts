// 638/192/5/57 残余差异 CC 聚类探针（env 门控=SW_P638CC=1）
// 对目标族做连通域聚类（4邻），输出每簇 bounding box + 格数 + 中心，两侧对照。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_P638CC === '1';
const FILE = process.env.SW_P638CCF ?? 's111.wld';
const SEED = process.env.SW_P638CCS ?? '111';
const VSRV = process.env.SW_MATRIX_VSRV ?? '/tmp/vserver86';
const FAM = (process.env.SW_P638CCT ?? '191,192').split(',').map(Number);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface CC { x0: number; y0: number; x1: number; y1: number; cells: number; cx: number; cy: number }

function clusters(w: number, h: number, hit: (i: number) => boolean): CC[] {
  const seen = new Uint8Array(w * h);
  const out: CC[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !hit(i)) continue;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, cells = 0, sx = 0, sy = 0;
    stack.length = 0; stack.push(i); seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % w, y = (j / w) | 0;
      cells++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && !seen[j - 1] && hit(j - 1)) { seen[j - 1] = 1; stack.push(j - 1); }
      if (x < w - 1 && !seen[j + 1] && hit(j + 1)) { seen[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && !seen[j - w] && hit(j - w)) { seen[j - w] = 1; stack.push(j - w); }
      if (y < h - 1 && !seen[j + w] && hit(j + w)) { seen[j + w] = 1; stack.push(j + w); }
    }
    out.push({ x0, y0, x1, y1, cells, cx: sx / cells, cy: sy / cells });
  }
  return out;
}

(RUN ? it : it.skip)('638 family CC dump', async () => {
  const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${FILE}`)));
  const w = wld.tilesWide, h = wld.tilesHigh;
  const world = await generateWorld({ size: 0, width: SIZE_DIMS[0].width, height: SIZE_DIMS[0].height, seedText: SEED, evil: 0 });
  const st = world.store;
  const vSheet = (i: number) => (wld.tiles.active[i] === 1 ? wld.tiles.type[i] : -1);
  const jSheet = (i: number) => (st.type[i] !== 0 ? SHEET[st.type[i]] : -1);
  const vc = clusters(w, h, (i) => FAM.includes(vSheet(i)));
  const jc = clusters(w, h, (i) => FAM.includes(jSheet(i)));
  console.log(`家族 ${FAM}: 簇数 vanilla=${vc.length} js=${jc.length} 格数 v=${vc.reduce((a, c) => a + c.cells, 0)} j=${jc.reduce((a, c) => a + c.cells, 0)}`);
  const fmt = (c: CC) => `bbox[${c.x0},${c.y0}-${c.x1},${c.y1}] w=${c.x1 - c.x0 + 1} h=${c.y1 - c.y0 + 1} cells=${c.cells} c=(${c.cx.toFixed(0)},${c.cy.toFixed(0)})`;
  console.log('\nvanilla 簇（按 cells 降序 top12）:');
  for (const c of [...vc].sort((a, b) => b.cells - a.cells).slice(0, 12)) console.log('  ' + fmt(c));
  console.log('\njs 簇（按 cells 降序 top12）:');
  for (const c of [...jc].sort((a, b) => b.cells - a.cells).slice(0, 12)) console.log('  ' + fmt(c));
}, 600_000);
