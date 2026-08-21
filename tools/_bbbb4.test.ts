// BBBBBB 批·④：DeadMansChest 候选逐门拒绝统计(12345 van 41 组 vs js 32 组差)。
// SW_B4=1 SW_B4_DIR=/tmp/aaaaaa-12345 npx vitest run tools/_bbbb4.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { DeadMansChestBiome } from '../src/world/gen/vanilla/MicroBiomesPass';
import { TILE_DEFS } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_B4 === '1';
const DIR = process.env.SW_B4_DIR ?? '/tmp/aaaaaa-12345';
const W = Number(process.env.SW_B4_W ?? 4200), H = Number(process.env.SW_B4_H ?? 1200);
const SEED = Number(process.env.SW_B4_SEED ?? 12345);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const CHEST = SHEET.indexOf(21);
const NOT_CLEARABLE = new Set<number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const k = TILE_DEFS[i]?.key ?? '';
  if (k === 'v_231_larva' || k.includes('dungeon_') || k.includes('_brick') && k.includes('lihzahrd')) NOT_CLEARABLE.add(i);
}

const countWiresLocal = (st: TileStore, x: number, y: number, size: number): number => {
  let n = 0;
  for (let i = x - size; i <= x + size; i++) {
    for (let j = y - size; j <= y + size; j++) {
      if (!st.inBounds(i, j)) continue;
      const b = st.wire[st.idx(i, j)] & 15;
      n += (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1) + ((b >> 3) & 1);
    }
  }
  return n;
};

(RUN ? it : it.skip)('bbbb4 deadman candidate gates', () => {
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
  const chests = JSON.parse(readFileSync(`${DIR}/chests.json`, 'utf8')) as Array<{ x: number; y: number }>;
  const oceanLevel = (gs.worldSurface + gs.rockLevel) / 2 + 40;
  let pass = 0;
  const rej = new Map<string, number>();
  const rejList: Array<[string, number, number]> = [];
  for (const ch of chests) {
    const { x, y } = ch;
    let why = '';
    if (!(x >= 50 && y >= 50 && x < W - 50 && y < H - 50)) why = 'inworld';
    else if (y <= oceanLevel && (x < gs.beachDistance || x > W - gs.beachDistance)) why = 'ocean';
    else {
      const idx = st.idx(x, y);
      if (st.type[idx] !== CHEST) why = 'type!=21';
      else if (Math.trunc(st.frameX[idx]! / 36) !== 1) why = 'frameX/36!=1';
      else if (NOT_CLEARABLE.has(st.type[st.idx(x, y + 2)]!)) why = 'below-notclearable';
      else if (countWiresLocal(st, x, y, 20) > 0) why = 'wires';
      else why = 'tiles-gate-skipped';
    }
    if (why) { rej.set(why, (rej.get(why) ?? 0) + 1); if (rejList.length < 30) rejList.push([why, x, y]); }
    else pass++;
  }
  console.log(`chests=${chests.length} isAGoodSpot-PASS=${pass}`);
  console.log(`rejects: ${[...rej.entries()].map(([k, n]) => `${k}×${n}`).join(' ')}`);
  console.log(`sample rejects: ${rejList.slice(0, 12).map(([w, x, y]) => `${w}@(${x},${y})`).join(' ')}`);
  // 真实候选(全链)
  const rng = new RNG(SEED);
  const dm = new DeadMansChestBiome(st, rng, gs, chests);
  const possible = dm.getPossibleChests();
  console.log(`getPossibleChests candidates=${possible.length}`);
  __setGenStateForProbe(null);
}, 300_000);
