// ★一次性诊断 v3：slope 过渡逐帧状态机（V2 地形 = 悬空 ╲ 坡梯）
import { describe, it } from 'vitest';
import { moveAndCollide } from '../src/physics/TileCollision';
import { World } from '../src/world/World';
import { ENEMY_GRAVITY, MAX_FALL_SPEED, TILE } from '../src/core/constants';

const W = 60, H = 40, BASE = 22;
type BodyT = Parameters<typeof moveAndCollide>[0];

function build(w: World): void {
  const st = w.store;
  for (let x = 0; x < 10; x++) st.setTile(x, BASE - 2, 1);
  for (let c = 0; c < 16; c++) {
    const x = 10 + c;
    const ty = BASE - 2 + c;
    st.setTile(x, ty, 1);
    st.slope[st.idx(x, ty)] = 1;
  }
}

describe('诊断v3', () => {
  it('逐帧', () => {
    const w = new World(W, H, 7, 'stair-desc3');
    build(w);
    const b = {
      x: 8 * TILE, y: (BASE - 2) * TILE - 42,
      w: 20, h: 42,
      vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false,
      collideY: false, stepUp: true, stepUpHolds: true, stepUpNpc: true,
      liqFactor: 1,
    } as unknown as BodyT;
    b.vx = 1;
    const lines: string[] = [];
    for (let t = 0; t < 90; t++) {
      const st0 = w.store;
      // 手工复刻 slopeCollide 的支撑判定，打印「应抬量」
      const feet = b.y + b.h;
      let liftInfo = '';
      const x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 0.01) / TILE);
      const y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h - 0.01) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        for (let ty = y0; ty <= y1; ty++) {
          if (!st0.inBounds(tx, ty)) continue;
          const i = st0.idx(tx, ty);
          if (!st0.isSolid(tx, ty) || st0.slope[i] !== 1 || st0.half[i]) continue;
          const vx0 = tx * TILE, vy0 = ty * TILE;
          if (b.x + b.w <= vx0 || b.x >= vx0 + TILE) continue;
          const num4 = Math.max(0, Math.min(16, b.x - vx0));
          const surf = vy0 + num4;
          const num7 = surf - feet;             // <0 = 需上抬 |num7|
          liftInfo += `(${tx},${ty})num4=${num4.toFixed(0)}surf=${surf.toFixed(1)}d=${num7.toFixed(1)} `;
        }
      }
      const g0 = b.onGround ? 'G' : '.';
      lines.push(`t${String(t).padStart(2)} ${g0} x=${(b.x / TILE).toFixed(2)} feet=${(b.y + b.h).toFixed(1)} vy=${b.vy.toFixed(2)} ${liftInfo}`);
      b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b, w, b.vx, b.vy);
    }
    console.log(lines.join('\n'));
  });
});
