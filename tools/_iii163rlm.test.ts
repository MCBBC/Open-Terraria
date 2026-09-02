// IIII163 planetoids 几何取证仪（dormant）：跑 planetoids 世界,回读
// doRoundLandMasses 的圆表(__sw163Rlm)+fb 位图(__sw163RlmFb)落盘。
// 用法: SW163_OUT=/tmp/iii163-out npx vitest run tools/_iii163rlm.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

it('iii163 rlm capture', async () => {
  const g = globalThis as { __sw163Rlm?: Array<[number, number, number]>; __sw163RlmFb?: Uint8Array };
  g.__sw163Rlm = [];
  g.__sw163RlmFb = new Uint8Array(4200 * 1200);
  await generateWorld({
    width: 4200, height: 1200, seedText: 'planetoids|20260908', evil: 0,
    seedFlags: { roundLandmasses: true } as never,
  });
  writeFileSync('/tmp/iii163-out/rlm-js-circles.txt',
    (g.__sw163Rlm ?? []).map((c) => c.join(' ')).join('\n'));
  writeFileSync('/tmp/iii163-out/rlm-js-fb.bin', Buffer.from(g.__sw163RlmFb!));
  console.log(`[iii163] circles=${g.__sw163Rlm?.length} fb written`);
}, 900_000);
