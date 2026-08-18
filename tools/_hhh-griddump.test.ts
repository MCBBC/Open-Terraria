// HHHH 批一次性探针：JS 链指定检查点六通道网格落 /tmp/hhhh-js-<tag>.{typ,act,wal,liq,slope,half}
//（内部 id 空间——对拍脚本侧换算 vanilla sheet）。at 取 env HHHH_AT。用后即删。
import { it } from 'vitest';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';

const at = process.env.HHHH_AT ?? 'statues';
const dir = process.env.HHHH_DIR ?? `/tmp/hhhh-js-${at}`;
(globalThis as Record<string, unknown>).__cavesGridExport = { at, dir };

it('grid dump', () => {
  const res = chainCheckpoints('9293480', 0);
  console.log(`dumped ${dir}.* (${res.grids.size} checkpoints)`);
}, 600000);
