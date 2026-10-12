// BJ653 图鉴三面复验（用户实报 + 截图物证 image-cache 111.png；BJ506/507 大域刀后续）。
// 定谳锚 = Terarria1457 亲读（1456 交叉参照，冲突以 1457 为准）：
//   ①掉落概率显示格式：UIBestiaryInfoItemLine.cs——GetDropInfo :81-113：stackRange
//     段前缀（:83-90 min≠max → " (min-max)" / min==1 → "" / 其余 " (min)"）；
//     P 档（:95-97）<0.001 用 P4（:98）；rate≠1 → Utils.PrettifyPercentDisplay（:102）
//     / 恒 1 → "100%"（:104）；解锁档 <DropsWithRates → droprate="???" 且
//     **stackRange=""**（:108-111）。合成在构造器 :66-69：stackRange 非空才
//     `stackRange + " " + droprate`（无段行【无前导空格】）。
//     PrettifyPercentDisplay（Utils.cs:1140-1144，1456 :1108-1112 同）=
//     ToString(P) → TrimEnd('0','%',' ') → TrimEnd('.',' ') → **TrimStart('0',' ')**
//     → +"%" —— 前导零剥净是原版【刻意习癖】：0.0001 → ".01%"、1/7000 → ".0143%"
//     （用户截图 .01%/.0143% = 原版本相，非缺陷；BJ506 已锁一般表，本文件锁
//     截图物证三值 + 段前缀合成 + ??? 形清段）。
//   ②tooltip 层序：UIBestiaryInfoItemLine.DrawMouseOver :130-134 = Main.HoverItem +
//     MouseText 系 → Main.DrawInterface（Main.cs:45678-45690）**先绘全部
//     _gameInterfaceLayers（图鉴 UIState/遮罩在内）再 DrawPendingMouseText（:45776）**
//     —— MouseText 绘制位次恒在一切 UIState 之后 = 接口层最上。
//     本仓病灶：.sw-tooltip 挂 .sw-root（UI.ts .sw-root z-index:10）语境，
//     图鉴 .sw-bst（z-index:30 + 全屏 rgba(0,0,0,0.6) 黑幕）同层压过 →
//     气泡被遮罩暗化 + 被面板裁切（111.png：首行「莱姆法杖」=「史莱姆法杖」被裁）。
//     刀 = showFloatingItemTooltip 暂离 .sw-root 挂 document.body（随 MouseTextTip
//     族 .sw-mt-tip z1300@body 惯例），hide 归还原宿——tooltipHome 记录/还原 =
//     搜索浮窗先例（UI.ts :4059/:4237）；BestiaryPanel.close() 恒走
//     flow.hideItemTooltip（BestiaryPanel.ts close :2294-2307）归还。
//   ③已收集进度条高度：UIBestiaryTest.cs——底条 20（:124-132 uIElement4 VAlign1）；
//     FillProgressBottomBar :159-181：UIColoredSliderSimple Height **15**（:172）
//     VAlign1，FilledColor(51,137,255)/EmptyColor(35,43,81)（:166-171）；
//     UIColoredSliderSimple.DrawValueBarDynamicWidth（UIColoredSliderSimple.cs:20-33）：
//     ColorBar 九宫 splice 内缩 (5,4,4,4)（:24）→ 着色带 = 15-4-4 = **7**，着色带
//     宽度 ×FillPercent。★本仓 CSS（.sw-bst-bar height:15px / i 内缩 4/4 → 带 7px）
//     与原版 UI 单位 1:1 —— 用户观感「高度太小」= 原版本相（原版条带本身细）+
//     全局 UIScale 惯例差（原版游戏内 Main.UIScale=用户档，首启默认
//     displayHeight/1080×1.1（Main.cs:4346），本仓 D0 档 DOM=CSS px 恒 1.0），
//     面内相对几何零差 —— 本面零刀，测试锁几何 1:1。
//     （附：完成度文本 = PrettifyPercentDisplay(P2)（UIBestiaryTest.cs:192-196）；
//     原版静态文本 _progressPercentText 建后未 Append（:167-168 只赋字段,446 只
//     SetText）= 悬停 MouseText 才显（ShowStats_Completion :183-190）；本仓常驻
//     文本为 BJ506 有意近似,非本批刀面。）
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dropRateText, prettifyPercentDisplay, flattenDropsForNpc } from '../src/ui/BestiaryPanel';
import { UI } from '../src/ui/UI';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

