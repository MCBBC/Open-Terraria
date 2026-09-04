import { readFileSync } from 'node:fs';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
const OUT = '/tmp/iii147-out/cap-pyr';
const hdr = JSON.parse(readFileSync(OUT + '/base_hdr.json', 'utf8'));
const st = new TileStore(hdr.w as number, hdr.h as number);
const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
const CHANS = ['flags','type','wall','liquid','liquidType','half','slope','wire'] as const;
for (const c of CHANS) {
  const len = hdr[c + '_len'] as number;
  const buf = readFileSync(`${OUT}/base_${c}.bin`);
  const bytesPer = c === 'type' || c === 'wall' ? 2 : 1;
  rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
}
const gs = JSON.parse(readFileSync(OUT + '/base_gs.json', 'utf8')) as GenState;
// pyrFindLowestCloud replica
const CLOUD = new Set([189, 196, 460, 717, 718, 719].map((sh) => TILE_INTERNAL_BY_SHEET.get(sh)).filter((v) => v !== undefined) as number[]);
let cloud = 0;
outer: for (let y = 20; y < gs.worldSurface; y++) {
  for (let x = 20; x < st.w - 20; x++) {
    const i = st.idx(x, y);
    if (st.flags[i] && CLOUD.has(st.type[i])) { cloud = y; break outer; }
  }
}
console.log('cloud=' + cloud, 'rockLevel=' + gs.rockLevel, 'shimmer=' + gs.shimmerX + ',' + gs.shimmerY, 'seed=' + gs.seed);
const rng = new RNG(gs.seed);
const num8 = rng.int(5, 7) * Math.trunc(st.w / 4200);
console.log('num8=' + num8);
for (let num9 = 0; num9 < num8; num9++) {
  let num10 = rng.int(300, st.w - 301);
  let num11 = rng.int(cloud, Math.trunc(gs.rockLevel) - 1);
  let rr = 0;
  while ((num10 > st.w * 0.47 && num10 < st.w * 0.53)
    || (gs.shimmerX >= 0 && Math.hypot(num10 - gs.shimmerX, num11 - gs.shimmerY) < 300)) {
    num10 = rng.int(300, st.w - 301);
    num11 = rng.int(cloud, Math.trunc(gs.rockLevel) - 1);
    rr++;
  }
  const start = num11;
  for (; num11 < st.h && st.inBounds(num10, num11) && !st.flags[st.idx(num10, num11)]; num11++) {
  }
  num11--;
  console.log(`draw#${num9} num10=${num10} num11=${start} rerolls=${rr} descendStop=${num11 + 1} anchor=(${num10},${num11})`);
}
