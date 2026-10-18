// 雪原不长杂草/花/蘑菇(原版 GrassPlantsEvilPlantsAndPumpkinsOnSurface,WorldGen.cs:20209-20260
// 仅 草2→杂草3/腐化草23→24/猩红草199→201,无雪分支;Flowers :20592 也只作用于草)。
// 曾 SNOW 混入 runSurfaceDecorPass 门禁 = "杂草花长在冰雪环境"根因(2026-08-13)。
// 注:雪面上的冰块/泥浆块叠层是合法地形,不在此列。
// ★IIIII259（测试世界档案化）：两用例 4 次 generateWorld→档案载入（同种子同世界同
//   断言;本断言裸读 type 无 flags 门——档案=读档口径,幽灵格已按读档边界净化,
//   净化只减 type 值不新增命中,evil 植物存在性已实档验证）。cfg 见
//   tests/world-fixture-gen.test.ts SPECS snow-12345-*。
import { it, expect } from 'vitest';
import { TILE_BY_KEY, T, TILE_DEFS } from '../src/data/tiles';
import { loadFixtureWorld } from './world-fixtures';
import { fixtureMissing } from './world-fixtures';

it.skipIf(fixtureMissing('snow-12345-e-m1'))('雪面无杂草/花/蘑菇(冰与泥浆叠层除外)', async () => {
  const world = loadFixtureWorld('snow-12345-e-m1');
  const st = world.store;
  const SNOW = TILE_BY_KEY['snow']!;
  const ILLEGAL = new Set<number>([T.TALLGRASS, T.FLOWER, T.MUSHROOM]);
  let bad = 0;
  for (let x = 1; x < st.w - 1; x++) {
    for (let y = 1; y < st.h - 1; y++) {
      const i = st.idx(x, y);
      if (st.type[i + st.w] === SNOW && ILLEGAL.has(st.type[i])) bad++;
    }
  }
  expect(bad).toBe(0);
}, 240_000);

it.skipIf(fixtureMissing('snow-12345-e-m1', 'snow-12345-e0', 'snow-12345-e1'))('群系体检直方图断言:沙/冰面同样禁草花菇;邪恶草上必生邪恶植物(两邪恶)', async () => {
  const mk = async (evil: -1 | 0 | 1) =>
    // ★IIIII259 档案载入（evil=-1 复用 t1 的 snow-12345-e-m1;name 字段 display-only
    //   差异('snow' vs 'b'),断言面只扫 tiles）
    loadFixtureWorld(evil === -1 ? 'snow-12345-e-m1' : evil === 0 ? 'snow-12345-e0' : 'snow-12345-e1');
  const bySheet = (s: number) => {
    for (let i = 0; i < TILE_DEFS.length; i++) if (TILE_DEFS[i]?.vanilla?.sheet === s) return i;
    return -1;
  };
  const SNOW = TILE_BY_KEY['snow']!, SAND = TILE_BY_KEY['sand']!;
  const ICE = bySheet(161)!;
  const BANNED = new Set<number>([T.TALLGRASS, T.FLOWER, T.MUSHROOM]);
  const w0 = await mk(-1);
  {
    const st = w0.store;
    let bad = 0;
    for (const g of [SNOW, SAND, ICE]) {
      for (let x = 1; x < st.w - 1; x++) for (let y = 1; y < st.h - 1; y++) {
        const i = st.idx(x, y);
        if (st.type[i + st.w] === g && BANNED.has(st.type[i])) bad++;
      }
    }
    expect(bad).toBe(0);
  }
  // 邪恶植物存在性(腐化 23→24 / 猩红 199→201,按种子实际邪恶侧断)
  for (const evil of [0, 1] as const) {
    const w = await mk(evil);
    const st = w.store;
    const CG = bySheet(evil === 0 ? 23 : 199)!, EP = bySheet(evil === 0 ? 24 : 201)!;
    let n = 0;
    for (let x = 1; x < st.w - 1 && n === 0; x++) for (let y = 1; y < st.h - 1; y++) {
      const i = st.idx(x, y);
      if (st.type[i + st.w] === CG && st.type[i] === EP) { n = 1; break; }
    }
    expect(n, `evil=${evil} 邪恶植物缺失`).toBe(1);
  }
}, 600_000);
