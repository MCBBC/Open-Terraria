// 一次性：seed 8888 的 Marble/Granite/DirtToMud/Silt pass 末 N 定标（passchain_s8888.txt 第6列）
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { UnifiedRandom } from '../src/core/rng';

(RUN ? it : it.skip)('find N seed 8888', () => {
  const ur = new UnifiedRandom(8888);
  const stateHash = (): string => {
    const u = ur as unknown as { seedArray: Int32Array; inext: number };
    let h = 2166136261 >>> 0;
    const byte = (v: number, s: number) => { h = Math.imul(h ^ ((v >>> s) & 0xff), 16777619) >>> 0; };
    for (let k = 0; k < 56; k++) { const v = u.seedArray[k]! | 0; byte(v, 0); byte(v, 8); byte(v, 16); byte(v, 24); }
    const ix = u.inext >>> 0;
    byte(ix, 0); byte(ix, 8); byte(ix, 16); byte(ix, 24);
    return h.toString(16).padStart(8, '0');
  };
  const TARGETS: Record<string, string> = {
    '21 Marble': '57d42145',
    '22 Granite': 'd9197f82',
    '24 DirtToMud': '95ddda79',
  };
  const rev = new Map<string, string[]>();
  for (const k of Object.keys(TARGETS)) rev.set(TARGETS[k]!, [k]);
  const hits: Array<[number, string]> = [];
  for (let n = 0; n <= 2000000; n++) {
    const h = stateHash();
    const t = rev.get(h);
    if (t) hits.push([n, t[0]!]);
    ur.nextInt(2);
  }
  console.log('HITS', JSON.stringify(hits));
}, 300000);
