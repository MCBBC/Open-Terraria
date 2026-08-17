import { it } from 'vitest';
import { UnifiedRandom } from '../src/core/rng';
function h(ur: UnifiedRandom): string {
  const sac = (ur as unknown as { seedArray: Int32Array; inext: number });
  let x = 0x811c9dc5;
  const st = (b: number) => { x = Math.imul(x ^ (b & 0xff), 16777619) >>> 0; };
  for (let i = 0; i < sac.seedArray.length; i++) { const v = sac.seedArray[i] | 0; for (let b = 0; b < 4; b++) st(v >>> (8 * b)); }
  const ix = sac.inext >>> 0; for (let b = 0; b < 4; b++) st(ix >>> (8 * b));
  return x.toString(16).padStart(8, '0');
}
(it as unknown as { skipIf: (c: boolean) => typeof it }).skipIf(!process.env.SW_PARITY)('cal', () => {
  for (const want of (process.env.SW_HASHES ?? '').split(',')) {
    if (!want) continue;
    const ur = new UnifiedRandom(9293480);
    let n = -1;
    for (let k = 0; k <= 2000000; k++) {
      if (h(ur) === want) { n = k; break; }
      (ur as unknown as { internalSample: () => number }).internalSample();
    }
    console.log(`${want}: N=${n}`);
  }
});
