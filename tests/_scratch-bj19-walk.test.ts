import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSave } from '../src/save/SaveFile';
import { moveAndCollide } from '../src/physics/TileCollision';
import { TILE, GRAVITY, MAX_FALL_SPEED } from '../src/core/constants';

// SW-BJ19 一次性诊断:复现"上坡走标注 2 格斜坡间歇减速"
// 行走模型:跑链 vx 锯齿(0.08 加速/3.04 越帽回落 0.2) + 贴地 vy=重力累加(碰撞清零)
type Body2 = Parameters<typeof moveAndCollide>[0];

function mkBody(x: number, y: number): Body2 {
  return {
    x, y, w: 20, h: 42,
    vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false,
    collideY: false, stepUp: true, stepUpHolds: false, stepUpNpc: false,
    stepDownGate: 'gravity' as const, liqFactor: 1,
  } as unknown as Body2;
}

describe('SW-BJ19 上坡减速复现', () => {
  it('东坡爬标注坡格 多次重放', () => {
    const { world } = loadSave(readFileSync('/Users/vinlic/Downloads/map-Starter_World (29).json', 'utf8'));
    const X0 = 51270, X1 = 51370;   // 坡下平台阶梯顶 → 坡顶平台
    const runs: string[] = [];
    for (let run = 0; run < 8; run++) {
      const b = mkBody(X0, 363 * TILE - 42);   // 坡脚西侧平地起步
      // 先落地
      b.vy = 2; moveAndCollide(b, world, 0, b.vy);
      let vx = 0, vy = 0;
      let events = 0;
      const trace: string[] = [];
      for (let t = 0; t < 200; t++) {
        // 跑链(贴地):全速段 +0.08;越帽 3.04 回落 0.2
        if (vx < 3) { if (vx < -0.2) vx += 0.2; vx += 0.08; }
        else { vx -= 0.2; }
        vy = Math.min(vy + GRAVITY, MAX_FALL_SPEED);
        const vxIn = vx, vyIn = vy, xIn = b.x, feetIn = b.y + b.h;
        moveAndCollide(b, world, vx, vy);
        if (b.vx === 0 && vxIn > 1) events++;
        trace.push(`t${t} vxIn=${vxIn.toFixed(2)} xIn=${xIn.toFixed(1)} feetIn=${feetIn.toFixed(1)} → x=${b.x.toFixed(1)} feet=${(b.y + b.h).toFixed(1)} vx=${b.vx.toFixed(2)} vy=${b.vy.toFixed(2)} g=${b.onGround ? 1 : 0} hw=${b.hitWall ? 1 : 0}`);
        vx = b.vx; vy = b.vy;
        if (b.x > X1) break;
      }
      // 找 vx 突降事件上下文
      const hit = trace.filter(l => / vx=0\.00 /.test(l) || / vx=0\.0[0-9] /.test(l));
      runs.push(`run${run}: 事件=${events} 终x=${(b.x / TILE).toFixed(2)}\n` + hit.slice(0, 8).join('\n'));
    }
    console.log(runs.join('\n\n'));
  });
});
