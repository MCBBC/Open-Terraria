// IIII193 工具：导出 internal→vanilla(sheet) 映射表供离线 diff 脚本用（零断言）
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I193MAP=1 npx vitest run tools/_iii193map.test.ts
const RUN = process.env.SW_I193MAP === '1';
const it = RUN ? itRaw : itRaw.skip;

import { writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

it('iii193 dump V_ID map', () => {
  const V_ID = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = (TILE_DEFS[i] as unknown as { vanilla?: { sheet?: number } })?.vanilla?.sheet;
    if (typeof s === 'number') V_ID[i] = s;
  }
  writeFileSync('/tmp/iii193-out/vid.json', JSON.stringify(Array.from(V_ID)));
  const plat = new Set<number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const d = TILE_DEFS[i] as unknown as { platform?: boolean; vanilla?: { sheet?: number } };
    if (d?.platform && typeof d?.vanilla?.sheet === 'number') plat.add(d.vanilla.sheet!);
  }
  writeFileSync('/tmp/iii193-out/plat.json', JSON.stringify([...plat]));
  console.log('[iii193] vid entries', V_ID.length);
});
