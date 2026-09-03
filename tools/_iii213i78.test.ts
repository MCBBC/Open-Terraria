// ★IIIII213 一次性仪⑧：#98 迭代78 锚对拍（x86 entries-78/K.* vs JS j-entries-1/jdump1）。
// 用法：cd game && SW_I213I78=1 npx vitest run tools/_iii213i78.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
const OUT = '/tmp/iii213-out';
const W = 4200, H = 1200;
function le16(p: string): Uint16Array { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); }
function u8(p: string): Uint8Array { const b = readFileSync(p); return new Uint8Array(b.buffer, b.byteOffset, b.length); }
it('iii213 iter78 anchor diff', () => {
  const ke = readFileSync(`${OUT}/x86-iter1/entries-78.txt`, 'utf8').replace(/\r/g, '').split('\n').filter(l => l && !l.startsWith('#'));
  const jeRaw = readFileSync(`${OUT}/j-entries-1.txt`, 'utf8').split('\n');
  const je = jeRaw.filter(l => l && !l.startsWith('#') && !l.startsWith('B '));
  console.log(`entries: x86=${ke.length} js=${je.length}`);
  const kset = new Map<string, string>();
  for (const l of ke) { const p = l.split(' '); kset.set(`${p[0]},${p[1]}`, l); }
  const jset = new Map<string, string>();
  for (const l of je) { const p = l.split(' '); jset.set(`${p[0]},${p[1]}`, l); }
  const onlyK: string[] = [], onlyJ: string[] = [], diffLine: string[] = [];
  for (const [k, l] of kset) { const m = jset.get(k); if (!m) onlyK.push(l); else if (m !== l) diffLine.push(`x86=[${l}] js=[${m}]`); }
  for (const [k, l] of jset) if (!kset.has(k)) onlyJ.push(l);
  console.log(`only-in-x86=${onlyK.length} only-in-js=${onlyJ.length} same-key-diff-line=${diffLine.length}`);
  console.log('only-x86 first 12:', onlyK.slice(0, 12).join(' | '));
  console.log('only-js first 12:', onlyJ.slice(0, 12).join(' | '));
  console.log('diff-line first 6:', diffLine.slice(0, 6).join(' | '));
  // 世界液面对拍
  const kl = u8(`${OUT}/x86-iter1/K.liq`), jl = u8(`${OUT}/jdump1/K.liq`);
  let dL = 0; const cells: string[] = [];
  for (let i = 0; i < W * H; i++) {
    if (kl[i] !== jl[i]) { dL++; if (cells.length < 20) cells.push(`(${i % W},${(i / W) | 0})k${kl[i]}/j${jl[i]}`); }
  }
  console.log(`world K.liq diff=${dL}`, cells.join(' '));
  // checking 位不可比对（不落盘）——以 entries 差集为准
});
