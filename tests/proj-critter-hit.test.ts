// 弹幕命中小动物回归:原版小动物是 NPC,任何伤害即死——
// 箭/法弹此前只遍历 enemies 桶,critters 桶漏判,射松鼠无效果。
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
// Critter.ts 已由小动物 Enemy 化重构移除（066d742b）——小动物=Enemy.fromVanilla 入
// critters 桶；本测试只验"弹幕扫掠 critters 桶"语义，构造等价 Enemy 实体即可
import { Enemy } from '../src/entities/Enemy';
import { Arrow } from '../src/entities/Arrow';
import { MagicProj } from '../src/entities/MagicProj';
import type { GameHooks } from '../src/entities/types';

const makeSquirrel = (): Enemy => {
  const e = Enemy.fromVanilla(299, 40 * 16 + 8, 20 * 16 + 8);
  if (!e) throw new Error('squirrel 299 构造失败');
  return e;
};

function makeGame(critters: unknown[]): GameHooks {
  const world = new World(64, 32, 42, '测试');
  // Enemy.hurt 死亡掉落 ctx 读 game.player 的 hp/luck（原版 Main.player[myPlayer] 恒在）
  const stubPlayer = { hp: 100, maxHp: 100, mana: 20, maxMana: 20, luck: 0, dead: false, cx: 0, cy: 0 };
  return {
    world,
    player: stubPlayer,
    enemies: () => [],
    critters: () => critters,
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfxFiles: () => {},
    onEnemyKilled: () => {},
  } as unknown as GameHooks;
}

describe('弹幕命中小动物', () => {
  it('箭射中松鼠:松鼠死亡,箭消耗', () => {
    const squirrel = makeSquirrel();
    expect(squirrel.dead).toBe(false);
    const game = makeGame([squirrel]);
    // 松鼠在 (40,20) 格;箭从左侧水平飞入
    const arrow = new Arrow(40 * 16 - 20, 20 * 16 + 4, 8, 0, 9, 1, 1, VANILLA_ITEM_KEY_BY_ID[40]);
    for (let i = 0; i < 8; i++) arrow.fixedUpdate(1 / 60, game);
    expect(squirrel.dead).toBe(true);
    expect(arrow.dead).toBe(true);
  });

  it('魔法弹射中松鼠:松鼠死亡,弹体消耗', () => {
    const squirrel = makeSquirrel();
    const game = makeGame([squirrel]);
    const proj = new MagicProj(40 * 16 - 20, 20 * 16 + 4, 8, 0, 9, 45, '#8080FF');
    for (let i = 0; i < 8; i++) proj.fixedUpdate(1 / 60, game);
    expect(squirrel.dead).toBe(true);
    expect(proj.dead).toBe(true);
  });

  it('未命中:松鼠存活,箭继续飞', () => {
    const squirrel = makeSquirrel();
    const game = makeGame([squirrel]);
    // 箭在松鼠下方 3 格飞过
    const arrow = new Arrow(40 * 16 - 20, 23 * 16, 8, 0, 9, 1, 1, VANILLA_ITEM_KEY_BY_ID[40]);
    for (let i = 0; i < 8; i++) arrow.fixedUpdate(1 / 60, game);
    expect(squirrel.dead).toBe(false);
    expect(arrow.dead).toBe(false);
  });
});
