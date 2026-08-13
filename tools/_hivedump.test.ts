// 临时探针：dump JS 侧 deserthive 的 typ(u16 LE)+act(0/1) —— 与 oracle HIVE_DUMP 对拍。
// 用法：HD_SEED=9293480 npx vitest run tools/_hivedump.test.ts
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
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const V_ID = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sheet = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof sheet === 'number') V_ID[i] = sheet;
}

it('dump deserthive grids', () => {
  const seedText = process.env.HD_SEED ?? '9293480';
  const evil = (process.env.HD_EVIL ?? '0') === '1' ? 1 : 0;
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText, evil: evil as 0 | 1 });
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
  runDesertEntrancesAndHive(st, rng, gs, desc);
  // typ：内部 id → vanilla sheet（与 hashGrids 同映射），u16 LE；act：0/1 字符
  const n = st.w * st.h;
  const typ = Buffer.alloc(n * 2);
  const act: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = V_ID[st.type[i]]!;
    typ.writeUInt16LE(v < 0 ? 0 : v, i * 2);
    act[i] = st.flags[i] ? '1' : '0';
  }
  const out = process.env.HD_OUT ?? '/tmp/js-hive.bin';
  writeFileSync(out, typ);
  writeFileSync(`${out}.act`, act.join(''));
  console.log(`dumped ${out} (${n} cells)`);
}, 300000);
