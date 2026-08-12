// 临时诊断（跑完即删）：marble checkpoint 区块 dump 与 /tmp/cs-mb.txt 对比
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
import { runMarblePass } from '../src/world/gen/vanilla/MarbleGranitePass';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

it('diag marble', () => {
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
  const st = world.store;
  runDunesPass(st, rng, gs); runOceanSandPass(st, rng, gs); runSandPatchesPass(st, rng, gs);
  runTunnelsPass(st, rng, gs); runMountCavesPass(st, rng, gs); runDirtWallBgPass(st, rng, gs);
  runRocksAndClayPass(st, rng, gs); runSmallHolesPass(st, rng, gs); runCavesPass(st, rng, gs);
  runIceBiomePass(st, rng, gs); runGrassPass(st, rng, gs); runJunglePass(st, rng, gs);
  runMudCavesPass(st, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!);
  const desc = runDesertMoundOnly(st, rng, gs);
  runDesertEntrancesAndHive(st, rng, gs, desc);
  runMushroomPass(st, rng, gs);
  runMarblePass(st, rng, gs);
  const V = (t: number) => TILE_DEFS[t]?.vanilla?.sheet ?? 0;
  const cx = 854, cy = 920, R = 90;
  let out = '';
  for (let y = cy - R; y <= cy + R; y++) {
    for (let x = cx - R; x <= cx + R; x++) {
      const k = st.idx(x, y);
      out += `${st.wall[k]},${st.flags[k] ? V(st.type[k]) : 0};`;
    }
    out += '\n';
  }
  const js = out.split('\n');
  const cs = readFileSync('/tmp/cs-mb-region.txt', 'utf8').split('\n');
  let n = 0; const pat = new Map<string, number>();
  for (let y = 0; y < Math.min(cs.length, js.length); y++) {
    const ca = cs[y]!.split(';'), ja = js[y]!.split(';');
    for (let x = 0; x < Math.min(ca.length, ja.length); x++) {
      if (ca[x] !== ja[x] && ca[x] !== '') {
        if (n < 6) console.log(`diff @(${cx - R + x},${cy - R + y}) cs=${ca[x]} js=${ja[x]}`);
        n++;
        const key = `cs=${ca[x]} js=${ja[x]}`;
        pat.set(key, (pat.get(key) ?? 0) + 1);
      }
    }
  }
  console.log('total', n, [...pat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6));
}, 300000);
