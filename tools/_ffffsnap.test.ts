// FFFF R-mid 树段中间快照：液体槽末（Dungeon pass 完成后）vs 最终 vs wld
// SW_FFFF4=1 npx vitest run tools/_ffffsnap.test.ts
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_FFFF4;
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { parseWld } from '../src/wld/WldParser';
import type { TileStore } from '../src/world/TileStore';

describe.skipIf(!RUN)('FFFF R-mid snapshot', () => {
  it('post-dungeon vs final', async () => {
    const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s12345.wld')));
    let postDg: TileStore | null = null;
    const world = await generateWorld({
      width: wld.tilesWide, height: wld.tilesHigh, seedText: '12345', evil: 1, name: 'ffff',
      onWorldPartial: (w, _i, name) => { if (name === '液体') postDg = w.store; },
    });
    const st = world.store;
    const sh = (s: TileStore, x: number, y: number): number =>
      s.flags[s.idx(x, y)] ? s.type[s.idx(x, y)] : -1;
    // JS 内部 id → 显示名简表
    for (const y of [148, 149]) {
      let out = `y=${y} `;
      for (const x of [3437, 3438, 3439, 3440, 3441, 3442]) {
        const k = y * st.w + x;
        const wt = wld.tiles.active[k] ? wld.tiles.type[k] : -1;
        out += `x${x}: wld=${wt} pdg=${sh(postDg!, x, y)} fin=${sh(st, x, y)} | `;
      }
      console.log(out);
    }
    // 内部 id 名（帮助解读）
    const { TILE_DEFS } = await import('../src/data/tiles');
    const names = new Set<number>();
    for (const y of [148, 149]) for (const x of [3437, 3440, 3441]) {
      names.add(sh(postDg!, x, y)); names.add(sh(st, x, y));
    }
    for (const t of names) if (t >= 0) console.log(`id ${t} = ${TILE_DEFS[t]?.key} (sheet ${TILE_DEFS[t]?.vanilla?.sheet})`);
  }, 600000);
});
