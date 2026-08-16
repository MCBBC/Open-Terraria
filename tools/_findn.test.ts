// 一次性:暴力求 vanilla 指纹 46d14bb7 对应的 UnifiedRandom 消耗数
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { UnifiedRandom } from '../src/core/rng';

(RUN ? it : it.skip)('find n', () => {
  const ur = new UnifiedRandom(9293480);
  const stateHash = (): string => {
    const u = ur as unknown as { seedArray: Int32Array; inext: number };
    let h = 2166136261 >>> 0;
    const byte = (v: number, s: number) => { h = Math.imul(h ^ ((v >>> s) & 0xff), 16777619) >>> 0; };
    for (let k = 0; k < 56; k++) { const v = u.seedArray[k]! | 0; byte(v, 0); byte(v, 8); byte(v, 16); byte(v, 24); }
    const ix = u.inext >>> 0;
    byte(ix, 0); byte(ix, 8); byte(ix, 16); byte(ix, 24);
    return h.toString(16).padStart(8, '0');
  };
  const targets = new Set(['46d14bb7', '0735fc40', 'd56343c5']);
  const hits: Array<[number, string]> = [];
  let n18 = -1;
  for (let n = 0; n <= 2000000; n++) {
    const h = stateHash();
    if (targets.has(h)) { hits.push([n, h]); if (h === 'd56343c5' && n18 < 0) n18 = n; }
    ur.nextInt(2);
  }
  console.log('HITS', JSON.stringify(hits), 'n18=', n18);
  // 假说H:从 pass18 末态续流找 46d14bb7
  if (n18 >= 0) {
    const ur2 = new UnifiedRandom(9293480);
    for (let k = 0; k < n18; k++) ur2.nextInt(2);
    const st2 = ur2 as unknown as { seedArray: Int32Array; inext: number };
    const h2 = (): string => {
      let h = 2166136261 >>> 0;
      const byte = (v: number, s: number) => { h = Math.imul(h ^ ((v >>> s) & 0xff), 16777619) >>> 0; };
      for (let k = 0; k < 56; k++) { const v = st2.seedArray[k]! | 0; byte(v, 0); byte(v, 8); byte(v, 16); byte(v, 24); }
      const ix = st2.inext >>> 0;
      byte(ix, 0); byte(ix, 8); byte(ix, 16); byte(ix, 24);
      return h.toString(16).padStart(8, '0');
    };
    let found = -1;
    for (let m = 0; m <= 200000; m++) {
      if (h2() === '46d14bb7') { found = m; break; }
      ur2.nextInt(2);
    }
    console.log('H-hypothesis: from n18, 46d14bb7 at +', found);
  }
}, 240000);
