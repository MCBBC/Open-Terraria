// DDDDDD 批·①：12345 #105 残差逐格解剖（liquid 域假设验证）——重放 101→105 后
// 与金标 dump105 对拍，残差格打印双方 8 通道 + 3×3 邻域液体态。
// SW_D1=1 SW_D1_DIR=/tmp/aaaaaa-12345 npx vitest run tools/_dddd1.test.ts
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
import { TILE_DEFS } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_D1 === '1';
const DIR = process.env.SW_D1_DIR ?? '/tmp/aaaaaa-12345';
const G2 = process.env.SW_D1_G2 ?? '/tmp/sw-slp/g12345';
const DUMP = process.env.SW_D1_DUMP ?? '105_Final_Cleanup';
const W = Number(process.env.SW_D1_W ?? 4200), H = Number(process.env.SW_D1_H ?? 1200), N = W * H;
const SEED = Number(process.env.SW_D1_SEED ?? 12345);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }

(RUN ? it : it.skip)('dddd1 #105 residual anatomy', async () => {
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
  { const { finalGenMergeScan } = await import('../src/world/liquid/settle'); finalGenMergeScan(st, rng); }
  __setGenStateForProbe(null);
  const rd = (e: string) => new Uint8Array(readFileSync(`${G2}/${DUMP}.${e}`).buffer.slice(0));
  const rd16 = (e: string) => new Uint16Array(readFileSync(`${G2}/${DUMP}.${e}`).buffer.slice(0));
  const c = { t: rd16('typ'), a: rd('act'), w: rd16('wal'), l: rd('liq'), hf: rd('half'), sl: rd('slope'), lt: rd('lty') };
  const LT = ['water', 'lava', 'honey', 'shimmer'];
  const desc = (arr: Uint8Array | Uint16Array, i: number, act: number): string => {
    const t = act ? SHEET[arr[i]!] ?? -1 : 0;
    return `${t}`;
  };
  let n = 0;
  const cells: string[] = [];
  for (let i = 0; i < N && n < 400; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    const vt = va ? c.t[i]! : 0, jt = ja ? (SHEET[st.type[i]!] ?? 9999) : 0;
    const vl = c.l[i]!, jl = st.liquid[i]!;
    const vlt = vl > 0 ? c.lt[i]! + 1 : 0, jlt = jl > 0 ? st.liquidType[i]! : 0;
    const vsl = c.sl[i]!, jsl = st.slope[i]!;
    if (va !== ja || vt !== jt || vl !== jl || vlt !== jlt || vsl !== jsl || c.hf[i]! !== st.half[i]!) {
      n++;
      const x = i % W, y = Math.floor(i / W);
      let s = `(${x},${y}) vT${vt} jT${jt} vL${vl}/${vl ? LT[c.lt[i]!] : '-'} jL${jl}/${jl ? LT[jlt - 1] : '-'} vW${c.w[i]} jW${st.wall[i]} vSl${vsl}/jSl${jsl} vHf${c.hf[i]}/jHf${st.half[i]}`;
      // 邻域液体态（上下 1 格 + 本行左右）
      const nb = (dx: number, dy: number): string => {
        const k = (y + dy) * W + (x + dx);
        if (x + dx < 0 || x + dx >= W || y + dy < 0 || y + dy >= H) return 'oob';
        return `T${c.a[k] ? SHEET[c.t[k]] ?? -1 : 0}/L${c.l[k]}${c.l[k] ? LT[c.lt[k]] : ''}|jT${st.flags[k] ? SHEET[st.type[k]] ?? -1 : 0}/jL${st.liquid[k]}${st.liquid[k] ? LT[st.liquidType[k]! - 1] : ''}`;
      };
      s += ` up[${nb(0, -1)}] dn[${nb(0, 1)}] lf[${nb(-1, 0)}] rt[${nb(1, 0)}]`;
      cells.push(s);
    }
  }
  console.log(`residual cells: ${n}`);
  console.log(cells.slice(0, 60).join('\n'));
}, 900_000);
