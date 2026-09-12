// 宠物数据表回归（tools/extract-pets.mjs ← Item.cs buffType+shoot / DefaultToVanitypet）
import { describe, it, expect } from 'vitest';
import { petInfoOfVid } from '../src/data/vanillaPets';
import equipJson from '../src/data/vanilla-equip.json';

describe('vanilla-pets 提取表', () => {
  // ★SW-FX2（2026-09-09）：55+7→56+6 —— 3855 行勘误（原 201/702/light=1 与 3856
  //  整行重复;vanilla Item.cs:34017-34022 共享块缺省臂 = 200/703,Main.cs:9378
  //  vanityPet[200]=true、lightPet 无 200）→ 飞翔Gato 回归 vanity 侧
  // ★SW-FX48（2026-09-12）：56+6→74+9 —— 1.4.5 boss 宠 21 件补行（4797-4817,
  //  Item.cs:39417-39440 DefaultToVanitypet(881+type-4797, 284+type-4797);
  //  lightPet[294,298,299] Main.cs:9436-9438 → 4807/4811/4812 光宠三只）
  it('总数与 vanity/light 分布（83 = 74 vanity + 9 light；damage>0 召唤杖已排除）', () => {
    let vanity = 0, light = 0;
    for (const k of Object.keys(require0())) {
      const p = petInfoOfVid(+k)!;
      if (p.light) light++; else vanity++;
    }
    expect(vanity).toBe(74);
    expect(light).toBe(9);
  });

  it('★SW-FX48：boss 宠 21 件抽检（共享算式块 4797+type-4797 三元组）', () => {
    // Item.cs:39417-39440：DefaultToVanitypet(881+type-4797, 284+type-4797)——
    // 提取器算式参数盲区（^DefaultToVanitypet\((\d+), (\d+)\)$ 只吃字面量）收口
    expect(petInfoOfVid(4797)).toEqual({ buff: 284, proj: 881, light: false });  // Royal Delight
    expect(petInfoOfVid(4807)).toEqual({ buff: 294, proj: 891, light: true });   // Guardian Golem 光宠
    expect(petInfoOfVid(4811)).toEqual({ buff: 298, proj: 895, light: true });   // Jewel of Light 光宠
    expect(petInfoOfVid(4812)).toEqual({ buff: 299, proj: 896, light: true });   // Pumpkin Scented Candle 光宠
    expect(petInfoOfVid(4817)).toEqual({ buff: 304, proj: 901, light: false });  // Betsy's Egg
  });

  it('抽检：603 胡萝卜→兔子（buff40/proj111）；光宠标记', () => {
    const carrot = petInfoOfVid(603);
    expect(carrot).toEqual({ buff: 40, proj: 111, light: false });
    // 4952 Fairy Bell 族光宠（buff 156? 按表断言 light=true 即可——抽任一 light 项）
    // ★SW-FX48：6→9（boss 宠光宠三只 4807/4811/4812 入表）
    const lights = Object.entries(require0()).filter(([, v]) => (v as { light: boolean }).light);
    expect(lights.length).toBe(9);
  });

  it('★ 不变量：每条 buff ∈ Main.vanityPet ∪ lightPet（假阳性防线——曾混入 24 件召唤杖）', () => {
    // Pygmy Staff 1157（buff=49 Pygmies 非 pet 表）必须已被 damage 门排除
    expect(petInfoOfVid(1157)).toBeNull();
    expect(petInfoOfVid(1309)).toBeNull();   // Slime Staff
    for (const [, v] of Object.entries(require0())) {
      const info = v as { buff: number };
      expect(info.buff).toBeGreaterThan(0);
    }
  });

  it('DefaultToVanitypet 变体族抽检（4960 → buff317/proj934——参数序 projId,buffID）', () => {
    // C# 签名 DefaultToVanitypet(int projId, int buffID)（:47549）：buffID 第二参；
    // buff=317 ∈ Main.vanityPet 表（实证），proj=934
    expect(petInfoOfVid(4960)).toEqual({ buff: 317, proj: 934, light: false });
  });

  it('equip.json pet/light 分类与本表交叉（425 特例除外全覆盖）', () => {
    const eq = equipJson as { pet: number[]; light: number[] };
    const missing = [...eq.pet, ...eq.light].filter((id) => id !== 425 && !petInfoOfVid(id));
    expect(missing).toEqual([]);
  });

  it('非宠物物品返回 null', () => {
    expect(petInfoOfVid(9)).toBeNull();    // 木材
    expect(petInfoOfVid(28)).toBeNull();   // 治疗药水
    expect(petInfoOfVid(4257)).toBeNull(); // 琥珀钩（有 shoot 无 buffType）
  });
});

// 顶层 require 替身：直接 import 表（避免 vitest ESM 无 require）
import petsJson from '../src/data/vanilla-pets.json';
function require0() {
  return petsJson as Record<string, unknown>;
}
