// IIII177 一次性取证仪：导出 internal id → vanilla sheet 映射（对比 JS 槽末 dump 用）
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I177MAP === '1';
(RUN ? it : it.skip)('iii177 id2sheet export', () => {
  const map: Record<string, number> = {};
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') map[String(i)] = s;
  }
  writeFileSync('/tmp/iii177-out/id2sheet.json', JSON.stringify({ n: TILE_DEFS.length, map }));
  console.log(`[iii177] exported ${Object.keys(map).length}/${TILE_DEFS.length} sheets`);
});
