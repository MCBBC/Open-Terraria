// 一次性（granite 首红猎杀）：真链（chainCheckpoints 同序直调）mushroom/marble/granite
// 掷数测量——裁决 FF「marble 流差 29,916（248,340 vs 278,256）」是否隔离 rig 伪影。
// SW_PARITY=1 npx vitest run tools/_gflow.test.ts
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
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
import { TILE_BY_KEY } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const SEEDTXT = process.env.SW_SEED ?? '9293480';

(RUN ? it : it.skip)('real-chain marble/granite draw counts', () => {
  const { world, rng, gs, seed } = runResetAndTerrain({ width: 4200, height: 1200, seedText: SEEDTXT, evil: 0 });
  const st = world.store;
  // 计数包装（保持 reseed 语义）
  let draws = 0;
  const oNext = rng.next.bind(rng), oInt = rng.int.bind(rng),
    oNIR = rng.nextIntRange.bind(rng), oNI = rng.nextInt.bind(rng), oR = rng.reseed.bind(rng);
  rng.next = () => { draws++; return oNext(); };
  rng.int = (a: number, b: number) => { draws++; return oInt(a, b); };
  rng.nextIntRange = (a: number, b: number) => { draws++; return oNIR(a, b); };
  rng.nextInt = (m: number) => { draws++; return oNI(m); };
  rng.reseed = (s: number) => { oR(s); };
  const replay = () => rng.reseed(seed);
  const mark = (tag: string) => { console.log(`DRAWS ${tag}=${draws}`); draws = 0; };
  replay(); runDunesPass(st, rng, gs);
  replay(); runOceanSandPass(st, rng, gs);
  replay(); runSandPatchesPass(st, rng, gs);
  replay(); runTunnelsPass(st, rng, gs);
  replay(); runMountCavesPass(st, rng, gs);
  replay(); runDirtWallBgPass(st, rng, gs);
  replay(); runRocksAndClayPass(st, rng, gs);
  replay(); runSmallHolesPass(st, rng, gs);
  replay(); runCavesPass(st, rng, gs);
  replay(); runIceBiomePass(st, rng, gs);
  replay(); runGrassPass(st, rng, gs);
  replay(); runJunglePass(st, rng, gs);
  replay(); runMudCavesPass(st, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!);
  const desc = runDesertMoundOnly(st, rng, gs);
  runDesertEntrancesAndHive(st, rng, gs, desc);
  mark('desert(cum)');
  replay(); runMushroomPass(st, rng, gs); mark('mushroom');
  replay(); runMarblePass(st, rng, gs); mark('marble');
  replay(); runGranitePass(st, rng, gs); mark('granite');
  void RNG;
}, 480000);
