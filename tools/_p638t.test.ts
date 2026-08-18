// 定点区域双Dump（env 门控=SW_PDUMP=1）：SW_PDUMP_X0/Y0/X1/Y1 矩形 v/j tile 对照
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_PDUMP === '1';
const FILE = process.env.SW_PDUMPF ?? 's111.wld';
const SEED = process.env.SW_PDUMPS ?? '111';
const VSRV = process.env.SW_MATRIX_VSRV ?? '/tmp/vserver86';
const X0 = Number(process.env.SW_PDUMP_X0 ?? 1340), Y0 = Number(process.env.SW_PDUMP_Y0 ?? 285);
const X1 = Number(process.env.SW_PDUMP_X1 ?? 1360), Y1 = Number(process.env.SW_PDUMP_Y1 ?? 300);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('rect dump', async () => {
  const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${FILE}`)));
  const world = await generateWorld({ size: 0, width: SIZE_DIMS[0].width, height: SIZE_DIMS[0].height, seedText: SEED, evil: 0 });
  const st = world.store;
  const w = wld.tilesWide;
  const vSheet = (x: number, y: number) => {
    const i = y * w + x;
    return wld.tiles.active[i] === 1 ? wld.tiles.type[i] : -1;
  };
  const jSheet = (x: number, y: number) => {
    const i = st.idx(x, y);
    return st.flags[i] ? SHEET[st.type[i]] : -1;
  };
  const vWall = (x: number, y: number) => wld.tiles.wall[y * w + x];
  const jWall = (x: number, y: number) => st.wall[st.idx(x, y)];
  console.log(`矩形 [${X0},${Y0}]-[${X1},${Y1}]（v | j | 差标记）`);
  for (let y = Y0; y <= Y1; y++) {
    let line = `${String(y).padStart(4)} `;
    const marks: string[] = [];
    for (let x = X0; x <= X1; x++) {
      const v = vSheet(x, y), j = jSheet(x, y);
      const vv = v === -1 ? ' .' : String(v).padStart(3);
      const jj = j === -1 ? ' .' : String(j).padStart(3);
      line += `${vv}|${jj} `;
      if (v !== j) marks.push(`x${x}:v${v}/j${j}`);
    }
    console.log(line + (marks.length ? '   << ' + marks.join(' ') : ''));
  }
  console.log('墙差:');
  for (let y = Y0; y <= Y1; y++) {
    const marks: string[] = [];
    for (let x = X0; x <= X1; x++) if (vWall(x, y) !== jWall(x, y)) marks.push(`x${x}:w${vWall(x, y)}/${jWall(x, y)}`);
    if (marks.length) console.log(`y${y}: ` + marks.join(' '));
  }
}, 600_000);
