// 一次性：定标 #21 Marble / #22 Granite / #23 Islands / #24 DirtToMud / #25 Silt / #26 Shinies
// 原版 pass 末 Main.rand 状态 FNV（passchain_x86.txt 第 6 列）对应的 Next 消耗数 N。
// 哈希算法同 _findn.test.ts（FNV-1a over seedArray[56] + inext，每 Next 推进 1 个 InternalSample）。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { UnifiedRandom } from '../src/core/rng';

(RUN ? it : it.skip)('find N for marble/granite/dirttomud/silt', () => {
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
  // passchain_x86.txt 第6列（pass 末 Main.rand FNV）
  const TARGETS: Record<string, string> = {
    '21 Marble': '74c514f7',
    '22 Granite': 'a86ee76c',
    '23 Islands': '59a0ae29',
    '24 DirtToMud': 'e580bb86',
    '25 Silt': '712e3c9b',
    '26 Shinies': 'a372b7a9',
    '20 MushroomPatches': '4e7800f9',
  };
  const rev = new Map<string, string[]>();
  for (const k of Object.keys(TARGETS)) rev.set(TARGETS[k]!, [k]);
  const hits: Array<[number, string]> = [];
  const MAX = 4000000;
  for (let n = 0; n <= MAX; n++) {
    const h = stateHash();
    const t = rev.get(h);
    if (t) { hits.push([n, t[0]!]); }
    ur.nextInt(2);
  }
  console.log('HITS', JSON.stringify(hits));
}, 300000);
