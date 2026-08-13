// 一次性：deserthive 处两侧网格逐格对拍（复用 caves-checkpoint 同链）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass, runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runRocksAndClayPass, runCavesPass } from '../src/world/gen/vanilla/CavesPass';
import { runIceBiomePass } from '../src/world/gen/vanilla/IceBiomePass';
import { runGrassPass } from '../src/world/gen/vanilla/GrassPass';
import { runJunglePass } from '../src/world/gen/vanilla/JunglePass';
import { runMudCavesPass } from '../src/world/gen/vanilla/Spread';
import { runDesertMoundOnly, runDesertEntrancesAndHive } from '../src/world/gen/vanilla/DesertPass';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

it('hive cell diff', () => {
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
  const st = world.store;
  runDunesPass(st, rng, gs); runOceanSandPass(st, rng, gs);
  runSandPatchesPass(st, rng, gs); runTunnelsPass(st, rng, gs);
  runMountCavesPass(st, rng, gs); runDirtWallBgPass(st, rng, gs);
  runRocksAndClayPass(st, rng, gs); runSmallHolesPass(st, rng, gs); runCavesPass(st, rng, gs);
  runMountainCavesPass(st, rng, gs);
  runIceBiomePass(st, rng, gs); runGrassPass(st, rng, gs); runJunglePass(st, rng, gs);
  runMudCavesPass(st, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!);
  runDesertEntrancesAndHive(st, rng, gs, runDesertMoundOnly(st, rng, gs), () => {});
  const cs = new Uint16Array(readFileSync('/tmp/cs-hive.bin').buffer.slice(0));
  const csAct = readFileSync('/tmp/cs-hive.bin.act', 'utf8');
  const V = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s2 = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s2 === 'number') V[i] = s2; }
  let actMis = 0, typeMis = 0; const samples: string[] = [];
  for (let i = 0; i < cs.length; i++) {
    const aJ = st.flags[i] !== 0, aC = csAct[i] === '1';
    if (aJ !== aC) { actMis++; if (samples.length < 5) samples.push(`(${i % 4200},${(i / 4200) | 0}) act js=${aJ ? 1 : 0} cs=${aC ? 1 : 0}`); continue; }
    if (!aJ) continue;
    const jv = V[st.type[i]] < 0 ? 0x7fff : V[st.type[i]];
    if (cs[i] !== jv) { typeMis++; if (samples.length < 5) samples.push(`(${i % 4200},${(i / 4200) | 0}) t js=${jv} cs=${cs[i]}`); }
  }
  console.log(`HIVEDIFF actMis=${actMis} typeMis=${typeMis} ${samples.join(' ')}`);
  // 邻域切片：x[2600,2640) y[325,345)——js act/type 图 vs oracle act/type 图
  const sl = (getAct: (i: number) => number, getType: (i: number) => number) => {
    const rows: string[] = [];
    for (let y = 325; y < 345; y++) {
      let row = '';
      for (let x = 2600; x < 2640; x++) {
        const i = y * 4200 + x;
        if (!getAct(i)) row += '.';
        else { const t = getType(i); row += t === 396 ? '#' : t === 397 ? '%' : t === 53 ? 's' : t === 40 ? 'c' : t === 59 ? 'm' : t === 0 ? 'd' : '?'; }
      }
      rows.push(row);
    }
    return rows;
  };
  // 差异格的具体类型号（前 15 个）
  const typeSamples: string[] = [];
  for (let y = 325; y < 345 && typeSamples.length < 15; y++) for (let x = 2600; x < 2640 && typeSamples.length < 15; x++) {
    const i = y * 4200 + x;
    const aJ = st.flags[i] !== 0, aC = csAct[i] === '1';
    const jv = V[st.type[i]], cv = cs[i];
    if (aJ !== aC || (aJ && jv !== cv)) typeSamples.push(`(${x},${y}) js(a${aJ ? 1 : 0},t${jv}) cs(a${aC ? 1 : 0},t${cv})`);
  }
  console.log('TS ' + typeSamples.join(' '));
  const jsRows = sl((i) => st.flags[i], (i) => V[st.type[i]]);
  const csRows = sl((i) => (csAct[i] === '1' ? 1 : 0), (i) => cs[i]);
  for (let y = 0; y < jsRows.length; y++) console.log(`y${325 + y} J ${jsRows[y]}`);
  for (let y = 0; y < csRows.length; y++) console.log(`y${325 + y} C ${csRows[y]}`);
});
