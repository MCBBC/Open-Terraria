// 训练假人 DPS 计回归（2026-09-02 用户报"DPS 计量器对假人无秒伤"）:
//  Enemy.hurt 的 488 分支曾提前 return true,永久跳过公共受击尾段——
//  ①addDPS 累计（原版 ApplyDamageToNPC :20164-20168 对假人同样累计,accDreamCatcher
//    门禁在 addDPS 内侧）②AnyInteractions 玩家交互位（雕像门 :79651）③MP 交互登记。
//  同批:DoT 直扣 immortal 守卫（闪烁血条）+ realLife 重定向 + soulDrain realLife 门。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TILE_BY_KEY } from '../src/data/tiles';
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

  it('DoT immortal 守卫:488 吃燃烧不扣血/不拉血条计时（曾闪烁血条）', () => {
    const g = makeGame();
    for (let x = 36; x <= 44; x++) g.world.store.setTileSilent(x, 24, 1, 0, 0);   // 地板
    // 锚 tile 378（internal 238）——dummyAI 每拍校验,缺=自灭
    g.world.store.setTileSilent(40, 22, TILE_BY_KEY['v_378_target_dummy'], 0, 0);
    const dummy = mkDummy(40, 22);
    dummy.y = 24 * 16 - dummy.h;
    expect(dummy.immortal).toBe(true);             // fromVanilla 接线（NPC.cs:14630）
    dummy.onFireT = 600;                           // 燃烧 10s
    for (let i = 0; i < 120; i++) dummy.fixedUpdate(1 / 60, g);
    expect(dummy.hp).toBe(dummy.maxHp);            // hp 恒满(曾每 tick 被 DoT 裸扣)
    expect(dummy.hpBarT).toBe(0);                  // 血条计时零=血条不出现
    expect(dummy.dead).toBe(false);
  });

  it('DoT realLife 重定向:共享血池族打节段=扣头血池;soulDrain 对共享池族免伤（:92802）', () => {
    const g = makeGame();
    const head = Enemy.fromVanilla(454, 40 * 16, 20 * 16)!;
    head.id = 1;
    // 幻影龙 5 节链（455-459,sharedLife → 节 realLifeHost=头）
    const segs = Enemy.spawnWormChain(head, 5, [455, 456, 457, 458, 459], true);
    const seg = segs[0];
    const poolBefore = head.hp;
    seg.shadowFlameT = 600;                        // 暗焰 DoT 打节段
    for (let i = 0; i < 120; i++) seg.fixedUpdate(1 / 60, g);
    expect(head.hp).toBeLessThan(poolBefore);      // ★曾直扣节段 hp=下次 hurt 被头池覆盖(DoT 白打)
    expect(seg.hp).toBe(head.hp);                  // 节 hp 镜像头池
    // soulDrain 对共享池族:不扣（:92802 realLife==-1 门）
    const poolAt = head.hp;
    seg.soulDrainT = 600;
    seg.shadowFlameT = 0;
    seg.shadowFlameDoT = 0;
    for (let i = 0; i < 120; i++) seg.fixedUpdate(1 / 60, g);
    expect(head.hp).toBe(poolAt);
  });
});
