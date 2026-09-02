// CanBeChasedBy 索敌门回归（NPC.cs:91141-91147,1457 全表核对批 2026-09-02）：
// 用户实报"叶绿弹对游荡眼球怪不跟踪"根因 = 曾误列 vid 133/416（原版可索敌族）。
import { describe, it, expect } from 'vitest';
import { canBeChasedBy } from '../src/entities/projTargets';

const mk = (vanillaId: number | null, opts: { lifeMax?: number; dontTakeDamage?: boolean; friendly?: boolean; dead?: boolean } = {}) => ({
  vanillaId,
  def: { lifeMax: opts.lifeMax ?? 300, friendly: opts.friendly ?? false },
  dontTakeDamage: opts.dontTakeDamage,
  dead: opts.dead,
});

describe('canBeChasedBy（原版 immortal/chaseable=false 面逐 vid 对齐）', () => {
  it('可索敌族：游荡眼球 133 / 日耀钻背骑士 416（2026-09-02 纠偏——原版无 immortal/chaseable 门）', () => {
    expect(canBeChasedBy(mk(133))).toBe(true);
    expect(canBeChasedBy(mk(416))).toBe(true);
    expect(canBeChasedBy(mk(51))).toBe(true);    // 丛林蝙蝠（51≠眼球,id 移位勿对号）
  });

  it('immortal=true 族：488 训练假人(:14630)/690 伪装雕像(:17715) 拒', () => {
    for (const vid of [488, 690]) expect(canBeChasedBy(mk(vid))).toBe(false);
  });

  it('chaseable=false 族：379/380 教徒弓手(:13882)/399 火星探测/437/438/440/523 拒', () => {
    for (const vid of [379, 380, 399, 437, 438, 440, 523]) expect(canBeChasedBy(mk(vid))).toBe(false);
  });

  it('通用门：小生命 critter(lifeMax≤5)/dontTakeDamage/friendly/dead 拒', () => {
    expect(canBeChasedBy(mk(1, { lifeMax: 5 }))).toBe(false);
    expect(canBeChasedBy(mk(1, { dontTakeDamage: true }))).toBe(false);
    expect(canBeChasedBy(mk(1, { friendly: true }))).toBe(false);
    expect(canBeChasedBy(mk(133, { dead: true }))).toBe(false);
  });
});
