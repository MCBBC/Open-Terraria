// ★一次性:F5 地形快照重建 + 平台阶梯交替处多速度回放
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
    if (v[3]) st.flags[i] |= 64; // 平台位(如 TileStore 用独立数组则由下方适配)
  }
  const world = { store: st } as never;
  return world;
}

function mkBody(xTile: number, feetPx: number) {
  return {
    x: xTile * TILE, y: feetPx - 42,
    w: 20, h: 42,
    vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false,
    collideY: false, stepUp: true, stepUpHolds: true, stepUpNpc: true,
    liqFactor: 1,
  } as unknown as Parameters<typeof moveAndCollide>[0];
}

describe('plat51', () => {
  it('A: 从实心顶向右走下平台坡(3166,275)', () => {
    const world = buildWorld();
    for (const spd of [2.0, 2.6, 3.0]) {
      const b = mkBody(3163, 275 * TILE);
      const tr: string[] = [];
      let maxDrop = 0;
      for (let t = 0; t < 90; t++) {
        b.vx = spd;
        b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
        moveAndCollide(b, world, b.vx, b.vy);
        const feet = (b.y + b.h) / TILE, tx = b.x / TILE;
        tr.push(`t${String(t).padStart(2)} x${tx.toFixed(2)} ft${feet.toFixed(2)} ${b.onGround ? 'G' : '.'} vy${b.vy.toFixed(1)}`);
        if (feet > 275.6 && tx < 3172) maxDrop = Math.max(maxDrop, feet - 275);
        if (tx > 3173) break;
      }
      console.log(`== SPD ${spd} (maxDrop ${maxDrop.toFixed(2)}t):\n` + tr.join('\n'));
    }
  });
  it('B: 从楼梯底向左走上爬回实心顶(用户事发方向)', () => {
    const world = buildWorld();
    // 起点:站上实心斜坡链中部 (3168,277) 表面: surface = 277*16+(x-3168)px → x=3168.5 表面≈277.5行
    for (const spd of [2.0, 2.6]) {
      const startX = 3168.5;
      const surf = 277 * TILE + (startX - 3168) * TILE;
      const b = mkBody(startX, surf);
      const tr: string[] = [];
      let airStreak = 0, maxAir = 0;
      for (let t = 0; t < 80; t++) {
        b.vx = -spd;
        b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
        moveAndCollide(b, world, b.vx, b.vy);
        const feet = (b.y + b.h) / TILE, tx = b.x / TILE;
        if (!b.onGround) { airStreak++; maxAir = Math.max(maxAir, airStreak); } else airStreak = 0;
        tr.push(`t${String(t).padStart(2)} x${tx.toFixed(2)} ft${feet.toFixed(2)} ${b.onGround ? 'G' : '.'} vy${b.vy.toFixed(1)} air${airStreak}`);
        if (tx < 3160) break;
      }
      console.log(`== CLIMB SPD ${spd} (maxAirStreak ${maxAir}):\n` + tr.join('\n'));
    }
  });
});
