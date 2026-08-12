import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runRocksAndClayPass, runCavesPass } from '../src/world/gen/vanilla/CavesPass';
import { runIceBiomePass } from '../src/world/gen/vanilla/IceBiomePass';
import { runGrassPass } from '../src/world/gen/vanilla/GrassPass';
import { runJunglePass } from '../src/world/gen/vanilla/JunglePass';
import { runMudCavesPass } from '../src/world/gen/vanilla/Spread';
import { runDesertMoundOnly, runDesertEntrancesAndHive } from '../src/world/gen/vanilla/DesertPass';
import { runMushroomPass } from '../src/world/gen/vanilla/MushroomPass';
import { runMarblePass, runGranitePass } from '../src/world/gen/vanilla/MarbleGranitePass';
import { runFloatingIslandsPass } from '../src/world/gen/vanilla/StructuresPass';
import { runDirtToMudPass, runSiltPass } from '../src/world/gen/vanilla/DirtToMudPass';
import { runShiniesPass } from '../src/world/gen/vanilla/ShiniesPass';
import { runWebsPass } from '../src/world/gen/vanilla/WebsPass';
import { runUnderworldPass } from '../src/world/gen/vanilla/UnderworldPass';
import { runCorruptionPass, __crDump } from '../src/world/gen/vanilla/CorruptionPass';
import { runLakesPass } from '../src/world/gen/vanilla/LakesPass';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

it('diag lakes', () => {
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
  const st = world.store;
  runDunesPass(st, rng, gs); runOceanSandPass(st, rng, gs); runSandPatchesPass(st, rng, gs);
  runTunnelsPass(st, rng, gs); runMountCavesPass(st, rng, gs); runDirtWallBgPass(st, rng, gs);
  runRocksAndClayPass(st, rng, gs); runSmallHolesPass(st, rng, gs); runCavesPass(st, rng, gs);
  runIceBiomePass(st, rng, gs); runGrassPass(st, rng, gs); runJunglePass(st, rng, gs);
  runMudCavesPass(st, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!);
  const desc = runDesertMoundOnly(st, rng, gs);
  runDesertEntrancesAndHive(st, rng, gs, desc);
  runMushroomPass(st, rng, gs); runMarblePass(st, rng, gs); runGranitePass(st, rng, gs);
  runFloatingIslandsPass(st, rng, gs); runDirtToMudPass(st, rng, gs); runSiltPass(st, rng, gs);
  runShiniesPass(st, rng, gs); runWebsPass(st, rng, gs); runUnderworldPass(st, rng, gs);
  runCorruptionPass(st, rng, gs); writeFileSync('/tmp/js-cc.txt', __crDump()); runLakesPass(st, rng, gs);
  const V = (t: number) => TILE_DEFS[t]?.vanilla?.sheet ?? 0;
  const cs = readFileSync('/tmp/cs-lakes.txt', 'utf8').split(';');
  let n = 0; const pat = new Map<string, number>();
  for (let y = 0; y < st.h; y++) {
    for (let xi = 0; xi < Math.floor(st.w / 3); xi++) {
      const x = xi * 3;
      const k = st.idx(x, y);
      const js = `${st.flags[k] ? V(st.type[k]) : 0}`;
      const ci = y * Math.floor(st.w / 3) + xi;
      if (cs[ci] !== undefined && cs[ci] !== js) {
        if (n < 6) console.log(`diff @(${x},${y}) cs=${cs[ci]} js=${js}`);
        n++;
        const key = `cs=${cs[ci]} js=${js}`;
        pat.set(key, (pat.get(key) ?? 0) + 1);
      }
    }
  }
  console.log('total', n, [...pat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6));
}, 300000);
