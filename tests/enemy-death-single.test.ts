// 死亡单次门回归(用户报"多弹头武器打出双份僵尸碎块"):
// pierce=1 豁免免疫帧后同 tick 多弹头全部进 hurt——首发致死,后续弹头曾对
// "已死未出列"敌怪二次触发死亡管线(碎块/掉落/音效翻倍)。门 = hurt 入口
// this.dead 早退(原版 Damage_PVE 的 npc.active 前置门 :11869 等价)。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';

function makeGame(counters: { killed: number; drops: number; sfx: number }) {
  return {
    enemies: () => [] as unknown[],
    spawnDrop: () => { counters.drops++; return null; },
    playSfx: () => { counters.sfx++; },
    playSfxFiles: () => { counters.sfx++; },
    spawnParticles: () => {},
    onEnemyKilled: () => { counters.killed++; },
    cutTile: () => {},
    world: { flags: {} as Record<string, boolean>, difficulty: 0, isExpert: false },
    player: { hp: 100, maxHp: 100, dead: false, luck: 0, team: 0, buffs: { has: () => false }, addDPS: () => {} },
  } as unknown as GameHooks;
}

describe('多弹头同 tick 命中:死亡管线只跑一次', () => {
  it('两发 pierce=1 同帧连击僵尸:onEnemyKilled 只 1 次(掉落/音效同源)', () => {
    const c = { killed: 0, drops: 0, sfx: 0 };
    const game = makeGame(c);
    const e = Enemy.fromVanilla(3, 100 * 16, 50 * 16); // 僵尸 type 3
    expect(e).not.toBeNull();
    const hp = e!.hp;
    e!.hurt(hp + 100, 0, 0, game, 0, false, 1, true);   // 首发致死(pierce=1 豁免免疫帧)
    expect(e!.dead).toBe(true);
    expect(c.killed).toBe(1);
    // 同 tick 第二发(霰弹次弹/食人鱼咬+随从同帧):不得二次触发
    const ok = e!.hurt(9999, 0, 0, game, 0, false, 1, true);
    expect(ok).toBe(false);
    expect(e!.dead).toBe(true);
    expect(c.killed).toBe(1);
  });

  it('八发霰弹同帧:死亡恰好一次', () => {
    const c = { killed: 0, drops: 0, sfx: 0 };
    const game = makeGame(c);
    const e = Enemy.fromVanilla(3, 100 * 16, 50 * 16)!;
    for (let i = 0; i < 8; i++) e.hurt(e.hp + 50, 0, 0, game, 0, false, 1, true);
    expect(c.killed).toBe(1);
    expect(e.dead).toBe(true);
  });

  it('未致死时正常:门不吞伤害(hurt 契约=仅致死返回 true)', () => {
    const c = { killed: 0, drops: 0, sfx: 0 };
    const game = makeGame(c);
    const e = Enemy.fromVanilla(3, 100 * 16, 50 * 16)!;
    const hp0 = e.hp;
    e.hurt(10, 0, 0, game, 0, false, 1, true);
    expect(e.hp).toBeLessThan(hp0);          // 伤害生效
    expect(e.dead).toBe(false);              // 门没误杀
    expect(c.killed).toBe(0);
  });
});
