// EEEEEE 批诊断探针（用毕即删）：导出指定检查点的六通道网格，供与 oracle GRID_DUMP 对拍。
// 用法：SW_EE_DUMP=settle2:/tmp/eeeeee/js-settle2 SW_EE_SEED=9293480 SW_EE_EVIL=0 npx vitest run tests/_eeee-probe.test.ts
import { it } from 'vitest';
import { chainCheckpoints } from './caves-checkpoint.test';

it('dump', async () => {
  const spec = process.env.SW_EE_DUMP;
  if (!spec) throw new Error('SW_EE_DUMP required');
  const [at, dir] = spec.split(':');
  (globalThis as { __cavesGridExport?: { at: string; dir: string } }).__cavesGridExport = { at, dir };
  chainCheckpoints(process.env.SW_EE_SEED ?? '9293480', (Number(process.env.SW_EE_EVIL ?? 0) as 0 | 1));
}, 600000);
