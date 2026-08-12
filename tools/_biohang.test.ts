// 一次性诊断：逐 pass 跑 vanillaBiomes 序列定位同步死循环。
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
import { runMushroomPass } from '../src/world/gen/vanilla/MushroomPass';
import { runMarbleGranitePass } from '../src/world/gen/vanilla/MarbleGranitePass';
import { runFloatingIslandsPass } from '../src/world/gen/vanilla/StructuresPass';
import { runDirtToMudAndSiltPass } from '../src/world/gen/vanilla/DirtToMudPass';
import { runShiniesPass } from '../src/world/gen/vanilla/ShiniesPass';
import { runWebsPass as runVanillaWebsPass } from '../src/world/gen/vanilla/WebsPass';
import { runUnderworldPass } from '../src/world/gen/vanilla/UnderworldPass';
import { runCorruptionPass } from '../src/world/gen/vanilla/CorruptionPass';
import { runLakesPass } from '../src/world/gen/vanilla/LakesPass';
import { runGemsPass } from '../src/world/gen/vanilla/ShiniesPass';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { runBeachesPass } from '../src/world/gen/vanilla/BeachPass';

it('vanillaBiomes hang bisect', () => {
  const t0 = Date.now();
  const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
  const st = world.store;
  const chain: Array<[string, () => void]> = [];
  const pre: Array<[string, () => void]> = [
    ['dunes', () => runDunesPass(st, rng, gs)],
    ['oceansand', () => runOceanSandPass(st, rng, gs)],
    ['sandpatches', () => runSandPatchesPass(st, rng, gs)],
    ['tunnels', () => runTunnelsPass(st, rng, gs)],
    ['mountcaves', () => runMountCavesPass(st, rng, gs)],
    ['dirtwallbg', () => runDirtWallBgPass(st, rng, gs)],
    ['rocksclay', () => runRocksAndClayPass(st, rng, gs)],
    ['smallholes', () => runSmallHolesPass(st, rng, gs)],
    ['caves', () => runCavesPass(st, rng, gs)],
  ];
  for (const [name, run] of pre) { run(); log(name); }
  const biomes: Array<[string, () => void]> = [
    ['icebiome', () => runIceBiomePass(st, rng, gs)],
    ['grass', () => runGrassPass(st, rng, gs)],
    ['jungle', () => runJunglePass(st, rng, gs)],
    ['mushroom', () => runMushroomPass(st, rng, gs)],
    ['marblegranite', () => runMarbleGranitePass(st, rng, gs)],
    ['islands', () => runFloatingIslandsPass(st, rng, gs)],
    ['dirttomud/silt', () => runDirtToMudAndSiltPass(st, rng, gs)],
    ['shinies', () => runShiniesPass(st, rng, gs)],
    ['webs', () => runVanillaWebsPass(st, rng, gs)],
    ['underworld', () => runUnderworldPass(st, rng, gs)],
    ['corruption', () => runCorruptionPass(st, rng, gs)],
    ['lakes', () => runLakesPass(st, rng, gs)],
    ['gems', () => runGemsPass(st, rng, gs)],
    ['dungeon', () => runDungeonPass(st, rng, gs, [])],
    ['mcopenings', () => runMountainCavesPass(st, rng, gs)],
    ['beaches', () => runBeachesPass(st, rng, gs)],
  ];
  for (const [name, run] of biomes) { log(`→ ${name}`); run(); log(name); }
  log('ALL DONE');
}, 180000);
