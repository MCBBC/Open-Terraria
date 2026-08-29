// IIIII49 辅助仪 v2：逐 reseed 标签打印 internalSample 计数（不分实例，直接打印）。
// SW_I49LEN=1 启用。与 x86 掷窗仪分桶对齐锚定用。
import { it } from 'vitest';
import { RNG, UnifiedRandom } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I49LEN === '1';

(RUN ? it : it.skip)('I49 per-reseed-label sample counter v2', async () => {
  const RNGp = RNG.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const URp = UnifiedRandom.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const oReseed = RNGp.reseed;
  const oInternal = URp.internalSample as (this: unknown) => number;

  let cnt = 0;
  let lastLab = '(start)';
  const rows: Array<[string, number]> = [];
  RNGp.reseed = function (this: unknown, ...a: unknown[]) {
    if (cnt > 0 || lastLab !== '(start)') rows.push([lastLab, cnt]);
    cnt = 0;
    // 标签：reseed 调用点最近 src 文件行
    let lab = '?';
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng')) { lab = `${m[1].split('/').pop()}:${m[2]}`; break; }
    }
    lastLab = lab;
    return oReseed.apply(this, a);
  };
  URp.internalSample = function (this: unknown): number {
    const v = oInternal.call(this);
    cnt++;
    return v;
  };

  await generateWorld({ width: 4200, height: 1200, seedText: '1999040562', evil: 0, seedFlags: { tenthAnniversary: true } });
  rows.push([lastLab, cnt]);
  console.log('I49LEN-BEFORE50');
  for (const [lab, c] of rows.slice(-60)) console.log(`SEG ${lab} ${c}`);
  RNGp.reseed = oReseed;
  URp.internalSample = oInternal;
}, 900_000);
