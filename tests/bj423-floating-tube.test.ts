// ★BJ423（2026-10-01）浮游圈（FloatingTube 4404）管体绘制旗判别测试。
// 定谳锚（Terarria1457 唯一标杆,亲读）：
//   · 物品：ItemID.cs:10354 `FloatingTube = 4404`；SetDefaults case 4404（Item.cs:37381-37384）
//     DefaultToAccessory(20,12) + White0 + buyPrice(0,1)；zh-Hans 「浮游圈」。
//   · 浮力功能旗：ApplyEquipFunctional :13365-13367 `armorPiece.type == 4404 →
//     canFloatInWater = true`（功能槽独立扫,ResetEffects :18448 清）。
//   · 管体绘制旗：UpdateVisibleAccessory :37265-37268 `item.type == 4404 →
//     hasFloatingTube = true`——由 UpdateVisibleAccessories 两环驱动：
//       功能槽 3-9 在 `!hideVisibleAccessory[i]` 门内（:36362-36364）；
//       社交槽 13-19 无条件（:36368-36375,原版无 hide 门）。
//   ⇒ 差分面：①per-slot 隐藏挡管不挡浮力 ②社交槽挂管零浮力 ③可见轮无
//     expertOnly 门（浮力轮有 :13017-13018/:14475-14478）。
//   · 消费：PlayerDrawSet.cs:1797 drawFloatingTube → PlayerDrawLayers :1273-1280
//     （Extra_105 背半 0,0,40,56,Skin_Composite 躯干皮肤前）/ :2037-2044（前半
//     0,56,40,56,TorsoComposite 甲/大衣后、OffhandAcc 前）;floatingTubeColor =
//     GetImmuneAlphaPure(Lighting 0.75 高度白,shadow)（PlayerDrawSet.cs:455）。
//   · 钓鱼：GetFishingConditions :41546-41549 `canFloatInWater && wet → +5`
//     （本仓 Bobber.ts:244 已实装,回归锁）。
// 判别法：真 Player+Inventory 直调 equipStats（acc0-hidden-dye.test.ts 同法）。
import { describe, it, expect } from 'vitest';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { statOfInternal } from '../src/data/vanillaItemStats';
import { vanillaItemDimsOfVid } from '../src/data/vanillaItemDims';
import vanillaItemRareJson from '../src/data/vanilla-itemrare.json';

const iid = (vid: number): number => {
  const key = vanillaItemKey(vid);
  expect(key, `vid ${vid} ↔ 本仓 def 键`).toBeTruthy();
  return ITEM_BY_KEY[key!];
};

describe('BJ423 数据位面（def 面 1:1）', () => {
  it('4404 = 配饰（acc:1）/ 20×12 / White0 / 买价 1 金', () => {
    expect(statOfInternal(iid(4404))).toMatchObject({ acc: 1 });
    expect(vanillaItemDimsOfVid(4404)).toEqual([20, 12]);
    expect((vanillaItemRareJson as Record<string, number>)['4404']).toBe(0);
  });
});

describe('BJ423 管体旗（hasFloatingTube）判别', () => {
  const mkPlayer = () => new Player(0, 0, new Inventory());

  it('功能槽 3 挂圈：管体旗+浮力旗双置位', () => {
    const p = mkPlayer();
    p.inv.armor[3] = { id: iid(4404), stack: 1 };
    expect(p.equipStats.hasFloatingTube).toBe(true);
    expect(p.equipStats.canFloat).toBe(true);
  });

  it('功能槽 per-slot 隐藏：挡管不挡浮力（差分面①）', () => {
    const p = mkPlayer();
    p.inv.armor[3] = { id: iid(4404), stack: 1 };
    p.hideVisibleAccessory[3] = true;
    expect(p.equipStats.hasFloatingTube).toBe(false);
    expect(p.equipStats.canFloat).toBe(true);
  });

  it('社交槽 13 挂圈：管体旗置位、浮力旗零授（差分面②）', () => {
    const p = mkPlayer();
    p.inv.armor[13] = { id: iid(4404), stack: 1 };
    expect(p.equipStats.hasFloatingTube).toBe(true);
    expect(p.equipStats.canFloat).toBe(false);
  });

  it('卸下圈：双旗归零（记忆化失效回归锁）', () => {
    const p = mkPlayer();
    p.inv.armor[3] = { id: iid(4404), stack: 1 };
    expect(p.equipStats.hasFloatingTube).toBe(true);
    p.inv.armor[3] = undefined as never;
    expect(p.equipStats.hasFloatingTube).toBe(false);
    expect(p.equipStats.canFloat).toBe(false);
  });

  it('无关配饰不置位（对照）', () => {
    const p = mkPlayer();
    p.inv.armor[3] = { id: iid(49), stack: 1 };   // 再生手环
    expect(p.equipStats.hasFloatingTube).toBe(false);
    expect(p.equipStats.canFloat).toBe(false);
  });
});
