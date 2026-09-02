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
  const steps: string[] = [];
  const seq = { v: -1 };
  const g = globalThis as {
    __swI176Poo?: (line: string) => void;
    __swTrRunSeq?: { v: number };
    __swTrStep?: (o: { px: number; py: number; vx: number; vy: number; num1: number; sN2: number }) => void;
  };
  g.__swI176Poo = (line: string) => { rows.push(line); };
  g.__swTrRunSeq = seq;
  g.__swTrStep = (o) => {
    if (seq.v >= 0) {
      steps.push(`R${seq.v}|${Math.round(o.px * 1e9)}|${Math.round(o.py * 1e9)}|${Math.round(o.vx * 1e9)}|${Math.round(o.vy * 1e9)}|${Math.round(o.num1 * 1e9)}|${Math.round(o.sN2)}`);
    }
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: 'truckstop|20260910', evil: 0,
      seedFlags: { pooEverywhere: true },
    });
  } finally {
    delete g.__swI176Poo;
    delete g.__swTrStep;
    delete g.__swTrRunSeq;
  }
  writeFileSync(OUT, rows.join('\n') + '\n');
  writeFileSync(OUT.replace('-poo-trace', '-poo-step'), steps.join('\n') + '\n');
  console.log(`[i176poo] rows=${rows.length} steps=${steps.length} -> ${OUT}`);
});
