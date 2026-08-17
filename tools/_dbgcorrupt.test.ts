// 一次性诊断：s6666 corruption 分叉 A/B——把 g28 输入的 66 个幽灵格清成 x86 值后
// 跑 corruption，看主流态是否收敛到 x86 P|29（54dbbe4b）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
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
import { runCorruptionPass } from '../src/world/gen/vanilla/CorruptionPass';
import { runLakesPass } from '../src/world/gen/vanilla/LakesPass';
import { runSlushPass } from '../src/world/gen/vanilla/IceBiomePass';
import { TILE_BY_KEY } from '../src/data/tiles';

function streamHash(rng: unknown): string {
  const ur = (rng as { ur: { seedArray: Int32Array; inext: number } }).ur;
  let h = 0x811c9dc5;
  const step = (b: number) => { h = Math.imul(h ^ (b & 0xff), 16777619) >>> 0; };
  for (let i = 0; i < ur.seedArray.length; i++) { const v = ur.seedArray[i] | 0; for (let b = 0; b < 4; b++) step(v >>> (8 * b)); }
  const ix = ur.inext >>> 0;
  for (let b = 0; b < 4; b++) step(ix >>> (8 * b));
  return h.toString(16).padStart(8, '0');
}

it('ghost A/B corruption 6666', async () => {
  const W = 4200;
  // 66 幽灵格（x86 g28: type=0；JS g28: 残留）
  const ghost: Array<[number, number]> = [];
  {
    const v = readFileSync('/tmp/hscmp/gd/6666/g28.typ');
    const j = readFileSync('/tmp/hscmp/js/6666/js-g28.typ');
    const va = readFileSync('/tmp/hscmp/gd/6666/g28.act');
    for (let i = 0; i < v.length; i += 2) {
      if (v[i] !== j[i] || v[i + 1] !== j[i + 1]) {
        const k = i / 2;
        if (va[k] === 0) ghost.push([(k % W), Math.floor(k / W)]);
      }
    }
  }
  console.log('ghost cells:', ghost.length);
  for (const MODE of ['raw', 'patched'] as const) {
    const { world, rng, gs, seed } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '6666', evil: 0 });
    const st = world.store;
    const replay = () => rng.reseed(seed);
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
    runDesertEntrancesAndHive(st, rng, gs, desc, () => {});
    replay(); runMushroomPass(st, rng, gs);
    replay(); runMarblePass(st, rng, gs);
    replay(); runGranitePass(st, rng, gs);
    replay(); runFloatingIslandsPass(st, rng, gs);
    replay(); runDirtToMudPass(st, rng, gs);
    replay(); runSiltPass(st, rng, gs);
    replay(); runShiniesPass(st, rng, gs);
    replay(); runWebsPass(st, rng, gs);
    replay(); runUnderworldPass(st, rng, gs);
    if (MODE === 'patched') {
      for (const [x, y] of ghost) st.type[st.idx(x, y)] = 0;
    }
    if (MODE === 'raw') {
      // 通道对比：x86 g28 slope/half/lty vs JS 同点
      const xsl = readFileSync('/tmp/hscmp/gd/6666/g28.slope');
      const xhf = readFileSync('/tmp/hscmp/gd/6666/g28.half');
      const xlty = readFileSync('/tmp/hscmp/gd/6666/g28.lty');
      const xiac = readFileSync('/tmp/hscmp/gd/6666/g28.inact');
      let ds = 0, dh = 0, dl = 0, di = 0;
      const samples: string[] = [];
      for (let k = 0; k < st.slope.length; k++) {
        if (xsl[k] !== st.slope[k]) { ds++; if (samples.length < 8) samples.push(`slope k=${k} x=${k % 4200} y=${Math.floor(k / 4200)} v=${xsl[k]} j=${st.slope[k]}`); }
        if (xhf[k] !== st.half[k]) dh++;
        const jl = st.liquid[k] > 0 ? st.liquidType[k] : 0;
        if (xlty[k] !== jl) { dl++; if (samples.length < 16) samples.push(`lty k=${k} x=${k % 4200} y=${Math.floor(k / 4200)} v=${xlty[k]} j=${jl}`); }
        if (xiac[k] !== (st.flags[k] ? 0 : 1) && false) di++;
      }
      const xliq = readFileSync('/tmp/hscmp/gd/6666/g28.liq');
      let dlWet = 0; const wetPairs: Record<string, number> = {};
      for (let k = 0; k < xliq.length; k++) {
        if (xliq[k] > 0) {
          const jl = st.liquid[k] > 0 ? st.liquidType[k] : 0;
          if (xlty[k] !== jl) { dlWet++; const key = `${xlty[k]}>${jl}`; wetPairs[key] = (wetPairs[key] ?? 0) + 1; }
        }
      }
      console.log(`g28 通道差: slope=${ds} half=${dh} lty=${dl} (湿格 lty 差=${dlWet} ${JSON.stringify(wetPairs)})`);
      for (const s2 of samples) console.log('  ' + s2);
    }
    replay(); runCorruptionPass(st, rng, gs);
    console.log(`${MODE}: corruption stream=${streamHash(rng)} (x86 P|29 = 54dbbe4b)`);
    replay(); runLakesPass(st, rng, gs);
    console.log(`${MODE}: lakes stream=${streamHash(rng)} (x86 P|30 = 3a016307)`);
  }
}, 300000);
