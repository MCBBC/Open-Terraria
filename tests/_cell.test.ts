import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass, runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runRocksAndClayPass, runCavesPass } from '../src/world/gen/vanilla/CavesPass';
import { TILE_DEFS } from '../src/data/tiles';

const V_ID = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sheet = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof sheet === 'number') V_ID[i] = sheet;
}

it('cell states', () => {
  const cs = new Uint16Array(readFileSync('/tmp/cs-typ2.bin').buffer);
  const csa = readFileSync('/tmp/cs-act3.bin');
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
  const st = world.store;
  const chain = () => {
    runDunesPass(st, rng, gs); runOceanSandPass(st, rng, gs);
    runSandPatchesPass(st, rng, gs); runTunnelsPass(st, rng, gs);
    runMountCavesPass(st, rng, gs); runDirtWallBgPass(st, rng, gs);
    runRocksAndClayPass(st, rng, gs); runSmallHolesPass(st, rng, gs); runCavesPass(st, rng, gs);
  };
  chain();
  for (const [x, y] of [[3006, 288], [3010, 288], [3006, 287], [1325, 288]] as const) {
    const i = y * 4200 + x;
    console.log(`pre  (${x},${y}) jsAct=${st.flags[i]} jsType=${V_ID[st.type[i]]} csTyp2=${cs[i]}(act2 见 cs-act2 缺) csAct3=${csa[i]}`);
  }
  runMountainCavesPass(st, rng, gs);
  for (const [x, y] of [[3006, 288], [3010, 288], [3006, 287], [1325, 288]] as const) {
    const i = y * 4200 + x;
    console.log(`post (${x},${y}) jsAct=${st.flags[i]} csAct3=${csa[i]}`);
  }
});
