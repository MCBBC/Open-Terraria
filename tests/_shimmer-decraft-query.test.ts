// 一次性查询：微光 decraft 引擎行为（火把转化 5353 二次浸泡之谜 + 选正测物品）
import { describe, it } from 'vitest';
import { decraftOutcome, isItemDecraftableAndUnlocked } from '../src/stats/Shimmer';
import { getTransformToItem } from '../src/stats/Shimmer';

describe('decraft 查询', () => {
  it('打印候选物品的转化/分解结果', () => {
    for (const vid of [8, 5353, 2331, 36, 2274, 657, 2327]) {
      const t = getTransformToItem(vid, 0);
      const ok = isItemDecraftableAndUnlocked(vid, 3, false, true, false);
      const out = decraftOutcome(vid, 3, false);
      console.log(`vid=${vid} transform=${t} decraftable=${JSON.stringify(ok)} outcome=${JSON.stringify(out)}`);
    }
  });
});
