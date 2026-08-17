// 一次性：#20 Mushroom Patches 原版掷数定标（passchain 第 6 列 FNV 4e7800f9，
// 从沙漠末态锚点 46d14bb7@319318 续流暴力搜）。Corruption=5,128,077 已定标（文档）。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { UnifiedRandom } from '../src/core/rng';

(RUN ? it : it.skip)('find N: mushroom 4e7800f9 / (re-verify) corruption 7bcb7a2e', () => {
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
  const targets = new Set(['4e7800f9', '7bcb7a2e', '131dfdd2']);
  const hits: Array<[number, string]> = [];
  // 跳到沙漠锚 319318 再开始记录（webs 131dfdd2 在其前后、mushroom 在其后）
  for (let n = 0; n < 319318; n++) ur.nextInt(2);
  for (let n = 319318; n <= 9_000_000; n++) {
    if (targets.has(h())) hits.push([n, h()]);
    if (hits.length >= 3) break;
    ur.nextInt(2);
  }
  console.log('HITS(from 319318):', JSON.stringify(hits));
}, 420000);
