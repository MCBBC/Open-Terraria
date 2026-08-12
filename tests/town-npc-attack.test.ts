// 城镇 NPC 自卫攻击回归(原版 AI_007 攻击态,NPC.cs:54747-55538):
// 用户报"原版向导会射箭,我们没对齐"。向导=22/AttackType1(弓):肉前木箭 proj1、
// 伤 12、速 10、散布 ±0.7、aimLift 4;触发门=站地+冷却+探测范围(22=700)内 LOS 敌。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { TownShot } from '../src/entities/TownShot';
import { Inventory } from '../src/items/Inventory';

function makeGame(npc: TownNPC, enemy: { x: number; y: number; w: number; h: number }) {
  const world = new World(200, 200, 100, 'atk-test');
  for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, 100, 1);
  const shots: TownShot[] = [];
  const enemies = [enemy];
  return {
    world, shots,
    game: {
      world,
      player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
      enemies: () => enemies,
      spawnTownShot: (s: TownShot) => shots.push(s),
      spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      addDamageNumber: () => {},
      critters: () => [],
    } as never,
  };
}

describe('城镇 NPC 自卫攻击(AI_007 攻击态)', () => {
  it('向导(22):范围内有敌 → 发射木箭 proj 1,方向朝敌', () => {
    const guide = new TownNPC('guide', 100 * 16, 99 * 16, new Inventory());
    const enemy = { x: 106 * 16, y: 96 * 16, w: 20, h: 40, dead: false, hurt: () => true };
    const { game, shots } = makeGame(guide, enemy);
    let fired = false;
    for (let t = 0; t < 900 && !fired; t++) {
      guide.fixedUpdate(1 / 60, game);
      if (shots.length) fired = true;
    }
    expect(fired).toBe(true);
    expect(shots[0].projId).toBe(1);            // 肉前木箭(肉后火焰箭 2)
    expect(shots[0].vx).toBeGreaterThan(0);     // 朝右侧敌人
    expect(shots[0].damage).toBe(12);           // Classic 难度 ×1
  });

  it('商人(17):近战弹态 proj 48', () => {
    const merch = new TownNPC('merchant', 100 * 16, 99 * 16, new Inventory());
    const enemy = { x: 103 * 16, y: 96 * 16, w: 20, h: 40, dead: false, hurt: () => true };
    const { game, shots } = makeGame(merch, enemy);
    let fired = false;
    for (let t = 0; t < 1500 && !fired; t++) {
      merch.fixedUpdate(1 / 60, game);
      if (shots.length) fired = true;
    }
    expect(fired).toBe(true);
    expect(shots[0].projId).toBe(48);
  });

  it('无敌在探测范围外/LOS 阻断:不触发', () => {
    const guide = new TownNPC('guide', 100 * 16, 99 * 16, new Inventory());
    guide.stationary = true; // 固定站位——防游走自行缩短距离(前两例靠命中够快不受影响)
    // 距离 ~60 格 > 探测 700px(43.75 格)
    const enemy = { x: 160 * 16, y: 96 * 16, w: 20, h: 40, dead: false, hurt: () => true };
    const { game, shots } = makeGame(guide, enemy);
    for (let t = 0; t < 900; t++) guide.fixedUpdate(1 / 60, game);
    expect(shots.length).toBe(0);
  });

  it('发射后进入冷却(不再连发)', () => {
    const guide = new TownNPC('guide', 100 * 16, 99 * 16, new Inventory());
    const enemy = { x: 106 * 16, y: 96 * 16, w: 20, h: 40, dead: false, hurt: () => true };
    const { game, shots } = makeGame(guide, enemy);
    for (let t = 0; t < 400; t++) guide.fixedUpdate(1 / 60, game);
    const n1 = shots.length;
    expect(n1).toBeGreaterThan(0);
    // 冷却期(退出 cd = 30/2 + rand(20) ≈ 15-35 tick)内 40 tick 不再翻倍发
    const before = shots.length;
    for (let t = 0; t < 40; t++) guide.fixedUpdate(1 / 60, game);
    expect(shots.length - before).toBeLessThanOrEqual(1);
  });
});
