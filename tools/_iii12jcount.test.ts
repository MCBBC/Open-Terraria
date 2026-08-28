import { it } from 'vitest';
import { RNG } from '../src/core/rng';
import { nextJungleItem } from '../src/world/gen/vanilla/BuriedChestsPass';
it('jitem roll count', () => {
  const r = new RNG(12345) as RNG & { ur: { internalSample: () => number } };
  let n = 0; const orig = r.ur.internalSample.bind(r.ur);
  r.ur.internalSample = () => { n++; return orig(); };
  const gs = { jungleItemIdx: 0 } as never;
  const v1 = nextJungleItem(gs, r); const c1 = n; n = 0;
  const v2 = nextJungleItem(gs, r); const c2 = n;
  console.log(`jitem rolls=[${c1},${c2}] idx=${(gs as { jungleItemIdx: number }).jungleItemIdx}`);
});
