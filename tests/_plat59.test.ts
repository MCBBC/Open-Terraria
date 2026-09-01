import { describe, it } from 'vitest';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
describe('plat59', () => {
  it('索引167核查', () => {
    console.log('TILE_BY_KEY.ore_lead =', TILE_BY_KEY['ore_lead']);
    console.log('TILE_DEFS[167] =', JSON.stringify(TILE_DEFS[167]));
    console.log('TILE_DEFS[110] key =', TILE_DEFS[110]?.key);
    console.log('TILE_DEFS[106] key =', TILE_DEFS[106]?.key);
    console.log('TILE_DEFS[11] key =', TILE_DEFS[11]?.key);
  });
});
