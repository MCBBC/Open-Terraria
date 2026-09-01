// ★一次性:tile 行 384/385/386 内容普查(缝行归因)
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSave } from '../src/save/SaveFile';
describe('row385', () => {
  it('census', () => {
    const { world } = loadSave(readFileSync('/Users/vinlic/Downloads/Starter_World-20260831-2315.sbw.json', 'utf8'));
    const st = world.store;
    for (const y of [383, 384, 385, 386]) {
      const tiles: Record<number, number> = {};
      const walls: Record<number, number> = {};
      for (let x = 3150; x <= 3230; x++) {
        const i = st.idx(x, y);
        const t = st.type[i], w = st.wall[i];
        tiles[t] = (tiles[t] ?? 0) + 1;
        walls[w] = (walls[w] ?? 0) + 1;
      }
      console.log(`row${y} tiles=`, JSON.stringify(tiles), ' walls=', JSON.stringify(walls));
    }
    // 385 行的 tile 明细(x, type)前 30 个非零
    const det: string[] = [];
    for (let x = 3150; x <= 3230; x++) {
      const i = st.idx(x, 385);
      if (st.type[i]) det.push(`${x}:${st.type[i]}(fx${st.frameX[i]},fy${st.frameY[i]})`);
    }
    console.log('row385 tile明细:', det.join(' '));
  });
});
