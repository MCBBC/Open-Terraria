// 定点区域 191/192/185/187 差格分布（env 门控=SW_PDIFF=1）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_PDIFF === '1';
const FILE = process.env.SW_PDUMPF ?? 's111.wld';
const SEED = process.env.SW_PDUMPS ?? '111';
const VSRV = process.env.SW_MATRIX_VSRV ?? '/tmp/vserver86';
const X0 = Number(process.env.SW_PDIFF_X0 ?? 940), Y0 = Number(process.env.SW_PDIFF_Y0 ?? 200);
const X1 = Number(process.env.SW_PDIFF_X1 ?? 1120), Y1 = Number(process.env.SW_PDIFF_Y1 ?? 460);
const FAM = (process.env.SW_PDIFF_T ?? '191,192,185,187').split(',').map(Number);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('region family diff cells', async () => {
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
  const cnt = { v: new Map<number, number>(), j: new Map<number, number>() };
  const vOnly: Array<[number, number, number, number]> = [];  // x, y, vType, jType
  const jOnly: Array<[number, number, number, number]> = [];
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      const v = vSheet(x, y), j = jSheet(x, y);
      if (FAM.includes(v)) cnt.v.set(v, (cnt.v.get(v) ?? 0) + 1);
      if (FAM.includes(j)) cnt.j.set(j, (cnt.j.get(j) ?? 0) + 1);
      if (FAM.includes(v) && !FAM.includes(j)) vOnly.push([x, y, v, j]);
      if (!FAM.includes(v) && FAM.includes(j)) jOnly.push([x, y, v, j]);
    }
  }
  console.log(`区域 [${X0},${Y0}]-[${X1},${Y1}] 族${FAM}`);
  console.log('v 计数:', [...cnt.v.entries()]);
  console.log('j 计数:', [...cnt.j.entries()]);
  const sig = (list: Array<[number, number, number, number]>) => {
    const m = new Map<string, number>();
    for (const [x, y, v, j] of list) {
      const k = `t${v}->j${j}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  };
  console.log('仅v差格签名:', sig(vOnly), '样例:', vOnly.slice(0, 15).map(([x, y, v, j]) => `(${x},${y})${v}>${j}`).join(' '));
  console.log('仅j差格签名:', sig(jOnly), '样例:', jOnly.slice(0, 15).map(([x, y, v, j]) => `(${x},${y})${v}>${j}`).join(' '));
  // y 分布直方
  const yh = (list: Array<[number, number, number, number]>) => {
    const m = new Map<number, number>();
    for (const [, y] of list) m.set(y, (m.get(y) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0] - b[0]).slice(0, 20);
  };
  console.log('仅v y直方:', yh(vOnly));
  console.log('仅j y直方:', yh(jOnly));
}, 600_000);
