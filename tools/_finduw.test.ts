// 一次性:#28 Underworld 掷数定标——passchain_x86 第 6 列 = 原版 pass 末 Main.rand FNV。
// 每 pass 重播 stream(seed) 第 0 掷起（RNG.reseed 注释/WorldGenerator.cs:497 实证），
// 故从 UnifiedRandom(9293480) 逐掷推进、状态 FNV 命中即得原版精确掷数。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { UnifiedRandom } from '../src/core/rng';

(RUN ? it : it.skip)('find underworld pass roll counts', () => {
  const ur = new UnifiedRandom(9293480);
  const stateHash = (): string => {
    let h = 2166136261 >>> 0;
    const byte = (v: number, s: number) => { h = Math.imul(h ^ ((v >>> s) & 0xff), 16777619) >>> 0; };
    for (let k = 0; k < 56; k++) { const v = ur.seedArray[k]! | 0; byte(v, 0); byte(v, 8); byte(v, 16); byte(v, 24); }
    const ix = ur.inext >>> 0;
    byte(ix, 0); byte(ix, 8); byte(ix, 16); byte(ix, 24);
    return h.toString(16).padStart(8, '0');
  };
  // 目标:passchain_x86.txt col6（pass 末 Main.rand FNV）
  const targets = new Map([['131dfdd2', 'Webs#27-end'], ['8f1bfb12', 'Underworld#28-end'], ['7bcb7a2e', 'Corruption#29-end']]);
  const hits: Array<[number, string, string]> = [];
  const LIMIT = 64_000_000;
  for (let n = 0; n <= LIMIT; n++) {
    const h = stateHash();
    if (targets.has(h)) { hits.push([n, h, targets.get(h)!]); console.log('HIT', n, h, targets.get(h)); }
    ur.nextInt(2);
  }
  console.log('RESULT', JSON.stringify(hits));
}, 480000);
