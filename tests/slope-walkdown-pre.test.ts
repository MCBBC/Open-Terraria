// WalkDownSlope 预备阶段（Collision.cs:1691-1795 全量移植）对角线跟随质量回归。
// 判例：旧"速度辅助"只查身体中心列 = 其残缺尾巴(:1776-1794)，缺 ：1696 活性门与
// 全宽落面扫描 → 步入下行坡首帧 X 先走 Y 未跟上，脚悬空被轴后贴合拽回 =
// 用户实测"角色阻尼滑入斜坡地形"。全量移植后下行沿对角线同帧同步。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { World } from '../src/world/World';
import { moveAndCollide, setWalkDownPre } from '../src/physics/TileCollision';
import { TILE_BY_KEY } from '../src/data/tiles';

const TILE = 16;
const DIRT = TILE_BY_KEY['dirt']!;
const TOPROW = 24;

/** 连续地形：底部平地(cols20..38,行39) → slope2 链 15 格向右上(x39..53,+1行/格)
 *  → 高台平地(x54..70,行24)。无断崖无缝。 */
function makeWorld(): World {
  const store = new TileStore(90, 60);
  // 高台
  for (let x = 54; x <= 70; x++) { store.setTile(x, TOPROW, DIRT); }
  for (let x = 54; x <= 70; x++) { store.setTile(x, TOPROW + 1, DIRT); }
  // 链:x=53-k, 行=TOPROW+k, k=0..14;slope2 每格含首尾
  for (let k = 0; k <= 14; k++) {
    const x = 53 - k, y = TOPROW + k;
    store.setTile(x, y, DIRT);
    store.setSlope(x, y, 2);
    for (let yy = y + 1; yy <= TOPROW + 18; yy++) store.setTile(x, yy, DIRT);
  }
  // 底部平地
  for (let x = 20; x <= 38; x++) {
    store.setTile(x, TOPROW + 15, DIRT);
    for (let yy = TOPROW + 16; yy <= TOPROW + 17; yy++) store.setTile(x, yy, DIRT);
  }
  return { store, w: 90, h: 60 } as unknown as World;
}

interface B { x: number; y: number; w: number; h: number; vx: number; vy: number;
  onGround: boolean; hitWall: boolean; hitHead: boolean; collideY?: boolean;
  stepUp?: boolean; stepUpHolds?: boolean }

function settle(b: B, world: World, sx: number, syRow: number): void {
  b.x = sx; b.y = syRow * TILE - 42; b.vx = 0; b.vy = 0;
  for (let t = 0; t < 40; t++) { b.vy = Math.min(8, b.vy + 0.35);
    moveAndCollide(b as never, world, b.vx, b.vy); }
}

function walk(b: B, world: World, dir: number, ticks: number, haltAtX?: [number, number]) {
  let prevFeet = b.y + b.h, prevX = b.x;
  let maxSink = 0, air = 0, nMove = 0;
  for (let t = 0; t < ticks; t++) {
    if (haltAtX && (b.x >= haltAtX[0] || b.x <= haltAtX[1])) break;
    b.vx = dir; b.vy = Math.min(8, b.vy + 0.35);
    moveAndCollide(b as never, world, b.vx, b.vy);
    const dx = Math.abs(b.x - prevX), dFeet = (b.y + b.h) - prevFeet;
    if (dx > 0.4) {
      nMove++;
      if (!b.onGround) air++;
      if (dFeet > dx) maxSink = Math.max(maxSink, dFeet - dx);
    }
    prevFeet = b.y + b.h; prevX = b.x;
  }
  return { maxSink: +maxSink.toFixed(2), air, nMove, endX: +b.x.toFixed(1),
    feet: +(b.y + b.h).toFixed(1) };
}

const ENTER_CHAIN = 20;   // 平台起步后进入链区的帧数不计指标

