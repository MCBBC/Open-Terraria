// DDDDDD 批·⑥：画作墙检误杀解剖（s22222 #101 重放）
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { TILE_DEFS } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_D6 === '1';
const DIR = '/tmp/aaaaaa-22222';
const G2 = '/tmp/sw-slp/g-s22222';
const W = 4200, H = 1200;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }

(RUN ? it : it.skip)('dddd6 wall-art kill anatomy', async () => {
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
  const log: string[] = [];
  (globalThis as { __swWallArt?: (s: string) => void }).__swWallArt = (s: string) => log.push(s);
  const rng = new RNG(22222);
  try {
    runMicroBiomesPass(st, rng, gs, chests);
  } finally {
    delete (globalThis as { __swWallArt?: (s: string) => void }).__swWallArt;
  }
  __setGenStateForProbe(null);
  writeFileSync('/tmp/dddd6-wallart.txt', log.join('\n') + '\n');
  // 金标侧同格状态
  const rd16 = (e: string) => new Uint16Array(readFileSync(`${G2}/101_Micro_Biomes.${e}`).buffer.slice(0));
  const rd = (e: string) => new Uint8Array(readFileSync(`${G2}/101_Micro_Biomes.${e}`).buffer.slice(0));
  const vt = rd16('typ'), va = rd('act'), vw = rd16('wal');
  const out: string[] = [];
  for (const ln of log.slice(0, 8)) {
    const m = /grp\((\d+),(\d+)\)/.exec(ln)!;
    const x0 = +m[1], y0 = +m[2];
    const cells: string[] = [];
    for (let k = x0; k < x0 + 3; k++) for (let l = y0; l < y0 + 3; l++) {
      const i = l * W + k;
      cells.push(`(${k},${l}) v${va[i] ? vt[i] : 0}/w${vw[i]}`);
    }
    out.push(ln + '\n   ' + cells.join(' '));
  }
  console.log(`wall-art kills: ${log.length}`);
  console.log(out.join('\n'));
}, 900_000);
