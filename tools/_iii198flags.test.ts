import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198FLAGS=1 npx vitest run tools/_iii198flags.test.ts
const RUN = process.env.SW_I198FLAGS === '1';
const it = RUN ? itRaw : itRaw.skip;

import { parseSeedChain } from '../src/world/gen/SeedEasterEggs';
it('seed flags', () => {
  const r = parseSeedChain('1.1.1.0.iamerror|106103');
  console.log('[flags]', JSON.stringify(r.flags));
  console.log('[hits]', JSON.stringify(r.hitTexts));
});
