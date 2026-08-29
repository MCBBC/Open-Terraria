// IIII56 一次性诊断 A 刀：pass59 重放 × 全骰值/阶段/细分标签捕获 × 尝试级事件账。
// 输入 = /tmp/iii54-out/exp-*.bin（vanilla-exact 输入态）。
// 输出 = /tmp/iii58-out/js-ledger.json（attempts[] 含 tryIdx/events/stageHist/classHist）
//        + SW_I58_DUMPVALS=1 时 js-dievals.json 与 js-after59-*.bin 全通道快照。
// 用法：cd game && SW_I58=1 [SW_I58_DUMPVALS=1] npx vitest run tools/_i58a.test.ts
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

const RUN = process.env.SW_I58 === '1';
const OUT = process.env.SW_I54_OUT ?? '/tmp/iii54-out';
const MYOUT = '/tmp/iii58-out';

(RUN ? it : it.skip)('i58 replay pass59 ledger', async () => {
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
    for (const [x, y] of [[3519, 185], [3490, 186], [3520, 186], [3489, 187]] as Array<[number, number]>) {
      st.wall[st.idx(x, y)] = 99;
    }
  }

  // ---- 全骰捕获 + 阶段/细分标签 ----
  const dieVals: number[] = [];
  const dieStage: string[] = [];
  const dieClass: string[] = [];
  let curStage = '-';
  let pendingTag = '';
  const gThis = globalThis as Record<string, unknown>;
  gThis.__swTagDie = (t: string) => { pendingTag = t; };
  const killLog: string[] = [];
  gThis.__swKillCap = (x: number, y: number, sheet: number) => {
    if (killLog.length < 4000) killLog.push(`${dieVals.length}|${curStage}|${x},${y}|${sheet}`);
  };
  const stairLog: string[] = [];
  gThis.__swStairEv = (n: string, x: number, y: number, t: number, f: number) => {
    if (stairLog.length < 8000) stairLog.push(`${dieVals.length}|${curStage}|${n}|${x},${y}|t=${t} f=${f}`);
  };
  const rngMod = (await import('../src/core/rng')) as unknown as { UnifiedRandom: new () => unknown };
  const URp = Object.getPrototypeOf(new rngMod.UnifiedRandom()) as unknown as
    Record<string, (...a: unknown[]) => number>;
  const oInternal = URp.internalSample;
  URp.internalSample = function (this: unknown): number {
    const v = oInternal.call(this) as number;
    dieVals.push(v);
    dieStage.push(curStage);
    dieClass.push(pendingTag || '.');
    pendingTag = '';
    return v;
  };

  // ---- 尝试级事件账 ----
  const evs: string[] = [];
  const tag = (s: string) => `${dieVals.length}|${s}`;
  gThis.__swHouseEv = (phase: string, x: number, y: number) => {
    evs.push(tag(`EV:${phase}:${x}:${y}`));
    curStage = phase;
  };
  gThis.__swHouseGate = (gate: string, x: number, y: number) => {
    evs.push(tag(`GATE:${gate}:${x}:${y}`));
    curStage = gate;
  };
  gThis.__swHouseRooms = (ox: number, oy: number, rooms: string) => {
    evs.push(tag(`ROOMS:${ox}:${oy}:${rooms}`));
  };
  const snaps: string[] = [];
  gThis.__swHouseStage = (t: string, a: number, b: number, c: number) => {
    evs.push(tag(`ST:${t}:${a}:${b}:${c}`));
    curStage = t;
    // IIII56 阶段快照（dormant）：k=16 蘑菇屋盒逐阶段字节留痕
    if (a >= 2380 && a <= 2410 && process.env.SW_I58_SNAPBOX === '1') {
      const enc = () => {
        const xs = [], fs = [], ws = [];
        for (let y = 598; y < 630; y++) for (let x = 2374; x < 2418; x++) {
          const i2 = st.idx(x, y);
          xs.push(st.type[i2]); fs.push(st.flags[i2]); ws.push(st.wall[i2]);
        }
        return Buffer.from(new Uint16Array(xs).buffer).toString('base64') + '|' +
          Buffer.from(fs).toString('base64') + '|' +
          Buffer.from(new Uint16Array(ws).buffer).toString('base64');
      };
      snaps.push(`${dieVals.length}|${t}|${enc()}`);
    }
  };

  const chests: unknown[] = [];
  const rng = new RNG(gs.seed);
  flipGenSolid([226, 162, 225, 190], true);
  rollHouseChestCounts(st, rng, gs);
  runBuriedChestsPass(st, rng, gs, chests as never);
  runUnderworldChestsPass(st, rng, gs, chests as never);
  runCaveHousesPass(st, rng, gs, chests as never);
  flipGenSolid([226, 162, 225, 190], false);

  URp.internalSample = oInternal;
  delete gThis.__swHouseEv; delete gThis.__swHouseGate;
  delete gThis.__swHouseRooms; delete gThis.__swHouseStage; delete gThis.__swTagDie;

  // ---- 装订 ----
  const attempts: Array<Record<string, unknown>> = [];
  let cur: Record<string, unknown> | null = null;
  for (const line of evs) {
    const bar1 = line.indexOf('|');
    const idx = Number(line.slice(0, bar1));
    const rest = line.slice(bar1 + 1);
    if (rest.startsWith('EV:try') || rest.startsWith('EV:dtry')) {
      cur = { tryIdx: idx, tryDice: [dieVals[idx - 2], dieVals[idx - 1]], events: [] as string[] };
      attempts.push(cur);
      continue;
    }
    cur?.events.push(`${idx}|${rest}`);
  }
  // 直方图
  for (const a of attempts) a.stageHist = {};
  for (const a of attempts) a.classHist = {};
  {
    let ai = -1;
    for (let i = 0; i < dieVals.length; i++) {
      while (ai + 1 < attempts.length && (attempts[ai + 1].tryIdx as number) <= i + 1) ai++;
      if (ai < 0) continue;
      const sh = attempts[ai].stageHist as Record<string, number>;
      sh[dieStage[i] ?? '?'] = (sh[dieStage[i] ?? '?'] ?? 0) + 1;
      const ch2 = attempts[ai].classHist as Record<string, number>;
      ch2[dieClass[i] ?? '.'] = (ch2[dieClass[i] ?? '.'] ?? 0) + 1;
    }
  }
  writeFileSync(`${MYOUT}/js-ledger.json`, JSON.stringify({
    summary: {
      totalDice: dieVals.length,
      attempts: attempts.length,
      builds: attempts.filter(a => (a.events as string[]).some(e => e.split('|')[1].startsWith('ST:bld'))).length,
    }, attempts,
  }, null, 1));

  writeFileSync(`${MYOUT}/js-killlog.txt`, killLog.join('\n'));
  writeFileSync(`${MYOUT}/js-stairlog.txt`, stairLog.join('\n'));
  if (process.env.SW_I58_SNAPBOX === '1') writeFileSync(`${MYOUT}/js-snaps.txt`, snaps.join('\n'));
  if (process.env.SW_I58_DUMPVALS === '1') {
    writeFileSync(`${MYOUT}/js-dievals.json`, JSON.stringify(dieVals));
    writeFileSync(`${MYOUT}/js-dietags.json`, JSON.stringify({ stage: dieStage, cls: dieClass }));
    const stAny = st as unknown as Record<string, Uint16Array | Uint8Array>;
    for (const chn of ['type', 'wall', 'flags', 'liquid', 'liquidType', 'slope', 'half', 'wire']) {
      writeFileSync(`${MYOUT}/js-after59-${chn}.bin`, Buffer.from((stAny[chn] as Uint8Array).buffer,
        (stAny[chn] as Uint8Array).byteOffset, (stAny[chn] as Uint8Array).byteLength));
    }
  }
  console.log('[i58]', JSON.stringify({ totalDice: dieVals.length, attempts: attempts.length }));
}, 900_000);
