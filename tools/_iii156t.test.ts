import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
it('i156 larva internal id', () => {
  for (let i = 0; i < TILE_DEFS.length; i++) {
    if (TILE_DEFS[i]?.vanilla?.sheet === 231) console.log(`sheet 231 -> internal id ${i} key=${(TILE_DEFS[i] as { key?: string }).key}`);
    if (TILE_DEFS[i]?.vanilla?.sheet === 225) console.log(`sheet 225 -> internal id ${i} key=${(TILE_DEFS[i] as { key?: string }).key}`);
  }
});
