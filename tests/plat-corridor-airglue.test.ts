// ★平台走廊交界无空中帧回归（2026-09-01 用户 F5 地形快照回放定案）
// 地形 = 用户实存档 Starter_World 走廊窗口（双层坡链：下行平台链 + 实心阶梯
// 链 + 灯柱装饰带），曾因「slopeCollide 仅看分轴后位置 → 旧坡格提前 1-2 帧
// 水平出窗」在台阶端点漏 2-3 帧支撑（vy 偏离 GRAVITY 后 walkDownSlopePre 的
// 字面门失活，整段纯重力坠落）。修 = slopeCollide 扫描窗用 X 移动前后并集。
// 本测试以真实地形逐速度/双向回放，任何一处漏帧即爆红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileStore } from '../src/world/TileStore';
import { moveAndCollide } from '../src/physics/TileCollision';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../src/core/constants';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE: {
  w: number; h: number;
  cells: Record<string, [number, number, number, number]>;
} = JSON.parse(readFileSync(join(HERE, 'fixtures', 'plat-corridor-window.json'), 'utf8'));

function buildWorld() {
  const st = new TileStore(FIXTURE.w, FIXTURE.h);
  for (const [k, v] of Object.entries(FIXTURE.cells)) {
    const [x, y] = k.split(',').map(Number);
    const i = st.idx(x, y);
    st.type[i] = v[0]; st.slope[i] = v[1]; st.half[i] = v[2]; st.flags[i] = 1;
    if (v[3]) st.flags[i] |= 64;
  }
  return { store: st } as never;
}

/** 沿线期望脚底（用户世界双层阶梯的真实表面；用于判断"真下坠"vs"合法跳跃"） */
function crossBody(opts: {
  startX: number; startFeetPx: number; dir: number; speed: number;
  maxTicks?: number; stopX?: [number, number];
}): { maxAirStreak: number; trail: string[] } {
  const world = buildWorld();
  const b = {
    x: opts.startX * TILE, y: opts.startFeetPx - 42,
    w: 20, h: 42,
    vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
    collideY: false, stepUp: true, stepUpHolds: false, stepUpNpc: true,
    liqFactor: 1, dropThrough: false,
  } as unknown as Parameters<typeof moveAndCollide>[0];
  let air = 0, maxAir = 0;
  const trail: string[] = [];
  const N = opts.maxTicks ?? 160;
  for (let t = 0; t < N; t++) {
    b.vx = opts.dir * opts.speed;
    b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);   // 玩家语义重力（StepDown vy===GRAVITY 门成立）
    moveAndCollide(b, world, b.vx, b.vy);
    if (!b.onGround) { air++; maxAir = Math.max(maxAir, air); trail.push(`t${t} AIR x${(b.x / TILE).toFixed(2)} ft${((b.y + b.h) / TILE).toFixed(2)}`); }
    else air = 0;
    if (opts.stopX && (b.x / TILE < opts.stopX[0] || b.x / TILE > opts.stopX[1])) break;
  }
  return { maxAirStreak: maxAir, trail };
}

describe('平台走廊交界零空中帧（真实存档地形）', () => {
  it('顶面右行下穿平台坡阶（x3162 起，SPD 2.0/2.6/3.0）', () => {
    for (const spd of [2.0, 2.6, 3.0]) {
      const r = crossBody({ startX: 3162, startFeetPx: 275 * TILE, dir: 1, speed: spd, stopX: [3158, 3184] });
      expect(r.maxAirStreak, `SPD${spd} 空中段:\n${r.trail.join('\n')}`).toBe(0);
    }
  });
  it('走廊底沿实心斜坡链左行登顶（CLIMB）', () => {
    for (const sx of [3169.55, 3170.35]) {
      const feetPx = 279 * TILE + (sx * TILE - 3170 * TILE);
      const r = crossBody({ startX: sx, startFeetPx: feetPx, dir: -1, speed: 2.6, stopX: [3160, 3200] });
      expect(r.maxAirStreak, `起点${sx} 空中段:\n${r.trail.join('\n')}`).toBe(0);
    }
  });
});
