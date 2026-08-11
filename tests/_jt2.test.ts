import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
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
  const skyHash = (tag: string) => {
    let h = 2166136261;
    for (let y = 0; y <= 120; y++) for (let x = 0; x < 4200; x++) {
      const i = y * 4200 + x;
      if (st.flags[i]) continue;
      const t = V_ID[st.type[i]] < 0 ? (st.type[i] === 0 ? 0 : 0x7fff) : V_ID[st.type[i]];
      h = (h ^ (t + 1)) * 16777619 | 0;
    }
    console.log(`SKYGH ${tag} ${h >>> 0}`);
  };
  skyHash('terrain'); runDunesPass(st, rng, gs); skyHash('dunes'); runOceanSandPass(st, rng, gs);
  skyHash('oceansand'); runSandPatchesPass(st, rng, gs); skyHash('sandpatches'); runTunnelsPass(st, rng, gs);
  skyHash('tunnels'); runMountCavesPass(st, rng, gs); skyHash('mountaincaves'); runDirtWallBgPass(st, rng, gs);
  skyHash('dirtwallbg'); runRocksAndClayPass(st, rng, gs); skyHash('rocksclay');
  writeFileSync('/tmp/js-rc.bin', new Uint8Array(st.type.buffer, st.type.byteOffset, st.type.byteLength)); runSmallHolesPass(st, rng, gs); skyHash('smallholes'); runCavesPass(st, rng, gs);
  skyHash('surfacecaves'); runMountainCavesPass(st, rng, gs);
  const bandHash = (tag: string) => {
    let h = 2166136261;
    for (let y = 150; y <= 400; y++) for (let x = 0; x < 4200; x++) {
      const i = y * 4200 + x;
      if (st.flags[i]) continue;
      const t = V_ID[st.type[i]] < 0 ? (st.type[i] === 0 ? 0 : 0x7fff) : V_ID[st.type[i]];
      h = (h ^ (t + 1)) * 16777619 | 0;
    }
    console.log(`BAND ${tag} ${h >>> 0}`);
  };
  bandHash('mcopen');
  runBeachesPass(st, rng, gs); bandHash('beaches');
  runIceBiomePass(st, rng, gs); bandHash('ice');
  runGrassPass(st, rng, gs); bandHash('grass');
  runJunglePass(st, rng, gs); bandHash('jungle');
  let n = 0;
  const hist = new Map<string, number>();
  const cl = new Map<string, [number, number, number, number]>();
  for (let i = 0; i < cs.length; i++) {
    // internal 0=EMPTY ≡ vanilla 0（幽灵泥土）——无 sheet 的其他 id 才是真缺口
    const jv = V_ID[st.type[i]] < 0 ? (st.type[i] === 0 ? 0 : 0x7fff) : V_ID[st.type[i]];
    if (cs[i] === jv) continue;
    n++;
    const k = `a${st.flags[i]}:${cs[i]}>${jv}`;
    hist.set(k, (hist.get(k) ?? 0) + 1);
    const x = i % 4200, y = (i / 4200) | 0;
    const b = cl.get(k) ?? [x, y, x, y];
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    cl.set(k, b);
  }
  const cells: string[] = [];
  for (let i = 0; i < cs.length && cells.length < 15; i++) {
    const jv2 = V_ID[st.type[i]] < 0 ? (st.type[i] === 0 ? 0 : 0x7fff) : V_ID[st.type[i]];
    if (!st.flags[i] && cs[i] !== jv2 && (cs[i] === 53 || cs[i] === 1 || cs[i] === 40)) cells.push(`(${i % 4200},${(i / 4200) | 0})cs${cs[i]}js${jv2}`);
  }
  console.log('CELLS', cells.join(' '));
  console.log('DIFF3:', n, [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}x${v}@[${cl.get(k)!.join(',')}]`).join(' '));
});
