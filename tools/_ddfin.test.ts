// 一次性（DD 终清）：#97 沉降中途对拍 + #98 仙人掌列级事件链对拍。
// 真值 = /tmp/sw-ddfin/（Cecil SettleProbe/CactusProbe 注入 exe，SW_EVIL=0,种子
// 9293480）：s97{e,qw,wc,r0,r1,f}.{liq,lty} + settle.txt + cactus.txt。
// 本文件：同构驱动 JS LiquidSim 至同相位落盘 + FNV 对拍 + 首分叉定位。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { World } from '../src/world/World';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { runCactusPalmTreesAndCoralPass, setCcTrace } from '../src/world/gen/vanilla/StructuresPass';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const DD = '/tmp/sw-ddfin';
const W = 4200, H = 1200;
const NAMES: Record<number, string> = {
  96: 'Larva', 97: 'Settle_Liquids_Again', 98: 'Cactus__Palm_Trees____Coral',
};
const load = (idx: number, ext: string) => readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${NAMES[idx]}.${ext}`);

const REV = new Map<number, number>();
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!REV.has(s)) REV.set(s, i); }
}
SHEET[0] = 0;

function truthExtra(tag: '96' | '97'): Record<string, Uint8Array | Uint16Array> {
  const rd = (e: string) => new Uint8Array(readFileSync(`/tmp/sw-mb-hs${tag}.${e}`).buffer.slice(0));
  const half = rd('half'), slope = rd('slope'), lty = rd('lty'), inact = rd('inact');
  const liq = load(tag === '97' ? 97 : 96, 'liq');
  const ltyJ = new Uint8Array(W * H), wire = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    ltyJ[i] = liq[i]! > 0 ? lty[i]! + 1 : 0;
    wire[i] = inact[i] ? 32 : 0;
  }
  return { half, slope, liqtype: ltyJ, wire };
}

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
    if (extra.wire) st.wire.set(extra.wire as Uint8Array);
  }
  // 帧真值（sw-mb-cc-*.bin，Uint16/格）：TileObjectData 对象感知死亡判定按
  // (frameX,frameY) 解析 style——9,837 格淹没家具与 deathtable 真值 100% 一致
  const fxT = new Uint16Array(readFileSync('/tmp/sw-mb-cc-frameX.bin').buffer.slice(0));
  const fyT = new Uint16Array(readFileSync('/tmp/sw-mb-cc-frameY.bin').buffer.slice(0));
  st.frameX.set(fxT.subarray(0, W * H));
  st.frameY.set(fyT.subarray(0, W * H));
  return st;
}

/** UR 状态 FNV（与 exe SettleProbe.RandFnv 同式：56×int32 LE + inext） */
function urFnv(rng: RNG): string {
  const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
  let h = 2166136261 >>> 0;
  const mix = (v: number) => {
    v = v >>> 0;
    for (let s = 0; s < 32; s += 8) { h = (h ^ ((v >>> s) & 0xff)) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
  };
  for (let k = 0; k < ur.seedArray.length; k++) mix(ur.seedArray[k]!);
  mix(ur.inext);
  return h.toString(16).padStart(8, '0');
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

/** 两份网格逐格 diff（vanilla 为 0 基 lty，JS -1） */
function diffGrids(jsLiq: Uint8Array, jsLty: Uint8Array, tag: string, maxShow = 10) {
  const vLiq = new Uint8Array(readFileSync(`${DD}/s97${tag}.liq`).buffer.slice(0));
  const vLty = new Uint8Array(readFileSync(`${DD}/s97.lty.${tag}`).buffer.slice(0));
  let dl = 0, dt = 0;
  const samples: string[] = [];
  const regs = new Map<string, number>();
  for (let i = 0; i < W * H; i++) {
    const jl = jsLiq[i], jlty = (jsLty[i]! - 1) & 0xff;
    // lty 仅在有液格比对（干格原版 liquidType 位为陈旧残留非状态）
    const a = jl !== vLiq[i], b = (jl > 0 || vLiq[i]! > 0) && jlty !== vLty[i];
    if (!a && !b) continue;
    if (a) dl++; if (b) dt++;
    const x = i % W, y = (i / W) | 0;
    regs.set(`x${(x / 300) | 0}y${(y / 300) | 0}`, (regs.get(`x${(x / 300) | 0}y${(y / 300) | 0}`) ?? 0) + 1);
    if (samples.length < maxShow) samples.push(`(${x},${y})L${jl}>${vLiq[i]}T${jlty}>${vLty[i]}`);
  }
  console.log(`[phase ${tag}] liqDiff=${dl} ltyDiff=${dt}`);
  console.log('  regs:', JSON.stringify([...regs.entries()].sort((p, q) => q[1] - p[1]).slice(0, 6)));
  console.log('  samples:', samples.join(' | '));
  return { dl, dt };
}

interface Cap { gs: GenState; solid: Map<number, boolean> }
let cap: Cap | null = null;

(RUN ? it : it.skip)('ddfin settle+cactus checkpoint parity', async () => {
  // ── A) 捕获管线 gs/GenSolid（__swCcCap 钩子）──
  if (!cap) {
    const g0 = globalThis as { __swCcCap?: (gs: GenState, st: TileStore) => void };
    g0.__swCcCap = (gs) => { if (!cap) cap = { gs: cloneGs(gs), solid: snapshotGenSolid() }; };
    try { await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0, onWorldPartial: () => { } }); }
    catch (e) { console.log('pipeline EX(忽略):', String(e).slice(0, 160)); }
    finally { g0.__swCcCap = undefined; }
  }
  if (!cap) throw new Error('gs capture failed');
  console.log(`gs: ws=${cap.gs.worldSurface} waterLine=${cap.gs.waterLine} dungeonSide=${cap.gs.dungeonSide} shimmer=${cap.gs.shimmerX},${cap.gs.shimmerY}`);

  // ── B) #97：手动同构驱动至各相位，落盘 + 对拍 ──
  const st = buildStore(96, truthExtra('96'));
  const world = new World(W, H, cap.gs.seed);
  world.store = st;
  world.genWaterLine = cap.gs.waterLine;
  if (cap.gs.dungeonSide !== 0) {
    const edge = Math.floor(W * 0.05), mid = Math.floor(W * 0.55);
    world.genDungeonExempt = cap.gs.dungeonSide < 0
      ? { x0: edge, x1: Math.floor(W * 0.45), y0: Math.floor(cap.gs.worldSurface) + 10, y1: H - 200 - 10 }
      : { x0: mid, x1: W - edge, y0: Math.floor(cap.gs.worldSurface) + 10, y1: H - 200 - 10 };
  }
  const { rng, box } = countedRng(cap.gs.seed);
  const sim = new LiquidSim(world);
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.shimmerCenter = cap.gs.shimmerX > 0 ? { x: cap.gs.shimmerX, y: cap.gs.shimmerY } : null;  // 隔离重放须接真值以太中心(3966,724)
  if (world.genWaterLine > 0) {
    sim.genWaterLine = world.genWaterLine;
    const d = world.genDungeonExempt;
    if (d) sim.dungeonWaterExempt = (x, y, w) =>
      x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1
      && (w === 7 || w === 8 || w === 9 || (w >= 94 && w <= 99));
  }
  sim.passRand = (max) => rng.nextInt(max);
  // killTileGen 击杀日志（wc 相位掷差定位：vanilla 25 掷 vs JS 2）
  const killLog: string[] = [];
  const protoK = LiquidSim.prototype as unknown as Record<string, (x: number, y: number) => void>;
  const origKill = protoK.killTileGen;
  protoK.killTileGen = function (x: number, y: number) {
    const s2 = this.world.store as TileStore;
    const i2 = y * W + x;
    const before = s2.liquid[y * W + x];
    killLog.push(`K ${x},${y} sheet=${SHEET[s2.type[i2]]} wall=${s2.wall[i2]} fx=${s2.frameX[i2]} liq=${before} draws=${box.n}`);
    return origKill.call(this, x, y);
  };
  restoreGenSolid(cap.solid);
  sim.applyGenSolidOverrides(cap.solid); // 生成期 tileSolid 覆写（裂纹砖等）
  sim.worldGenTilesIgnoreWater(true);   // cs:21067 pass 委托首
  // SettleWaterAt 逐源轨迹（与 exe SwaIn 同盒过滤）
  const swaLines: string[] = [];
  const proto = LiquidSim.prototype as unknown as Record<string, (x: number, y: number) => void>;
  const origSwa = proto.settleWaterAt;
  proto.settleWaterAt = function (x: number, y: number) {
    if ((x >= 3950 && x <= 4140 && y >= 770 && y <= 810) || (x >= 4050 && x <= 4130 && y >= 660 && y <= 700)) {
      const s = this.world.store as TileStore;
      swaLines.push(`${x},${y} ${s.liquid[y * W + x]}`);
    }
    return origSwa.call(this, x, y);
  };
  const dump = (tag: string) => {
    writeFileSync(`/tmp/sw-ddfin-js/${tag}.liq`, Buffer.from(st.liquid));
    const lty0 = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) lty0[i] = (st.liquidType[i]! - 1) & 0xff;
    writeFileSync(`/tmp/sw-ddfin-js/${tag}.lty`, Buffer.from(lty0));
  };
  console.log(`phase e: draws=${box.n} fnv=${urFnv(rng)}`);
  diffGrids(st.liquid, st.liquidType, 'e');
  sim.quickWater();
  dump('qw');
  console.log(`phase qw: draws=${box.n} fnv=${urFnv(rng)} nl=${sim.numLiquid} nb=${sim.bufferLen}`);
  diffGrids(st.liquid, st.liquidType, 'qw');
  proto.settleWaterAt = origSwa;
  writeFileSync('/tmp/sw-ddfin-js/swa.txt', swaLines.join('\n') + '\n');
  const vanSwa = readFileSync('/tmp/sw-ddfin/swa.txt', 'utf8').trim().split('\n');
  let swaMis = -1;
  for (let k = 0; k < Math.min(swaLines.length, vanSwa.length); k++) {
    if (swaLines[k] !== vanSwa[k]) { swaMis = k; break; }
  }
  console.log(`swa trace: js=${swaLines.length} van=${vanSwa.length} firstMismatch=${swaMis}`);
  for (let k = Math.max(0, swaMis - 4); k < Math.min(Math.max(swaLines.length, vanSwa.length), swaMis + 8); k++) {
    if (k < 0) continue;
    const mark = k === swaMis ? '>>' : '  ';
    console.log(`${mark}[${k}] js=${swaLines[k] ?? '-'} van=${vanSwa[k] ?? '-'}`);
  }
  sim.waterCheck();
  dump('wc');
  console.log(`phase wc: draws=${box.n} fnv=${urFnv(rng)} nl=${sim.numLiquid} nb=${sim.bufferLen}`);
  protoK.killTileGen = origKill;
  console.log('wc kills:', killLog.length);
  const hist = new Map<string, number>();
  for (const l of killLog) {
    const m = l.match(/sheet=(\d+) wall=(\d+)/)!;
    const k = `s${m[1]}w${m[2]}`;
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  console.log('kill hist:', JSON.stringify([...hist.entries()].sort((a, b) => b[1] - a[1])));
  diffGrids(st.liquid, st.liquidType, 'wc');
  sim.quickSettle = true;
  let ulTotal = 0;
  for (let round = 0; round < 10; round++) {
    let it = 0, MAX_ITER = (sim.numLiquid + sim.bufferLen) * 5;
    while (sim.numLiquid > 0 && it < MAX_ITER) { sim.updateLiquid(); it++; }
    ulTotal += it;
    sim.waterCheck();
    if (round <= 2 && round <= 1) {
      dump(`r${round}`);
      console.log(`phase r${round}: ul=${it} ulTotal=${ulTotal} draws=${box.n} fnv=${urFnv(rng)} nl=${sim.numLiquid} nb=${sim.bufferLen}`);
      diffGrids(st.liquid, st.liquidType, `r${round}`);
    } else {
      console.log(`phase r${round}: ul=${it} draws=${box.n} nl=${sim.numLiquid} nb=${sim.bufferLen}`);
    }
  }
  sim.quickSettle = false;
  sim.worldGenTilesIgnoreWater(false);  // cs:21110 pass 尾
  (sim as unknown as { liquids: unknown[] }).liquids.length = 0;
  (sim as unknown as { numLiquid: number }).numLiquid = 0;
  dump('f');
  console.log(`phase f: draws=${box.n} fnv=${urFnv(rng)}`);
  diffGrids(st.liquid, st.liquidType, 'f');
  console.log(`settle draws total=${box.n} (vanilla 55987, diff=${box.n - 55987})`);
  sim.dispose();

  // 与 dump097（pass 末真值）总量对拍
  const l97 = load(97, 'liq');
  let dl97 = 0;
  for (let i = 0; i < W * H; i++) if (st.liquid[i] !== l97[i]) dl97++;
  console.log(`f vs dump097 liqDiff=${dl97}`);

  // ── C) #98：仙人掌列级事件链对拍 ──
  const st2 = buildStore(97, truthExtra('97'));
  const world2 = new World(W, H, cap.gs.seed);
  world2.store = st2;
  const { rng: rng2, box: box2 } = countedRng(cap.gs.seed);
  restoreGenSolid(cap.solid);
  const events: string[] = [];
  const places: string[] = [];
  setCcTrace({
    plant: (i, j) => events.push(`P ${i} ${j} ${urFnv(rng2)}`),
    kill: (i, j) => events.push(`K ${i} ${j}`),
    place: (x, y) => places.push(`${x},${y}`),
  });
  runCactusPalmTreesAndCoralPass(st2, rng2, cap.gs);
  setCcTrace(null);
  console.log(`cc draws=${box2.n} (vanilla 1248713=passchain 2c103a4f 反演, diff=${box2.n - 1248713}) events=${events.filter((e) => e[0] === 'P').length}P places=${places.length}`);
  writeFileSync('/tmp/sw-ddfin-js/places.txt', places.join('\n') + '\n');
  const jsLines = events;
  const vanLines = readFileSync(`${DD}/cactus.txt`, 'utf8').split('\n').filter((l) => l.startsWith('P ') || l.startsWith('K '));
  writeFileSync('/tmp/sw-ddfin-js/cactus-js.txt', jsLines.join('\n') + '\n');
  let firstMis = -1;
  const n = Math.min(jsLines.length, vanLines.length);
  for (let k = 0; k < n; k++) {
    const a = jsLines[k]!.split(' '), b = vanLines[k]!.split(' ');
    if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) { firstMis = k; break; }
  }
  console.log(`event chain: js=${jsLines.length} van=${vanLines.length} firstMismatch=${firstMis}`);
  if (firstMis >= 0) {
    for (let k = Math.max(0, firstMis - 3); k < Math.min(n, firstMis + 6); k++) {
      const mark = k === firstMis ? '>>' : '  ';
      console.log(`${mark}[${k}] js=${jsLines[k]} van=${vanLines[k]}`);
    }
  }
}, 480000);
