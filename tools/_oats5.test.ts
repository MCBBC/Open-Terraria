// 一次性（II 批 #98）：JS pass 全程燕麦成功序(nextInt(5)=frame 掷)落盘,
// 与 vanilla O-gap 燕麦成功序对拍 → 首差 = 根因格。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync, writeFileSync } from 'node:fs';
import { runCactusPalmTreesAndCoralPass } from '../src/world/gen/vanilla/StructuresPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const W = 4200, H = 1200;
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const load = (e: string) => readFileSync(`/tmp/sw-num4/van_x86_g/097_Settle_Liquids_Again.${e}`);
function buildStore(): TileStore {
  const t = new Uint16Array(load('typ').buffer.slice(0));
  const a = load('act');
  const w = new Uint16Array(load('wal').buffer.slice(0));
  const l = load('liq');
  const half = new Uint8Array(readFileSync('/tmp/sw-mb-hs97.half').buffer.slice(0));
  const slope = new Uint8Array(readFileSync('/tmp/sw-mb-hs97.slope').buffer.slice(0));
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = l[i]! > 0 ? 1 : 0;
  }
  st.slope.set(slope);
  st.half.set(half);
  return st;
}

(RUN ? it : it.skip)('js oat success sequence', () => {
  const gs = JSON.parse(readFileSync('/tmp/sw-ddfin-js/cap.json', 'utf8')) as GenState;
  const st = buildStore();
  const rng = new RNG(gs.seed);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  let n = 0;
  const seq: number[] = [];
  const r2 = rng as unknown as { nextInt: (n: number) => number };
  const origI = r2.nextInt.bind(rng);
  ur.internalSample = () => { n++; return orig(); };
  (rng as unknown as { nextInt: (n: number) => number }).nextInt = (mv: number) => {
    const v = origI(mv);
    if (mv === 5) seq.push(n);   // 燕麦 frame 掷 = 成功路径独占
    return v;
  };
  runCactusPalmTreesAndCoralPass(st, rng, gs);
  writeFileSync('/tmp/sw-ddfin-js/oats5.txt', seq.join('\n') + '\n');
  console.log('oat successes (nextInt(5)):', seq.length, 'first 10:', seq.slice(0, 10).join(','), ' near 840350:', seq.filter((d) => d > 840000 && d < 841000));
}, 240000);
