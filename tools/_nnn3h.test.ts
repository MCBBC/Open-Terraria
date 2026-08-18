// NNN · (1860,334) 表面门上下文探查
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

describe('表面门 1860', { timeout: 600_000 }, () => {
  it('dump', async () => {
    const g = parseWld(new Uint8Array(readFileSync('tests/golden/wld/12345世界.wld')));
    const ours = await generateWorld({ width: g.tilesWide, height: g.tilesHigh, seedText: g.seed, name: 'nnn' });
    const st = ours.store;
    const W = g.tilesWide;
    const J = new Int32Array(W * g.tilesHigh);
    for (let i = 0; i < W * g.tilesHigh; i++) J[i] = st.flags[i] ? (SHEET[st.type[i]] ?? -1) : -1;
    const G = new Int32Array(W * g.tilesHigh);
    for (let i = 0; i < W * g.tilesHigh; i++) G[i] = g.tiles.active[i] ? g.tiles.type[i] : -1;
    const CH: Record<number, string> = {
      10: 'D', 11: 'O', 5: 't', 3: 'p', 2: 'g', 1: 's', 0: 'd', 202: 'S', 192: 'R', 191: 'r',
      52: 'v', 23: 'f', 199: 'L', 60: 'j', 59: 'u', 78: 'w', 80: 'c',
    };
    const dump = (A: Int32Array, name: string) => {
      console.log(`--- ${name} ---`);
      for (let y = 318; y <= 348; y++) {
        let row = String(y).padStart(4) + ' ';
        for (let x = 1840; x <= 1880; x++) {
          const t = A[y * W + x];
          row += t === -1 ? '.' : CH[t] ?? '#';
        }
        console.log(row);
      }
    };
    dump(G, 'GOLDEN');
    dump(J, 'JS');
  });
});
