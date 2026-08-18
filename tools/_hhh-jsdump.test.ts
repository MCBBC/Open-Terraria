// HHHH 批一次性探针：JS 链检查点双种子哈希落 /tmp/hhhh-js-*.json（oracle 迭代期
// 免重复跑 JS 链——JS 侧只读，哈希在尾段修复期恒定）。用后即删。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';

it('dump JS chain checkpoints', () => {
  for (const [seedText, evil, out] of [
    ['9293480', 0, '/tmp/hhhh-js-9293480.json'],
    ['1511931452', 1, '/tmp/hhhh-js-1511931452.json'],
  ] as const) {
    const res = chainCheckpoints(seedText, evil);
    const obj: Record<string, string> = {};
    for (const [k, v] of res.grids) obj[k] = v;
    writeFileSync(out, JSON.stringify(obj, null, 1));
    console.log(`dumped ${out} (${res.grids.size} checkpoints)`);
  }
}, 600000);
