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
    entities: { add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {},
    spawnDrop: () => null, cutTile: () => {}, damagePlayer: () => {},
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
});
