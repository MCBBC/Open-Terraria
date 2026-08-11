import { describe, it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY } from '../src/data/tiles';

describe('tmp diag', () => {
  it('ids + spots', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: 'dungeon-spawn-chain' });
    const st = world.store;
    const DBLUE = TILE_BY_KEY['v_41_blue_brick'] ?? -1;
    const DGREEN = TILE_BY_KEY['v_43_green_brick'] ?? -1;
    const DPINK = TILE_BY_KEY['v_44_pink_brick'] ?? -1;
    console.log('ids', DBLUE, DGREEN, DPINK);
    console.log('groundLevel', world.groundLevel, 'rockLevel', world.rockLevel, 'dungeonX', world.dungeonX, 'dungeonY', world.dungeonY);
    const isDW = (w: number) => w === 7 || w === 8 || w === 9 || (w >= 94 && w <= 99);
    let n = 0;
    for (let y = Math.max(10, Math.floor(world.groundLevel) + 1); y < Math.min(st.h - 10, Math.floor(world.rockLevel) + 100); y++) {
      for (let x = 100; x < st.w - 100; x++) {
        const i = st.idx(x, y);
        if (!isDW(st.wall[i])) continue;
        const t = st.type[i];
        if (t !== DBLUE && t !== DGREEN && t !== DPINK) continue;
        if (!st.isSolid(x, y)) continue;
        if (st.isSolid(x, y - 1) || st.isSolid(x, y - 2) || st.isSolid(x, y - 3)) continue;
        if (st.liquid[st.idx(x, y - 1)] > 40 || st.liquid[st.idx(x, y - 2)] > 40) continue;
        n++;
      }
    }
    console.log('SPOTS', n);
  }, 120000);
});
