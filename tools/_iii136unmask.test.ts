// IIII108b2:去掩蔽九通道对拍 —— 逐格不计 active 屏蔽,每通道独立满格比较;
// 输出含 mask-differing 格上的 tile 对分布(揭示被 A 面遮住的 track/vine 差)。
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';

const BASE = process.env.SW_I135_BASE ?? '/tmp/iii133-out/js';
const G2 = process.env.SW_I135_G2 ?? `${process.env.HOME}/GoldenChains/golden-ftw-wir`;
const W = Number(process.env.SW_I135_W ?? 4200);
const H = Number(process.env.SW_I135_H ?? 1200);
const N = W * H;
const SEED = Number(process.env.SW_I135_SEED ?? '1671560105');
const BIASK = Number(process.env.SW_I136_MBLAVAS ?? '0');

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

it('III136 unmasked compare', () => {
  const hdr = JSON.parse(readFileSync(`${BASE}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType',
    'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const buf = readFileSync(`${BASE}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    const len = hdr[`${c}_len`] as number;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer.slice(buf.byteOffset, buf.byteOffset + len * bytesPer)));
  }
  try {
    restoreGenSolid(new Map(JSON.parse(readFileSync(`${BASE}/base_gensolid.json`, 'utf8')) as Array<[number, boolean]>));
  } catch { /* none */ }
  const gs = JSON.parse(readFileSync(`${BASE}/base_gs.json`, 'utf8')) as unknown as GenState;
  const chests = JSON.parse(readFileSync(`${BASE}/base_chests.json`, 'utf8'));
  const rng = new RNG(SEED);
  let trueRolls = 0;
  const g = globalThis as { __swOnRoll?: unknown; __swSeg?: (n: string, d?: unknown) => void };
  const oRoll = g.__swOnRoll;
  g.__swOnRoll = () => { trueRolls++; };
  if (BIASK > 0) {
    g.__swSeg = (name: string) => {
      if (name === 'mbLavaS') { for (let z = 0; z < BIASK; z++) rng.next(); }
    };
  }
  runMicroBiomesPass(st, rng, gs, chests as never);
  g.__swSeg = undefined;
  g.__swOnRoll = oRoll;

  const pre = `${G2}/097_Micro_Biomes`;
  const xt = new Uint16Array(readFileSync(`${pre}.typ`).buffer.slice(0, N * 2), 0, N);
  const xa = readFileSync(`${pre}.act`), xl = readFileSync(`${pre}.liq`);
  const xhf = readFileSync(`${pre}.half`), xsl = readFileSync(`${pre}.slope`);
  const xlt = readFileSync(`${pre}.lty`), xia = readFileSync(`${pre}.inact`);
  const xw = new Uint16Array(readFileSync(`${pre}.wal`).buffer.slice(0, N * 2), 0, N);
  const xwir = readFileSync(`${pre}.wir`);
  // 去掩蔽逐通道
  let A2 = 0, T2 = 0, W2 = 0, L2 = 0, Hf2 = 0, Sl2 = 0, Lt2 = 0, Ia2 = 0, Wi2 = 0;
  const ttCensus = new Map<string, number>();
  let firstD = -1;
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja && firstD < 0) firstD = i;
    if (va !== ja) {
      A2++;
      const vt = va ? xt[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (vt !== jt) {
        const key = `${vt}>${jt}`;
        ttCensus.set(key, (ttCensus.get(key) ?? 0) + 1);
        T2++;
      }
      continue;
    }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { T2++; }
    if (xw[i] !== st.wall[i]) W2++;
    if (xl[i] !== st.liquid[i]) L2++;
    if (xhf[i] !== st.half[i]) Hf2++;
    if (xsl[i] !== st.slope[i]) Sl2++;
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) Lt2++;
    if ((xia[i]! ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) Ia2++;
    if (((xwir[i] ?? 0) & ~32) !== ((st.wire[i] ?? 0) & ~32)) Wi2++;
  }
  console.log(`UNMASK bias=${BIASK} rolls=${trueRolls} A=${A2} T=${T2} W=${W2} L=${L2}`
    + ` Hf=${Hf2} Sl=${Sl2} Lt=${Lt2} Ia=${Ia2} Wir=${Wi2} TOTAL=${A2 + T2 + W2 + L2 + Hf2 + Sl2 + Lt2 + Ia2 + Wi2}`);
  const all = [...ttCensus.entries()].sort((p, q) => q[1] - p[1]);
  console.log(`mask-cell tile-pairs count=${all.length}`);
  console.log('FULL:', all.map(([k, v]) => `${k}×${v}`).join(' '));
}, 900_000);
