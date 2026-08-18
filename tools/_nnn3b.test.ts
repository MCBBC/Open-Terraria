// NNN 批遗留 · 区域全图 dump（岛屋2 + 地牢入口）金标 vs JS
// 跑法：npx vitest run tools/_nnn3b.test.ts
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

const CH: Record<number, string> = {
  202: 'S', 14: 'T', 15: 'c', 10: 'D', 11: 'O', 91: 'B', 21: 'K', 5: 't', 3: 'p',
  2: 'g', 1: 's', 0: 'd', 4: '#', 207: 'F', 82: 'w', 189: 'o', 199: 'L', 27: 'W',
  16: 'C', 19: '=', 443: 'm', 485: 'n', 481: 'q', 482: 'q', 483: 'q', 123: 'x',
};

describe('NNN 区域全图', { timeout: 600_000 }, () => {
  it('dump', async () => {
    const g = parseWld(new Uint8Array(readFileSync('tests/golden/wld/12345世界.wld')));
    const ours = await generateWorld({ width: g.tilesWide, height: g.tilesHigh, seedText: g.seed, name: 'nnn' });
    const st = ours.store;
    const W = g.tilesWide;
    const G = {
      act: g.tiles.active, van: g.tiles.type as unknown as number[], fx: g.tiles.frameX,
      wall: g.tiles.wall,
    };
    const J = {
      act: st.flags, van: new Int32Array(W * g.tilesHigh), fx: st.frameX as unknown as number[], wall: st.wall,
    };
    for (let i = 0; i < W * g.tilesHigh; i++) J.van[i] = SHEET[st.type[i]] ?? -1;

    const dump = (s: typeof G, x0: number, x1: number, y0: number, y1: number, name: string) => {
      console.log(`--- ${name} x${x0}-${x1} ---`);
      let hdr = '     ';
      for (let x = x0; x <= x1; x++) hdr += x % 10 === 0 ? '|' : (x % 5 === 0 ? '+' : ' ');
      console.log(hdr);
      for (let y = y0; y <= y1; y++) {
        let row = String(y).padStart(4) + ' ';
        for (let x = x0; x <= x1; x++) {
          const i = y * W + x;
          if (!s.act[i]) {
            const wl = s.wall[i];
            row += wl === 0 ? '.' : wl === 82 ? '8' : wl === 21 ? 'G' : wl === 7 || wl === 8 || wl === 9 ? 'H' : (wl >= 94 && wl <= 99) ? 'H' : '?';
          } else {
            const t = s.van[i];
            row += CH[t] ?? (t < 10 ? String(t) : '#');
          }
        }
        console.log(row);
      }
    };

    // 岛屋2（i=1356, halfW=9, val.Y=102）
    dump(G, 1338, 1376, 90, 108, 'GOLDEN island2');
    dump(J, 1338, 1376, 90, 108, 'JS island2');

    // 地牢入口（dungeon=(3413,190)）
    dump(G, 3340, 3450, 150, 250, 'GOLDEN dungeon-entrance');
    dump(J, 3340, 3450, 150, 250, 'JS dungeon-entrance');
  });
});
