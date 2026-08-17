// 一次性：Spider pass 原版掷数定标——从重播态(每 pass 重播种子)暴力搜 FNV==6a41a116 的位点。
import { it } from 'vitest';
const RUN = process.env.SW_SPIDERN === '1';
import { UnifiedRandom } from '../src/core/rng';

(RUN ? it : it.skip)('find N: spider 6a41a116', () => {
  const ur = new UnifiedRandom(9293480);
  const st = ur as unknown as { seedArray: Int32Array; inext: number };
  const h = (): string => {
    let x = 2166136261 >>> 0;
    const byte = (v: number, s: number) => { x = Math.imul(x ^ ((v >>> s) & 0xff), 16777619) >>> 0; };
    for (let k = 0; k < 56; k++) { const v = st.seedArray[k]! | 0; byte(v, 0); byte(v, 8); byte(v, 16); byte(v, 24); }
    const ix = st.inext >>> 0;
    byte(ix, 0); byte(ix, 8); byte(ix, 16); byte(ix, 24);
    return x.toString(16).padStart(8, '0');
  };
  const targets = new Set(['6a41a116', 'c09f950f', '8698fa75']);
  const hits: Array<[number, string]> = [];
  for (let n = 0; n <= 2_000_000; n++) {
    if (targets.has(h())) { hits.push([n, h()!]); if (hits.length >= 6) break; }
    ur.nextInt(2);
  }
  console.log('HITS:', JSON.stringify(hits));
}, 420000);
