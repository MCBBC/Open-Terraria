import { it } from 'vitest';
import { UnifiedRandom } from '../src/core/rng';
(it as unknown as { skipIf: (c: boolean) => typeof it }).skipIf(!process.env.SW_PARITY)('draws', () => {
  const ur = new UnifiedRandom(9293480);
  const S = (ur as unknown as { internalSample: () => number });
  for (let i = 0; i < 210634; i++) S.internalSample();
  const vals: number[] = [];
  for (let i = 0; i < 6; i++) vals.push(S.internalSample());
  for (let i = 0; i < vals.length; i++) {
    const s = vals[i]! * 4.656612875245797e-10;
    console.log(`draw#${210634 + i}: Next(2,5)=${Math.trunc(s * 3) + 2} Next(5,8)=${Math.trunc(s * 3) + 5} sample=${s.toFixed(4)}`);
  }
});
