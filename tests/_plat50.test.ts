// ★一次性:F5 地形快照重建 + 走入平台下坠复现
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { moveAndCollide } from '../src/physics/TileCollision';
import { ENEMY_GRAVITY, MAX_FALL_SPEED, TILE } from '../src/core/constants';

describe('plat50', () => {
  it('地形dump+行走回放', () => {
    const j = JSON.parse(readFileSync('/Users/vinlic/Downloads/behavior-log-Starter_World-2026-09-01T09-22-21-139Z.json', 'utf8'));
    const cells = j.meta.terrain.cells;
    const ptx = j.meta.terrain.playerTileX, pty = j.meta.terrain.playerTileY;
    const st = new TileStore(6400, 1800);
    for (const [k, v] of Object.entries(cells)) {
      const [x, y] = k.split(',').map(Number);
      const i = st.idx(x, y);
      st.type[i] = v[0]; st.slope[i] = v[1]; st.half[i] = v[2];
      st.flags[i] = 1;
      if (v[3]) { /* platform flag is derived from type */ }
    }
    // 地形dump
    const ch = (x: number, y: number) => {
      const c = cells[`${x},${y}`];
      if (!c) return '.';
      const [type, slope, half, isPlat] = c;
      if (type === 0) return '.';
      if (slope > 0 && !half) return String(slope);
      if (half && !slope) return 'H';
      if (isPlat) return '=';
      return '#';
    };
    const lines: string[] = [];
    for (let y = 270; y <= 285; y++) {
      let row = String(y).padStart(3) + ' ';
      for (let x = 3160; x <= 3180; x++) row += ch(x, y);
      lines.push(row);
    }
    console.log('x从3160起:\n' + lines.join('\n'));
    // 回放:玩家在 x3172 walking LEFT(用户轨迹 t1515-1605)
    const b = {
      x: 3172 * TILE, y: (275 * 16 + 2) - 42 + 4,
      w: 20, h: 42,
      vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
      collideY: false, stepUp: true, stepUpHolds: true, stepUpNpc: true,
      liqFactor: 1,
    } as unknown as Parameters<typeof moveAndCollide>[0];
    const trail: string[] = [];
    for (let t = 0; t < 40; t++) {
      b.vx = -2.6;                              // 用户走速(向左)
      b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b, world as never, b.vx, b.vy);
      const feet = (b.y + b.h) / TILE, tx = b.x / TILE;
      trail.push(`t${t} x${tx.toFixed(2)} feet${feet.toFixed(2)} ${b.onGround?'G':'.'} vy${b.vy.toFixed(1)}`);
    }
    console.log('REPLAY(向左走入固块):\n' + trail.join('\n'));
  });
});
