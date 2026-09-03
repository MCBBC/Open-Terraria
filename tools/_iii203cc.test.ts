// IIII203 取证仪③：cactus pass 逐列掷耗台账（消费 segProbe77 CC COL/PG/ANCH/PLANT 探针）。
// 用法：cd game && SW_I203CC=1 npx vitest run tools/_iii203cc.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I203CC === '1';
const OUT = process.env.SW_I203_OUT ?? '/tmp/iii203-out';

(RUN ? it : it.skip)('iii203 cactus per-column ledger', { timeout: 1_200_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  mkdirSync(OUT, { recursive: true });
  const rows: string[] = [];
  const oSeg = g.__swSeg as ((n: string, d?: unknown) => void) | undefined;
  g.__swSeg = (n: string, d?: unknown) => {
    if (n.startsWith('CC ')) rows.push(`${n}`);
    oSeg?.(n, d);
  };
  await generateWorld({ width: 4200, height: 1200, seedText: '1138154190', evil: 0, seedFlags: { remix: true } });
  writeFileSync(`${OUT}/cc-cols.txt`, rows.join('\n') + '\n');
  console.log(`[i203cc] rows=${rows.length}`);
});
