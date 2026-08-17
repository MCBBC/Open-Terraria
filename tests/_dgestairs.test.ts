// 一次性诊断（Dungeon 终清）：dungeonE 检查点四通道 dump（JS 侧楼梯移植后），
// 与 oracle GRID_DUMP=dungeonE 的产物逐字节对拍（含 typ/act/wal/liq）。
// ★2026-08-17 楼梯+门洞 Bounds.UpdateBounds 移植后的双侧一致性验证。
import { it } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
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

it('dump dungeonE four channels (post-stairs port)', () => {
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
  const st = world.store;
  const dump = (name: string) => {
    const n = st.w * st.h;
    const typ = Buffer.alloc(n * 2);
    const act = Buffer.alloc(n);
    const wal = Buffer.alloc(n * 2);
    const liq = Buffer.alloc(n);
    for (let i = 0; i < n; i++) {
      typ.writeUInt16LE(Math.max(0, V_ID[st.type[i]]), i * 2);
      act[i] = st.flags[i] ? 1 : 0;
      wal.writeUInt16LE(st.wall[i], i * 2);
      liq[i] = st.liquid[i];
    }
    writeFileSync(`/tmp/js-${name}.typ`, typ);
    writeFileSync(`/tmp/js-${name}.act`, act);
    writeFileSync(`/tmp/js-${name}.wal`, wal);
    writeFileSync(`/tmp/js-${name}.liq`, liq);
    console.log(`dumped ${name} (4ch)`);
  };
  rng.reseed(gs.seed);  // ▶Dunes pass 头重播（WorldGen.ts:606 同款）——否则 entSeed 落在
  // Terrain 尾流（#17259 而非 #4），入口堡 rr 维度全错（旧"468 格垛口/内室差"的真身）
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
  // —— DG_ISO 同款：以真原版 031_Slush 四面覆写输入态（剥离上游网格噪声）——
  {
    const VG = '/tmp/sw-num4/van_x86_g';
    const rd = (e: string) => readFileSync(`${VG}/031_Slush.${e}`);
    const t = new Uint16Array(rd('typ').buffer.slice(0));
    const a = rd('act');
    const w = new Uint16Array(rd('wal').buffer.slice(0));
    const l = rd('liq');
    const REV = new Map<number, number>();
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const s = TILE_DEFS[i]?.vanilla?.sheet;
      if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
    }
    for (let i = 0; i < 4200 * 1200; i++) {
      st.type[i] = REV.get(t[i]) ?? 0;
      st.flags[i] = a[i] ? 1 : 0;
      st.wall[i] = w[i];
      st.liquid[i] = l[i];
      st.liquidType[i] = 0;
    }
    console.log('DG_ISO loaded (JS side)');
  }
  rng.reseed(gs.seed);   // 管线每 pass 重播（WorldGen.ts:763 同款）
  runDungeonPass(st, rng, gs, world.chests, (name) => {
    if (name === 'dungeonE') dump('dgE');
  });
}, 300000);
