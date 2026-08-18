// oracle livingtrees 检查点 vs 真实服务器 wld 族差格逐点对照（env 门控=SW_POV=1）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_POV === '1';
const FILE = process.env.SW_PDUMPF ?? 's111.wld';
const VSRV = process.env.SW_MATRIX_VSRV ?? '/tmp/vserver86';
const GRID = process.env.SW_POV_G ?? '/tmp/cs-lt';
const X0 = Number(process.env.SW_POV_X0 ?? 940), Y0 = Number(process.env.SW_POV_Y0 ?? 200);
const X1 = Number(process.env.SW_POV_X1 ?? 1120), Y1 = Number(process.env.SW_POV_Y1 ?? 460);
const FAM = (process.env.SW_POV_T ?? '191,192').split(',').map(Number);

(RUN ? it : it.skip)('oracle vs vanilla family cells', () => {
  const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${FILE}`)));
  const typ = new Uint16Array(new Uint8Array(readFileSync(`${GRID}.typ`)).buffer);
  const act = new Uint8Array(readFileSync(`${GRID}.act`));
  const W = wld.tilesWide;
  const oSheet = (x: number, y: number) => (act[y * W + x] !== 0 ? typ[y * W + x] : -1);
  const vSheet = (x: number, y: number) => {
    const i = y * W + x;
    return wld.tiles.active[i] === 1 ? wld.tiles.type[i] : -1;
  };
  let famV = 0, famO = 0;
  const oOnly: Array<[number, number, number, number]> = [];
  const vOnly: Array<[number, number, number, number]> = [];
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      const v = vSheet(x, y), o = oSheet(x, y);
      if (FAM.includes(v)) famV++;
      if (FAM.includes(o)) famO++;
      if (FAM.includes(o) && !FAM.includes(v)) oOnly.push([x, y, o, v]);
      if (!FAM.includes(o) && FAM.includes(v)) vOnly.push([x, y, v, o]);
    }
  }
  console.log(`区域[${X0},${Y0}]-[${X1},${Y1}] 族${FAM}: vanilla=${famV} oracle=${famO}`);
  console.log(`仅oracle=${oOnly.length} 仅vanilla=${vOnly.length}`);
  const sig = (l: Array<[number, number, number, number]>) => {
    const m = new Map<string, number>();
    for (const [, , a, b] of l) m.set(`${a}>${b}`, (m.get(`${a}>${b}`) ?? 0) + 1);
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
  };
  console.log('仅oracle签名(o>v):', sig(oOnly));
  console.log('  样例:', oOnly.slice(0, 20).map(([x, y, o, v]) => `(${x},${y})${o}>${v}`).join(' '));
  console.log('仅vanilla签名(v>o):', sig(vOnly));
  console.log('  样例:', vOnly.slice(0, 20).map(([x, y, v, o]) => `(${x},${y})${v}>${o}`).join(' '));
}, 120_000);
