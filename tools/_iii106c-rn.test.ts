// IIII106c：把 golden wld 的 per-pass RandNext 解码为「pass 内掷数」——
// UnifiedRandom(seed) 每 pass 重播（WorldGenerator.RunPass：Main.rand=new UnifiedRandom(_seed)），
// RandNext=pass 尾 RNG 的当前样本；0 掷 pass 的共同值 1574501398=构造后 state。
// 在 seed=771004 样本流里定位 1574501398 的下标 baseIdx，则 pass 掷数 = idx(RandNext) - baseIdx。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { UnifiedRandom } from '../src/core/rng';

it('decode golden RandNext -> per-pass rolls', () => {
  const rows = JSON.parse(readFileSync('/tmp/iii106c-out/golden-passrandnext.json', 'utf8')) as Array<[number, string, number, boolean]>;
  const ur = new UnifiedRandom(771004);
  const LIMIT = 12_000_000;
  const want = new Map<number, Array<number>>();
  rows.forEach(([i, nm, rv]) => { const a = want.get(rv) ?? []; a.push(i); want.set(rv, a); });
  const idx = new Map<number, number>();
  let baseIdx = -1;
  const vals: number[] = [];
  for (let k = 1; k <= LIMIT; k++) {
    const v = ur.next();
    vals.push(v);
    if (v === 1574501398 && baseIdx < 0) baseIdx = k;
    const hits = want.get(v);
    if (hits) for (const h of hits) if (!idx.has(h)) idx.set(h, k);
    if (idx.size >= rows.length && baseIdx >= 0) break;
  }
  const out: Array<{ i: number; nm: string; rolls: number }> = [];
  for (const [i, nm, rv] of rows) {
    const k = idx.get(i) ?? -1;
    out.push({ i, nm, rolls: k < 0 ? -1 : k - baseIdx });
  }
  console.log('baseIdx(1574501398)=', baseIdx);
  console.log(out.map((r) => `#${r.i} ${r.nm}=${r.rolls}`).join('\n'));
  writeFileSync('/tmp/iii106c-out/golden-passrolls.json', JSON.stringify(out));
}, 600_000);
