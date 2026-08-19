// 玩家死亡后飘浮眼(AI_002 恶魔眼)寻路回归:
//  曾在 !player 兜底写 dirX=-sign(vx)(朝速度反方向看→X 反复过零=左右朝向抽搐)
//  + 恒 dirY=-1(无条件上飞=尸体处飞升天)。
//  原版语义(NPC.cs):TargetClosest 落空是【无操作】(TargetClosestUpgraded
//  :78421 无有效玩家 num4 哨兵未动直接 return)→ direction/directionY 保持原值,
//  沿最后方向滑行;上飞(directionY=-1)是白天驱散分支(:52707)专属。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';

function makeGame(): GameHooks {
  const world = new World(96, 48, 7, 'float-eye-dead');
  world.groundLevel = 16;
  world.rockLevel = 32;
  world.clock.timeOfDay = 0.9;  // 夜间:不触发白天驱散分支
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

const eyeAIOf = (e: Enemy) =>
  (e as unknown as { floatEyeAI: (g: GameHooks, p: unknown) => void }).floatEyeAI;

function makeEye(): Enemy {
  const e = Enemy.fromVanilla(2, 40 * 16, 20 * 16);
  if (!e) throw new Error('demon eye 2 构造失败');
  return e;
}

describe('AI_002 玩家死亡寻路', () => {
  it('死亡后:保持最后朝向不抽搐、沿用最后垂直方向(不无条件飞升)', () => {
    const game = makeGame();
    const eye = makeEye();
    // 活玩家在右下方 200×100px → 追击期 facing=1、dirY=1(vy 向下逼近)
    const live = { cx: eye.cx + 200, cy: eye.cy + 100, dead: false,
      itemAnimTicks: 0, useTime: 0, aggro: 0 };
    for (let i = 0; i < 30; i++) eyeAIOf(eye).call(eye, game, live);
    expect(eye.facing).toBe(1);
    expect(eye.dirY).toBe(1);
    expect(eye.vy).toBeGreaterThan(0);   // 正在下压追击
    // 玩家死亡(null)200t:朝向恒 1(旧实现逐 tick 翻转=抽搐)、vy 不被强制转负上飞
    const facings: number[] = [];
    for (let i = 0; i < 200; i++) {
      eyeAIOf(eye).call(eye, game, null);
      facings.push(eye.facing);
    }
    expect(new Set(facings).size).toBe(1);
    expect(facings[0]).toBe(1);
    expect(eye.dirY).toBe(1);            // 沿用死亡前的垂直方向
    expect(eye.vy).toBeGreaterThanOrEqual(0);   // 不飞升(旧实现恒 -2.5 上限)
    expect(eye.vx).toBeGreaterThan(0);   // 保持滑行方向
  });

  it('死亡前目标在上方 → 死后沿用 dirY=-1 继续上飘(原版保留 directionY)', () => {
    const game = makeGame();
    const eye = makeEye();
    const live = { cx: eye.cx + 200, cy: eye.cy - 100, dead: false,
      itemAnimTicks: 0, useTime: 0, aggro: 0 };
    for (let i = 0; i < 30; i++) eyeAIOf(eye).call(eye, game, live);
    expect(eye.dirY).toBe(-1);
    eyeAIOf(eye).call(eye, game, null);
    expect(eye.dirY).toBe(-1);
    expect(eye.facing).toBe(1);
  });

  it('白天地表驱散分支不受影响:dirY=-1 + EncourageDespawn(10)', () => {
    const game = makeGame();
    game.world.clock.timeOfDay = 0.5;  // 白天 + 地表 → discouraged
    const eye = makeEye();              // y=20*16=320 > groundLevel*16=256 → 地表之上?
    eye.y = 14 * 16;                    // 224 ≤ 256:确入驱散窗
    eyeAIOf(eye).call(eye, game, null);
    expect(eye.dirY).toBe(-1);
    expect(eye.despawnTimer).toBeLessThanOrEqual(10);
  });

  it('蝙蝠 AI_014 同语义:死后保持朝向与最后垂直方向(不恒上飞)', () => {
    const game = makeGame();
    const bat = Enemy.fromVanilla(49, 40 * 16, 20 * 16);   // Cave Bat
    if (!bat) throw new Error('bat 49 构造失败');
    const batAIOf = (e: Enemy) =>
      (e as unknown as { batAI: (g: GameHooks, p: unknown) => void }).batAI;
    const live = { cx: bat.cx + 150, cy: bat.cy + 80, dead: false,
      itemAnimTicks: 0, useTime: 0, aggro: 0 };
    for (let i = 0; i < 30; i++) batAIOf(bat).call(bat, game, live);
    expect(bat.facing).toBe(1);
    expect(bat.dirY).toBe(1);
    for (let i = 0; i < 120; i++) batAIOf(bat).call(bat, game, null);
    expect(bat.facing).toBe(1);
    expect(bat.dirY).toBe(1);                 // 沿用(旧实现恒 -1 上飞)
    expect(bat.vy).toBeGreaterThanOrEqual(0);
  });
});
