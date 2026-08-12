// 原版 pass 27 "Webs"（cs:13659-13696）1:1：全局蛛网 runner。
// 数量 = 面积×0.0006；前 numMCaves 个锚在山洞口（mCaveX/mCaveY），其余随机列。
// 锚点须为空且（地表以下 或 有墙）→ 先向上爬到实心面再退一格，横向找壁面，
// 蛛网 51 runner（addTile、overRide=false、水平随机向 + vy=-1）。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';
import { tileRunner } from './TileRunner';

const WEBS = TILE_BY_KEY['v_51_webs']!;

export function runWebsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const count = Math.trunc(w * h * 0.0006);          // (int)((X*Y)*0.0006)
  for (let i = 0; i < count; i++) {
    let x = rng.int(20, w - 21);                     // Next(20, X-20)
    let y = rng.int(gs.worldSurfaceHigh, h - 21);     // Next(wsHigh, Y-20)
    if (i < gs.numMCaves) { x = gs.mCaveX[i]!; y = gs.mCaveY[i]!; }
    const ti0 = st.idx(x, y);
    if (!st.flags[ti0] && (y > gs.worldSurface || st.wall[ti0] > 0)) {
      while (!st.flags[st.idx(x, y)] && y > gs.worldSurfaceLow) y--;   // 爬到实心面
      y++;
      const dir = rng.int(0, 1) === 0 ? -1 : 1;       // Next(2)==0 → -1
      for (; !st.flags[st.idx(x, y)] && x > 10 && x < w - 10; x += dir) { /* 横向找壁 */ }
      x -= dir;
      if (y > gs.worldSurface || st.wall[st.idx(x, y)] > 0) {
        tileRunner(st, rng, gs, x, y, {
          strength: rng.int(4, 10), steps: rng.int(2, 3),             // Next(4,11)/Next(2,4)
          type: WEBS, addTile: true, speedX: dir, speedY: -1,
          overRide: false,                                          // ★原版显式 overRide:false（cs:13691）
        });
      }
    }
  }
}
