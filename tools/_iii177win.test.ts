// IIII177 批一次性取证仪（DSEG 式段界掷流窗，范式=_iii170win 克隆改窗）：tooeasy
//   initializeHardMode 面首骰分叉定位。窗=▶终清理 reseed（pass105 头）→ ▶终清理
//   槽末（onWorldPartial '终清理'）——与 x86 JJHook SW_ROLLWIN=105-105 逐行同构
//   （---START/值行/---END；JS 另加 MARK|tag|ln= 段界，x86 侧无段界时按值流走）。
// 值行格式 `ln|value|M|instId`（主实例）/ `ln|value|X|instId`（其余）——主实例锚=
//   窗内第一掷（与 x86 ln==1→MainInst 同式）。
// 用法：cd game && SW_I177WIN=1 SW_I177_SEED='tooeasy|20260911' \
//        SW_I177_FLAGS=startInHardmode npx vitest run tools/_iii177win.test.ts
import { it } from 'vitest';
import { openSync, writeSync, closeSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I177WIN === '1';
const OUT = process.env.SW_I177_OUT ?? '/tmp/iii177-out';
const SEED = process.env.SW_I177_SEED ?? 'tooeasy|20260911';
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I177_FLAGS ?? 'startInHardmode').split(',').filter(Boolean)) FLAGS[f] = true;

(RUN ? it : it.skip)('iii177 tooeasy pass105 roll window', { timeout: 1_200_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;

  const fd = openSync(`${OUT}/js-rollwin.txt`, 'w');
  let buf: string[] = [];
  const flush = (): void => { if (buf.length) { writeSync(fd, buf.join('\n') + '\n'); buf = []; } };
  let winOn = false;
  let ln = 0;
  let armNext = false;
  let mainInst: object | null = null;
  const instIds = new WeakMap<object, number>();
  let instSeq = 0;
  const instId = (o: object): number => {
    let id = instIds.get(o);
    if (id === undefined) { id = ++instSeq; instIds.set(o, id); }
    return id;
  };

  g.__swOnRoll = (value: number, inst?: object) => {
    if (!winOn) return;
    ln++;
    const o = inst ?? {};
    if (mainInst === null) mainInst = o;
    const isM = o === mainInst;
    buf.push(`${ln}|${value}|${isM ? 'M' : 'X'}|${instId(o)}`);
    if (buf.length >= 500_000) flush();
  };
  g.__swSeg = (tag: string) => {
    if (!winOn) return;
    buf.push(`MARK|${tag}|ln=${ln}`);
    flush();
  };

  RNGp.reseed = function (this: unknown, s: number) {
    if (armNext && !winOn) {
      winOn = true; ln = 0; mainInst = null;
      buf.push(`---START pass105`);
      flush();
      armNext = false;
    } else if (winOn) {
      buf.push(`---END at-reseed`); flush();
      winOn = false;
    }
    return oReseed.call(this, s);
  };

  const t0 = Date.now();
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: 0,
      seedFlags: FLAGS,
      onWorldPartial: (_w, _i, pn) => {
        if (pn === '断线陷阱清理') armNext = true;
        if (pn === '终清理' && winOn) {
          buf.push('---END slot 终清理'); flush();
          winOn = false;
        }
      },
    });
  } finally {
    RNGp.reseed = oReseed;
    delete g.__swOnRoll;
    delete g.__swSeg;
    flush();
    closeSync(fd);
  }
  console.log(`[iii177] window captured ln=${ln} ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${OUT}/js-rollwin.txt`);
});
