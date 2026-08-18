// 差格 vs 存在格的墙/邻域对照（env 门控=SW_PW=1）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_PW === '1';
const FILE = process.env.SW_PDUMPF ?? 's111.wld';
const VSRV = process.env.SW_MATRIX_VSRV ?? '/tmp/vserver86';
const GRID = process.env.SW_POV_G ?? '/tmp/cs-fin';

const MISS: Array<[number, number]> = [[1085,214],[1070,216],[1069,217],[1068,219],[1067,220],[1066,222],[1064,225],[1064,226],[1063,228]];
const HAVE: Array<[number, number]> = [[1072,215],[1071,216],[1074,214],[1075,214],[1076,213],[1079,213],[1086,215]];

(RUN ? it : it.skip)('wall neighborhood compare', () => {
  const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${FILE}`)));
  const W = wld.tilesWide;
  const info = (x: number, y: number) => {
    const i = y * W + x;
    return `(${x},${y}) t=${wld.tiles.active[i] ? wld.tiles.type[i] : -1} w=${wld.tiles.wall[i]}`;
  };
  console.log('vanilla 缺失格（chain 有叶 vanilla 无）:');
  for (const [x, y] of MISS) console.log('  ' + info(x, y) + '  邻: ' + [-1, 0, 1].map((dx) => wld.tiles.wall[y * W + x + dx]).join(','));
  console.log('vanilla 存在格（双侧都有叶）:');
  for (const [x, y] of HAVE) console.log('  ' + info(x, y) + '  邻: ' + [-1, 0, 1].map((dx) => wld.tiles.wall[y * W + x + dx]).join(','));
}, 120_000);
