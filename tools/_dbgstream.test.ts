// 一次性诊断：JS 链流指纹（SW_STREAM_PROBE 同构）任意种子
import { it } from 'vitest';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';
it('stream fingerprints', async () => {
  for (const seed of ['4444', '6666']) {
    console.log(`=== STREAM-SEED ${seed}`);
    chainCheckpoints(seed, 0 as const);
  }
}, 300000);
