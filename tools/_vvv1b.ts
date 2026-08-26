import { TILE_DEFS } from '../src/data/tiles.ts';
console.log('len', (TILE_DEFS as any).length);
for (let i = 0; i < 5; i++) console.log(i, JSON.stringify((TILE_DEFS as any)[i]?.vanilla));
