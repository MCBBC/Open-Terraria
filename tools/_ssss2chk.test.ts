import { it } from 'vitest';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
it('inspect dirt def', () => {
  const d = TILE_BY_KEY['dirt'];
  const d0 = TILE_DEFS.find((x) => x?.vanilla?.sheet === 0);
  console.log('dirt keys:', Object.keys(d ?? {}).join(','));
  console.log('dirt:', JSON.stringify(d)?.slice(0, 300));
  console.log('sheet0 obj:', JSON.stringify(d0)?.slice(0, 200));
});
