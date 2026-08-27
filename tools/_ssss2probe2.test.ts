// SSSS2 缩尺重跑 probe-a 同款逻辑（1800x500）排查 recDraws=0 之谜
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { UnifiedRandom } from '../src/core/rng';

it('mini transcript counters', async () => {
  const urp = UnifiedRandom.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const originals: Record<string, (...a: unknown[]) => unknown> = {};
  const globalLog: string[] = [];
  for (const m of ['nextDouble', 'nextInt', 'nextIntRange']) {
    originals[m] = urp[m]!;
    urp[m] = function (this: unknown, ...a: unknown[]) {
      if (globalFlag) globalLog.push(m);
      return originals[m]!.apply(this, a);
    };
  }
  let globalFlag = false;
  let ntbCalls = 0;
  const g0 = globalThis as { __swNTBCap?: (phase: string) => void };
  g0.__swNTBCap = (phase) => {
    if (phase === 'in') { ntbCalls++; globalFlag = true; }
    else globalFlag = false;
  };
  try {
    await generateWorld({
      width: 1800, height: 500, seedText: '1372357239', evil: -1,
      seedFlags: { notTheBees: true } as never,
    });
  } finally {
    delete g0.__swNTBCap;
    for (const m of ['nextDouble', 'nextInt', 'nextIntRange']) urp[m] = originals[m]!;
  }
  console.log(`ntbCalls=${ntbCalls} drawsInNTB=${globalLog.length}`);
}, 600_000);
