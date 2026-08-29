// IIII52 一次性诊断：pass59 离线重放 harness。
// 输入：/tmp/iii54-out/exp-*.bin + exp-gs.json（由 tools/_i54exp 导出的 pass 入口态）；
// 可选把 #32 四格墙按 G2 校正为 99（SW_I54_NOPATCH32=1 关闭）；
// SW_I54_MUT 指定候选谓词 mutation（bisect 用，由 CaveHousePass 内 dormant 分支消费）；
// 输出：重放后通道 vs /tmp/iii48-out/x86-celeb/059_* 差异账＋骰总长＋阶段事件账。
// 用法：cd game && SW_I54_REP=1 npx vitest run tools/_i54rep.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { rollHouseChestCounts, runCaveHousesPass } from '../src/world/gen/vanilla/CaveHousePass';
import {
  runBuriedChestsPass, runUnderworldChestsPass,
} from '../src/world/gen/vanilla/BuriedChestsPass';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I54_REP === '1';
const OUT = process.env.SW_I54_OUT ?? '/tmp/iii54-out';
const G2 = process.env.SW_I54_G2 ?? '/tmp/iii48-out/x86-celeb';
const MUT = process.env.SW_I54_MUT ?? '';

(RUN ? it : it.skip)('i54 replay pass59', async () => {
  const W = 4200, H = 1200, N = W * H;
  const load = (p: string) => readFileSync(`${OUT}/${p}`);
  const st = new TileStore(W, H);
  (st as unknown as { type: Uint16Array }).type.set(
    new Uint16Array(load('exp-type.bin').buffer, load('exp-type.bin').byteOffset, N));
  st.flags.set(new Uint8Array(load('exp-flags.bin').buffer, load('exp-flags.bin').byteOffset, N));
  st.wall.set(new Uint16Array(load('exp-wall.bin').buffer, load('exp-wall.bin').byteOffset, N));
  st.liquid.set(new Uint8Array(load('exp-liq.bin').buffer, load('exp-liq.bin').byteOffset, N));
  st.liquidType.set(new Uint8Array(load('exp-lt.bin').buffer, load('exp-lt.bin').byteOffset, N));
  st.half.set(new Uint8Array(load('exp-half.bin').buffer, load('exp-half.bin').byteOffset, N));
  st.slope.set(new Uint8Array(load('exp-slope.bin').buffer, load('exp-slope.bin').byteOffset, N));
  st.wire.set(new Uint8Array(load('exp-wire.bin').buffer, load('exp-wire.bin').byteOffset, N));

  const gs = JSON.parse(load('exp-gs.json').toString()) as GenState;
  if (process.env.SW_I54_NOPATCH32 !== '1') {
    // #32 四格：G2 wall99 —— 按 dump058 对齐输入
    for (const [x, y] of [[3519, 185], [3490, 186], [3520, 186], [3489, 187]] as Array<[number, number]>) {
      st.wall[st.idx(x, y)] = 99;
    }
  }
  if (MUT) console.log(`[i54rep] mutation=${MUT}`);
  (globalThis as { __I54_MUT?: string }).__I54_MUT = MUT;

  // ---- 事件钩 ----
  const stages: string[] = [];
  const gates: string[] = [];
  let idx = 0;
  const rngMod = (await import('../src/core/rng')) as unknown as { UnifiedRandom: new () => unknown };
  const URp = Object.getPrototypeOf(new rngMod.UnifiedRandom()) as unknown as
    Record<string, (...a: unknown[]) => number>;
  const oInternal = URp.internalSample;
  URp.internalSample = function (this: unknown): number {
    const v = oInternal.call(this) as number;
    idx++;
    return v;
  };
  (globalThis as { __swHouseStage?: unknown }).__swHouseStage =
    (tag: string, a: number, b: number, c: number) => stages.push(`${idx}|${tag}|${a}|${b}|${c}`);
  (globalThis as { __swHouseGate?: unknown }).__swHouseGate =
    (gate: string, x: number, y: number) => gates.push(`${idx}|${gate}|${x}|${y}`);

  const chests: unknown[] = [];
  const rng = new RNG(gs.seed);
  flipGenSolid([226, 162, 225, 190], true);
  rollHouseChestCounts(st, rng, gs);
  runBuriedChestsPass(st, rng, gs, chests as never);
  runUnderworldChestsPass(st, rng, gs, chests as never);
  runCaveHousesPass(st, rng, gs, chests as never);
  flipGenSolid([226, 162, 225, 190], false);

  // ---- 与 G2 dump059 对拍（mile8 同构比较器）----
  const le16 = (p: string): Uint16Array => {
    const b = readFileSync(p);
    return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
  };
  const u8f = (p: string) => readFileSync(p);
  const vt = le16(`${G2}/059_Buried_Chests.typ`);
  const vw = le16(`${G2}/059_Buried_Chests.wal`);
  const va = u8f(`${G2}/059_Buried_Chests.act`);
  const vl = u8f(`${G2}/059_Buried_Chests.liq`);
  const vlt = u8f(`${G2}/059_Buried_Chests.lty`);
  const vhf = u8f(`${G2}/059_Buried_Chests.half`);
  const vsl = u8f(`${G2}/059_Buried_Chests.slope`);
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = (TILE_DEFS[i] as { vanilla?: { sheet?: number } } | undefined)?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  let dT = 0, dA = 0, dW = 0, dL = 0, dLt = 0, dHf = 0, dSl = 0;
  const pairs = new Map<string, number>();
  const samples: string[] = [];
  const mark = (i: number, k: string) => {
    pairs.set(k.split(':')[0], (pairs.get(k.split(':')[0]) ?? 0) + 1);
    void dT; void i; void k;
    if (samples.length < 14) samples.push(`(${(i % W)},${(i / W) | 0}) ${k}`);
  };
  for (let i = 0; i < N; i++) {
    const jAct = st.flags[i]! & 1;
    const vAct = va[i]!;
    if (vAct !== jAct) { dA++; mark(i, `A:${vAct}>${jAct}`); }
    const on = vAct && jAct ? true : vAct !== jAct;
    void on;
    const vT = vAct ? vt[i]! : 0;
    const jT = jAct ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vT !== jT) dT++;
    if (vw[i]! !== st.wall[i]!) { dW++; mark(i, `W:${vw[i]}>${st.wall[i]}`); }
    if (vl[i]! !== st.liquid[i]!) { dL++; mark(i, `L:${vl[i]}>${st.liquid[i]}`); }
    if (vhf[i]! !== st.half[i]!) { dHf++; mark(i, `H:${vhf[i]}>${st.half[i]}`); }
    if (vsl[i]! !== st.slope[i]!) { dSl++; mark(i, `S:${vsl[i]}>${st.slope[i]}`); }
    const vY = vl[i]! > 0 ? vlt[i]! + 1 : 0;
    const jY = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vY !== jY) dLt++;
  }
  const rep = {
    mutation: MUT || 'BASELINE', diceTotal: idx,
    dA, dT, dW, dL, dLt, dHf, dSl,
    topPairs: [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24),
    samples,
    stageCount: stages.length,
  };
  writeFileSync(`${OUT}/rep-${MUT || 'base'}.json`, JSON.stringify(rep, null, 1));
  writeFileSync(`${OUT}/rep-${MUT || 'base'}-stages.txt`, stages.join('\n'));
  writeFileSync(`${OUT}/rep-${MUT || 'base'}-gates.txt`, gates.join('\n'));
  console.log('[i54rep]', JSON.stringify({ ...rep, samples: undefined, topPairs: rep.topPairs.slice(0, 12) }));

  (globalThis as { __I54_MUT?: string }).__I54_MUT = '';
  delete (globalThis as { __swHouseStage?: unknown }).__swHouseStage;
  delete (globalThis as { __swHouseGate?: unknown }).__swHouseGate;
  URp.internalSample = oInternal;
}, 900_000);
