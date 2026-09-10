// SW-FX15 旅程物品浏览器补债定谳测试（复制面板点击臂 1:1 + OnlyNeedOneInInventory 移植）。
// 金标（1457；1458 同域 diff=0 已核）：
//   · 槽交互 = ItemSlot.Handle(ref item, 29|34)（UICreativeItemGrid.DrawSlot :21-27）
//   · 普点（光标空）→ PickItemMovementAction case 29（ItemSlot.cs:1599-1603）→ 臂 5；
//     LeftClick case 5（ItemSlot.cs:1215-1226）：光标整组 = OnlyNeedOneInInventory()?1:maxStack，
//     音效 7（Grab）+ JourneyDuplicationItemCreationContext
//   · 普点（光标非空）→ 无操作（case 5 门 Main.mouseItem.IsAir）
//   · Shift 点 → GetAlternateClickAction case 29（:693-697）→ TransferToBackpack
//     （cursorOverride 7）→ LeftClick :749-765 整组经 Player.GetItem 入包，音效 12
//   · OnlyNeedOneInInventory（Item.cs:1177-1192）+ OnlyNeedOneInInventoryOverride
//     （ItemID.cs:1223-1278，22 true / 6 false）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  onlyNeedOneInInventory, browserClickPlan, runBrowserQuery,
  type ResearchSortView,
} from '../src/ui/JourneyBrowser';

describe('SW-FX15 ①：OnlyNeedOneInInventory 1:1（Item.cs:1177-1192 + ItemID.cs:1223-1278）', () => {
  it('覆写表 true 组：22 员恒 true——含 journeycat 缺号件 329（覆写先于字段面）', () => {
    for (const vid of [1522, 1523, 1524, 1525, 1526, 1527, 3643, 3103, 3104, 856, 1299, 329,
      4346, 5391, 4767, 5453, 5309, 5454, 5323, 5455, 6190, 6195]) {
      expect(onlyNeedOneInInventory(vid), `vid ${vid}`).toBe(true);
    }
  });

  it('覆写表 false 组：6 员恒 false——205 有甲槽/267 有饰品/849 可消耗也压成 false（覆写优先级最高）', () => {
    for (const vid of [205, 206, 207, 1128, 267, 849]) {
      expect(onlyNeedOneInInventory(vid), `vid ${vid}`).toBe(false);
    }
  });

  it('回退：消耗品（蘑菇 22 / 火把 8 / 钱币 71）→ false = 可整组', () => {
    for (const vid of [22, 8, 71]) {
      expect(onlyNeedOneInInventory(vid), `vid ${vid}`).toBe(false);
    }
  });

  it('回退：非消耗 + useStyle>0 → true（905: {us:5, 无 cons}）；useStyle==0 → CanBeEquipped 链', () => {
    expect(onlyNeedOneInInventory(905)).toBe(true);
    // useStyle==0 非覆写甲件 37（{hs:1, 无 cons/us}）→ CanBeEquipped=true（甲三槽臂）
    expect(onlyNeedOneInInventory(37)).toBe(true);
  });

  it('★变异证红：覆写表缺 329 → 按字段面误判 false（判别力）', () => {
    // 329 不在 vanilla-journeycat.items（entry()={}）——若无覆写臂,落 useStyle0+
    // CanBeEquipped=false。表臂缺位时该用例必红。
    expect([1522, 329, 4346].every((v) => onlyNeedOneInInventory(v))).toBe(true);
  });
});

describe('SW-FX15 ②：复制面板点击臂（ItemSlot.cs:1599-1603/:749-765/:1215-1226）', () => {
  const MSE = 999;   // 钱币类 maxStack（99×10+9 形状即可）

  it('普点 + 光标空 → 整组上光标（音 7 Grab）', () => {
    const plan = browserClickPlan(71, false, false, MSE);
    expect(plan).toEqual({ to: 'cursor', stack: MSE, sound: 'pickup' });
  });

  it('普点 + 光标非空 → null（原版 case 5 门 Main.mouseItem.IsAir——不合并不清空）', () => {
    expect(browserClickPlan(71, false, true, MSE)).toBeNull();
  });

  it('Shift 点 → 整组入包（音 12 menuTick——TransferToBackpack 臂）', () => {
    const plan = browserClickPlan(71, true, false, MSE);
    expect(plan).toEqual({ to: 'backpack', stack: MSE, sound: 'menuTick' });
    // 光标占用不拦 shift 臂（原版两臂独立）
    expect(browserClickPlan(71, true, true, MSE)).toEqual({ to: 'backpack', stack: MSE, sound: 'menuTick' });
  });

  it('OnlyNeedOne 族（任务鱼 1522 等）恒给 1 件（两臂同式 :755/:1219）', () => {
    expect(browserClickPlan(1522, false, false, MSE)).toEqual({ to: 'cursor', stack: 1, sound: 'pickup' });
    expect(browserClickPlan(1522, true, false, MSE)).toEqual({ to: 'backpack', stack: 1, sound: 'menuTick' });
  });

  it('武器族（maxStack=1）两口径同值——us 缺捕偏差被 maxStack=1 抵消（备案见 JourneyBrowser 注）', () => {
    const plan = browserClickPlan(3504, false, false, 1);
    expect(plan).toEqual({ to: 'cursor', stack: 1, sound: 'pickup' });
  });

  it('maxStack 退化输入（0/undefined→调用方 999 兜底）不产 0 堆叠', () => {
    expect(browserClickPlan(71, false, false, 0)?.stack).toBeGreaterThanOrEqual(1);
  });

  it('★变异证红：shift/plain 互换 → 音效与去向全翻（判别力）', () => {
    const plain = browserClickPlan(71, false, false, MSE);
    const shift = browserClickPlan(71, true, false, MSE);
    expect(plain!.to).not.toBe(shift!.to);
    expect(plain!.sound).not.toBe(shift!.sound);
  });
});

describe('SW-FX15 ③：源断言——makeCell 消费 browserClickPlan + 双授予通道', () => {
  const src = readFileSync('src/ui/JourneyPowersUI.ts', 'utf8');
  it('浏览器 mousedown 走 browserClickPlan（光标臂 grantCraftToCursor / 包臂 giveItem）', () => {
    expect(src).toMatch(/import \{[^}]*browserClickPlan[^}]*\} from '\.\/JourneyBrowser'/);
    expect(src).toMatch(/const plan = browserClickPlan\(vid, e\.shiftKey, ui \? !!ui\.heldStack : false, def\?\.maxStack \?\? 999\)/);
    expect(src).toMatch(/if \(plan\.to === 'cursor' && ui\) ui\.grantCraftToCursor\(internalId, plan\.stack\)/);
    expect(src).toMatch(/else giveItem\(game, internalId, plan\.stack\)/);
    expect(src).toMatch(/game\.sfx\.play\(plan\.sound, 1\)/);
  });
});

describe('SW-FX15 ④：守恒——浏览器过滤排序链不受点击臂刀扰动（runBrowserQuery 基线）', () => {
  const research: ResearchSortView = {
    isNewlyResearched: () => false,
    isResearched: (vid) => vid === 71,
  };
  it('空搜索 + 无过滤器 = 全量过闸且已研究项排前（ByUnlockStatus 首位键）', () => {
    const out = runBrowserQuery([22, 71, 8], { search: null, activeFilters: [] }, research);
    expect(out.indexOf(71)).toBe(0);   // fully researched 首位
    expect(out).toHaveLength(3);
  });
});
