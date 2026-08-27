import { it, expect } from 'vitest';
import { UnifiedRandom } from '../src/core/rng';
it('prototype patch visibility', () => {
  const urp = UnifiedRandom.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const seen: string[] = [];
  for (const m of ['nextDouble', 'nextInt', 'nextIntRange']) {
    const o = urp[m]!;
    urp[m] = function (this: unknown, ...a: unknown[]) { seen.push(m); return o.apply(this, a); };
  }
  const u = new UnifiedRandom(42);
  u.nextIntRange(-2, 3);
  u.nextInt(10);
  expect(seen.length).toBe(2);
});
