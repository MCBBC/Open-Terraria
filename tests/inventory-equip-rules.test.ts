// 装备唯一性 + 堆叠上限对账（ItemSlot.cs :1311-1327/:3196-3245 + Item.cs 1456 :66/48615 ≡ 1457 :85/:49020）：
//   ① vi_ maxStack = 1456/1457 同值:默认 9999(CommonMaxStack,1457 Item.cs:85),仅 {71,72,73}=100
//     （1457 :2222-2264）与 8 任务/钥匙物 =1——1405 的 1844 处逐物品赋值在 1.4.4 已改制废弃
//   ② 功能配饰段同 type 唯一(自身槽放行)+ 双翅膀互斥 + 功能↔社交段同 type 互斥
//   ③ 盔甲功能↔时装段同款互斥,DualEquipArmor{205,5004,4955} 白名单例外
import { describe, it, expect } from 'vitest';
import { Inventory, ACC_ARMOR_START, ARMOR_SLOTS } from '../src/items/Inventory';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { statOfInternal } from '../src/data/vanillaItemStats';

const idOf = (vid: number): number | undefined => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  return k !== undefined ? ITEM_BY_KEY[k] : undefined;
};

describe('vi_ 堆叠上限 = 1456/1457 同值（默认 9999）', () => {
  it('治疗药水 188 / 铜短剑 4 / 铂币 74 = 9999;铜银金 71-73 = 100', () => {
    expect(ITEM_DEFS[idOf(188)!].maxStack).toBe(9999);
    expect(ITEM_DEFS[idOf(4)!].maxStack).toBe(9999);
    expect(ITEM_DEFS[idOf(74)!].maxStack).toBe(9999);
    expect(ITEM_DEFS[idOf(71)!].maxStack).toBe(100);
    expect(ITEM_DEFS[idOf(72)!].maxStack).toBe(100);
    expect(ITEM_DEFS[idOf(73)!].maxStack).toBe(100);
  });
  it('任务/钥匙族 = 1(58/184/1734/1735/1867/1868/1922/3388)', () => {
    for (const vid of [58, 184, 1734, 1735, 1867, 1868, 1922, 3388]) {
      const id = idOf(vid);
      if (id === undefined) continue;   // 数据集未含则跳过
      expect(ITEM_DEFS[id].maxStack).toBe(1);
    }
  });
  it('Inventory.add 合并尊重 9999 上限', () => {
    const inv = new Inventory();
    const gel = idOf(23)!;              // 凝胶
    inv.add(gel, 9999);
    inv.add(gel, 1);                    // 满 9999 后溢出到新格
    const stacks = inv.slots.filter((s) => s && s.id === gel).map((s) => s!.stack);
    expect(stacks[0]).toBe(9999);
    expect(stacks[1]).toBe(1);
  });
});

describe('装备唯一性（CanEquipAccessoryInSlot :1311-1327）', () => {
  // 从 itemstats 表动态取样(勿硬编码 vid——数据集覆盖以表为准)
  const findAcc = (skip = new Set<number>()): number | undefined => {
    for (let i = 1; i < ITEM_DEFS.length; i++) {
      if (skip.has(i)) continue;
      if (statOfInternal(i)?.acc === 1 && statOfInternal(i)?.wing == null) return i;
    }
    return undefined;
  };
  const findWings = (): number[] => {
    const wings: number[] = [];
    for (let i = 1; i < ITEM_DEFS.length && wings.length < 2; i++) {
      if (statOfInternal(i)?.wing != null) wings.push(i);
    }
    return wings;
  };
  const boot = findAcc();

  it('同款配饰第二件被拒;换回自身槽放行;卸下后可再装', () => {
    if (boot === undefined) return;
    const inv = new Inventory();
    inv.armor[ACC_ARMOR_START] = { id: boot, stack: 1 };
    expect(inv.armorAccepts(ACC_ARMOR_START + 1, boot)).toBe(false);  // 段内同 type
    expect(inv.armorAccepts(ACC_ARMOR_START, boot)).toBe(true);       // 自身槽(冲突槽==slot :3242)
    inv.armor[ACC_ARMOR_START] = null;
    expect(inv.armorAccepts(ACC_ARMOR_START + 1, boot)).toBe(true);   // 卸下后无冲突
  });

  it('功能↔社交段同 type 双向互斥（:1313/:1322）', () => {
    if (boot === undefined) return;
    const inv = new Inventory();
    inv.armor[ACC_ARMOR_START] = { id: boot, stack: 1 };
    expect(inv.armorAccepts(10 + ACC_ARMOR_START, boot)).toBe(false); // 功能已有→社交拒
    inv.armor[ACC_ARMOR_START] = null;
    inv.armor[10 + ACC_ARMOR_START] = { id: boot, stack: 1 };
    expect(inv.armorAccepts(ACC_ARMOR_START, boot)).toBe(false);      // 社交已有→功能拒
  });

  it('两对不同翅膀互斥（CanEquipBothAccessories :3202）', () => {
    const [w1, w2] = findWings();
    if (w1 === undefined || w2 === undefined) return;                 // 数据集无翅膀则跳过
    const inv = new Inventory();
    inv.armor[ACC_ARMOR_START] = { id: w1, stack: 1 };
    expect(inv.armorAccepts(ACC_ARMOR_START + 1, w2)).toBe(false);
    if (boot !== undefined) expect(inv.armorAccepts(ACC_ARMOR_START + 1, boot)).toBe(true);   // 配饰+翅膀不冲突
  });

  it('盔甲功能↔时装同款互斥,DualEquipArmor(205) 白名单例外', () => {
    // 找一件有部位归属的 vi_ 盔甲
    const armorVid = [89, 90, 91, 2475, 2476].map(idOf).find((x) => x !== undefined);
    if (armorVid === undefined) return;
    const inv = new Inventory();
    const slot = inv.armorAccepts(0, armorVid) ? 0 : inv.armorAccepts(1, armorVid) ? 1 : 2;
    inv.armor[slot] = { id: armorVid, stack: 1 };
    expect(inv.armorAccepts(10 + slot, armorVid)).toBe(false);        // 同款进时装拒(:1260)
    const dual = idOf(205);
    if (dual === undefined) return;
    const dSlot = inv.armorAccepts(0, dual) ? 0 : inv.armorAccepts(1, dual) ? 1 : 2;
    inv.armor[dSlot] = { id: dual, stack: 1 };
    expect(inv.armorAccepts(10 + dSlot, dual)).toBe(true);            // 白名单放行
  });

  it('空配饰槽位范围:accSlotMax 内可用(5 基座 + 恶魔之心)', () => {
    const inv = new Inventory();
    expect(inv.accSlotMax).toBe(ACC_ARMOR_START + 5);
    inv.extraAccessory = true;
    expect(inv.accSlotMax).toBe(ACC_ARMOR_START + 6);
    void ARMOR_SLOTS;
  });
});
