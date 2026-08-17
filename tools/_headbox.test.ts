// 一次性（II 批 #98 根因收口）：JS head 段 (2816,253) PlaceOasisPlant 调用瞬间的盒态。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { runCactusPalmTreesAndCoralPass } from '../src/world/gen/vanilla/StructuresPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { solidTile as _solidTileHB } from '../src/world/gen/vanilla/HalfBrickPass';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const W = 4200, H = 1200;
const REV = new Map<number, number>();
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!REV.has(s)) REV.set(s, i); }
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

(RUN ? it : it.skip)('head box state at (2816,253) call', () => {
  const gs = JSON.parse(readFileSync('/tmp/sw-ddfin-js/cap.json', 'utf8')) as GenState;
  const st = buildStore();
  const rng = new RNG(gs.seed);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  let n = 0, dumped = false;
  ur.internalSample = () => { n++; return orig(); };
  const r2 = rng as unknown as { nextInt: (m: number) => number };
  const origI = r2.nextInt.bind(rng);
  (rng as unknown as { nextInt: (m: number) => number }).nextInt = (mv: number) => {
    // 每次调用后检查:第 3076 掷即将发生(n==3075)→下一次 nextInt(9) 就是 (2816,253) 的 I9
    if (!dumped && mv === 9 && n === 3076) {
      dumped = true;
      const X = 2816, Y = 253;
      console.log(`== state before I9 of head cell (${X},${Y}) (n=${n})`);
      for (let i = X - 1; i <= X + 1; i++) {
        for (let j = Y - 1; j <= Y; j++) {
          const k = st.idx(i, j);
          console.log(`  box (${i},${j}) act=${st.flags[k]} sheet=${SHEET[st.type[k]]} liq=${st.liquid[k]} fx=${st.frameX[k]}`);
        }
      }
      for (let i = X - 1; i <= X + 1; i++) {
        const k = st.idx(i, Y + 1);
        console.log(`  below (${i},${Y + 1}) act=${st.flags[k]} sheet=${SHEET[st.type[k]]} solid=${_solidTileHB(st, i, Y + 1)} slope=${st.slope[k]} half=${st.half[k]}`);
      }
      // 水检(原版语义:91×41 非实心格液量和)
      let sum = 0;
      for (let i = X - 45; i <= X + 45; i++)
        for (let j = Y - 20; j <= Y + 20; j++)
          if (st.inBounds(i, j) && !_solidTileHB(st, i, j)) sum += st.liquid[st.idx(i, j)];
      console.log(`  waterSum=${Math.trunc(sum / 255)} (>=20?)`);
    }
    return origI(mv);
  };
  runCactusPalmTreesAndCoralPass(st, rng, gs);
}, 240000);
