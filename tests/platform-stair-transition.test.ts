// ★一次性:平台阶梯交替处行走回放(真实存档地形)
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSave } from '../src/save/SaveFile';
import { moveAndCollide } from '../src/physics/TileCollision';
import { ENEMY_GRAVITY, MAX_FALL_SPEED, TILE, GRAVITY } from '../src/core/constants';

describe('平台阶梯交替处不坠落（2026-09-01 用户存档 3222-3223/275 定案）', () => {
  /** 结构 = 双向 45° 平台锤坡阶梯夹平台顶（左 (3221,276) 阶梯、右 (3227,276) 阶梯、
   *  顶台 (3222,275)斜坡+3223-3227 平平台）。病症 = 玩家站上顶斜坡(3222,275)后
   *  坠落 4 格：平平台坡支 num4 以缘进深判定，右缘越格(num4<0)即跳过 + 邻接
   *  平平台着陆门槛(≤top+1)差 0.6px 边界失败 → 两侧都撒手。修 = 沉深门：脚沉
   *  入 vy0 ≤8px（坡顶过渡带）时钳 0 支持，深陷（竖柱里侧）维持原版跳过。 */
  it('站上顶斜坡不坠落、向右平滑登顶', () => {
    const { world } = loadSave(readFileSync('/Users/vinlic/Downloads/map-Starter_World (26).json', 'utf8'));
    const b = {
      x: 3222.4 * TILE, y: 4401.6 - 42,
      w: 20, h: 42,
      vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false,
      collideY: false, stepUp: true, stepUpHolds: true, stepUpNpc: true,
      liqFactor: 1,
    } as unknown as Parameters<typeof moveAndCollide>[0];
    let maxSink = 0, fell = false;
    for (let t = 0; t < 120; t++) {
      b.vx = t < 60 ? 0 : 1.4;   // 前 60t 站定(用户场景:停在交替处),之后向右
      b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b, world, b.vx, b.vy);
      if (!b.onGround) fell = true;
      maxSink = Math.max(maxSink, Math.abs(b.y - (4401.6 - 42)));
    }
    if (fell) throw new Error(`交替处坠落复发 maxSink=${maxSink.toFixed(1)}`);
    if (b.x < 3227 * TILE) throw new Error(`未走完顶台 x=${(b.x / TILE).toFixed(2)}`);
  });

  it('从左阶梯向上行走全程登顶（行走链路回归）', () => {
    const { world } = loadSave(readFileSync('/Users/vinlic/Downloads/map-Starter_World (26).json', 'utf8'));
    const b = {
      x: 3212 * TILE, y: 282 * TILE - 42,
      w: 20, h: 42,
      vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false,
      collideY: false, stepUp: true, stepUpHolds: true, stepUpNpc: true,
      liqFactor: 1,
    } as unknown as Parameters<typeof moveAndCollide>[0];
    let airStreak = 0, maxAir = 0;
    for (let t = 0; t < 240; t++) {
      b.vx = 1.4;
      b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b, world, b.vx, b.vy);
      if (!b.onGround) { airStreak++; maxAir = Math.max(maxAir, airStreak); } else airStreak = 0;
      if (b.y + b.h > 283.6 * TILE && t > 30) throw new Error(`阶梯中段落回 feet=${((b.y + b.h) / TILE).toFixed(2)}`);
      if (b.x > 3228 * TILE) break;
    }
    if (b.x < 3227 * TILE) throw new Error(`未登顶 x=${(b.x / TILE).toFixed(2)}`);
    void maxAir;
  });
});
