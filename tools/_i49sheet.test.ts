import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
it('sheet map export', () => {
  const m: Record<number, { k: string; s: number }> = {};
  TILE_DEFS.forEach((d, i) => {
    if (!d?.vanilla) return;
    if (m[d.vanilla.sheet]) return;
    m[d.vanilla.sheet] = { k: d.key, s: d.vanilla.sheet };
  });
  // 反向：repo id -> sheet
  const r: Record<number, number> = {};
  TILE_DEFS.forEach((d, i) => { if (d?.vanilla && typeof d.vanilla.sheet === 'number') r[i] = d.vanilla.sheet; });
  writeFileSync('/tmp/iii50-out/sheetmap.json', JSON.stringify({ byRepo: r }));
  console.log('sheets', Object.keys(r).length);
});
