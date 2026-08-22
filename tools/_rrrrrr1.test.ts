// RRRRRR 一次性探针：CONST 链书架域掷值对拍——UnifiedRandom 全实例 nextInt/nextIntRange
// 带【返回值】span（vanilla 侧 NAV/NBV 同窗对拍）+ __bsEv/__bsWin 落盘。
// 用法：cd game && SW_RR1=1 SW_RR1_SEED=1321365005 SW_RR1_EVIL=0 \
//        SW_RR1_SPAN=/tmp/rrrrrr-out/jspan-const.txt npx vitest run tools/_rrrrrr1.test.ts
import { it } from 'vitest';
import { writeFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_RR1 === '1';
const SEED = process.env.SW_RR1_SEED ?? '1321365005';
const EVIL = Number(process.env.SW_RR1_EVIL ?? 0);
const W = Number(process.env.SW_RR1_W ?? 4200), H = Number(process.env.SW_RR1_H ?? 1200);
const SPAN = process.env.SW_RR1_SPAN ?? '/tmp/rrrrrr-out/jspan-const.txt';
const BSV = process.env.SW_RR1_BS ?? '/tmp/rrrrrr-out/js-bs-const.txt';

(RUN ? it : it.skip)('RRRRRR span+values probe', async () => {
  let n = 0;
  const fd = openSync(SPAN, 'w');
  let buf: string[] = [];
  const flush = () => { if (buf.length) { writeSync(fd, buf.join('\n') + '\n'); buf = []; } };
  const proto = UnifiedRandom.prototype as unknown as Record<string, (...a: number[]) => number>;
  const oNextInt = proto.nextInt;
  const oNextIntRange = proto.nextIntRange;
  proto.nextInt = function (this: UnifiedRandom, maxValue: number) {
    const v = oNextInt.call(this, maxValue);
    buf.push(`${++n} a ${maxValue} v=${v}`);
    if (buf.length >= 100_000) flush();
    return v;
  };
  proto.nextIntRange = function (this: UnifiedRandom, minValue: number, maxValue: number) {
    const v = oNextIntRange.call(this, minValue, maxValue);
    buf.push(`${++n} b ${minValue} ${maxValue} v=${v}`);
    if (buf.length >= 100_000) flush();
    return v;
  };
  const t0 = Date.now();
  try {
    const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_RR1_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;
    await generateWorld({ width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1, seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined });
  } finally {
    flush();
    closeSync(fd);
    proto.nextInt = oNextInt;
    proto.nextIntRange = oNextIntRange;
  }
  const bsEv = (globalThis as { __bsEv?: unknown[][] }).__bsEv ?? [];
  const bsWin = (globalThis as { __bsWin?: unknown[][] }).__bsWin ?? [];
  writeFileSync(BSV, 'WIN ' + JSON.stringify(bsWin) + '\n' + bsEv.map((r) => 'BS ' + JSON.stringify(r)).join('\n') + '\n');
  console.log(`span=${n} lines, bsEv=${bsEv.length}, win=${bsWin.length}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 900_000);
