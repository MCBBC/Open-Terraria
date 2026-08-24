// GGGGGGGG 批一次性探针（用毕即删）：JS 链 dungeon 检查点网格导出——
// 与 oracle GRID_DUMP=dungeon:/tmp/gggg-or32 对拍（#32 槽 1456→1457 增量归因）。
import { it } from 'vitest';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';

it('dump JS dungeon grid', () => {
  (globalThis as { __cavesGridExport?: { at: string; dir: string } }).__cavesGridExport = {
    at: 'dungeon', dir: '/tmp/gggg-js32',
  };
  const res = chainCheckpoints('9293480', 0);
  console.log('dungeon hash:', res.grids.get('dungeon'));
}, 300000);
