import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
it('id map', () => {
  const out: string[] = [];
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = (TILE_DEFS[i] as { vanilla?: { sheet?: number } })?.vanilla?.sheet;
    if ([94,18,165,373,374,70,528,62,82,100,28,44,48].includes(s)) {
      out.push(`sheet${s}=int${i}(${(TILE_DEFS[i] as unknown as { key?: string }).key})`);
    }
  }
  console.log(out.join(' | '));
});
