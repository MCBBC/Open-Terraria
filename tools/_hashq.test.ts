// 一次性：pass67 CWBEGIN/CWEND/passchain 哈希对流位定标（fresh(seed)+N 对拍）。
// 用法：SW_PARITY=1 npx vitest run tools/_hashq.test.ts
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { UnifiedRandom } from '../src/core/rng';

function streamHashOf(ur: UnifiedRandom): string {
  const sac = (ur as unknown as { seedArray: Int32Array; inext: number });
  let h = 0x811c9dc5;
  const step = (b: number) => { h = Math.imul(h ^ (b & 0xff), 16777619) >>> 0; };
  for (let i = 0; i < sac.seedArray.length; i++) {
    const v = sac.seedArray[i] | 0;
    for (let b = 0; b < 4; b++) step(v >>> (8 * b));
  }
  const ix = sac.inext >>> 0;
  for (let b = 0; b < 4; b++) step(ix >>> (8 * b));
  return h.toString(16).padStart(8, '0');
}

(RUN ? it : it.skip)('pass67 hash positions', () => {
  const seed = 9293480;
  console.log('fresh+0 =', streamHashOf(new UnifiedRandom(seed)), '(CWBEGIN=d56343c5)');
  for (const want of ['d95ed054', 'f65563c4', 'd56343c5']) {
    const ur = new UnifiedRandom(seed);
    let found = -1;
    for (let n = 0; n <= 120000; n++) {
      if (streamHashOf(ur) === want) { found = n; break; }
      ur.internalSample();
    }
    console.log(`${want} @ fresh+${found}`);
  }
}, 240000);
