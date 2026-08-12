// 一次性诊断：定位"生成丛林"卡死——逐阶段跑 jungle pass，60s 超时即报卡点。
import { it } from 'vitest';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass, runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runRocksAndClayPass, runCavesPass } from '../src/world/gen/vanilla/CavesPass';
import { runIceBiomePass } from '../src/world/gen/vanilla/IceBiomePass';
import { runGrassPass } from '../src/world/gen/vanilla/GrassPass';
import { runJunglePass } from '../src/world/gen/vanilla/JunglePass';

it('jungle hang repro', () => {
  const t0 = Date.now();
  const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
  const st = world.store;
  runDunesPass(st, rng, gs); log('dunes');
  runOceanSandPass(st, rng, gs); log('oceansand');
  runSandPatchesPass(st, rng, gs); runTunnelsPass(st, rng, gs); log('sandpatches+tunnels');
  runMountCavesPass(st, rng, gs); runDirtWallBgPass(st, rng, gs); log('mountcaves+dirtwallbg');
  runRocksAndClayPass(st, rng, gs); runSmallHolesPass(st, rng, gs); runCavesPass(st, rng, gs); log('rocksclay+smallholes+caves');
  runMountainCavesPass(st, rng, gs); log('mcopenings');
  runIceBiomePass(st, rng, gs); log('icebiome');
  runGrassPass(st, rng, gs); log('grass');
  log('entering jungle...');
  runJunglePass(st, rng, gs);
  log('jungle DONE');
}, 60000);
