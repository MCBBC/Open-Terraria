// IIII68b 一次性仪：CELEB 四格 RollingCactus @1806-1807×487-488 Final_Cleanup 时序线
// （JS 侧，与 x86 /tmp/iii74-out/x86run/fc.log 同词表：V/TF/KTPRE/BTRIG/BW/FCCOL/SLOT#）。
// 用法：cd game && SW_I74=1 npx vitest run tools/_iii74mb.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I74 === '1';
const OUT = process.env.SW_I74_DIR ?? '/tmp/iii74-out/jrun2';

(RUN ? it : it.skip)('iii68b four-cell FinalCleanup timeline', async () => {
  mkdirSync(OUT, { recursive: true });
  const g = globalThis as unknown as Record<string, unknown>;
  const marks: string[] = [];
  g.__swSeg = (n: string): void => { marks.push(n); };
  // IIII57 钟乳石取证钩（kill/ck 事件；FC 段归段由 SLOT# 行切分）
  g.__swD59v = (o: Record<string, unknown>): void => {
    if (o.e === 'kill' || o.e === 'kfr') marks.push(`D59 ${JSON.stringify(o)}`);
  };
  (g as unknown as { __swShimTargets?: Set<string> }).__swShimTargets =
    new Set(['1806,487', '1807,487', '1806,488', '1807,488',
      '1650,652', '1651,652', '1650,653', '1651,653']);
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1999040562', evil: 0,
      seedFlags: { tenthAnniversary: true },
      onWorldPartial: (_w, i, pn) => { marks.push(`SLOT#${i}:${pn}`); },
    });
  } finally {
    delete g.__swSeg;
    delete g.__swD59v;
    delete g.__swShimTargets;
  }
  writeFileSync(`${OUT}/js-fc.log`, marks.join('\n') + '\n');
  console.log(`[i74] marks=${marks.length}`);
}, 900_000);
