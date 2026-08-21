// CCCCCC 批·③：重放 MicroBiomes 后与金标 dump101 八通道对拍（含首差坐标+邻域）
// SW_C3=1 SW_C3_DIR=/tmp/aaaaaa-22222 SW_C3_SEED=22222 SW_C3_G2=/tmp/sw-slp/g-s22222
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { TILE_DEFS } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_C3 === '1';
const DIR = process.env.SW_C3_DIR ?? '/tmp/aaaaaa-22222';
const G2 = process.env.SW_C3_G2 ?? '/tmp/sw-slp/g-s22222';
const DUMP = process.env.SW_C3_DUMP ?? '101_Micro_Biomes';
const W = Number(process.env.SW_C3_W ?? 4200), H = Number(process.env.SW_C3_H ?? 1200), N = W * H;
const SEED = Number(process.env.SW_C3_SEED ?? 22222);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }

(RUN ? it : it.skip)('cccc3 replay diff vs golden dump101', () => {
  const st = new TileStore(W, H);
  {
    const ld = (n: string) => new Uint8Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
    const ld16 = (n: string) => new Uint16Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
    st.type.set(ld16('type.bin')); st.flags.set(ld('flags.bin')); st.wall.set(ld16('wall.bin'));
    st.liquid.set(ld('liquid.bin')); st.liquidType.set(ld('liquidType.bin'));
    st.half.set(ld('half.bin')); st.slope.set(ld('slope.bin'));
    st.frameX.set(ld16('frameX.bin')); st.frameY.set(ld16('frameY.bin'));
    st.wire.set(ld('wire.bin')); st.paint.set(ld('paint.bin'));
  }
  const gs = JSON.parse(readFileSync(`${DIR}/gs.json`, 'utf8')) as GenState;
  restoreGenSolid(new Map(JSON.parse(readFileSync(`${DIR}/gensolid.json`, 'utf8')) as Array<[number, boolean]>));
  __setGenStateForProbe(gs);
  const chests = JSON.parse(readFileSync(`${DIR}/chests.json`, 'utf8'));
  const rng = new RNG(SEED);
  runMicroBiomesPass(st, rng, gs, chests);
  __setGenStateForProbe(null);
  const rd = (e: string) => new Uint8Array(readFileSync(`${G2}/${DUMP}.${e}`).buffer.slice(0));
  const rd16 = (e: string) => new Uint16Array(readFileSync(`${G2}/${DUMP}.${e}`).buffer.slice(0));
  const c = { t: rd16('typ'), a: rd('act'), w: rd16('wal'), l: rd('liq'), hf: rd('half'), sl: rd('slope'), lt: rd('lty'), ia: rd('inact') };
  const cells: string[] = [];
  let dA = 0, dT = 0, dL = 0, dLt = 0;
  const pair = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; if (cells.length < 60) cells.push(`A(${i % W},${Math.floor(i / W)}) v${va} j${ja}`); }
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (cells.length < 60) cells.push(`T(${i % W},${Math.floor(i / W)}) v${vt} j${jt}`); }
    if (c.l[i]! !== st.liquid[i]!) { dL++; if (cells.length < 60) cells.push(`L(${i % W},${Math.floor(i / W)}) v${c.l[i]} j${st.liquid[i]}`); }
    const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; if (cells.length < 60) cells.push(`Y(${i % W},${Math.floor(i / W)}) v${vl} j${jl}`); }
  }
  console.log(`[replay#101] A=${dA} T=${dT} L=${dL} Lt=${dLt}`);
  console.log(`pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  console.log(cells.join(' | '));
}, 600_000);
