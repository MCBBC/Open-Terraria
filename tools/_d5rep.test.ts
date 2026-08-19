// DDDDD 一次性诊断 v3：活动列表规模/缓冲器介入监测 + y198 薄膜事件追踪。
// 用法：cd game && SW_D5=1 npx vitest run tools/_d5rep.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG, translateSeed } from '../src/core/rng';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { World } from '../src/world/World';

const RUN = process.env.SW_D5 === '1';
const G2 = process.env.SW_D5_G2 ?? '/tmp/sw-slp/g-m20260811';
const W = Number(process.env.SW_D5_W ?? 6400), H = Number(process.env.SW_D5_H ?? 1800), N = W * H;
const SEED = process.env.SW_D5_SEED ?? '20260811';
const EVIL = Number(process.env.SW_D5_EVIL ?? 0);
const TRACE = process.env.SW_D5_TRACE === '1';
// 追踪窗（y198 湖）
const TX0 = 4768, TX1 = 4846, TY0 = 196, TY1 = 201;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
const readU8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p).buffer.slice(0));
const readU16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const G48 = {
  t: readU16(`${G2}/048_Jungle_Chests.typ`), a: readU8(`${G2}/048_Jungle_Chests.act`),
  l: readU8(`${G2}/048_Jungle_Chests.liq`), lt: readU8(`${G2}/048_Jungle_Chests.lty`), w: readU16(`${G2}/048_Jungle_Chests.wal`),
};
const G49L = readU8(`${G2}/049_Settle_Liquids.liq`);

