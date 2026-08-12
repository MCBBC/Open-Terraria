// 弹幕命中小动物回归:原版小动物是 NPC,任何伤害即死——
// 箭/法弹此前只遍历 enemies 桶,critters 桶漏判,射松鼠无效果。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Critter } from '../src/entities/Critter';
import { Arrow } from '../src/entities/Arrow';
import { MagicProj } from '../src/entities/MagicProj';
import type { GameHooks } from '../src/entities/types';

function makeGame(critters: unknown[]): GameHooks {
  const world = new World(64, 32, 42, '测试');
  return {
    world,
    player: null,
    enemies: () => [],
    critters: () => critters,
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfxFiles: () => {},
  } as unknown as GameHooks;
}

describe('弹幕命中小动物', () => {
  it('箭射中松鼠:松鼠死亡,箭消耗', () => {
    const squirrel = new Critter('squirrel', 40 * 16 + 8, 20 * 16 + 8);
    expect(squirrel.dead).toBe(false);
    const game = makeGame([squirrel]);
    // 松鼠在 (40,20) 格;箭从左侧水平飞入
    const arrow = new Arrow(40 * 16 - 20, 20 * 16 + 4, 8, 0, 9, 1, 1, VANILLA_ITEM_KEY_BY_ID[40]);
    for (let i = 0; i < 8; i++) arrow.fixedUpdate(1 / 60, game);
    expect(squirrel.dead).toBe(true);
    expect(arrow.dead).toBe(true);
  });

  it('魔法弹射中松鼠:松鼠死亡,弹体消耗', () => {
    const squirrel = new Critter('squirrel', 40 * 16 + 8, 20 * 16 + 8);
    const game = makeGame([squirrel]);
    const proj = new MagicProj(40 * 16 - 20, 20 * 16 + 4, 8, 0, 9, 45, '#8080FF');
    for (let i = 0; i < 8; i++) proj.fixedUpdate(1 / 60, game);
    expect(squirrel.dead).toBe(true);
    expect(proj.dead).toBe(true);
  });

  it('未命中:松鼠存活,箭继续飞', () => {
    const squirrel = new Critter('squirrel', 40 * 16 + 8, 20 * 16 + 8);
    const game = makeGame([squirrel]);
    // 箭在松鼠下方 3 格飞过
    const arrow = new Arrow(40 * 16 - 20, 23 * 16, 8, 0, 9, 1, 1, VANILLA_ITEM_KEY_BY_ID[40]);
    for (let i = 0; i < 8; i++) arrow.fixedUpdate(1 / 60, game);
    expect(squirrel.dead).toBe(false);
    expect(arrow.dead).toBe(false);
  });
});
