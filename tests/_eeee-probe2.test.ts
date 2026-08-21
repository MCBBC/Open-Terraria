// EEEEEE 诊断（用毕即删）：打印链内指定检查点的哈希（与 _oraclesync 同口径）
import { it } from 'vitest';
import { chainCheckpoints } from './caves-checkpoint.test';
it('hash', () => {
  const res = chainCheckpoints(process.env.SW_EE_SEED ?? '9293480', (process.env.SW_EE_EVIL ?? '0') as 0 | 1);
  const want = (process.env.SW_EE_HASH ?? 'corruption').split(',');
  for (const n of want) console.log(`HASH2 ${n} ${res.grids.get(n)}`);
}, 600000);
