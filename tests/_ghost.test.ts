// 幽灵 parity 扫描：逐检查点对账 inactive 格的残留 type，
// 定位哪个 pass 首次写出与 C# oracle 不同的幽灵。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass, runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runRocksAndClayPass, runCavesPass } from '../src/world/gen/vanilla/CavesPass';
import { TILE_DEFS } from '../src/data/tiles';
import { fnv1a } from './pass-hash.test';

const V_ID = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sheet = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof sheet === 'number') V_ID[i] = sheet;
}
function gh(st: { type: Uint16Array; flags: Uint8Array; w: number; h: number }): number {
  const ghost = new Uint16Array(st.w * st.h);
  for (let i = 0; i < ghost.length; i++) {
    if (st.flags[i]) continue;
    const t = st.type[i];
    if (t === 0) { ghost[i] = 0; continue; } // 内部空 → vanilla 0（与 oracle 裸 typ 同口径）
    const v = V_ID[t];
    ghost[i] = v < 0 ? 0x7fff : v;
  }
  return fnv1a(ghost);
}

it('ghost parity per checkpoint', async () => {
  // oracle 侧逐检查点幽灵 dump：先只做 terrain（金标生成时存 typ 全量）
  // 简化法：直接比 terrain 后的幽灵——若 terrain 幽灵已分叉则根因在 Reset/Terrain
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
  const st = world.store;
  console.log('GHOST terrain=' + gh(st).toString(16));
  runDunesPass(st, rng, gs);   console.log('GHOST dunes=' + gh(st).toString(16));
  runOceanSandPass(st, rng, gs); console.log('GHOST oceansand=' + gh(st).toString(16));
  runSandPatchesPass(st, rng, gs); console.log('GHOST sandpatches=' + gh(st).toString(16));
  runTunnelsPass(st, rng, gs); console.log('GHOST tunnels=' + gh(st).toString(16));
  runMountCavesPass(st, rng, gs); console.log('GHOST mountaincaves=' + gh(st).toString(16));
  runDirtWallBgPass(st, rng, gs); console.log('GHOST dirtwallbg=' + gh(st).toString(16));
  runRocksAndClayPass(st, rng, gs); console.log('GHOST rocksclay=' + gh(st).toString(16));
  runSmallHolesPass(st, rng, gs); console.log('GHOST smallholes=' + gh(st).toString(16));
  runCavesPass(st, rng, gs);   console.log('GHOST surfacecaves=' + gh(st).toString(16));
  runMountainCavesPass(st, rng, gs); console.log('GHOST mcopenings=' + gh(st).toString(16));
});
