import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
(it as never as ((n: string, f: () => void) => void))('rev check', () => {
  const W = 4200, H = 1200, N = W * H;
  const rev = new Map<number, number>();
  const multi = new Map<number, number[]>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s !== 'number') continue;
    if (!rev.has(s)) rev.set(s, i); else { const a = multi.get(s) ?? []; a.push(i); multi.set(s, a); }
  }
  const t = new Uint16Array(readFileSync('/tmp/iii7-out/x86-dump2/096_Larva.typ').buffer.slice(0));
  const a = new Uint8Array(readFileSync('/tmp/iii7-out/x86-dump2/096_Larva.act'));
  const cnt = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    if (!a[i]) continue;
    const s = t[i];
    if (!cnt.has(s)) cnt.set(s, 0);
    cnt.set(s, cnt.get(s)! + 1);
  }
  const miss = [...cnt.keys()].filter((s) => !rev.has(s));
  console.log('sheets in use:', cnt.size, 'missing-from-rev:', JSON.stringify(miss));
  console.log('dup sheets count:', multi.size, [...multi.keys()].slice(0, 40));
  for (const s of miss) console.log(`MISSING sheet=${s} cells=${cnt.get(s)}`);
});
