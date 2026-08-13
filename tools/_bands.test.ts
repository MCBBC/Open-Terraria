import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
it('band medians: ours num4 vs vanilla realized', () => {
  const g = parseWld(new Uint8Array(readFileSync('/tmp/vserver/s9293480.wld'))).tiles;
  const trace = readFileSync('/tmp/cols_all.csv', 'utf-8').trim().split('\n')
    .map((l) => l.split(',').map(Number));
  for (let b = 0; b < 21; b++) {
    const x0 = b * 200, x1 = x0 + 200;
    const ours: number[] = [], van: number[] = [];
    for (let x = x0; x < x1; x++) {
      ours.push(trace[x][4]);
      let first = -1, run = 0;
      for (let y = 200; y < 700; y++) {
        const i = y * 4200 + x;
        if (g.active[i] && g.type[i] === 1) { if (first < 0) first = y; run++; }
        else { if (first >= 0 && run >= 8) break; first = -1; run = 0; }
      }
      if (first >= 0) van.push(first);
    }
    const med = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : -1; };
    console.log(`band${b} [${x0}-${x1}): ours=${med(ours).toFixed(0)} vanilla=${med(van)} (n=${van.length})`);
  }
});
