// IIII100e2：全链 pass 级真样本计数（ftw 基线）——与 rig pc.txt R 计数对拍。
// 用法：cd game && SW_PT=1 npx vitest run tools/_iii124pt.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_PT === '1';
const OUT = process.env.SW_K13_OUT ?? '/tmp/iii124-out';

(RUN ? it : it.skip)('per-pass true-roll census (js)', async () => {
  let trueRolls = 0;
  const oRoll = (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll;
  (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll = () => { trueRolls++; };
  const marks: Array<{ name: string; rc: number }> = [];
  const cap91 = (globalThis as unknown as { __swI91Cap?: unknown }).__swI91Cap;
  (globalThis as unknown as { __swI91Cap?: unknown }).__swI91Cap =
    (_st: unknown, _g: unknown, _ch: unknown, name: string) => { marks.push({ name, rc: trueRolls }); };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1671560105', evil: 0 as -1 | 0 | 1,
      seedFlags: { getGoodWorld: true },
      onWorldPartial: () => {},
    });
  } finally {
    (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll = oRoll;
    (globalThis as unknown as { __swI91Cap?: unknown }).__swI91Cap = cap91;
  }
  const lines = ['passStart|0', ...marks.map((m) => `${m.name}|${m.rc}`)];
  writeFileSync(`${OUT}/js-passtotals.txt`, lines.join('\n') + '\n');
  console.log(`trueRolls=${trueRolls} passes=${marks.length} -> ${OUT}/js-passtotals.txt`);
}, 900_000);
