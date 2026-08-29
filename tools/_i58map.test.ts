// IIII56: dump SW->sheet map for sheet-space diffing
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
it('i58 sheetmap', () => {
  const m: Record<number, number> = {};
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = (TILE_DEFS[i] as { vanilla?: { sheet?: number } } | undefined)?.vanilla?.sheet;
    if (typeof s === 'number') m[i] = s;
  }
  writeFileSync('/tmp/iii58-out/sw2sheet.json', JSON.stringify(m));
});
