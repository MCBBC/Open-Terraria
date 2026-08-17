// 一次性（II 批 #98）：列 2802 处理瞬间的网格状态——face 为何消失。
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

(RUN ? it : it.skip)('col 2802 pass-time state', () => {
  const gs = JSON.parse(readFileSync('/tmp/sw-ddfin-js/cap.json', 'utf8')) as GenState;
  console.log(`oasis: n=${gs.numOasis} x=${gs.oasisX} y=${gs.oasisY} w=${gs.oasisW} beachD=${gs.beachDistance} ws=${gs.worldSurface}`);
  const st = buildStore();
  const rng = new RNG(gs.seed);
  // 在列扫描 x=2802 前捕获状态:借助列骰——包一层 nextInt(8) 计数
  const r2 = rng as unknown as { nextInt: (n: number) => number };
  const orig = r2.nextInt.bind(rng);
  let n8 = 0;
  let dumped = false;
  (rng as unknown as { nextInt: (n: number) => number }).nextInt = (mv: number) => {
    const v = orig(mv);
    if (mv === 8) {
      n8++;
      // 中段从 x=400 起:第 n8 次 = 列 400+n8-1
      const col = 400 + n8 - 1;
      if (col === 2802 && !dumped) {
        dumped = true;
        console.log('col 2802 dice =', v);
        for (let y = 246; y <= 258; y++) {
          const i = st.idx(2802, y);
          console.log(`  (2802,${y}) act=${st.flags[i]} sheet=${SHEET[st.type[i]]} wall=${st.wall[i]} liq=${st.liquid[i]}`);
        }
      }
    }
    return v;
  };
  runCactusPalmTreesAndCoralPass(st, rng, gs);
}, 240000);
