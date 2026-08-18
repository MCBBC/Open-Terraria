// oracle pre42 输入态 vs 真实 wld 差格（env 门控=SW_PIN=1）——找 LivingTrees 输入差
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_PIN === '1';
const FILE = process.env.SW_PDUMPF ?? 's111.wld';
const VSRV = process.env.SW_MATRIX_VSRV ?? '/tmp/vserver86';
const GRID = process.env.SW_PIN_G ?? '/tmp/cs-pre42';
// 后置 pass 会写的族（42+ 会写：191/192/185/187/15/10/19/304/244墙…82+:5/323, 89+:52/62/528/636/205/638, 71+:28, 86+:3/73/23…）——这些格的差不计
const LATER = new Set([191, 192, 185, 187, 186, 5, 323, 52, 62, 528, 636, 205, 638, 28, 3, 73, 23, 199, 21, 24, 27, 30, 33, 36, 39, 42, 82, 83, 84, 110, 113, 115, 184, 352, 454, 485, 254, 236, 655, 71, 69, 74, 15, 19, 304, 10, 21, 171, 172, 425]);

(RUN ? it : it.skip)('pre42 input diff vs vanilla', () => {
  const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${FILE}`)));
  const typ = new Uint16Array(new Uint8Array(readFileSync(`${GRID}.typ`)).buffer);
  const act = new Uint8Array(readFileSync(`${GRID}.act`));
  const wal = new Uint16Array(new Uint8Array(readFileSync(`${GRID}.wal`)).buffer);
  const W = wld.tilesWide;
  const oSheet = (x: number, y: number) => (act[y * W + x] !== 0 ? typ[y * W + x] : -1);
  const vSheet = (x: number, y: number) => {
    const i = y * W + x;
    return wld.tiles.active[i] === 1 ? wld.tiles.type[i] : -1;
  };
  const X0 = Number(process.env.SW_PIN_X0 ?? 940), Y0 = Number(process.env.SW_PIN_Y0 ?? 200);
  const X1 = Number(process.env.SW_PIN_X1 ?? 1120), Y1 = Number(process.env.SW_PIN_Y1 ?? 340);
  const m = new Map<string, number>();
  const cells: Array<[number, number, number, number]> = [];
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      const v = vSheet(x, y), o = oSheet(x, y);
      if (v === o) continue;
      if (LATER.has(o) || LATER.has(v)) continue;   // 后置 pass 写入族不计
      m.set(`${o}>${v}`, (m.get(`${o}>${v}`) ?? 0) + 1);
      cells.push([x, y, o, v]);
    }
  }
  console.log(`区域[${X0},${Y0}]-[${X1},${Y1}] 排除后置族后差格=${cells.length}`);
  console.log('签名:', [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12));
  console.log('样例:', cells.slice(0, 30).map(([x, y, o, v]) => `(${x},${y})${o}>${v}`).join(' '));
}, 120_000);
