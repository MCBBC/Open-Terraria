// 矿车转角驾驶回归:带地形的真实布局(矿洞轨道嵌地+转角台阶),驱动矿车检测卡死。
// 用户实报"特殊转角轨道矿车卡住不动弹"(2026-08-25)。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import {
  placeTrack, frameTrackArea, trackCollision,
  FLAG_ON_TRACK,
} from '../src/world/MinecartTrack';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';

const DIRT = TILE_BY_KEY['dirt']!;

function makeWorld(): World {
  return new World(80, 60, 7, 'cartdrive');
}

function lay(st: TileStore, cells: Array<[number, number]>, style = 0): void {
  for (const [x, y] of cells) placeTrack(st, x, y, style);
  for (const [x, y] of cells) frameTrackArea(st, x, y);
}

function fill(st: TileStore, x0: number, y0: number, x1: number, y1: number): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) st.setTile(x, y, DIRT, 0, 0);
}

function drive(
  st: TileStore, sx: number, sy: number, vx0: number, targetX: number, ticks = 1200,
): { stuck: boolean; stuckTick: number; endX: number; endY: number } {
  const r = { x: sx, y: sy, vx: vx0, vy: 0, lastBoostX: 0, lastBoostY: 0 };
  const w = 20, h = 42;
  const dir = Math.sign(vx0);
  let stuckRun = 0;
  let lastX = r.x;
  let stuckTick = -1;
  for (let i = 0; i < ticks; i++) {
    r.vy = Math.min(r.vy + 0.4, 10);
    const bits = trackCollision(st, r, w, h, false, false, 0, false, {});
    const onTrack = !!(bits & (1 << FLAG_ON_TRACK));
    r.x += r.vx;
    r.y += r.vy;
    // ★Minecart.ts 贴墙探针 1:1(转角卡死头号嫌疑:转角爬升中途 feet 格=台阶实心)
    if (onTrack && r.vx !== 0) {
      const headX = Math.floor((r.x + w / 2 + Math.sign(r.vx) * w / 2) / 16);
      const feetY = Math.floor((r.y + h - 4) / 16);
      if (st.inBounds(headX, feetY) && st.isSolid(headX, feetY)) {
        r.x -= r.vx;
        r.vx = 0;
      }
    }
    if (dir > 0 ? r.x >= targetX : r.x <= targetX) return { stuck: false, stuckTick: -1, endX: r.x, endY: r.y };
    if (onTrack) {
      if (Math.abs(r.x - lastX) < 0.05 && Math.abs(r.vx) < 0.05) {
        stuckRun++;
        if (stuckRun >= 30) { stuckTick = i; break; }
      } else stuckRun = 0;
    } else stuckRun = 0;
    lastX = r.x;
  }
  return { stuck: stuckTick >= 0, stuckTick, endX: r.x, endY: r.y };
}

describe('矿车转角驾驶(带地形)', () => {
  it('开放空间单阶升:通行', () => {
    const w = makeWorld();
    const st = w.store;
    lay(st, [
      ...Array.from({ length: 8 }, (_, i) => [20 + i, 30] as [number, number]),
      ...Array.from({ length: 8 }, (_, i) => [28 + i, 29] as [number, number]),
    ]);
    const r = drive(st, 20 * 16 - 2, 30 * 16 - 42, 3, 34 * 16);
    expect(r.stuck, `卡死 tick=${r.stuckTick} end=(${r.endX.toFixed(0)},${r.endY.toFixed(0)})`).toBe(false);
  });

  it('嵌地单阶升:转角台阶带实心地形(矿洞常态) → 应通行(原版转角先抬升再进柱)', () => {
    const w = makeWorld();
    const st = w.store;
    // 轨道:平(R=30) → 角(28,29) → 平(R=29)
    lay(st, [
      ...Array.from({ length: 8 }, (_, i) => [20 + i, 30] as [number, number]),
      [28, 29],
      ...Array.from({ length: 8 }, (_, i) => [29 + i, 29] as [number, number]),
    ]);
    // 地形:高侧地表从 x=29 起抬到 R-1 行(即轨道下方与侧方全是实心),
    // 角格正下 (28,30) 挖空(玩家铺角必挖的袋位),角格本身非实心
    fill(st, 28, 31, 40, 34);          // 低侧地基
    fill(st, 29, 30, 40, 30);          // 高侧台阶(角后实心,高轨嵌地)
    st.setTile(28, 30, 0, 0, 0);       // 角下袋位
    const r = drive(st, 20 * 16 - 2, 30 * 16 - 42, 3, 34 * 16);
    expect(r.stuck, `嵌地升阶卡死 tick=${r.stuckTick} end=(${r.endX.toFixed(0)},${r.endY.toFixed(0)})`).toBe(false);
  });

  it('贴墙平轨:正前方实心墙 → 允许急停(原版同;非卡死语义)', () => {
    const w = makeWorld();
    const st = w.store;
    lay(st, Array.from({ length: 10 }, (_, i) => [20 + i, 30] as [number, number]));
    fill(st, 30, 28, 30, 30);          // 轨道正前方立墙
    const r = drive(st, 20 * 16 - 2, 30 * 16 - 42, 3, 40 * 16);
    expect(r.stuck, '撞墙应停但不算异常').toBe(true);
  });
});
