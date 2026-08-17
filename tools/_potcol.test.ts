import { it } from 'vitest';
const RUN = process.env.SW_POTCOL === '1';
import { readFileSync } from 'node:fs';
const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200;
(RUN ? it : it.skip)('col 3896 pots', () => {
  const tIn = new Uint16Array(readFileSync(`${VG}/070_Quick_Cleanup.typ`).buffer.slice(0));
  const aIn = readFileSync(`${VG}/070_Quick_Cleanup.act`);
  const tOut = new Uint16Array(readFileSync(`${VG}/071_Pots.typ`).buffer.slice(0));
  const aOut = readFileSync(`${VG}/071_Pots.act`);
  for (const x of [3896, 3895, 3897]) {
    const rows: string[] = [];
    for (let y = 300; y < 1200; y++) {
      const i = y * W + x;
      if (tOut[i] === 28 && aOut[i] && !(tIn[i] === 28 && aIn[i])) rows.push(String(y));
    }
    console.log(`x=${x} vanilla new pots rows: ${rows.join(',') || '-'}`);
  }
}, 60000);
