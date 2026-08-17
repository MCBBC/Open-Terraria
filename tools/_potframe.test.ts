// 陶罐分歧现场取证：vanilla 终态 .wld 里 living-tree 平台 (512-513,224) 的 frameY
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
const RUN = process.env.SW_PARITY === '1';
(RUN ? it : it.skip)('living tree platform frames @9293480 wld', () => {
  const wld = parseWld(new Uint8Array(readFileSync('/tmp/sw-num4/home/9293480.wld')));
  const W = wld.tilesWide;
  for (let y = 218; y <= 228; y++) {
    const row: string[] = [];
    for (let x = 508; x <= 518; x++) {
      const i = y * W + x;
      const t = wld.tiles.type[i], a = wld.tiles.active[i];
      const fy = wld.tiles.frameY ? wld.tiles.frameY[i] : -1;
      row.push(a ? `${t}@${fy}` : '·');
    }
    console.log(`y${y}: ${row.join(' ')}`);
  }
});
