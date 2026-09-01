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

describe('plat53 真玩家语义(GRAVITY=0.4, holds=inputUp=false)', () => {
  it('全速度双向穿越+跳跃', () => {
    const world = buildWorld();
    const mk = (xTile: number, feetPx: number) => ({
      x: xTile * TILE, y: feetPx - 42, w: 20, h: 42,
      vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
      collideY: false, stepUp: true, stepUpHolds: false, stepUpNpc: true,
      liqFactor: 1, dropThrough: false,
    } as unknown as Parameters<typeof moveAndCollide>[0]);

    const cases: [string, number, number, number][] = [
      ['R-2.0', 3162, 275 * TILE, 2.0], ['R-2.6', 3162, 275 * TILE, 2.6], ['R-3.0', 3162, 275 * TILE, 3.0],
      ['L-2.0', 3174, 275 * TILE, -2.0], ['L-2.6', 3174, 275 * TILE, -2.6], ['L-3.0', 3174, 275 * TILE, -3.0],
    ];
    for (const [tag, sx, sf, spd] of cases) {
      const b = mk(sx, sf);
      let air = 0, maxAir = 0, dip = 0;
      for (let t = 0; t < 140; t++) {
        b.vx = spd;
        b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);   // 玩家重力
        moveAndCollide(b, world, b.vx, b.vy);
        if (!b.onGround) { air++; maxAir = Math.max(maxAir, air); }
        else air = 0;
        dip = Math.max(dip, (b.y + b.h) / TILE - 275);
        if (spd > 0 && b.x / TILE > 3184) break;
        if (spd < 0 && b.x / TILE < 3158) break;
      }
      console.log(`${tag}: maxAirStreak=${maxAir} maxDipBelow275=${dip.toFixed(2)}t`);
    }
    // 走左离开平平台左缘踩上坡格(vanilla 语义关键场景)
    const b = mk(3169, 275 * TILE);
    const tr: string[] = [];
    for (let t = 0; t < 60; t++) {
      b.vx = -2.6;
      b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b, world, b.vx, b.vy);
      tr.push(`t${String(t).padStart(2)} x${(b.x / TILE).toFixed(2)} ft${((b.y + b.h) / TILE).toFixed(2)} ${b.onGround ? 'G' : '.'}`);
    }
    console.log('FLAT-END-WALK-LEFT:\n' + tr.join('\n'));
    void world;
  });
});