describe('WalkDownSlope 预备阶段：下行对角线跟随', () => {
  it('开启后下行全程零悬空、单帧下坠超调 ≤1.6px（重力残差量级）', () => {
    const world = makeWorld();
    const b: B = { x: 0, y: 0, w: 20, h: 42, vx: 0, vy: 0,
      onGround: false, hitWall: false, hitHead: false, collideY: false,
      stepUp: true, stepUpHolds: true };
    settle(b, world, 62 * TILE, TOPROW);
    setWalkDownPre(true);
    for (let t = 0; t < ENTER_CHAIN; t++) { b.vx = -1; b.vy = Math.min(8, b.vy + 0.35);
      moveAndCollide(b as never, world, b.vx, b.vy); }
    const r = walk(b, world, -1, 400, undefined);
    expect(r.nMove).toBeGreaterThan(150);          // 确认整程在走而非卡死
    // 入链首帧允许 1 帧过渡腾空(vanilla 同款边界相);持续跳坡=旧阻尼病根禁回归
    expect(r.air).toBeLessThanOrEqual(1);
    expect(r.maxSink).toBeLessThanOrEqual(1.6);     // 跨缝大坠清零
  });

  it('开关对照：开启的沉浮指标不劣于关闭（防将来劣化不自知的护栏）', () => {
    const results: Record<string, ReturnType<typeof walk>> = {};
    for (const wd of ['on', 'off'] as const) {
      const world = makeWorld();
      const b: B = { x: 0, y: 0, w: 20, h: 42, vx: 0, vy: 0,
        onGround: false, hitWall: false, hitHead: false, collideY: false,
        stepUp: true, stepUpHolds: true };
      settle(b, world, 62 * TILE, TOPROW);
      setWalkDownPre(wd === 'on');
      for (let t = 0; t < ENTER_CHAIN; t++) { b.vx = -1; b.vy = Math.min(8, b.vy + 0.35);
        moveAndCollide(b as never, world, b.vx, b.vy); }
      results[wd] = walk(b, world, -1, 400);
    }
    // 打点留档（vitest 收集期输出，便于日后核对两档真实差距）
    console.log('[wd-a/b] on:', results.on, 'off:', results.off);
    expect(results.on.nMove).toBeGreaterThan(150);
    expect(results.on.air).toBeLessThanOrEqual(results.off.air);
    expect(results.on.maxSink).toBeLessThanOrEqual(results.off.maxSink + 0.01);
  });

  it('straddle 入口判别：身体右缘先压上首坡列时新阶段立即跟随（全宽扫描语义）', () => {
    // 旧中心列辅助须等身体中点跨入坡列（w/2 后）才补偿,起步段存在无补偿窗口;
    // 新阶段自第一帧即识别（vanilla :1698 全宽 [x..x+w] 扫描）。
    const world = makeWorld();
    // 起位:身体右缘距首坡列(x53)左缘还差 12px 处站立于高台面 → 左行第 1 帧即跨界
    const startX = 53 * TILE - 12 - 20 + 20 + 0.01;   // 身体右缘恰在 x=53*16 边缘外一线
    const results: Record<string, { sinkFirst8: number; airFirst8: number }> = {};
    for (const wd of ['on', 'off'] as const) {
      const b2: B = { x: 0, y: 0, w: 20, h: 42, vx: 0, vy: 0,
        onGround: false, hitWall: false, hitHead: false, collideY: false,
        stepUp: true, stepUpHolds: true };
      settle(b2, world, startX, TOPROW);
      setWalkDownPre(wd === 'on');
      let prevFeet = b2.y + b2.h, prevX = b2.x;
      let sinkFirst8 = 0, airFirst8 = 0;
      for (let t = 0; t < 8; t++) {
        b2.vx = -1; b2.vy = Math.min(8, b2.vy + 0.35);
        moveAndCollide(b2 as never, world, b2.vx, b2.vy);
        const dx = Math.abs(b2.x - prevX);
        const dFeet = (b2.y + b2.h) - prevFeet;
        if (dx > 0.4 && !b2.onGround) airFirst8++;
        if (dFeet > dx) sinkFirst8 += dFeet - dx;
        prevFeet = b2.y + b2.h; prevX = b2.x;
      }
      results[wd] = { sinkFirst8: +sinkFirst8.toFixed(2), airFirst8 };
    }
    console.log('[wd-straddle] on:', results.on, 'off:', results.off);
    expect(results.on.sinkFirst8).toBeLessThanOrEqual(
      results.off.sinkFirst8 === 0 ? 0.001 : results.off.sinkFirst8);
    expect(results.on.airFirst8).toBeLessThanOrEqual(results.off.airFirst8);
  });

  it('上行爬升贯通链顶不被新增阶段干扰', () => {
    const world = makeWorld();
    const b: B = { x: 0, y: 0, w: 20, h: 42, vx: 0, vy: 0,
      onGround: false, hitWall: false, hitHead: false, collideY: false,
      stepUp: true, stepUpHolds: true };
    settle(b, world, 26 * TILE, TOPROW + 15);
    setWalkDownPre(true);
    walk(b, world, 1, 600, [66 * TILE, Number.NEGATIVE_INFINITY]);   // 到台即停,不冲出世界
    expect(b.x).toBeGreaterThanOrEqual(55 * TILE);                   // 已翻上高台
    expect(Math.abs((b.y + b.h) - TOPROW * TILE)).toBeLessThanOrEqual(4);
  });
});
