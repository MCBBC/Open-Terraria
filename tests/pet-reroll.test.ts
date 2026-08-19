// 宠物许可证二用 RerollVariation（NPC.cs:81695-81733 + Profiles.cs VariantNPCProfile）：
// ① 变体表三族各 6 名（TownNPCProfiles.cs:131-139 逐字）
// ② rollTownPetVariant ∈ [0,6)
// ③ townNpcProfileSheet：变体档贴图 {root}_{Variant}.png（六变体各自具名）
// ④ 重掷循环语义：≤100 掷直到 ≠ 当前（5/6 概率单掷成功，极端环极小但循环保证）
import { describe, it, expect } from 'vitest';
import { TOWN_PET_VARIANTS, rollTownPetVariant, townPetVariantName, townNpcProfileSheet } from '../src/data/townNpcProfiles';

describe('宠物变体表（TownNPCProfiles.cs:131-139）', () => {
  it('三族各 6 变体，名字逐字', () => {
    expect(TOWN_PET_VARIANTS[637]).toEqual(['Siamese', 'Black', 'OrangeTabby', 'RussianBlue', 'Silver', 'White']);
    expect(TOWN_PET_VARIANTS[638]).toEqual(['Labrador', 'PitBull', 'Beagle', 'Corgi', 'Dalmation', 'Husky']);
    expect(TOWN_PET_VARIANTS[656]).toEqual(['White', 'Angora', 'Dutch', 'Flemish', 'Lop', 'Silver']);
  });

  it('RollVariation（Profiles.cs:215-218）：rand(6) 值域全覆盖', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) seen.add(rollTownPetVariant(637));
    expect(seen.size).toBe(6);
    expect(rollTownPetVariant(999)).toBe(0);   // 非变体族恒 0
  });

  it('变体贴图解析：{root}_{Variant}.png（GetTextureNPCShouldUse :229-238）', () => {
    expect(townNpcProfileSheet(637, 0, 0, 0)).toBe('vanilla/Cat_Siamese.png');
    expect(townNpcProfileSheet(637, 0, 0, 3)).toBe('vanilla/Cat_RussianBlue.png');
    expect(townNpcProfileSheet(638, 0, 0, 5)).toBe('vanilla/Dog_Husky.png');
    expect(townNpcProfileSheet(656, 0, 0, 2)).toBe('vanilla/Bunny_Dutch.png');
    expect(townNpcProfileSheet(656, 0, 1, 4)).toBe('vanilla/Bunny_Lop_Party.png');   // 派对档带后缀
    // 未掷（-1）/越界 → Default 图（本仓缺省态）
    expect(townNpcProfileSheet(637, 0, 0, -1)).toBe('vanilla/Cat_Default.png');
    expect(townNpcProfileSheet(637, 0, 0, 9)).toBe('vanilla/Cat_Default.png');
    expect(townPetVariantName(637, 1)).toBe('Black');
    expect(townPetVariantName(999, 0)).toBeNull();
  });

  it('RerollVariation 循环语义（:81713-81716 ≤100 掷直到变化）', () => {
    // 统计学验证：600 次独立重掷全部产生 ≠ 旧值（单掷 5/6，环内重掷保证终值必异）
    let allChanged = true;
    for (let i = 0; i < 600; i++) {
      const oldVar = 0;
      let cur = oldVar, tries = 0;
      while (tries++ < 100 && cur === oldVar) cur = rollTownPetVariant(637);
      if (cur === oldVar) allChanged = false;
    }
    expect(allChanged).toBe(true);
  });
});
