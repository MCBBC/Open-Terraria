// BJ500（2026-10-04 用户拍板,原版截图物证）：成就按钮原版形收口（BJ473 件③续刀）。
// 三点拍板：①原版成就按钮框不包含文字（本仓竖式文字卡=登记偏离,废除——推翻
// 2026-09-02「竖式文字卡保留」决定）②框没那么小（尺寸对齐原版 scale 三档）
// ③原版内容是 hover 时通过气泡 tooltip 显示（非常驻文字）。
//
// ★定谳（Terarria1457 反编译=唯一标杆;AchievementAdvisor.cs 1457=1458 diff 全等）：
//   · 卡面零文字：DrawCard（AchievementAdvisor.cs:136-165）仅三 spriteBatch.Draw
//     （暗图标 :159/金框 :160/悬停描边 :163）,零字体调用——文案只在 tooltip。
//   · 气泡 = 原版物品 tooltip 全链：DrawMouseHover（:123-134）→ Main.DisplayAnd-
//     GetFakeItem(ItemRarityColor.StrongRed10)（Main.cs:20326-20338——fake item
//     SetDefaults(0) 后仅 type=1/scale=0/value=-1/rare=10,全零域 → GetLinesInfo
//     零统计行,只余名称+ToolTip）+ item.SetNameOverride(achievement.FriendlyName)
//     + item.ToolTip = ItemTooltip.FromLanguageKey(achievement.Description.Key) →
//     instance.MouseText("") → MouseTextInner :20396 HoverItem.type>0 →
//     MouseText_DrawItemTooltip :20509：
//       名称行 = GetItemNameColor(rare=10) = (255,40,100)×mouseTextColor/255
//       （:20486-20489;仓库换算单源 Renderer.mouseTextInnerColor）;
//       说明行 = ToolTip 行,白×mouseTextColor（:20539-20542/:20589）。
//     底 = Utils.DrawInvBG ×(23,25,81)×0.925（:20585）;悬停文本框开关
//     SettingsEnabled_OpaqueBoxBehindTooltips（Main.cs:249 默认 true,关=纯文字）。
//     跟鼠标:X=mouse+14(:20379)+6(ThickMouse :2684/:276 默认档恒开)+34(光标持物
//     :20391-20394)+6(toolTipDistance :411)+8(盒开 :20566);Y=mouse+14+6+6+2
//     (:20567);屏缘钳 margin 18(盒开 :20568)/4(关 :20563)。触发=_hoveredCard ↔
//     图标盒命中（:139 Between）,DrawMouseOver Main.cs:43605 每帧消费;点击=面板开
//     + _hoveredCard 复位（:63/:68-72/:80）→ 气泡消隐。
//   · 尺寸三档（DrawOneAchievement :50-76 + DrawOptionsPanel :95/:103）：
//     大卡 sw≥1000 Main.cs:41762 large:true → 0.75f（72²×0.75=54px 框/64²×0.75=
//     48px 图标/Thin 76²×0.75=57px 描边）——「框没那么小」实指大卡:本仓旧值
//     0.5=36px 恒小于原版 54px;窄屏内联 :42129 large:false → 0.35f（25.2px 框/
//     22.4px 图标/Fat 80²×0.35=28px）——亲读钉死:原版内联卡就这么小,本仓旧值
//     0.5 反而偏大,一并归位;设置面板 DrawOptionsPanel :95/:103 → 0.5f（本仓无此
//     宿主位,档位保留供未来接线）。
//   · 落位:vinv sw≥1000=大卡档、sw<1000=内联档（scaleOf 闭包逐 update 重估,
//     跨断点随刷新切换）;classic 侧列=大卡角色 → 0.75。
//   ★BJ501(2026-10-04 用户反馈两刀):①气泡锚 +34=光标持物条件支(Main.cs:20391-20394
//     !mouseItem.IsAir=光标拖拽物,本仓谓词=Game.uiHeldItemRef/UI.heldStack;旧刀误喂
//     inv.heldItem()=HeldItem 语义(热栏选中物)致 +34 恒加,气泡被推出 34px——锚算抽
//     achTipAnchorXY 纯函数,两态判别=bj501 套件);②vinv 布局用户明令分歧:sw<1000
//     恒大卡档恒大卡位(原版 :42129 内联退役,回滚口注于 buildVanillaInventoryPanel;
//     内联几何单源留 vanillaInvLayout.ts 备查)。
//   · l10n：气泡文案=Achievements.{NAME}_Name/_Description 既有键（面板同源）,
//     全 12 语言逐键在场锁——零新键,build-l10n 通道不触发。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADVISOR_SCALE, ADVISOR_SCALE_LARGE, ADVISOR_SCALE_INLINE, advisorFrameGeom } from '../src/ui/AchievementsUI';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ACHTS = readFileSync(join(ROOT, 'src/ui/AchievementsUI.ts'), 'utf8');
const UITS = readFileSync(join(ROOT, 'src/ui/UI.ts'), 'utf8');

