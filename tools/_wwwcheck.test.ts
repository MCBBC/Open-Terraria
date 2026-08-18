import { it, expect } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
it('alias check', () => {
  const bySheet = new Map<number, number[]>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') { const l = bySheet.get(s); if (l) l.push(i); else bySheet.set(s, [i]); }
  }
  const aliases = [...bySheet.entries()].filter(([, l]) => l.length > 1);
  console.log('sheets with >1 internal id:', aliases.length);
  for (const [s, l] of aliases.slice(0, 40)) console.log(' sheet', s, 'ids', l.join(','), 'keys', l.map(i => TILE_DEFS[i]?.key).join(','));
  expect(true).toBe(true);
});
