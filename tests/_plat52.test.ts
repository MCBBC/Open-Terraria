import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { moveAndCollide } from '../src/physics/TileCollision';
import { ENEMY_GRAVITY, MAX_FALL_SPEED, TILE } from '../src/core/constants';

const LOG = '/Users/vinlic/Downloads/behavior-log-Starter_World-2026-09-01T09-22-21-139Z.json';

function buildWorld() {
  const j = JSON.parse(readFileSync(LOG, 'utf8'));
  const cells = j.meta.terrain.cells;
  const st = new TileStore(4000, 1200);
  for (const [k, v] of Object.entries(cells)) {
    const [x, y] = k.split(',').map(Number);
    const i = st.idx(x, y);
    st.type[i] = v[0]; st.slope[i] = v[1]; st.half[i] = v[2]; st.flags[i] = 1;
    if (v[3]) st.flags[i] |= 64;
  }
  return { store: st } as never;
}

describe('plat52', () => {
  it('汇总:各速度/方向穿越过渡带', () => {
    const world = buildWorld();
    const st = (world as unknown as { store: TileStore }).store;
    // 类型核对:交替带每格
    console.log('--- 单元核对 ---');
    for (const [cx, cy] of [[3166,275],[3167,275],[3168,275],[3172,275],[3167,276],[3168,277],[3169,278]] as [number,number][]) {
      const i = st.idx(cx, cy);
      const d = (st as unknown as { TILE_DEFS?: unknown }).constructor.name; // noop
      void d;
      const isP = st.isPlatform(cx, cy);
      console.log(`(${cx},${cy}) type=${st.type[i]} slope=${st.slope[i]} half=${st.half[i]} plat=${isP} active=${st.flags[i]&1?1:0}`);
    }
    // 场景C: 玩家用真实跳跃初速(-5.01)从楼梯底跳向实心顶(用户曾跳跃场景)
    // 场景D: 微降速经过交替处(vx从2.6渐减到1.4)
    for (const [tag, startX, startFeet, dir, spd] of [
      ['RIGHT-2.6', 3163, 275 * TILE, 1, 2.6],
      ['RIGHT-3.0', 3163, 275 * TILE, 1, 3.0],
      ['LEFT-CLIMB-2.6', 3169.8, 0, -1, 2.6],   // 从左链 solid 斜坡 (3169,278) 面
      ['LEFT-CLIMB-2.0', 3169.8, 0, -1, 2.0],
      ['FLAT-RUN-LEFT', 3170.5, 275 * TILE, -1, 2.6],  // 沿平平台向左走向坡
    ] as [string, number, number, number, number][]) {
      let sx = startX, sFeet = startFeet;
      if (startFeet === 0) { sx = 3169.55; sFeet = (278 * TILE + (sx - 3169) * TILE); }
      const b = {
        x: sx * TILE, y: sFeet - 42,
        w: 20, h: 42,
        vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
        collideY: false, stepUp: true, stepUpHolds: true, stepUpNpc: true,
        liqFactor: 1,
      } as unknown as Parameters<typeof moveAndCollide>[0];
      let airStreak = 0, maxAir = 0, minGFeet = 999, dipAt = '';
      const tr: string[] = [];
      for (let t = 0; t < 120; t++) {
        b.vx = dir * spd;
        b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
        moveAndCollide(b, world, b.vx, b.vy);
        const feet = (b.y + b.h) / TILE, tx = b.x / TILE;
        if (!b.onGround) { airStreak++; if (airStreak > maxAir) maxAir = airStreak; } else { airStreak = 0; if (feet > minGFeet) minGFeet = feet; }
        if (t % 2 === 0 || !b.onGround) tr.push(`t${String(t).padStart(2)} x${tx.toFixed(2)} ft${feet.toFixed(2)} ${b.onGround ? 'G' : '.'} air${airStreak}`);
        if (tx < 3158 || tx > 3180) break;
      }
      console.log(`== ${tag}: maxAirStreak=${maxAir}\n` + tr.join('\n'));
    }
  });
});
