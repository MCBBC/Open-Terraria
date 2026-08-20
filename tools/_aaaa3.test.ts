// AAAAAA：#103 Stalac 首分歧定位——JS 103 重放的 165 增量集 vs 金标增量集。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runGemTreesPass } from '../src/world/gen/vanilla/GemPasses';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { runLilypadsPass } from '../src/world/gen/vanilla/SurfaceDecorPasses';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_A3 === '1';
const DIR = process.env.SW_A3_DIR ?? '/tmp/aaaaaa-929';
const G2 = '/tmp/sw-slp/g';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }

(RUN ? it : it.skip)('aaaa3 stalac first divergence', async () => {
  const cellSet = (dump: string): Set<number> => {
    const t = new Uint16Array(readFileSync(`${G2}/${dump}.typ`).buffer.slice(0));
    const a = new Uint8Array(readFileSync(`${G2}/${dump}.act`).buffer.slice(0));
    const s = new Set<number>();
    for (let i = 0; i < N; i++) if (a[i] && t[i] === 165) s.add(i);
    return s;
  };
  const g102 = cellSet('102_Water_Plants'), g103 = cellSet('103_Stalac');
  const goldenPlaced: number[] = [], goldenKilled: number[] = [];
  for (const i of g103) if (!g102.has(i)) goldenPlaced.push(i);
  for (const i of g102) if (!g103.has(i)) goldenKilled.push(i);
  console.log(`golden: placed165=${goldenPlaced.length} killed165=${goldenKilled.length}`);

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
  {
    const rng0 = new RNG(SEED);
    runMicroBiomesPass(st, rng0, gs, chests);
    rng0.reseed(SEED);
    runLilypadsPass(st, rng0, gs);
  }
  const pre = new Set<number>();
  for (let i = 0; i < N; i++) if (st.flags[i] && SHEET[st.type[i]] === 165) pre.add(i);
  let roll = 0;
  const spanOut = process.env.SW_A3_SPAN;
  const spanLines: string[] = [];
  const rng = new RNG(SEED);
  let curX = -1, curY = -1;
  const g1 = globalThis as { __swScanCap?: (x: number, y: number, phase: number) => void };
  g1.__swScanCap = (x, y) => { curX = x; curY = y; };
  const watchLo = Number(process.env.SW_A3_ROLL_FROM ?? -1), watchHi = Number(process.env.SW_A3_ROLL_TO ?? -1);
  const watchCtx: string[] = [];
  const rngW = new Proxy(rng, {
    get(t, p) {
      const v = Reflect.get(t, p, t);
      if (typeof v !== 'function') return v;
      return (...args: number[]) => {
        roll++;
        const r = (v as (...a: number[]) => number).apply(t, args);
        const f = String(p);
        if (watchLo >= 0 && roll >= watchLo && roll <= watchHi) {
          const stk = process.env.SW_A3_STACK ? (new Error().stack ?? '').split('\n').slice(2, 5).map(s => s.trim().replace(/^at /, '')).join(' <- ') : '';
          watchCtx.push(`#${roll} (${curX},${curY}) ${f}(${args.join(',')})=${r}${stk ? ' @' + stk : ''}`);
        }
        if (spanOut) {
          if (f === 'nextInt') spanLines.push(`a ${args[0]}=${r}`);
          else if (f === 'int') spanLines.push(`b ${args[0]} ${args[1]! + 1}=${r}`);
          else if (f === 'next' || f === 'chance' || f === 'range') spanLines.push('d');
        }
        return r;
      };
    },
  }) as RNG;
  runGemTreesPass(st, rngW, gs);
  g1.__swScanCap = undefined;
  if (watchCtx.length) console.log(watchCtx.join('\n'));
  if (spanOut) { writeFileSync(spanOut, spanLines.join('\n') + '\n'); console.log(`[span] ${spanLines.length} lines → ${spanOut}`); }
  __setGenStateForProbe(null);
  const post = new Set<number>();
  for (let i = 0; i < N; i++) if (st.flags[i] && SHEET[st.type[i]] === 165) post.add(i);
  const jsPlaced: number[] = [], jsKilled: number[] = [];
  for (const i of post) if (!pre.has(i)) jsPlaced.push(i);
  for (const i of pre) if (!post.has(i)) jsKilled.push(i);
  console.log(`js: placed165=${jsPlaced.length} killed165=${jsKilled.length} rolls=${roll}`);
  const key = (i: number) => `${i % W},${Math.floor(i / W)}`;
  const gset = new Set(goldenPlaced.map(key));
  const jset = new Set(jsPlaced.map(key));
  const shared = jsPlaced.filter(i => gset.has(key(i)));
  const jsOnly = jsPlaced.filter(i => !gset.has(key(i)));
  const gOnly = goldenPlaced.filter(i => !jset.has(key(i)));
  console.log(`shared=${shared.length} jsOnly=${jsOnly.length} gOnly=${gOnly.length}`);
  const sortByXY = (arr: number[]) => [...arr].sort((a, b) => (a % W) - (b % W) || Math.floor(a / W) - Math.floor(b / W));
  console.log(`first shared (x-order): ${sortByXY(shared).slice(0, 3).map(key).join(' ')}`);
  console.log(`first jsOnly (x-order): ${sortByXY(jsOnly).slice(0, 5).map(key).join(' ')}`);
  console.log(`first gOnly (x-order): ${sortByXY(gOnly).slice(0, 5).map(key).join(' ')}`);
  console.log(`js-killed first: ${sortByXY(jsKilled).slice(0, 5).map(key).join(' ')}`);
  console.log(`g-killed first: ${sortByXY(goldenKilled).slice(0, 5).map(key).join(' ')}`);
}, 600_000);
