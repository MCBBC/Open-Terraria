// BBBBBB 批·③：mahogany 树前置门逐门定位(20000 全败根因)。
// SW_B3=1 SW_B3_DIR=... SW_B3_XY=3800,560 npx vitest run tools/_bbbb3.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { vanGenSolidType } from '../src/world/gen/vanilla/GenSolid';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_B3 === '1';
const DIR = process.env.SW_B3_DIR ?? '/tmp/aaaaaa-22222';
const W = Number(process.env.SW_B3_W ?? 4200), H = Number(process.env.SW_B3_H ?? 1200);
const [OX, OY] = (process.env.SW_B3_XY ?? '3800,560').split(',').map(Number);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const idOf = (van: number): number => { for (let i = 0; i < SHEET.length; i++) if (SHEET[i] === van) return i; return -1; };

(RUN ? it : it.skip)('bbbb3 mahogany gate recompute', () => {
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
  const condSolid = (x: number, y: number): boolean => {
    if (x < 10 || y < 10 || x >= W - 10 || y >= H - 10) return false;
    const i = y * W + x;
    return st.flags[i] !== 0 && vanGenSolidType(st.type[i]!);
  };
  // ① Down(200) AreaAnd(6,1)
  const px = OX - 3;
  let rx = -1, ry = -1, failWhy = '';
  for (let i = 0; i < 200 && OY + i < H; i++) {
    const y = OY + i;
    let allSolid = true;
    for (let k = px; k < px + 6; k++) if (!condSolid(k, y)) { allSolid = false; break; }
    if (allSolid) { rx = px; ry = y; break; }
  }
  if (rx < 0) { console.log(`① REJECT: no solid 6x1 row in 200 down from (px=${px},${OY})`); return; }
  console.log(`① PASS rx=${rx} ry=${ry}`);
  // ② Up(120) AreaOr(6,1) from (rx, ry-5)
  let r2y = -1;
  for (let i = 0; i < 120; i++) {
    const y = ry - 5 - i;
    if (y < 0) break;
    let anySolid = false;
    for (let k = rx; k < rx + 6; k++) if (condSolid(k, y)) { anySolid = true; break; }
    if (anySolid) { r2y = y; break; }
  }
  if (r2y < 0) { console.log('② REJECT: no solid row up 120'); return; }
  console.log(`② PASS r2y=${r2y} (ry-5-r2y=${ry - 5 - r2y} need<=60; ry-r2y=${ry - r2y} need>=30)`);
  if (ry - 5 - r2y > 60 || ry - r2y < 30) { console.log('②b REJECT: height gates'); return; }
  // ④ TileScanner 材质门(先跳过③——保护图)
  const DIRT_T = idOf(0), MUD_T = idOf(59), JG_T = idOf(60), SNOW_T = idOf(147);
  const STONE_T = idOf(1), EBON_T = idOf(25), PEARL_T = idOf(203), CRIM_T = idOf(117);
  const ICE_T = idOf(161), FROZEN_T = idOf(163), FLOWER_T = idOf(200), FLOWER2_T = idOf(164);
  const counts = new Map<number, number>();
  const countIds = new Set([DIRT_T, MUD_T, JG_T, SNOW_T, ICE_T, FROZEN_T, FLOWER_T, FLOWER2_T, STONE_T, EBON_T, PEARL_T, CRIM_T]);
  for (let dx = 0; dx < 50; dx++) for (let dy = 0; dy < 50; dy++) {
    const x = rx - 25 + dx, y = ry - 25 + dy;
    if (!st.inBounds(x, y)) continue;
    const i = st.idx(x, y);
    if (!st.flags[i] || !countIds.has(st.type[i]!)) continue;
    counts.set(st.type[i]!, (counts.get(st.type[i]!) ?? 0) + 1);
  }
  const c = (t: number): number => counts.get(t) ?? 0;
  const num = c(STONE_T) + c(EBON_T) + c(PEARL_T) + c(CRIM_T);
  const num2 = c(DIRT_T) + num;
  const num3 = c(MUD_T) + c(JG_T);
  const num4 = c(ICE_T) + c(FROZEN_T) + c(FLOWER_T) + c(FLOWER2_T);
  console.log(`④ counts: stone族=${num} dirt+stone=${num2} mud+jgrass=${num3} ice族=${num4} snow=${c(SNOW_T)}`);
  if (c(SNOW_T) + num4 > num3 || num2 > num3 || num3 < 50) { console.log('④ REJECT: material gate'); return; }
  console.log('④ PASS');
}, 300_000);
