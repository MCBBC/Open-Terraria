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

describe('plat55 漏帧时刻斜坡候选仪器', () => {
  it('SPD3.0 R向边界帧取证', () => {
    const world = buildWorld();
    // 找走廊中 plat-slope 链的实际格子(在快照里列全 slope1+plat)
    const cells = JSON.parse(readFileSync(LOG, 'utf8')).meta.terrain.cells;
    const chain: string[] = [];
    for (const [k, v] of Object.entries(cells)) {
      if (v[0] !== 11) continue; // 平台
      chain.push(`${k} type=${v[0]} slope=${v[1]}`);
    }
    console.log('平台格全列:\n' + chain.sort().join('\n'));

    const dbgArr: unknown[] = [];
    (globalThis as Record<string, unknown>).__SW_SCDBG = dbgArr;

    const b = {
      x: 3162 * TILE, y: 275 * TILE - 42, w: 20, h: 42,
      vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
      collideY: false, stepUp: true, stepUpHolds: false, stepUpNpc: true,
      liqFactor: 1,
    } as unknown as Parameters<typeof moveAndCollide>[0];
    let prevG = true;
    for (let t = 0; t < 200; t++) {
      b.vx = 3.0;
      b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b, world, b.vx, b.vy);
      const gNow = b.onGround;
      if (prevG && !gNow || (!prevG)) {
        console.log(`t${t} x${(b.x / TILE).toFixed(2)} ft${((b.y + b.h) / TILE).toFixed(2)} ${gNow ? 'G' : '.'} vy${b.vy.toFixed(2)} scdbg=${JSON.stringify(dbgArr)}`);
        dbgArr.length = 0;
      }
      prevG = gNow;
      if (b.x / TILE > 3184) break;
    }
    (globalThis as Record<string, unknown>).__SW_SCDBG = undefined as never;
  });
});
