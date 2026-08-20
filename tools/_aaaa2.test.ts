// AAAAAA：逐槽 s519/s61/s184 计数轨迹（定位 s519 出现槽）。
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_A2 === '1';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }

(RUN ? it : it.skip)('aaaa2 per-slot family counts', async () => {
  await generateWorld({
    width: 4200, height: 1200, seedText: '9293480', evil: 0 as 0 | 1,
    onWorldPartial: (w, i, name) => {
      const st = w.store;
      let n519 = 0;
      for (let q = 0; q < st.type.length; q++) {
        if (st.flags[q] && SHEET[st.type[q]] === 519) n519++;
      }
      if (n519 > 0 || i >= 50) console.log(`SLOT ${i} ${name}: s519=${n519}`);
    },
  });
}, 600_000);
