import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass, runBeachesPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass, runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runRocksAndClayPass, runCavesPass } from '../src/world/gen/vanilla/CavesPass';
import { runIceBiomePass } from '../src/world/gen/vanilla/IceBiomePass';
import { runGrassPass } from '../src/world/gen/vanilla/GrassPass';
import { runJunglePass } from '../src/world/gen/vanilla/JunglePass';
import { TILE_DEFS } from '../src/data/tiles';

const V_ID = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sheet = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof sheet === 'number') V_ID[i] = sheet;
}

it('jungle active-type diff v2', () => {
  const cs = new Uint16Array(readFileSync('/tmp/cs-jt.bin').buffer);
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
  const st = world.store;
  runDunesPass(st, rng, gs); runOceanSandPass(st, rng, gs);
  runSandPatchesPass(st, rng, gs); runTunnelsPass(st, rng, gs);
  runMountCavesPass(st, rng, gs); runDirtWallBgPass(st, rng, gs);
  runRocksAndClayPass(st, rng, gs); runSmallHolesPass(st, rng, gs); runCavesPass(st, rng, gs);
  runMountainCavesPass(st, rng, gs); runBeachesPass(st, rng, gs);
  runIceBiomePass(st, rng, gs); runGrassPass(st, rng, gs);
  runJunglePass(st, rng, gs);
  let n = 0;
  const hist = new Map<string, number>();
  const cl = new Map<string, [number, number, number, number]>();
  for (let i = 0; i < cs.length; i++) {
    const jv = V_ID[st.type[i]] < 0 ? 0x7fff : V_ID[st.type[i]];
    if (cs[i] === jv) continue;
    n++;
    const k = `a${st.flags[i]}:${cs[i]}>${jv}`;
    hist.set(k, (hist.get(k) ?? 0) + 1);
    const x = i % 4200, y = (i / 4200) | 0;
    const b = cl.get(k) ?? [x, y, x, y];
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    cl.set(k, b);
  }
  console.log('DIFF3:', n, [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}x${v}@[${cl.get(k)!.join(',')}]`).join(' '));
});
