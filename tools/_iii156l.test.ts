import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
it('i156 base larva', () => {
  const OUT = '/tmp/iii149-out/cap-pre';
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'wall'] as const) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    rec[c]!.set(new (c === 'type' || c === 'wall' ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  let rev = -1;
  for (let i = 0; i < TILE_DEFS.length; i++) if (TILE_DEFS[i]?.vanilla?.sheet === 231) { rev = i; break; }
  let n = 0; const cells: string[] = [];
  for (let y = 347; y <= 990; y++) for (let x = 210; x <= 1889; x++) {
    const i = st.idx(x, y);
    if (st.flags[i] && st.type[i] === rev) { n++; if (cells.length < 12) cells.push(`${x},${y}`); }
  }
  console.log(`base seat0 t231 cells=${n} at ${cells.join(' ')}`);
});
