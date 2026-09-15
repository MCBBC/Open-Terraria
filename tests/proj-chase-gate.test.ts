// CanBeChasedBy 索敌门回归（NPC.cs:91141-91147,1457 全表核对批 2026-09-02）：
// 用户实报"叶绿弹对游荡眼球怪不跟踪"根因 = 曾误列 vid 133/416（原版可索敌族）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { canBeChasedBy } from '../src/entities/projTargets';

// ★BJ89：夹具改喂真实字段——EnemyDef 只有 hp（幻影字段 def.lifeMax 判例
// bj73-radar-count-phantom-field 姊妹病灶：旧夹具喂 lifeMax 恰好镜像了
// `def?.lifeMax` 恒 undefined 的降级跳过 = 门整缺仍"绿"）。maxHp = 运行时
// NPC.lifeMax（Enemy.ts fromVanilla），def.hp = 构造兜底。
const mk = (vanillaId: number | null, opts: { lifeMax?: number; dontTakeDamage?: boolean; friendly?: boolean; dead?: boolean } = {}) => ({
  vanillaId,
  maxHp: opts.lifeMax ?? 300,
  def: { hp: opts.lifeMax ?? 300, friendly: opts.friendly ?? false },
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

  // ★BJ89 幻影字段守卫（bj73 姊妹病灶）：门读运行时 maxHp ?? def.hp——
  //  读 `def?.lifeMax` 恒 undefined = 门整缺（兔等 critter 可被随从索敌）。
  //  变异证红：把实现改回 `t.def?.lifeMax` 本用例即红（lifeMax 不在 EnemyDef）。
  it('lifeMax>5 门读 maxHp（运行时 NPC.lifeMax）?? def.hp（结构锁：幻影字段死灰复燃即红）', () => {
    // 仅 maxHp（Enemy 实体主面）：5=兔族拒 / 6=过门 / 300 常规过
    expect(canBeChasedBy({ vanillaId: 1, maxHp: 5, def: { friendly: false } })).toBe(false);
    expect(canBeChasedBy({ vanillaId: 1, maxHp: 6, def: { friendly: false } })).toBe(true);
    // 仅 def.hp（纯对象兜底）：同门
    expect(canBeChasedBy({ vanillaId: 1, def: { hp: 5, friendly: false } })).toBe(false);
    expect(canBeChasedBy({ vanillaId: 1, def: { hp: 6, friendly: false } })).toBe(true);
    // 两者都缺：门降级跳过（未知实体不因缺字段误拒——与旧守卫语义同向）
    expect(canBeChasedBy({ vanillaId: 1, def: { friendly: false } })).toBe(true);
    // maxHp 与 def.hp 并存：maxHp 优先（原版读运行时 lifeMax——ScaleStats 终值）
    expect(canBeChasedBy({ vanillaId: 1, maxHp: 300, def: { hp: 5, friendly: false } })).toBe(true);
  });

  it('结构锁：canBeChasedBy 源文本不读幻影字段 def?.lifeMax（bj73 判例防复发）', () => {
    const src = readFileSync(new URL('../src/entities/projTargets.ts', import.meta.url), 'utf8');
    expect(src).not.toContain('t.def?.lifeMax');
    expect(src).toContain('t.maxHp ?? t.def?.hp');
  });
});
