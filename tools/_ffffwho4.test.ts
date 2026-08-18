// SW_FFFFB=1 npx vitest run tools/_ffffwho4.test.ts —— slot 名 + reseed 联合时间线
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_FFFFB;
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import type { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

describe.skipIf(!RUN)('FFFF hill tree sub-pass', () => {
  it('timeline', async () => {
    const RNGp = RNG.prototype as unknown as { reseed: (this: unknown, s: number) => void };
    const oReseed = RNGp.reseed;
    let st: TileStore | null = null;
    let n = 0;
    let curSlot = '';
    const events: string[] = [];
    RNGp.reseed = function (this: unknown, s: number) {
      n++;
      if (st) {
        let c = 0;
        for (let y = 125; y <= 150; y++) {
          for (let x = 3404; x <= 3422; x++) {
            const i = st.idx(x, y);
            const d = TILE_DEFS[st.type[i]];
            if (st.flags[i] && d?.vanilla?.sheet === 5) c++;
          }
        }
        if (c > 20) events.push(`#${n}[${curSlot}] TREES=${c}`);
        else events.push(`#${n}[${curSlot}]`);
      } else events.push(`#${n}[pre]`);
      return oReseed.call(this, s);
    };
    try {
      await generateWorld({
        width: 4200, height: 1200, seedText: '12345', evil: 1, name: 'ffff',
        onWorldPartial: (w) => { st = w.store; },
      } as never, (label) => { events.push(`SLOT:${label}`); });
    } finally {
      RNGp.reseed = oReseed;
    }
    console.log(events.filter((e) => e.startsWith('SLOT') || e.includes('TREES')).slice(0, 60).join(' '));
  }, 600000);
});
