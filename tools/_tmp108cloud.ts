import { readFileSync } from 'node:fs';
import { TILE_INTERNAL_BY_SHEET } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/data/tiles';
const W = 4200, N = W * 1200;
const buf = readFileSync('/tmp/iii147-out/cap-pyr/base_type.bin');
const typ = new Uint16Array(buf.buffer, buf.byteOffset, buf.length >> 1);
const flags = new Uint8Array(readFileSync('/tmp/iii147-out/cap-pyr/base_flags.bin').buffer);
const CLOUDS = new Set([189, 196, 460, 717, 718, 719].map((s) => TILE_INTERNAL_BY_SHEET.get(s)).filter((v) => v !== undefined));
let lowest = 0;
const rows: number[] = [];
outer: for (let y = 20; y < 337; y++) {
  for (let x = 20; x < W - 20; x++) {
    const i = y * W + x;
    if (flags[i] & 1 && CLOUDS.has(typ[i])) { lowest = y; break outer; }
  }
}
for (let y = 20; y < 337; y++) { let c = 0; for (let x = 20; x < W - 20; x++) { const i = y * W + x; if (flags[i] & 1 && CLOUDS.has(typ[i])) c++; } if (c > 0) rows.push(y + ':' + c); }
console.log('JS CAP base lowestCloud(fresh)=' + lowest, 'cloud rows:', rows.slice(0, 6).join(' '), rows.length > 6 ? '...(' + rows.length + ' rows)' : '');
console.log('cloud internal ids:', [...CLOUDS]);
