// IIII109 JS 掷值流（RNG.internalSample 的 __swOnRoll 样本级钩同位挂点）：
// 行=R|seq|value + 槽边界 M|END|idx|name|seq，与 x86 SW_ROLLLOG 同构逐位对拍。
// 用法：SW109_RSEED='abandonedmanors|20260904' SW109_RFLAGS=biggerAbandonedHouses \
//   SW109_ROUT=/tmp/iii109-out/js-rolllog-manors.txt npx vitest run tools/_iii109rolls.test.ts
import { it } from 'vitest';
import { openSync, writeSync, closeSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const SEED = process.env.SW109_RSEED ?? '';
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW109_RFLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;
const OUT = process.env.SW109_ROUT ?? '/tmp/iii109-out/js-rolllog.txt';

(SEED ? it : it.skip)('III109 js roll stream', { timeout: 900_000 }, async () => {
  const fd = openSync(OUT, 'w');
  let seq = 0;
  let buf: string[] = [];
  const flush = () => { if (buf.length) { writeSync(fd, buf.join('\n') + '\n'); buf = []; } };
  (globalThis as unknown as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v: number) => {
    buf.push(`R|${++seq}|${v | 0}`);
    if (buf.length >= 65536) flush();
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: 0,
      seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
      onWorldPartial: (_w, i, pn) => { flush(); writeSync(fd, `M|END|${i}|${pn}|${seq}\n`); },
    });
  } finally {
    (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll = undefined;
  }
  flush();
  closeSync(fd);
  console.log(`JS rolls=${seq} -> ${OUT}`);
});
