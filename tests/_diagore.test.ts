// 临时诊断（跑完即删）：ores checkpoint 全图抽样差分
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
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
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

it('diag ores', () => {
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
  runShiniesPass(st, rng, gs);
  const V = (t: number) => TILE_DEFS[t]?.vanilla?.sheet ?? 0;
  // 与 oracle dump（全图降采样：每 7 列）比对
  const cs = readFileSync('/tmp/cs-ores.txt', 'utf8').split('\n');
  let n = 0; const pat = new Map<string, number>();
  const xs: number[] = [];
  for (let y = 0; y < 1200; y++) {
    const row = cs[y]?.split(';') ?? [];
    for (let xi = 0; xi < row.length; xi++) {
      const x = xi * 7;
      const k = st.idx(x, y);
      const js = `${st.flags[k] ? V(st.type[k]) : 0}`;
      if (row[xi] !== '' && row[xi] !== undefined && row[xi] !== js) {
        if (n < 10) { console.log(`diff @(${x},${y}) cs=${row[xi]} js=${js}`); xs.push(x); }
        n++;
        const key = `cs=${row[xi]} js=${js}`;
        pat.set(key, (pat.get(key) ?? 0) + 1);
      }
    }
  }
  console.log('total', n, [...pat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));
}, 300000);
