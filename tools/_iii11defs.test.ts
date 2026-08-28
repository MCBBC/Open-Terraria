import { it } from 'vitest';
it('dump sheet484 def', async () => {
  const { TILE_DEFS } = await import('../src/data/tiles');
  const { vanGenSolidType } = await import('../src/world/gen/vanilla/GenSolid');
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const d = TILE_DEFS[i]!;
    if (d?.vanilla?.sheet === 484) {
      console.log('[defs] id=' + i, 'key=' + d.key, 'solid=' + d.solid, 'framed=' + d.framed,
        'vanGenSolidType(id)=' + vanGenSolidType(i));
    }
  }
});
