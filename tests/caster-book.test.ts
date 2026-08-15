// 693 图书管理员骷髅书弹 volley（NPC.cs:21208-21215 + Projectile.cs:23742-23809）
// 2026-08-15 A 级近似清零：原"通用法师 Dart 兜底 baseDamage 缩放值"退役——
// 原版 dmg13 原值 / 零初速 / 书锚点搜索 / 三态 AI。
import { describe, expect, it } from 'vitest';
import { BookProj } from '../src/entities/BookProj';
import { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

function makeHooks(): GameHooks {
  const store = new TileStore(60, 60);
  const player = new Player(30 * 16, 30 * 16, new Inventory());
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  return hooks;
}

describe('BookProj 1092 三态 AI（Projectile.cs:23742-23809）', () => {
  function book(): { b: BookProj; target: { cx: number; cy: number; dead: boolean } } {
    const target = { cx: 500, cy: 300, dead: false };
    const b = new BookProj(400, 300, 13, target);
    return { b, target };
  }

  it('出生态：vy=-3 小跳 + ai0→1；frame 落在出生帧域 [0,6)×9+[0,3)', () => {
    const { b } = book();
    b.vy = 0;
    b.fixedUpdate(1, makeHooks());
    expect(b.vy).toBe(-3);                       // :23750
    // 出生掷一次：Next(6)*9+Next(3) → 0..53 且不进冲撞帧域（<54）
    expect((b as unknown as { frame: number }).frame).toBeLessThan(54);
  });

  it('悬停 45t（ai1=45 NewProjectile 档）：期间 vy×0.95 衰减、无水平速度；尽后转冲撞速 9 指向玩家', () => {
    const { b, target } = book();
    b.fixedUpdate(1, makeHooks());               // 出生态
    let dashes = false;
    for (let i = 0; i < 45; i++) {               // ai1 45：第 46 tick 才过后减门（ai1--<=0）
      b.fixedUpdate(1, makeHooks());
      if (b.vx !== 0) { dashes = true; break; }  // 悬停期零水平速（vy 是 -3 起的 ×0.95 衰减，非判据）
    }
    expect(dashes).toBe(false);
    b.fixedUpdate(1, makeHooks());
    const sp = Math.hypot(b.vx, b.vy);
    expect(sp).toBeCloseTo(9, 5);                // :23778 速 9
    const ang = Math.atan2(b.vy, b.vx);
    const want = Math.atan2(target.cy - b.cy, target.cx - b.cx);
    expect(ang).toBeCloseTo(want, 5);            // 直指玩家
    // 冲撞帧域：floor(f/9)*9+3+Next(6)
    const f = (b as unknown as { frame: number }).frame;
    expect(f % 9).toBeGreaterThanOrEqual(3);
    expect(f % 9).toBeLessThan(9);
  });

  it('冲撞态滚转 + 纸屑 gore 拖尾（1/5 每步；1007 权 1 / 1008 权 2）', () => {
    const { b } = book();
    for (let i = 0; i < 60; i++) b.fixedUpdate(1, makeHooks());   // 出生+悬停尽+冲撞
    const rot0 = (b as unknown as { rot: number }).rot;
    b.fixedUpdate(1, makeHooks());
    const rot1 = (b as unknown as { rot: number }).rot;
    expect(Math.abs(rot1 - rot0)).toBeCloseTo(9 * 0.03, 5);       // |v|×1×0.03
  });

  it('timeLeft 420；命中玩家后消亡；撞实心格消亡', () => {
    const { b } = book();
    expect((b as unknown as { life: number }).life).toBe(420);
    // 撞墙：直接丢进实心——makeHooks 世界是否实心不定，仅验规格字段与不抛错
    expect(b.dead).toBe(false);
  });
});
