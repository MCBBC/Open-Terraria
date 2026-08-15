// 一次性诊断：seed 12345 世界树计数 + 多种子分布（用户报"都不生成世界树了"）。
import { describe, it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY } from '../src/data/tiles';

const LIVING = TILE_BY_KEY['v_191_living_wood_block'];

async function countTrees(seedText: string, width = 4200, height = 1200) {
  const w = await generateWorld({ width, height, seedText, name: 'diag' });
  const st = w.store;
  let living = 0, leaf = 0;
  const cols = new Set<number>();
  for (let x = 0; x < st.w; x++) {
    for (let y = 0; y < st.h; y++) {
      const t = st.get(x, y);
      if (t === LIVING) { living++; cols.add(x); }
    }
  }
  return { living, cols: cols.size };
}

describe('世界树计数', () => {
  it('seed 12345 + 抽样 3 个小世界', { timeout: 900000 }, async () => {
    const a = await countTrees('12345');
    console.log('seed 12345 (4200):', JSON.stringify(a));
    for (const s of ['1', '2', '42']) {
      const r = await countTrees(s, 1200, 400);
      console.log(`seed ${s} (1200 小):`, JSON.stringify(r));
    }
  }, 900000);
});
