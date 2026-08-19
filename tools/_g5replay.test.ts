// 一次性诊断（GGGGG）：管道态 30×30 拷贝重放 check3x2(237) 判定 + 逐输入二分
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { genSquareTileFrame } from '../src/world/gen/vanilla/FinalCleanupPass';
import { genSolidType } from '../src/world/gen/vanilla/GenSolid';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const sv = TILE_DEFS[i]?.vanilla?.sheet; if (typeof sv === 'number') SHEET[i] = sv; }

interface Ch { type: Uint16Array; flags: Uint8Array; frameX: Uint16Array; frameY: Uint16Array; slope: Uint8Array; half: Uint8Array; wall: Uint16Array; wire: Uint8Array; liquid: Uint8Array; liquidType: Uint8Array; paint: Uint8Array }

it('replay kill-time state in isolation', async () => {
  let region: { ox: number; oy: number; ch: Ch } | null = null;
  let st0: TileStore | null = null;
  const g = globalThis as unknown as { __swKillCap?: (x: number, y: number, sheet: number) => void };
  g.__swKillCap = (x, y, sheet) => {
    if (region || !(globalThis as Record<string, unknown>).__g5InStatues || sheet !== 237) return;
    const st = (globalThis as unknown as { __g5St: TileStore }).__g5St;
    const R = 15;
    const ox = x - R, oy = y - R;
    const ch: Ch = {
      type: st.type.slice(0), flags: st.flags.slice(0), frameX: st.frameX.slice(0), frameY: st.frameY.slice(0),
      slope: st.slope.slice(0), half: st.half.slice(0), wall: st.wall.slice(0), wire: st.wire.slice(0),
      liquid: st.liquid.slice(0), liquidType: st.liquidType.slice(0), paint: st.paint.slice(0),
    };
    region = { ox, oy, ch };
    // 管线现场判据输入直查
    const gid = st.type[(y + 2) * 4200 + x];
    const gid2 = st.type[(y + 2) * 4200 + (x + 1)];
    const gid3 = st.type[(y + 2) * 4200 + (x + 2)];
    console.log(`VERDICT-INPUTS base types js=${gid},${gid2},${gid3} sheets=${SHEET[gid]},${SHEET[gid2]},${SHEET[gid3]} genSolid=${genSolidType(gid)},${genSolidType(gid2)},${genSolidType(gid3)} defs.solid=${TILE_DEFS[gid]?.solid} slope=${st.slope[(y+2)*4200+x]},${st.slope[(y+2)*4200+x+1]},${st.slope[(y+2)*4200+x+2]} half=${st.half[(y+2)*4200+x]},${st.half[(y+2)*4200+x+1]},${st.half[(y+2)*4200+x+2]} wire5=${((st.wire[(y+2)*4200+x]>>>5)&1)},${((st.wire[(y+2)*4200+x+1]>>>5)&1)},${((st.wire[(y+2)*4200+x+2]>>>5)&1)}`);
    void st0;
  };
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: 'spawn-tree-regression', name: 't' } as never);
  } finally { delete g.__swKillCap; }
  if (!region) { console.log('no 237 kill captured'); return; }
  const { ox, oy, ch } = region;
  // 重建 30×30 子世界并整体平移拷入
  const W = 40, H = 40;
  const sub = new TileStore(W, H);
  for (let dy = 0; dy < 30; dy++) {
    for (let dx = 0; dx < 30; dx++) {
      const sj = (oy + dy) * 4200 + (ox + dx);
      const dj = dy * W + dx;
      sub.type[dj] = ch.type[sj]!; sub.flags[dj] = ch.flags[sj]!;
      sub.frameX[dj] = ch.frameX[sj]!; sub.frameY[dj] = ch.frameY[sj]!;
      sub.slope[dj] = ch.slope[sj]!; sub.half[dj] = ch.half[sj]!;
      sub.wall[dj] = ch.wall[sj]!; sub.wire[dj] = ch.wire[sj]!;
      sub.liquid[dj] = ch.liquid[sj]!; sub.liquidType[dj] = ch.liquidType[sj]!; sub.paint[dj] = ch.paint[sj]!;
    }
  }
  // 祭坛组在新世界的位置 = 原坐标 - (ox,oy)
  const AX = 3296 - ox, AY = 681 - oy;
  const sweepAt = (sx: number, sy: number): number => {
    // 重新拷贝（杀过的状态需重置）
    for (let dy = 0; dy < 30; dy++) for (let dx = 0; dx < 30; dx++) {
      const sj = (oy + dy) * 4200 + (ox + dx);
      const dj = dy * W + dx;
      sub.type[dj] = ch.type[sj]!; sub.flags[dj] = ch.flags[sj]!;
      sub.frameX[dj] = ch.frameX[sj]!; sub.frameY[dj] = ch.frameY[sj]!;
      sub.slope[dj] = ch.slope[sj]!; sub.half[dj] = ch.half[sj]!;
      sub.wall[dj] = ch.wall[sj]!; sub.wire[dj] = ch.wire[sj]!;
    }
    genSquareTileFrame(sub, new RNG(1), sx, sy);
    let alive = 0;
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
      if (sub.flags[(AY + dy) * W + (AX + dx)]) alive++;
    }
    return alive;
  };
  console.log(`replay sweep@(anchor) alive=${sweepAt(AX, AY - 1)}/6  sweep@(top-left) alive=${sweepAt(AX, AY)}/6`);
  // 打印祭坛与其下 2 行的全部输入通道
  for (let dy = -1; dy <= 3; dy++) {
    let row = `  y${681 + dy}: `;
    for (let dx = -1; dx <= 3; dx++) {
      const j = (AY + dy) * W + (AX + dx);
      const a = sub.flags[j], t = a ? SHEET[sub.type[j]] : -1;
      row += (a ? `${t}/f${sub.frameX[j]},${sub.frameY[j]}s${sub.slope[j]}h${sub.half[j]}w${sub.wire[j]}p${sub.paint[j]}` : '·').padStart(24);
    }
    console.log(row);
  }
}, 600_000);
