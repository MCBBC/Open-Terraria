// IIII176 批一次性诊断：DoPooEverywhere 逐 runner 对拍探针（JS 侧采集器）。
//   与 rig SW_I176_POO trace 逐字段同构：count|N|num2|M 头 + i|num4|raw5|end5|run[|str|stp] 行。
//   用法：cd game && SW_I176=1 npx vitest run tools/_iii176poo.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I176 === '1';
const OUT = process.env.SW_I176_OUT ?? '/tmp/iii176-out/js-poo-trace.txt';

(RUN ? it : it.skip)('i176 poo runner trace', { timeout: 900_000 }, async () => {
  const rows: string[] = [];
  const g = globalThis as { __swI176Poo?: (line: string) => void };
  g.__swI176Poo = (line: string) => { rows.push(line); };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: 'truckstop|20260910', evil: 0,
      seedFlags: { pooEverywhere: true },
    });
  } finally {
    delete g.__swI176Poo;
  }
  writeFileSync(OUT, rows.join('\n') + '\n');
  console.log(`[i176poo] rows=${rows.length} -> ${OUT}`);
});
