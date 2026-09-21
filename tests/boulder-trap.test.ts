// 巨石机关回归(用户报:下落慢 + 落地逐渐穿墙沉降 + 原位贴图残留):
// ①物理 1:1 AI_025(重力 0.3/终端 16/落弹 −lastVy×0.2 仅硬落/滚地加速/撞墙碎裂);
// ②AABB 前沿采样替代中心点(恒沉根因:vy=0 分支不回退 y);
// ③Wiring 清格走 setTile(listeners→渲染 chunk 失效,残留贴图根因)。
import { describe, it, expect } from 'vitest';
import { TrapShot } from '../src/entities/Dart';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

function makeGame(w: World): GameHooks {
  return {
    world: w,
    player: { x: 0, y: 0, w: 20, h: 42, cx: 10, cy: 21, dead: true, iframes: 0 },
    enemies: () => [],
    playSfx: () => {}, playSfxFiles: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {},
    spawnDrop: () => null, cutTile: () => {}, damagePlayer: (): number => 0,
    onEnemyKilled: () => {},
    critters: () => [], npcs: () => [], projectiles: () => [],
    spawnEnemy: () => {},
    entities: { critters: [], npcs: [], projectiles: [] },
  } as unknown as GameHooks;
}

function worldWithFloor(): World {
  const w = new World(100, 100, 30, 'open');
  for (let x = 0; x < 100; x++) w.store.setTileSilent(x, 80, 1, 0, 0); // 全宽地面(滚动不坠边)
  for (let y = 70; y < 80; y++) { w.store.setTileSilent(96, y, 1, 0, 0); w.store.setTileSilent(3, y, 1, 0, 0); } // 两端挡墙
  return w;
}

describe('巨石(aiStyle 25,Projectile 99)', () => {
  it('重力 0.3/终端 16:空场 10t 速度 0→3.0,自由落体期间峰值钳 16(不再用自造 0.22 无终端)', () => {
    const g = makeGame(worldWithFloor());
    const b = new TrapShot(50 * TILE, 10 * TILE, 0, 0, 70, 'boulder');
    for (let t = 0; t < 10; t++) b.fixedUpdate(1, g);
    expect(b.vy).toBeCloseTo(3.0, 2);
    let maxVy = 0;
    for (let t = 0; t < 45; t++) { b.fixedUpdate(1, g); maxVy = Math.max(maxVy, b.vy); }
    expect(maxVy).toBeCloseTo(16, 1);                     // 10t 3.0 + 43t×0.3 → 终端 16
    expect(b.w).toBe(31); expect(b.h).toBe(31);           // SetDefaults :1563
  });

  it('落地不渐沉:贴地后盒底恒在地面之上(旧 bug 每 tick 恒沉 0.22px);平地滚至挡墙碎裂', () => {
    const g = makeGame(worldWithFloor());
    const b = new TrapShot(50 * TILE, 78 * TILE, 0, 0, 70, 'boulder');
    let maxY = 0;
    for (let t = 0; t < 600 && !b.dead; t++) {
      b.fixedUpdate(1, g);
      maxY = Math.max(maxY, b.y + b.h);
    }
    expect(maxY).toBeLessThanOrEqual(80 * TILE + 2);       // 全程盒底不入地面(≤2px 采样余量)
    expect(b.dead).toBe(true);                             // 滚到挡墙碎裂(滚地加速不停)
  });

  it('硬落反弹 −lastVy×0.2(仅 lastVy>5)、软落直接落定;撞墙碎裂消亡', () => {
    const g = makeGame(worldWithFloor());
    // 硬落:贴地 1px 上方 vy=8 → 首拍重力 8.3 → 撞地反弹 −8.3×0.2 ≈ −1.66
    const b = new TrapShot(50 * TILE, 80 * TILE - 32, 0, 8, 70, 'boulder');
    b.fixedUpdate(1, g);
    expect(b.vy).toBeCloseTo(-1.66, 1);
    // 软落:vy=2 → 撞地直接落定 0(2.3 ≤ 5 不反弹)——净空 1px 出生走干净落位链
    const b2 = new TrapShot(50 * TILE, 80 * TILE - 32, 0, 2, 70, 'boulder');
    b2.fixedUpdate(1, g);
    expect(b2.vy).toBe(0);
    expect(b2.onGround).toBe(true);
    // 撞墙:竖墙 + 滚地加速 → 撞上碎裂
    const w2 = worldWithFloor();
    for (let y = 70; y < 80; y++) w2.store.setTileSilent(55, y, 1, 0, 0);
    const g2 = makeGame(w2);
    const b3 = new TrapShot(50 * TILE, 78 * TILE, 1, 0, 70, 'boulder');  // 向右滚
    for (let t = 0; t < 400 && !b3.dead; t++) b3.fixedUpdate(1, g2);
    expect(b3.dead).toBe(true);                                          // 撞墙碎裂(:17574)
  });

  it('旋转单次累加 vx*0.06/tick(AI_025 :26682 终清波勘误——通用 spin 块已剔 boulder,双倍累加退役)', () => {
    const g = makeGame(worldWithFloor());
    const b = new TrapShot(50 * TILE, 80 * TILE - 31, 2, 0, 70, 'boulder'); // 贴地出生
    let expectRot = 0;
    for (let t = 0; t < 3; t++) {
      expect(b['rot']).toBeCloseTo(expectRot, 5);        // 拍内时序:rot 先于滚地加速
      expectRot += b.vx * 0.06;                          // vx 增量发生在本拍 rot 之后
      b.fixedUpdate(1, g);
    }
    expect(b.boulderLanded).toBe(true);                  // ai[0]=1(:26684)踢门已生效
    if (!b.dead) expect(Math.abs(b.vx)).toBeGreaterThan(2); // 滚地加速未停(vy≤6 带)
  });

  it('滞滞启动踢三级递宽窗(:26596-26679 终清波转正):中距左墙 → 向右踢;'
    + '旧"只测最宽窗"实现在该场景会按奇偶误向左踢', () => {
    const w = worldWithFloor();
    const gB = makeGame(w);
    // 左探窗:L 首级 col50 空窗、中距 col49 放墙、最宽 col48 留空 → 三级第 2 级命中
    // (x=816 → L 列 floor((816−{8,24,40})/16)={50,49,48});探针行=盒 y 行与 +16 行
    w.store.setTileSilent(49, 78, 1, 0, 0);
    w.store.setTileSilent(49, 79, 1, 0, 0);
    const b = new TrapShot(51 * TILE, 80 * TILE - 31, 0, 0, 70, 'boulder');
    b.fixedUpdate(1, gB);                                // 落地置位拍(ai[0]=1,次拍起门生效)
    expect(b.boulderLanded).toBe(true);
    expect(b.vx).toBe(0);                                // 首拍 landed 未置 → 不踢
    b.fixedUpdate(1, gB);
    // 踢门给 num213=0.5(左实→向右);同拍尾部滚地加速带(vy≤6,|vx|<7)再 +0.05
    // (:26717-26723 与踢同支后置) ⇒ 终值 0.55 —— 拍内时序 踢(:26682 前)→rot→加速
    expect(b.vx).toBeCloseTo(0.55, 5);
  });
});
