// GGGGGGGG 批一次性探针（用毕即删）：s22222 链 JS 流指纹（SW_STREAM_PROBE 口径）——
// 与 oracle STREAM_PRINT 对拍，裁决 R11-D2 灯笼掷在 s22222 是否可达。
import { it } from 'vitest';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';

it('stream probe s22222', () => {
  process.env.SW_STREAM_PROBE = '1';
  const res = chainCheckpoints('22222', 1);
  console.log('dungeon grid hash:', res.grids.get('dungeon'));
}, 300000);
