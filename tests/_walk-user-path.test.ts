// [临时探针] 用户日志精确起点纯步行回放(完整日志地形 x3150-3214)
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { moveAndCollide } from '../src/physics/TileCollision';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../src/core/constants';

const LOG = JSON.parse(readFileSync('/Users/vinlic/Downloads/behavior-log-Starter_World-2026-09-01T10-38-59-497Z.json', 'utf8'));
const CELLS = LOG.meta.terrain.cells as Record<string, [number, number, number, number, number]>;

function buildWorld() {
  let w = 0, h = 0;
  for (const k of Object.keys(CELLS)) {
    const [x, y] = k.split(',').map(Number);
    w = Math.max(w, x); h = Math.max(h, y);
  }
  const st = new TileStore(w + 2, h + 2);
  for (const [k, v] of Object.entries(CELLS)) {
    const [x, y] = k.split(',').map(Number);
    const i = st.idx(x, y);
    st.type[i] = v[0]; st.slope[i] = v[1]; st.half[i] = v[2]; st.flags[i] = 1;
    if (v[3]) st.flags[i] |= 64;
  }
  return { store: st } as never;
}

function walk(opts: { startX: number; startFeetPx: number; dir: number; ticks: number }) {
  const world = buildWorld();
  const b = {
    x: opts.startX * TILE, y: opts.startFeetPx - 42,
    w: 20, h: 42, vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
    collideY: false, stepUp: true, stepUpHolds: false, stepUpNpc: true,
    liqFactor: 1, dropThrough: false,
  } as unknown as Parameters<typeof moveAndCollide>[0];
  let air = 0, maxAir = 0;
  const airSegs: string[] = [];
  for (let t = 0; t < opts.ticks; t++) {
    b.vx = opts.dir * 3.0;
    b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(b, world, b.vx, b.vy);
    if (!b.onGround) {
      air++; maxAir = Math.max(maxAir, air);
      airSegs.push(`t${t} AIR x${(b.x / TILE).toFixed(2)} ft${((b.y + b.h) / TILE).toFixed(3)} vy${b.vy.toFixed(2)}`);
    } else air = 0;
  }
  console.log(`[walk] 起 x${opts.startX} ft${(opts.startFeetPx / TILE).toFixed(2)} dir${opts.dir} → 终 x${(b.x / TILE).toFixed(1)} ft${((b.y + b.h) / TILE).toFixed(2)} | 空中帧=${airSegs.length} 最长连续=${maxAir}`);
  for (const s of airSegs.slice(0, 40)) console.log('   ', s);
}

describe('[临时] 用户路径纯步行', () => {
  it('左侧结构 L→R 下行(用户 t885 起点)', () => {
    walk({ startX: 3163.8, startFeetPx: 275 * TILE, dir: 1, ticks: 120 });
  });
  it('右侧结构 R→L 下行(镜像 A/B, 用户 t1295 段)', () => {
    walk({ startX: 3231.6, startFeetPx: 275 * TILE, dir: -1, ticks: 120 });
  });
});
