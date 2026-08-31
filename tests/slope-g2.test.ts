// 斜坡 G2 速度门 + collideY 回写（2026-08-31 统一"阻尼陷入/逃出"修复回归）
// 判例：原版 Collision.cs:1947 G2 门（贴合须高于入口英尺+速度Y）与 :1954
// collideY 回写（bitsByte[num3]）——缺失时任何走 moveAndCollide 的主体
// （玩家/NPC/飞行眼球/掉落物）在坡面被逐帧拉拽 = 阻尼骑坡/上下跳。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { World } from '../src/world/World';
import { moveAndCollide } from '../src/physics/TileCollision';
import { TILE_BY_KEY } from '../src/data/tiles';

const TILE = 16;
const DIRT = TILE_BY_KEY['dirt']!;

function makeWorld(w = 60, h = 60): World {
  return { store: new TileStore(w, h), w, h } as unknown as World;
}

interface B { x: number; y: number; w: number; h: number; vx: number; vy: number;
  onGround: boolean; hitWall: boolean; hitHead: boolean; collideY: boolean;
  vyEntry?: number; feetEntry?: number }

function buildSlope1Up(W: World, sx: number, G: number): void {
  const st = W.store;
  for (let x = sx - 2; x <= sx + 10; x++) st.setTile(x, G + 2, DIRT);   // 底板
  for (let x = sx - 2; x <= sx - 1; x++) st.setTile(x, G, DIRT);        // 高台
  for (let x = sx + 1; x <= sx + 9; x++) st.setTile(x, G + 1, DIRT);    // 低地
  st.setTile(sx, G, DIRT);
  st.setSlope(sx, G, 1);                                                 // slope1 左高右低
}

describe('斜坡 G2 速度门（统一阻尼修复）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('上升穿越者拒贴：向上飞的碰撞盒掠过坡格不被逐帧拉拽（阻尼陷入根因）', () => {
    const W = makeWorld(); buildSlope1Up(W, 30, 30);
    // 眼形盒：在坡格正上方向上飞（vy=-3），盒底已探入坡面 solid 半区
    const eye: B = { x: 30 * TILE + 2, y: 30 * TILE - 26, w: 20, h: 20,
      vx: 0, vy: -3, onGround: false, hitWall: false, hitHead: false, collideY: false };
    const yStart = eye.y;
    for (let t = 0; t < 20; t++) moveAndCollide(eye as never, W, eye.vx, eye.vy);
    // 上升者应自由离场：y 单调上移（不被拉回坡面），且不出现 onGround 吸附
    expect(eye.y).toBeLessThan(yStart);
    expect(eye.onGround).toBe(false);
  });

  it('骑坡弹离：下落压入坡面的飞行盒获得 collideY（AI 弹跳语义可用）并止蚀', () => {
    const W = makeWorld(); buildSlope1Up(W, 30, 30);
    const eye: B = { x: 30 * TILE + 4, y: 29 * TILE, w: 20, h: 20,
      vx: 0.5, vy: 3, onGround: false, hitWall: false, hitHead: false, collideY: false };
    let sawCollideY = false;
    for (let t = 0; t < 60; t++) {
      eye.vy = Math.min(3, eye.vy + 0.2);            // AI 推力（眼球朝目标压）
      moveAndCollide(eye as never, W, eye.vx, eye.vy);
      if (eye.collideY) sawCollideY = true;
    }
    expect(sawCollideY).toBe(true);                  // 修复前恒 false（缺失 bitsByte）
    // 贴合后不持续下沉： feet 不低于对角线 2px 以上
    const diag = 30 * TILE + (eye.x - 30 * TILE);   // slope1: feet=tileTop+num4(左缘)
    expect(eye.y + eye.h).toBeLessThanOrEqual(diag + 2.01);
  });

  it('掉落物静稳：坡面落点收敛到对角线 ±1px，无持续上下跳', () => {
    const W = makeWorld(); buildSlope1Up(W, 30, 30);
    const drop: B = { x: 30 * TILE + 6, y: 28 * TILE, w: 12, h: 12,
      vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false, collideY: false };
    const ys: number[] = [];
    for (let t = 0; t < 240; t++) {
      drop.vy = Math.min(8, drop.vy + 0.35);
      moveAndCollide(drop as never, W, drop.vx, drop.vy);
      if (t >= 190) ys.push(drop.y);
    }
    const spread = Math.max(...ys) - Math.min(...ys);
    expect(spread).toBeLessThanOrEqual(1.5);          // 修复前 sawtooth 振荡
    const diag = 30 * TILE + (drop.x - 30 * TILE);   // slope1: feet=tileTop+num4(左缘)
    expect(Math.abs(drop.y + drop.h - diag)).toBeLessThanOrEqual(1.2);
  });

  it('回退开关机制贯通：sw_slope_g2=0 ⇒ 模块级关闭（可线上即时回退）', async () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'sw_slope_g2' ? '0' : null) });
    vi.resetModules();
    const off = await import('../src/physics/TileCollision');
    expect(off.SLOPE_G2_ENABLED).toBe(false);
    vi.unstubAllGlobals();
    vi.resetModules();
    const on = await import('../src/physics/TileCollision');
    expect(on.SLOPE_G2_ENABLED).toBe(true);
    vi.resetModules();   // 还原默认实例，防污染后续测试
  });

  it('G2 开启时同场景自由上升（对照）', () => {
    const W = makeWorld(); buildSlope1Up(W, 30, 30);
    const diagFeet = 482;
    const eye: B = { x: 30 * TILE + 2, y: diagFeet + 2 - 20, w: 20, h: 20,
      vx: 0, vy: -3, onGround: false, hitWall: false, hitHead: false, collideY: false };
    const yStart = eye.y;
    for (let t = 0; t < 20; t++) { eye.vy = -3; moveAndCollide(eye as never, W, eye.vx, eye.vy); }
    expect(eye.y - yStart).toBeLessThanOrEqual(-59);  // 完全自由（-60 步长容差）
  });
});
