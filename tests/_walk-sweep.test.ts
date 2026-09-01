// [临时探针] 相位扫描:起点 x 3162..3170 步进 0.05 × 恒速/加速,找任意空中帧配置
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

function walkOne(startX: number, dir: number, mode: 'const' | 'accel', spd: number, ticks: number): { air: number; maxAir: number; segs: string[]; endX: number; endFt: number } {
  const world = buildWorld();
  const b = {
    x: startX * TILE, y: 275 * TILE - 42,
    w: 20, h: 42, vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
    collideY: false, stepUp: true, stepUpHolds: false, stepUpNpc: true,
    liqFactor: 1, dropThrough: false,
  } as unknown as Parameters<typeof moveAndCollide>[0];
  let air = 0, maxAir = 0;
  const segs: string[] = [];
  for (let t = 0; t < ticks; t++) {
    if (mode === 'accel') {
      // 引擎式爬坡:每 tick 向目标速度靠拢(约 25t 到满速,与用户日志 0→3 ≈ 25t 相符)
      const target = dir * spd;
      b.vx += Math.sign(target - b.vx) * Math.min(Math.abs(target - b.vx), 0.12);
    } else b.vx = dir * spd;
    b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(b, world, b.vx, b.vy);
    if (!b.onGround) {
      air++; maxAir = Math.max(maxAir, air);
      if (air <= 6) segs.push(`x${(b.x / TILE).toFixed(2)} ft${((b.y + b.h) / TILE).toFixed(3)} vy${b.vy.toFixed(2)}`);
    } else air = 0;
  }
  return { air: segs.length ? 1 : 0, maxAir, segs, endX: b.x / TILE, endFt: (b.y + b.h) / TILE };
}

describe('[临时] 左侧下行相位扫描', () => {
  it('右行 L→R,起点 3162..3170 × 0.05 × const/accel × 3 速度', () => {
    let bad = 0;
    for (const mode of ['const', 'accel'] as const) {
      for (const spd of [2.6, 2.8, 3.0, 3.04]) {
        for (let sx = 3162; sx <= 3170.001; sx += 0.05) {
          const r = walkOne(sx, 1, mode, spd, 140);
          if (r.maxAir > 0) {
            bad++;
            if (bad <= 12) console.log(`[FALL] mode=${mode} spd=${spd} sx=${sx.toFixed(2)} maxAir=${r.maxAir} 终x${r.endX.toFixed(1)}ft${r.endFt.toFixed(1)} | ${r.segs.slice(0, 4).join(' → ')}`);
          }
        }
      }
    }
    console.log(`[sweep] 右行: ${bad} 个配置出现空中帧`);
  });
  it('左行 R→L(右侧结构,起点 3224..3232 × 0.05)', () => {
    let bad = 0;
    for (const mode of ['const', 'accel'] as const) {
      for (const spd of [2.6, 3.0]) {
        for (let sx = 3224; sx <= 3232.001; sx += 0.05) {
          const r = walkOne(sx, -1, mode, spd, 140);
          if (r.maxAir > 0) {
            bad++;
            if (bad <= 12) console.log(`[FALL] mode=${mode} spd=${spd} sx=${sx.toFixed(2)} maxAir=${r.maxAir} 终x${r.endX.toFixed(1)}ft${r.endFt.toFixed(1)} | ${r.segs.slice(0, 4).join(' → ')}`);
          }
        }
      }
    }
    console.log(`[sweep] 左行: ${bad} 个配置出现空中帧`);
  });
});
