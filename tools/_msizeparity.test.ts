// 一次性对账（任务 #27 多尺寸化，2026-08-16）：三尺寸 JS Reset+Terrain ↔ 原版真值。
// 运行：SW_MSIZE=1 npx vitest run tools/_msizeparity.test.ts
//   （env 门 = 不入正式套件；默认 vitest include 会扫到 tools/*.test.ts，未设 SW_MSIZE 时整文件跳过）
//
// 真值来源：/tmp/vserver/*.wld（原版 server 生成的小/中/大真世界，v319 头）——
// groundLevel/rockLevel ↔ gs.worldSurface/gs.rockLevel；treeX/treeStyle/caveBackX/
// caveBackStyle/iceBackStyle/hellBackStyle/jungleBackStyle 直接读 .wld 头
// （WF:1259-1268），强校验 RandomizeTreeStyle/RandomizeCaveBackgrounds 的
// 尺寸分支掷骰序**与取值区间**（后者 (surface,rock) 锚点无法区分——Next 的
// 上下界不影响流位，只有存档值能验）。
// 区间真值（真 exe cs:8082/8157 取整，.wld 实测锚定）：
//   4200 treeX[0]/caveBackX[0] ∈ [1050,3150)
//   6400 [0] ∈ [857,3417)  [1] ∈ [2988,5548)      （0.334/0.667 ±0.2）
//   8400 [0] ∈ [840,3360)  [1] ∈ [2940,5460)  [2] ∈ [5040,7560)（0.25/0.5/0.75 ±0.15）
import { describe, it, expect } from 'vitest';
import { runResetAndTerrain, generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import type { World } from '../src/world/World';

const RUN = !!process.env.SW_MSIZE;

/** (seed, worldSurface, rockLevel)——.wld 头 groundLevel/rockLevel */
const SMALL: Array<[string, number, number]> = [
  ['111', 337, 457], ['1111', 337, 439], ['121212', 337, 499],
  ['2147483647', 332, 476], ['2222', 287, 443], ['22222', 325, 415],
  ['31415', 337, 559], ['33333', 321, 519], ['333333', 337, 541],
  ['4444', 337, 523], ['444444', 337, 517], ['5555', 337, 517],
  ['5555555', 337, 427], ['6666', 299, 497], ['777', 337, 469],
  ['8888', 337, 505], ['9293480', 337, 571], ['99999', 337, 511],
];
const MEDIUM: Array<[string, number, number]> = [
  ['2222', 493, 661], ['9293480', 493, 811], ['31415926', 493, 667],
];
const LARGE: Array<[string, number, number]> = [
  ['2222', 649, 883], ['27182818', 604, 916],
];

/** 头部全量锚（.wld 实测；jungle/hell 字段名按 .wld 文件序，断言时对回掷骰序） */
const HEAD = {
  's:2222': { treeX: [2787, 4200, 4200], treeStyle: [4, 4, 0, 0], caveBackX: [2144, 4200, 4200], caveBackStyle: [2, 3, 0, 0], ice: 2, jungle: 0, hell: 0 },
  's:9293480': { treeX: [2669, 4200, 4200], treeStyle: [4, 3, 0, 0], caveBackX: [2468, 4200, 4200], caveBackStyle: [7, 6, 0, 0], ice: 3, jungle: 1, hell: 1 },
  'm:2222': { treeX: [2975, 4738, 6400], treeStyle: [0, 5, 3, 0], caveBackX: [2056, 4726, 6400], caveBackStyle: [2, 3, 4, 0], ice: 2, jungle: 1, hell: 2 },
  'm:9293480': { treeX: [2831, 3359, 6400], treeStyle: [3, 5, 4, 0], caveBackX: [3002, 5472, 6400], caveBackStyle: [3, 6, 4, 0], ice: 1, jungle: 0, hell: 0 },
  'm:31415926': { treeX: [3241, 3620, 6400], treeStyle: [4, 2, 5, 0], caveBackX: [1691, 5399, 6400], caveBackStyle: [3, 4, 6, 0], ice: 2, jungle: 1, hell: 0 },
  'l:2222': { treeX: [2925, 4663, 5179], treeStyle: [5, 3, 1, 2], caveBackX: [2550, 3776, 6190], caveBackStyle: [2, 4, 6, 5], ice: 2, jungle: 0, hell: 1 },
  'l:27182818': { treeX: [997, 3347, 6236], treeStyle: [3, 2, 1, 0], caveBackX: [1494, 4320, 5440], caveBackStyle: [7, 1, 4, 3], ice: 2, jungle: 1, hell: 2 },
} as const;

describe.skipIf(!RUN)('多尺寸 Reset+Terrain ↔ 原版 .wld 真值', () => {
  const table: Array<[string, number, number, typeof SMALL]> = [
    ['小 4200×1200', 4200, 1200, SMALL],
    ['中 6400×1800', 6400, 1800, MEDIUM],
    ['大 8400×2400', 8400, 2400, LARGE],
  ];
  for (const [label, w, h, rows] of table) {
    it(`${label}：${rows.length} 种子 (worldSurface, rockLevel) 全部精确相等`, () => {
      for (const [seed, ws, rl] of rows) {
        const { gs } = runResetAndTerrain({ width: w, height: h, seedText: seed });
        expect(gs.worldSurface, `${label} seed=${seed} worldSurface`).toBe(ws);
        expect(gs.rockLevel, `${label} seed=${seed} rockLevel`).toBe(rl);
      }
    }, 240_000);
  }

  it('treeX/caveBackX/样式族：三尺寸 7 世界与 .wld 头逐值相等（区间+掷骰序双验）', () => {
    for (const [k, want] of Object.entries(HEAD)) {
      const w = k[0] === 's' ? 4200 : k[0] === 'm' ? 6400 : 8400;
      const h = w === 4200 ? 1200 : w === 6400 ? 1800 : 2400;
      const seed = k.slice(2);
      const { gs } = runResetAndTerrain({ width: w, height: h, seedText: seed });
      expect(gs.treeX, `${k} treeX`).toEqual([...want.treeX]);
      expect(gs.treeStyle, `${k} treeStyle`).toEqual([...want.treeStyle]);
      expect(gs.caveBackX, `${k} caveBackX`).toEqual([...want.caveBackX]);
      expect(gs.caveBackStyle, `${k} caveBackStyle`).toEqual([...want.caveBackStyle]);
      expect(gs.iceBackStyle, `${k} iceBackStyle`).toBe(want.ice);
      expect(gs.hellBackStyle, `${k} hellBackStyle`).toBe(want.hell);      // 掷骰序 ice→hell→jungle（cs:8211-8213）
      expect(gs.jungleBackStyle, `${k} jungleBackStyle`).toBe(want.jungle);
    }
  }, 120_000);
});

describe.skipIf(!RUN)('多尺寸全链冒烟（generateWorld 走完）', () => {  it('中 6400×1800：全管线完成', async () => {
    const t0 = Date.now();
    const world = await generateWorldSize(1, '2222');
    expect(world.store.w).toBe(6400);
    expect(world.store.h).toBe(1800);
    expect(world.size).toBe(1);
    console.log(`medium 6400×1800 全链完成 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }, 600_000);
  it('大 8400×2400：全管线完成', async () => {
    const t0 = Date.now();
    const world = await generateWorldSize(2, '2222');
    expect(world.store.w).toBe(8400);
    expect(world.store.h).toBe(2400);
    expect(world.size).toBe(2);
    console.log(`large 8400×2400 全链完成 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }, 600_000);
});

async function generateWorldSize(size: 0 | 1 | 2, seedText: string): Promise<World> {
  const { width, height } = SIZE_DIMS[size];
  return generateWorld({ size, width, height, seedText, evil: 0 });
}
