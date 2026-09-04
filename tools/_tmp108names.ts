import { TILE_DEFS } from '../src/data/tiles';
const want = new Set([15, 18, 19, 21, 44, 50, 79, 87, 89, 90, 91, 93, 101, 104, 105, 135, 137, 240, 241, 242]);
for (const d of TILE_DEFS as unknown as Array<{ vanilla?: { sheet?: number }; name?: string }>) {
  const s = d?.vanilla?.sheet;
  if (s !== undefined && want.has(s)) console.log(s, d.name);
}
