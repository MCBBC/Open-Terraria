// 一次性：尾部清剿批1 四 pass 原版掷数定标（passchain 第 6 列 FNV 暴力，seed 9293480）：
//   #30 Lakes=746ccbc5  #71 Pots=421632ec  #89 Vines=a2241c8f  #103 Stalac=20f3fcb2
// （每 pass 头 Main.rand=new UnifiedRandom(seed) 重播——RunPass cs:495，故绝对 n=pass 掷数）
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { UnifiedRandom } from '../src/core/rng';

(RUN ? it : it.skip)('find N: lakes/pots/vines/stalac', () => {
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
  const targets = new Set(['746ccbc5', '421632ec', 'a2241c8f', '20f3fcb2']);
  const hits: Array<[number, string]> = [];
  for (let n = 0; n <= 30_000_000; n++) {
    if (targets.has(h())) { hits.push([n, h()]); console.log('HIT', n, h()); if (hits.length >= 4) break; }
    ur.nextInt(2);
  }
  console.log('HITS:', JSON.stringify(hits));
}, 420000);
