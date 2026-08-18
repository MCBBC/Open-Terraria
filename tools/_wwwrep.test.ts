// WWW 批·阶段2（SW_WWW=rep）：尾段逐 pass 自因清查。
// 方法论：golden(N-1) 干净基座（8 通道 typ/act/wal/liq/lty/half/slope/inact；
// frameX/Y+wire 取 JS 管线同槽界快照——金标无帧/线通道；sheet3/5 内部 id 取 ids35）
// → JS 第 N 个 pass（新 RNG(SEED) 流，镜像 RunPass 每 pass 重播 WorldGenerator.cs:497）
// → 与 golden(N) 八通道对拍。任何差 = pass N 自身移植自因（上游 #32/#49 等债被基座隔离）。
// 用法：cd game && SW_WWW=rep SW_WWW_FROM=54 SW_WWW_TO=70 npx vitest run tools/_wwwrep.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { spreadingGrassPass, spawnPointPass, __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { settleWorldLiquids } from '../src/world/liquid/settle';

// ---- pass 实现 ----
import { runWaterfallLipPass } from '../src/world/gen/vanilla/HalfBrickPass';
import { runFragileIcePass } from '../src/world/gen/vanilla/WaterIcePasses';
import { runCaveWallVarietyPass, runCaveWallsPass } from '../src/world/gen/vanilla/CaveWallsPass';
import { runLifeCrystalsPass } from '../src/world/gen/vanilla/StructuresPass';
import { runStatuesPass } from '../src/world/gen/vanilla/StatuesPass';
import { rollHouseChestCounts, runCaveHousesPass } from '../src/world/gen/vanilla/CaveHousePass';
import { runBuriedChestsPass, runUnderworldChestsPass, runSurfaceChestsPass, runWaterChestsPass } from '../src/world/gen/vanilla/BuriedChestsPass';
import { runJungleChestsPass, runJungleShrinePass } from '../src/world/gen/vanilla/JungleShrinePass';
import { runOceanCavesPass, runUnderwaterChestsPass } from '../src/world/gen/vanilla/OceanCavesPass';
import { runSpiderNestPass } from '../src/world/gen/vanilla/HiveSpiderPass';
import { runGemCavesPass, runExposedGemsPass, runGemTreesPass } from '../src/world/gen/vanilla/GemPasses';
import { runMossAndMossCavesPass } from '../src/world/gen/vanilla/MossPass';
import { runTemplePart2Pass, runLihzahrdAltarPass } from '../src/world/gen/vanilla/TemplePass';
import { runIslandHousePass } from '../src/world/gen/vanilla/IslandHousePass';
import { runUndergroundJungleTreesPass } from '../src/world/gen/vanilla/UndergroundJungleTreesPass';
import { runQuickCleanupPass } from '../src/world/gen/vanilla/QuickCleanupPass';
import { runPotsPass } from '../src/world/gen/vanilla/PotsPass';
import { runHellforgesPass } from '../src/world/gen/vanilla/HellforgesPass';
import { runTrapsPass } from '../src/world/gen/vanilla/TrapsPass';
import { runPilesPass } from '../src/world/gen/vanilla/PilesPass';
import { runGrassWallPass } from '../src/world/gen/vanilla/GrassWallPass';
import {
  runSunflowersPart2Pass, runAlchemyHerbsPass, runDyePlantsPass, runVinesPass,
  runFlowersPass, runMushroomsPass, runLongMossPass, runLilypadsPass,
  runGrassPlantsPass, runGlowingMushroomPlantsPass, runJunglePlantsPart2Pass,
  runSurfaceOreAndStonePass, runFallenLogsPass,
} from '../src/world/gen/vanilla/SurfaceDecorPasses';
import { runWebsInSpiderCavesPass, runBeeLarvaPass } from '../src/world/gen/vanilla/HiveSpiderPass';
import { runCactusPalmTreesAndCoralPass } from '../src/world/gen/vanilla/StructuresPass';
import { runTileCleanupPass } from '../src/world/gen/vanilla/TileCleanupPass';
import { runBrokenTrapCleanupPass } from '../src/world/gen/vanilla/BrokenTrapCleanupPass';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { runTreePass } from '../src/world/gen/vanilla/TreePass';

