// 单 tick 深度取证:复刻到漏帧前一刻,暂停在跨界帧打印每格判定
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { moveAndCollide } from '../src/physics/TileCollision';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../src/core/constants';

const LOG = '/Users/vinlic/Downloads/behavior-log-Starter_World-2026-09-01T09-22-21-139Z.json';
function buildWorld() {
  const j = JSON.parse(readFileSync(LOG, 'utf8'));
  const st = new TileStore(4000, 1200);
  for (const [k, v] of Object.entries(j.meta.terrain.cells)) {
    const [x, y] = k.split(',').map(Number);
    const i = st.idx(x, y);
    st.type[i] = v[0]; st.slope[i] = v[1]; st.half[i] = v[2]; st.flags[i] = 1;
    if (v[3]) st.flags[i] |= 64;
  }
  return { store: st } as never;
}
describe('plat56', () => {
  it('跨界帧逐格判定', () => {
    const world = buildWorld();
    const b = {
      x: 3162 * TILE, y: 275 * TILE - 42, w: 20, h: 42,
      vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
      collideY: false, stepUp: true, stepUpHolds: false, stepUpNpc: true,
      liqFactor: 1,
    } as unknown as Parameters<typeof moveAndCollide>[0];
    // 跑到恰好在漏帧序列首tick(t63)
    for (let t = 0; t < 200; t++) {
      const preVx = b.vx, preVy = b.vy, preX = b.x, preY = b.y, preFeet = b.y + b.h;
      b.vx = 3.0;
      b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b, world, b.vx, b.vy);
      const gNow = b.onGround;
      if (!gNow || (t >= 58 && t <= 70)) {
        console.log(`--- t${t} ENTER ${gNow ? '' : '[AIR!]'} x${(preX / TILE).toFixed(2)}(l)→${(b.x / TILE).toFixed(2)} feetIn${(preFeet).toFixed(1)}→${(b.y + b.h).toFixed(1)} vy${preVy.toFixed(1)}→${b.vy.toFixed(1)}`);
        if (!gNow && t >= 63) break;
      }
    }
  });
});
