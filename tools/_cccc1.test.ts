// CCCCCC 批·①：DeadMans 候选 41(van) vs 32(js) 逐门复算——金标注册表 174 条在
// JS 基座状态(已证 8 通道+wire+frame 与金标全同)上按原版 IsAGoodSpot 逐门判。
// SW_C1=1 SW_C1_DIR=/tmp/aaaaaa-12345 SW_C1_GC=/tmp/aaaaaa-fr-12345/101_Micro_Biomes.chest.tsv
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_C1 === '1';
const DIR = process.env.SW_C1_DIR ?? '/tmp/aaaaaa-12345';
const GOLD_CHEST = process.env.SW_C1_GC ?? '/tmp/aaaaaa-fr-12345/101_Micro_Biomes.chest.tsv';
const W = Number(process.env.SW_C1_W ?? 4200), H = Number(process.env.SW_C1_H ?? 1200);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const SHEET2JS = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !SHEET2JS.has(s)) SHEET2JS.set(s, i); }
const CHEST = SHEET2JS.get(21)!;
const NOT_CLEARABLE = new Set<number>([396, 400, 401, 397, 398, 399, 404, 368, 367, 41, 43, 44, 481, 482, 483, 226, 237]);

// 生成期 tileSolid 表（vanGenSolidType 同款——TILE_DEFS.vanilla.solid）
const GENSOLID = new Uint8Array(TILE_DEFS.length);
for (let i = 0; i < TILE_DEFS.length; i++) GENSOLID[i] = TILE_DEFS[i]?.vanilla?.solid ? 1 : 0;
const SOLIDTOP = new Uint8Array(TILE_DEFS.length);
for (let i = 0; i < TILE_DEFS.length; i++) SOLIDTOP[i] = TILE_DEFS[i]?.vanilla?.solidTop ? 1 : 0;

const solidTileStrict = (st: TileStore, x: number, y: number): boolean => {
  const i = st.idx(x, y);
  const t = st.type[i]!;
  return st.flags[i] !== 0 && GENSOLID[t] !== 0 && SOLIDTOP[t] === 0 && st.half[i] === 0 && st.slope[i] === 0;
};

function countTiles(st: TileStore, x0: number, y0: number): number {
  let count = 0;
  const seen = new Set<number>();
  const stack: Array<[number, number]> = [[x0, y0]];
  while (stack.length > 0) {
    if (count >= 3500) return count;
    const [x, y] = stack.pop()!;
    if (x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1) return 3500;
    const k = y * st.w + x;
    if (seen.has(k)) continue;
    seen.add(k);
    const i = st.idx(x, y);
    if (st.wall[i] === 244) return 3500;
    if (st.liquid[i] > 0 && st.liquidType[i] === 4) return 3500;   // shimmer（JS +1 编码）
    if (st.wall[i] !== 0) return 3500;
    if (!solidTileStrict(st, x, y)) {
      count++;
      stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
  }
  return count;
}

const countWires = (st: TileStore, x: number, y: number, size: number): number => {
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

(RUN ? it : it.skip)('cccc1 deadman gates on golden registry', () => {
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
  const goldChests: Array<{ idx: number; x: number; y: number }> = [];
  for (const ln of readFileSync(GOLD_CHEST, 'utf8').trim().split('\n')) {
    const f = ln.split('\t');
    goldChests.push({ idx: Number(f[0]), x: Number(f[1]), y: Number(f[2]) });
  }
  const oceanLevel = (gs.worldSurface + gs.rockLevel) / 2 + 40;
  console.log(`gs: worldSurface=${gs.worldSurface} rockLevel=${gs.rockLevel} beachDistance=${gs.beachDistance} oceanLevel=${oceanLevel}`);
  let pass = 0;
  const rej = new Map<string, number>();
  const rejList: Array<[string, number, number]> = [];
  const passList: Array<[number, number]> = [];
  const styleDetail: Array<[number, number, string, number]> = [];
  for (const ch of goldChests) {
    const { x, y } = ch;
    let why = '';
    let style = false;
    if (!(x >= 50 && y >= 50 && x < W - 50 && y < H - 50)) why = 'inworld';
    else if (y <= oceanLevel && (x < gs.beachDistance || x > W - gs.beachDistance)) why = 'ocean';
    else {
      const i = st.idx(x, y);
      if (st.type[i] !== CHEST) why = 'type!=21';
      else if (Math.trunc(st.frameX[i]! / 36) !== 1) why = 'frameX/36!=1';
      else {
        style = true;
        if (NOT_CLEARABLE.has(SHEET[st.type[st.idx(x, y + 2)]!] ?? -1)) why = 'below-notclearable';
        else if (countWires(st, x, y, 20) > 0) why = `wires=${countWires(st, x, y, 20)}`;
        else if (countTiles(st, x, y) < 40) why = `countTiles=${countTiles(st, x, y)}`;
      }
    }
    if (why) { rej.set(why, (rej.get(why) ?? 0) + 1); if (style) rejList.push([why, x, y]); }
    else { pass++; passList.push([x, y]); }
    if (style || why === 'inworld' || why === 'ocean') styleDetail.push([x, y, why || 'PASS', 0]);
  }
  console.log(`golden registry=${goldChests.length} IsAGoodSpot PASS=${pass}`);
  console.log(`rejects: ${[...rej.entries()].map(([k, n]) => `${k}×${n}`).join(' ')}`);
  console.log(`style-gate detail (incl inworld/ocean rejects):`);
  for (const [x, y, w] of styleDetail) console.log(`  (${x},${y}) ${w}`);
  console.log(`passList: ${passList.map(([x, y]) => `(${x},${y})`).join(' ')}`);
}, 300_000);
