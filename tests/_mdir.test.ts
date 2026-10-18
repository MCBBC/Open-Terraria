import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readLocalFixtureText, localFixtureMissing } from './fixturePath';
import { loadSave } from '../src/save/SaveFile';
import { moveAndCollide } from '../src/physics/TileCollision';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../src/core/constants';

describe.skipIf(localFixtureMissing('starter-map-26.json'))('双向基线', () => {
  it('左结构L→R 与 右结构R→L', () => {
    const { world } = loadSave(readLocalFixtureText('starter-map-26.json'));
    const mk = (xt: number, fp: number) => ({
      x: xt * TILE, y: fp - 42, w: 20, h: 42,
      vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
      collideY: false, stepUp: true, stepUpHolds: false, stepUpNpc: true,
      liqFactor: 1,
    } as unknown as Parameters<typeof moveAndCollide>[0]);
    const run = (tag: string, b: ReturnType<typeof mk>, spd: number, stopX: [number, number]) => {
      let air = 0, maxAir = 0;
      const segs: string[] = [];
      for (let t = 0; t < 220; t++) {
        b.vx = spd;
        b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);
        moveAndCollide(b, world, b.vx, b.vy);
        const tx = b.x / TILE, ft = (b.y + b.h) / TILE;
        if (!b.onGround) { air++; if (!segs.length || !segs[segs.length - 1].endsWith(' ongoing')) segs.push(`t${t} AIR开始 x${tx.toFixed(2)} ft${ft.toFixed(2)}`); }
        else { if (air) segs.push(` ↑${air}帧 landing ft${ft.toFixed(2)} x${tx.toFixed(2)}`); air = 0; }
        maxAir = Math.max(maxAir, air);
        if (tx < stopX[0] || tx > stopX[1]) break;
      }
      console.log(`${tag}: maxAir=${maxAir}` + (segs.length ? '\n  ' + segs.join('\n  ') : ' 全程无空中'));
    };
    // 左结构 L→R:从左侧实心顶下踏板链进入走廊再到右端
    run('左 L→R spd2.6', mk(3161, 275 * TILE), 2.6, [-999, 3196]);
    // 右结构 R→L:从大实心顶(x3232+)向左踏上(3227,275)p2 链下行
    run('右 R→L spd2.6', mk(3232, 275 * TILE), -2.6, [3160, 3242]);
  });
});