describe('BJ500 ①：文字卡零残留（原版卡面零文字,DrawCard :136-165 三贴图层无字体调用）', () => {
  it('竖式文字卡全摘：.tx 选择器/tx 元素/tx 赋值零残留', () => {
    expect(ACHTS).not.toContain('.tx');
    expect(ACHTS).not.toContain("el('div', 'tx')");
    expect(ACHTS).not.toContain('tx.textContent');
    expect(ACHTS).not.toContain('.sw-ach-inline .tx');
    // 卡面创建段只剩三层盒（图标/金框/描边）+类开关,无第二个子元素入卡
    expect(ACHTS).toContain('card.appendChild(box);');
    expect(ACHTS).not.toMatch(/card\.appendChild\((?!box)/);
  });

  it('★BJ501 用户明令分歧:vinv 恒大卡位（原版 sw<1000 内联退役;sw-ach-inline 类开关/HasSpace 门零残留,回滚口注于 buildVanillaInventoryPanel）', () => {
    expect(UITS).not.toContain("advWrap.classList.toggle('sw-ach-inline'");
    expect(UITS).not.toContain('hasSpaceForInlineAdvisor(hasCard');
    expect(UITS).toContain('★BJ501 用户明令分歧');
  });

  it('气泡承载文案（卡面文字的 1:1 顶替位,见③段详锁）', () => {
    expect(ACHTS).toContain('function showAchTip(');
    expect(ACHTS).toContain('function hideAchTip(): void');
  });
});

describe('BJ500 ②：尺寸三档钉值（大卡 0.75 Main.cs:41762 / 内联 0.35 :42129 / 设置面板 0.5）', () => {
  it('三档常量钉值（对拍 DrawOneAchievement :58-62 num=0.75f/0.35f + DrawOptionsPanel :95/:103 0.5f）', () => {
    expect(ADVISOR_SCALE).toBe(0.5);        // 设置面板档（本仓无此宿主位,档保留）
    expect(ADVISOR_SCALE_LARGE).toBe(0.75); // 大卡（sw≥1000,large:true）
    expect(ADVISOR_SCALE_INLINE).toBe(0.35); // 内联小卡（large:false,亲读钉死）
  });

  it('0.75 大卡：框 54=72×s、图标 48=64×s、pad 3=4×s;Thin 描边 57=76×s @−3.75=−5×s（:151-156）', () => {
    const g = advisorFrameGeom(ADVISOR_SCALE_LARGE);
    expect(g.card).toBe(54);
    expect(g.icon).toBe(48);
    expect(g.pad).toBe(3);
    expect(g.hover).toEqual({ size: 57, off: -3.75, tex: 'Thin' });
  });

  it('0.35 内联：框 25.2、图标 22.4、pad 1.4;Fat 描边 28 @−2.8——原版内联卡就这么小（本仓旧 0.5 反而偏大）', () => {
    const g = advisorFrameGeom(ADVISOR_SCALE_INLINE);
    expect(g.card).toBe(25.2);
    expect(g.icon).toBe(22.4);
    expect(g.pad).toBe(1.4);
    expect(g.hover).toEqual({ size: 28, off: -2.8, tex: 'Fat' });
  });

  it('宿主位接线：classic=大卡档;vinv=★BJ501 用户明令恒大卡档（原版 sw<1000 内联 :42129 退役,回滚口见 UI.ts）,update 逐刷新重估', () => {
    // classic 侧列=大卡角色（单 `);` 收尾）;vinv=appendChild 内恒大卡档（双 `));` 收尾）
    expect(UITS).toContain('createAchievementAdvisor(() => this.game, () => ADVISOR_SCALE_LARGE)');
    expect(UITS).toContain('createAchievementAdvisor(() => this.game, () => ADVISOR_SCALE_LARGE));');
    // ★BJ501 分歧:sw<1000 断点闭包零残留（回滚口为散文注,不含代码字面量）
    expect(UITS).not.toContain('? ADVISOR_SCALE_INLINE : ADVISOR_SCALE_LARGE');
    // 卡内 scale 重估单源（applyGeom+glyphStyle 同吃 curScale）
    expect(ACHTS).toContain('const scale = scaleOf ? scaleOf() : ADVISOR_SCALE;');
    expect(ACHTS).toContain('if (scale !== curScale) { curScale = scale; applyGeom(scale); }');
    expect(ACHTS).toContain('glyphStyle(glyph, a, best, curScale);');
  });

  it('0.35 内联卡连描边 26.6px 不破 BJ416 预算（adv.y+42:vanilla-inv-layout.test.ts）', () => {
    const g = advisorFrameGeom(ADVISOR_SCALE_INLINE);
    expect(g.pad + g.hover.off + g.hover.size).toBeLessThanOrEqual(42);
  });
});

describe('BJ500 ③：hover 气泡（DrawMouseHover :123-134 → DisplayAndGetFakeItem(StrongRed10) :20326-20338 → MouseText_DrawItemTooltip :20509）', () => {
  it('文案=成就名+描述既有键（面板同源,零新键）+ 名称行色=GetItemNameColor(rare=10) rgb(255,40,100)（:20486-20489）', () => {
    expect(ACHTS).toContain('Lang.text(`Achievements.${achName}_Name`)');
    expect(ACHTS).toContain('Lang.text(`Achievements.${achName}_Description`)');
    // 换算单源委托（StrongRed10=10,rare 档 (255,40,100)×num3;mt=255=原生无乘区,脉冲走层 filter）
    expect(ACHTS).toContain('mouseTextInnerColor(10, 0, 255, null)');
  });

  it('跟鼠标锚=原版 MouseText_DrawItemTooltip 公式（:20379-20394+:20561-20578;★BJ501 锚算抽 achTipAnchorXY 纯函数）', () => {
    // X=mouse+14+6(ThickMouse 恒开)+34(光标持物条件支)+6(toolTipDistance)+8(盒开)
    expect(ACHTS).toContain('x: mx + 14 + 6 + (cursorHeld ? 34 : 0) + 6 + (box ? 8 : 0),');
    // Y=mouse+14+6+6+2
    expect(ACHTS).toContain('y: my + 14 + 6 + 6 + (box ? 2 : 0),');
    // placeAchTip 消费纯函数单源
    expect(ACHTS).toContain('const p = achTipAnchorXY(achTipMX, achTipMY, !!achTipHeldGet?.(), box);');
    // ★BJ501 定谳:heldGet=光标持物谓词（uiHeldItemRef=mouseItem 语义,非 HeldItem）
    expect(ACHTS).toContain('() => !!getGame()?.uiHeldItemRef?.()');
    expect(ACHTS).toContain('() => !!game.uiHeldItemRef?.()');
    expect(ACHTS).not.toContain('?.heldItem?.()');
    // 屏缘钳 margin 18(盒开 :20568)/4(关 :20563)
    expect(ACHTS).toContain('const margin = box ? 18 : 4;');
  });

  it('盒底=DrawInvBG ×(23,25,81)×0.925（:20585）九宫+悬停文本框开关（:249 默认 true,关=纯文字）', () => {
    expect(ACHTS).toContain('const tmul = [23 / 255, 25 / 255, 81 / 255, 0.925];');
    expect(ACHTS).toContain("options.data.opaqueBoxBehindTooltips");
    expect(ACHTS).toContain("url(${bg}) no-repeat");               // SW-TT1 硬闸:禁 repeat 平铺
    expect(ACHTS).toContain("'rgba(21,23,75,0.93)'");               // 素材未就绪兜底（≈0.925）
    expect(ACHTS).toContain("achTipEl.style.background = 'transparent';");   // 关盒支
  });

  it('触发谓词复用 BJ473 图标盒（:139）：mouseenter 显/mousemove 跟/mouseleave+mousedown 隐', () => {
    expect(ACHTS).toContain("glyph.addEventListener('mouseenter', (e) => {");
    expect(ACHTS).toContain('showAchTip(lastBest, e.clientX, e.clientY,');
    expect(ACHTS).toContain("glyph.addEventListener('mousemove', (e) => {");
    expect(ACHTS).toContain("glyph.addEventListener('mouseleave', () => {");
    expect(ACHTS).toContain('hideAchTip();');
    expect(ACHTS).toContain("card.addEventListener('mousedown', (e) => {");
    // 悬停中卡面成就被完成 → 文案随新卡刷新（原版 _hoveredCard 每帧重置 :63/:80）
    expect(ACHTS).toContain('if (achTipVisible && best !== lastBest)');
  });

  it('DOM 形态=仓内 MouseText 家族约定（.sw-tooltip 同语言）+ body 级挂载（缩放根之外走视口系）', () => {
    expect(ACHTS).toContain('.sw-ach-tip { position:fixed; display:none; pointer-events:none; z-index:1300;');
    expect(ACHTS).toContain('font-family:"Fusion Pixel 12px","Microsoft YaHei",sans-serif;');
    expect(ACHTS).toContain('text-shadow:1px 1px 0 rgba(0,0,0,0.85);');
    expect(ACHTS).toContain('document.body.appendChild(tip);');
    expect(ACHTS).toContain(".sw-ach-tip .ds { white-space:pre-line; }");   // 描述 \n 同色拆行
    // 卡被重建/摘除 → 气泡随葬（body 级单例防孤儿）
    expect(ACHTS).toContain('if (!card.isConnected) { hideAchTip(); return; }');
  });

  it('文字层脉冲=mouseTextColor 190↔255 三角波（DoUpdate_AnimateCursorColors :18064-18075,UI.startTooltipPulse 同式）', () => {
    expect(ACHTS).toContain('function startAchTipPulse(): void');
    expect(ACHTS).toContain('if (val >= 255) { val = 255; dir = -1; }');
    expect(ACHTS).toContain('if (val <= 190) { val = 190; dir = 1; }');
  });
});

describe('BJ500 ④：BJ473 面不回归（金框/描边/灰调/沿音/goto）', () => {
  it('金框 img + 悬停描边双份预烘（Fat 80²/Thin 76² ×OurFavoriteColor(255,231,69),档位 :151-156）', () => {
    expect(ACHTS).toContain("border.src = 'sprites/vanilla/Achievement_Borders.png';");
    expect(ACHTS).toContain("const ADVISOR_HOVER_TEX = 'sprites/vanilla/Achievement_Borders_MouseHover.png';");
    expect(ACHTS).toContain("const ADVISOR_HOVER_TEX_THIN = 'sprites/vanilla/Achievement_Borders_MouseHoverThin.png';");
    expect(ACHTS).toContain('tintedSliceDataUrl(ADVISOR_HOVER_TEX, 255, 231, 69, 1)');
    expect(ACHTS).toContain('tintedSliceDataUrl(ADVISOR_HOVER_TEX_THIN, 255, 231, 69, 1)');
    // 描边贴图按档位换源（0.75→Thin/0.35→Fat,hoverUrls 单源）
    expect(ACHTS).toContain('const u = hoverUrls[g.hover.tex];');
  });

  it('灰调↔White（:147）+ 图标盒悬停类开关 + 沿音 + 仅左键 goto（:68-72）', () => {
    expect(ACHTS).toContain('filter:brightness(0.8627)');
    expect(ACHTS).toContain(".sw-ach-advisor.sw-ach-hov .card { filter:none; }");
    expect(ACHTS).toContain("card.classList.add('sw-ach-hov');");
    expect(ACHTS).toContain("card.classList.remove('sw-ach-hov');");
    expect(ACHTS).toContain("getGame()?.sfx.play('menuTick', 1);");
    expect(ACHTS).toContain('if (e.button !== 0) return;');
    expect(ACHTS).toContain('openAchievementsPanel(game, best ?? undefined);');
  });

  it('几何单源仍为 advisorFrameGeom（尺寸/偏移禁再写死双份）', () => {
    expect(ACHTS).toContain('const g = advisorFrameGeom(scale);');
    expect(ACHTS).toContain('box.style.width = `${g.card}px`;');
    expect(ACHTS).toContain('glyph.style.left = `${g.pad}px`;');
    expect(ACHTS).toContain('hov.style.width = `${g.hover.size}px`;');
    expect(ACHTS).toContain('hov.style.left = `${g.pad + g.hover.off}px`;');
  });
});

describe('BJ500 ⑤：l10n 全语言闸（气泡文案=Achievements.{NAME}_Name/_Description 既有键,零新键）', () => {
  // ADVISOR_ORDER 为模块私有单源——自源码提取（禁测试内复写第二份）
  const order = (() => {
    const m = ACHTS.match(/const ADVISOR_ORDER = \[([^\]]+)\]/);
    expect(m, 'ADVISOR_ORDER 必须存在').toBeTruthy();
    return (m![1].match(/'([A-Z_0-9]+)'/g) ?? []).map((s) => s.slice(1, -1));
  })();

  it('精选序列 36 项（AchievementAdvisor.Initialize :198-238）', () => {
    expect(order.length).toBe(36);
    expect(order[0]).toBe('TIMBER');
    expect(order).toContain('CHAMPION_OF_TERRARIA');
  });

  it('全 12 语言 × 36 项:_Name/_Description 逐键在场非空', () => {
    const dir = join(ROOT, 'public/l10n');
    const langs = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');
    expect(langs.length).toBeGreaterThanOrEqual(12);
    for (const f of langs) {
      const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const a = j.Achievements ?? {};
      for (const name of order) {
        expect(typeof a[`${name}_Name`], `${f}: Achievements.${name}_Name 缺失`).toBe('string');
        expect((a[`${name}_Name`] as string).length, `${f}: ${name}_Name 空串`).toBeGreaterThan(0);
        expect(typeof a[`${name}_Description`], `${f}: Achievements.${name}_Description 缺失`).toBe('string');
        expect((a[`${name}_Description`] as string).length, `${f}: ${name}_Description 空串`).toBeGreaterThan(0);
      }
    }
  });
});
