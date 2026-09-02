// 雨云魔杖 1244 / 猩红魔杖 1256 云弹家族行为锁(aiStyle 45 1:1,Projectile.cs:28351-28520):
//  ①移动云过锚双轴齐停 → Kill 钩原位变 238 降雨云(:76032-76037)
//  ②降雨云开阔带每 >8t 落 239 雨滴(vy 5);受阻(2×20 带实心)不降雨
//  ③同型存活计数:238 活>2 → 最老者 age=18000 起淡出
//  ④雨滴撞格亡/命中敌承 damage
import { describe, it, expect } from 'vitest';
import { RainCloudProj } from '../src/entities/WeaponProj';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; hits: number[];
  hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
}
const mkEnemy = (id: number, cx: number, cy: number): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - 8, y: cy - 12, w: 16, h: 24, dead: false, cx, cy, hp: 10000, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

function mkHooks(enemies: MockEnemy[] = []) {
  const w = new World(60, 200, 1, 'rc');
  // 清出高空测试带(行 20-70):种子 1 生成地形会填满洞周
  for (let x = 0; x < 60; x++) {
    for (let y = 20; y <= 70; y++) w.store.setTileSilent(x, y, 0, 0, 0);
  }
  const added: unknown[] = [];
  const player = new Player(30 * 16, 20 * 16, new Inventory());
  const hooks = {
    world: w,
    player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
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
  (hooks as unknown as { entities: { nextId: number; add: (e: unknown, b: string) => void; projectiles: unknown[] } }).entities = {
    nextId: 1,
    add: (e: unknown, b: string) => { if (b === 'projectiles') added.push(e); },
    projectiles: added,
  };
  return { hooks: hooks as unknown as GameHooks, world: w, added, player };
}

describe('雨云/猩红魔杖云弹家族（aiStyle 45）', () => {
  it('①移动云过锚双轴齐停 → Kill 钩原位变 238 降雨云', () => {
    const { hooks, added } = mkHooks();
    // 锚 (200,100),出生 (100,100) 顶左,vx=4 → cx=114 起 22t 内过锚
    const c = new RainCloudProj(100, 100, 4, 0, 30, 0, 237, 200, 100);
    for (let t = 0; t < 40 && !c.dead; t++) c.fixedUpdate(1 / 60, hooks);
    expect(c.dead).toBe(true);
    const rains = added.filter((a) => (a as RainCloudProj).projId === 238);
    expect(rains).toHaveLength(1);
    const rain = rains[0] as RainCloudProj;
    expect(Math.abs(rain.cx - 200)).toBeLessThanOrEqual(27);   // 死亡点 Center 生成
    expect(rain.vy).toBe(0);
  });

  it('②降雨云开阔带每 >8t 落 239 雨滴(vy=5,承 damage)', () => {
    const { hooks, added } = mkHooks();
    const rain = new RainCloudProj(30 * 16, 30 * 16, 0, 0, 30, 0, 238);
    for (let t = 0; t < 40; t++) rain.fixedUpdate(1 / 60, hooks);
    const drops = added.filter((a) => (a as RainCloudProj).projId === 239);
    expect(drops.length).toBeGreaterThanOrEqual(3);           // beat>8 → 9/18/27/36 拍四滴
    const d0 = drops[0] as RainCloudProj;
    expect(d0.vy).toBe(5);
    expect(d0.damage).toBe(30);
  });

  it('③受阻(云底 2×20 带实心)不降雨', () => {
    const { hooks, world, added } = mkHooks();
    const rain = new RainCloudProj(30 * 16, 30 * 16, 0, 0, 30, 0, 238);
    // 云底 y=528 → 行 33;行 34-35 置实心挡雨带
    const dirt = TILE_BY_KEY['dirt'] ?? 1;
    for (let xx = 28; xx <= 34; xx++) {
      world.store.setTileSilent(xx, 34, dirt, 0, 0);
      world.store.setTileSilent(xx, 35, dirt, 0, 0);
    }
    for (let t = 0; t < 40; t++) rain.fixedUpdate(1 / 60, hooks);
    expect(added.filter((a) => (a as RainCloudProj).projId === 239)).toHaveLength(0);
  });

  it('③b 同型存活计数:238 活>2 → 最老者 age=18000 起淡出(雨云=双云)', () => {
    const { hooks, added } = mkHooks();
    const a = new RainCloudProj(20 * 16, 30 * 16, 0, 0, 30, 0, 238);
    const b = new RainCloudProj(25 * 16, 30 * 16, 0, 0, 30, 0, 238);
    const c = new RainCloudProj(35 * 16, 30 * 16, 0, 0, 30, 0, 238);
    added.push(a, b, c);                                       // 注册进桶(扫描面=桶)
    (a as unknown as { age: number }).age = 100;               // a 最老
    (b as unknown as { age: number }).age = 50;
    (c as unknown as { age: number }).age = 10;
    for (let t = 0; t < 12; t++) a.fixedUpdate(1 / 60, hooks);
    // vanilla ai[1]++ 在 ≥18000 判定前(淡出中仍自增),断言 ≥ + 淡出已启动
    expect((a as unknown as { age: number }).age).toBeGreaterThanOrEqual(18000);
    expect((a as unknown as { fade: number }).fade).toBeGreaterThan(0);
    expect((b as unknown as { age: number }).age).toBeLessThan(18000);
    expect((c as unknown as { age: number }).age).toBeLessThan(18000);
  });

  it('④雨滴:撞格亡;命中敌承 damage;penetrate 5', () => {
    const e = mkEnemy(1, 30 * 16, 32 * 16);
    const { hooks, world } = mkHooks([e]);
    // 地板在行 35(敌下方),雨滴从 30*16 上方落下穿过敌身
    const dirt = TILE_BY_KEY['dirt'] ?? 1;
    for (let xx = 28; xx <= 32; xx++) world.store.setTileSilent(xx, 35, dirt, 0, 0);
    const drop = new RainCloudProj(30 * 16 - 2, 30 * 16, 0, 5, 30, 0, 239);
    drop.critChance = 0;                                       // 钉 4% 暴击 roll=确定 30
    for (let t = 0; t < 30 && !drop.dead; t++) drop.fixedUpdate(1 / 60, hooks);
    expect(e.hits.length).toBeGreaterThanOrEqual(1);           // 命中承伤
    expect(e.hits[0]).toBe(30);
    expect(drop.dead).toBe(true);                              // 撞地板亡
  });
});
