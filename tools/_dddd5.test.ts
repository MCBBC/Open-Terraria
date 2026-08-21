// DDDDDD 批·⑤：m #105 残 6+1 格解剖——T0>245×6 + W=1 定位
// SW_D5=1 npx vitest run tools/_dddd5.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { runLilypadsPass } from '../src/world/gen/vanilla/SurfaceDecorPasses';
import { runGemTreesPass } from '../src/world/gen/vanilla/GemPasses';
import { runBrokenTrapCleanupPass } from '../src/world/gen/vanilla/BrokenTrapCleanupPass';
import { runFinalCleanupPass } from '../src/world/gen/vanilla/FinalCleanupPass';
import { finalGenMergeScan } from '../src/world/liquid/settle';
import { TILE_DEFS } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_D5 === '1';
const DIR = '/tmp/cccccc-m-base';
const G2 = '/tmp/sw-slp/g-m20260811';
const W = 6400, H = 1800, N = W * H;
const SEED = 20260811;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }

(RUN ? it : it.skip)('dddd5 m #105 residual anatomy', async () => {
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
  rng.reseed(SEED); runLilypadsPass(st, rng, gs);
  rng.reseed(SEED); runGemTreesPass(st, rng, gs);
  rng.reseed(SEED); runBrokenTrapCleanupPass(st, rng);
  rng.reseed(SEED); runFinalCleanupPass(st, gs, rng, { frameSparse: false });
  finalGenMergeScan(st, rng);
  __setGenStateForProbe(null);
  const rd = (e: string) => new Uint8Array(readFileSync(`${G2}/105_Final_Cleanup.${e}`).buffer.slice(0));
  const rd16 = (e: string) => new Uint16Array(readFileSync(`${G2}/105_Final_Cleanup.${e}`).buffer.slice(0));
  const c = { t: rd16('typ'), a: rd('act'), w: rd16('wal'), l: rd('liq') };
  const cells: string[] = [];
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    const vt = va ? c.t[i]! : 0, jt = ja ? (SHEET[st.type[i]!] ?? 9999) : 0;
    if (va !== ja || vt !== jt || c.w[i]! !== st.wall[i]!) {
      const x = i % W, y = Math.floor(i / W);
      const nb = (dx: number, dy: number): string => {
        const k = (y + dy) * W + (x + dx);
        return `v${c.a[k] ? c.t[k] : 0}/w${c.w[k]}|j${(st.flags[k] & 1) ? SHEET[st.type[k]] ?? -1 : 0}/jw${st.wall[k]}`;
      };
      cells.push(`(${x},${y}) vT${vt} jT${jt} vW${c.w[i]} jW${st.wall[i]} up[${nb(0, -1)}] dn[${nb(0, 1)}] lf[${nb(-1, 0)}] rt[${nb(1, 0)}]`);
    }
  }
  console.log(`residual: ${cells.length}`);
  console.log(cells.slice(0, 10).join('\n'));
}, 900_000);
