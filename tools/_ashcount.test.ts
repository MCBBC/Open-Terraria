import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
it('ash trees', async () => {
  const world = await generateWorld({ seedText: '9293480', width: 4200, height: 1200, evil: 0 });
  const st = world.store;
  let tiles = 0; const cols = new Set<number>();
  for (let i = 0; i < st.w * st.h; i++) if (st.flags[i] && SHEET[st.type[i]] === 634) { tiles++; cols.add(i % st.w); }
  console.log('ash tree 634 tiles=', tiles, 'cols=', cols.size, '(vanilla=480/97)');
}, 240000);
