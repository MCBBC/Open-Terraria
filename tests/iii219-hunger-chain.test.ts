// IIII219：The Constant/天顶饥饿链单元测试（Buffs 域）。
// 真值锚 = 反编译 1458 Player.cs：UpdateStarvingState :11743-11768 / UpdateHungerBuffs
// :11686-11741 / 极饿流干 :19255+:19458-19477 / IsFedState 换档 AddBuff :5080-5089 /
// TryToResetHungerToNeutral :11619-11634（消费面 蘑菇 5 :52513+:5516、蛋奶酒 1912 :52507）。
// 天顶域 = Main.dontStarveWorld（seedFlags.theConstant，getfixedboi 七依赖含 DontStarve）。
import { describe, it, expect } from 'vitest';
import { BuffState, BuffType } from '../src/stats/Buffs';

const DT = 1 / 60;
const twoTicks = 2 / 60 + 1e-9;

/** 恒定世界 BuffState（zenith/remix 组合档） */
function makeBuffs(opts: { theConstant?: boolean; remix?: boolean; maxHp?: number } = {}) {
  const b = new BuffState();
  b.dontStarveWorld = opts.theConstant ?? true;
  b.remixHunger = !!(opts.remix ?? true);
  b.starvingMaxHp = opts.maxHp ?? 100;
  return b;
}

describe('IIII219 饥饿链（332→333→334）', () => {
  it('H1 非constant 世界三态不入栏（:9559 总门）', () => {
    const b = makeBuffs({ theConstant: false });
    for (let i = 0; i < 120; i++) b.tick(DT);
    expect(b.active.has(BuffType.NeutralHunger)).toBe(false);
  });

  it('H2 constant 无 fed-state → 授 332（remix 组合 28800t=480s，:11760）', () => {
    const b = makeBuffs();
    b.tick(DT);
    expect(b.active.get(BuffType.NeutralHunger)).toBeCloseTo(480, 1);
  });

  it('H3 非 remix constant 档 18000t=300s（:11762）', () => {
    const b = makeBuffs({ remix: false });
    b.tick(DT);
    expect(b.active.get(BuffType.NeutralHunger)).toBeCloseTo(300, 1);
  });

  it('H4 332≤2t → 333（remix 480s 档，:11705-11711）', () => {
    const b = makeBuffs();
    b.tick(DT);
    b.set(BuffType.NeutralHunger, 0.04);            // ≈2.4t
    b.tick(DT);
    expect(b.active.has(BuffType.Hunger)).toBe(true);
    expect(b.active.get(BuffType.Hunger)).toBeCloseTo(480, 1);
    // 表情 147 消费
    expect(b.onHungerEvent).toBeTruthy();
  });

  it('H5 333≤2t → 334 恒 5t（:11722-11728）+ starving 事件', () => {
    const b = makeBuffs();
    const events: string[] = [];
    b.onHungerEvent = (k) => events.push(k);
    b.tick(DT);
    b.set(BuffType.NeutralHunger, 0.04); b.tick(DT);
    b.set(BuffType.Hunger, 0.04); b.tick(DT);
    expect(b.active.has(BuffType.Starving)).toBe(true);
    expect(b.active.get(BuffType.Starving)!).toBeLessThanOrEqual(5 / 60 + 1e-9);
    expect(events.filter((e) => e === 'starving').length).toBe(1);
  });

  it('H6 334 重授自持（极饿不消散，:11722 每帧 ≤2t 重钉）', () => {
    const b = makeBuffs();
    b.tick(DT);
    b.set(BuffType.NeutralHunger, 0.04); b.tick(DT);
    b.set(BuffType.Hunger, 0.04); b.tick(DT);
    for (let i = 0; i < 120; i++) b.tick(DT);
    expect(b.active.has(BuffType.Starving)).toBe(true);
  });

  it('H7 极饿掉血流干：100hp → num12=2 HP 每 60t 一跳（:19458-19477）', () => {
    const b = makeBuffs({ maxHp: 100 });
    b.tick(DT);
    b.set(BuffType.NeutralHunger, 0.04); b.tick(DT);
    b.set(BuffType.Hunger, 0.04); b.tick(DT);
    let hp = 100;
    for (let i = 0; i < 181; i++) {
      const heal = b.tick(DT);
      if (heal < 0) hp = Math.max(0, hp + heal);
    }
    expect(hp).toBeLessThanOrEqual(96);   // 3s ≥ 3 跳（-2/跳）
    expect(hp).toBeGreaterThan(88);       // 8 跳上界（流速钳制证据）
  });

  it('H8 沙漠/雪原 ×2（:19465 starvingZoneBoost）', () => {
    const b = makeBuffs({ maxHp: 100 });
    b.starvingZoneBoost = true;
    b.tick(DT);
    b.set(BuffType.NeutralHunger, 0.04); b.tick(DT);
    b.set(BuffType.Hunger, 0.04); b.tick(DT);
    let hp = 100;
    for (let i = 0; i < 181; i++) {
      const heal = b.tick(DT);
      if (heal < 0) hp = Math.max(0, hp + heal);
    }
    expect(hp).toBeLessThanOrEqual(88);   // 3s ≥ 6 跳当量（-4/跳）
  });

  it('H9 喂饱剥离三态（IsFedState 换档 :5080-5089）+ fed 期不重授', () => {
    const b = makeBuffs();
    b.tick(DT);
    b.set(BuffType.NeutralHunger, 0.04); b.tick(DT);
    b.set(BuffType.Hunger, 0.04); b.tick(DT);
    b.apply(BuffType.WellFed, 60);
    expect(b.active.has(BuffType.Starving)).toBe(false);
    expect(b.active.has(BuffType.Hunger)).toBe(false);
    expect(b.active.has(BuffType.WellFed)).toBe(true);
    for (let i = 0; i < 60; i++) b.tick(DT);
    expect(b.active.has(BuffType.NeutralHunger)).toBe(false);
  });

  it('H10 TryToResetHungerToNeutral：三态清零、链回 332 满档（:11619-11634）', () => {
    const b = makeBuffs();
    b.tick(DT);
    b.set(BuffType.NeutralHunger, 0.04); b.tick(DT);   // → 333
    b.tryToResetHungerToNeutral();
    expect(b.active.has(BuffType.Hunger)).toBe(false);
    expect(b.active.has(BuffType.Starving)).toBe(false);
    // 下一拍 UpdateStarvingState 重授 332 满档
    b.tick(DT);
    expect(b.active.get(BuffType.NeutralHunger)).toBeCloseTo(480, 1);
  });

  it('H11 死亡冻结：dead 期链不推进不剥离（UpdateDead 无 UpdateBuffs）', () => {
    const b = makeBuffs();
    b.tick(DT);
    b.hungerPlayerAlive = false;                        // Player.fixedUpdate 写 !dead
    b.set(BuffType.NeutralHunger, 0.04);
    for (let i = 0; i < 10; i++) b.tick(DT);
    // 冻结语义：转移被跳过（332 仍按 ≤2t 门在,但不转移 333——:11686 循环 continue）
    expect(b.active.has(BuffType.Hunger)).toBe(false);
  });
});
