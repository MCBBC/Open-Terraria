// 一次性：向日葵非零种子重锁定（gen-review-tail 的种子 42 随上游流修复失效）。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY } from '../src/data/tiles';

(RUN ? it : it.skip)('sunflower seed rescan', async () => {
  const SUNFLOWER = TILE_BY_KEY['v_27_sunflower']!;
  const JUNGLE_LARGE = TILE_BY_KEY['v_233_jungle_large_plants']!;
  for (const seed of ['42', '43', '44', '45', '7', '2024', '20260817']) {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: seed, evil: 0 });
    const st = world.store;
    let sun = 0, large = 0;
    for (let i = 0; i < st.type.length; i++) {
      if (st.type[i] === SUNFLOWER) sun++;
      if (st.type[i] === JUNGLE_LARGE) large++;
    }
    console.log(`seed ${seed}: sun=${sun} jungleLarge=${large}`);
  }
}, 240000);
