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
describe('plat57', () => {
  it('t61/t62/t63 单tick逐格trace', () => {
    const world = buildWorld();
    const b = {
      x: 3162 * TILE, y: 275 * TILE - 42, w: 20, h: 42,
      vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
      collideY: false, stepUp: true, stepUpHolds: false, stepUpNpc: true,
      liqFactor: 1,
    } as unknown as Parameters<typeof moveAndCollide>[0];
    for (let t = 0; t < 64; t++) {
      b.vx = 3.0;
      b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);
      const traceOn = (t === 62 || t === 63);
      (globalThis as Record<string, unknown>).__SW_SCTRACE = traceOn ? { out: [] } : undefined;
      moveAndCollide(b, world, b.vx, b.vy);
      const out = ((globalThis as Record<string, unknown>).__SW_SCTRACE as { out: string[] })?.out;
      if (out && out.length) console.log(`\n=== t${t} exitG=${b.onGround} feet=${(b.y + b.h).toFixed(2)}\n` + out.join('\n'));
      (globalThis as Record<string, unknown>).__SW_SCTRACE = undefined;
      if (!b.onGround) break;
    }
  });
});
