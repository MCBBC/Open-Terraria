// IIII190 批一次性取证仪(tooeasy #097 微群系掷流窗,范式=_iii177win 克隆改窗):
//   窗=▶微群系 reseed(pass97 头)→ 槽末「微群系」——pass97 全掷 + MARK 段界。
//   MARK 源=mbProbe(MicroBiomesPass 各臂)/__setTrackStepProbe(轨道两遍逐列)。
//   __swMbDraws=窗内累计掷数(mbProbe rc 消费)。
// 用法:cd game && SW_I190WIN=1 SW_I190_SEED='tooeasy|20260911' \
//        SW_I190_FLAGS=startInHardmode npx vitest run tools/_iii190win.test.ts
import { it } from 'vitest';
import { openSync, writeSync, closeSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { __setTrackStepProbe, __setTrackKillProbe } from '../src/world/gen/vanilla/TrackPass';

const RUN = process.env.SW_I190WIN === '1';
const OUT = process.env.SW_I190_OUT ?? '/tmp/iii190-out';
const SEED = process.env.SW_I190_SEED ?? 'tooeasy|20260911';
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I190_FLAGS ?? 'startInHardmode').split(',').filter(Boolean)) FLAGS[f] = true;

(RUN ? it : it.skip)('iii190 tooeasy pass97 roll window', { timeout: 1_200_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;

  const fd = openSync(`${OUT}/js-rollwin97.txt`, 'w');
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
  g.__swSeg = (tag: string, detail?: unknown) => {
    if (!winOn) return;
    buf.push(`MARK|${tag}|ln=${ln}${detail !== undefined ? ` ${JSON.stringify(detail)}` : ''}`);
    if (buf.length >= 500_000) flush();
  };
  g.__swMbDraws = () => ln;
  // IIII190：TF/TI 事件迹（与 x86 JJHook FntLog 同词表；rc=窗口 ln）
  (g as unknown as { __swFntProbeI39?: unknown }).__swFntProbeI39 = {
    emit: (l: string) => {
      if (!winOn) return;
      buf.push(`F|${l}`);
      if (buf.length >= 500_000) flush();
    },
    rc: () => ln,
  };

  __setTrackStepProbe((loop, k, x, y, ph) => {
    if (!winOn) return;
    buf.push(`MARK|TRK${loop}#${k}@${x},${y}ph${ph}|ln=${ln}`);
    if (buf.length >= 500_000) flush();
  });
  __setTrackKillProbe((draws, x, y, sheet, fx, fy) => {
    if (!winOn) return;
    buf.push(`KILL|${draws}|${x} ${y} ${sheet} ${fx} ${fy}`);
    if (buf.length >= 500_000) flush();
  }, () => ln);
  g.__swKill190 = (_draws, x, y, sheet, fx, fy) => {
    if (!winOn) return;
    buf.push(`KILL2|${ln}|${x} ${y} ${sheet} ${fx} ${fy}`);
    if (buf.length >= 500_000) flush();
  };

  RNGp.reseed = function (this: unknown, s: number) {
    if (armNext && !winOn) {
      winOn = true; ln = 0; mainInst = null;
      buf.push(`---START pass97`);
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
        if (pn === '蜂巢幼虫') armNext = true;
        if (pn === '微群系' && winOn) {
          buf.push('---END slot 微群系'); flush();
          winOn = false;
        }
      },
    });
  } finally {
    RNGp.reseed = oReseed;
    __setTrackStepProbe(undefined);
    __setTrackKillProbe(undefined);
    delete g.__swKill190;
    delete g.__swOnRoll;
    delete g.__swSeg;
    delete g.__swMbDraws;
    delete (g as unknown as { __swFntProbeI39?: unknown }).__swFntProbeI39;
    flush();
    closeSync(fd);
  }
  console.log(`[iii190] window captured ln=${ln} ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${OUT}/js-rollwin97.txt`);
});
