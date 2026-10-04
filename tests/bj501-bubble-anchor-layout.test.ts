// BJ501（2026-10-04 用户反馈两条,BJ500 续刀）：
//   ① 成就气泡距光标过远（用户截图物证:hover 成就按钮时气泡出现在鼠标右侧很远处）。
//     定谳（Terarria1457 反编译=唯一标杆）：+34 是光标持物【条件支】——Main.cs
//     MouseTextInner :20391-20394 `if (!mouseItem.IsAir) X += 34;`,mouseItem=光标
//     拖拽物（Main.mouseItem,UI 拖拽域）≠ Player.HeldItem（热栏选中物）。BJ500 落
//     的 heldGet 接线误喂 `inv.heldItem()`——本仓 Inventory.heldItem()（Inventory.ts
//     :273-276）= `cursorMirror ?? slots[selected]` = HeldItem 语义,游玩期热栏恒有
//     选中物 → +34 恒加,气泡被恒推出 34px。本仓光标持物谓词 = Game.uiHeldItemRef
//     （Game.ts:33244,UI.ts:1530 装配 `() => !!this.heldStack`;Game.ts:14421/:37387
//     已同式消费=「!Main.mouseItem.IsAir」既有判例）→ 两处接线改道。
//   ② sw<1000 不移成就按钮到右下（用户明令分歧,非原版相）。原版=窄屏内联
//     （Main.cs:42096-42129 num38 行 large:false 0.35+CanDrawAboveCoins 门 :41758
//     sw≥1000 才画大卡）——用户拍板 2026-10-04:恒大卡档 0.75 恒大卡位(ADVISOR_XY,
//     y=20=2026-09-13 顶对齐备案)。回滚口注于 UI.ts buildVanillaInventoryPanel;
//     内联几何单源（advisorRowOf/advisorInlineXY/hasSpaceForInlineAdvisor）留
//     vanillaInvLayout.ts 备查,其原版值由 vanilla-inv-layout.test.ts 独立锁。
//
// 判别面设计：
//   · 锚两态钉值=achTipAnchorXY 纯函数直调（持物/不持物 × 盒开/盒关 四态全钉）,
//     恒定项（14/6/6/+8/+2）与条件项（34）逐值判别——34 无条件化/条件翻转/位移项
//     错位任一变异必红;
//   · 接线谓词=源锁（uiHeldItemRef 在场+heldItem 语义零残留）;
//   · vinv 恒 LARGE/恒大卡位=结构锁+分歧标记（★BJ501 用户明令分歧）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { achTipAnchorXY, ADVISOR_SCALE_LARGE } from '../src/ui/AchievementsUI';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ACHTS = readFileSync(join(ROOT, 'src/ui/AchievementsUI.ts'), 'utf8');
const UITS = readFileSync(join(ROOT, 'src/ui/UI.ts'), 'utf8');

describe('BJ501 ①：气泡锚两态钉值（Main.cs:20379-20394+:20561-20568,achTipAnchorXY 纯函数）', () => {
  const MX = 100, MY = 50;

  it('不持物+盒开（悬停成就按钮常态）:X=+34 总偏移(14+6+6+8)/Y=+28——无 +34', () => {
    // 14(:20379)+6(ThickMouse 恒开)+0(光标空手 !mouseItem.IsAir)+6(toolTipDistance)+8(盒开)
    expect(achTipAnchorXY(MX, MY, false, true)).toEqual({ x: MX + 34, y: MY + 28 });
  });

  it('持物+盒开（光标拖拽物态）:X=+68——条件支 +34 精确到场（:20391-20394）', () => {
    expect(achTipAnchorXY(MX, MY, true, true)).toEqual({ x: MX + 68, y: MY + 28 });
  });

  it('不持物+盒关:X=+26/Y=+26;持物+盒关:X=+60——盒项(+8/+2)亦条件化（:20566-20567）', () => {
    expect(achTipAnchorXY(MX, MY, false, false)).toEqual({ x: MX + 26, y: MY + 26 });
    expect(achTipAnchorXY(MX, MY, true, false)).toEqual({ x: MX + 60, y: MY + 26 });
  });

  it('+34 只进 X 不进 Y（:20391-20394 仅 X += 34——Y 恒 14+6+6+[+2]）', () => {
    const off = achTipAnchorXY(MX, MY, true, true);
    const base = achTipAnchorXY(MX, MY, false, true);
    expect(off.x - base.x).toBe(34);
    expect(off.y - base.y).toBe(0);
  });

  it('接线谓词=光标持物语义（uiHeldItemRef 在场,两处 showAchTip;heldItem 语义零残留）', () => {
    // mouseenter 接线（跟鼠标首显）
    expect(ACHTS).toContain('() => !!getGame()?.uiHeldItemRef?.()');
    // update() 悬停中刷新接线
    expect(ACHTS).toContain('() => !!game.uiHeldItemRef?.()');
    // 旧刀误喂 HeldItem 语义零残留（sw-az1 判例:heldItem()=cursorMirror??slots[selected]）
    expect(ACHTS).not.toContain('?.heldItem?.()');
    // placeAchTip 消费纯函数（恒定项/条件项单源,禁第二份手写公式）
    expect(ACHTS).toContain('const p = achTipAnchorXY(achTipMX, achTipMY, !!achTipHeldGet?.(), box);');
    // Game.uiHeldItemRef 装配面在场（UI.ts:1530——谓词源,防装配链断裂漂移）
    expect(UITS).toContain('game.uiHeldItemRef = () => !!this.heldStack;');
  });
});

describe('BJ501 ②：vinv 恒大卡档恒大卡位（用户明令分歧 2026-10-04,非原版相）', () => {
  it('scaleOf 恒 LARGE 0.75（原版=sw<1000 内联 0.35 :42129 退役;断点闭包零残留）', () => {
    expect(ADVISOR_SCALE_LARGE).toBe(0.75);
    // vinv 接线=appendChild 内恒 LARGE（双 `));` 收尾;classic 单 `);` 同串另行在场）
    expect(UITS).toContain('createAchievementAdvisor(() => this.game, () => ADVISOR_SCALE_LARGE));');
    expect(UITS).toContain('createAchievementAdvisor(() => this.game, () => ADVISOR_SCALE_LARGE)');
    expect(UITS).not.toContain('? ADVISOR_SCALE_INLINE : ADVISOR_SCALE_LARGE');
  });

  it('pos 恒大卡位 ADVISOR_XY(501)/y=20（2026-09-13 顶对齐备案;内联落位零残留）', () => {
    expect(UITS).toContain('pos(advWrap, () => ({ x: ADVISOR_XY.x, y: 20 }));');
    expect(UITS).not.toContain('advisorInlineXY(c.sw');
    expect(UITS).not.toContain('hasSpaceForInlineAdvisor(hasCard');
    expect(UITS).not.toContain("advWrap.classList.toggle('sw-ach-inline'");
  });

  it('明令分歧登记+回滚口（★BJ501 用户明令分歧 标记在场;回滚口=散文注于 buildVanillaInventoryPanel）', () => {
    expect(UITS).toContain('★BJ501 用户明令分歧(2026-10-04)');
    // 回滚口两要素:原版相锚（:42129 内联）+恢复指引（ADVISOR_SCALE_INLINE 三元/BJ416 内联支）
    expect(UITS).toContain('Main.cs:42129 large:false');
    expect(UITS).toContain('ADVISOR_SCALE_INLINE:');
    expect(UITS).toContain('恢复 BJ416 内联支');
  });
});
