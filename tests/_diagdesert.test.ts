// 临时诊断（跑完即删）：JS 沙漠区 dump 与 /tmp/cs-desert-*.txt 逐格对比
import { it } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass, runBeachesPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass, runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runRocksAndClayPass, runCavesPass } from '../src/world/gen/vanilla/CavesPass';
import { runIceBiomePass } from '../src/world/gen/vanilla/IceBiomePass';
import { runGrassPass } from '../src/world/gen/vanilla/GrassPass';
import { runJunglePass } from '../src/world/gen/vanilla/JunglePass';
import { runMudCavesPass } from '../src/world/gen/vanilla/Spread';
import { runDesertMoundOnly, runDesertEntrancesAndHive } from '../src/world/gen/vanilla/DesertPass';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

it('diag desert diff', () => {
  const seedText = 'SandboxWorld', evil = 1 as const;
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText, evil });
  const st = world.store;
  runDunesPass(st, rng, gs); runOceanSandPass(st, rng, gs); runSandPatchesPass(st, rng, gs);
  runTunnelsPass(st, rng, gs); runMountCavesPass(st, rng, gs); runDirtWallBgPass(st, rng, gs);
  runRocksAndClayPass(st, rng, gs); runSmallHolesPass(st, rng, gs); runCavesPass(st, rng, gs);
  runMountainCavesPass(st, rng, gs); runBeachesPass(st, rng, gs); runIceBiomePass(st, rng, gs);
  runGrassPass(st, rng, gs); runJunglePass(st, rng, gs);
  runMudCavesPass(st, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!);
  const desc = runDesertMoundOnly(st, rng, gs);
  console.log('desc', { combX: desc.combX, combY: desc.combY, combW: desc.combW, combH: desc.combH, hiveTop: desc.hiveTop, hiveH: desc.hiveH });
  const V = (t: number) => TILE_DEFS[t]?.vanilla?.sheet ?? 0;
  const dumpRegion = () => {
    let out = '';
    for (let j = desc.combY - 60; j < desc.hiveTop + desc.hiveH + 60; j++) {
      for (let i = desc.combX - 60; i < desc.combX + desc.combW + 60; i++) {
        const k = st.idx(i, j);
        out += `${st.wall[k]},${st.flags[k] ? V(st.type[k]) : 0};`;
      }
      out += '\n';
    }
    return out;
  };
  let dumpMound = dumpRegion();
  let dumpEntrance = '';
  runDesertEntrancesAndHive(st, rng, gs, desc, () => { dumpEntrance = dumpRegion(); });
  writeFileSync('/tmp/js-desert-mound.txt', dumpMound);
  writeFileSync('/tmp/js-desert-entrance.txt', dumpEntrance);
  writeFileSync('/tmp/js-desert-hive.txt', dumpRegion());
  const diff = (tag: string) => {
    const cs = readFileSync(`/tmp/cs-desert-${tag}.txt`, 'utf8').split('\n');
    const js = readFileSync(`/tmp/js-desert-${tag}.txt`, 'utf8').split('\n');
    let n = 0;
    const y0 = desc.combY - 60;
    for (let y = 0; y < Math.min(cs.length, js.length); y++) {
      const ca = cs[y].split(';'), ja = js[y].split(';');
      for (let x = 0; x < Math.min(ca.length, ja.length); x++) {
        if (ca[x] !== ja[x] && ca[x] !== '') {
          if (n < 15) console.log(`${tag} diff @(${desc.combX - 60 + x},${y0 + y}) cs=${ca[x]} js=${ja[x]}`);
          n++;
        }
      }
    }
    console.log(`${tag}: ${n} diff cells`);
  };
  const diffPat = (tag: string) => {
    const cs = readFileSync(`/tmp/cs-desert-${tag}.txt`, 'utf8').split('\n');
    const js = readFileSync(`/tmp/js-desert-${tag}.txt`, 'utf8').split('\n');
    const pat = new Map<string, number>();
    for (let y = 0; y < Math.min(cs.length, js.length); y++) {
      const ca = cs[y].split(';'), ja = js[y].split(';');
      for (let x = 0; x < Math.min(ca.length, ja.length); x++) {
        if (ca[x] !== ja[x] && ca[x] !== '') {
          const k = `cs=${ca[x]} js=${ja[x]}`;
          pat.set(k, (pat.get(k) ?? 0) + 1);
        }
      }
    }
    console.log(tag, [...pat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
  };
  diff('entrance'); diff('hive');
  console.log('mound patterns:'); diffPat('mound'); console.log('entrance patterns:'); diffPat('entrance'); console.log('hive patterns:'); diffPat('hive');
}, 300000);
