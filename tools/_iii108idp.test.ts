import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
it('id map', () => {
  const out: string[] = [];
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = (TILE_DEFS[i] as { vanilla?: { sheet?: number } })?.vanilla?.sheet;
    if (s === 94 || s === 18 || s === 165 || s === 373 || s === 374 || s === 70 || s === 528 || s === 62 || s === 82) {
      out.push(`sheet${s}=int${i}(${(TILE_DEFS[i] as unknown as { key?: string }).key})`);
    }
  }
  console.log(out.join(' | '));
});
