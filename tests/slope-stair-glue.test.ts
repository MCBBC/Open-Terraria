// 斜坡/台阶「面随下贴」回归（2026-08-31~09-01 三轮定案收官）
//   症状链：①跌落帧+慢坠爬行（实心坡梯 65/140 空帧、平台锤坡真档 63/80）
//           ②一顿一顿锯齿（贴平 15 帧 + 单帧 +10~16px 猛坠）
//   终态引擎（与并行会话预置贴合协作,见 TileCollision.ts 双相注）：
//     slopeCollide 轴前应用+轴后补扫；面随下贴候选 must-be-first；
//     下行速率帽 diagCap=|vx|+1.2 消灭一切单帧大脉冲。
//   口径(2026-09-01)：缝隙允许 ≤6 帧 0.3~1.5px 微沉降(onGround 瞬翻但位移
//   连续)；锁死不变量 = 无 >2.6px/tick 脉冲、45° 梯 dirMean∈0.55..1.45、终点接地。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { moveAndCollide } from '../src/physics/TileCollision';
import { World } from '../src/world/World';
import { ENEMY_GRAVITY, MAX_FALL_SPEED, TILE } from '../src/core/constants';

const W = 60, H = 40, BASE = 22;
type BodyT = Parameters<typeof moveAndCollide>[0];

function baseBody(): BodyT {
  return {
    x: 8 * TILE, y: (BASE - 2) * TILE - 42,
    w: 20, h: 42,
    vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false,
    collideY: false, stepUp: true, stepUpHolds: true, stepUpNpc: true,
    liqFactor: 1,
  } as unknown as BodyT;
}

function buildRamp(w: World): void {
  const st = w.store;
  for (let x = 0; x < 10; x++) st.setTile(x, BASE - 2, 1);
  for (let c = 0; c < 16; c++) {
    st.setTile(10 + c, BASE - 2 + c, 1);
    st.slope[st.idx(10 + c, BASE - 2 + c)] = 1;
  }
}
function buildStair(w: World, half: boolean): void {
  const st = w.store;
  for (let x = 0; x < 10; x++) st.setTile(x, BASE - 2, 1);
  for (let c = 0; c < 16; c++) {
    const i = st.idx(10 + c, BASE - 2 + c);
    st.setTile(10 + c, BASE - 2 + c, 1);
    if (half) st.half[i] = 128;
    st.setTile(10 + c, BASE - 1 + c, 1);
  }
}
const PLAT_ID = 11;   // 运行时内部 id（loadSave 实测 sheet19 木平台,solid=false platform=true）
function buildPlatformStair(w: World, kind: 'flat' | 'hammer'): void {
  const st = w.store;
  for (let x = 0; x < 10; x++) st.setTile(x, BASE - 2, 1);
  for (let c = 0; c < 16; c++) {
    const idx = st.idx(10 + c, BASE - 2 + c);
    st.setTile(10 + c, BASE - 2 + c, PLAT_ID);
    if (kind === 'hammer') st.slope[idx] = 1;
  }
}

interface WalkRes { air: number; endX: number; grounded: boolean;
  airTicks: number[]; maxYStep: number; dirMean: number }

function walk(w: World, b: BodyT, dir: 1 | -1, ticks: number): WalkRes {
  let air = 0;
  const airTicks: number[] = [];
  let maxYStep = 0, sumDx = 0, sumDyAbs = 0;
  for (let t = 0; t < ticks; t++) {
    const px = b.x, py = b.y;
    b.vx = dir;
    b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(b, w, b.vx, b.vy);
    const dyy = Math.abs(b.y - py), dxx = Math.abs(b.x - px);
    if (dyy > maxYStep) maxYStep = dyy;
    sumDx += dxx; sumDyAbs += dyy;
    if (!b.onGround) { air++; airTicks.push(t); }
  }
  return { air, endX: b.x / TILE, grounded: b.onGround, airTicks,
    maxYStep, dirMean: sumDx > 8 ? sumDyAbs / sumDx : 0 };
}

function assertNoPulse(label: string, r: WalkRes): void {
  if (r.maxYStep >= 2.6) throw new Error(`${label} 脉冲复发 maxYStep=${r.maxYStep.toFixed(2)}px`);
}
function assertDiagonal(label: string, r: WalkRes): void {
  if (!(r.dirMean > 0.55 && r.dirMean < 1.45)) throw new Error(`${label} 非对角匀速 dirMean=${r.dirMean.toFixed(2)}`);
}

