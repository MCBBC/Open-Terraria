// TEMPORARY diagnostic (delete after use): dump grids at a dungeon checkpoint.
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runRocksAndClayPass, runCavesPass } from '../src/world/gen/vanilla/CavesPass';
import { runIceBiomePass, runSlushPass } from '../src/world/gen/vanilla/IceBiomePass';
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
import { runCorruptionPass } from '../src/world/gen/vanilla/CorruptionPass';
import { runLakesPass } from '../src/world/gen/vanilla/LakesPass';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const TARGET = process.env.DG_TARGET ?? 'dungeonL';
const VID = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const sh = TILE_DEFS[i]?.vanilla?.sheet; if (typeof sh === 'number') VID[i] = sh; }

describe('tmp dungeon dump', () => {
  it('dumps grids at ' + TARGET, () => {
    const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
    const st = world.store;
    runDunesPass(st, rng, gs);
    runOceanSandPass(st, rng, gs);
    runSandPatchesPass(st, rng, gs);
    runTunnelsPass(st, rng, gs);
    runMountCavesPass(st, rng, gs);
    runDirtWallBgPass(st, rng, gs);
    runRocksAndClayPass(st, rng, gs);
    runSmallHolesPass(st, rng, gs);
    runCavesPass(st, rng, gs);
    runIceBiomePass(st, rng, gs);
    runGrassPass(st, rng, gs);
    runJunglePass(st, rng, gs);
    runMudCavesPass(st, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!);
    const desc = runDesertMoundOnly(st, rng, gs);
    runDesertEntrancesAndHive(st, rng, gs, desc, () => {});
    runMushroomPass(st, rng, gs);
    runMarblePass(st, rng, gs);
    runGranitePass(st, rng, gs);
    runFloatingIslandsPass(st, rng, gs);
    runDirtToMudPass(st, rng, gs);
    runSiltPass(st, rng, gs);
    runShiniesPass(st, rng, gs);
    runWebsPass(st, rng, gs);
    runUnderworldPass(st, rng, gs);
    runCorruptionPass(st, rng, gs);
    runLakesPass(st, rng, gs);
    runSlushPass(st, gs);
    runDungeonPass(st, rng, gs, world.chests, (name) => {
      if (name !== TARGET) return;
      const mapped = new Uint16Array(st.type.length);
      for (let i = 0; i < st.type.length; i++) { const v = VID[st.type[i]]; mapped[i] = v < 0 ? 0x7fff : v; }
      writeFileSync('/tmp/js-dg.typ', Buffer.from(mapped.buffer, mapped.byteOffset, mapped.byteLength));
      writeFileSync('/tmp/js-dg.act', Array.from(st.flags, f => (f ? '1' : '0')).join(''));
      writeFileSync('/tmp/js-dg.wall', Array.from(st.wall).join(','));
      console.log('DUMPED at', name);
    });
  }, 300000);
});
