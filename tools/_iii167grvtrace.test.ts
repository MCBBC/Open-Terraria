// IIII167 批 grvfix #59 房屋/箱段全迹探针：掷流(R)+箱事件(C)+房事件(H)+房形(M)+门(G)
// 段=reseed(BuriedChests 前 WorldGen.ts:1465) → reseed(SurfaceChests 前 :1480)
// ＝ x86 pass 59 UndergroundHousesAndBuriedChests 全段。行号 ln=段内掷序（对拍 x86 rollwin）。
// 用法：SW_I167_GTRACE=1 npx vitest run tools/_iii167grvtrace.test.ts
import { it } from 'vitest';
import { appendFileSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I167_GTRACE === '1';
const G2D = process.env.SW_I167_G2 ?? `${process.env.HOME ?? ''}/GoldenChains/golden-grvfix`;
const SEED = process.env.SW_I167_SEED ?? 'nightofthelivingdead|20260903';
const EVIL = Number(process.env.SW_I167_EVIL ?? 0);
const OUT = process.env.SW_I167_TRACE_OUT ?? '/tmp/iii167-out/jstrace-grv.txt';

const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I167_FLAGS ?? '').split(',').filter(Boolean)) {
  M8_FLAGS[f] = true;
}

(RUN ? it : it.skip)('III167 grv house/chest segment trace', async () => {
  void readdirSync(G2D);
  rmSync(OUT, { force: true });
  const buf: string[] = [];
  let flushN = 0;
  const flush = (): void => {
    if (buf.length) { appendFileSync(OUT, buf.join('\n') + '\n'); flushN += buf.length; buf.length = 0; }
  };
  let rec = false;
  let ln = 0;
  const g = globalThis as Record<string, unknown>;
  g.__swOnRoll = (v: number, _inst: object) => {
    if (!rec) return;
    ln++;
    buf.push(`R|${ln}|${v}`);
    if (ln % 100000 === 0) flush();
  };
  g.__swChestEv = (p: string, i: number, j: number, x?: number) => {
    if (!rec) return;
    buf.push(`C|${ln}|${p}|${i}|${j}|${x ?? -1}`);
  };
  g.__swAbGate = (tag: string, i: number, j: number, extra?: number) => {
    if (!rec) return;
    buf.push(`G|${ln}|${tag}|${i}|${j}|${extra ?? -1}`);
  };
  g.__swHouseEv = (phase: string, x: number, y: number) => {
    if (!rec) return;
    buf.push(`H|${ln}|${phase}|${x}|${y}`);
  };
  g.__swHouseRooms = (ox: number, oy: number, rooms: string) => {
    if (!rec) return;
    buf.push(`M|${ln}|${ox}|${oy}|${rooms}`);
  };
  g.__swHouseGate = (gate: string, x: number, y: number) => {
    if (!rec) return;
    buf.push(`G|${ln}|${gate}|${x}|${y}|0`);
  };
  // RNG.reseed 包装：段边界（WorldGen.ts:1465 / 1480）
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    const m = stack.match(/src\/world\/gen\/WorldGen\.ts:(\d+):\d+/);
    if (m) {
      const line = Number(m[1]);
      if (line === 1465 && !rec) { rec = true; ln = 0; buf.push('---START 59'); }
      else if (line === 1480 && rec) { buf.push(`---PASS 59 total=${ln}`); rec = false; }
    }
    return oReseed.call(this, s);
  };
  class AbortOK extends Error {}
  try {
    await generateWorld({
      width: 4200, height: 1200,
      seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
      onWorldPartial: (_w, i, _pn) => {
        if (rec && i > 18) throw new AbortOK(`overshot-${i}`);
      },
    });
  } catch (e) {
    if (!(e instanceof AbortOK)) throw e;
  }
  RNGp.reseed = oReseed;
  flush();
  writeFileSync('/tmp/iii167-out/jstrace-grv.meta', JSON.stringify({ lines: flushN }));
  console.log(`trace written ${flushN} lines -> ${OUT}`);
}, 900_000);
