// FFFF 穹顶全横截面对拍（i±50 × n7-52..n7+30）
// SW_FFFFH=1 npx vitest run tools/_ffffhill.test.ts
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_FFFFH;
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;
const ch = (t: number, active: boolean): string => {
  if (!active) return '.';
  if ((t >= 41 && t <= 44) || t === 481 || t === 482 || t === 483) return '#';
  if (t === 5) return 'T';
  if (t === 0) return 'd';
  if (t === 2) return 'g';
  if (t === 19) return 'p';
  if (t === 28) return 'o';
  if (t === 50) return 'B';
  if (t === 10 || t === 11) return 'D';
  if (t === 4 || t === 93) return 't';
  if (t === 1) return 'S';
  return String.fromCharCode(97 + (t % 26));
};

describe.skipIf(!RUN)('FFFF dome cross-section', () => {
  it('full dome', async () => {
    const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s12345.wld')));
    const world = await generateWorld({
      width: wld.tilesWide, height: wld.tilesHigh, seedText: '12345', evil: 1, name: 'ffff',
    });
    const st = world.store;
    const i = wld.dungeonX, n7 = wld.dungeonY;
    const x0 = i - 50, x1 = i + 50, y0 = n7 - 52, y1 = n7 + 30;
    let hdr = '     ';
    for (let x = x0; x <= x1; x++) hdr += x === i ? '|' : ((x - i) % 10 === 0 ? '+' : ' ');
    console.log(hdr);
    for (let y = y0; y <= y1; y++) {
      let a = '', b = '';
      for (let x = x0; x <= x1; x++) {
        const k = y * st.w + x;
        a += ch(wld.tiles.type[k], wld.tiles.active[k] !== 0);
        const jk = st.idx(x, y);
        b += ch(SHEET[st.type[jk]], st.flags[jk] !== 0);
      }
      console.log(`${a === b ? ' ' : '*'}${y} W ${a} |J ${b}`);
    }
  }, 600000);
});
