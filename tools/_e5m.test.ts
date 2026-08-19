// EEEEE 一次性中世界链探针（env 门控 SW_E5M=1；用毕即删）：
// chainCheckpoints 同构但尺寸参化（6400×1800）+ STREAM 指纹 + 4 通道打印，
// 对拍 caves-oracle 中世界跑（/tmp/e5-ora-m*.json + STREAM_PRINT 日志）。
// 种子 20260811 evil=0（= /tmp/sw-slp/g-m20260811 x86 dump 链）。
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass, runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runRocksAndClayPass, runCavesPass } from '../src/world/gen/vanilla/CavesPass';
import { runBeachesPass } from '../src/world/gen/vanilla/BeachPass';
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
import { runHellFortPass } from '../src/world/gen/vanilla/HellFortPass';
import { runLakesPass } from '../src/world/gen/vanilla/LakesPass';
import { runSlushPass } from '../src/world/gen/vanilla/IceBiomePass';
import { runCorruptionPass } from '../src/world/gen/vanilla/CorruptionPass';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { runGemsPass } from '../src/world/gen/vanilla/ShiniesPass';
import { gravitatingSandPass, vanillaCleanup } from '../src/world/gen/WorldGen';
import { runOceanCavesPass } from '../src/world/gen/vanilla/OceanCavesPass';
import { runShimmerPass } from '../src/world/gen/vanilla/ShimmerPass';
import { runPyramidPass, runWetJunglePass } from '../src/world/gen/vanilla/StructuresPass';
import { runDirtRockWallRunnerPass } from '../src/world/gen/vanilla/DirtRockWallRunnerPass';
import { runLivingTreesPass, runLivingTreeWallsPass } from '../src/world/gen/vanilla/LivingTreePass';
import { runAltarsPass } from '../src/world/gen/vanilla/CorruptionPass';
import { runStatuesPass } from '../src/world/gen/vanilla/StatuesPass';
import { runCaveWallsPass } from '../src/world/gen/vanilla/CaveWallsPass';
import { runUndergroundJungleTreesPass } from '../src/world/gen/vanilla/UndergroundJungleTreesPass';
import { runQuickCleanupPass } from '../src/world/gen/vanilla/QuickCleanupPass';
import { runBeehivePass } from '../src/world/gen/vanilla/HiveSpiderPass';
import { runPilesPass } from '../src/world/gen/vanilla/PilesPass';
import { runTreePass } from '../src/world/gen/vanilla/TreePass';
import { runCactusPalmTreesAndCoralPass } from '../src/world/gen/vanilla/StructuresPass';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { snapshotGenSolid, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import type { World } from '../src/world/World';
import type { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import type { RNG } from '../src/core/rng';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { fnv1a } from '../tests/pass-hash.test';

const run = process.env.SW_E5M === '1';
const describeOrSkip = run ? describe : describe.skip;
const ORA = process.env.E5M_ORA ?? '/tmp/e5-ora-m3.json';
const ORA_STREAMS = process.env.E5M_ORA_STREAMS ?? '';

const V_ID = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sheet = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof sheet === 'number') V_ID[i] = sheet;
}

function hash4(st: { type: Uint16Array; flags: Uint8Array; liquid: Uint8Array; wall: Uint16Array; w: number; h: number }): string {
  const n = st.w * st.h;
  const mapped = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    if (!st.flags[i]) continue;
    const v = V_ID[st.type[i]];
    mapped[i] = v < 0 ? 0x7fff : v;
  }
  return `${fnv1a(mapped)} ${fnv1a(st.flags)} ${fnv1a(st.wall)} ${fnv1a(st.liquid)}`;
}

