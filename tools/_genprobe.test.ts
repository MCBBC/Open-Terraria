import { describe, expect, it } from 'vitest';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
const d = process.env.SW_GENPROBE ? describe : describe.skip;
d('gen-unblock', { timeout: 120000 }, async () => {
  const dims = SIZE_DIMS[0];
  const t0 = Date.now();
  const world = await generateWorld({ size: 0, width: dims.width, height: dims.height, seedText: '12345' });
  console.log(`[GEN] done in ${Date.now() - t0}ms`);
  expect(world.w).toBe(4200);
});
