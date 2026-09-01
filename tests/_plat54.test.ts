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

describe('plat54', () => {
  it('R向空中帧定位 + 爬升/跳跃', () => {
    const world = buildWorld();
    // R向三速度:打印全部空中帧段
    for (const spd of [2.0, 2.6, 3.0]) {
      const b = {
        x: 3162 * TILE, y: 275 * TILE - 42, w: 20, h: 42,
        vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
        collideY: false, stepUp: true, stepUpHolds: false, stepUpNpc: true,
        liqFactor: 1,
      } as unknown as Parameters<typeof moveAndCollide>[0];
      let air = 0;
      const segs: string[] = [];
      for (let t = 0; t < 200; t++) {
        b.vx = spd;
        b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);
        moveAndCollide(b, world, b.vx, b.vy);
        const tx = b.x / TILE, ft = (b.y + b.h) / TILE;
        if (!b.onGround) { air++; segs.push(`   AIR t${t} x${tx.toFixed(2)} ft${ft.toFixed(2)} vy${b.vy.toFixed(1)}`); }
        else {
          if (air) segs.push(` ↑${air}帧`);
          air = 0;
        }
        if (tx > 3183) break;
      }
      console.log(`== SPD ${spd} 空中段:\n` + (segs.join('\n') || '(无)'));
    }
    // 爬升:从走廊底沿实心斜坡链向左(正确落脚)
    for (const [tag, sx] of [['CLIMB-2.6', 3170.55], ['CLIMB-2.0', 3170.35]] as [string, number][]) {
      const feetPx = 279 * TILE + (sx * TILE - 3170 * TILE);
      const b = {
        x: sx * TILE, y: feetPx - 42, w: 20, h: 42,
        vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
        collideY: false, stepUp: true, stepUpHolds: false, stepUpNpc: true,
        liqFactor: 1,
      } as unknown as Parameters<typeof moveAndCollide>[0];
      const lines: string[] = [];
      let air = 0, maxA = 0;
      for (let t = 0; t < 100; t++) {
        b.vx = -2.6;
        b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);
        moveAndCollide(b, world, b.vx, b.vy);
        const tx = b.x / TILE, ft = (b.y + b.h) / TILE;
        if (!b.onGround) { air++; maxA = Math.max(maxA, air); lines.push(`t${String(t).padStart(2)} x${tx.toFixed(2)} ft${ft.toFixed(2)} . vy${b.vy.toFixed(1)} air${air}`); }
        else { air = 0; if (t % 3 === 0 || ft < 277.5 && t % 3 !== 0) lines.push(`t${String(t).padStart(2)} x${tx.toFixed(2)} ft${ft.toFixed(2)} G`); }
        if (tx < 3160) break;
      }
      console.log(`${tag}: maxAir=${maxA}\n` + lines.slice(0, 45).join('\n'));
    }
  });
});