function e5mediumChain() {
  const { world, rng, gs, seed } = runResetAndTerrain({ width: 6400, height: 1800, seedText: '20260811', evil: 0 });
  const st = world.store;
  const out = new Map<string, string>();
  const streams = new Map<string, string>();
  const replay = () => rng.reseed(seed);
  const streamHash = (): string => {
    const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
    let h = 0x811c9dc5;
    const step = (b: number) => { h = Math.imul(h ^ (b & 0xff), 16777619) >>> 0; };
    for (let i = 0; i < ur.seedArray.length; i++) {
      const v = ur.seedArray[i] | 0;
      for (let b = 0; b < 4; b++) step(v >>> (8 * b));
    }
    const ix = ur.inext >>> 0;
    for (let b = 0; b < 4; b++) step(ix >>> (8 * b));
    return h.toString(16).padStart(8, '0');
  };
  const snap = (name: string) => {
    out.set(name, hash4(st));
    streams.set(name, streamHash());
  };
  out.set('terrain', hash4(st)); streams.set('terrain', streamHash());
  replay(); runDunesPass(st, rng, gs); snap('dunes');
  replay(); runOceanSandPass(st, rng, gs); snap('oceansand');
  replay(); runSandPatchesPass(st, rng, gs); snap('sandpatches');
  replay(); runTunnelsPass(st, rng, gs); snap('tunnels');
  replay(); runMountCavesPass(st, rng, gs); snap('mountaincaves');
  replay(); runDirtWallBgPass(st, rng, gs); snap('dirtwallbg');
  replay(); runRocksAndClayPass(st, rng, gs); snap('rocksclay');
  replay(); runSmallHolesPass(st, rng, gs); snap('smallholes');
  replay(); runCavesPass(st, rng, gs); snap('surfacecaves');
  replay(); runIceBiomePass(st, rng, gs); snap('icebiome');
  replay(); runGrassPass(st, rng, gs); snap('grass');
  replay(); runJunglePass(st, rng, gs); snap('jungle');
  replay(); runMudCavesPass(st, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!); snap('mudcaves');
  replay(); const desc = runDesertMoundOnly(st, rng, gs); snap('desertmound');
  runDesertEntrancesAndHive(st, rng, gs, desc, () => snap('desertentrance'));
  snap('deserthive'); snap('desertdone');
  replay(); runMushroomPass(st, rng, gs); snap('mushroom');
  replay(); runMarblePass(st, rng, gs); snap('marble');
  replay(); runGranitePass(st, rng, gs); snap('granite');
  replay(); runFloatingIslandsPass(st, rng, gs); snap('islands');
  replay(); runDirtToMudPass(st, rng, gs); snap('dirttomud');
  replay(); runSiltPass(st, rng, gs); snap('silt');
  replay(); runShiniesPass(st, rng, gs); snap('ores');
  replay(); runWebsPass(st, rng, gs); snap('webs');
  replay(); runUnderworldPass(st, rng, gs); runHellFortPass(st, rng, gs); snap('underworld');
  replay(); runCorruptionPass(st, rng, gs); snap('corruption');
  replay(); runLakesPass(st, rng, gs); snap('lakes');
  replay(); runSlushPass(st, gs); snap('slush');
  replay();
  {
    // 掷骰计数代理：对拍 oracle DGFLOWSEC 段级 rolls（int/next/nextInt/nextIntRange/
    // range/chance/pick + vanilla.next 一网打尽）
    const rolls = { n: 0 };
    const van = (rng as unknown as { vanilla: { next(): number } }).vanilla;
    const vanWrap = { next() { rolls.n++; return van.next(); } };
    const crng = new Proxy(rng, {
      get(t, p) {
        if (p === 'vanilla') return vanWrap;
        const v = Reflect.get(t, p, t);
        if (typeof v === 'function' && p !== 'reseed') {
          return (...a: unknown[]) => { rolls.n++; return (v as (...x: unknown[]) => unknown).apply(t, a); };
        }
        return v;
      },
    });
    runDungeonPass(st, crng as never, gs, world.chests, (name) => { console.log(`DGROLLS ${name} ${rolls.n}`); snap(name); });
  }
  replay(); runMountainCavesPass(st, rng, gs); snap('mcopenings');
  replay(); runBeachesPass(st, rng, gs); snap('beaches');
  replay(); runGemsPass(st, rng, gs); snap('gems');
  replay(); gravitatingSandPass({ store: st } as never); snap('gravitatingsand');
  replay(); runOceanCavesPass(st, rng, gs); snap('oceancaves');
  replay(); runShimmerPass(st, rng, gs, (nm) => snap(nm));
  replay(); vanillaCleanup({ store: st, rng } as never); snap('dirtwallcleanup');
  replay(); runPyramidPass(st, rng, gs, world.chests); snap('pyramids');
  replay(); runDirtRockWallRunnerPass(st, rng, gs); snap('dirtrockwallrunner');
  replay(); runLivingTreesPass(st, rng, gs, world.chests); snap('livingtrees');
  replay(); runLivingTreeWallsPass(st, gs); snap('livingtreewalls');
  replay(); runAltarsPass(st, rng, gs); snap('altars');
  replay(); runWetJunglePass(st, rng, gs); snap('surfacewaterinjungle');
  replay(); runStatuesPass(st, rng, gs); snap('statues');
  replay(); runCaveWallsPass(st, rng, gs); snap('cavewalls');
  replay(); runUndergroundJungleTreesPass(st, rng, gs); snap('undergroundjungletrees');
  replay(); runQuickCleanupPass(st, rng, gs); snap('quickcleanup');
  replay(); runBeehivePass(st, rng, gs); snap('beehives');
  replay(); runPilesPass(st, rng, gs); snap('piles');
  replay(); runTreePass(st, rng, gs); snap('trees');
  replay(); e5Settle(world, st, gs, rng); snap('settle2');
  replay(); runCactusPalmTreesAndCoralPass(st, rng, gs); snap('cactus');
  replay(); runMicroBiomesPass(st, rng, gs, world.chests); snap('microbiomes');
  return { grids: out, streams };
}

