// 一次性诊断:#28 定标原版 Underworld 段(▶Underworld 重播点→AddHellHouses 入口)
// 精确掷数——IL 探针 HfEntry 的 Main.rand 流 FNV(/tmp/sw-uwp/hfentry.fnv,17598774)
// 与 UnifiedRandom(9293480) 逐掷状态哈希命中即得 N。对照 JS UW 段掷数(14,266,081)。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { UnifiedRandom } from '../src/core/rng';

(RUN ? it : it.skip)('find vanilla UW-portion roll count via HF-entry FNV', () => {
  const ur = new UnifiedRandom(9293480);
  const stateHash = (): string => {
    let h = 2166136261 >>> 0;
    const byte = (v: number, s: number) => { h = Math.imul(h ^ ((v >>> s) & 0xff), 16777619) >>> 0; };
    for (let k = 0; k < 56; k++) { const v = ur.seedArray[k]! | 0; byte(v, 0); byte(v, 8); byte(v, 16); byte(v, 24); }
    const ix = ur.inext >>> 0;
    byte(ix, 0); byte(ix, 8); byte(ix, 16); byte(ix, 24);
    return h.toString(16).padStart(8, '0');
  };
  const TARGET = '17598774';
  let hit = -1;
  const LIMIT = 16_000_000;
  for (let n = 0; n <= LIMIT; n++) {
    if (stateHash() === TARGET) { hit = n; console.log('HIT n=' + n); break; }
    ur.nextInt(2);
  }
  console.log('RESULT vanilla UW rolls =', hit, '(JS UW 段=14,266,081 → 差 =', hit >= 0 ? 14266081 - hit : 'miss', ')');
}, 480000);
