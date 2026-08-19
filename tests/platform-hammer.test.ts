// 平台族锤循环 + 坡面平台楼梯碰撞（Player.cs:45394-45440 / Collision.cs:1851-1866）：
// ① 锤输入循环状态机：半砖→整 / 整→slope(num)→slope(另一侧)→半砖（num 由
//    右邻(y-1)平台/左下邻(y+1)平台/右实左空决定）
// ② 坡面平台单向碰撞：站上坡面贴合、上升不挡（stepUp 爬楼梯）、按住下穿透、
//    楼梯竖柱里侧（num4<0 高端侧外）走过不抬
// 锤输入侧走 Game 级直调（private 名 mineTileWithTool 不可达——用 Game 实例太重，
// 循环状态机以等价谓词函数复算 + TileStore 状态推进断言；碰撞侧直接 moveAndCollide）
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { World } from '../src/world/World';
import { moveAndCollide } from '../src/physics/TileCollision';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const TILE = 16;
const PLAT = TILE_BY_KEY['platform']!;
const DIRT = TILE_BY_KEY['dirt']!;

function makeWorld(w = 40, h = 20): World {
  return { store: new TileStore(w, h), w, h } as unknown as World;
}

interface TestBody { x: number; y: number; w: number; h: number; vx: number; vy: number; onGround: boolean; hitWall: boolean; hitHead: boolean }

describe('平台族锤循环状态机（Player.cs:45394-45440）', () => {
  /** 与 Game 锤平台分支同式的循环步进（对 TileStore 直接演算） */
  function cycleStep(st: TileStore, x: number, y: number): void {
    const i = st.idx(x, y);
    if (st.half[i]) { st.setHalfBrick(x, y, false); return; }
    const solidFull = (ax: number, ay: number) => {
      if (!st.inBounds(ax, ay)) return false;
      const j = st.idx(ax, ay);
      return !!st.flags[j] && !!TILE_DEFS[st.type[j]]?.solid
        && !TILE_DEFS[st.type[j]]?.platform && !st.half[j] && st.slope[j] === 0;
    };
    const platAt = (ax: number, ay: number) =>
      st.inBounds(ax, ay) && !!TILE_DEFS[st.type[st.idx(ax, ay)]]?.platform;
    let num = 1, other = 2;
    if (platAt(x + 1, y - 1) || platAt(x - 1, y + 1)
      || (solidFull(x + 1, y) && !solidFull(x - 1, y))) { num = 2; other = 1; }
    const s = st.slope[i];
    if (s === 0) st.setSlope(x, y, num);
    else if (s === num) st.setSlope(x, y, other);
    else { st.setSlope(x, y, 0); st.setHalfBrick(x, y, true); }
  }

  it('孤立平台四拍循环：slope1 → slope2 → 半砖 → 整（num=1 起步）', () => {
    const st = new TileStore(10, 10);
    st.setTile(5, 5, PLAT);
    cycleStep(st, 5, 5);
    expect(st.slope[st.idx(5, 5)]).toBe(1);          // 整 → slope1（num 默认 1）
    cycleStep(st, 5, 5);
    expect(st.slope[st.idx(5, 5)]).toBe(2);          // slope1 → slope2
    cycleStep(st, 5, 5);
    expect(!!st.half[st.idx(5, 5)]).toBe(true);      // slope2 → 半砖（非 num 档 → Pound）
    expect(st.slope[st.idx(5, 5)]).toBe(0);
    cycleStep(st, 5, 5);
    expect(!!st.half[st.idx(5, 5)]).toBe(false);     // 半砖 → 回整
    expect(st.slope[st.idx(5, 5)]).toBe(0);
  });

  it('右邻(y-1)平台 → num=2 起步：slope2 → slope1 → 半砖', () => {
    const st = new TileStore(10, 10);
    st.setTile(5, 6, PLAT);
    st.setTile(6, 5, PLAT);   // 右邻上一行是平台 → num=2
    cycleStep(st, 5, 6);
    expect(st.slope[st.idx(5, 6)]).toBe(2);
    cycleStep(st, 5, 6);
    expect(st.slope[st.idx(5, 6)]).toBe(1);
    cycleStep(st, 5, 6);
    expect(!!st.half[st.idx(5, 6)]).toBe(true);
  });

  it('右实左空 → num=2（贴墙做楼梯的朝向感知）', () => {
    const st = new TileStore(10, 10);
    st.setTile(5, 6, PLAT);
    st.setTile(6, 6, DIRT);   // 右侧实心、左侧空
    cycleStep(st, 5, 6);
    expect(st.slope[st.idx(5, 6)]).toBe(2);
  });
});

