import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/data/tiles';
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') REV.set(s, i);
}
it('dump070 REV coverage', () => {
  const dir = '/tmp/sw-num4/van_x86_g';
  const t = new Uint16Array(readFileSync(`${dir}/070_Quick_Cleanup.typ`).buffer.slice(0));
  const a = readFileSync(`${dir}/070_Quick_Cleanup.act`);
  const miss = new Map<number, number>();
  for (let i = 0; i < t.length; i++) {
    if (a[i] && !REV.has(t[i])) miss.set(t[i], (miss.get(t[i]) ?? 0) + 1);
  }
  console.log('unmapped active vanilla ids in dump070:', [...miss.entries()].sort((x,y)=>y[1]-x[1]).slice(0,20));
  console.log('REV size:', REV.size);
});
