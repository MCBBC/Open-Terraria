// 矿车交叉格(背面轨 frameY)直行回归:交叉格 front=平/back=斜,直行应贯通
import { it, expect } from 'vitest';
import { World } from '../src/world/World';
import { placeTrack, frameTrackArea, trackCollision, TRACK_TILE, FLAG_ON_TRACK } from '../src/world/MinecartTrack';

it('平轨×斜轨交叉格:直行通过', () => {
  const w = new World(80, 60, 7, 'cross');
  const st = w.store;
  const R = 30;
  // 平轨 x20..40
  for (let i = 0; i < 21; i++) { placeTrack(st, 20 + i, R, 0); }
  for (let i = 0; i < 21; i++) frameTrackArea(st, 20 + i, R);
  // 斜轨从左上下来穿过 (30, R)格:对角 8(上→下)链
  for (let i = 0; i < 4; i++) placeTrack(st, 27 + i, R - 4 + i, 0);
  for (let i = 0; i < 4; i++) frameTrackArea(st, 27 + i, R - 4 + i);
  // 手工把交叉格做成 front=平(1) back=斜(9)
  const crossFrameFront = st.frameX[st.idx(30, R)];
  st.setTile(30, R, TRACK_TILE, crossFrameFront, 9);
  const r = { x: 20 * 16 - 2, y: R * 16 - 42, vx: 3, vy: 0, lastBoostX: 0, lastBoostY: 0 };
  let reached = false;
  for (let i = 0; i < 600; i++) {
    r.vy = Math.min(r.vy + 0.4, 10);
    const bits = trackCollision(st, r, 20, 42, false, false, 0, false, {});
    r.x += r.vx; r.y += r.vy;
    if (r.x >= 38 * 16) { reached = true; break; }
    void bits;
  }
  expect(reached, `交叉格直行卡死 endX=${r.x.toFixed(0)} endY=${r.y.toFixed(0)}`).toBe(true);
});
