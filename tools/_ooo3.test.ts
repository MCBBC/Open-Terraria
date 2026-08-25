// OOOOOOO 批·④：任意槽 raw 掷数记账——对比 x86 pc.txt 的 per-pass R。
// 用法: SW_O3=1 SW_O3_SEED=1321365005 SW_O3_EVIL=0 SW_O3_FLAGS=theConstant npx vitest run tools/_ooo3.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_O3 === '1';
const SEED = process.env.SW_O3_SEED ?? '1321365005';
const EVIL = Number(process.env.SW_O3_EVIL ?? 0);
const W = Number(process.env.SW_O3_W ?? 4200), H = Number(process.env.SW_O3_H ?? 1200);
const FLAGS = (process.env.SW_O3_FLAGS ?? '').split(',').filter(Boolean);

(RUN ? it : it.skip)('ooo3 per-slot roll accounting', async () => {
  const counts: number[] = [];
  let cur = 0;
  let on = false;
  const mpLog: string[] = [];
  const raws: number[] = [];
  const g0 = globalThis as { __swMpLog?: (x: number, y: number, ok: boolean) => void; __swMpStat?: (l: number, ok: boolean) => void };
  g0.__swMpLog = (x, y, ok) => { if (on) mpLog.push(`${cur}\t${x},${y}\tok=${ok}`); };
  g0.__swMpStat = (l, ok) => { if (on) mpLog.push(`STAT ${cur}\tl=${l}\tok=${ok}`); };
  const URp = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const oIS = URp.internalSample as (this: unknown) => number;
  URp.internalSample = function (this: unknown) {
    const v = oIS.call(this);
    if (on) { cur++; if (counts.length === 12) raws.push(v); }
    return v;
  };
  const names: string[] = [];
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: FLAGS.length ? Object.fromEntries(FLAGS.map(f => [f, true])) : undefined,
      onProgress: (label) => { names.push(label); },
      onWorldPartial: (_w, i) => {
        counts[i] = cur;
        cur = 0;
        on = true;
      },
    });
  } finally {
    URp.internalSample = oIS;
    delete g0.__swMpLog;
  }
  writeFileSync('/tmp/ooo-out/mplog-js.txt', mpLog.join('\n') + '\n');
  writeFileSync(`/tmp/ooo-out/slot12-raw-${SEED}.txt`, raws.map(String).join('\n') + '\n');
  console.log(`mp attempts logged: ${mpLog.length}, slot-12 raws: ${raws.length}`);
  const rows = counts.map((c, i) => `${i}\t${names[i] ?? '?'}\t${c}`);
  writeFileSync('/tmp/ooo-out/slotrolls.txt', rows.join('\n') + '\n');
  for (let i = Math.max(0, counts.length - 20); i < counts.length; i++) {
    console.log(`${i} ${names[i]} ${counts[i]}`);
  }
}, 900_000);
