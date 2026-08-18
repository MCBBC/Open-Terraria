// 前沿定位：oracle 任意检查点 vs 真实 wld 的天带云族对照（env 门控=SW_PFR=1）
// 天带 y<100：写者=浮空岛(#23)+后续树(#82, trunk 5/323)——滤掉树干后云族可比。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_PFR === '1';
const FILE = process.env.SW_PDUMPF ?? 's111.wld';
const VSRV = process.env.SW_MATRIX_VSRV ?? '/tmp/vserver86';
const GRID = process.env.SW_PFR_G ?? '/tmp/cs-sh26';
const YMAX = Number(process.env.SW_PFR_Y ?? 100);
const CLOUDS = new Set([189, 196, 460, 717, 718, 719]);

(RUN ? it : it.skip)('sky cloud frontier', () => {
  const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${FILE}`)));
  const typ = new Uint16Array(new Uint8Array(readFileSync(`${GRID}.typ`)).buffer);
  const act = new Uint8Array(readFileSync(`${GRID}.act`));
  const W = wld.tilesWide, H = wld.tilesHigh;
  const oSheet = (x: number, y: number) => (act[y * W + x] !== 0 ? typ[y * W + x] : -1);
  const vSheet = (x: number, y: number) => {
    const i = y * W + x;
    return wld.tiles.active[i] === 1 ? wld.tiles.type[i] : -1;
  };
  const cnt = { v: new Map<number, number>(), o: new Map<number, number>() };
  const diffs: Array<[number, number, number, number]> = [];
  for (let y = 0; y < YMAX; y++) {
    for (let x = 0; x < W; x++) {
      const v = vSheet(x, y), o = oSheet(x, y);
      if (CLOUDS.has(v)) cnt.v.set(v, (cnt.v.get(v) ?? 0) + 1);
      if (CLOUDS.has(o)) cnt.o.set(o, (cnt.o.get(o) ?? 0) + 1);
      if (CLOUDS.has(o) !== CLOUDS.has(v) || (CLOUDS.has(o) && o !== v)) diffs.push([x, y, o, v]);
    }
  }
  console.log(`y<${YMAX} 云族: vanilla=${[...cnt.v.entries()]} oracle=${[...cnt.o.entries()]}`);
  console.log(`云族差格=${diffs.length}`);
  // x 聚类（岛屿位置）
  const byX = new Map<number, number>();
  for (const [x] of diffs) byX.set(x, (byX.get(x) ?? 0) + 1);
  const xs = [...byX.keys()].sort((a, b) => a - b);
  const groups: Array<[number, number]> = [];
  for (const x of xs) {
    const last = groups[groups.length - 1];
    if (last && x - last[1] <= 12) last[1] = x;
    else groups.push([x, x]);
  }
  console.log('差格 x 群组:', groups.map(([a, b]) => `[${a}-${b}]×${(function (s = 0) { for (const [x] of diffs) if (x >= a && x <= b) s++; return s; })()}`).join(' '));
  console.log('样例:', diffs.slice(0, 12).map(([x, y, o, v]) => `(${x},${y})${o}>${v}`).join(' '));
}, 120_000);
