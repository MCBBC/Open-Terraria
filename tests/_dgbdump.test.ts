// 一次性诊断（任务#134 收尾）：dungeonB 段 JS↔oracle 网格对拍 dump。
// 产物 /tmp/js-dgC.bin|.act（dungeonC 后=书架前基线）与 /tmp/js-dgB.bin|.act（书架后）。
// 格式对齐 oracle DGC_DUMP/DGB_DUMP：typ=vanilla sheet id（ushort LE 行主序）、act="0"/"1" 串。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
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
import { runLakesPass } from '../src/world/gen/vanilla/LakesPass';
import { runSlushPass } from '../src/world/gen/vanilla/IceBiomePass';
import { runCorruptionPass } from '../src/world/gen/vanilla/CorruptionPass';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const V_ID = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sheet = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof sheet === 'number') V_ID[i] = sheet;
}

it('dump dungeonC/dungeonB grids', () => {
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
  const st = world.store;
  const dump = (name: string) => {
    const n = st.w * st.h;
    const typ = Buffer.alloc(n * 2);
    const act = Buffer.alloc(n);
    for (let i = 0; i < n; i++) {
      const v = V_ID[st.type[i]];
      typ.writeUInt16LE(Math.max(0, v), i * 2);       // raw（含幽灵 type，diff 时按 act 过滤）
      act[i] = st.flags[i] ? 49 : 48;                 // "1"/"0"
    }
    writeFileSync(`/tmp/js-${name}.bin`, typ);
    writeFileSync(`/tmp/js-${name}.act`, act.toString('latin1'));
    console.log(`dumped ${name}`);
  };
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
    if (name === 'dungeonC') dump('dgC');
    if (name === 'dungeonB') dump('dgB');
    if (name === 'dungeonPa') dump('dgP');
    if (name === 'dungeonBa') dump('dgBA');
    // 流指纹（同 shimmer-checkpoint.streamHash 口径）
    const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
    let h = 0x811c9dc5;
    const step = (b: number) => { h = Math.imul(h ^ (b & 0xff), 16777619) >>> 0; };
    for (let i = 0; i < ur.seedArray.length; i++) {
      const v = ur.seedArray[i] | 0;
      for (let b = 0; b < 4; b++) step(v >>> (8 * b));
    }
    const ix = ur.inext >>> 0;
    for (let b = 0; b < 4; b++) step(ix >>> (8 * b));
    console.log(`STREAM ${name} ${h.toString(16).padStart(8, '0')}`);
  });
}, 300000);
