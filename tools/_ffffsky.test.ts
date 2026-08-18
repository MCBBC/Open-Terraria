// FFFF dungeon 出口 (3405..3419,138-140) 的 JS active 格是什么
// SW_FFFF8=1 npx vitest run tools/_ffffsky.test.ts
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_FFFF8;
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { parseWld } from '../src/wld/WldParser';
import type { TileStore } from '../src/world/TileStore';

describe.skipIf(!RUN)('FFFF sky cells', () => {
  it('identify', async () => {
    const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s12345.wld')));
    let postDg: TileStore | null = null;
    const world = await generateWorld({
      width: wld.tilesWide, height: wld.tilesHigh, seedText: '12345', evil: 1, name: 'ffff',
      onWorldPartial: (w, _i, name) => { if (name === '生物群系') postDg = w.store; },
    });
    const pd = postDg!;
    const st = world.store;
    const { TILE_DEFS } = await import('../src/data/tiles');
    const name = (t: number): string => `${TILE_DEFS[t]?.key ?? t}(sh${TILE_DEFS[t]?.vanilla?.sheet ?? '?'})`;
    for (const [x, y] of [[3405, 138], [3406, 139], [3410, 138], [3419, 140], [3413, 138]]) {
      const pi = pd.idx(x, y), fi = st.idx(x, y), k = y * st.w + x;
      console.log(`(${x},${y}) pdg=${pd.flags[pi] ? name(pd.type[pi]) : 'inactive'} fin=${st.flags[fi] ? name(st.type[fi]) : 'inactive'} wld=${wld.tiles.active[k] ? wld.tiles.type[k] : 'inactive'}`);
    }
    // 范围统计：sky 区 (|dx|<=30, y 130..150) pdg active 数 vs wld
    let jp = 0, wp = 0;
    for (let y = 130; y <= 150; y++) {
      for (let x = 3383; x <= 3443; x++) {
        if (pd.flags[pd.idx(x, y)]) jp++;
        if (wld.tiles.active[y * st.w + x]) wp++;
      }
    }
    console.log(`sky active count: pdg=${jp} wld=${wp}`);
  }, 600000);
});
