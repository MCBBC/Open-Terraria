// 方向不对称取证:新代码 vs 昨日旧代码(xPre 并集窗前),两结构两方向
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSave } from '../src/save/SaveFile';
import { moveAndCollide } from '../src/physics/TileCollision';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../src/core/constants';

describe('方向不对称', () => {
  it('双结构双向×新旧代码', () => {
    const { world } = loadSave(readFileSync('/Users/vinlic/Downloads/map-Starter_World (26).json', 'utf8'));
    const mk = (xt: number, fp: number) => ({
      x: xt * TILE, y: fp - 42, w: 20, h: 42,
      vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
      collideY: false, stepUp: true, stepUpHolds: false, stepUpNpc: true,
      liqFactor: 1,
    } as unknown as Parameters<typeof moveAndCollide>[0]);
    const run = (tag: string, startX: number, feetPx: number, dirSpd: number, stopX: [number, number]) => {
      const b = mk(startX, feetPx);
      let air = 0, total = 0;
      const spots: string[] = [];
      for (let t = 0; t < 240; t++) {
        b.vx = dirSpd;
        b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);
        moveAndCollide(b, world, b.vx, b.vy);
        if (!b.onGround) { air++; total++; if (!spots.length || spots[spots.length - 1].includes('G@')) spots.push(`t${t}@x${(b.x / TILE).toFixed(1)} `); }
        else { if (air) spots[spots.length - 1] += `(${air}帧到ft${((b.y + b.h) / TILE).toFixed(1)})`; air = 0; }
        if (b.x / TILE < stopX[0] || b.x / TILE > stopX[1]) break;
      }
      console.log(`${tag}: 空中总帧=${total} 漏点位=[${spots.join(' ')}]`);
    };
    for (const spd of [2.6, 3.0]) {
      console.log(`\n===== 当前代码 =====`);
      run(`左L→R spd${spd}`, 3161, 275 * TILE, spd, [-999, 3196]);
      run(`右R→L spd${spd}`, 3232, 275 * TILE, -spd, [3160, 3242]);
      // 从平台岛中段起始的纯下行经过点1/2 的短程
      run(`左岛→右下 spd${spd}`, 3169, 275 * TILE, spd, [-999, 3196]);
    }
  });
});
