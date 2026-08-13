// 一次性审计（_ 前缀 = 用后即删）：验证 DemonAndCrimsonAltars(cs:15825) 独立 pass。
import { describe, it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY } from '../src/data/tiles';

const ALTAR = TILE_BY_KEY['v_26_altars']!;

describe('祭坛 pass 落位审计', () => {
  for (const c of [{ seed: '9293480', evil: 0 }, { seed: '1511931452', evil: 1 }] as const) {
    it(`种子 ${c.seed} evil=${c.evil}`, async () => {
      const world = await generateWorld({ width: 4200, height: 1200, seedText: c.seed, evil: c.evil });
      const st = world.store;
      let n = 0;
      const xs: number[] = [];
      const ys: number[] = [];
      const frameBase = new Map<number, number>();
      for (let i = 0; i < st.type.length; i++) {
        if (st.flags[i] && st.type[i] === ALTAR) {
          n++;
          xs.push(i % st.w);
          ys.push((i / st.w) | 0);
          const b = Math.floor(st.frameX[i] / 54);   // style
          frameBase.set(b, (frameBase.get(b) ?? 0) + 1);
        }
      }
      const inMid = xs.filter((x) => x > 4200 * 0.45 && x < 4200 * 0.55).length;
      console.log(`evil=${c.evil} altar格=${n}(≈${(n / 6).toFixed(1)}组) ` +
        `x[${Math.min(...xs)},${Math.max(...xs)}] y[${Math.min(...ys)},${Math.max(...ys)}] ` +
        `中央带内=${inMid} style直方图=${JSON.stringify([...frameBase])}`);
    }, 600000);
  }
});
