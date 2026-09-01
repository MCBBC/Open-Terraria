// 动态状态回放:加速入坡/折返/跳跃落入/坠落穿越 —— 全部对着今日走廊地形
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TileStore } from '../src/world/TileStore';
import { moveAndCollide } from '../src/physics/TileCollision';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../src/core/constants';

const FIX = JSON.parse(readFileSync(join('tests', 'fixtures', 'plat-corridor-window.json'), 'utf8'));
function world() {
  const st = new TileStore(FIX.w, FIX.h);
  for (const [k, v] of Object.entries(FIX.cells)) {
    const [x, y] = k.split(',').map(Number);
    const i = st.idx(x, y);
    st.type[i] = v[0]; st.slope[i] = v[1]; st.half[i] = v[2]; st.flags[i] = 1;
    if (v[3]) st.flags[i] |= 64;
  }
  return { store: st } as never;
}

describe('动态入坡', () => {
  it('加速/折返/跳落/坠穿', () => {
    const w = world();

    const run = (tag: string, ctrl: (t: number, b: Parameters<typeof moveAndCollide>[0]) => void,
      startX: number, feetPx: number, ticks: number) => {
      const b = {
        x: startX * TILE, y: feetPx - 42, w: 20, h: 42,
        vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
        collideY: false, stepUp: true, stepUpHolds: false, stepUpNpc: true,
        liqFactor: 1,
      } as unknown as Parameters<typeof moveAndCollide>[0];
      let air = 0, maxAir = 0, maxVyAir = 0;
      const segs: string[] = [];
      for (let t = 0; t < ticks; t++) {
        ctrl(t, b);
        b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);
        moveAndCollide(b, w, b.vx, b.vy);
        if (!b.onGround) {
          air++; maxVyAir = Math.max(maxVyAir, b.vy);
          segs.push(`t${t} x${(b.x / TILE).toFixed(2)} ft${((b.y + b.h) / TILE).toFixed(2)} vy${b.vy.toFixed(1)} air${air}`);
        } else { air = 0; }
        maxAir = Math.max(maxAir, air);
      }
      console.log(`\n== ${tag}: maxAir=${maxAir} 落地前最大vy=${maxVyAir.toFixed(1)}`);
      if (segs.length) console.log(segs.slice(0, 30).join('\n'));
    };

    // A: 从左侧实心顶静止起步向右加速穿过整个结构(自然加速)
    run('A 加速起步L→R', (t, b) => {
      b.vx = Math.min(b.vx + 0.32, 3);
    }, 3161, 275 * TILE, 90);

    // B: 行走中在平台岛上折返再右行(A键在t38松开,D重按)
    run('B 岛上折返', (t, b) => {
      if (t < 20) b.vx = Math.min(b.vx + 0.32, 2.6);
      else if (t < 36) b.vx = Math.max(b.vx - 0.55, -2.6);   // 折返段
      else b.vx = Math.min(b.vx + 0.32, 2.6);                 // 再右行
    }, 3161, 275 * TILE, 110);

    // C: 跳跃直接从左顶跃过岛落进右下行链(玩家爱抄近道)
    run('C 跳跃跨岛', (t, b) => {
      b.vx = 2.6;
      if (t === 12) b.vy = -5.01;             // 起跳
      if (t > 12 && t <= 24 && b.vy < 0) b.vy = -5.01;   // 短按持续上升段简化
    }, 3162, 275 * TILE, 80);

    // D: 从上方(岛上方空中)自由落到第二坡入口
    run('D 高空落入', (_t, _b) => {}, 3171.5, 272 * TILE, 60);
  });
});
