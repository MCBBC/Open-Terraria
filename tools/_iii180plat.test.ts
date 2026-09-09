import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I180PLAT=1 npx vitest run tools/_iii180plat.test.ts
const RUN = process.env.SW_I180PLAT === '1';
const it = RUN ? itRaw : itRaw.skip;

import { TILE_DEFS } from '../src/data/tiles';
import { readFileSync } from 'node:fs';
it('platform set compare', () => {
  const jsPlat = new Set<number>();
  for (const d of TILE_DEFS as unknown as Array<{ vanilla?: { sheet?: number }; platform?: boolean }>) {
    if (d?.platform && typeof d.vanilla?.sheet === 'number') jsPlat.add(d.vanilla.sheet);
  }
  const src = readFileSync('tools/golden/caves-oracle.cs', 'utf8');
  const m = src.match(/var MB_PLATFORM = new HashSet<ushort> \{([^;]*)\};/);
  const orPlat = new Set([...m![1].matchAll(/\d+/g)].map((x) => +x[0]));
  const onlyJs = [...jsPlat].filter((x) => !orPlat.has(x)).sort((a, b) => a - b);
  const onlyOr = [...orPlat].filter((x) => !jsPlat.has(x)).sort((a, b) => a - b);
  console.log('JS plat sheets:', jsPlat.size, 'oracle:', orPlat.size);
  console.log('only in JS:', onlyJs.join(','));
  console.log('only in oracle:', onlyOr.join(','));
});
