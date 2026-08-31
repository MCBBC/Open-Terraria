// ★一次性：真档窗口下行 Δy 剖面 + slopeCollide 决策对
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { moveAndCollide } from '../src/physics/TileCollision';
import { World } from '../src/world/World';
import { ENEMY_GRAVITY, MAX_FALL_SPEED, TILE } from '../src/core/constants';

describe('prof', () => {
  it('t', () => {
    type Cell = [number, number, number, number, number];
    const fx = JSON.parse(readFileSync(new URL('./fixtures/stair-window.json', import.meta.url), 'utf8')) as { origin: [number, number]; cells: Cell[] };
    const [ox, oy] = fx.origin;
    const w = new World(52, 32, 7, 'p');
    const st = w.store;
    for (const [ax, ay, type, slope, half] of fx.cells) {
      const x = ax - ox, y = ay - oy;
      if (!st.inBounds(x, y)) continue;
      st.type[st.idx(x, y)] = type;
      st.flags[st.idx(x, y)] = 1;
      if (slope) st.slope[st.idx(x, y)] = slope;
      if (half) st.half[st.idx(x, y)] = half;
    }
    const b = { x: (3196 - ox) * TILE, y: (389 - oy) * TILE - 42,
      w: 20, h: 42, vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
      collideY: false, stepUp: true, stepUpHolds: true, stepUpNpc: true, liqFactor: 1,
    } as unknown as Parameters<typeof moveAndCollide>[0];
    const g2_ = globalThis as { __JIT?: unknown[] };
    g2_.__JIT = [];
    const dys: string[] = [];
    let air0 = 0;
    for (let t = 0; t < 90; t++) {
      const py = b.y;
      b.vx = 1;
      b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b, w, b.vx, b.vy);
      dys.push(`${t}:${(b.y - py >= 0 ? '+' : '') + (b.y - py).toFixed(1)}${b.onGround ? '' : '*'}`);
      if (!b.onGround) air0++;
    }
    const tr = ((globalThis as { __JIT?: unknown[] }).__JIT ?? []).slice(-30).map(v=>{const o=v as Record<string,number|undefined>;const f=(k:string)=>typeof o[k]==='number'?(o[k] as number).toFixed(1):String(o[k]);return `${o.ph} ny${f('ny')} sx${f('sx')} sf${f('sf')} blk${String(o.blk)}`;}).join('\n');
    console.log(tr);
    console.log(`air=${air0}\n` + dys.join(' '));
  });
});
