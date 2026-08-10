// Buff 系统测试（1.4.5.6 语义）：
// 1) AddBuff max 合并（Player.cs:5138 TryUpdatingExistingBuffTime：续期不缩短）
// 2) Honey(48)：1 HP/s、浸入续期恒 30s、离开倒计时
// 3) Regeneration(2)：2 HP/s（lifeRegen+4）
// 4) Ironskin(5)：防御 +8（1456 数值）
// 5) 到期自动移除
import { describe, it, expect } from 'vitest';
import { BuffState, BuffType } from '../src/stats/Buffs';

describe('Buff 框架（AddBuff 语义）', () => {
  it('apply 取 max：续期不缩短、短时长不覆盖长时长', () => {
    const b = new BuffState();
    b.apply(BuffType.Honey, 30);
    b.apply(BuffType.Honey, 10);          // 短不覆盖长
    expect(b.active.get(BuffType.Honey)).toBe(30);
    b.apply(BuffType.Honey, 30);          // 等值保持
    expect(b.active.get(BuffType.Honey)).toBe(30);
    b.tick(10);                            // 剩 20
    b.apply(BuffType.Honey, 30);          // 浸入续期回满
    expect(b.active.get(BuffType.Honey)).toBe(30);
  });

  it('到期自动移除', () => {
    const b = new BuffState();
    b.apply(BuffType.Regen, 1);
    b.tick(0.9);
    expect(b.has(BuffType.Regen)).toBe(true);
    b.tick(0.2);
    expect(b.has(BuffType.Regen)).toBe(false);
  });
});

describe('蜂蜜 Buff（48）', () => {
  it('浸入语义：1 HP/s 持续回复，30 秒窗口', () => {
    const b = new BuffState();
    b.apply(BuffType.Honey, 30);
    let healed = 0;
    for (let k = 0; k < 600; k++) healed += b.tick(1 / 60);   // 10 秒
    expect(healed).toBe(10);
  });

  it('离蜜后倒计时消退（不再回复）', () => {
    const b = new BuffState();
    b.apply(BuffType.Honey, 30);
    let healed = 0;
    for (let k = 0; k < 30.5 * 60; k++) healed += b.tick(1 / 60);
    expect(healed).toBe(30);          // 30 秒恰好回 30 HP
    expect(b.has(BuffType.Honey)).toBe(false);
    const h2 = b.tick(1);
    expect(h2).toBe(0);
  });
});

describe('数值（1.4.5.6 UpdateBuffs L9640+）', () => {
  it('Regeneration(2)：2 HP/s（lifeRegen+4）', () => {
    const b = new BuffState();
    b.apply(BuffType.Regen, 5);
    let healed = 0;
    for (let k = 0; k < 300; k++) healed += b.tick(1 / 60);
    // 2 HP/s × 5s = 10（帧积分浮点边界允许 ±1）
    expect(healed).toBeGreaterThanOrEqual(9);
    expect(healed).toBeLessThanOrEqual(10);
  });

  it('Ironskin(5)：防御 +8（1456 数值，非旧 6）', () => {
    const b = new BuffState();
    expect(b.defenseBonus).toBe(0);
    b.apply(BuffType.Ironskin, 10);
    expect(b.defenseBonus).toBe(8);
  });

  it('蜂蜜+恢复可叠加（各按自身速率）', () => {
    const b = new BuffState();
    b.apply(BuffType.Honey, 10);
    b.apply(BuffType.Regen, 10);
    let healed = 0;
    for (let k = 0; k < 300; k++) healed += b.tick(1 / 60);
    // 3 HP/s × 5s = 15（帧积分浮点边界允许 ±1）
    expect(healed).toBeGreaterThanOrEqual(14);
    expect(healed).toBeLessThanOrEqual(15);
  });
});
