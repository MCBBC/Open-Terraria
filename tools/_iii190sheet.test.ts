// IIII190 一次性:导出新鲜 internal→sheet 映射(旧 /tmp/iii177-out/id2sheet.json 已陈旧)
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

it('iii190 dump id2sheet', () => {
  const map: Record<string, number> = {};
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') map[String(i)] = s;
  }
  writeFileSync('/tmp/iii190-out/id2sheet.json', JSON.stringify({ map }));
  console.log(`[iii190] id2sheet entries=${Object.keys(map).length}`);
});