// ============ ①掉落概率显示格式（Utils.cs:1140 + UIBestiaryInfoItemLine.cs:66-113） ============

describe('BJ653 ①概率格式：截图物证三值（.01%/.0143%/100% = TrimStart 前导零剥净的原版本相）', () => {
  it('史莱姆法杖双行：1/10000 → ".01%"（P4）、专家 1/7000 → ".0143%"（P4）——与 111.png 逐字同', () => {
    expect(dropRateText(1 / 10000)).toBe('.01%');
    expect(dropRateText(1 / 7000)).toBe('.0143%');
  });

  it('恒 1 → "100%"（:104 特判）；完成度 32.05% 形（P2 主径,UIBestiaryTest.cs:192-196）', () => {
    expect(dropRateText(1)).toBe('100%');
    expect(prettifyPercentDisplay(0.3205)).toBe('32.05%');
  });

  it('数据面对拍（vanilla-npcdrops.json ← 原版 NPCLoot 注册）：绿史莱姆专家难度 = 凝胶(1-2)恒掉 + 法杖 1/10000 + 法杖专家 1/7000', () => {
    const rows = flattenDropsForNpc(1, 1).filter((d) => d.item === 23 || d.item === 1309);
    expect(rows.map((r) => ({ item: r.item, chance: r.chance, min: r.min, max: r.max }))).toEqual([
      { item: 23, chance: 1, min: 1, max: 2 },               // 凝胶 100%（1-2）
      { item: 1309, chance: 1 / 10000, min: 1, max: 1 },     // 史莱姆法杖 0.01%
      { item: 1309, chance: 1 / 7000, min: 1, max: 1 },      // 专家行 0.0143%（IsExpert 门）
    ]);
  });

  it('??? 形清段 + 无段行无前导空格（GetDropInfo :108-111 stackRange="" / 合成 :66-69 非空才拼）——★BJ653 刀', () => {
    const src = read('src/ui/BestiaryPanel.ts');
    expect(src).toContain("rt.textContent = rateTxt === null ? '???' : rangeTxt ? `${rangeTxt} ${rateTxt}` : rateTxt;");
    expect(src).not.toContain("rt.textContent = `${rangeTxt} ${st >= UnlockState.DropsWithRates");
  });
});

// ============ ②tooltip 层序（Main.cs:45678-45690 接口层最上；暂离 .sw-root 挂 body） ============

