// IIII198: 目标罐格 TileFrame 全程跟踪（__swShimTargets 零开销钩复用）。
// 用法：SW_I198PT='28,625;29,625;28,626;29,626;29,627;20,832;21,832;20,833;21,833;20,834;21,834'
//        npx vitest run tools/_iii198probe.test.ts
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198PT=1 npx vitest run tools/_iii198probe.test.ts
const RUN = process.env.SW_I198PT === '1';
const it = RUN ? itRaw : itRaw.skip;

import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const TARGETS = process.env.SW_I198PT ?? '28,625;29,625;28,626;29,626;29,627;20,832;21,832;20,833;21,833;20,834;21,834';
const OUT = process.env.SW_I198PT_OUT ?? '/tmp/iii198-out/probe-tf.txt';

it('iii198 pot tf probe', async () => {
  const g = globalThis as unknown as { __swShimTargets?: Set<string>; __swSeg?: (n: string, d?: unknown) => void };
  g.__swShimTargets = new Set(TARGETS.split(';').filter(Boolean));
  const rows: string[] = [];
  g.__swSeg = (n: string, d?: unknown) => { rows.push(`${n}${d === undefined ? '' : (typeof d === 'object' ? ' ' + JSON.stringify(d) : ' ' + String(d))}`); };
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: -1 });
  } finally {
    delete g.__swShimTargets;
    g.__swSeg = undefined;
  }
  writeFileSync(OUT, rows.join('\n'));
  console.log(`[i198pt] ${rows.length} events -> ${OUT}`);
  console.log(rows.slice(0, 20).join('\n'));
}, 900_000);
