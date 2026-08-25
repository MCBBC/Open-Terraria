// 矿车转角矩阵回归：用游戏自己的铺轨器(placeTrack+frameTrackArea)造布局,
// trackCollision 纯函数驱动矿车,检测"特殊转角卡死"(用户实报 2026-08-25)。
// 卡死判定:在轨且前方轨道延续,但 vx 归零/位置多 tick 不前进。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import {
  placeTrack, frameTrackArea, trackCollision, TRACK_TILE,
  FLAG_ON_TRACK,
} from '../src/world/MinecartTrack';
import type { TileStore } from '../src/world/TileStore';

const W = 80, H = 60;

function makeWorld(): World {
  return new World(W, H, 7, 'cart');
}

/** 铺一条轨道:cells = [x,y][];逐格 placeTrack+邻域定型(=玩家真实铺法) */
function lay(st: TileStore, cells: Array<[number, number]>, style = 0): void {
  for (const [x, y] of cells) placeTrack(st, x, y, style);
  for (const [x, y] of cells) frameTrackArea(st, x, y);
}

interface DriveResult {
  stuck: boolean;
  stuckTick: number;
  endX: number;
  framesOnTrack: number;
}

/** 驱动矿车:每 tick trackCollision + 积分(=Minecart.fixedUpdate 在轨分支)。
 *  stuck = 在轨状态下连续 30 tick 位移 < 0.05(前方有轨却不动弹) */
function drive(st: TileStore, sx: number, sy: number, vx0: number, ticks = 900): DriveResult {
  const r = { x: sx, y: sy, vx: vx0, vy: 0, lastBoostX: 0, lastBoostY: 0 };
  const w = 20, h = 42;
  let stuckRun = 0;
  let lastX = r.x;
  let stuckTick = -1;
  let framesOnTrack = 0;
  for (let i = 0; i < ticks; i++) {
    const bits = trackCollision(st, r, w, h, false, false, 0, false, {});
    const onTrack = !!(bits & (1 << FLAG_ON_TRACK));
    if (onTrack) {
      framesOnTrack++;
      r.x += r.vx;
      r.y += r.vy;
      if (Math.abs(r.x - lastX) < 0.05 && Math.abs(r.vx) < 0.05) {
        stuckRun++;
        if (stuckRun >= 30 && stuckTick < 0) stuckTick = i;
      } else {
        stuckRun = 0;
      }
    } else {
      stuckRun = 0;
      // 脱轨窗口:重力+落地(简化:贴回轨面由 trackCollision 下 tick 吸回)
      r.vy = Math.min(r.vy + 0.4, 10);
      r.x += r.vx;
      r.y += r.vy;
    }
    lastX = r.x;
    if (stuckTick >= 0) break;
  }
  return { stuck: stuckTick >= 0, stuckTick, endX: r.x, framesOnTrack };
}

describe('矿车转角矩阵(placeTrack+frameTrackArea 真实铺轨产物)', () => {
  it('基准:平直轨道通行', () => {
    const w = makeWorld();
    const st = w.store;
    const R = 30;
    lay(st, Array.from({ length: 20 }, (_, i) => [20 + i, R] as [number, number]));
    const r = drive(st, 20 * 16 + 8, R * 16 - 20, 3);
    expect(r.stuck, `平直轨卡死 tick=${r.stuckTick}`).toBe(false);
  });

  const shapes: Array<[string, Array<[number, number]>]> = [
    // 上折角:平走 → 转向上(竖列)
    ['L转上', [...Array.from({ length: 8 }, (_, i) => [20 + i, 30] as [number, number]),
      ...Array.from({ length: 6 }, (_, i) => [28, 29 - i] as [number, number])]],
    // 下折角:高位平走 → 转向下
    ['L转下', [...Array.from({ length: 6 }, (_, i) => [28, 24 - i] as [number, number]),
      ...Array.from({ length: 8 }, (_, i) => [28 + i, 24 - 5] as [number, number]).map(([x]) => [x, 25] as [number, number])]],
    // 山丘:上斜-顶-下斜(对角 8/9 系)
    ['山丘对角', [...Array.from({ length: 6 }, (_, i) => [20 + i, 30] as [number, number]),
      ...Array.from({ length: 4 }, (_, i) => [26 + i, 29 - i] as [number, number]),
      ...Array.from({ length: 4 }, (_, i) => [30 + i, 26 + i] as [number, number]),
      ...Array.from({ length: 6 }, (_, i) => [34 + i, 30] as [number, number])]],
    // 谷:下斜-底-上斜
    ['谷', [...Array.from({ length: 5 }, (_, i) => [20 + i, 26 - i] as [number, number]),
      ...Array.from({ length: 4 }, (_, i) => [25 + i, 22] as [number, number]),
      ...Array.from({ length: 5 }, (_, i) => [29 + i, 23 + i] as [number, number])]],
    // 单阶台:平-升一格-平
    ['单阶升', [...Array.from({ length: 6 }, (_, i) => [20 + i, 30] as [number, number]),
      ...Array.from({ length: 6 }, (_, i) => [26 + i, 29] as [number, number])]],
    // 半坡包(4/5 系短丘)
    ['半坡丘', [...Array.from({ length: 6 }, (_, i) => [20 + i, 30] as [number, number]),
      ...Array.from({ length: 2 }, (_, i) => [26 + i, 29] as [number, number]),
      ...Array.from({ length: 6 }, (_, i) => [28 + i, 30] as [number, number])]],
  ];

  for (const [name, cells] of shapes) {
    it(`${name}:双向通行不卡死`, () => {
      const w = makeWorld();
      const st = w.store;
      lay(st, cells);
      const xs = cells.map((c) => c[0]);
      const ys = cells.map((c) => c[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const left = cells.find((c) => c[0] === minX)!;
      const right = cells.find((c) => c[0] === maxX)!;
      const fwd = drive(st, minX * 16 + 8, left[1] * 16 - 20, 3);
      expect(fwd.stuck, `${name} 右行卡死 tick=${fwd.stuckTick} endX=${fwd.endX}`).toBe(false);
      const back = drive(st, maxX * 16 + 8, right[1] * 16 - 20, -3);
      expect(back.stuck, `${name} 左行卡死 tick=${back.stuckTick} endX=${back.endX}`).toBe(false);
    });
  }
});

void TRACK_TILE;
