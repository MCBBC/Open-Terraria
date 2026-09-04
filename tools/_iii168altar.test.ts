// IIII168 一次性：采神庙祭坛主循环 1000 次采样点（__swTmAltar 钩）
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
const OUT = process.env.SW_I168_OUT ?? '/tmp/iii168-out';
it('capture altar sampling cells', async () => {
  const g = globalThis as { __swTmAltar?: (n: number, x: number, y: number) => void };
  const samples: Array<[number, number, number]> = [];
  g.__swTmAltar = (n, x, y) => samples.push([n, x, y]);
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: 0,
      seedFlags: { errorWorld: true }, onWorldPartial: () => {},
    });
  } finally { delete g.__swTmAltar; }
  writeFileSync(`${OUT}/tm-altar.json`, JSON.stringify(samples));
  console.log(`[i168] altar samples=${samples.length} -> ${OUT}/tm-altar.json`);
}, 600_000);