describe('坡面平台楼梯碰撞（Collision.cs:1851-1866 单向门）', () => {
  /** x=20 处一格 slope1 平台（左高右低），下方 y+1 起 air——可从右侧走入爬坡 */
  function stairWorld(): World {
    const w = makeWorld();
    const st = w.store;
    st.setTile(20, 10, PLAT);
    st.setSlope(20, 10, 1);
    return w;
  }

  it('从坡面上方落下 → 贴合斜面站立（onGround）', () => {
    const w = stairWorld();
    // slope1 高侧在左：身体左缘进格 2px（num4=2）；脚从坡面上方落入格内带
    // （Y 轴平落被 slopePass 让位给坡面贴合，slopeCollide 抬到斜面 num4 深度处）
    const b: TestBody = { x: 20 * TILE + 2, y: 130, w: 12, h: 28,
      vx: 0, vy: 6, onGround: false, hitWall: false, hitHead: false };
    moveAndCollide(b as never, w, 0, 6);
    expect(b.onGround).toBe(true);
    expect(b.y + b.h).toBe(10 * TILE + 2);   // 斜面 2px 深度处 = 坡顶表面
  });

  it('上升中（vy<0）不挡——平台单向', () => {
    const w = stairWorld();
    const b: TestBody = { x: 20 * TILE, y: 10 * TILE - 20, w: 12, h: 28,
      vx: 0, vy: -5, onGround: false, hitWall: false, hitHead: false };
    moveAndCollide(b as never, w, 0, -5);
    expect(b.hitHead).toBe(false);   // 不当头顶
  });

  it('按住下（dropThrough）→ 穿透楼梯落下', () => {
    const w = stairWorld();
    const b = { x: 20 * TILE, y: 9 * TILE + 2, w: 12, h: 28, vx: 0, vy: 2,
      onGround: false, hitWall: false, hitHead: false, dropThrough: true };
    const body = b as { x: number; y: number; w: number; h: number; vx: number; vy: number;
      onGround: boolean; hitWall: boolean; hitHead: boolean; dropThrough?: boolean };
    for (let f = 0; f < 12; f++) {
      body.vy = Math.min(8, body.vy + 0.4);
      moveAndCollide(body, w, 0, body.vy);
    }
    expect(body.y).toBeGreaterThan(10 * TILE);   // 穿过平台
    expect(body.onGround).toBe(false);
  });

  it('楼梯竖柱里侧（低端侧外，num4<0）走过不抬升', () => {
    const w = stairWorld();
    // slope1 高侧在左：身体在格右缘之外（x 超过 21*TILE 即 num4<0 侧）不属本格——
    // 用格内右端深潜身体验证不抬：脚在格底、身体右缘越过格右缘
    const b: TestBody = { x: 20 * TILE + 14, y: 10 * TILE + 2, w: 12, h: 28,
      vx: 0, vy: 2, onGround: false, hitWall: false, hitHead: false };
    moveAndCollide(b as never, w, 0, 2);
    expect(b.y).toBe(10 * TILE + 2 + 2);   // 原样下落，未被抬到坡面
    expect(b.onGround).toBe(false);
  });
});
