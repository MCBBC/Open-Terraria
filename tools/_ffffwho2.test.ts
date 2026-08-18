// FFFF 逐槽快照：tall plants/grass/(3441,149) 何时出现
// SW_FFFF6=1 npx vitest run tools/_ffffwho2.test.ts
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_FFFF6;
import { generateWorld } from '../src/world/gen/WorldGen';
import type { TileStore } from '../src/world/TileStore';

describe.skipIf(!RUN)('FFFF slot timeline', () => {
  it('timeline', async () => {
    const prev: { tall: string; g149: string; p3441: string } = { tall: '-', g149: '-', p3441: '-' };
    const snap = (st: TileStore) => ({
      tall: [3438, 3439, 3440].map((x) => (st.flags[st.idx(x, 148)] ? String(st.type[st.idx(x, 148)]) : '_')).join(','),
      g149: [3438, 3439, 3440, 3441].map((x) => (st.flags[st.idx(x, 149)] ? String(st.type[st.idx(x, 149)]) : '_')).join(','),
      p3441: st.flags[st.idx(3441, 149)] ? String(st.type[st.idx(3441, 149)]) : '_',
    });
    await generateWorld({
      width: 4200, height: 1200, seedText: '12345', evil: 1, name: 'ffff' as never,
      onWorldPartial: (w, _i, name) => {
        const s = snap(w.store);
        if (s.tall !== prev.tall || s.g149 !== prev.g149 || s.p3441 !== prev.p3441) {
          console.log(`SLOT '${name}': tall148=${s.tall} g149=${s.g149} (3441,149)=${s.p3441}`);
          Object.assign(prev, s);
        }
      },
    });
  }, 600000);
});
