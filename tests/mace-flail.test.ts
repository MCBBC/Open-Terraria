// 链锤(Mace 5011)/烈焰链锤(FlamingMace 5012)回归:
// 曾因投射物提取器漏提复合条件块(type == 947 || type == 948)→ projectileData
// 查无 → 分类器 ai=-1 → 落入 shot 直射兜底 = "射出一把锤子"(应为连枷 aiStyle 15)。
// 同时锁 itemcombat 嵌套 if(type==5012) 覆盖(shoot 947→948)不回退。
import { it, expect } from 'vitest';
import { combatWeapon } from '../src/data/vanillaItemCombat';
import { projectileData } from '../src/data/vanillaProjectiles';

it('链锤/烈焰链锤归入 flail 而非 shot', () => {
  expect(projectileData(947)?.aiStyle).toBe(15);
  expect(projectileData(948)?.aiStyle).toBe(15);
  const mace = combatWeapon({ key: 'vi_5011_mace' });
  const flaming = combatWeapon({ key: 'vi_5012_flaming_mace' });
  expect(mace?.kind).toBe('flail');
  expect(flaming?.kind).toBe('flail');
  expect(mace?.shoot).toBe(947);
  expect(flaming?.shoot).toBe(948); // 嵌套 if(type==5012) 覆盖,非共享块 947
});

it('其余 shoot 指向新解析投射物的物品不落入异常族', () => {
  // 复合条件块修复共补 95 个投射物;下列物品的 shoot 从"查无"变为可解析,
  // 归族随 aiStyle 变化属预期,但不得出现意外消耗型族
  const vids = [64, 437, 788, 985, 1946, 2551, 2584, 3051, 3079, 3080, 3540, 3854, 3855, 3856, 3857];
  for (const v of vids) {
    const cw = combatWeapon({ key: `vi_${v}_x`, vid: v });
    expect(cw?.kind, `item ${v}`).not.toBe('glowstick');
  }
});