// settlePart2ChainSync 同构（caves-checkpoint.test.ts:297 私有——此处复制最小体）
function e5Settle(world: World, st: TileStore, gs: GenState, rng: RNG): void {
  const sim = new LiquidSim(world);
  sim.passRand = (max) => rng.nextInt(max);
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.shimmerCenter = gs.shimmerX > 0 ? { x: gs.shimmerX, y: gs.shimmerY } : null;
  sim.genWaterLine = gs.waterLine;
  if (gs.dungeonSide !== 0) {
    const edge = Math.floor(world.w * 0.05);
    const mid = Math.floor(world.w * 0.55);
    const x0 = gs.dungeonSide < 0 ? edge : mid;
    const x1 = gs.dungeonSide < 0 ? Math.floor(world.w * 0.45) : world.w - edge;
    const y0 = Math.floor(gs.worldSurface) + 10;
    const y1 = (world.h - 200) - 10;
    sim.dungeonWaterExempt = (x, y, w) =>
      x >= x0 && x <= x1 && y >= y0 && y <= y1
      && (w === 7 || w === 8 || w === 9 || (w >= 94 && w <= 99));
  }
  sim.applyGenSolidOverrides(snapshotGenSolid());
  sim.worldGenTilesIgnoreWater(true);
  sim.quickWater();
  sim.waterCheck();
  sim.quickSettle = true;
  for (let round = 0; round < 10; round++) {
    const maxIter = (sim.numLiquid + sim.bufferLen) * 5;
    let roundIter = 0;
    while (sim.numLiquid > 0 && roundIter < maxIter) { sim.updateLiquid(); roundIter++; }
    sim.waterCheck();
  }
  sim.quickSettle = false;
  sim.worldGenTilesIgnoreWater(false);
  sim.finalGenMergeCheck();
  sim.dispose();
  flipGenSolid([484], false);
}

describeOrSkip('EEEEE 中世界链探针 20260811 6400x1800', () => {
  it('JS 链 4 通道 + STREAM vs caves-oracle 中世界', async () => {
    const ora = JSON.parse(readFileSync(ORA, 'utf8')) as { checkpoints: string[] };
    const og = new Map<string, string[]>();
    for (const line of ora.checkpoints) {
      const [name, ...vals] = line.split(/[| ]+/);
      og.set(name, vals);
    }
    const os = new Map<string, string>();
    if (ORA_STREAMS) {
      for (const line of readFileSync(ORA_STREAMS, 'utf8').split('\n')) {
        const m = line.match(/^STREAM (\S+)\|([0-9a-f]{8})$/);
        if (m) os.set(m[1], m[2]);
      }
    }
    const res = e5mediumChain();
    let firstGrid = '', firstStream = '';
    let green = 0, red = 0;
    for (const [name, js] of res.grids) {
      const o = og.get(name);
      const ok = o && o.join(' ') === js;
      if (ok) green++; else { red++; if (!firstGrid) firstGrid = name; }
      const osv = os.get(name), jsv = res.streams.get(name);
      const sok = !osv || osv === jsv;
      if (!sok && !firstStream) firstStream = name;
      console.log(`${name.padEnd(20)} ${ok ? '✓' : '✗'} js=${js} ora=${o ? o.join(' ') : '(missing)'} st=${jsv ?? ''}${osv ? (sok ? ' s✓' : ` s✗ ${osv}`) : ''}`);
    }
    console.log(`== grid green=${green} red=${red} firstBad=${firstGrid || '(none)'} streamFirstBad=${firstStream || '(none)'}`);
  }, 600000);
});
