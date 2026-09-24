// ★BJ336 一次性 e2e（SW_BJ336=1 门,避免并行全量误跑）：
//   SW_BJ336=1 npx vitest run tests/_bj336-e2e-small-world.test.ts
//   （多籽：SW_BJ336_SEEDS='314159,12345' 覆盖,逗号分隔）
// 1200×850 全链 generateWorld 完成性——小世界挂死战役（BJ328 件4 → BJ336）终验收：
// DunesPass①（BJ328 修）→ CorruptionPass 拒绝环③（本刀修）→ 其余 pass 全链走通。
import { describe, it, expect } from 'vitest';
import { writeSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const HEAVY = process.env.SW_BJ336 === '1';
const SEEDS = (process.env.SW_BJ336_SEEDS ?? '314159,12345,9293480').split(',');

describe('BJ336 e2e: 1200×850 全链完成性', () => {
  for (const seed of SEEDS) {
    it.skipIf(!HEAVY)(`seed=${seed}`, async () => {
      const t0 = Date.now();
      const world = await generateWorld({ width: 1200, height: 850, seedText: seed, evil: 0 });
      expect(world.store.w).toBe(1200);
      expect(world.store.h).toBe(850);
      try { writeSync(1, `[bj336-e2e] seed ${seed} 全链完成 ${((Date.now() - t0) / 1000).toFixed(1)}s\n`); } catch { /* fd */ }
    }, 300000);
  }
});
