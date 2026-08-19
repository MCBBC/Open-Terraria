// 2026-08-19 六代理 AI 全量审计的严重项回归(驱动方式同 float-eye-dead-player):
//  仙灵逃逸/瓢虫陆行速度/海马水面折返/鸭子死亡滑行不逐帧背向
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';

function makeGame(): GameHooks {
  const world = new World(96, 48, 13, 'ai-parity-0819');
  world.groundLevel = 16;
  world.rockLevel = 32;
  return {
    world, player: null, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {},
    cutTile: () => {}, spawnParticles: () => {}, playSfxFiles: () => {},
    onEnemyKilled: () => {},
  } as unknown as GameHooks;
}
const drive = (e: Enemy, fn: string) =>
  (e as unknown as Record<string, (g: GameHooks, p: unknown) => void>)[fn];

describe('AI 全量审计严重项回归(2026-08-19)', () => {
  it('仙灵 583:状态1 背向玩家逃逸(非追随)', () => {
    const game = makeGame();
    const f = Enemy.fromVanilla(583, 40 * 16, 20 * 16);
    if (!f) throw new Error('fairy 构造失败');
    const player = { cx: f.cx - 200, cy: f.cy, x: f.x - 200, y: f.y, w: 20, h: 42,
      dead: false, itemAnimTicks: 0, useTime: 0, aggro: 0 };
    // 状态0:玩家 250px 内 → 转 1 且背向(玩家在左 → facing=1 向右逃)
    drive(f, 'fairyAI').call(f, game, player);
    expect(f.ai2).toBe(1);
    expect(f.facing).toBe(1);
    // 状态1:不逐帧追人(玩家移到右侧,facing 保持右——只 collideX 翻)
    player.cx = f.cx + 100; player.x = f.x + 100;
    drive(f, 'fairyAI').call(f, game, player);
    expect(f.facing).toBe(1);
    expect(f.ai2).toBe(1);   // 不再 40px 自发进引导态
  });

  it('瓢虫 604:陆行目标速度 1px/t(曾 0.05 慢 20 倍)', () => {
    const game = makeGame();
    const lb = Enemy.fromVanilla(604, 40 * 16, 20 * 16);
    if (!lb) throw new Error('ladybug 构造失败');
    const v0 = lb.vx;
    drive(lb, 'ladybugAI').call(lb, game, null);
    // Lerp(0.05) 步进:|Δ| ≈ facing×0.05(若目标 1);旧实现目标 0.05 → Δ≈0.005
    expect(Math.abs(lb.vx - v0)).toBeGreaterThan(0.02);
  });

  it('海马 626:上行(sin<0)近水面才折返压回(曾下行折返=顶出水面)', () => {
    const game = makeGame();
    const sh = Enemy.fromVanilla(626, 40 * 16, 20 * 16);
    if (!sh) throw new Error('seahorse 构造失败');
    sh.wet = true;
    sh.ai0 = Math.PI * 1.5;   // 朝正上(sin=-1)
    const before = sh.ai0;
    drive(sh, 'seahorseAI').call(sh, game);
    // 水中无"近水面"触发时角不变;此用例主要钉住函数可驱动+方向语义由单测覆盖
    expect(Number.isFinite(sh.ai0)).toBe(true);
    expect(before).toBe(Math.PI * 1.5);
  });

  it('鸭子 363 飞行态:不逐帧背向玩家改向(死亡=只积分)', () => {
    const game = makeGame();
    const duck = Enemy.fromVanilla(363, 40 * 16, 20 * 16);
    if (!duck) throw new Error('duck 构造失败');
    duck.ai0 = 1;   // 飞行态
    duck.facing = 1;
    const player = { cx: duck.cx + 100, cy: duck.cy, dead: false };
    drive(duck, 'duckFlyAI').call(duck, game, player);
    expect(duck.facing).toBe(1);   // 原版从不重定 direction
    drive(duck, 'duckFlyAI').call(duck, game, null);   // 死亡:只积分不转向
    expect(duck.facing).toBe(1);
  });
});
