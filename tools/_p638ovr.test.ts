// oracle 检查点 vs 真实 wld 定点矩形双Dump（env 门控=SW_POVR=1）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_POVR === '1';
const FILE = process.env.SW_PDUMPF ?? 's111.wld';
const VSRV = process.env.SW_MATRIX_VSRV ?? '/tmp/vserver86';
const GRID = process.env.SW_POV_G ?? '/tmp/cs-lt';
const X0 = Number(process.env.SW_POVR_X0 ?? 1060), Y0 = Number(process.env.SW_POVR_Y0 ?? 208);
const X1 = Number(process.env.SW_POVR_X1 ?? 1110), Y1 = Number(process.env.SW_POVR_Y1 ?? 260);

(RUN ? it : it.skip)('oracle vs vanilla rect dump', () => {
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
  for (let y = Y0; y <= Y1; y++) {
    let line = `${String(y).padStart(4)} `;
    const marks: string[] = [];
    for (let x = X0; x <= X1; x++) {
      const v = vSheet(x, y), o = oSheet(x, y);
      line += `${o === -1 ? ' .' : String(o).padStart(3)} `;
      if (v !== o) marks.push(`x${x}:o${o}/v${v}`);
    }
    console.log(line + (marks.length ? '   << ' + marks.join(' ') : ''));
  }
}, 120_000);
