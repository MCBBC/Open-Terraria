// IIII198: 分阶段罐簇状态捕获（临时）
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198STAGE=1 npx vitest run tools/_iii198stage.test.ts
const RUN = process.env.SW_I198STAGE === '1';
const it = RUN ? itRaw : itRaw.skip;

import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

it('iii198 stages', async () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
  const g = globalThis as unknown as { __swI198Watch?: (tag: string, st: unknown) => void };
  g.__swI198Watch = (tag, stu) => {
    const st = stu as { type: Uint16Array; flags: Uint8Array; w: number };
    const cells = [[1435, 520], [1436, 520], [1435, 521], [1436, 521], [20, 832], [21, 832], [20, 833], [21, 833]];
    const parts = cells.map(([x, y]) => {
      const i = y * st.w + x;
      return `(${x},${y})a${st.flags[i] & 1}t${SHEET[st.type[i]]}`;
    });
    console.log(`[stage] ${tag}: ${parts.join(' ')}`);
  };
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: -1 });
  } finally { g.__swI198Watch = undefined; }
}, 900_000);
