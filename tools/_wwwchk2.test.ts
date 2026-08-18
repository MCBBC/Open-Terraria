import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
const sheets = new Set<number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') sheets.add(s); }
const files = readdirSync('/tmp/sw-slp/g');
const bySlot = new Map<number, Set<number>>();
for (const f of files) {
  if (!f.endsWith('.typ')) continue;
  const idx = Number(f.slice(0, 3));
  if (idx < 57) continue;
  const b = readFileSync('/tmp/sw-slp/g/' + f);
  const t = new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
  const a = readFileSync('/tmp/sw-slp/g/' + f.replace('.typ', '.act'));
  const local = new Set<number>();
  for (let i = 0; i < t.length; i++) { if (a[i] && !sheets.has(t[i])) local.add(t[i]); }
  if (local.size) bySlot.set(idx, local);
}
it('revmiss census runtime', () => {
  if (bySlot.size === 0) console.log('ALL MAPPED ✓');
  for (const [k, v] of [...bySlot.entries()].sort((a, b) => a[0] - b[0]).slice(0, 8)) console.log(`dump${k}: ${[...v].join(',')}`);
});
