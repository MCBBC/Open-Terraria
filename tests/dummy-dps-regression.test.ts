// 训练假人 DPS 计回归（2026-09-02 用户报"DPS 计量器对假人无秒伤"）:
//  Enemy.hurt 的 488 分支曾提前 return true,永久跳过公共受击尾段——
//  ①addDPS 累计（原版 ApplyDamageToNPC :20164-20168 对假人同样累计,accDreamCatcher
//    门禁在 addDPS 内侧）②AnyInteractions 玩家交互位（雕像门 :79651）③MP 交互登记。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';

function makeGame(): GameHooks {
  const world = new World(96, 48, 7, 'dummy-dps');
  world.groundLevel = 16;
  world.rockLevel = 32;
  return {
    world,
    player: null,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfxFiles: () => {},
    playSfxWav: () => {},
    onEnemyKilled: () => {},
    net: { active: false, mySlot: 0 },
  } as unknown as GameHooks;
}

function mkDummy(tx = 40, ty = 20): Enemy {
  const e = Enemy.fromVanilla(488, tx * 16, ty * 16);
  if (!e) throw new Error('488 构造失败');
  e.dummyAnchor = [tx, ty];
  return e;
}

describe('训练假人 488 受击公共尾段', () => {
  it('fromPlayer 命中必须进 DPS 计累计 + 置 AnyInteractions（曾 488 早退全跳过）', () => {
    const g = makeGame();
    const dpsHits: number[] = [];
    (g as { player: unknown }).player = { addDPS: (d: number) => dpsHits.push(d), dead: false };
    const dummy = mkDummy();
    const dealt = dummy.hurt(100, 1, 0, g, 0, false, 0, true);
    expect(dealt).toBe(true);
    expect(dummy.lastStrikeDealt).toBe(100);       // 幽灵套门数据源不受影响
    expect(dummy.dummyShake).toBeGreaterThan(0);   // 摇晃照常
    expect(dpsHits).toEqual([100]);                // ★曾恒 []（488 早退跳过 addDPS）
    expect(dummy.playerInteracted).toBe(true);     // AnyInteractions（雕像门 :79651）
  });

  it('非玩家源不进 DPS 计（fromPlayer 门保持）', () => {
    const g = makeGame();
    const dpsHits: number[] = [];
    (g as { player: unknown }).player = { addDPS: (d: number) => dpsHits.push(d), dead: false };
    const dummy = mkDummy();
    dummy.hurt(100, 1, 0, g, 0, false, 0, false);
    expect(dpsHits).toEqual([]);
    expect(dummy.lastStrikeDealt).toBe(100);       // 摇晃/结算照走
  });
});
