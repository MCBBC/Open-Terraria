// SSSS2 迷你复现：验证 UnifiedRandom 原型包裹在真实管线内是否被命中
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_ORACLE === '1';   // ★一次性生成仪(2026-09-02 补门):全管线重活在身,缺省 skip 防默认 sweep 超时;SW_ORACLE=1 启用

(RUN ? it : it.skip)('patch visibility in pipeline', async () => {
  const urp = UnifiedRandom.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const seen: string[] = [];
  const originals: Record<string, (...a: unknown[]) => unknown> = {};
  for (const m of ['nextDouble', 'nextInt', 'nextIntRange']) {
    originals[m] = urp[m]!;
    urp[m] = function (this: unknown, ...a: unknown[]) {
      seen.push(m);
      return originals[m]!.apply(this, a);
    };
  }
  let ntbCalls = 0;
  const g0 = globalThis as { __swNTBCap?: (phase: string) => void };
  g0.__swNTBCap = (phase) => { if (phase === 'in') ntbCalls++; };
  try {
    await generateWorld({
      width: 1200, height: 400, seedText: '1372357239', evil: -1,
      seedFlags: { notTheBees: true } as never,
    });
  } finally {
    delete g0.__swNTBCap;
    for (const m of ['nextDouble', 'nextInt', 'nextIntRange']) urp[m] = originals[m]!;
  }
  console.log(`ntbCalls=${ntbCalls} totalIntercepts=${seen.length}`);
}, 600_000);
