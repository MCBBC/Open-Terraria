// ★刀4-A(2026-10-13)命中链扩容四钩守卫:弹侧两新族(倍率链)+ modifyHurtByNpc 域门
//   撤除(原版攻端进链)+ modifyHitNpc ctx 加宽。纪律同 mod-onhit.test.ts:
//   注册 fail-fast / 空表恒等 / ctx 透传。锚点见 docs/mod-five-knives-recon-2026-10-13.md。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerModModifyHitNpcByProj, runModModifyHitNpcByProj,
  registerModModifyHitPlayerByProj, runModModifyHitPlayerByProj,
  registerModModifyHurtByNpc, runModModifyHurtByNpc,
  registerModModifyHitNpc, runModModifyHitNpc,
  _resetModHooksForTests,
} from '../src/mods/hooks';

describe('modifyHitNpcByProj(玩家弹→NPC 倍率链,ModifyHitNPCWithProj 形)', () => {
  beforeEach(() => _resetModHooksForTests());

  it('空表=恒等(零成本门)', () => {
    expect(runModModifyHitNpcByProj({}, {}, 5, 42, 100, false)).toBe(100);
  });

  it('倍率连乘;ctx 六字段透传', () => {
    const seen: Array<Record<string, unknown>> = [];
    registerModModifyHitNpcByProj('a', (ctx) => { seen.push({ ...ctx }); return 2; });
    registerModModifyHitNpcByProj('b', () => 1.5);
    const out = runModModifyHitNpcByProj({ p: 1 }, { g: 1 }, 1126, 42, 100, true);
    expect(out).toBe(300);            // 100 × 2 × 1.5(纯倍率不取整,终值取整在 hurt 内)
    expect(seen).toEqual([
      { player: { p: 1 }, game: { g: 1 }, projVid: 1126, targetVid: 42, dmg: 100, crit: true },
    ]);
  });

  it('void/非有限返值跳过(不改倍率)', () => {
    registerModModifyHitNpcByProj('a', () => undefined);
    registerModModifyHitNpcByProj('b', () => Number.NaN);
    expect(runModModifyHitNpcByProj({}, {}, 5, 42, 70, false)).toBe(70);
  });

  it('重复注册 fail-fast', () => {
    registerModModifyHitNpcByProj('a', () => {});
    expect(() => registerModModifyHitNpcByProj('a', () => {})).toThrow(/重复注册/);
  });
});

describe('modifyHitPlayerByProj(敌弹→玩家倍率链,ModifyHitByProjectile 形)', () => {
  beforeEach(() => _resetModHooksForTests());

  it('空表=恒等;倍率连乘;trap/pvp 透传', () => {
    expect(runModModifyHitPlayerByProj({}, {}, 919, 50, false, false)).toBe(50);
    const ctxs: Array<Record<string, unknown>> = [];
    registerModModifyHitPlayerByProj('m', (ctx) => { ctxs.push({ ...ctx }); return 0.5; });
    expect(runModModifyHitPlayerByProj({ p: 1 }, { g: 1 }, 452, 80, true, false)).toBe(40);
    expect(ctxs).toEqual([
      { player: { p: 1 }, game: { g: 1 }, projVid: 452, dmg: 80, trap: true, pvp: false },
    ]);
  });

  it('重复注册 fail-fast', () => {
    registerModModifyHitPlayerByProj('m', () => {});
    expect(() => registerModModifyHitPlayerByProj('m', () => {})).toThrow(/重复注册/);
  });
});

describe('modifyHurtByNpc 域门撤除(刀4-A:原版攻端进链)', () => {
  beforeEach(() => _resetModHooksForTests());

  it('空表=恒等(含原版攻端)', () => {
    expect(runModModifyHurtByNpc({}, {} as never, 50, 30, true)).toBe(30);    // 原版 vid
    expect(runModModifyHurtByNpc({}, {} as never, 800, 30, true)).toBe(30);   // mod vid
  });

  it('原版攻端(vid<800)现进值链;mod 攻端同相;值语义 Math.max(0,round)', () => {
    const vids: number[] = [];
    registerModModifyHurtByNpc('m', (ctx) => { vids.push(ctx.attackerVid); return ctx.dmg * 2; });
    expect(runModModifyHurtByNpc({}, {} as never, 50, 31, true)).toBe(62);    // 原版攻端=新覆盖面
    expect(runModModifyHurtByNpc({}, {} as never, 800, 10, false)).toBe(20);  // mod 攻端=旧语义保持
    expect(vids).toEqual([50, 800]);
    expect(runModModifyHurtByNpc({}, {} as never, 50, 21, true)).toBe(42);
    registerModModifyHurtByNpc('m2', () => -5);                      // 值链钳 0
    expect(runModModifyHurtByNpc({}, {} as never, 50, 21, true)).toBe(0);
  });
});

describe('modifyHitNpc ctx 加宽(刀4-A:crit/kb/armorPen 透传)', () => {
  beforeEach(() => _resetModHooksForTests());

  it('extra 可选参数透传;缺省 undefined 零感知', () => {
    const seen: Array<Record<string, unknown>> = [];
    registerModModifyHitNpc('m', (ctx) => { seen.push({ ...ctx }); return 1; });
    expect(runModModifyHitNpc({}, {} as never, 30000, 50)).toBe(50);
    expect(seen[0]).toEqual({ player: {}, game: {}, vid: 30000, dmg: 50 });
    runModModifyHitNpc({ p: 1 }, { g: 1 } as never, 30000, 50, { crit: true, kb: 3.5, armorPen: 6 });
    expect(seen[1]).toEqual({ player: { p: 1 }, game: { g: 1 }, vid: 30000, dmg: 50, crit: true, kb: 3.5, armorPen: 6 });
  });
});
