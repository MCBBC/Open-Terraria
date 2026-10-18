// 被篡改树精查：干列下方是植物(3/73/24)且再下方是草/泥土 = Flowers/Mushrooms 覆写受害者。
// ★IIIII259（测试世界档案化）：档案载入（与 _treebottom-world-audit 共用
//   'tb-8400-1814620304';断言面 flags 门控,读档口径守恒）。
import { describe, it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
import { loadFixtureWorld } from './world-fixtures';
import { fixtureMissing } from './world-fixtures';

// ★C档可移植:档案 gz 不入 git,缺档=skip
describe.skipIf(fixtureMissing('tb-8400-1814620304'))('vandalized trunks scan', () => {
  it('scan full world', async () => {
    const world = loadFixtureWorld('tb-8400-1814620304');   // ★IIIII259 档案载入
    const st = world.store;
    const info = (x: number, y: number) => {
      const i = st.idx(x, y);
      return { a: st.flags[i] !== 0, s: TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1, fx: st.frameX[i] };
    };
    const hits: unknown[] = [];
    for (let x = 1; x < st.w - 1; x++) {
      // 全列扫地表带(300-750)：找"植物坐在草块上且正上方是树干"的三明治
      for (let y = 300; y < 760; y++) {
        const here = info(x, y), above = info(x, y - 1), below = info(x, y + 1);
        void below;
        if (here.a && (here.s === 3 || here.s === 73 || here.s === 24)
          && above.a && above.s === 5) {
          // 下方类型全记录（放宽）：below 任意
          hits.push({ x, y, fx: here.fx, sheet: here.s, belowSheet: below.s, gate: x < 8400 * 0.48 ? 'L48' : x > 8400 * 0.52 ? 'R52' : '★BAND' });
        }
      }
    }
    console.log(JSON.stringify({
      total: hits.length,
      nearPlayer: hits.filter((h) => (h as { x: number }).x >= 4500 && (h as { x: number }).x <= 4620),
      sample: hits.slice(0, 20),
      bandViolations: hits.filter((h) => (h as { gate: string }).gate === '★BAND').length,
    }, null, 1));
  }, 600_000);
});
