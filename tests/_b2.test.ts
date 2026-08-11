import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass, runBeachesPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass, runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runRocksAndClayPass, runCavesPass } from '../src/world/gen/vanilla/CavesPass';

it('beach clean diff', () => {
  const cs = readFileSync('/tmp/cs-act5.bin');
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
  const st = world.store;
  runDunesPass(st, rng, gs); runOceanSandPass(st, rng, gs);
  runSandPatchesPass(st, rng, gs); runTunnelsPass(st, rng, gs);
  runMountCavesPass(st, rng, gs); runDirtWallBgPass(st, rng, gs);
  runRocksAndClayPass(st, rng, gs); runSmallHolesPass(st, rng, gs); runCavesPass(st, rng, gs);
  runMountainCavesPass(st, rng, gs);
  // 先验证进入 beaches 前全等
  let pre = 0;
  for (let i = 0; i < cs.length; i++) if (cs[i] !== st.flags[i]) pre++;
  runBeachesPass(st, rng, gs);
  let n = 0;
  const samples: string[] = [];
  const rows = new Map<number, number>();
  for (let i = 0; i < cs.length; i++) {
    if (cs[i] !== st.flags[i]) {
      n++;
      const x = i % 4200, y = (i / 4200) | 0;
      rows.set(y, (rows.get(y) ?? 0) + 1);
      if (samples.length < 6) samples.push(`x=${x} y=${y} cs=${cs[i]} js=${st.flags[i]}`);
    }
  }
  console.log(`PRE-DIFF(before beaches): ${pre}`);
  console.log(`POST-DIFF: ${n}`);
  console.log(samples.join(' | '));
  console.log('rows:', [...rows.entries()].sort((a, b) => a[0] - b[0]).slice(0, 5));
});
