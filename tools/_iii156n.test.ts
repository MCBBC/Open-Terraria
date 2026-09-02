// IIII156 批一次性诊断：vanilla sheet 名查表（G_in dump 判读用）
import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
it('i156 names', () => {
  const rev = new Map<number, string[]>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') {
      if (!rev.has(s)) rev.set(s, []);
      rev.get(s)!.push(`${i}:${(TILE_DEFS[i] as { key?: string }).key ?? '?'}`);
    }
  }
  for (const s of [48, 135, 123, 161, 53, 106, 128, 172, 232]) console.log(`T${s} -> ${(rev.get(s) ?? ['?']).slice(0, 3).join(', ')}`);
});
