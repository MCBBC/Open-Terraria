// IIII168 一次性：采 iamerror 链神庙 rooms/depths/bbox（__swTmRooms/__swTmDepths 钩）
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I168ROOMS=1 npx vitest run tools/_iii168rooms.test.ts
const RUN = process.env.SW_I168ROOMS === '1';
const it = RUN ? itRaw : itRaw.skip;

import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
const OUT = process.env.SW_I168_OUT ?? '/tmp/iii168-out';
it('capture temple rooms', async () => {
  let cap: unknown;
  const g = globalThis as { __swTmRooms?: (r: unknown, sx: number, sy: number) => void };
  g.__swTmRooms = (r, sx, sy) => { if (!cap) cap = { rooms: r, sx, sy }; };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: 0,
      seedFlags: { errorWorld: true }, onWorldPartial: () => {},
    });
  } finally { delete g.__swTmRooms; }
  writeFileSync(`${OUT}/temple-rooms.json`, JSON.stringify(cap));
  console.log(`[i168] rooms -> ${OUT}/temple-rooms.json`);
}, 600_000);
