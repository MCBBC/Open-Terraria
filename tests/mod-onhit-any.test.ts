// ★四百七十刀 OnHit 域通用命中钩:注册 fail-fast + 单 ctx 形 + 派发面 + 空表零成本。
// 引擎接线(Enemy.hurt 受理尾派发)由 e2e 域覆盖;本文件=钩子契约锁。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerModOnHitAny, runModOnHitAny, _resetModHooksForTests } from '../src/mods/hooks';

describe('mod onHitAny 钩(C# CalamityPlayerOnHit.ItemOnHit/ProjOnHit 形)', () => {
  beforeEach(() => _resetModHooksForTests());

  it('注册+派发:单 ctx 形(e/game/damage/crit/killed/projId/melee 全透传)', () => {
    const seen: Array<Record<string, unknown>> = [];
    registerModOnHitAny('calamity', (ctx) => { seen.push({ ...ctx }); });
    const enemy = { vid: 42, hp: 10 };
    runModOnHitAny(enemy as never, { tick: 1 } as never,
      { damage: 55, crit: true, killed: false, projId: 77, melee: false });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.e).toBe(enemy);
    expect(seen[0]!.game).toEqual({ tick: 1 });
    expect(seen[0]!.damage).toBe(55);
    expect(seen[0]!.crit).toBe(true);
    expect(seen[0]!.killed).toBe(false);
    expect(seen[0]!.projId).toBe(77);
    expect(seen[0]!.melee).toBe(false);
  });

  it('killed 支与存活支同形(两处派发点契约一致)', () => {
    const seen: boolean[] = [];
    registerModOnHitAny('calamity', (ctx) => { seen.push(ctx.killed); });
    runModOnHitAny({} as never, {} as never, { damage: 1, crit: false, killed: true, projId: 0, melee: true });
    runModOnHitAny({} as never, {} as never, { damage: 1, crit: false, killed: false, projId: 0, melee: true });
    expect(seen).toEqual([true, false]);
  });

  it('零注册=零成本空跑(不抛不调)', () => {
    expect(() => runModOnHitAny({} as never, {} as never,
      { damage: 1, crit: false, killed: false, projId: 0, melee: true })).not.toThrow();
  });

  it('mod 消费器抛错不炸伤害管线(warn 吞,余链继续)', () => {
    const calls: number[] = [];
    registerModOnHitAny('bad', () => { throw new Error('boom'); });
    registerModOnHitAny('good', (ctx) => { calls.push(ctx.damage); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    runModOnHitAny({} as never, {} as never, { damage: 9, crit: false, killed: false, projId: 0, melee: false });
    expect(calls).toEqual([9]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('重复注册 fail-fast', () => {
    registerModOnHitAny('calamity', () => {});
    expect(() => registerModOnHitAny('calamity', () => {})).toThrow(/重复注册/);
  });
});

// ---- 引擎接线(Enemy.hurt 受理尾派发;真敌 hurt 驱动) ----
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';

function makeGame(): GameHooks {
  const world = new World(96, 48, 7, 'onhit-any');
  world.groundLevel = 16;
  world.rockLevel = 32;
  return {
    world, enemies: () => [], critters: () => [],
    // 致死支掉落面读最近结算玩家标量(luck/hp/mana 族)——stub 全字段
    player: { luck: 0, hp: 100, maxHp: 100, mana: 100, maxMana: 100, dead: false, addDPS: () => {} },
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, spawnParticles: () => {}, playSfxFiles: () => {},
    playSfxWav: () => {}, onEnemyKilled: () => {},
    net: { active: false, mySlot: 0 },
  } as unknown as GameHooks;
}

describe('Enemy.hurt onHitAny 派发缝(四百七十刀引擎接线)', () => {
  beforeEach(() => _resetModHooksForTests());

  it('玩家来源存活伤进链(killed=false,damage=raw)', () => {
    const seen: Array<{ killed: boolean; damage: number; melee: boolean }> = [];
    registerModOnHitAny('calamity', (c) => seen.push({ killed: c.killed, damage: c.damage, melee: c.melee }));
    const g = makeGame();
    const z = Enemy.fromVanilla(3, 40 * 16, 16 * 16);   // 僵尸 45 HP
    if (!z) throw new Error('僵尸构造失败');
    z.hurt(10, 1, 0, g, 0, false, 0, true);
    expect(seen).toEqual([{ killed: false, damage: 10, melee: true }]);
  });

  it('致死伤进链(killed=true)', () => {
    const seen: boolean[] = [];
    registerModOnHitAny('calamity', (c) => seen.push(c.killed));
    const g = makeGame();
    const z = Enemy.fromVanilla(3, 40 * 16, 16 * 16);
    if (!z) throw new Error('僵尸构造失败');
    z.hurt(9999, 1, 0, g, 0, false, 0, true);
    expect(seen).toEqual([true]);
  });

  it('NPC 互伤(fromPlayer=false)不进链', () => {
    let fired = 0;
    registerModOnHitAny('calamity', () => { fired++; });
    const g = makeGame();
    const z = Enemy.fromVanilla(3, 40 * 16, 16 * 16);
    if (!z) throw new Error('僵尸构造失败');
    z.hurt(10, 1, 0, g, 0, false, 0, false);
    expect(fired).toBe(0);
  });
});
