// ★刀5(2026-10-13)具名修正槽 + canUse 声明规则守卫:槽封闭集/anchor fail-loud/
//   per-mod 单注册/值链/空槽直通/canUse 规则解释器(ownedProjBelow 门)。
//   消费面锚:Game.quickConsume healLife(Player.ApplyLifeAndOrMana)/
//   Player tick equipRegen(Player.UpdateLifeRegen)/runModCanUse。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerVanillaOverride, runVanillaOverrideValue, VANILLA_OVERRIDE_SLOTS,
  registerModCanUseRule, registerModCanUse, runModCanUse, _resetModHooksForTests,
} from '../src/mods/hooks';

describe('具名修正槽(刀5)', () => {
  beforeEach(() => _resetModHooksForTests());

  it('槽封闭集:未知槽/anchor 不匹配 fail-loud;匹配注册成功', () => {
    expect(() => registerVanillaOverride('NPC.NPCLoot' as never, 1, 'm', () => {})).toThrow(/未知覆写槽/);
    expect(() => registerVanillaOverride('Player.ApplyLifeAndOrMana', 2, 'm', () => {})).toThrow(/anchor 不匹配/);
    registerVanillaOverride('Player.ApplyLifeAndOrMana', 1, 'm', () => 10);
    expect(Object.keys(VANILLA_OVERRIDE_SLOTS)).toContain('Player.UpdateLifeRegen');
  });

  it('空槽直通(零分配门);值链=后钩吃前钩产物', () => {
    expect(runVanillaOverrideValue('Player.ApplyLifeAndOrMana', 70, { vid: 288 })).toBe(70);
    registerVanillaOverride('Player.ApplyLifeAndOrMana', 1, 'a', (ctx) => (ctx.value as number) + 5);
    registerVanillaOverride('Player.ApplyLifeAndOrMana', 1, 'b', (ctx) => (ctx.value as number) * 2);
    expect(runVanillaOverrideValue('Player.ApplyLifeAndOrMana', 70, { vid: 288 })).toBe(150);   // (70+5)×2
  });

  it('非有限/void 返值跳过;per-mod 单注册 fail-fast;reset 清账', () => {
    registerVanillaOverride('Player.UpdateLifeRegen', 1, 'a', () => Number.NaN);
    registerVanillaOverride('Player.UpdateLifeRegen', 1, 'b', () => undefined);
    expect(runVanillaOverrideValue('Player.UpdateLifeRegen', 3)).toBe(3);   // 双钩均不改
    expect(() => registerVanillaOverride('Player.UpdateLifeRegen', 1, 'a', () => 1)).toThrow(/重复注册/);
    _resetModHooksForTests();
    expect(runVanillaOverrideValue('Player.UpdateLifeRegen', 9)).toBe(9);
  });
});

describe('canUse 声明规则解释器(刀5-A 族 ownedProjBelow)', () => {
  beforeEach(() => _resetModHooksForTests());

  const fakeGame = (counts: Array<{ projId: number; dead?: boolean }>) =>
    ({ input: { mouseX: 0, mouseY: 0 }, player: {},
      entities: { projectiles: counts.map((c) => ({ projId: c.projId, dead: c.dead ?? false })) } }) as never;
  const def = { vid: 30000 } as never;
  const item = { id: 1, stack: 1 } as never;

  it('在场数 < lt 可用;≥ lt 拒;dead 不计;无规则恒可用', () => {
    registerModCanUseRule(30000, { ownedProjBelow: { proj: 2000, lt: 2 } });
    expect(runModCanUse(fakeGame([{ projId: 2000 }, { projId: 2000 }, { projId: 2001 }]) as never, def, item)).toBe(false);   // 2 ≥ 2 拒
    expect(runModCanUse(fakeGame([{ projId: 2000 }, { projId: 2001 }, { projId: 2000, dead: true }]) as never, def, item)).toBe(true);    // 1 < 2 可用
    _resetModHooksForTests();
    expect(runModCanUse({} as never, def, item)).toBe(true);    // 无规则恒真
  });

  it('fail-fast;合取门(规则过→落代码钩);实体表缺=可用(fail-open)', () => {
    registerModCanUseRule(30000, { ownedProjBelow: { proj: 2000, lt: 1 } });
    expect(() => registerModCanUseRule(30000, {})).toThrow(/重复注册/);
    expect(() => registerModCanUseRule(46, {})).toThrow(/≥30000/);
    // ★R-C-F3 合取门:规则过→代码钩可达(钩拒=拒)
    registerModCanUseRule(30001, { ownedProjBelow: { proj: 2000, lt: 5 } });
    registerModCanUse(30001 as never, () => false);
    expect(runModCanUse(fakeGame([]) as never, { vid: 30001 } as never, item)).toBe(false);   // 规则过,钩拒
    expect(runModCanUse(fakeGame([{ projId: 2000 }, { projId: 2000 }]) as never, { vid: 30001 } as never, item)).toBe(false); // 规则拒
    // 实体表缺=fail-open(规则门跳过)
    expect(runModCanUse({} as never, { vid: 30000 } as never, item)).toBe(true);
  });
});