(RUN ? it : it.skip)('DDDDD liquid list/buffer monitor + film trace', async () => {
  let fx: Uint16Array | null = null, fy: Uint16Array | null = null, wire: Uint8Array | null = null;
  let gens: Map<number, boolean> | null = null;
  let wl = 0, shX = 0, shY = 0, ex: unknown = null;
  const sentinel = new Error('__d5_stop__');
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      onWorldPartial: (w, i) => {
        if (i === 8) { fx = w.store.frameX.slice(); fy = w.store.frameY.slice(); wire = w.store.wire.slice(); gens = snapshotGenSolid(); }
        if (i === 9) { wl = w.genWaterLine; shX = w.shimmerX; shY = w.shimmerY; ex = w.genDungeonExempt; throw sentinel; }
      },
    });
  } catch (e) { if (e !== sentinel) throw e; }

  const world = new World(W, H, translateSeed(SEED), 'd5');
  const st = world.store;
  for (let i = 0; i < N; i++) {
    const jid = REV.get(G48.t[i]!);
    st.type[i] = jid ?? 0;
    st.flags[i] = G48.a[i]! & 1;
    st.wall[i] = G48.w[i]!;
    st.liquid[i] = G48.l[i]!;
    st.liquidType[i] = G48.l[i]! > 0 ? G48.lt[i]! + 1 : 0;
  }
  st.frameX.set(fx!); st.frameY.set(fy!); st.wire.set(wire!);
  restoreGenSolid(gens!);

  const sim = new LiquidSim(world);
  const rng = new RNG(translateSeed(SEED));
  sim.passRand = (max) => rng.nextInt(max);
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.shimmerCenter = shX > 0 ? { x: shX, y: shY } : null;
  if (wl > 0) {
    sim.genWaterLine = wl;
    const d = ex as { x0: number; x1: number; y0: number; y1: number } | null;
    if (d) sim.dungeonWaterExempt = (x, y, w2) => x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1 && (w2 === 7 || w2 === 8 || w2 === 9 || (w2 >= 94 && w2 <= 99));
  }
  sim.applyGenSolidOverrides(snapshotGenSolid());
  sim.worldGenTilesIgnoreWater(true);

  // ---- 监测器：updateLiquid 打点（numLiquid/buffer 峰值） ----
  let maxNL = 0, maxBuf = 0, bufEngaged = 0, sweeps = 0;
  const anySim = sim as unknown as { updateLiquid: () => void };
  const oUL = anySim.updateLiquid.bind(sim);
  let ulCall = 0;
  anySim.updateLiquid = () => {
    ulCall++;
    oUL();
    sweeps++;
    const nl = sim.numLiquid, bl = sim.bufferLen;
    if (nl > maxNL) maxNL = nl;
    if (bl > maxBuf) maxBuf = bl;
    if (bl > 0) bufEngaged++;
  };

  // ---- 薄膜事件追踪（r0 起） ----
  const evs: string[] = [];
  if (TRACE) {
    const inW = (x: number, y: number) => x >= TX0 && x <= TX1 && y >= TY0 && y <= TY1;
    const anyS2 = sim as unknown as {
      update: (e: { x: number; y: number; kill: number; delay: number }) => void;
      addWater: (x: number, y: number) => void;
    };
    const oUpd = anyS2.update.bind(sim);
    anyS2.update = (e) => {
      const i = e.y * W + e.x;
      const b = st.liquid[i];
      oUpd(e);
      if (inW(e.x, e.y)) evs.push(`u#${ulCall} (${e.x},${e.y}) ${b}->${st.liquid[i]} k${e.kill} d${e.delay}`);
    };
    const oAdd = anyS2.addWater.bind(sim);
    let addN = 0;
    anyS2.addWater = (x, y) => {
      const r = oAdd(x, y);
      if (inW(x, y) && st.liquid[y * W + x] > 0) evs.push(`  +aw#${ulCall} (${x},${y}) nl${sim.numLiquid}`);
      addN++;
      return r;
    };
  }

  sim.quickWater();
  console.log(`after qw: numLiquid=${sim.numLiquid} buf=${sim.bufferLen}`);
  sim.waterCheck();
  console.log(`after wc0: numLiquid=${sim.numLiquid} buf=${sim.bufferLen}`);
  // wc0 列表中 y198 湖成员及其位置
  {
    const liq = (sim as unknown as { liquids: Array<{ x: number; y: number; kill: number }> }).liquids;
    const pos: string[] = [];
    for (let q = 0; q < sim.numLiquid; q++) { const e = liq[q]; if (e.x >= TX0 && e.x <= TX1 && e.y >= TY0 && e.y <= TY1) pos.push(`[${q}](${e.x},${e.y},k${e.kill})`); }
    console.log(`wc0 list members in window: ${pos.join(' ')}`);
  }
  sim.quickSettle = true;
  for (let round = 0; round < 10; round++) {
    let it2 = 0;
    const MAX_ITER = (sim.numLiquid + sim.bufferLen) * 5;
    while (sim.numLiquid > 0 && it2 < MAX_ITER) { sim.updateLiquid(); it2++; }
    sim.waterCheck();
    console.log(`r${round}: ${it2} calls, nl=${sim.numLiquid} buf=${sim.bufferLen} | maxNL=${maxNL} maxBuf=${maxBuf} bufEngaged=${bufEngaged}`);
    if (round === 0 && TRACE) {
      const i198 = 198 * W;
      const row: string[] = [];
      for (let x = TX0; x <= TX1; x++) row.push(String(st.liquid[i198 + x]!));
      console.log(`r0 y198[${TX0}-${TX1}]: ${row.join(',')}`);
      console.log(`--- film events (${evs.length}) first 400:`);
      for (const e of evs.slice(0, 400)) console.log(e);
    }
  }
  sim.quickSettle = false;
  sim.worldGenTilesIgnoreWater(false);
  sim.finalGenMergeCheck();
  let dL = 0;
  for (let i = 0; i < N; i++) if (st.liquid[i] !== G49L[i]) dL++;
  console.log(`final dL49=${dL} maxNL=${maxNL} maxBuf=${maxBuf} bufEngaged=${bufEngaged} sweeps=${sweeps}`);
}, 900_000);
