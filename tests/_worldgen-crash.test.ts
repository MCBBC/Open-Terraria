// 一次性复现:worldgen 21% 栈溢出真实调用栈
import { describe, it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

// 默认跳过（整场生成 ~10s+）：设 SW_GEN_REPRO=1 启用——崩溃复现/种子扫用
const itRepro = process.env.SW_GEN_REPRO ? it : it.skip;
describe('worldgen crash repro', () => {
  itRepro('full run', async () => {
    const w = await generateWorld(
      { seed: Number(process.env.SW_SEED || 1145141919), size: Number(process.env.SW_SIZE ?? 1) as never, difficulty: 0, evil: 0, seedText: String(process.env.SW_SEED || 1145141919), name: 'crash-probe' } as never,
      (label, p) => console.log(`[gen] ${(p * 100) | 0}% ${label}`),
    );
    console.log('OK', w.store.w, w.store.h);
  }, 600_000);
});
