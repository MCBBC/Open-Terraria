// 恶魔之心 3335 槽位数学（Player.cs:18402-18409 + 4279 + IsItemSlotUnlockedAndUsable）
import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/items/Inventory';

describe('DemonHeart 槽位（accSlotMax/shownExtraCount）', () => {
  it('经典世界：旗在但格不生效（cs:18402 门）', () => {
    const inv = new Inventory();
    inv.extraAccessory = true;
    inv.gateExpert = false;
    inv.gateMaster = false;
    expect(inv.accSlotMax).toBe(8);   // 基座 3..7（上界不含=8）
  });

  it('专家世界 + 恶魔之心 → 第六格生效', () => {
    const inv = new Inventory();
    inv.extraAccessory = true;
    inv.gateExpert = true;
    expect(inv.accSlotMax).toBe(9);
  });

  it('大师世界原生第七格（IsItemSlotUnlockedAndUsable(9) 恒真）', () => {
    const inv = new Inventory();
    inv.gateMaster = true;
    expect(inv.accSlotMax).toBe(9);   // 无心也有第 7 格
    inv.extraAccessory = true;
    expect(inv.accSlotMax).toBe(10);  // 心 + 大师 = 7 格全开（3..9）
  });

  it('Shown 判定：经典世界旗存物也显示（cs:4279 解锁∨占格）', () => {
    const inv = new Inventory();
    inv.extraAccessory = true;
    inv.gateExpert = false;
    inv.gateMaster = false;
    // 空格：不显示
    expect(inv.shownExtraCount(() => false)).toBe(0);
    // 槽内有物（跨世界携带）：显示但不生效
    expect(inv.shownExtraCount((slot) => slot === 8)).toBe(1);
  });

  it('大师世界空槽也显示第 7 格', () => {
    const inv = new Inventory();
    inv.gateMaster = true;
    expect(inv.shownExtraCount(() => false)).toBe(1);
  });
});