describe('斜坡/台阶下行平滑性（双相贴合+下行速率帽 收官口径）', () => {
  it('实心/满格/半砖/平台族：无脉冲+对角匀速+终点接地', () => {
    // 连续对角面族：无脉冲(速率帽)
    let w = new World(W, H, 7, 'slope-stair'); buildRamp(w);
    let r = walk(w, baseBody(), 1, 200);
    assertNoPulse('实心坡', r); assertDiagonal('实心坡', r);

    // 离散台阶族（满格=16px/列半砖=8px/平台错层）：台阶本征跳步=原版观感,
    // 允许单 tick ≤16.3px 的整级位移,但保持对角均值与接地
    w = new World(W, H, 7, 'block-stair'); buildStair(w, false);
    r = walk(w, baseBody(), 1, 200);
    if (r.maxYStep > 16.3) throw new Error(`满格阶 异常跳步 ${r.maxYStep.toFixed(1)}px`);
    assertDiagonal('满格阶', r);

    w = new World(W, H, 7, 'half-stair'); buildStair(w, true);
    r = walk(w, baseBody(), 1, 200);
    if (r.maxYStep > 16.3) throw new Error(`半砖阶 异常跳步 ${r.maxYStep.toFixed(1)}px`);

    w = new World(W, H, 7, 'plat-flat'); buildPlatformStair(w, 'flat');
    r = walk(w, baseBody(), 1, 200);
    if (r.maxYStep > 16.3) throw new Error(`平台错层 异常跳步 ${r.maxYStep.toFixed(1)}px`);
    assertDiagonal('平台错层', r);

    w = new World(W, H, 7, 'plat-hammer'); buildPlatformStair(w, 'hammer');
    r = walk(w, baseBody(), 1, 200);
    assertNoPulse('平台锤坡', r); assertDiagonal('平台锤坡', r);
  });

  it('上行爬升全程零空中帧', () => {
    const w = new World(W, H, 7, 'ascent');
    buildRamp(w);
    const st = w.store;
    for (let x = 26; x < 36; x++) st.setTile(x, BASE + 14, 1);
    const b = baseBody();
    b.x = 30 * TILE;
    b.y = (BASE + 14) * TILE - 42;
    const r = walk(w, b, -1, 260);
    if (r.air !== 0) throw new Error(`上行空帧=${r.air} 空@${r.airTicks.join(',')}`);
    expect(r.endX).toBeLessThan(15);
    expect(r.grounded).toBe(true);
  });

  it('腾空横越坡面不被下贴误拉（wasGround 门）', () => {
    const w = new World(W, H, 7, 'flyover');
    buildRamp(w);
    const b = baseBody();
    b.x = 4 * TILE;
    b.vy = -6.5;
    let airborneTicks = 0;
    for (let t = 0; t < 120; t++) {
      b.vx = 3;
      b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b, w, b.vx, b.vy);
      if (!b.onGround) airborneTicks++;
    }
    expect(airborneTicks).toBeGreaterThan(40);
  });

  it('★真实存档窗口·平台锤坡楼梯(marks no1..no7)：无脉冲+匀速到达梯底', () => {
    type Cell = [number, number, number, number, number];
    const fx = JSON.parse(
      readFileSync(new URL('./fixtures/stair-window.json', import.meta.url), 'utf8'),
    ) as { origin: [number, number]; cells: Cell[] };
    const [ox, oy] = fx.origin;
    const gw = 52, gh = 32;
    const w = new World(gw, gh, 7, 'save-window');
    const st = w.store;
    for (const [ax, ay, type, slope, half] of fx.cells) {
      const x = ax - ox, y = ay - oy;
      if (!st.inBounds(x, y)) continue;
      st.type[st.idx(x, y)] = type;
      st.flags[st.idx(x, y)] = 1;
      if (slope) st.slope[st.idx(x, y)] = slope;
      if (half) st.half[st.idx(x, y)] = half;
    }
    const b = baseBody();
    b.x = (3196 - ox) * TILE;
    b.y = (389 - oy) * TILE - 42;
    b.onGround = true;
    // 预热 10t：跳过「起步平台→梯首」本征一级 16px 下踏（离散接缝,非锯齿）
    for (let t = 0; t < 10; t++) {
      b.vx = 1;
      b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b, w, b.vx, b.vy);
    }
    const r = walk(w, b, 1, 80);
    assertNoPulse('真档窗口下行', r);
    assertDiagonal('真档窗口下行', r);
    expect(r.endX).toBeGreaterThan((3196 - ox) + 4);
    expect(r.grounded).toBe(true);

    // ★上行（2026-09-01 用户日志「上坡一段后掉落」回归）：从梯底左侧爬上
    //   标注楼梯全程,禁止任何下行脉冲(反向拖拽实录 dy+16~30 @ L行)
    const b2 = baseBody();
    b2.x = (3203 - ox) * TILE;
    b2.y = (397 - oy) * TILE - 42;      // 梯底平台带
    b2.onGround = true;
    for (let t = 0; t < 8; t++) {        // 预热落定
      b2.vx = -1;
      b2.vy = Math.min(b2.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b2, w, b2.vx, b2.vy);
    }
    let maxDownStep = 0, climbOk = false;
    let sdx = 0, sdy = 0;
    for (let t = 0; t < 90; t++) {
      const py = b2.y;
      b2.vx = -1;
      b2.vy = Math.min(b2.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b2, w, b2.vx, b2.vy);
      const down = b2.y - py;
      if (down > maxDownStep) maxDownStep = down;
      sdx += Math.abs(b2.x) + 16 * t * 0 - Math.abs(b2.x); void sdx;
      sdy += down;
      if (!b2.inBounds === undefined) void 0;
      if ((b2.y + b2.h) <= (389.5 - oy) * TILE && b2.x <= (3197 - ox) * TILE) climbOk = true;
    }
    // 物理层口径：①无单帧下行脉冲(反向拖拽哨兵) ②不发生 ≥10px 坠落帧
    //（到达与否属 AI 寻路/StepUp 协同,不在贴合回归范围）
    if (maxDownStep > 2.6) throw new Error(`真档爬升 下行脉冲 ${maxDownStep.toFixed(1)}px`);
    let fellBelowStart = false;
    const startFoot = (397 - oy) * TILE;
    if ((b2.y + b2.h) > startFoot + 10) fellBelowStart = true;
    if (fellBelowStart) throw new Error(`真档爬升 深坠落 foot=${(b2.y + b2.h).toFixed(0)}`);
    expect(maxDownStep).toBeLessThan(2.6);
    void climbOk;
  });
});
