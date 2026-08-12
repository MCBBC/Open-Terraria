// 临时诊断（跑完即删）
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
import { runUnderworldPass, __uwWinDump, __pillarWins } from '../src/world/gen/vanilla/UnderworldPass';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

it('diag uw', () => {
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
  const V = (t: number) => TILE_DEFS[t]?.vanilla?.sheet ?? 0;
  writeFileSync('/tmp/js-w.txt', __uwWinDump());
  writeFileSync('/tmp/js-pw.txt', __pillarWins());
  {
    let m = '';
    for (let y2 = 900; y2 <= 1110; y2++) {
      for (let x2 = 25; x2 < 714; x2++) {
        const k2 = st.idx(x2, y2);
        m += st.flags[k2] && V(st.type[k2]) === 633 ? '1' : '0';
      }
      m += '\n';
    }
    writeFileSync('/tmp/js-633.txt', m);
  }
  const cs = readFileSync('/tmp/cs-uw.txt', 'utf8').split('\n');
  let n = 0; const pat = new Map<string, number>();
  for (let y = 900; y < 1200; y++) {
    const row = cs[y - 900]?.split(';') ?? [];
    for (let xi = 0; xi < row.length; xi++) {
      const x = xi * 5;
      if (x >= st.w) break;
      const k = st.idx(x, y);
      const js = `${st.flags[k] ? V(st.type[k]) : 0},${st.wall[k]},${st.liquid[k]}`;
      if (row[xi] !== '' && row[xi] !== undefined && row[xi] !== js) {
        if (n < 6) console.log(`diff @(${x},${y}) cs=${row[xi]} js=${js}`);
        n++;
        const key = `cs=${row[xi].split(',')[0]},${row[xi].split(',')[1]},${row[xi].split(',')[2]} js=${js}`;
        pat.set(key, (pat.get(key) ?? 0) + 1);
      }
    }
  }
  console.log('total', n, [...pat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6));
}, 300000);
