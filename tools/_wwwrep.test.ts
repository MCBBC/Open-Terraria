// WWW 批·阶段2（SW_WWW=rep）：尾段逐 pass 自因清查。
// 方法论：golden(N-1) 干净基座（8 通道 typ/act/wal/liq/lty/half/slope/inact；
// frameX/Y+wire 取 JS 管线同槽界快照——金标无帧/线通道；sheet3/5 内部 id 取 ids35）
// → JS 第 N 个 pass（新 RNG(SEED) 流，镜像 RunPass 每 pass 重播 WorldGenerator.cs:497）
// → 与 golden(N) 八通道对拍。任何差 = pass N 自身移植自因（上游 #32/#49 等债被基座隔离）。
// 用法：cd game && SW_WWW=rep SW_WWW_FROM=54 SW_WWW_TO=70 npx vitest run tools/_wwwrep.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } from '../src/data/items';
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
import { runCaveWallVarietyPass, runCaveWallsPass, runJungleMudWallsPass } from '../src/world/gen/vanilla/CaveWallsPass';
import { runLifeCrystalsPass, runCactusPalmTreesAndCoralPass, runAlchemyHerbsPass } from '../src/world/gen/vanilla/StructuresPass';
import { runStatuesPass } from '../src/world/gen/vanilla/StatuesPass';
import { rollHouseChestCounts, runCaveHousesPass } from '../src/world/gen/vanilla/CaveHousePass';
import { runBuriedChestsPass, runUnderworldChestsPass, runSurfaceChestsPass, runWaterChestsPass } from '../src/world/gen/vanilla/BuriedChestsPass';
import { runJungleChestsPass, runJungleShrinePass } from '../src/world/gen/vanilla/JungleShrinePass';
import { runOceanCavesPass, runUnderwaterChestsPass } from '../src/world/gen/vanilla/OceanCavesPass';
import { runSpiderNestPass } from '../src/world/gen/vanilla/HiveSpiderPass';
import { runGemCavesPass, runExposedGemsIcePass, runExposedGemsUndergroundPass, runGemTreesPass } from '../src/world/gen/vanilla/GemPasses';
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
  runSunflowersPart2Pass, runDyePlantsPass, runVinesPass,
  runFlowersPass, runMushroomsPass, runLongMossPass, runLilypadsPass,
  runGrassPlantsPass, runGlowingMushroomPlantsPass, runJunglePlantsPart2Pass,
  runSurfaceOreAndStonePass, runFallenLogsPass,
} from '../src/world/gen/vanilla/SurfaceDecorPasses';
import { runWebsInSpiderCavesPass, runBeeLarvaPass } from '../src/world/gen/vanilla/HiveSpiderPass';
import { runTileCleanupPass } from '../src/world/gen/vanilla/TileCleanupPass';
import { runBrokenTrapCleanupPass } from '../src/world/gen/vanilla/BrokenTrapCleanupPass';
import { runFinalCleanupPass } from '../src/world/gen/vanilla/FinalCleanupPass';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { __setTrackStepProbe, __setTfCellProbe } from '../src/world/gen/vanilla/TrackPass';
import { runTreePass } from '../src/world/gen/vanilla/TreePass';
import { backfillHybridFrames } from './www-framebackfill';

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
// ★套件门(2026-09-02)
// ★套件门(2026-09-02):夹具目录缺省不扫
if (RUN) for (const f of readdirSync(G2)){ const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }

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
  r.pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.SW_WWW_PAIRS ?? 8)).map(([k, n]) => [k, n] as [string, number]);
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
        // WWWW：SW_WWW_59G=all|fr,wire,chest —— #59 入口金标反事实注入
        // （TTTT 织入产物 059_Buried_Chests.{fr,wire,chest.tsv} = pass 头快照）。
        // 用于隔离 house#111 接受分歧的输入态（帧/线/箱注册表）债。
        dump: 59, base: 58,
        run: (st, gs, rng, chests) => {
          const g59 = (process.env.SW_WWW_59G ?? '').split(',').filter(Boolean);
          const on = (k: string) => g59.includes('all') || g59.includes(k);
          if (on('fr')) { injectGoldenFrames(st, '/tmp/tttt-fr/059_Buried_Chests.fr'); console.log('  [59G] golden frames injected'); }
          if (on('wire')) { injectGoldenWires(st, '/tmp/tttt-fr/059_Buried_Chests.wire'); console.log('  [59G] golden wires injected'); }
          if (on('chest')) {
            const gold = loadGoldenChests('/tmp/tttt-fr/059_Buried_Chests.chest.tsv');
            if (gold) { (chests as Chests).length = 0; (chests as Chests).push(...gold); console.log(`  [59G] golden chest registry injected (${gold.length})`); }
          }
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
      {
        // SSSS：placeTightWebs/placeDeco187 接入 CheckStalactite/帧杀引擎后读
        // 165/185/187/28 帧位——混合基座帧（金标 tile+s17 捕获期 JS 帧）局部错位
        // → 伪杀/伪活。与槽 32/45 同款入口覆盖回填。
        dump: 63, base: 62,
        run: (st, gs, rng, chests) => {
          const covm = new Uint8Array(N);
          const fwb = new Uint32Array(readFileSync('/tmp/www-b/s17/frames.bin').buffer.slice(0));
          for (let q = 0; q < fwb.length; q += 4) covm[fwb[q]] = 1;
          backfillHybridFrames(st, covm);
          runSpiderNestPass(st, rng, gs, chests);
        },
      },
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
  P.set(28, { entry: 's27', steps: [{ dump: 73, base: 72, run: (st, gs, rng) => spreadingGrassPass(st, gs, rng) }] });
  P.set(29, { entry: 's28', steps: [{ dump: 74, base: 73, run: (st, gs, rng) => runSurfaceOreAndStonePass(st, rng, gs) }] });
  P.set(30, { entry: 's29', steps: [{ dump: 75, base: 74, run: (st, gs, rng) => runFallenLogsPass(st, rng, gs) }] });
  P.set(31, {
    entry: 's30',
    steps: [
      // EEEE 批 2026-08-18：JS 自造 runSurfaceDecorPass 前置段已退役（WWW 定罪 1048 格）
      { dump: 76, base: 75, run: (st, gs, rng) => runTrapsPass(st, rng, gs) },
    ],
  });
  P.set(32, {
    entry: 's31',
    steps: [{
      dump: 77, base: 76,
      run: (st, gs, rng) => {
        // RRRR：金标侧 frameImportant 装饰缺帧/失真 → 几何回填（tools/www-framebackfill.ts）
        const covm = new Uint8Array(N);
        const fwb = new Uint32Array(readFileSync('/tmp/www-b/s31/frames.bin').buffer.slice(0));
        for (let q = 0; q < fwb.length; q += 4) covm[fwb[q]] = 1;
        backfillHybridFrames(st, covm);
        runPilesPass(st, rng, gs);
      },
    }],
  });
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
      {
        // SSSS：placeExposed 接入帧杀引擎后读邻格帧（CheckPot/Check3x2/165 族）——
        // 混合基座帧（金标 tile+捕获期 JS 帧）自相矛盾 → 伪杀（#93 探针 (212,707)
        // 陶罐 2x2 错位实证）。与槽 32 同款：入口 s44 覆盖图 + 几何/相位回填，
        // 经 prev 链传播进步 2。
        dump: 92, base: 91,
        run: (st, gs, rng) => {
          const covm = new Uint8Array(N);
          const fwb = new Uint32Array(readFileSync('/tmp/www-b/s44/frames.bin').buffer.slice(0));
          for (let q = 0; q < fwb.length; q += 4) covm[fwb[q]] = 1;
          backfillHybridFrames(st, covm);
          runExposedGemsIcePass(st, rng, gs);
        },
      },                                                                                          // ▶ExposedGemsInIceBiome
      { dump: 93, base: 92, run: (st, gs, rng) => runExposedGemsUndergroundPass(st, rng, gs) },   // ▶ExposedGemsUnderground（新流；世界基座=post-ice 92——OOOO 修：曾误用 91，金标 93 含冰段 178 → 281 假差）
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
  // TTTT 2026-08-19：金标帧直注（x86 织入探针 /tmp/tttt-app 落 /tmp/tttt-fr/*.fr——
  // 稀疏 {u32 idx,u16 fx,u16 fy}，pass 头快照 = 上一 pass 末态）。嵌合帧（金标 tile+
  // JS 捕获期帧）曾致 #99 ⑦ 137 方向读错（(605,782) 金标 (18,0) JS 无帧→dir 反）与
  // #101 金箱 style 过滤错位。env SW_WWW_GF=0 可关（默认开）。
  // WWWW：金标帧/线/注册表注入帮助函数提升为闭包级（s51/s53 + WWWW #59 反事实共用）
  const injectGoldenFrames = (st: InstanceType<typeof TileStore>, frPath: string) => {
    if (!existsSync(frPath)) return;
    const b = readFileSync(frPath);
    const cnt = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0, true);
    for (let q = 0; q < cnt; q++) {
      const off = 4 + q * 8;
      const idx = new DataView(b.buffer, b.byteOffset).getUint32(off, true);
      st.frameX[idx] = new DataView(b.buffer, b.byteOffset).getUint16(off + 4, true);
      st.frameY[idx] = new DataView(b.buffer, b.byteOffset).getUint16(off + 6, true);
    }
  };
  // 金标 wire 直注（TTTT：#101 DeadMans isAGoodSpot 27=27 实证——JS 逻辑 1:1，
  // 重放差纯 wire 输入债；.wire 通道 = 织入探针全网格快照）
  const injectGoldenWires = (st: InstanceType<typeof TileStore>, wirePath: string) => {
    if (!existsSync(wirePath)) return;
    const gw = new Uint8Array(readFileSync(wirePath).buffer.slice(0));
    for (let i = 0; i < N; i++) {
      const g = gw[i]! & 0x1f;
      st.wire[i] = (st.wire[i]! & ~0x1f) | g;
    }
  };
  // 金标宝箱注册表（.chest.tsv → Chests；vi→JS id 转换）
  const loadGoldenChests = (path: string): Chests | null => {
    if (!existsSync(path)) return null;
    const vanKey = (vid: number) => VANILLA_ITEM_KEY_BY_ID[vid];
    const gold: Chests = [];
    for (const ln of readFileSync(path, 'utf8').trim().split('\n')) {
      const f = ln.split('\t');
      const items: Chests[number]['items'] = [];
      for (let q = 3; q < f.length; q++) {
        if (f[q] === '-') { items.push(null); continue; }
        const [tid, stack] = f[q]!.split(',').map(Number);
        const key = vanKey(tid!);
        const jsId = key ? ITEM_BY_KEY[key] : undefined;
        items.push(jsId !== undefined ? { id: jsId, stack: stack! } : null);
      }
      gold.push({ x: Number(f[1]), y: Number(f[2]), items });
    }
    return gold;
  };
  if (process.env.SW_WWW_GF !== '0') {
    const s51 = P.get(51)!;
    s51.steps[0]!.run = (st, gs, rng, chests) => {
      injectGoldenFrames(st, '/tmp/tttt-fr/099_Tile_Cleanup.fr');
      injectGoldenWires(st, '/tmp/tttt-frw/099_Tile_Cleanup.wire');
      // UUUU ⑦：金标宝箱注册表注入（slot98 物品位真值——箱 style 反查 Chest.item[0]；
      // vi 键空间经 VANILLA_ITEM_KEY_BY_ID→ITEM_BY_KEY 转 JS id）
      try {
        const vanKey = (vid: number) => VANILLA_ITEM_KEY_BY_ID[vid];
        const lines = readFileSync('/tmp/tttt-fr/099_Tile_Cleanup.chest.tsv', 'utf8').trim().split('\n');
        const gold: Chests = [];
        for (const ln of lines) {
          const f = ln.split('\t');
          const items: Chests[number]['items'] = [];
          for (let q = 3; q < f.length; q++) {
            if (f[q] === '-') { items.push(null); continue; }
            const [tid, stack] = f[q]!.split(',').map(Number);
            const key = vanKey(tid!);
            const jsId = key ? ITEM_BY_KEY[key] : undefined;
            items.push(jsId !== undefined ? { id: jsId, stack: stack! } : null);
          }
          gold.push({ x: Number(f[1]), y: Number(f[2]), items });
        }
        (chests as Chests).length = 0;
        (chests as Chests).push(...gold);
      } catch { /* 文件缺失自动跳过 */ }
      runTileCleanupPass(st, rng, gs, chests as Chests);
    };
    const s53 = P.get(53)!;
    s53.steps[0]!.run = (st, gs, rng, chests) => {
      injectGoldenFrames(st, '/tmp/tttt-fr/101_Micro_Biomes.fr');
      injectGoldenWires(st, '/tmp/tttt-frw/101_Micro_Biomes.wire');
      runMicroBiomesPass(st, rng, gs, chests);
    };
  }
  P.set(54, { entry: 's53', steps: [{ dump: 102, base: 101, run: (st, gs, rng) => runLilypadsPass(st, rng, gs) }] });
  P.set(55, { entry: 's54', steps: [{ dump: 103, base: 102, run: (st, gs, rng) => runGemTreesPass(st, rng, gs) }] });
  P.set(56, { entry: 's55', steps: [{ dump: 104, base: 103, run: (st, _gs, rng) => runBrokenTrapCleanupPass(st, rng) }] });
  P.set(57, { entry: 's56', steps: [{ dump: 105, base: 104, run: (st, gs, rng) => runFinalCleanupPass(st, gs, rng, { frameSparse: true }) }] });  // ZZZ:传 rng(扫掷耗+⑭+ShimmerCleanUp);frameSparse=跳读帧杀族(s56 帧边界仅覆盖 JS 写过格)
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
      // UUUU：掷骰 span 记录（对拍 vanilla SW_TT_SPAN_PASSES 织入流）。包装对象
      // 与 RNG 鸭子类型兼容（run 步内一切嵌套调用同流记录）。
      const spanOut = process.env.SW_WWW_SPAN_OUT && process.env.SW_WWW_SPAN_DUMP === String(step.dump)
        ? process.env.SW_WWW_SPAN_OUT : undefined;
      // FFFFF:SW_WWW_SPAN_TRACK=1 → 掷序×TrackGenerator 逐列步进对照表
      // (roll idx → loop/k/x/y/playerHeight 变更行;定位 vanilla span 内嵌的
      //  独有掷在 TrackPass 语境中的精确落点)
      const trackLog: string[] = [];
      let spanRoll = 0;
      // FFFFF:JS 侧掷栈迹（SW_WWW_SPAN_JSTACK=from:to,配 SW_WWW_SPAN_TRACK 用）
      const jstk = (process.env.SW_WWW_SPAN_JSTACK ?? '').split(':').map(Number);
      const jstackLo = jstk.length === 2 && jstk.every(Number.isFinite) ? jstk[0]! : -1;
      const jstackHi = jstk.length === 2 && jstk.every(Number.isFinite) ? jstk[1]! : -1;
      const jstackLog: string[] = [];
      if (spanOut && process.env.SW_WWW_SPAN_TRACK === '1') {
        let lastStep = '';
        __setTrackStepProbe((loop, k, x, y, ph) => {
          const cur = `${loop} k=${k} (${x},${y}) ph=${ph}`;
          if (cur !== lastStep) { trackLog.push(`roll ${spanRoll} → ${cur}`); lastStep = cur; }
        });
        // FFFFF:SW_WWW_TF_SHEET=178,184 → 该 sheet 族 tf314 分派快照(掷位关联)
        const tfSheets = new Set((process.env.SW_WWW_TF_SHEET ?? '').split(',').map(Number).filter(Boolean));
        if (tfSheets.size) {
          const SHEETC = SHEET;
          (globalThis as { __tfSt?: InstanceType<typeof TileStore> }).__tfSt = built.st;
          __setTfCellProbe((sheet, x, y, fx, fy) => {
            if (tfSheets.has(sheet)) {
              const nb = (dx: number, dy: number) => { const st = (globalThis as { __tfSt?: InstanceType<typeof TileStore> }).__tfSt!; if (!st) return '?'; if (!st.inBounds(x + dx, y + dy)) return 'OoB'; const i = st.idx(x + dx, y + dy); return st.flags[i] ? `s${SHEETC[st.type[i]!]}sl${st.slope[i]}h${st.half[i]}` : 'air'; };
              trackLog.push(`roll ${spanRoll} TF sheet=${sheet} (${x},${y}) fx=${fx} fy=${fy} n(U,D,L,R)=${nb(0, -1)},${nb(0, 1)},${nb(-1, 0)},${nb(1, 0)}`);
            }
          });
        }
      }
      const spiderLog: string[] = [];
      if (process.env.SW_WWW_SPIDER) (globalThis as { __swSpiderVisit?: (cx: number, cy: number, k: string, b: number, a2: number, w: number) => void }).__swSpiderVisit = (cx, cy, k, b, a2, w) => spiderLog.push(`${w} ${k} ${cx},${cy} ${b}:${a2}`);
      // IIIII：SW_WWW_SPIDER2=/path → 蜘蛛分支级陈设日志（H/SW/AIR/FLR/CH/POT/CEIL/
      // TIGHT/D187/PR3/P1/P0 行，与 vanilla SpiderProbe 分支级织入逐行对拍）
      const spiderDeco: string[] = [];
      if (process.env.SW_WWW_SPIDER2) (globalThis as { __swSpiderDeco?: (s: string) => void }).__swSpiderDeco = (s) => spiderDeco.push(s);
      const rngW = spanOut ? new Proxy(rng, {
        get(target, prop, recv) {
          const v = Reflect.get(target, prop, target);
          // AAAAA：rng.vanilla（UnifiedRandom 直通）——next()=C# 裸 Next() 录 'n'
          if (prop === 'vanilla') {
            const ur = v as { next(): number };
            return { next: () => { const r = ur.next(); if (process.env.SW_WWW_SPAN_DN !== '0') { spanLines.push('n'); spanRoll++; } return r; } };
          }
          if (typeof v !== 'function') return v;
          const fname = String(prop);
          return (...args: number[]) => {
            const r = (v as (...a: number[]) => number).apply(target, args);
            let line = '';
            if (fname === 'nextInt') line = `a ${args[0]}`;
            else if (fname === 'int') line = `b ${args[0]} ${args[1]! + 1}`;
            else if (fname === 'nextIntRange') line = `b ${args[0]} ${args[1]}`;
            // AAAAA：全样本流 d/n 通道（对齐 XXXX 织入的 vanilla span 格式——
            //   NextDouble()→'d'、裸 Next()→'n'；SW_WWW_SPAN_DN=0 可关）
            else if (process.env.SW_WWW_SPAN_DN !== '0' && (fname === 'next' || fname === 'chance' || fname === 'range')) line = 'd';
            if (line) {
              spanLines.push(line); spanRoll++;
              // FFFFF:SW_WWW_SPAN_JSTACK=from:to → 掷区间栈迹(<out>.jstack.txt)
              if (jstackLo >= 0 && spanRoll >= jstackLo && spanRoll <= jstackHi) {
                jstackLog.push(`roll ${spanRoll} ${line}\n${new Error().stack}\n====`);
              }
            }
            return r;
          };
        },
      }) as RNG : rng;
      const spanLines: string[] = [];
      const segLog: string[] = [];
      if (spanOut) (globalThis as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg = (n, d) => segLog.push(n + ' ' + JSON.stringify(d));
      // WWWW：SW_WWW_HOUSE=/path + SW_WWW_HOUSE_DUMP=59 → 小屋序列日志
      // （bld=锚点+主题码 / er..bt=阶段 / ar=aging 房 w*100+h）
      const houseLog: string[] = [];
      // WWWW：SW_WWW_WATCH=/path → 目标格（/tmp/wwww-targets.json 索引数组）随
      // 小屋阶段事件（bld/er/st/do/pl/sb/bp/fr/ar/ch/bt）的首变时刻归因日志。
      const watchIdx: number[] | null = process.env.SW_WWW_WATCH ? JSON.parse(readFileSync('/tmp/wwww-targets.json', 'utf8')) : null;
      const watchState: Map<number, number> | null = watchIdx ? new Map() : null;
      const watchLog: string[] = [];
      if (process.env.SW_WWW_HOUSE && process.env.SW_WWW_HOUSE_DUMP === String(step.dump)) {
        (globalThis as { __swHouseStage?: (t: string, a: number, b: number, c: number, d: number) => void }).__swHouseStage
          = (t, a, b, c, d) => {
            houseLog.push(`${t} ${a} ${b} ${c} ${d}`);
            if (watchState && watchIdx) {
              for (const i of watchIdx) {
                if (!watchState.has(i)) {
                  // 惰性初始化：首事件前视为基线
                }
                const v = built.st.flags[i]! ? built.st.type[i]! : 0;
                if (!watchState.has(i) || watchState.get(i) !== v) {
                  if (watchState.has(i)) watchLog.push(`${t} h(${a},${b}) idx${i} (${i % W},${Math.floor(i / W)}) sheet=${SHEET[v] ?? -1}`);
                  watchState.set(i, v);
                }
              }
            }
          };
      }
      if (watchLog) { (globalThis as { __wwWatchFlush?: () => void }).__wwWatchFlush = () => { writeFileSync(process.env.SW_WWW_WATCH!, watchLog.join('\n') + '\n'); }; }
      await step.run(built.st, gs, spanOut ? rngW : rng, chests, world);
      (globalThis as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg = undefined;
      __setTrackStepProbe(undefined);
      __setTfCellProbe(undefined);
      (globalThis as { __tfSt?: InstanceType<typeof TileStore> }).__tfSt = undefined;
      if (trackLog.length) writeFileSync(spanOut.replace(/\.txt$/, '.track.txt'), trackLog.join('\n') + '\n');
      if (jstackLog.length) writeFileSync(spanOut.replace(/\.txt$/, '.jstack.txt'), jstackLog.join('\n') + '\n');
      if (houseLog.length) {
        (globalThis as { __swHouseStage?: (t: string, a: number, b: number, c: number, d: number) => void }).__swHouseStage = undefined;
        writeFileSync(process.env.SW_WWW_HOUSE!, houseLog.join('\n') + '\n');
        console.log(`  [housedump] dump=${step.dump} events=${houseLog.length} → ${process.env.SW_WWW_HOUSE}`);
        (globalThis as { __wwWatchFlush?: () => void }).__wwWatchFlush?.();
        (globalThis as { __wwWatchFlush?: () => void }).__wwWatchFlush = undefined;
      }
      if (spanOut && segLog.length) writeFileSync(spanOut.replace(/\.txt$/, '.seg.txt'), segLog.join('\n') + '\n');
      if (spanOut) { writeFileSync(spanOut, spanLines.join('\n') + '\n'); console.log(`  [spandump] dump=${step.dump} rolls=${spanLines.length} → ${spanOut}`); }
      (globalThis as { __swSpiderVisit?: (cx: number, cy: number, k: string, b: number, a2: number, w: number) => void }).__swSpiderVisit = undefined;
      if (process.env.SW_WWW_SPIDER) writeFileSync(process.env.SW_WWW_SPIDER, spiderLog.join('\n') + '\n');
      (globalThis as { __swSpiderDeco?: (s: string) => void }).__swSpiderDeco = undefined;
      if (process.env.SW_WWW_SPIDER2) { writeFileSync(process.env.SW_WWW_SPIDER2, spiderDeco.join('\n') + '\n'); console.log(`  [spiderdeco] dump=${step.dump} lines=${spiderDeco.length} → ${process.env.SW_WWW_SPIDER2}`); }
      if (step.dump !== undefined && step.dump >= FROM && step.dump <= TO) {
        rows.push(diffStore(`jsSlot${s}`, step.dump, built.st));
      }
      // UUUU：帧/线通道对拍（金标 .fr/.wire = pass 头快照）。SW_WWW_FRDUMP=99:/path
      // → 跑完 dump=99 的步后，把 JS 帧稀疏快照写到 /path（对照 099_Tile_Cleanup.fr）。
      if (process.env.SW_WWW_FRDUMP) {
        const [ds, out] = process.env.SW_WWW_FRDUMP.split(':');
        if (String(step.dump) === ds) {
          const parts: number[] = [0];
          const tparts: number[] = [];
          for (let i = 0; i < N; i++) {
            if (built.st.flags[i]) {
              parts.push(i, built.st.frameX[i]!, built.st.frameY[i]!);
              tparts.push(i, SHEET[built.st.type[i]!]! >= 0 ? SHEET[built.st.type[i]!]! : 9999);
            }
          }
          parts[0] = (parts.length - 1) / 3;
          writeFileSync(out, Buffer.from(new Uint32Array(parts).buffer, 0, parts.length * 4));
          writeFileSync(out.replace(/\.fr$/, '.frtyp'), Buffer.from(new Uint32Array(tparts).buffer, 0, tparts.length * 4));
          console.log(`  [frdump] dump=${step.dump} cells=${parts[0]} → ${out}`);
          // WWWW：全网格 wire 通道快照（对拍金标 NNN_Surface.wire = 上一 pass 末态）
          writeFileSync(out.replace(/\.fr$/, '.wire'), Buffer.from(built.st.wire.buffer.slice(0)));
          // WWWW：liquid+lty 全网格快照（lty 本仓库 +1 编码，比较时 -1）
          writeFileSync(out.replace(/\.fr$/, '.liq'), Buffer.from(built.st.liquid.buffer.slice(0)));
          writeFileSync(out.replace(/\.fr$/, '.lty'), Buffer.from(built.st.liquidType.buffer.slice(0)));
          console.log(`  [frdump] dump=${step.dump} wire → ${out.replace(/\.fr$/, '.wire')}`);
          if (process.env.SW_WWW_CHDUMP && String(step.dump) === process.env.SW_WWW_CHDUMP) {
            const sink = (chests as unknown as Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>)
              .map((c, q) => ({ slot: q, x: c.x, y: c.y, item0: c.items?.[0] ?? null }));
            writeFileSync(out.replace(/\.fr$/, '.chest.json'), JSON.stringify(sink));
            console.log(`  [chdump] dump=${step.dump} chests=${sink.length}`);
          }
        }
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