const RUN = process.env.SW_WWW === 'rep';
const FROM = Number(process.env.SW_WWW_FROM ?? 54);
const TO = Number(process.env.SW_WWW_TO ?? 105);
const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }

const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
interface Ch { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array }
const chCache = new Map<number, Ch>();
function chans(idx: number): Ch {
  const hit = chCache.get(idx);
  if (hit) return hit;
  const b8 = (e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
  const b16 = (e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));
  const c: Ch = { t: b16('typ'), a: b8('act'), w: b16('wal'), l: b8('liq'), hf: b8('half'), sl: b8('slope'), lt: b8('lty'), ia: b8('inact') };
  chCache.set(idx, c);
  if (chCache.size > 8) chCache.delete(chCache.keys().next().value!);
  return c;
}

interface Boundary { gs: GenState; gensolid: Map<number, boolean>; fx: Uint16Array; fy: Uint16Array; wire: Uint8Array; ids35: Map<number, number>; chests: unknown[] }
const bCache = new Map<string, Boundary>();
function boundary(key: string): Boundary {
  const hit = bCache.get(key);
  if (hit) return hit;
  const dir = `${BDIR}/${key}`;
  if (!existsSync(`${dir}/gs.json`)) throw new Error(`no boundary ${key}`);
  const gs = JSON.parse(readFileSync(`${dir}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${dir}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${dir}/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
  const iw = new Uint32Array(readFileSync(`${dir}/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const chests = JSON.parse(readFileSync(`${dir}/chests.json`, 'utf8')) as unknown[];
  const b: Boundary = { gs, gensolid, fx, fy, wire, ids35, chests };
  bCache.set(key, b);
  return b;
}

interface PrevOut { type: Uint16Array; flags: Uint8Array; fx: Uint16Array; fy: Uint16Array; wire: Uint8Array }
function buildHybrid(baseIdx: number, b: Boundary | PrevOut): { st: TileStore; revMiss: number } {
  const c = chans(baseIdx);
  const st = new TileStore(W, H);
  const fromB = 'ids35' in b;
  const ids35 = fromB ? (b as Boundary).ids35 : null;
  let revMiss = 0;
  for (let i = 0; i < N; i++) {
    const act = c.a[i]!;
    st.flags[i] = act;
    if (act || c.t[i]) {
      const sh = c.t[i]!;
      let id = ids35 && ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) { id = REV.get(sh) ?? -1; }
      if (id < 0) { id = 0; revMiss++; }
      st.type[i] = id;
    } else st.type[i] = 0;
    st.wall[i] = c.w[i]!;
    st.liquid[i] = c.l[i]!;
    st.liquidType[i] = c.l[i] ? c.lt[i]! + 1 : 0;
    st.half[i] = c.hf[i]!;
    st.slope[i] = c.sl[i]!;
    st.wire[i] = c.ia[i]! ? 0x20 : 0;
    if (fromB) {
      const bb = b as Boundary;
      st.frameX[i] = bb.fx[i]; st.frameY[i] = bb.fy[i];
      st.wire[i] |= bb.wire[i];
    } else {
      const p = b as PrevOut;
      st.frameX[i] = p.fx[i]; st.frameY[i] = p.fy[i];
      st.wire[i] |= p.wire[i] & 0x1f;
    }
  }
  return { st, revMiss };
}
const prevOf = (st: TileStore): PrevOut => ({ type: st.type.slice(), flags: st.flags.slice(), fx: st.frameX.slice(), fy: st.frameY.slice(), wire: st.wire.slice() });

// ---- 八通道 diff（_mile8 cmp 口径）----
interface Row { idx: number; tag: string; dA: number; dT: number; dW: number; dL: number; dHf: number; dSl: number; dLt: number; dIa: number; first: string; pairs: Array<[string, number]>; samples: string[] }
function diffStore(tag: string, idx: number, st: TileStore): Row {
  const c = chans(idx);
  const r: Row = { idx, tag, dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0, first: '', pairs: [], samples: [] };
  const pair = new Map<string, number>();
  let firstI = -1;
  const mark = (i: number) => { if (firstI < 0) firstI = i; };
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { r.dA++; mark(i); if (r.samples.length < 10) r.samples.push(`A(${i % W},${(i / W) | 0}) v${va} j${ja}`); }
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { r.dT++; mark(i); const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 10) r.samples.push(`T(${i % W},${(i / W) | 0}) v${vt} j${jt}`); }
    if (c.w[i]! !== st.wall[i]!) { r.dW++; mark(i); if (r.samples.length < 10) r.samples.push(`W(${i % W},${(i / W) | 0}) v${c.w[i]} j${st.wall[i]}`); }
    if (c.l[i]! !== st.liquid[i]!) { r.dL++; mark(i); if (r.samples.length < 10) r.samples.push(`L(${i % W},${(i / W) | 0}) v${c.l[i]} j${st.liquid[i]}`); }
    if (c.hf[i]! !== st.half[i]!) { r.dHf++; mark(i); const k = `H${c.hf[i]}>${st.half[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 10) r.samples.push(`H(${i % W},${(i / W) | 0}) v${c.hf[i]} j${st.half[i]}`); }
    if (c.sl[i]! !== st.slope[i]!) { r.dSl++; mark(i); const k = `S${c.sl[i]}>${st.slope[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 10) r.samples.push(`S(${i % W},${(i / W) | 0}) v${c.sl[i]} j${st.slope[i]}`); }
    const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { r.dLt++; mark(i); const k = `Y${vl}>${jl}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 10) r.samples.push(`Y(${i % W},${(i / W) | 0}) v${vl} j${jl} liq${c.l[i]}`); }
    const via = c.ia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { r.dIa++; mark(i); if (r.samples.length < 10) r.samples.push(`I(${i % W},${(i / W) | 0}) v${via} j${jia}`); }
  }
  if (firstI >= 0) r.first = `(${firstI % W},${Math.floor(firstI / W)})`;
  r.pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => [k, n] as [string, number]);
  return r;
}
const isClean = (r: Row) => !(r.dA || r.dT || r.dW || r.dL || r.dHf || r.dSl || r.dLt || r.dIa);
function printRow(r: Row): void {
  const bad = !isClean(r);
  console.log(`${String(r.idx).padStart(3)} ${DUMPNAME.get(r.idx)} ← ${r.tag.padEnd(28)} ` +
    `A=${String(r.dA).padStart(6)} T=${String(r.dT).padStart(6)} W=${String(r.dW).padStart(5)} L=${String(r.dL).padStart(5)} ` +
    `Hf=${String(r.dHf).padStart(5)} Sl=${String(r.dSl).padStart(5)} Lt=${String(r.dLt).padStart(4)} Ia=${String(r.dIa).padStart(4)} ${bad ? '✗ ' + r.first : '✓'}`);
  if (bad) {
    console.log(`     pairs: ${r.pairs.map(([k, n]) => `${k}×${n}`).join(' ')}`);
    console.log(`     samples: ${r.samples.join(' | ')}`);
  }
}

// ---- 槽位计划 ----
type Chests = Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>;
interface Step {
  dump?: number;                       // 对拍 golden 槽
  base: number;                        // 输入基座 golden 槽
  run: (st: TileStore, gs: GenState, rng: RNG, chests: Chests, world: World) => void | Promise<void>;
}
interface SlotPlan { entry: string; steps: Step[] }

/** 跨槽生产者重算：shrineSpots / oceanTreasures（golden47/36 干净基座 + m_ 中途边界） */
function computeProducers(): { shrineSpots: Array<{ x: number; y: number }>; oceanTreasures: Array<{ x: number; y: number }> } {
  const mj = boundary('m_JungleShrines');
  const { st: stJ } = buildHybrid(47, mj);
  restoreGenSolid(mj.gensolid);
  const shrineSpots = runJungleShrinePass(stJ, new RNG(SEED), structuredClone(mj.gs) as GenState);
  const mo = boundary('m_OceanCaves');
  const { st: stO } = buildHybrid(36, mo);
  restoreGenSolid(mo.gensolid);
  const oceanTreasures = runOceanCavesPass(stO, new RNG(SEED), structuredClone(mo.gs) as GenState);
  return { shrineSpots, oceanTreasures };
}

async function runSettleStep(st: TileStore, gs: GenState, rng: RNG, world: World): Promise<void> {
  world.store = st;
  world.shimmerX = gs.shimmerX; world.shimmerY = gs.shimmerY;
  world.genWaterLine = gs.waterLine;
  if ((gs.dungeonSide as number) === 0) world.genDungeonExempt = null;
  else {
    const edge = Math.floor(world.w * 0.05), mid = Math.floor(world.w * 0.55);
    world.genDungeonExempt = gs.dungeonSide < 0
      ? { x0: edge, x1: Math.floor(world.w * 0.45), y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 }
      : { x0: mid, x1: world.w - edge, y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 };
  }
  await settleWorldLiquids(world, 'gen', undefined, rng);
  flipGenSolid([484], false);
}

// jsSlot → golden 槽步进表（JS 槽界 = s{jsSlot-1}；entry 槽的 gs/GenSolid 快照起）
// producersBox：shrineSpots/oceanTreasures 惰性重算后注入（闭包读盒子）
function makePlans(producersBox: { shrineSpots: Array<{ x: number; y: number }> | null; oceanTreasures: Array<{ x: number; y: number }> | null }): Map<number, SlotPlan> {
  const P = new Map<number, SlotPlan>();
  P.set(14, { entry: 's13', steps: [{ dump: 54, base: 53, run: (st, gs, rng) => runWaterfallLipPass(st, rng, gs) }] });
  P.set(15, { entry: 's14', steps: [{ dump: 55, base: 54, run: (st, gs) => runFragileIcePass(st, gs) }] });
  P.set(16, { entry: 's15', steps: [{ dump: 56, base: 55, run: (st, gs, rng) => runCaveWallVarietyPass(st, rng, gs) }] });
  P.set(17, { entry: 's16', steps: [{ dump: 57, base: 56, run: (st, gs, rng) => runLifeCrystalsPass(st, rng, gs) }] });
  P.set(18, {
    entry: 's17',
    steps: [
      { dump: 58, base: 57, run: (st, gs, rng) => runStatuesPass(st, rng, gs) },
      {
        dump: 59, base: 58,
        run: (st, gs, rng, chests) => {
          flipGenSolid([226, 162, 225, 190], true);
          rollHouseChestCounts(st, rng, gs);
          runBuriedChestsPass(st, rng, gs, chests);
          runUnderworldChestsPass(st, rng, gs, chests);
          runCaveHousesPass(st, rng, gs, chests);
          flipGenSolid([226, 162, 225, 190], false);
        },
      },
      { dump: 60, base: 59, run: (st, gs, rng, chests) => runSurfaceChestsPass(st, rng, gs, chests) },
      { dump: 61, base: 60, run: (st, gs, rng, chests) => runJungleChestsPass(st, rng, gs, chests, producersBox.shrineSpots!) },
      { dump: 62, base: 61, run: (st, gs, rng, chests) => { runUnderwaterChestsPass(st, rng, gs, chests, producersBox.oceanTreasures!); runWaterChestsPass(st, rng, gs, chests); } },
      { dump: 63, base: 62, run: (st, gs, rng, chests) => runSpiderNestPass(st, rng, gs, chests) },
    ],
  });
  P.set(19, { entry: 's18', steps: [{ dump: 64, base: 63, run: (st, gs, rng) => runGemCavesPass(st, rng, gs) }] });
  P.set(20, { entry: 's19', steps: [{ dump: 65, base: 64, run: (st, gs, rng) => runMossAndMossCavesPass(st, rng, gs) }] });
  P.set(21, { entry: 's20', steps: [{ dump: 66, base: 65, run: (st, gs, rng, chests) => runTemplePart2Pass(st, rng, gs, chests) }] });
  P.set(22, { entry: 's21', steps: [{ dump: 67, base: 66, run: (st, gs, rng) => runCaveWallsPass(st, rng, gs) }] });
  P.set(23, { entry: 's22', steps: [{ dump: 68, base: 67, run: (st, gs, rng) => runUndergroundJungleTreesPass(st, rng, gs) }] });
  P.set(24, { entry: 's23', steps: [{ dump: 69, base: 68, run: (st, gs, rng, chests) => runIslandHousePass(st, rng, gs, chests) }] });
  P.set(25, { entry: 's24', steps: [{ dump: 70, base: 69, run: (st, gs, rng) => runQuickCleanupPass(st, rng, gs) }] });
  P.set(26, { entry: 's25', steps: [{ dump: 71, base: 70, run: (st, gs, rng) => runPotsPass(st, rng, gs) }] });
  P.set(27, { entry: 's26', steps: [{ dump: 72, base: 71, run: (st, _gs, rng) => runHellforgesPass(st, rng) }] });
  P.set(28, { entry: 's27', steps: [{ dump: 73, base: 72, run: (st, gs) => spreadingGrassPass(st, gs) }] });
  P.set(29, { entry: 's28', steps: [{ dump: 74, base: 73, run: (st, gs, rng) => runSurfaceOreAndStonePass(st, rng, gs) }] });
  P.set(30, { entry: 's29', steps: [{ dump: 75, base: 74, run: (st, gs, rng) => runFallenLogsPass(st, rng, gs) }] });
  P.set(31, {
    entry: 's30',
    steps: [
      { base: 75, run: (st, gs, rng) => runSurfaceDecorPass(st, rng, gs) },   // JS 自造前置段（槽头新流）
      { dump: 76, base: 75, run: (st, gs, rng) => runTrapsPass(st, rng, gs) },
    ],
  });
  P.set(32, { entry: 's31', steps: [{ dump: 77, base: 76, run: (st, gs, rng) => runPilesPass(st, rng, gs) }] });
  P.set(33, { entry: 's32', steps: [{ dump: 78, base: 77, run: (st, gs, rng, _c, world) => spawnPointPass({ store: st, rng, world, surface: new Float32Array(W), cfg: {} as never }) }] });
  P.set(34, { entry: 's33', steps: [{ dump: 79, base: 78, run: (st, gs, rng) => runGrassWallPass(st, rng, gs) }] });
  P.set(35, { entry: 's34', steps: [{ dump: 81, base: 80, run: (st, gs, rng) => runSunflowersPart2Pass(st, rng, gs) }] });
  P.set(36, { entry: 's35', steps: [{ dump: 82, base: 81, run: (st, gs, rng) => runTreePass(st, rng, gs) }] });
  P.set(37, { entry: 's36', steps: [{ dump: 83, base: 82, run: (st, gs, rng) => runAlchemyHerbsPass(st, rng, gs) }] });
  P.set(38, { entry: 's37', steps: [{ dump: 84, base: 83, run: (st, gs, rng) => runDyePlantsPass(st, rng, gs) }] });
  P.set(39, { entry: 's38', steps: [{ dump: 85, base: 84, run: (st, gs, rng) => runWebsInSpiderCavesPass(st, rng, gs) }] });
  P.set(40, {
    entry: 's39',
    steps: [
      { dump: 86, base: 85, run: (st, _gs, rng) => runGrassPlantsPass(st, rng) },
      { dump: 87, base: 86, run: (st, gs, rng) => runGlowingMushroomPlantsPass(st, rng, gs) },
    ],
  });
  P.set(41, { entry: 's40', steps: [{ dump: 88, base: 87, run: (st, gs, rng) => runJunglePlantsPart2Pass(st, rng, gs) }] });
  P.set(42, { entry: 's41', steps: [{ dump: 89, base: 88, run: (st, gs, rng) => runVinesPass(st, rng, gs) }] });
  P.set(43, { entry: 's42', steps: [{ dump: 90, base: 89, run: (st, gs, rng) => runFlowersPass(st, rng, gs) }] });
  P.set(44, { entry: 's43', steps: [{ dump: 91, base: 90, run: (st, gs, rng) => runMushroomsPass(st, rng, gs) }] });
  P.set(45, {
    entry: 's44',
    steps: [
      { dump: 92, base: 91, run: (st, gs, rng) => runExposedGemsPass(st, rng, gs) },        // JS 现状=冰/地下/琥珀三段一气流（92 对拍=段间态）
      { dump: 93, base: 91, run: (st, gs, rng) => runExposedGemsPass(st, rng, gs) },        // 93 对拍（同输入重跑，终点态）
    ],
  });
  P.set(46, { entry: 's45', steps: [{ dump: 94, base: 93, run: (st, gs, rng) => runLongMossPass(st, rng, gs) }] });
  P.set(47, { entry: 's46', steps: [{ dump: 95, base: 94, run: (st, gs, rng) => runJungleMudWallsPass(st, rng, gs) }] });
  P.set(48, { entry: 's47', steps: [{ dump: 96, base: 95, run: (st, gs) => runBeeLarvaPass(st, gs) }] });
  P.set(49, { entry: 's48', steps: [{ dump: 97, base: 96, run: (st, gs, rng, _c, world) => runSettleStep(st, gs, rng, world) }] });
  P.set(50, { entry: 's49', steps: [{ dump: 98, base: 97, run: (st, gs, rng) => runCactusPalmTreesAndCoralPass(st, rng, gs) }] });
  P.set(51, { entry: 's50', steps: [{ dump: 99, base: 98, run: (st, gs, rng) => runTileCleanupPass(st, rng, gs) }] });
  P.set(52, { entry: 's51', steps: [{ dump: 100, base: 99, run: (st, gs) => runLihzahrdAltarPass(st, gs) }] });
  P.set(53, { entry: 's52', steps: [{ dump: 101, base: 100, run: (st, gs, rng, chests) => runMicroBiomesPass(st, rng, gs, chests) }] });
  P.set(54, { entry: 's53', steps: [{ dump: 102, base: 101, run: (st, gs, rng) => runLilypadsPass(st, rng, gs) }] });
  P.set(55, { entry: 's54', steps: [{ dump: 103, base: 102, run: (st, gs, rng) => runGemTreesPass(st, rng, gs) }] });
  P.set(56, { entry: 's55', steps: [{ dump: 104, base: 103, run: (st) => runBrokenTrapCleanupPass(st) }] });
  P.set(57, { entry: 's56', steps: [{ dump: 105, base: 104, run: (st, gs) => runFinalCleanupPass(st, gs) }] });
  return P;
}

(RUN ? it : it.skip)(`WWW tail replay ${FROM}..${TO}`, async () => {
  const t0 = Date.now();
  const producersBox: { shrineSpots: Array<{ x: number; y: number }> | null; oceanTreasures: Array<{ x: number; y: number }> | null } = { shrineSpots: null, oceanTreasures: null };
  const plans = makePlans(producersBox);
  const world = new World(W, H, SEED);
  const rows: Row[] = [];

  const slots = [...plans.keys()].filter(s => {
    const ds = plans.get(s)!.steps.map(x => x.dump ?? 999).filter(d => d < 999);
    return ds.some(d => d >= FROM && d <= TO);
  }).sort((a, b) => a - b);
  for (const s of slots) {
    const plan = plans.get(s)!;
    if (plan.steps.some(x => x.dump === 61 || x.dump === 62) && !producersBox.shrineSpots) {
      const producers = computeProducers();
      producersBox.shrineSpots = producers.shrineSpots; producersBox.oceanTreasures = producers.oceanTreasures;
      console.log(`producers: shrineSpots=${producersBox.shrineSpots.length} oceanTreasures=${producersBox.oceanTreasures.length}`);
    }
    const entry = boundary(plan.entry);
    const gs: GenState = structuredClone(entry.gs);
    restoreGenSolid(entry.gensolid);
    __setGenStateForProbe(gs);
    const chests = structuredClone(entry.chests) as Chests;
    let prev: PrevOut | null = null;
    for (const step of plan.steps) {
      const built = prev ? buildHybrid(step.base, prev) : buildHybrid(step.base, entry);
      if (built.revMiss) console.log(`  [revMiss] base=${step.base} cells=${built.revMiss}`);
      const rng = new RNG(SEED);
      await step.run(built.st, gs, rng, chests, world);
      if (step.dump !== undefined && step.dump >= FROM && step.dump <= TO) {
        rows.push(diffStore(`jsSlot${s}`, step.dump, built.st));
      }
      prev = prevOf(built.st);
    }
    __setGenStateForProbe(null);
  }
  for (const r of rows) printRow(r);
  const bad = rows.filter(r => !isClean(r));
  console.log(`\n★ 尾段裁决 ${FROM}..${TO}: ${rows.length} 槽对拍，自因差槽 ${bad.length} 个`);
  for (const r of bad) console.log(`  ✗ #${r.idx} ${DUMPNAME.get(r.idx)} first=${r.first} pairs=${r.pairs.slice(0, 4).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  console.log(`done ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 560_000);
