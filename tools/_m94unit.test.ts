// AAAAAA：placeMossSprout 掷数单元验证（合成苔藓簇）。
import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runLongMossPass } from '../src/world/gen/vanilla/SurfaceDecorPasses';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_M94U === '1';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }

(RUN ? it : it.skip)('m94 unit moss cluster rolls', () => {
  const st = new TileStore(40, 40);
  const gs = { worldSurface: 10, rockLevel: 20 } as GenState;
  __setGenStateForProbe(gs);
  // 苔藓地板：3×3 moss(179) at (18..20, 20)
  const moss = REV.get(179)!;
  for (let x = 18; x <= 20; x++) for (let y = 20; y <= 22; y++) st.setTileSilent(x, y, moss, 0, 0);
  let rolls = 0;
  const rng = new RNG(1);
  const rngW = new Proxy(rng, {
    get(t, p) {
      const v = Reflect.get(t, p, t);
      if (typeof v !== 'function') return v;
      return (...args: number[]) => { rolls++; return (v as (...a: number[]) => number).apply(t, args); };
    },
  }) as RNG;
  runLongMossPass(st, rngW, gs);
  console.log(`synthetic 3x3 moss cluster → rolls=${rolls}`);
  // 预期（vanilla 模型）：每次 PlaceTile(184)=gate 1 掷 + STF 九宫内 184 格各 1 掷
  let sprouts = 0;
  for (let i = 0; i < st.type.length; i++) if (st.flags[i] && SHEET[st.type[i]] === 184) sprouts++;
  console.log(`sprouts placed=${sprouts} → rolls/call=${(rolls / Math.max(1, sprouts)).toFixed(2)}`);
  __setGenStateForProbe(null);
}, 120_000);
