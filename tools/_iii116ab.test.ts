// IIII99d 批一次性对拍仪（A/B 定域）：generateWorld 终态四数组 FNV 打印。
// 用法：
//   npx vitest run tools/_iii116ab.test.ts            # 当前树（含 99d 消费者面）
//   SW_I99D_NODISP=1 npx vitest run tools/_iii116ab.test.ts   # 消费者面回退哨兵
// 种子可换：SW_116_SEED='1511931452' SW_116_EVIL='1'
import { it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { fnv1a } from '../tests/pass-hash.test';

const SEED = process.env.SW_116_SEED ?? '1511931452';
const EVIL = Number(process.env.SW_116_EVIL ?? '1') as 0 | 1;
process.env.SW_MB_1457 = process.env.SW_MB_1457 ?? '1';

it('final four-array hash print', async () => {
  const world = await generateWorld({ width: 4200, height: 1200, seedText: SEED, evil: EVIL });
  const st = world.store;
  const out = {
    seed: SEED, evil: EVIL,
    type: fnv1a(st.type), flags: fnv1a(st.flags),
    wall: fnv1a(st.wall), liquid: fnv1a(st.liquid),
    nodisp: process.env.SW_I99D_NODISP === '1',
  };
  console.log(`[III116AB] ${JSON.stringify(out)}`);
}, 400000);
