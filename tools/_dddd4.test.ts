// DDDDDD 批·④：m 链 MicroBiomes 重放——JS 轨道巷杀账（__swLaneKill + __swKillCap）
// SW_D4=1 npx vitest run tools/_dddd4.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_D4 === '1';
const DIR = '/tmp/cccccc-m-base';
const W = 6400, H = 1800;
const SEED = 20260811;

(RUN ? it : it.skip)('dddd4 m lane-kill account', async () => {
  const { TILE_DEFS } = await import('../src/data/tiles');
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
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
  const lines: string[] = [];
  (globalThis as { __swLaneKill?: (x: number, y: number, s: number) => void }).__swLaneKill = (x, y, s) => lines.push(`KL ${x} ${y} t${s}`);
  (globalThis as { __swKillCap?: (x: number, y: number, sheet: number) => void }).__swKillCap = (x, y, s) => lines.push(`KL ${x} ${y} t${s}`);
  const rng = new RNG(SEED);
  try {
    runMicroBiomesPass(st, rng, gs, chests);
  } finally {
    delete (globalThis as { __swLaneKill?: (x: number, y: number, s: number) => void }).__swLaneKill;
    delete (globalThis as { __swKillCap?: (x: number, y: number, sheet: number) => void }).__swKillCap;
  }
  __setGenStateForProbe(null);
  writeFileSync('/tmp/dddd4-lane.txt', lines.join('\n') + '\n');
  console.log(`lane kills: ${lines.length}`);
}, 900_000);
