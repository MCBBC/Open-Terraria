// SW_FFFFB=1 npx vitest run tools/_ffffwho4.test.ts —— reseed 钩子逐 sub-pass 定位山丘树出现点
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_FFFFB;
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import type { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

describe.skipIf(!RUN)('FFFF hill tree sub-pass', () => {
  it('reseed timeline', async () => {
    const RNGp = RNG.prototype as unknown as { reseed: (this: unknown, s: number) => void };
    const oReseed = RNGp.reseed;
    let st: TileStore | null = null;
    let label = '';
    const count = (): number => {
      if (!st) return 0;
      let n = 0;
      for (let y = 125; y <= 150; y++) {
        for (let x = 3404; x <= 3422; x++) {
          const i = st.idx(x, y);
          // 内部 tree id：动态查（id 8 假设已验证）——直接数 active 且 frameY≥198? 简化：type===8
          const d = (TILE_DEFS as unknown as Array<{ vanilla?: { sheet?: number } }>)[st.type[i]]; if (st.flags[i] && d?.vanilla?.sheet === 5) n++;
        }
      }
      return n;
    };
    RNGp.reseed = function (this: unknown, s: number) {
      const c = count();
      if (c > 0) console.log(`RESEED after '${label}': hillTrees=${c}`);
      return oReseed.call(this, s);
    };
    try {
      const world = await generateWorld({
        width: 4200, height: 1200, seedText: '12345', evil: 1, name: 'ffff',
        onWorldPartial: (w) => { st = w.store; },
      } as never);
      st = world.store;
      console.log(`FINAL hillTrees=${count()}`);
      void label;
    } finally {
      RNGp.reseed = oReseed;
    }
  }, 600000);
});
