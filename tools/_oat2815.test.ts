// 一次性（II 批 #98 根因终定位 v2）：列 2815 y=253 燕麦调用瞬间的网格状态。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
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
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
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

(RUN ? it : it.skip)('oat cell state at col2815 y253', () => {
  const gs = JSON.parse(readFileSync('/tmp/sw-ddfin-js/cap.json', 'utf8')) as GenState;
  const st = buildStore();
  const rng = new RNG(gs.seed);
  const r2 = rng as unknown as { nextInt: (n: number) => number };
  const orig = r2.nextInt.bind(rng);
  let cols = 0, i9 = 0, phase = 0, dumped = false;
  (rng as unknown as { nextInt: (n: number) => number }).nextInt = (mv: number) => {
    const v = orig(mv);
    if (phase === 0 && mv === 8) {
      cols++;
      if (400 + cols - 1 === 2815) { phase = 1; i9 = 0; }
    } else if (phase === 1 && mv === 9) {
      i9++;
      if (i9 === 253 && !dumped) {   // y=252 的 I9 完 → 即将进入 y=253
        dumped = true;
        for (const [cx, cy] of [[2815, 252], [2815, 253], [2815, 254], [2814, 253], [2816, 253]] as Array<[number, number]>) {
          const i = st.idx(cx, cy);
          console.log(`  (${cx},${cy}) act=${st.flags[i]} sheet=${SHEET[st.type[i]]} wall=${st.wall[i]} liq=${st.liquid[i]} slope=${st.slope[i]} half=${st.half[i]}`);
        }
        phase = 2;
      }
    }
    return v;
  };
  runCactusPalmTreesAndCoralPass(st, rng, gs);
  console.log('done, cols seen:', cols);
}, 240000);
