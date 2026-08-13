import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
it('stone boundary cols 0-24 (server wld)', () => {
  const g = parseWld(new Uint8Array(readFileSync('/tmp/vserver/s9293480.wld'))).tiles;
  for (let x = 0; x < 25; x++) {
    let first = -1;
    for (let y = 0; y < 600; y++) {
      const i = y * 4200 + x;
      if (g.active[i] && g.type[i] === 1) { if (first < 0) first = y; }
      else if (first >= 0 && g.active[i] && g.type[i] === 0) { /* dirt interruption */ }
    }
    process.stdout.write(`${x}:${first} `);
  }
  console.log();
});
