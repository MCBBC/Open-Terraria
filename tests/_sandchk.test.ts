import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { T } from '../src/data/tiles';

it('sand profile', () => {
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
  const st = world.store;
  runDunesPass(st, rng, gs);
  const prof: number[] = [];
  for (let x = 2300; x < 2760; x++) {
    let top = -1;
    for (let y = 0; y < 600; y++) {
      const i = y * 4200 + x;
      if (st.flags[i] && st.type[i] === T.SAND) { top = y; break; }
    }
    prof.push(top);
  }
  writeFileSync('/tmp/js-sand.txt', prof.join(','));
  const cs = readFileSync('/tmp/cs-sand.txt', 'utf8').split(',').map(Number);
  let first = -1;
  for (let i = 0; i < prof.length; i++) {
    if (prof[i] !== cs[i]) { first = i; break; }
  }
  console.log('first diff col:', first >= 0 ? 2300 + first : 'NONE', first >= 0 ? `js=${prof[first]} cs=${cs[first]}` : '');
});
