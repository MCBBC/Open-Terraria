// ★B/C 批(2026-10-13)全局 NPC 钩族+ModPlayer 级守卫:注册 fail-fast/空表恒等/
//   值链/事件链/preHurt 拒伤面。消费面锚:Enemy AI 分派(preAi/postAi)/hurt 防御段
//   (incomingHit)/hurt 尾(onHitByAny)/onEnemyKilled(onKill)/Player.damage
//   (preHurt/postHurt)/respawnPlayer/死亡 tick(updateDead)/移动合成(moveSpeed)。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerGlobalNpcHooks, runModNpcPreAiBlocked, runModNpcPostAi, runModNpcIncomingHit,
  runModOnNpcHitByAny, runModOnKillAnyNpc,
  registerModPlayerPreHurt, runModPlayerPreHurt,
  registerModPlayerPostHurt, runModPlayerPostHurt,
  registerModPlayerRespawn, runModPlayerRespawn,
  registerModPlayerUpdateDead, runModPlayerUpdateDead,
  registerModPlayerModifyMoveSpeed, runModPlayerModifyMoveSpeed,
  _resetModHooksForTests,
} from '../src/mods/hooks';

const fakeE = { vanillaId: 42 } as never;

describe('GlobalNPC 钩族(B 批)', () => {
  beforeEach(() => _resetModHooksForTests());

  it('preAi:空表直通;单钩 false=阻断;true/void=放行;fail-fast', () => {
    expect(runModNpcPreAiBlocked(fakeE, {})).toBe(false);
    registerGlobalNpcHooks('a', { preAi: () => false });
    expect(runModNpcPreAiBlocked(fakeE, {})).toBe(true);
    _resetModHooksForTests();
    registerGlobalNpcHooks('a', { preAi: () => true });
    expect(runModNpcPreAiBlocked(fakeE, {})).toBe(false);
    expect(() => registerGlobalNpcHooks('a', {})).toThrow(/重复注册/);
  });

  it('postAi:空表零调;多链依序', () => {
    let n = 0;
    runModNpcPostAi(fakeE, {});           // 空表零调零异常
    registerGlobalNpcHooks('a', { postAi: () => { n += 1; } });
    registerGlobalNpcHooks('b', { postAi: () => { n += 2; } });
    runModNpcPostAi(fakeE, {});
    expect(n).toBe(3);
  });

  it('incomingHit 值链:后钩吃前钩产物;非有限跳过;空表直通', () => {
    expect(runModNpcIncomingHit(fakeE, 100)).toBe(100);
    registerGlobalNpcHooks('a', { incomingHit: (e, ctx) => ctx.value * 0.5 });
    registerGlobalNpcHooks('b', { incomingHit: (e, ctx) => ctx.value + 10 });
    expect(runModNpcIncomingHit(fakeE, 100)).toBe(60);   // (100×0.5)+10
    registerGlobalNpcHooks('c', { incomingHit: () => Number.NaN });
    expect(runModNpcIncomingHit(fakeE, 100)).toBe(60);   // NaN 跳过
  });

  it('onHitByAny/onKill 事件链:ctx 全载荷;异常吞不拖垮', () => {
    const seen: Array<Record<string, unknown>> = [];
    registerGlobalNpcHooks('a', { onHitByAny: (e, ctx) => { seen.push({ ...ctx }); throw new Error('吞'); } });
    registerGlobalNpcHooks('b', { onHitByAny: (e, ctx) => { seen.push({ ...ctx }); } });
    runModOnNpcHitByAny(fakeE, {}, { damage: 30, crit: true, killed: false, projId: 5 });
    expect(seen).toHaveLength(2);
    let killed = 0;
    registerGlobalNpcHooks('c', { onKill: () => { killed++; } });
    runModOnKillAnyNpc(fakeE, {});
    expect(killed).toBe(1);
  });
});

describe('ModPlayer 级五 kind(B/C 批)', () => {
  beforeEach(() => _resetModHooksForTests());

  it('preHurt 值链:返 0=拒伤;非有限跳过;空表直通', () => {
    expect(runModPlayerPreHurt({}, {}, 50)).toBe(50);
    registerModPlayerPreHurt('a', (ctx) => (ctx.dmg as number) - 20);
    expect(runModPlayerPreHurt({}, {}, 50)).toBe(30);
    registerModPlayerPreHurt('b', () => 0);              // 拒伤
    expect(runModPlayerPreHurt({}, {}, 50)).toBe(0);
    expect(() => registerModPlayerPreHurt('a', () => 1)).toThrow(/重复注册/);
  });

  it('postHurt/respawn/updateDead 通知链载荷透传', () => {
    const seen: Array<Record<string, unknown>> = [];
    registerModPlayerPostHurt('a', (ctx) => seen.push({ k: 'post', ...ctx }));
    registerModPlayerRespawn('a', (p) => seen.push({ k: 'resp', p }));
    registerModPlayerUpdateDead('a', (ctx) => seen.push({ k: 'dead', ...ctx }));
    runModPlayerPostHurt({ hp: 1 }, {}, 7);
    runModPlayerRespawn({ hp: 100 }, {});
    runModPlayerUpdateDead({ hp: 0 }, {}, 600, 12);
    expect(seen).toEqual([
      { k: 'post', player: { hp: 1 }, game: {}, reduction: 7 },
      { k: 'resp', p: { hp: 100 } },
      { k: 'dead', player: { hp: 0 }, game: {}, respawnTimer: 600, deadTime: 12 },
    ]);
  });

  it('modifyMoveSpeed 乘区链:空表=1;连乘;非有限跳过', () => {
    expect(runModPlayerModifyMoveSpeed({}, {})).toBe(1);
    registerModPlayerModifyMoveSpeed('a', () => 1.2);
    registerModPlayerModifyMoveSpeed('b', () => 0.5);
    expect(runModPlayerModifyMoveSpeed({}, {})).toBeCloseTo(0.6);
    registerModPlayerModifyMoveSpeed('c', () => undefined);
    expect(runModPlayerModifyMoveSpeed({}, {})).toBeCloseTo(0.6);
  });
});
