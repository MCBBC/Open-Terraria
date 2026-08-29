// IIII60 一次性诊断：pass59 重放 × 单屋 mark 序仪（与 x86 rig SW_HOUSELOG 对位）。
// 输入 = /tmp/iii54-out/exp-*.bin（vanilla-exact 输入态，含 #32 四格墙校正）。
// 输出 = /tmp/iii62-out/{js-marklog.txt, js-ledger.json, js-killlog.txt,
//        js-stairlog.txt, js-beamlog.txt, js-dievals.json, js-dietags.json}
// 用法：cd game && SW_I60=1 npx vitest run tools/_i60a.test.ts
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

const RUN = process.env.SW_I60 === '1';
const OUT = process.env.SW_I54_OUT ?? '/tmp/iii54-out';
const MYOUT = '/tmp/iii62-out';

(RUN ? it : it.skip)('i60 replay pass59 mark-sequence ledger', async () => {
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
  if (process.env.SW_I60_NOPATCH32 !== '1') {
    for (const [x, y] of [[3519, 185], [3490, 186], [3520, 186], [3489, 187]] as Array<[number, number]>) {
      st.wall[st.idx(x, y)] = 99;
    }
  }

  // ---- 全骰捕获 ----
  const dieVals: number[] = [];
  const dieStage: string[] = [];
  const dieClass: string[] = [];
  let curStage = '-';
  let pendingTag = '';
  const gThis = globalThis as Record<string, unknown>;
  gThis.__swTagDie = (t: string) => { pendingTag = t; };
  const killLog: string[] = [];
  const kboxLog: string[] = [];
  gThis.__swKillCap = (x: number, y: number, sheet: number) => {
    if (killLog.length < 20000) killLog.push(`${dieVals.length}|${curStage}|${x},${y}|${sheet}`);
    // IIII60：击杀时刻 13×13 盒态快照（与 rig SW_KBOX 同格式同半径，KB 行；含帧）
    {
      const ty = new Uint16Array(169), fl = new Uint8Array(169), wa = new Uint16Array(169);
      const fx = new Uint16Array(169), fy = new Uint16Array(169);
      let n = 0;
      for (let yy = y - 6; yy <= y + 6; yy++) {
        for (let xx = x - 6; xx <= x + 6; xx++) {
          const i2 = st.inBounds(xx, yy) ? st.idx(xx, yy) : -1;
          ty[n] = i2 >= 0 ? st.type[i2] : 0;
          fl[n] = i2 >= 0 ? (st.flags[i2] ? 1 : 0) : 0;
          wa[n] = i2 >= 0 ? st.wall[i2] : 0;
          fx[n] = i2 >= 0 ? st.frameX[i2]! : 0;
          fy[n] = i2 >= 0 ? st.frameY[i2]! : 0;
          n++;
        }
      }
      const b64 = Buffer.from(ty.buffer).toString('base64') +
        Buffer.from(fl).toString('base64') + Buffer.from(wa.buffer).toString('base64') +
        Buffer.from(fx.buffer).toString('base64') + Buffer.from(fy.buffer).toString('base64');
      kboxLog.push(`KB ${dieVals.length} ${x} ${y} ${b64}`);
    }
  };
  const stairLog: string[] = [];
  gThis.__swStairEv = (n: string, x: number, y: number, t: number, f: number) => {
    if (stairLog.length < 30000) stairLog.push(`${dieVals.length}|${n}|${x},${y}|t=${t} f=${f}`);
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

  // ---- mark 序仪（与 x86 JJHook.Mark 同名同位）----
  const marks: string[] = [];
  gThis.__swHouseMk = (name: string, a?: number | string, b?: number | string) => {
    marks.push(`${dieVals.length}|${name}${a !== undefined ? ' ' + String(a) + (b !== undefined ? ',' + b : '') : ''}`);
  };
  gThis.__swHouseEv = (phase: string, x: number, y: number) => {
    marks.push(`${dieVals.length}|${phase === 'try' || phase === 'no' || phase === 'ok'
      || phase === 'dtry' || phase === 'dno' || phase === 'dok' ? phase.toUpperCase() : 'EV:' + phase} ${x},${y}`);
    curStage = phase.toUpperCase().startsWith('D') && phase.length > 2 ? curStage : phase;
  };
  gThis.__swHouseStage = (t: string, a: number, b: number, c: number) => {
    marks.push(`${dieVals.length}|STAGE ${t}`);
    curStage = t;
  };
  gThis.__swHouseRooms = (ox: number, oy: number, rooms: string) => {
    marks.push(`${dieVals.length}|ROOMS ${ox},${oy}: ${rooms}`);
  };

  // IIII60：SW_I60_FNT=1 时捕获引擎帧链逐访流（TF/TI/TR184…，__swFntProbeI39）
  const fntLog: string[] = [];
  if (process.env.SW_I60_FNT === '1') {
    (gThis as { __swFntProbeI39?: { emit?: (l: string) => void } }).__swFntProbeI39 = {
      emit: (l: string) => {
        if (fntLog.length < 400000) fntLog.push(`${dieVals.length}|${l}`);
      },
    };
  }

  const chests: unknown[] = [];
  const rng = new RNG(gs.seed);
  flipGenSolid([226, 162, 225, 190], true);
  rollHouseChestCounts(st, rng, gs);
  runBuriedChestsPass(st, rng, gs, chests as never);
  runUnderworldChestsPass(st, rng, gs, chests as never);
  runCaveHousesPass(st, rng, gs, chests as never);
  flipGenSolid([226, 162, 225, 190], false);

  URp.internalSample = oInternal;
  for (const k of ['__swHouseMk', '__swHouseEv', '__swHouseRooms', '__swHouseStage', '__swTagDie']) delete gThis[k];
  delete (gThis as { __swFntProbeI39?: unknown }).__swFntProbeI39;
  if (fntLog.length) writeFileSync(`${MYOUT}/js-fntlog.txt`, fntLog.join('\n'));

  // ---- 尝试级账本（_i58a 同构）----
  const attempts: Array<Record<string, unknown>> = [];
  let cur: Record<string, unknown> | null = null;
  for (const line of marks) {
    const bar1 = line.indexOf('|');
    const idx = Number(line.slice(0, bar1));
    const rest = line.slice(bar1 + 1);
    if (rest.startsWith('TRY ') || rest.startsWith('DTRY')) {
      const sp = rest.indexOf(' ');
      const co = rest.slice(sp + 1);
      cur = { tryIdx: idx, tryMark: rest.slice(0, sp), tryCo: co,
        tryDice: [dieVals[idx - 2], dieVals[idx - 1]], events: [] as string[] };
      attempts.push(cur);
      continue;
    }
    cur?.events.push(`${idx}|${rest}`);
  }
  for (const a of attempts) {
    a.stageHist = {}; a.classHist = {};
  }
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
      builds: attempts.filter(a => (a.events as string[]).some(e => e.includes('PH BLD'))).length,
    }, attempts,
  }, null, 1));
  writeFileSync(`${MYOUT}/js-marklog.txt`, marks.join('\n'));
  writeFileSync(`${MYOUT}/js-killlog.txt`, killLog.join('\n'));
  writeFileSync(`${MYOUT}/js-kbox.txt`, kboxLog.join('\n'));
  writeFileSync(`${MYOUT}/js-stairlog.txt`, stairLog.join('\n'));
  writeFileSync(`${MYOUT}/js-dievals.json`, JSON.stringify(dieVals));
  writeFileSync(`${MYOUT}/js-dietags.json`, JSON.stringify({ stage: dieStage, cls: dieClass }));
  console.log('[i60]', JSON.stringify({ totalDice: dieVals.length, attempts: attempts.length }));
}, 900_000);
