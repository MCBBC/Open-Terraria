// ★IIIII213 一次性仪②：REMIX「二次沉降」单槽反演重放——load snap97-remix(≡x86
// dump097_Micro_Biomes) 忠实重放 liquidSettlePass(ctx,false)（WorldGen.ts:681-770,
// oceanStrip=false 分支 + IIII176 QuickWater 头臂 + IIII58 remix 落水分型带），
// 与 ~/GoldenChains/golden-remix/dumps/098_Settle_Liquids_Again 8 通道对拍。
// 用法：cd game && SW_I213R=1 npx vitest run tools/_iii213replay.test.ts
// 环境开关：SW_I213_MODE=van → vanilla 补臂试验（各 hypothesis 旗标）：
//   SW_I213_HYP=1..n 逐假设切换（见 HYP 说明）。
import { it } from 'vitest';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { settleWorldLiquids } from '../src/world/liquid/settle';
import { setBoulderSolidity } from '../src/world/gen/vanilla/TrapsPass';
import { flipGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I213R === '1';
const OUT = process.env.I213_OUT ?? '/tmp/iii213-out';
const G2 = process.env.I213_G2 ?? `${process.env.HOME}/GoldenChains/golden-remix/dumps`;
const W = 4200, H = 1200;
const HYP = process.env.SW_I213_HYP ?? '0';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN ? it : it.skip)('iii213 replay settle2 remix', async () => {
  mkdirSync(OUT, { recursive: true });
  const snap = JSON.parse(readFileSync(`${OUT}/snap97-remix.json`, 'utf8'));
  const dec = (k: string): ArrayBuffer => Buffer.from(snap.store[k], 'base64').buffer;
  const st = new TileStore(snap.w, snap.h, {
    type: dec('type'), flags: dec('flags'), frameX: dec('frameX'), frameY: dec('frameY'),
    wall: dec('wall'), liquid: dec('liquid'), liquidType: dec('liquidType'),
    half: dec('half'), slope: dec('slope'), wire: dec('wire'),
    paint: dec('paint'), paintWall: dec('paintWall'),
    coat: dec('coat'),
  });
  restoreGenSolid(new Map<number, boolean>(snap.genSolidOverrides));
  // ---- 基座自检：快照 vs x86 dump097（act/typ/liq 三通道逐位）----
  {
    let badA = 0, badT = 0, badL = 0;
    const names = dumpNames(G2);
    const idxD97 = findIdx(names, /^Micro_Biomes$/)!;
    const pre = `${G2}/${String(idxD97).padStart(3, '0')}_${names.get(idxD97)}`;
    const a97 = readFileSync(`${pre}.act`);
    const t97 = le16(`${pre}.typ`);
    const l97 = readFileSync(`${pre}.liq`);
    for (let i = 0; i < W * H; i++) {
      if (a97[i] !== (st.flags[i] & 1)) badA++;
      else if (a97[i] && t97[i] !== SHEET[st.type[i]]) badT++;
      if (l97[i] !== st.liquid[i]) badL++;
    }
    console.log(`base-check vs #${idxD97}: A-diff=${badA} T-diff=${badT} L-diff=${badL}`);
    if (badA + badT + badL > 0) console.log('!! 基座与 097 不齐——快照/金标不匹配,以下结论无效');
  }
  // ---- GenState 最小承载 ----
  const p = snap.gsPick;
  const gs = {
    w: snap.w, h: snap.h,
    seed: p.seed,
    seedFlags: { ...p.seedFlags },
    worldSurface: p.worldSurface, rockLevel: p.rockLevel,
    lavaLine: p.lavaLine, beachDistance: p.beachDistance,
    dungeonSide: p.dungeonSide ?? 1,
    shimmerX: p.shimmerX ?? -1, shimmerY: p.shimmerY ?? -1,
    waterLine: p.waterLine ?? 0,
  } as unknown as GenState & Record<string, number>;
  // ---- 最小 World 承载 ----
  const world = {
    w: snap.w, h: snap.h, seed: p.seed, store: st,
    groundLevel: p.worldSurface, rockLevel: p.rockLevel,
    shimmerX: p.shimmerX ?? -1, shimmerY: p.shimmerY ?? -1,
    genWaterLine: 0, genDungeonExempt: null as null | { x0: number; x1: number; y0: number; y1: number },
    genRemixWater: null as null | { lavaLine: number; rockLevel: number; oceanLevel: number },
  };
  // ---- 观测钩 ----
  const evs: string[] = [];
  (globalThis as unknown as Record<string, unknown>).__swLqKill =
    (x: number, y: number, sheet: number) => { evs.push(`K ${x},${y} s${sheet}`); };
  const origSet = TileStore.prototype.setTileSilent;
  TileStore.prototype.setTileSilent = function (this: unknown, x: number, y: number, t?: number, fx?: number, fy?: number) {
    evs.push(`W ${x},${y} t${t}`);
    return origSet.call(this, x, y, t, fx, fy);
  } as typeof TileStore.prototype.setTileSilent;
  // ---- liquidSettlePass(ctx,false) 忠实副本（oceanStrip=false 分支）----
  const rng = new RNG(p.seed);
  rng.reseed(p.seed);
  try {
    // 槽头参数面（WorldGen.ts:683-736）：remix 走 remixWaterRule + 地牢豁免盒
    (world as unknown as { genWaterLine: number }).genWaterLine = gs.waterLine;
    if ((gs.dungeonSide as number) === 0) {
      world.genDungeonExempt = null;
    } else {
      const edge = Math.floor(world.w * 0.05);
      const mid = Math.floor(world.w * 0.55);
      world.genDungeonExempt = gs.dungeonSide < 0
        ? { x0: edge, x1: Math.floor(world.w * 0.45), y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 }
        : { x0: mid, x1: world.w - edge, y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 };
    }
    world.genRemixWater = {
      lavaLine: gs.lavaLine,
      rockLevel: gs.rockLevel,
      oceanLevel: (gs.worldSurface + gs.rockLevel) / 2 + 40,
    };
    // ★IIIII176 QuickWater(3) 头臂（WorldGen.ts:744-746）
    flipGenSolid([379], true);
    setBoulderSolidity(false);
    flipGenSolid([546], false);
    if (process.env.SW_I213_PHASE === 'quick') {
      // 相位切分：只跑 QuickWater(+头部 waterCheck)，不跑 10 轮 UpdateLiquid
      // （settleWorldLiquids 内部结构镜像——quickWater→waterCheck→quickSettle 轮）
      const { LiquidSim } = await import('../src/world/liquid/LiquidSim');
      const sim = new LiquidSim(world as never);
      sim.passRand = (max) => rng.nextInt(max);
      sim.passRng = rng;
      sim.isGeneratingOrLoadingWorld = true;
      sim.generatingWorld = true;
      sim.applyGenSolidOverrides((await import('../src/world/gen/vanilla/GenSolid')).snapshotGenSolid());
      sim.worldGenTilesIgnoreWater(true);
      sim.quickWater();
      sim.waterCheck();
      sim.worldGenTilesIgnoreWater(false);
      sim.dispose();
      // K 六通道落盘（与 rig SW_LIQDUMP_AT 同编码）——纯 QuickWater+WC 末态
      {
        const { writeFileSync: wf, mkdirSync: mk } = await import('node:fs');
        mk(`${OUT}/jquick`, { recursive: true });
        const n2 = st.w * st.h;
        const typ = Buffer.alloc(n2 * 2), wal = Buffer.alloc(n2 * 2);
        const act = Buffer.alloc(n2), liq = Buffer.alloc(n2), lt = Buffer.alloc(n2), ia = Buffer.alloc(n2);
        for (let q = 0; q < n2; q++) {
          typ[q * 2] = SHEET[st.type[q]]! & 0xff; typ[q * 2 + 1] = (SHEET[st.type[q]]! >> 8) & 0xff;
          act[q] = st.flags[q] & 1;
          wal[q * 2] = st.wall[q] & 0xff; wal[q * 2 + 1] = (st.wall[q] >> 8) & 0xff;
          liq[q] = st.liquid[q];
          lt[q] = st.liquidType[q] === 0 ? 0 : st.liquidType[q] - 1;
          ia[q] = (st.wire[q] >>> 5) & 1;
        }
        wf(`${OUT}/jquick/K.typ`, typ); wf(`${OUT}/jquick/K.act`, act); wf(`${OUT}/jquick/K.wal`, wal);
        wf(`${OUT}/jquick/K.liq`, liq); wf(`${OUT}/jquick/K.lty`, lt); wf(`${OUT}/jquick/K.inact`, ia);
        console.log('[i213] jquick K dump written');
      }
    } else {
      await settleWorldLiquids(world as never, 'gen', undefined, rng, false);
    }
    // 尾臂（WorldGen.ts:753-754 + pass 尾 cs:21485）
    setBoulderSolidity(true);
    flipGenSolid([546], true);
    flipGenSolid([10, 192, 191, 190], true);
    flipGenSolid([484], false);
  } finally {
    delete (globalThis as unknown as Record<string, unknown>).__swLqKill;
    TileStore.prototype.setTileSilent = origSet;
  }
  writeFileSync(`${OUT}/j-settle2-replay-remix${HYP !== '0' ? `-h${HYP}` : ''}.txt`, evs.join('\n') + '\n');
  // ---- 对拍 dump098 ----
  const names = dumpNames(G2);
  const idxD = findIdx(names, /^Settle_Liquids_Again$/)!;
  const pre = `${G2}/${String(idxD).padStart(3, '0')}_${names.get(idxD)}`;
  const c = {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`),
    l: readFileSync(`${pre}.liq`), hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`),
    lt: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
  };
  const groups = new Map<string, number[]>();
  const push = (g: string, i: number) => {
    const arr = groups.get(g) ?? [];
    arr.push(i);
    groups.set(g, arr);
  };
  for (let i = 0; i < W * H; i++) {
    const va = c.a[i], ja = st.flags[i] & 1;
    const vt = va ? c.t[i] : 0;
    const jt = ja ? (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999) : 0;
    if (va !== ja) push(`A${va}>${ja}`, i);
    if (vt !== jt) push(`T${vt}>${jt}`, i);
    if (c.w[i] !== st.wall[i]) push(`W${c.w[i]}>${st.wall[i]}`, i);
    if (c.l[i] !== st.liquid[i]) push(`L${c.l[i]}>${st.liquid[i]}`, i);
    if (c.hf[i] !== st.half[i]) push(`H${c.hf[i]}>${st.half[i]}`, i);
    if (c.sl[i] !== st.slope[i]) push(`S${c.sl[i]}>${st.slope[i]}`, i);
    const vl = c.l[i] > 0 ? c.lt[i] + 1 : 0;
    const jl = st.liquid[i] > 0 ? st.liquidType[i] : 0;
    if (vl !== jl) push(`Y${vl}>${jl}`, i);
    const via = c.ia[i] ? 1 : 0;
    const jia = (st.wire[i] >>> 5) & 1;
    if (via !== jia) push(`I${via}>${jia}`, i);
  }
  const lines = [`dump=${idxD}_${names.get(idxD)} (HYP=${HYP})`];
  let total = 0;
  for (const [k, arr] of groups) {
    const uq = [...new Set(arr)].sort((a, b) => a - b);
    total += uq.length;
    lines.push(`== ${k} ×${uq.length}: ${uq.slice(0, 60).map(fmtCell).join(' ')}`);
  }
  lines.push(`totalDiffCells≈${total}`);
  writeFileSync(`${OUT}/res-settle2-remix${HYP !== '0' ? `-h${HYP}` : ''}.txt`, lines.join('\n') + '\n');
  console.log(lines.slice(0, 40).join('\n'));
}, 600_000);

function fmtCell(i: number): string {
  return `(${i % W},${Math.floor(i / W)})`;
}
function dumpNames(dir: string): Map<number, string> {
  const m = new Map<number, string>();
  for (const f of readdirSync(dir)) {
    const mm = f.match(/^(\d{3})_(.+)\.typ$/);
    if (mm) m.set(Number(mm[1]), mm[2]);
  }
  return m;
}
function findIdx(names: Map<number, string>, re: RegExp): number | undefined {
  for (const [k, nm] of names) if (re.test(nm)) return k;
  return undefined;
}
