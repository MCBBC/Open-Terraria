// 一次性冒烟:全链 generateWorld 必须在超时内完成(防同步死循环回归——2026-08-12 水中箱事故)
// 运行:npx vitest run tests/_fullgen-smoke.test.ts
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

describe('全链生成完成性冒烟(一次性)', () => {
  for (const seed of ['9293480', '12345']) {
    it(`种子 ${seed}: generateWorld 全链完成(硬超时=防卡死)`, async () => {
      const t0 = Date.now();
      const world = await generateWorld({ width: 4200, height: 1200, seedText: seed, evil: 0 });
      expect(world.store.w).toBe(4200);
      console.log(`seed ${seed} 全链完成 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }, 300000);
  }
});
