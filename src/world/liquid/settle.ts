// 全图液体沉降（从 Game.settleLiquids 平移的纯函数，主线程 fallback 与 worker 共用）。
// mode='gen'（新建世界）：原版 WorldGen pass 49/97 Settle Liquids（WorldGen.cs:16215+）——
//   外层 10 轮跑到收敛，每轮上限 活量×5，清除生成期晚到的回流（漏斗入口等）。
// mode='load'（读档）：原版 WorldFile.cs:738-770 时序 1:1——单轮上限 100000，
//   不收敛的少量残留活水交给运行时（尾部 WaterCheck），与原版一致（无外层循环）。
// yield 按真实耗时让出（≥32ms 一次）——worker 内也保留，让 progress postMessage 流出。
import type { World } from '../World';
import { LiquidSim } from './LiquidSim';

export async function settleWorldLiquids(
  world: World,
  mode: 'gen' | 'load',
  onProgress?: (p: number) => void,
): Promise<void> {
  const sim = new LiquidSim(world);
  // 生成期标记：QuickWater 首尾跑 ShimmerRemoveWater（Liquid.cs:105-141 的
  // isGeneratingOrLoadingWorld 分支；读档 generatingWorld=false 该步骤早退）
  if (mode === 'gen') {
    sim.generatingWorld = true;
    sim.shimmerCenter = world.shimmerX > 0 ? { x: world.shimmerX, y: world.shimmerY } : null;
  }
  onProgress?.(0.05);
  sim.quickWater();
  onProgress?.(0.35);
  await new Promise((r) => setTimeout(r, 0));
  sim.waterCheck();
  sim.quickSettle = true;
  // 轮上限：读档 = WorldFile 单轮 100000（L752）；生成期 = 每轮 活量×5（WorldGen.cs:16252 num5）
  const MAX_ROUNDS = mode === 'gen' ? 10 : 1; // 读档无外层循环（WorldFile.cs:746-762）
  let iter = 0;
  let lastYield = performance.now();
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const MAX_ITER = mode === 'gen' ? Math.max(1000, (sim.numLiquid + sim.bufferLen) * 5) : 100000;
    let roundIter = 0;
    while (sim.numLiquid > 0 && roundIter < MAX_ITER) {
      sim.updateLiquid();
      iter++; roundIter++;
      if (roundIter % 2000 === 0) {
        onProgress?.(0.35 + Math.min(0.6, iter / 20000));
        if (performance.now() - lastYield >= 32) {
          await new Promise((r) => setTimeout(r, 0));
          lastYield = performance.now();
        }
      }
    }
    sim.waterCheck();
    if (sim.numLiquid === 0) break; // 收敛即止
  }
  sim.quickSettle = false;
  sim.waterCheck(); // 残留活水交给运行时收敛（原版 WorldFile.cs:769 同款）
  sim.dispose();
  onProgress?.(1);
}
