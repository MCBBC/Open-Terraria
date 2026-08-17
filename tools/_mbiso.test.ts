// 一次性（尾批 2-A）：#98 CactusPalmTreesAndCoral + #101 MicroBiomes 隔离重放。
//   #98: dump097(SettleLiquidsAgain 末) → runCactusPalmTreesAndCoralPass → dump098
//        原版 N=1,268,797（passchain stream 哈希 FNV 反解，/tmp/sw-mbcal.mjs）
//   #101: dump100(LihzahrdAltars 末) → runMicroBiomesPass → dump101
//        原版 N=1,655,134
// gs/GenSolid/额外通道捕获：真管线 pass 头（__swCcCap/__swMbCap 钩子）。
// 注意：#97 二次沉降修复后管线时点才与 dump097 对齐——液体通道以 dump 为准，
// liquidType/slope/half/frameX/frameY 用捕获 bin（settle 不写这些通道）。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { World } from '../src/world/World';
import { settleWorldLiquids } from '../src/world/liquid/settle';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { runCactusPalmTreesAndCoralPass } from '../src/world/gen/vanilla/StructuresPass';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const NAMES: Record<number, string> = {
  96: 'Larva', 97: 'Settle_Liquids_Again', 98: 'Cactus__Palm_Trees____Coral',
  100: 'Lihzahrd_Altars', 101: 'Micro_Biomes',
};
const VN = { cc: 1268797, mb: 1655134 };
const load = (idx: number, ext: string) => readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${NAMES[idx]}.${ext}`);

const REV = new Map<number, number>();
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!REV.has(s)) REV.set(s, i); }
}
SHEET[0] = 0;

function buildStore(idx: number, extra?: Record<string, Uint8Array | Uint16Array>): TileStore {
  const t = new Uint16Array(load(idx, 'typ').buffer.slice(0));
  const a = load(idx, 'act');
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = extra?.liqtype ? (extra.liqtype as Uint8Array)[i]! : (l[i]! > 0 ? 1 : 0);
  }
  if (extra) {
    if (extra.slope) st.slope.set(extra.slope as Uint8Array);
    if (extra.half) st.half.set(extra.half as Uint8Array);
    if (extra.frameX) st.frameX.set(extra.frameX as Uint16Array);
    if (extra.frameY) st.frameY.set(extra.frameY as Uint16Array);
    if (extra.wire) st.wire.set(extra.wire as Uint8Array);
  }
  return st;
}

/** x86 真值额外通道(/tmp/sw-mb-hs97|100,HsProbe SW_HS_DUMP)：
 *  half/slope 直抄;lty 原版 0基 → 本仓 +1 编码(仅 liquid>0 格);inact → 致动线位 32。 */
function truthExtra(tag: '96' | '97' | '100'): Record<string, Uint8Array | Uint16Array> | undefined {
  const rd = (e: string) => new Uint8Array(readFileSync(`/tmp/sw-mb-hs${tag}.${e}`).buffer.slice(0));
  try {
    const half = rd('half'), slope = rd('slope'), lty = rd('lty'), inact = rd('inact');
    const liq = load(tag === '97' ? 97 : tag === '96' ? 96 : 100, 'liq');
    const ltyJ = new Uint8Array(W * H), wire = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      ltyJ[i] = liq[i]! > 0 ? lty[i]! + 1 : 0;
      wire[i] = inact[i] ? 32 : 0;
    }
    return { half, slope, liqtype: ltyJ, wire };
  } catch { return undefined; }
}

/** 真值宝箱清单(wld 槽位序 = 创建序;末 2 槽 = 本 pass 内 Mahogany 常春藤箱,剔除)。
 *  候选帧修复:t21/fx36(金箱 style1) 与 t467/fx144(本 pass 转化后的死箱——回放前
 *  等价 style1 金箱)统一重写为 21@36;其余箱帧不动(本 pass 不读)。 */
function truthChests(): Array<{ x: number; y: number }> {
  const raw = JSON.parse(readFileSync('/tmp/sw-mb-chests2.json', 'utf8')) as Array<{ x: number; y: number; t: number; fx: number; fy: number }>;
  return raw.slice(0, raw.length - 2).map((c) => ({ x: c.x, y: c.y }));
}
function applyChestFrames(st: TileStore): Array<{ x: number; y: number }> {
  const raw = JSON.parse(readFileSync('/tmp/sw-mb-chests2.json', 'utf8')) as Array<{ x: number; y: number; t: number; fx: number; fy: number }>;
  const list = raw.slice(0, raw.length - 2);
  const chest = REV.get(21)!;
  for (const c of list) {
    if (!st.inBounds(c.x, c.y)) continue;
    const i = st.idx(c.x, c.y);
    if ((c.t === 21 && c.fx === 36) || (c.t === 467 && c.fx === 144)) {
      st.type[i] = chest; st.frameX[i] = 36; st.frameY[i] = 0; st.flags[i] = 1;
    }
  }
  return list.map((c) => ({ x: c.x, y: c.y }));
}

function diff(st: TileStore, idx: number, label: string) {
  const t = new Uint16Array(load(idx, 'typ').buffer.slice(0));
  const a = load(idx, 'act');
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
  let typ = 0, act = 0, wal = 0, liq = 0;
  const pairs = new Map<string, number>();
  const samples: string[] = [];
  const regs = new Map<string, number>();
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    let jT = st.type[i];
    if (jT !== 0) jT = SHEET[jT] ?? -1;
    const dT = jT !== t[i], dA = (st.flags[i] !== 0) !== (a[i] !== 0), dW = st.wall[i] !== w[i], dL = st.liquid[i] !== l[i];
    if (!(dT || dA || dW || dL)) continue;
    mask[i] = 1;
    if (dT) { typ++; pairs.set(`t${jT}>${t[i]}`, (pairs.get(`t${jT}>${t[i]}`) ?? 0) + 1); }
    if (dA) act++;
    if (dW) { wal++; pairs.set(`w${st.wall[i]}>${w[i]}`, (pairs.get(`w${st.wall[i]}>${w[i]}`) ?? 0) + 1); }
    if (dL) liq++;
    const x = i % W, y = (i / W) | 0;
    const rk = `x${(x / 300) | 0}y${(y / 300) | 0}`;
    regs.set(rk, (regs.get(rk) ?? 0) + 1);
    if (samples.length < 14) samples.push(`(${x},${y})t${jT}>${t[i]}a${st.flags[i] ? 1 : 0}>${a[i]}w${st.wall[i]}>${w[i]}L${st.liquid[i]}>${l[i]}`);
  }
  console.log(`${label}: typ=${typ} act=${act} wal=${wal} liq=${liq}`);
  console.log('  pairs:', JSON.stringify([...pairs.entries()].sort((p, q) => q[1] - p[1]).slice(0, 16)));
  console.log('  regions:', JSON.stringify([...regs.entries()].sort((p, q) => q[1] - p[1]).slice(0, 8)));
  console.log('  samples:', samples.join(' | '));
  return { typ, act, wal, liq, mask };
}

/** 行主序首个 diff 格 5×7 三方对拍（入口 dump / 原版出口 dump / JS 出口） */
function firstDiffCells(st: TileStore, inIdx: number, outIdx: number, n = 3) {
  const tI = new Uint16Array(load(inIdx, 'typ').buffer.slice(0));
  const aI = load(inIdx, 'act');
  const tO = new Uint16Array(load(outIdx, 'typ').buffer.slice(0));
  const aO = load(outIdx, 'act');
  const cells: Array<[number, number]> = [];
  for (let i = 0; i < W * H && cells.length < n; i++) {
    let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
    if (jT !== tO[i] || (st.flags[i] !== 0) !== (aO[i] !== 0)) cells.push([i % W, (i / W) | 0]);
  }
  for (const [bx, by] of cells) {
    const rows: string[] = [];
    for (let dy = -2; dy <= 2; dy++) {
      let rI = '', rO = '', rJ = '';
      for (let dx = -3; dx <= 3; dx++) {
        const i = (by + dy) * W + bx + dx;
        rI += `${tI[i]}${aI[i] ? '*' : '.'} `;
        rO += `${tO[i]}${aO[i] ? '*' : '.'} `;
        let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
        rJ += `${jT}${st.flags[i] ? '*' : '.'} `;
      }
      rows.push(`y${by + dy}: in[${rI}] van[${rO}] js[${rJ}]`);
    }
    console.log(`首diff格(${bx},${by}) 5×7:\n  ` + rows.join('\n  '));
  }
  return cells;
}

function countedRng(seed: number) {
  const rng = new RNG(seed);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  const box = { n: 0 };
  ur.internalSample = () => { box.n++; return orig(); };
  return { rng, box };
}

function cloneGs(gs: GenState): GenState {
  const c = { ...gs } as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (Array.isArray(v)) c[k] = v.map((e) => (e && typeof e === 'object' ? { ...(e as object) } : e));
    else if (v instanceof Int32Array) c[k] = v.slice();
    else if (v instanceof Uint8Array) c[k] = v.slice();
    else if (v instanceof Uint16Array) c[k] = v.slice();
    else if (v && typeof v === 'object') c[k] = { ...(v as Record<string, unknown>) };
  }
  return c as unknown as GenState;
}

const only = (process.env.SW_ONLY ?? '').split(',').filter(Boolean);
const want = (k: string) => only.length === 0 || only.includes(k);

const EXTRA_CH = ['liqtype', 'slope', 'half', 'frameX', 'frameY'] as const;
const extraPath = (tag: string, ch: typeof EXTRA_CH[number]) => `/tmp/sw-mb-${tag}-${ch}.bin`;
function dumpExtra(tag: string, st: TileStore) {
  for (const ch of EXTRA_CH) {
    try {
      const arr = ch === 'liqtype' ? st.liquidType : ch === 'slope' ? st.slope
        : ch === 'half' ? st.half : ch === 'frameX' ? st.frameX : st.frameY;
      writeFileSync(extraPath(tag, ch), arr as Uint8Array | Uint16Array);
    } catch { /* ignore */ }
  }
}
function loadExtra(tag: string): Record<string, Uint8Array | Uint16Array> | undefined {
  if (!existsSync(extraPath(tag, 'frameX'))) return undefined;
  const out: Record<string, Uint8Array | Uint16Array> = {};
  for (const ch of EXTRA_CH) {
    try {
      const buf = readFileSync(extraPath(tag, ch));
      out[ch] = ch === 'frameX' || ch === 'frameY'
        ? new Uint16Array(buf.buffer.slice(0), 0, buf.byteLength / 2)
        : new Uint8Array(buf);
    } catch { /* ignore */ }
  }
  return out;
}

interface Cap { gs: GenState; solid: Map<number, boolean>; chests?: Array<{ x: number; y: number; items: unknown[]; locked?: boolean }> }
let capCc: Cap | null = null, capMb: Cap | null = null;

(RUN ? it : it.skip)('mb batch isolated replay', async () => {
  const force = process.env.SW_RECAP === '1';
  // ── A) 真管线捕获(默认跳过:有 bin 且 gs 在模块级已捕获即复用;SW_RECAP=1 强制重捕)
  if (force || !existsSync(extraPath('cc', 'frameX')) || !existsSync(extraPath('mb', 'frameX'))
    || !capCc || !capMb) {
    const g0 = globalThis as {
      __swCcCap?: (gs: GenState, st: TileStore) => void;
      __swMbCap?: (gs: GenState, st: TileStore) => void;
    };
    g0.__swCcCap = (gs, st) => {
      if (!capCc) {
        capCc = { gs: cloneGs(gs), solid: snapshotGenSolid() };
        dumpExtra('cc', st);
        if (process.env.SW_MBDUMP) {
          const typ = Buffer.alloc(W * H * 2), act = Buffer.alloc(W * H);
          for (let i = 0; i < W * H; i++) { typ.writeUInt16LE(SHEET[st.type[i]] ?? 0, i * 2); act[i] = st.flags[i] ? 1 : 0; }
          writeFileSync('/tmp/sw-cc-pipe.typ', typ); writeFileSync('/tmp/sw-cc-pipe.act', act);
        }
      }
    };
    g0.__swMbCap = (gs, st, chests) => { if (!capMb) { capMb = { gs: cloneGs(gs), solid: snapshotGenSolid(), chests: chests?.map((c) => ({ ...c })) }; dumpExtra('mb', st); } };
    try {
      await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0, onWorldPartial: () => { } });
    } catch (e) {
      console.log('pipeline EX(忽略):', String(e).slice(0, 160));
    } finally {
      g0.__swCcCap = undefined; g0.__swMbCap = undefined;
    }
  }
  console.log('captured:', { cc: !!capCc, mb: !!capMb, ccBin: existsSync(extraPath('cc', 'frameX')), mbBin: existsSync(extraPath('mb', 'frameX')) });
  if (!capCc || !capMb) throw new Error('gs capture failed');
  console.log(`gsCc: ws=${capCc.gs.worldSurface} rock=${capCc.gs.rockLevel} beach=${capCc.gs.beachDistance} nOasis=${capCc.gs.numOasis}`);
  console.log(`gsMb: ws=${capMb.gs.worldSurface} rock=${capMb.gs.rockLevel} lavaLine=${capMb.gs.lavaLine} protected=${capMb.gs.protectedRects?.length ?? 0}`);

  // ── B) #98 Cactus：dump097 → runCactusPalmTreesAndCoralPass → dump098
  if (want('cc')) {
    const st = buildStore(97, truthExtra('97') ?? loadExtra('cc'));
    const { rng, box } = countedRng(capCc.gs.seed);
    restoreGenSolid(capCc.solid);
    console.log('oasis:', JSON.stringify({ n: capCc.gs.numOasis, x: capCc.gs.oasisX, y: capCc.gs.oasisY, w: capCc.gs.oasisW }));
    let phN = 0;
    const phases: Array<[string, number]> = [];
    (globalThis as { __swCcPhase?: (s: string) => void }).__swCcPhase = (s) => { phases.push([s, box.n]); phN++; };
    runCactusPalmTreesAndCoralPass(st, rng, capCc.gs);
    (globalThis as { __swCcPhase?: unknown }).__swCcPhase = undefined;
    for (let k = 1; k < phases.length; k++) console.log(`phase ${phases[k]![0]}: start@${phases[k]![1]} (+${phases[k]![1] - phases[k - 1]![1]})`);
    console.log(`phases head draws=${phases[0]?.[1] ?? 0} tail=${box.n}`);
    console.log(`Cactus draws=${box.n} (vanilla ${VN.cc}, diff=${box.n - VN.cc})`);
    if (process.env.SW_MBDUMP) {
      const typ = Buffer.alloc(W * H * 2), act = Buffer.alloc(W * H);
      for (let i = 0; i < W * H; i++) { typ.writeUInt16LE(SHEET[st.type[i]] ?? 0, i * 2); act[i] = st.flags[i] ? 1 : 0; }
      writeFileSync('/tmp/sw-cc-js.typ', typ); writeFileSync('/tmp/sw-cc-js.act', act);
      console.log('JS cc grid dumped /tmp/sw-cc-js.{typ,act}');
    }
    diff(st, 98, 'Cactus vs dump098');
    firstDiffCells(st, 97, 98, 3);
  }
  // ── B2) #97 二次沉降:dump096 → settleWorldLiquids('gen') → dump097(自因判定)
  if (want('settle')) {
    const st = buildStore(96, truthExtra('96'));
    const world = new World(W, H, capCc.gs.seed);
    world.store = st;
    world.genWaterLine = capCc.gs.waterLine;
    // 地牢豁免盒（镜像 liquidSettlePass 接线;Liquid.cs:186-188）
    if (capCc.gs.dungeonSide !== 0) {
      const edge = Math.floor(W * 0.05), mid = Math.floor(W * 0.55);
      world.genDungeonExempt = capCc.gs.dungeonSide < 0
        ? { x0: edge, x1: Math.floor(W * 0.45), y0: Math.floor(capCc.gs.worldSurface) + 10, y1: H - 200 - 10 }
        : { x0: mid, x1: W - edge, y0: Math.floor(capCc.gs.worldSurface) + 10, y1: H - 200 - 10 };
    }
    const { rng, box } = countedRng(capCc.gs.seed);
    if (process.env.SW_SETTLE_PHASE) {
      // 分相拆账:手动驱动 settle 各阶段(settleWorldLiquids 同构),逐相报掷数
      const sim = new LiquidSim(world);
      sim.isGeneratingOrLoadingWorld = true;
      sim.generatingWorld = true;
      sim.shimmerCenter = world.shimmerX > 0 ? { x: world.shimmerX, y: world.shimmerY } : null;
      if (world.genWaterLine > 0) {
        sim.genWaterLine = world.genWaterLine;
        const d = world.genDungeonExempt;
        if (d) sim.dungeonWaterExempt = (x, y, w) =>
          x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1
          && (w === 7 || w === 8 || w === 9 || (w >= 94 && w <= 99));
      }
      sim.passRand = (max) => rng.nextInt(max);
      // 拆账辅助:各相液体变动量(96→当前)
      const liq96 = load(96, 'liq');
      const liqChg = () => { let c = 0; for (let i = 0; i < W * H; i++) if (st.liquid[i] !== liq96[i]) c++; return c; };
      sim.quickWater();
      console.log(`phase quickWater: draws=${box.n} active=${sim.numLiquid} buf=${sim.bufferLen} liqChg=${liqChg()}`);
      sim.waterCheck();
      console.log(`phase waterCheck0: draws=${box.n} active=${sim.numLiquid} buf=${sim.bufferLen} liqChg=${liqChg()}`);
      sim.quickSettle = true;
      for (let round = 0; round < 10; round++) {
        const MAX_ITER = (sim.numLiquid + sim.bufferLen) * 5;
        let it = 0;
        while (sim.numLiquid > 0 && it < MAX_ITER) { sim.updateLiquid(); it++; }
        sim.waterCheck();
        console.log(`phase round${round}: iters=${it} draws=${box.n} active=${sim.numLiquid} buf=${sim.bufferLen} liqChg=${liqChg()}`);
      }
      sim.quickSettle = false;
      if (!process.env.SW_SETTLE_NOTAIL) {
        sim.waterCheck();
        console.log(`phase tailWaterCheck: draws=${box.n} active=${sim.numLiquid}`);
        sim.finalGenMergeCheck();
        console.log(`phase finalMerge: draws=${box.n}`);
      } else {
        // vanilla #97 尾 = ClearPendingLiquid(仅清列表)+484 翻转——尾 WaterCheck 与
        // finalGenMergeCheck 是 #102 FinalCleanup 的活,settle.ts 挂尾属时点提前
        (sim as unknown as { liquids: unknown[] }).liquids.length = 0;
        (sim as unknown as { numLiquid: number }).numLiquid = 0;
      }
      sim.dispose();
    } else {
      await settleWorldLiquids(world, 'gen', undefined, rng);
    }
    console.log(`settle(97) draws=${box.n} (vanilla 55987, diff=${box.n - 55987})`);
    diff(st, 97, 'Settle97 vs dump097');
    // 四通道(half/slope/lty/inact) vs x86 真值 hs97:lty 仅双侧液体格比对（干格的
    // 原版 liquidType 位是陈旧残留,非状态）;lty 解码回 0 基
    const rd = (e: string) => new Uint8Array(readFileSync(`/tmp/sw-mb-hs97.${e}`).buffer.slice(0));
    const tHalf = rd('half'), tSlope = rd('slope'), tLty = rd('lty'), tInact = rd('inact');
    const tLiq = load(97, 'liq');
    let dHalf = 0, dSlope = 0, dLty = 0, dInact = 0;
    const ltyPairs = new Map<string, number>();
    for (let i = 0; i < W * H; i++) {
      if (st.half[i] !== tHalf[i]) dHalf++;
      if (st.slope[i] !== tSlope[i]) dSlope++;
      if (st.liquid[i] > 0 && tLiq[i]! > 0) {
        const jl = st.liquidType[i] - 1;
        if (jl !== tLty[i]) { dLty++; ltyPairs.set(`l${jl}>${tLty[i]}`, (ltyPairs.get(`l${jl}>${tLty[i]}`) ?? 0) + 1); }
      }
      const jInact = (st.wire[i] & 32) !== 0 ? 1 : 0;
      if (jInact !== tInact[i]) dInact++;
    }
    console.log(`Settle97 4ch: half=${dHalf} slope=${dSlope} lty=${dLty} inact=${dInact}`);
    if (dLty) console.log('  lty pairs:', JSON.stringify([...ltyPairs.entries()].sort((p, q) => q[1] - p[1]).slice(0, 10)));
  }
  // ── C) #101 MicroBiomes：dump100 → runMicroBiomesPass → dump101
  if (want('mb')) {
    const st = buildStore(100, truthExtra('100') ?? loadExtra('mb'));
    const { rng, box } = countedRng(capMb.gs.seed);
    restoreGenSolid(capMb.solid);
    const sink = (existsSync('/tmp/sw-mb-chests2.json') ? applyChestFrames(st) : capMb.chests ?? []) as never;
    runMicroBiomesPass(st, rng, capMb.gs, sink);
    console.log(`MicroBiomes draws=${box.n} (vanilla ${VN.mb}, diff=${box.n - VN.mb}) chests=${sink.length}`);
    if (process.env.SW_MBDUMP) {
      writeFileSync('/tmp/sw-mb-sink.json', JSON.stringify((capMb.chests ?? []).map((c) => [c.x, c.y])));
    }
    if (process.env.SW_MBDUMP) {
      const typ = Buffer.alloc(W * H * 2), act = Buffer.alloc(W * H);
      for (let i = 0; i < W * H; i++) { typ.writeUInt16LE(SHEET[st.type[i]] ?? 0, i * 2); act[i] = st.flags[i] ? 1 : 0; }
      writeFileSync('/tmp/sw-mb-js.typ', typ); writeFileSync('/tmp/sw-mb-js.act', act);
      console.log('JS grid dumped /tmp/sw-mb-js.{typ,act}');
    }
    diff(st, 101, 'MicroBiomes vs dump101');
    firstDiffCells(st, 100, 101, 3);
  }
}, 480000);
