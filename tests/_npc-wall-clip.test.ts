// 最小化墙体穿透重放:逐 tick 追踪穿透出现的精确 tick
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TownNPC } from '../src/entities/TownNPC';
import { moveAndCollide } from '../src/physics/TileCollision';

describe('墙体穿透追踪', () => {
  it('NPC 持续推向 solid 墙', () => {
    const st = new TileStore(700, 400);
    const D = TILE_BY_KEY['v_479_smooth_sandstone_block'] ?? TILE_BY_KEY['stone'];
    console.log('D =', D, 'isSolid check:', (() => { const i = st.idx(602, 328); st.type[i] = D; st.flags[i] = 1; return st.isSolid(602, 328); })());
    // 重置
    st.type[st.idx(602, 328)] = 0; st.flags[st.idx(602, 328)] = 0;

    // 建走廊: 地板 + 左右壁
    for (let x = 590; x <= 610; x++) { const i = st.idx(x, 331); st.type[i] = D; st.flags[i] = 1; }
    for (let y = 326; y <= 330; y++) {
      for (let dx = -2; dx <= -1; dx++) { const i = st.idx(602+dx, y); st.type[i] = D; st.flags[i] = 1; }
    }
    // 右壁 = col 602..603, 行 326..330
    for (let y = 326; y <= 330; y++) {
      for (let dx = 0; dx <= 1; dx++) { const i = st.idx(602+dx, y); st.type[i] = D; st.flags[i] = 1; }
    }

    console.log('isSolid(602,328) =', st.isSolid(602, 328));

    const n = new TownNPC('guide', 0, 0);
    n.x = 598 * 16; n.y = 331 * 16 - n.h;
    const world = { store: st } as unknown as import('../src/world/World').World;
    const WALL_FACE = 602 * 16;

    let firstPenTick = -1;
    for (let tick = 0; tick < 300; tick++) {
      n.vx = 1; n.vy = 0.3;
      moveAndCollide(n, world, n.vx, n.vy);
      const pen = WALL_FACE - n.x;  // 正=穿透(左缘越过壁面)
      if (pen > 0 && firstPenTick < 0) firstPenTick = tick;
      if (tick < 10 || (firstPenTick >= 0 && tick < firstPenTick + 5) || tick % 30 === 0) {
        console.log(`t${tick} x=${Math.round(n.x)} rightEdge=${Math.round(n.x+n.w)} pen=${Math.round(Math.max(0,WALL_FACE-n.x))} hw=${n.hitWall} g=${n.onGround}`);
      }
      if (pen > 100) { console.log(`BREAKTHROUGH at t${tick} pen=${pen}`); break; }
    }
    console.log('firstPenTick =', firstPenTick);
    expect(true).toBe(true); // 信息采集测试
  });
});
