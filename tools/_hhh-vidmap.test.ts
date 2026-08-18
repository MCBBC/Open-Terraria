// HHHH 批一次性探针：内部 tile id → vanilla sheet 映射表落 /tmp/hhhh-vidmap.json。用后即删。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

it('vidmap', () => {
  const m: Record<number, number> = {};
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const sheet = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof sheet === 'number') m[i] = sheet;
  }
  writeFileSync('/tmp/hhhh-vidmap.json', JSON.stringify(m));
  console.log(`mapped ${Object.keys(m).length} ids`);
});