describe('BJ653 ②tooltip 层序：暂离 .sw-root（z10 语境 < .sw-bst z30 遮罩）挂 body（MouseTextTip 族惯例）', () => {
  const uiSrc = read('src/ui/UI.ts');
  const bstSrc = read('src/ui/BestiaryPanel.ts');

  afterAll(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it('行为锁：show 暂离 → body 接管 + 归宿记录；hide 撤泡 + 归还原宿 + 归宿清零', () => {
    const hadDoc = 'document' in globalThis;
    expect(hadDoc).toBe(false);   // node 环境无 DOM——误入 DOM 环境时此测试须改写
    let homeLast: unknown; let bodyLast: unknown;
    const home = { appendChild: (el: unknown) => { homeLast = el; } };
    const tip = { style: { display: 'block' }, parentElement: home };
    (globalThis as { document: unknown }).document = { body: { appendChild: (el: unknown) => { bodyLast = el; } } };
    const ui = Object.create(UI.prototype) as unknown as Record<string, unknown>;
    ui.tooltip = tip;
    ui.tooltipHome = null;
    ui.showTooltipFor = () => {};
    (UI.prototype as unknown as { showFloatingItemTooltip: (i: number, a: HTMLElement, n?: string[]) => void })
      .showFloatingItemTooltip.call(ui, 1309, {} as HTMLElement, ['条件行']);
    expect(bodyLast).toBe(tip);                  // ★气泡移居 body（顶层语境,MouseText 位次）
    expect(ui.tooltipHome).toBe(home);           // 归宿记录（:4059 先例）
    expect(ui.showTooltipFor).toBeTruthy();      // 载荷管线原样接力（未动 BJ507 桥形）
    (UI.prototype as unknown as { hideFloatingItemTooltip: () => void }).hideFloatingItemTooltip.call(ui);
    expect((tip as { style: { display: string } }).style.display).toBe('none');
    expect(homeLast).toBe(tip);                  // 归还原宿（防背包悬停气泡滞留 body）
    expect(ui.tooltipHome).toBeNull();
  });

  it('幂等锁：连 show 不重记归宿（第二次不重复搬移）', () => {
    let bodyMoves = 0;
    const home = { appendChild: () => {} };
    const tip = { style: { display: 'block' }, parentElement: home };
    (globalThis as { document: unknown }).document = { body: { appendChild: () => { bodyMoves++; } } };
    const ui = Object.create(UI.prototype) as unknown as Record<string, unknown>;
    ui.tooltip = tip;
    ui.tooltipHome = null;
    ui.showTooltipFor = () => {};
    const show = (UI.prototype as unknown as { showFloatingItemTooltip: (i: number, a: HTMLElement) => void }).showFloatingItemTooltip;
    show.call(ui, 1309, {} as HTMLElement);
    show.call(ui, 1309, {} as HTMLElement);
    expect(bodyMoves).toBe(1);
  });

  it('接线结构锁：.sw-tooltip z1300（UI.ts）> .sw-bst z30+黑幕（BestiaryPanel.ts）；迁移代码在 show/hide 桥内', () => {
    expect(uiSrc).toMatch(/\.sw-tooltip \{[^}]*z-index:1300/);
    expect(bstSrc).toMatch(/\.sw-bst \{[^}]*z-index:30/);
    expect(uiSrc).toContain('document.body.appendChild(tipEl);');
    expect(uiSrc).toMatch(/showFloatingItemTooltip\(itemId: number[\s\S]{0,900}this\.tooltipHome = tipEl\.parentElement;/);
    expect(uiSrc).toMatch(/hideFloatingItemTooltip[\s\S]{0,300}this\.tooltipHome\.appendChild\(this\.tooltip\);/);
  });
});

// ============ ③已收集进度条高度（UIBestiaryTest.cs:124-181 + UIColoredSliderSimple.cs:20-33） ============

describe('BJ653 ③进度条几何 1:1（底条 20 / 滑条 15 / 着色带 7 = 原版 UI 单位逐值）', () => {
  it('CSS 几何锁：.sw-bst-bottom 20px、.sw-bst-bar 15px、着色带内缩 top/bottom 4px（→ 7px 带）', () => {
    const src = read('src/ui/BestiaryPanel.ts');
    expect(src).toMatch(/\.sw-bst-bottom \{[^}]*height:20px/);
    expect(src).toMatch(/\.sw-bst-bar \{[^}]*height:15px/);
    expect(src).toMatch(/\.sw-bst-bar i \{[^}]*top:4px; bottom:4px/);
    expect(src).toMatch(/\.sw-bst-bar i b \{[^}]*background:rgb\(51,137,255\)/);   // FilledColor (51,137,255) :168
    expect(src).toMatch(/\.sw-bst-bar i \{[^}]*background:rgb\(35,43,81\)/);       // EmptyColor (35,43,81) :169
  });

  it('完成度文本走 Prettify（P2）+ 悬停 MouseText 同文案（ShowStats_Completion :183-190）', () => {
    const src = read('src/ui/BestiaryPanel.ts');
    expect(src).toMatch(/updateProgress\(\)[\s\S]{0,300}prettifyPercentDisplay\(pct\)/);
    expect(src).toContain("Lang.text('BestiaryInfo.PercentCollected')");
  });
});
