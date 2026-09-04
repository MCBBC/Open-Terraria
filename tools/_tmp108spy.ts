import { readFileSync } from 'node:fs';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runPyramidPass } from '../src/world/gen/vanilla/StructuresPass';
const OUT = '/tmp/iii147-out/cap-pyr';
const hdr = JSON.parse(readFileSync(OUT + '/base_hdr.json', 'utf8'));
const st = new TileStore(hdr.w as number, hdr.h as number);
const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
const CHANS = ['flags','type','frameX','frameY','wall','liquid','liquidType','half','slope','wire','paint','paintWall','coat'] as const;
for (const c of CHANS) {
  const len = hdr[c + '_len'] as number;
  const buf = readFileSync(`${OUT}/base_${c}.bin`);
  const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
  rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
}
const gs = JSON.parse(readFileSync(OUT + '/base_gs.json', 'utf8')) as GenState;
const rng = new RNG(gs.seed);
// spy on int()/next()
const oInt = rng.int.bind(rng);
let n = 0;
(rng as unknown as { int: (a: number, b: number) => number }).int = (a: number, b: number) => {
  const v = oInt(a, b);
  n++;
  if (true) console.log(`int#${n} (${a},${b}) -> ${v}`);
  return v;
};
const oNext = rng.next.bind(rng);
(rng as unknown as { next: () => number }).next = () => { const v = oNext(); n++; if (true) console.log(`next#${n} -> ${v}`); return v; };
runPyramidPass(st, rng, gs, []);
console.log('total int/next calls:', n);
