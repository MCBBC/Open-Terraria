// 精确复现用户标记段:平轨(行1000) → frame7@(2603,1000) → frame5@(2602,999) → 平轨(行999)
// 用户报:向左正常速度上不去,极高冲劲才行,下坡顺畅(疑似上坡阻力移植错误)
import { it, expect } from 'vitest';
import { World } from '../src/world/World';
import { placeTrack, frameTrackArea, trackCollision, FLAG_ON_TRACK } from '../src/world/MinecartTrack';

it('向左爬坡(用户标记布局)', () => {
  const w = new World(4200, 1200, 7, 'slope');
  const st = w.store;
  // 平轨行1000:x2604..2620;frame7@(2603,1000);frame5@(2602,999);平轨行999:x2586..2601
  for (let x = 2604; x <= 2620; x++) placeTrack(st, x, 1000, 0);
  placeTrack(st, 2603, 1000, 0);
  placeTrack(st, 2602, 999, 0);
  for (let x = 2586; x <= 2601; x++) placeTrack(st, x, 999, 0);
  for (let x = 2586; x <= 2620; x++) frameTrackArea(st, x, 999);
  for (let x = 2586; x <= 2620; x++) frameTrackArea(st, x, 1000);
  console.error('framed:', [...Array.from({ length: 20 }, (_, i) => {
    const x = 2601 - i;
    return `${x},${st.get(x, 999) === 22 || st.get(x, 999) !== 0 && st.type[st.idx(x, 999)] !== 0 ? st.frameX[st.idx(x, 999)] : (st.frameX[st.idx(x, 1000)] ?? '-')}`;
  }).join(' ')]);

  for (const v0 of [3, 5, 8]) {
    const r = { x: 2618 * 16 - 2, y: 1000 * 16 - 42, vx: -v0, vy: 0, lastBoostX: 0, lastBoostY: 0 };
    let minY = r.y, stuckTick = -1, crossed = false;
    for (let i = 0; i < 900; i++) {
      r.vy = Math.min(r.vy + 0.4, 10);
      const bits = trackCollision(st, r, 20, 42, false, false, 0, false, {});
      r.x += r.vx; r.y += r.vy;
      minY = Math.min(minY, r.y);
      if (r.x <= 2590 * 16) { crossed = true; break; }
      const onTrack = !!(bits & (1 << FLAG_ON_TRACK));
      if (onTrack && Math.abs(r.vx) < 0.05 && r.x > 2600 * 16 && r.x < 2606 * 16) { stuckTick = i; break; }
    }
    console.error(`v0=${v0}: crossed=${crossed} stuckTick=${stuckTick} endX=${(r.x / 16).toFixed(1)} endY=${(r.y / 16).toFixed(1)}`);
    if (v0 === 3) expect(crossed, '正常速度 vx=3 应能爬上坡').toBe(true);
  }
});
