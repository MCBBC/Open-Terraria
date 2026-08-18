// FFFF 树位对拍：6 柱顶 + 穹顶结构 ASCII（wld vs JS）
// SW_FFFFT=1 npx vitest run tools/_fffftree.test.ts
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_FFFFT;
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
// 字符映射：.=air #=brick(41-44) T=tree(5) d=dirt(0) g=grass(2) p=platform(19)
// o=pot(28) B=books(50) D=door(10/11) t=torch(4/93) 9x=wall7/=wall94…
const ch = (t: number, active: boolean): string => {
  if (!active) return '.';
  if (t >= 41 && t <= 44) return '#';
  if (t === 481 || t === 482 || t === 483) return '#';
  if (t === 5) return 'T';
  if (t === 0) return 'd';
  if (t === 2) return 'g';
  if (t === 19) return 'p';
  if (t === 28) return 'o';
  if (t === 50) return 'B';
  if (t === 10 || t === 11) return 'D';
  if (t === 4 || t === 93) return 't';
  return String.fromCharCode(97 + (t % 26));
};

describe.skipIf(!RUN)('FFFF dome trees', () => {
  it('pillar tops', async () => {
    const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s12345.wld')));
    const world = await generateWorld({
      width: wld.tilesWide, height: wld.tilesHigh, seedText: '12345', evil: 1, name: 'ffff',
    });
    const st = world.store;
    const i = wld.dungeonX, n7 = wld.dungeonY;
    // 6 柱顶（cs:422-427）：(i±38,n7-25) (i±27,n7-42) (i±14,n7-49)
    const sites: Array<[number, number, string]> = [
      [i - 38, n7 - 25, 'L-outer(5w16h)'], [i + 38, n7 - 25, 'R-outer'],
      [i - 27, n7 - 41, 'L-mid(4w14h)'], [i + 27, n7 - 41, 'R-mid'],
      [i - 14, n7 - 49, 'L-inner(3w13h)'], [i + 14, n7 - 49, 'R-inner'],
    ];
    const dump = (x0: number, x1: number, y0: number, y1: number, which: 'js' | 'wld'): string[] => {
      const rows: string[] = [];
      for (let y = y0; y <= y1; y++) {
        let row = '';
        for (let x = x0; x <= x1; x++) {
          if (which === 'js') {
            if (!st.inBounds(x, y)) { row += '?'; continue; }
            const k = st.idx(x, y);
            row += ch(SHEET[st.type[k]], st.flags[k] !== 0);
          } else {
            const k = y * st.w + x;
            row += ch(wld.tiles.type[k], wld.tiles.active[k] !== 0);
          }
        }
        rows.push(`${y} ${row}`);
      }
      return rows;
    };
    for (const [px, py, name] of sites) {
      console.log(`\n=== ${name} pillar top (${px},${py}) ===`);
      const a = dump(px - 8, px + 8, py - 22, py + 4, 'wld');
      const b = dump(px - 8, px + 8, py - 22, py + 4, 'js');
      for (let r = 0; r < a.length; r++) {
        const mark = a[r].slice(2) === b[r].slice(2) ? ' ' : '*';
        console.log(`${mark}W ${a[r]}  |J ${b[r]}`);
      }
    }
  }, 600000);
});
