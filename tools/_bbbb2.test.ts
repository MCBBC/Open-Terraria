// BBBBBB 批·②：剑冢前置四门中间值重算(定位 JS/vanilla 判定差)。
// SW_B2=1 SW_B2_DIR=... SW_B2_XY=571,399 npx vitest run tools/_bbbb2.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { vanGenSolidType } from '../src/world/gen/vanilla/GenSolid';
import { TILE_DEFS } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_B2 === '1';
const DIR = process.env.SW_B2_DIR ?? '/tmp/aaaaaa-22222';
const W = Number(process.env.SW_B2_W ?? 4200), H = Number(process.env.SW_B2_H ?? 1200);
const [OX, OY] = (process.env.SW_B2_XY ?? '571,399').split(',').map(Number);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const DIRT = SHEET.indexOf(0), STONE = SHEET.indexOf(1), SAND = SHEET.indexOf(53);
const vanIsSolid = (st: TileStore, x: number, y: number): boolean => {
  if (x < 10 || y < 10 || x >= st.w - 10 || y >= st.h - 10) return false;
  const i = st.idx(x, y);
  return st.flags[i] !== 0 && vanGenSolidType(st.type[i]!);
};

(RUN ? it : it.skip)('bbbb2 shrine gate recompute', () => {
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
  if (!process.env.SW_B2_NOOV) restoreGenSolid(new Map(JSON.parse(readFileSync(`${DIR}/gensolid.json`, 'utf8')) as Array<[number, boolean]>));
  __setGenStateForProbe(gs);
  // ① dirt/stone 计数
  let dirtStone = 0;
  for (let dx = 0; dx < 50; dx++) for (let dy = 0; dy < 50; dy++) {
    const x = OX - 25 + dx, y = OY - 25 + dy;
    if (!st.inBounds(x, y)) continue;
    const i = st.idx(x, y);
    if (!st.flags[i]) continue;
    if (st.type[i] === DIRT || st.type[i] === STONE) dirtStone++;
  }
  console.log(`① dirtStone=${dirtStone} (need>=1250) → ${dirtStone >= 1250 ? 'PASS' : 'REJECT'}`);
  console.log(`② oy=${OY} (need>55) → ${OY > 55 ? 'PASS' : 'REJECT'}`);
  // ③ Up 搜索
  const num3 = OY - 55;
  const num4 = Math.min(50, num3);
  let resultY = -1;
  for (let i = 0; i < num3; i++) {
    let solid = false;
    for (let j = 0; j < num4; j++) if (vanIsSolid(st, OX, OY - i + j)) { solid = true; break; }
    if (!solid) { resultY = OY - i; break; }
  }
  console.log(`③ num3=${num3} num4=${num4} resultY=${resultY} → ${resultY >= 0 && resultY > 55 ? 'PASS' : 'REJECT'}`);
  // ④ 沙列
  let sandAt = -1;
  if (resultY >= 0) for (let i = 0; i < OY - resultY; i++) {
    const y = OY - i;
    if (!st.inBounds(OX, y)) continue;
    const ii = st.idx(OX, y);
    if (st.flags[ii] && st.type[ii] === SAND) { sandAt = y; break; }
  }
  console.log(`④ sandAt=${sandAt} → ${sandAt < 0 ? 'PASS' : 'REJECT'}`);
  __setGenStateForProbe(null);
}, 300_000);
