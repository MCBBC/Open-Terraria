// 一次性:列 30 行 1015-1105 的逐格 draw 消耗(找 vanilla 多掷的那格)
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { runSmoothWorldPass } from '../src/world/gen/vanilla/HalfBrickPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const TV = '/tmp/sw-hsv';
const W = 4200, H = 1200, N = W * H;
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const rd = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));

(RUN ? it : it.skip)('per-cell draws col 30', () => {
  const t52 = new Uint16Array(readFileSync(`${VG}/052_Shell_Piles.typ`).buffer.slice(0));
  const a52 = readFileSync(`${VG}/052_Shell_Piles.act`);
  const w52 = new Uint16Array(readFileSync(`${VG}/052_Shell_Piles.wal`).buffer.slice(0));
  const l52 = readFileSync(`${VG}/052_Shell_Piles.liq`);
  const half = rd(`${TV}/hs52.half`), slope = rd(`${TV}/hs52.slope`), lty = rd(`${TV}/hs52.lty`);
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(t52[i]!) ?? 0;
    st.flags[i] = a52[i] ? 1 : 0;
    st.wall[i] = w52[i]!;
    st.liquid[i] = l52[i]!;
    st.liquidType[i] = lty[i];
    st.half[i] = half[i]; st.slope[i] = slope[i];
  }
  const rng = new RNG(9293480);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  let draws = 0;
  ur.internalSample = () => { draws++; return orig(); };
  const cellDraws = new Map<string, number[]>();
  let curCell = '';
  (globalThis as { __swSWCell?: unknown }).__swSWCell = (x: number, y: number) => { curCell = `${x},${y}`; };
  const origAct = (globalThis as { __swSWAct?: unknown });
  void origAct;
  const before = new Map<string, number>();
  (globalThis as { __swSWAct?: unknown }).__swSWAct = (fn: string, x: number, y: number, e: number) => {
    void fn; void e;
    const arr = cellDraws.get(curCell) ?? [];
    arr.push(draws); cellDraws.set(curCell, arr);
    void x; void y;
  };
  try {
    runSmoothWorldPass(st, rng, { seed: 9293480 } as GenState);
  } finally {
    (globalThis as { __swSWCell?: unknown }).__swSWCell = undefined;
    (globalThis as { __swSWAct?: unknown }).__swSWAct = undefined;
  }
  // 用重放后状态不可复用;重新按行打印每格 draws(需要逐格记录——重跑一遍带记录)
  const rng2 = new RNG(9293480);
  const ur2 = (rng2 as unknown as { ur: { internalSample: () => number } }).ur;
  const orig2 = ur2.internalSample.bind(ur2);
  let draws2 = 0;
  const perCell = new Map<number, number>();
  ur2.internalSample = () => { draws2++; perCell.set(curCellId, (perCell.get(curCellId) ?? 0) + 1); return orig2(); };
  let curCellId = 0;
  const st2 = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st2.type[i] = REV.get(t52[i]!) ?? 0;
    st2.flags[i] = a52[i] ? 1 : 0;
    st2.wall[i] = w52[i]!;
    st2.liquid[i] = l52[i]!;
    st2.liquidType[i] = lty[i];
    st2.half[i] = half[i]; st2.slope[i] = slope[i];
  }
  (globalThis as { __swSWCell?: unknown }).__swSWCell = (x: number, y: number) => { curCellId = y * W + x; };
  (globalThis as { __swSWAct?: unknown }).__swSWAct = () => { };
  try {
    runSmoothWorldPass(st2, rng2, { seed: 9293480 } as GenState);
  } finally {
    (globalThis as { __swSWCell?: unknown }).__swSWCell = undefined;
    (globalThis as { __swSWAct?: unknown }).__swSWAct = undefined;
  }
  console.log('列30 行1015-1105 每格 draws:');
  for (let y = 1015; y <= 1105; y++) {
    const d = perCell.get(y * W + 30) ?? 0;
    if (d > 0) console.log(`  (30,${y}): ${d}`);
  }
  // 邻域打印(30,1090..1102)
  for (let y = 1088; y <= 1102; y++) {
    let row = `y${y}: `;
    for (let dx = -2; dx <= 2; dx++) {
      const i = y * W + 30 + dx;
      row += `[${t52[i]}${a52[i] ? '' : '⁻'}h${half[i]}s${slope[i]}] `;
    }
    console.log(row);
  }
}, 240000);
