import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass, runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runRocksAndClayPass, runCavesPass } from '../src/world/gen/vanilla/CavesPass';

it('mc diff', () => {
  const cs = readFileSync('/tmp/cs-act3.bin');
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
  const st = world.store;
  runDunesPass(st, rng, gs); runOceanSandPass(st, rng, gs);
  runSandPatchesPass(st, rng, gs); runTunnelsPass(st, rng, gs);
  runMountCavesPass(st, rng, gs); runDirtWallBgPass(st, rng, gs);
  runRocksAndClayPass(st, rng, gs); runSmallHolesPass(st, rng, gs); runCavesPass(st, rng, gs);
  runMountainCavesPass(st, rng, gs);
  let n = 0;
  const cols = new Map<number, number>();
  for (let i = 0; i < cs.length && n < 400; i++) {
    if (cs[i] !== st.flags[i]) {
      n++;
      const x = i % 4200;
      cols.set(x, (cols.get(x) ?? 0) + 1);
      if (n <= 8) console.log(`diff x=${x} y=${(i / 4200) | 0} cs=${cs[i]} js=${st.flags[i]}`);
    }
  }
  console.log('total:', n, 'cols:', [...cols.entries()].sort((a, b) => a[0] - b[0]).slice(0, 8));
});
