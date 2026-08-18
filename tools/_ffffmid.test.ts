// FFFF R-mid 树补丁逐格（3436..3444 × 147..153）wld vs JS
// SW_FFFF3=1 npx vitest run tools/_ffffmid.test.ts
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_FFFF3;
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

describe.skipIf(!RUN)('FFFF R-mid patch', () => {
  it('cells', async () => {
    const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s12345.wld')));
    const world = await generateWorld({
      width: wld.tilesWide, height: wld.tilesHigh, seedText: '12345', evil: 1, name: 'ffff',
    });
    const st = world.store;
    for (let y = 146; y <= 154; y++) {
      let ws = '', js = '';
      for (let x = 3434; x <= 3446; x++) {
        const k = y * st.w + x;
        ws += wld.tiles.active[k] ? `${wld.tiles.type[k]},`.padEnd(4) : '_,  ';
        const jk = st.idx(x, y);
        js += st.flags[jk] ? `${SHEET[st.type[jk]]},`.padEnd(4) : '_,  ';
      }
      console.log(`${ws === js ? ' ' : '*'}y=${y} W[${ws}] J[${js}]`);
    }
  }, 600000);
});
