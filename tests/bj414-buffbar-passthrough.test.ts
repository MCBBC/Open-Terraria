// BJ414（2026-09-30 用户实报）：鼠标悬停热键栏/buff 栏区域时左键无法攻击——
// 容器空白（无图标/无格子处）也拦截游戏输入。
//
// ★定谳（Terarria1457 反编译 = 唯一标杆）：
//   · buff 悬停 mouseInterface 置位面 = 【逐图标矩形】——DrawBuffIcon Main.cs:44065
//     `mouseX < x + TextureAssets.Buff[num].Width() && mouseY < y + Height()
//     && mouseX > x && mouseY > y`（→ :44075 mouseInterface=true）；容器空白不置位。
//   · 时长文字（:44049-44064 DrawString 在图标正下方）不在悬停矩形内 = 非命中面。
//   · 热键栏同构：GUIHotbarDrawInner Main.cs:44353 逐槽矩形（52×hotbarScale[i]）。
//   · 本仓实机普查（docs/evidence/bj414/census-before-fix.log，全视口 16000 采样点，
//     关包态）：buff 栏容器 div@32,76 418x32 独占容器级拦截面 164 点，其中图标/时长
//     外约 54% 为空白拦截；elementFromPoint 命中容器本身（pointer-events:auto）→
//     closest('.sw-root') → isDomUiTarget=true → Input.mousedown 门吞按 + Game.
//     inpOverDomUi() 逐 tick 吞使用链。热键栏容器 0×0（槽全 absolute）+ 槽间缝
//     本就穿透（vanilla 同构），非病灶。
// ★落刀（CSS pointer-events 层,最小刀）：
//   ① buildBuffBar 容器 cssText 摘 pointer-events:auto → 吃 .sw-root 的 none
//     （空白→elementFromPoint 落 canvas=世界输入）；命中面收窄到 .sw-buff 块
//     （类上 auto 保有）+ 32×32 图标 ≙ 原版逐图标面。
//   ② makeBuffBlock/makeNebulaBlock 时长 span 置 pointer-events:none（span
//     left/right:-4px 外溢块外,否则拦图标下方 40×16 世界输入带）。
// 实机判别（浏览器域,jsdom/vitest 无布局引擎不测 elementFromPoint）：
//   修复前 buff 栏空白 mousedown during=false（吞）→ 修复后 true（攻击链通电）；
//   图标面恒 blocked（vanilla mouseInterface 同相）。见 docs/evidence/bj414/。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDomUiTarget, DOM_UI_TARGET_SELECTOR } from '../src/core/input/domTargets';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UITS = readFileSync(join(ROOT, 'src/ui/UI.ts'), 'utf8');

/** buildBuffBar 容器 cssText 行（锚 = buffBar 赋值语句） */
function buffBarCssLine(): string {
  const m = UITS.match(/this\.buffBar\.style\.cssText = '([^']+)';/);
  expect(m, 'buildBuffBar cssText 行必须存在（锚漂移=本测试须随刀更新）').toBeTruthy();
  return m![1];
}

/** 时长 span cssText 行（makeBuffBlock + makeNebulaBlock 两处,应全量同款） */
function timeSpanCssLines(): string[] {
  const ms = UITS.match(/time\.style\.cssText = '([^']+)';/g) ?? [];
  expect(ms.length, '时长 span 赋值点数（2 处：普通/星云通道）').toBe(2);
  return ms.map((s) => s.replace(/^time\.style\.cssText = '|';$/g, ''));
}

describe('BJ414 buff 栏容器空白穿透（容器级拦截面禁再入）', () => {
  it('buildBuffBar 容器 cssText 不含 pointer-events:auto（空白→canvas=世界输入）', () => {
    const css = buffBarCssLine();
    expect(css).not.toContain('pointer-events');
    // 容器几何锚不动（行宽 418 = 原版 num2=11 卷绕）
    expect(css).toContain('width:418px');
    expect(css).toContain('flex-wrap:wrap');
  });

  it('命中面保有：.sw-buff 类规则仍 pointer-events:auto（32×32 图标矩形 ≙ Main.cs:44065）', () => {
    const m = UITS.match(/\.sw-buff \{ ([^}]+)\}/);
    expect(m, '.sw-buff 类规则必须存在').toBeTruthy();
    expect(m![1]).toContain('pointer-events:auto');
  });

  it('时长 span 两处全量 pointer-events:none（Main.cs:44049-44064 文字非命中面）', () => {
    for (const css of timeSpanCssLines()) {
      expect(css).toContain('pointer-events:none');
      expect(css).toContain('top:34px');
    }
  });

  it('穿透链前提：.sw-root 根规则 pointer-events:none（容器 none 的继承源）', () => {
    const m = UITS.match(/\.sw-root \{ ([^}]+)\}/);
    expect(m, '.sw-root 根规则必须存在').toBeTruthy();
    expect(m![1]).toContain('pointer-events:none');
  });

  it('isDomUiTarget 语义锁：.sw-root 子树元素=UI（图标面吞按）,游离 stub=世界（空白放行）', () => {
    // 空白放行的机制面：pointer-events:none 元素不会被 elementFromPoint 选中 →
    // Input.mousedown 门的 target 落 canvas（无 closest 的游离目标）→ 非 UI。
    // 本锁钉住两支语义：命中 .sw-root 子树（=图标/格子）归 UI;不命中=世界输入。
    const iconStub = { closest: () => ({ classList: { contains: () => true } }) } as unknown as HTMLElement;
    expect(isDomUiTarget(iconStub)).toBe(true);
    expect(isDomUiTarget(null)).toBe(false);
    expect(isDomUiTarget(undefined)).toBe(false);
    const worldStub = { closest: () => null } as unknown as HTMLElement;
    expect(isDomUiTarget(worldStub)).toBe(false);
    // 热键锁穿透豁免支（SW-FX10 债⑪）不被本刀波及
    const passthroughStub = {
      dataset: {},
      closest: (sel: string) => (sel.includes('data-sw-world-passthrough') ? ({}) : null),
    } as unknown as HTMLElement;
    expect(isDomUiTarget(passthroughStub)).toBe(false);
  });

  it('登记面：buff 栏容器无专类（穿透=吃 .sw-root none,名单面零改动）', () => {
    // 防回归哨:若未来有人给 buff 栏挂类并登记进 DOM_UI_TARGET_SELECTOR,
    // closest 面会把容器空白重新抬成 UI=BJ414 复发。容器应保持无类直挂 .sw-root。
    expect(DOM_UI_TARGET_SELECTOR).not.toContain('sw-buffbar');
    expect(UITS).toContain("this.buffBar = el('div');");
  });
});
