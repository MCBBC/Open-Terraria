// AI_016 鱼类 flag22 攻击门回归(2026-08-19 用户报"鱼经常蹦出水面到岸上继续蹦"):
//  原版(NPC.cs:23731-24033)玩家【湿身】+视线才追击(55/592/607/615/688 五族永不追);
//  游荡档垂直 ai[0] 慢振荡 ±0.3 贴水深游。曾无条件朝玩家全速追(±3/±2)——
//  岸上玩家把鱼 vy=-2 直拖出水面 → 出水落岸无限拍打。
//  离水拍打本身(rand 蹦+重力0.3)是原版行为,不在本测否定范围。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';

function makeGame(): GameHooks {
  const world = new World(96, 48, 11, 'fish-flag22');
  world.groundLevel = 16;
  world.rockLevel = 32;
  return {
    world,
    player: null,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfxFiles: () => {},
    onEnemyKilled: () => {},
  } as unknown as GameHooks;
}

const swimAIOf = (e: Enemy) =>
  (e as unknown as { swimAI: (g: GameHooks, p: unknown) => void }).swimAI;

function makeFish(id: number): Enemy {
  const e = Enemy.fromVanilla(id, 40 * 16, 20 * 16);
  if (!e) throw new Error(`fish ${id} 构造失败`);
  e.wet = true;   // 在水中(直调 AI,npcLiquid 不参与)
  return e;
}

describe('AI_016 flag22 攻击门与游荡档', () => {
  it('岸上玩家(不湿身)近旁:游荡档 |vy|≤~0.3 贴水,不被拖出水面', () => {
    const game = makeGame();
    const fish = makeFish(58);   // 食人鱼
    const shore = { x: fish.x + 200, y: fish.y, w: 20, h: 42,
      cx: fish.cx + 200, cy: fish.cy, dead: false, inWater: false };
    let maxAbsVy = 0;
    for (let i = 0; i < 300; i++) {
      swimAIOf(fish).call(fish, game, shore);
      maxAbsVy = Math.max(maxAbsVy, Math.abs(fish.vy));
    }
    expect(maxAbsVy).toBeLessThanOrEqual(0.35);   // 慢振荡(旧实现恒到 -2 冲顶)
    // 游荡水平档:+0.1 越界(±1)×0.95 的平衡点 = 1.9 px/t(原版同式,cs:23952-23956)
    expect(Math.abs(fish.vx)).toBeLessThanOrEqual(2.0);
  });

  it('湿身玩家+视线:追击档朝玩家推进(钳 ±3/±2)', () => {
    const game = makeGame();
    const fish = makeFish(58);
    const diver = { x: fish.x + 150, y: fish.y + 100, w: 20, h: 42,
      cx: fish.cx + 150, cy: fish.cy + 100, dead: false, inWater: true };
    for (let i = 0; i < 30; i++) swimAIOf(fish).call(fish, game, diver);
    expect(fish.vx).toBeGreaterThan(0.5);   // 朝玩家水平推进
    expect(fish.vy).toBeGreaterThan(0.5);   // 向下追(玩家在下)
    expect(fish.vx).toBeLessThanOrEqual(3);
    expect(fish.vy).toBeLessThanOrEqual(2);
  });

  it('金鱼 55 五族永不追:湿身玩家近旁仍游荡', () => {
    const game = makeGame();
    const gold = makeFish(55);
    const diver = { x: gold.x + 100, y: gold.y + 60, w: 20, h: 42,
      cx: gold.cx + 100, cy: gold.cy + 60, dead: false, inWater: true };
    let maxAbsVy = 0;
    for (let i = 0; i < 200; i++) {
      swimAIOf(gold).call(gold, game, diver);
      maxAbsVy = Math.max(maxAbsVy, Math.abs(gold.vy));
    }
    expect(maxAbsVy).toBeLessThanOrEqual(0.35);
  });

  it('离水拍打 = 原版行为:落地随机蹦(vy∈[-5,-2]/vx∈±2)+重力0.3', () => {
    const game = makeGame();
    const fish = makeFish(58);
    fish.wet = false;
    fish.vy = 0;
    swimAIOf(fish).call(fish, game, null);
    expect(fish.vy).toBeLessThanOrEqual(-2 + 0.3 + 0.001);   // 蹦起-重力后仍向上
    expect(fish.vy).toBeGreaterThanOrEqual(-5);
    expect(Math.abs(fish.vx)).toBeLessThanOrEqual(2);
  });
});
