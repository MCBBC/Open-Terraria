// ★SW-BN6 2026-09-08 电池族 RNG 统一播种件（BJ9/BJ11/BJ19 三度登记的 flake 治理推广）。
// 范式源 = slime-item-ladder-parity.test.ts（SW-BJ11 内联 mulberry32 版,同种子同函数,
// 本件抽出的目的 = 单源,防各电池复制漂移）:
// AI 电池断言依赖 Math.random 调用【序列】,模块级惰性初始化(战利品表/贴表构建等)
// 消费的掷数随首载顺序漂移 → 在测掷点映射整体错位 = 偶发炸红。治理 = beforeEach
// 全域钉种子,文件内每次用例从同一起点出发,构造期(settle/Enemy.fromVanilla 等)
// 消费的掷流亦被钉死;用例内 mockReturnValue 常量桩照旧覆盖本种子(后 spyOn 者胜),
// 断言值零改动。
// 用法（测试文件两行接入,vitest/vi 由调用方 import）:
//   beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(BATTERY_SEED)); });
//   afterEach(() => { vi.restoreAllMocks(); });
// 验收纪律:接入文件 `npx vitest run <files> --no-file-parallelism` 连跑 5 次全绿。
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 统一电池种子（SW-BJ11 首批同款 0x5111D）——全电池同源,跨文件序列可复现。 */
export const BATTERY_SEED = 0x5111D;
