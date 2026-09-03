// IIII105b 一次性仪：sparkle #49 Settle_Liquids 残余反演重放（ mile8 0..48 绿、
// #49 L=3121/Lt=61 @(453,231) 未随 air-semantics 三刀坍缩 ⇒ 纯液体域残余定罪用）。
// ①JS 管线跑到 槽末#8·结构(≡x86 048_Jungle_Chests) 快照整存整取；
// ②基座自检 vs x86 048（848 通道口径 act/typ/wal/liq 逐位）；
// ③单槽忠实重放 liquidSettlePass(ctx, false)（=WorldGen.ts #49 槽的同参调用）；
// ④vs x86 049_Settle_Liquids 逐格分类（L 对分布/Y 面/连通簇 bbox）。
// 用法：cd game && SW_I128=1 npx vitest run tools/_iii128s49.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { liquidSettlePass } from '../src/world/gen/WorldGen';
import { setBoulderSolidity } from '../src/world/gen/vanilla/TrapsPass';
import { flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I128 === '1';
const G2 = process.env.I128_G2 ?? `${process.env.HOME}/GoldenChains/golden-sparkle`;
const SEED = process.env.I128_SEED ?? '771004';
const W = 4200, H = 1200;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const dumpNames = (dir: string): Map<number, string> => {
  const m = new Map<number, string>();
  for (const f of readdirSync(dir)) {
    const mm = f.match(/^(\d{3})_(.+)\.typ$/);
    if (mm) m.set(Number(mm[1]), mm[2]);
  }
  return m;
};

(RUN ? it : it.skip)('i128 s49 replay sparkle', async () => {
  const names = dumpNames(G2);
  const pre48 = `${G2}/048_${names.get(48)}`;
  const pre49 = `${G2}/049_${names.get(49)}`;
  const a48 = readFileSync(`${pre48}.act`), t48 = le16(`${pre48}.typ`);
  const w48 = le16(`${pre48}.wal`), l48 = readFileSync(`${pre48}.liq`);
  const hf48 = readFileSync(`${pre48}.half`), sl48 = readFileSync(`${pre48}.slope`);
  const lt48 = readFileSync(`${pre48}.lty`), ia48 = readFileSync(`${pre48}.inact`);
  const c49 = {
    t: le16(`${pre49}.typ`), a: readFileSync(`${pre49}.act`), w: le16(`${pre49}.wal`),
    l: readFileSync(`${pre49}.liq`), hf: readFileSync(`${pre49}.half`), sl: readFileSync(`${pre49}.slope`),
    lt: readFileSync(`${pre49}.lty`), ia: readFileSync(`${pre49}.inact`),
  };

  // ---- ① 管线跑到 槽末#8·结构 快照 ----
  let snap: Record<string, Uint8Array | Uint16Array> | null = null;
  let gsp: Record<string, unknown> | null = null;
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1,
    seedFlags: { hallowOnTheSurface: true },
    onWorldPartial: (w, _i, pn) => {
      if (pn !== '结构' || snap) return;
      const s = w.store as unknown as Record<string, Uint8Array | Uint16Array>;
      const cp: Record<string, Uint8Array | Uint16Array> = {};
      for (const c of ['flags', 'type', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat', 'frameX', 'frameY'] as const) {
        const v = s[c]!;
        cp[c] = v.slice();
      }
      snap = cp;
      const gs = lastGenState() as unknown as Record<string, unknown>;
      gsp = {
        seed: gs.seed, seedFlags: { ...(gs.seedFlags as Record<string, boolean>) },
        worldSurface: gs.worldSurface, rockLevel: gs.rockLevel, lavaLine: gs.lavaLine,
        beachDistance: gs.beachDistance, dungeonSide: gs.dungeonSide,
        shimmerX: gs.shimmerX, shimmerY: gs.shimmerY, waterLine: gs.waterLine,
      };
    },
  });
  if (!snap) throw new Error('槽末#8·结构 未触发');
  const S = snap as Record<string, Uint8Array | Uint16Array>;

  // ---- ② 基座自检 vs x86 048 ----
  const st = new TileStore(W, H, {
    type: new Uint16Array(S.type!.buffer.slice(0)),
    flags: new Uint8Array(S.flags!.buffer.slice(0)),
    wall: new Uint16Array(S.wall!.buffer.slice(0)),
    liquid: new Uint8Array(S.liquid!.buffer.slice(0)),
    liquidType: new Uint8Array(S.liquidType!.buffer.slice(0)),
    half: new Uint8Array(S.half!.buffer.slice(0)),
    slope: new Uint8Array(S.slope!.buffer.slice(0)),
    wire: new Uint8Array(S.wire!.buffer.slice(0)),
    frameX: new Uint16Array(S.frameX!.buffer.slice(0)),
    frameY: new Uint16Array(S.frameY!.buffer.slice(0)),
  });
  {
    let bA = 0, bT = 0, bW = 0, bL = 0, bHf = 0, bSl = 0, bLt = 0, bIa = 0;
    for (let i = 0; i < W * H; i++) {
      const va = a48[i]!, ja = st.flags[i]! & 1;
      if (va !== ja) bA++;
      const vt = va ? t48[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!]! >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (vt !== jt) bT++;
      if (w48[i] !== st.wall[i]) bW++;
      if (l48[i] !== st.liquid[i]) bL++;
      if (hf48[i] !== st.half[i]) bHf++;
      if (sl48[i] !== st.slope[i]) bSl++;
      const vl = l48[i]! > 0 ? lt48[i]! + 1 : 0;
      const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
      if (vl !== jl) bLt++;
      const via = ia48[i]! ? 1 : 0;
      if (via !== ((st.wire[i]! >>> 5) & 1)) bIa++;
    }
    console.log(`base-check vs 048: A=${bA} T=${bT} W=${bW} L=${bL} Hf=${bHf} Sl=${bSl} Lt=${bLt} Ia=${bIa}`);
    if (bA + bT + bW + bL + bHf + bSl + bLt + bIa > 0) throw new Error('基座与 048 不齐——重放结论无效');
  }

  // ---- ③ 单槽重放 liquidSettlePass(ctx,false) ----
  const p = gsp as Record<string, never>;
  const gs = {
    w: W, h: H, seed: p.seed, seedFlags: { ...(p.seedFlags as Record<string, boolean>) },
    worldSurface: p.worldSurface, rockLevel: p.rockLevel, lavaLine: p.lavaLine,
    beachDistance: p.beachDistance, dungeonSide: p.dungeonSide,
    shimmerX: p.shimmerX, shimmerY: p.shimmerY, waterLine: p.waterLine,
  } as never;
  const world = {
    w: W, h: H, seed: p.seed, store: st,
    groundLevel: p.worldSurface, rockLevel: p.rockLevel,
    shimmerX: p.shimmerX, shimmerY: p.shimmerY,
    genWaterLine: 0, genDungeonExempt: null as null | { x0: number; x1: number; y0: number; y1: number },
    genRemixWater: null as null | { lavaLine: number; rockLevel: number; oceanLevel: number },
  };
  const rng = new RNG(SEED as unknown as number);
  rng.reseed(SEED as unknown as number);
  const evs: string[] = [];
  // ---- 指纹流（updateLiquid 尾；镜像 rig SW_LIQLOG 14B/FNV 布局,rel=1 起与 rig 同锚）----
  const { LiquidSim } = await import('../src/world/liquid/LiquidSim');
  const { mkdirSync: mkFp } = await import('node:fs');
  mkFp('/tmp/iii128-out/js49', { recursive: true });
  const fnvTable = new Uint8Array(2 * 1024 * 1024);
  const fpLines: string[] = [];
  let rel = 0;
  type SimT = LiquidSim & {
    world: { store: { w: number; liquid: Uint8Array; liquidType: Uint8Array } };
    numLiquid: number; bufCount: number;
    liquids: Array<{ x: number; y: number; kill: number; delay: number }>;
  };
  const proto = LiquidSim.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const oUpd = proto.updateLiquid;
  const oWC = proto.waterCheck;
  let wcN = 0;
  const wcEntries: string[] = [];
  const dumpEntries = (sim: SimT): string => {
    const s2 = sim.world.store;
    const out: string[] = [];
    for (let k = 0; k < sim.numLiquid; k++) {
      const e = sim.liquids[k]!;
      const ti = e.y * s2.w + e.x;
      out.push(`${e.x} ${e.y} ${e.delay} ${e.kill} ${s2.liquid[ti]} ${s2.liquidType[ti] === 0 ? 0 : s2.liquidType[ti] - 1}`);
    }
    return out.join('\n');
  };
  proto.waterCheck = function (this: unknown) {
    const r = oWC.apply(this, arguments);
    const sim = this as unknown as SimT;
    wcN++;
    wcEntries.push(`---WC ${wcN} nl=${sim.numLiquid} nb=${sim.bufCount}\n` + dumpEntries(sim));
    if (wcN === 1) {
      // WC1 全量世界 6 通道（lty vanilla 0 基）——sweep 面世界态定罪
      const s2 = sim.world.store as unknown as Record<string, Uint8Array | Uint16Array>;
      const n2 = s2.w * s2.h;
      const w6: Record<string, Uint8Array | Uint16Array> = {};
      for (const c of ['type', 'wall', 'flags', 'liquid', 'liquidType', 'wire', 'frameX', 'frameY'] as const) w6[c] = s2[c]!.slice();
      (globalThis as unknown as { __swWc1World?: typeof w6 }).__swWc1World = w6;
    }
    return r;
  };
  proto.updateLiquid = function (this: unknown) {
    const r = oUpd.apply(this, arguments);
    const sim = this as unknown as SimT;
    const s = sim.world.store;
    rel++;
    const nl = sim.numLiquid, nb = sim.bufCount;
    let pp = 0;
    for (let k = 0; k < nl; k++) {
      const e = sim.liquids[k]!;
      const ti = e.y * s.w + e.x;
      const dl = e.delay | 0, kl = e.kill | 0;
      fnvTable[pp++] = e.x & 0xff; fnvTable[pp++] = (e.x >> 8) & 0xff;
      fnvTable[pp++] = e.y & 0xff; fnvTable[pp++] = (e.y >> 8) & 0xff;
      fnvTable[pp++] = dl & 0xff; fnvTable[pp++] = (dl >>> 8) & 0xff; fnvTable[pp++] = (dl >>> 16) & 0xff; fnvTable[pp++] = (dl >>> 24) & 0xff;
      fnvTable[pp++] = kl & 0xff; fnvTable[pp++] = (kl >>> 8) & 0xff; fnvTable[pp++] = (kl >>> 16) & 0xff; fnvTable[pp++] = (kl >>> 24) & 0xff;
      fnvTable[pp++] = s.liquid[ti];
      fnvTable[pp++] = s.liquidType[ti] === 0 ? 0 : s.liquidType[ti] - 1;
    }
    let h = 2166136261 >>> 0;
    for (let q = 0; q < pp; q++) { h ^= fnvTable[q]!; h = Math.imul(h, 16777619) >>> 0; }
    fpLines.push(`I ${rel} ${nl} ${nb} ${h.toString(16).padStart(8, '0')}`);
    const dumpSet = new Set((process.env.SW_I128_DUMPAT ?? '').split(',').map(Number).filter((n) => n > 0));
    if (dumpSet.size > 0 && dumpSet.has(rel)) {
      const buf: string[] = ['# x y delay kill amt lty'];
      for (let k = 0; k < nl; k++) {
        const e = sim.liquids[k]!;
        const ti = e.y * s.w + e.x;
        buf.push(`${e.x} ${e.y} ${e.delay} ${e.kill} ${s.liquid[ti]} ${s.liquidType[ti] === 0 ? 0 : s.liquidType[ti] - 1}`);
      }
      buf.push(`# buf n=${sim.bufCount}`);
      const bx = (sim as unknown as { bufX: Int32Array }).bufX;
      const by = (sim as unknown as { bufY: Int32Array }).bufY;
      for (let k = 0; k < sim.bufCount && k < 50000; k++) buf.push(`B ${k} ${bx[k]} ${by[k]}`);
      writeFileSync(`/tmp/iii128-out/js49/j-entries-${rel}.txt`, buf.join('\n') + '\n');
    }
    return r;
  };
  try { (globalThis as unknown as { __swLqFpLines?: string[] }).__swLqFpLines = fpLines; } catch {}
  (globalThis as unknown as Record<string, unknown>).__swLqKill =
    (x: number, y: number, sheet: number) => { evs.push(`K ${x},${y} s${sheet}`); };
  try {
    // 槽头参数面（WorldGen.ts liquidSettlePass gs 分支, oceanStrip=false）
    (world as unknown as { genWaterLine: number }).genWaterLine = gs.waterLine as number;
    if ((gs.dungeonSide as number) === 0) {
      world.genDungeonExempt = null;
    } else {
      const edge = Math.floor(W * 0.05);
      const mid = Math.floor(W * 0.55);
      world.genDungeonExempt = (gs.dungeonSide as number) < 0
        ? { x0: edge, x1: Math.floor(W * 0.45), y0: Math.floor(gs.worldSurface as number) + 10, y1: (H - 200) - 10 }
        : { x0: mid, x1: W - edge, y0: Math.floor(gs.worldSurface as number) + 10, y1: (H - 200) - 10 };
    }
    world.genRemixWater = null; // sparkle 非 remix
    flipGenSolid([379], true);
    setBoulderSolidity(false);
    flipGenSolid([546], false);
    await liquidSettlePass({ world, rng, store: st, prog: undefined } as never, false, gs);
    setBoulderSolidity(true);
    flipGenSolid([546], true);
    flipGenSolid([10, 192, 191, 190], true);
    flipGenSolid([484], false);
  } finally {
    proto.updateLiquid = oUpd;
    proto.waterCheck = oWC;
    try {
      const w6 = (globalThis as unknown as { __swWc1World?: Record<string, Uint8Array | Uint16Array> }).__swWc1World;
      if (w6) {
        for (const [nm, arr] of Object.entries(w6)) writeFileSync(`/tmp/iii128-out/js49/j.wc1.${nm}`, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
      }
    } catch {}
    writeFileSync('/tmp/iii128-out/js49/j-wc-anchors.txt', wcEntries.join('\n'));
    delete (globalThis as unknown as Record<string, unknown>).__swLqKill;
    writeFileSync('/tmp/iii128-out/js-liqlog-spk49.txt', fpLines.join('\n') + '\n');
    console.log(`fp lines: ${fpLines.length} (first: ${fpLines[0] ?? '-'} | last: ${fpLines[fpLines.length - 1] ?? '-'})`);
  }
  console.log(`kill/setTile events: ${evs.length} (first 8: ${evs.slice(0, 8).join(' | ')})`);

  // ---- ④ vs x86 049 逐格分类 ----
  const groups = new Map<string, number[]>();
  const push = (g: string, i: number) => {
    const arr = groups.get(g) ?? [];
    arr.push(i);
    groups.set(g, arr);
  };
  for (let i = 0; i < W * H; i++) {
    const va = c49.a[i]!, ja = st.flags[i]! & 1;
    const vt = va ? c49.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!]! >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (va !== ja) push(`A${va}>${ja}`, i);
    if (vt !== jt) push(`T${vt}>${jt}`, i);
    if (c49.w[i] !== st.wall[i]) push(`W${c49.w[i]}>${st.wall[i]}`, i);
    if (c49.l[i] !== st.liquid[i]) push(`L${c49.l[i]}>${st.liquid[i]}`, i);
    if (c49.hf[i] !== st.half[i]) push(`H${c49.hf[i]}>${st.half[i]}`, i);
    if (c49.sl[i] !== st.slope[i]) push(`S${c49.sl[i]}>${st.slope[i]}`, i);
    const vl = c49.l[i]! > 0 ? c49.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) push(`Y${vl}>${jl}`, i);
  }
  console.log('== #49 重放对拍组（计数>=1）==');
  for (const [k, arr] of [...groups.entries()].sort((x, y) => y[1].length - x[1].length)) {
    const f = arr[0]!;
    console.log(`  ${k} ×${arr.length} first=(${f % W},${(f / W) | 0})`);
  }
  // L 差簇 bbox（连通域按行列扫描近似：只报 L 面的 bbox 拓扑）
  const lCells = groups.get('L') ?? [];
  void lCells;
  writeFileSync('/tmp/iii128-out/s49-groups.json', JSON.stringify({
    groups: Object.fromEntries([...groups.entries()].map(([k, v]) => [k, v.length])),
    firstCells: Object.fromEntries([...groups.entries()].map(([k, v]) => [k, [v[0]! % W, (v[0]! / W) | 0]])),
  }));
  console.log('groups written → /tmp/iii128-out/s49-groups.json');
}, 900_000);
