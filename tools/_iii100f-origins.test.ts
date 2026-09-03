// IIII100f 取证仪③：轨段 attempt origin 流序列 dump（验证扫描机制 + 巷起点来源）。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { RNG, UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_I100FO === '1';
(RUN ? it : it.skip)('iii100f attempt-origin stream probe', { timeout: 300_000 }, async () => {
  const lines: string[] = [];
  // 从统一 stream(seed=9293480) 的偏移 A0+C 起连续取 RWP 对（全失败假设,每次 2 样本）
  const seed = 9293480;
  const A0 = 1267454;
  const ur = new UnifiedRandom(seed);
  for (let i = 0; i < A0 - 5; i++) ur.next();
  for (const c of [198, 199, 200, 201, 202, 203, 204, 205, 206, 207]) {
    // 独立实例到 A0+c
    const u2 = new UnifiedRandom(seed);
    for (let i = 0; i < A0 + c; i++) u2.next();
    const r2 = new RNG(1);
    (r2 as unknown as { ur: UnifiedRandom }).ur = u2;
    const oxs: number[] = [];
    const oys: number[] = [];
    for (let k = 0; k < 12; k++) {
      oxs.push(r2.int(10, 4189));
      oys.push(r2.int(500, 999));
    }
    lines.push(`C=${c} oxs=[${oxs.join(',')}]`);
    lines.push(`      oys=[${oys.join(',')}]`);
  }
  writeFileSync('/tmp/iii225b-out/origins100f.txt', lines.join('\n') + '\n');
});
