// NNN · 9293480 门全表对拍（找 8 格缺口）
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

describe('9293480 门对拍', { timeout: 600_000 }, () => {
  it('doors', async () => {
    const g = parseWld(new Uint8Array(readFileSync('tests/golden/wld/9293480世界.wld')));
    const ours = await generateWorld({ width: g.tilesWide, height: g.tilesHigh, seedText: g.seed, name: 'nnn' });
    const st = ours.store;
    const W = g.tilesWide, H = g.tilesHigh;
    const doors = (act: Uint8Array, van: ArrayLike<number>) => {
      const out = new Map<string, string>();
      for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
        const i = y * W + x;
        if (act[i] && ((van as number[])[i] === 10 || (van as number[])[i] === 11)) {
          out.set(`${x},${y}`, `${(van as number[])[i] === 10 ? 'C' : 'O'}[${g ? 0 : 0}${0}]`);
        }
      }
      return out;
    };
    const gd = doors(g.tiles.active, g.tiles.type);
    const JV = new Array<number>(W * H);
    for (let i = 0; i < W * H; i++) JV[i] = SHEET[st.type[i]] ?? -1;
    const jd = doors(st.flags, JV);
    const gp = [...gd.keys()], jp = [...jd.keys()];
    const gOnly = gp.filter((p) => !jd.has(p));
    const jOnly = jp.filter((p) => !gd.has(p));
    console.log(`golden n=${gp.length} js n=${jp.length}`);
    console.log(`golden-only(${gOnly.length}): ${gOnly.join(' ')}`);
    console.log(`js-only(${jOnly.length}): ${jOnly.join(' ')}`);
    // 帧差
    for (const p of jp) {
      if (!gd.has(p)) continue;
      const [x, y] = p.split(',').map(Number);
      const gi = y * W + x, ji = y * W + x;
      const gf = `${g.tiles.frameX[gi]},${g.tiles.frameY[gi]}`;
      const jf = `${st.frameX[ji]},${st.frameY[ji]}`;
      if (gf !== jf) console.log(`frame @${p}: g=${gf} j=${jf}`);
    }
  });
});
