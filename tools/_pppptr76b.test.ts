// PPPP 探针：定位 #76 JS 侧 (3952,861) slope 0→2 的写入者
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runTrapsPass, placeTrap, placeSandTrap } from '../src/world/gen/vanilla/TrapsPass';

const RUN = process.env.SW_PPPP76B === '1';
const W = 4200, H = 1200, N = W * H, SEED = 9293480;
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }

(RUN ? it : it.skip)('find slope writer', async () => {
  const BDIR = '/tmp/www-b/s30', G2 = '/tmp/sw-slp/g', NM = 'Place_Fallen_Log';
  const rd = (e: string) => e === 'typ' || e === 'wal' ? new Uint16Array(readFileSync(`${G2}/075_${NM}.${e}`).buffer.slice(0)) : readFileSync(`${G2}/075_${NM}.${e}`);
  const gs = JSON.parse(readFileSync(`${BDIR}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const st = new TileStore(W, H);
  const t = rd('typ'), a = rd('act'), wl = rd('wal'), lq = rd('liq'), lt = rd('lty'), hf = rd('half'), sl = rd('slope'), ia = rd('inact');
  for (let i = 0; i < N; i++) {
    st.flags[i] = a[i];
    st.type[i] = (a[i] || t[i]) ? (REV.get(t[i]) ?? 0) : 0;
    st.wall[i] = wl[i]; st.liquid[i] = lq[i]; st.liquidType[i] = lq[i] ? lt[i] + 1 : 0;
    st.half[i] = hf[i]; st.slope[i] = sl[i]; st.wire[i] = ia[i] ? 0x20 : 0;
  }
  const fw = new Uint32Array(readFileSync(`${BDIR}/frames.bin`).buffer.slice(0));
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; st.frameX[i] = fw[q + 1]!; st.frameY[i] = fw[q + 2]!; st.wire[i] |= fw[q + 3]! & 0x1f; }
  restoreGenSolid(gensolid);
  __setGenStateForProbe(structuredClone(gs));
  const CELL = st.idx(3952, 861);
  console.log(`input slope at (3952,861) = ${st.slope[CELL]}`);
  let prevSlope = st.slope[CELL]!;
  const chk = (tag: string) => { const s = st.slope[CELL]!; if (s !== prevSlope) { console.log(`SLOPE CHANGE ${prevSlope}→${s} after ${tag}`); prevSlope = s; } };
  const oPT = placeTrap, oST = placeSandTrap;
  (globalThis as Record<string, unknown>).__swPTHook = { placeTrap: oPT, placeSandTrap: oST, st, chk };
  // 换桩：包装导出不可行（ESM 绑定），改在 runTrapsPass 外层逐 pass 段检查 + 关键函数后检查
  const TrapMod = await import('../src/world/gen/vanilla/TrapsPass');
  const origPT = TrapMod.placeTrap, origST = TrapMod.placeSandTrap;
  // @ts-expect-error runtime patch for probe
  TrapMod.placeTrap = (st2: TileStore, rng2: RNG, gs2: GenState, x2: number, y2: number, ty?: number) => {
    const r = origPT(st2, rng2, gs2, x2, y2, ty);
    if (x2 >= 3935 && x2 <= 3970) { const i2 = st2.idx(3952, 861); console.log(`placeTrap(${x2},${y2},t${ty})→${r} slope=${st2.slope[i2]} half=${st2.half[i2]} type=${st2.flags[i2] ? st2.type[i2] : '·'}`); }
    chk(`placeTrap(${x2},${y2})`);
    return r;
  };
  // @ts-expect-error runtime patch for probe
  TrapMod.placeSandTrap = (st2: TileStore, rng2: RNG, i: number, j: number) => {
    const r = origST(st2, rng2, i, j);
    if (i >= 3935 && i <= 3970) console.log(`placeSandTrap(${i},${j})→${r}`);
    chk(`placeSandTrap(${i},${j})`);
    return r;
  };
  await runTrapsPass(st, new RNG(SEED), structuredClone(gs) as GenState);
  console.log(`final slope = ${st.slope[CELL]}`);
  __setGenStateForProbe(null);
}, 560_000);
