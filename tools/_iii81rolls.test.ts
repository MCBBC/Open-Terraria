// IIII81 取证：JS 端 InternalSample 值流导出（与 rig SW_ROLLLOG 同口径同序）。
// 用法：cd game && SW_I81_ROLLS_OUT=/tmp/iii81-out/js-rolls-ctl.txt SW_I81_SEEDTXT='20260903' \
//        SW_I81_EVILV=0 [SW_I81_MAXROLLS=60000] npx vitest run tools/_iii81rolls.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = true;
const OUTP = process.env.SW_I81_ROLLS_OUT ?? '/tmp/iii81-out/js-rolls.txt';
const SEED = process.env.SW_I81_SEEDTXT ?? '20260903';
const EVIL = process.env.SW_I81_EVILV !== undefined ? Number(process.env.SW_I81_EVILV) : -1;
const FLAGS_RAW = process.env.SW_I81_FLAGSV ?? '';
const MAXROLLS = Number(process.env.SW_I81_MAXROLLS ?? 60000);
const FLAGS: Record<string, boolean> = {};
for (const f of FLAGS_RAW.split(',').filter(Boolean)) FLAGS[f] = true;
void RNG;

(RUN ? it : it.skip)('probe rolls', { timeout: 300_000 }, async () => {
  const lines: string[] = [];
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v) => {
    if (lines.length < MAXROLLS) lines.push(String(v));
  };
  await generateWorld({
    width: 4200, height: 1200, seedText: SEED,
    evil: EVIL as -1 | 0 | 1,
    seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
    onWorldPartial: () => {
      writeFileSync(OUTP, lines.join('\n') + '\n');
      throw new Error('III81 rolls captured—abort');
    },
  });
});
