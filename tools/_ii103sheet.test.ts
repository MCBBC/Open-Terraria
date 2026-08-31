// IIII103c: 导出 SW 内部 tile id → vanilla sheet id 映射（离线写迹分析用）
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

it('export sheet map', () => {
  const out: Record<string, number> = {};
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') out[String(i)] = s;
  }
  writeFileSync('/tmp/iii122-out/sheet.json', JSON.stringify(out));
  console.log(`sheet.json ${Object.keys(out).size} entries`);
});
