import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I183SEEDPROBE=1 npx vitest run tools/_iii183seedprobe.test.ts
const RUN = process.env.SW_I183SEEDPROBE === '1';
const it = RUN ? itRaw : itRaw.skip;

import { parseSeedChain } from '../src/world/gen/SeedEasterEggs';
it('seed probe', () => {
  const r = parseSeedChain('1.1.1.0.iamerror|106103');
  console.log('[iii183] flags =', JSON.stringify(r.flags), 'hits =', JSON.stringify(r.hitTexts));
  console.log('[iii183] errorWorld =', r.flags.errorWorld, 'noSurface =', r.flags.noSurface);
});
