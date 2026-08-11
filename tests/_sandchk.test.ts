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
  const bad: string[] = [];
  for (let i = 0; i < prof.length; i++) {
    if (prof[i] !== cs[i] && bad.length < 10) bad.push(`x=${2300 + i}: js=${prof[i]} cs=${cs[i]}`);
  }
  console.log(bad.length ? bad.join('  ') : 'ALL MATCH');
});
