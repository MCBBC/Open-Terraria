// ★BJ505（2026-10-04 用户实报+截图「滚动成就或图鉴面板时左侧配方列表也跟随滚动」）
// 面板滚动穿透隔离判别锁。
// 定谳（原版路由）:UserInterface.cs:219-222 滚轮只派发 hover 命中链
//   (_currentState.GetElementAt(MousePosition)→UIElement.ScrollWheel 沿 Parent 冒泡,
//   UIElement.cs:542-552)——不在链上的兄弟组件(配方列表)收不到事件;
//   IngameFancyUI.Draw 悬停面板即 mouseInterface=true(IngameFancyUI.cs
//   IsElementUnderMouse 臂)=游戏域交互冻结 → 面板滚动区独占=用户可见语义。
//   原版 DoScrollingInInventory(Main.cs:17591)/ScrollCraftingList(:17641-17649)
//   虽无 hover 门,但 fancy UI 打开时全屏覆盖、配方列表不可见=可观测面无 bleed。
// 本仓差异:成就/图鉴=DOM 覆层(document.body 直挂,不遮背包——RB15d-②「fancy 面板
//   不收背包」同相登记),面板滚动 wheel 冒泡至 window 级 vinvGridWheelHandler
//   (UI.ts vinvBindGridWheel)→ vinvGridWheelTick → 列表轮播 bleed。世界域无 bleed
//   (Input wheel 绑 canvas,覆层 target 不达)。
// 落刀:UI.ts vinvGridWheelTick 加指针轴独占门 vinvWheelInFancyPanel(duck-type
//   closest,同 domTargets.isDomUiTarget 判式;名单 .sw-ach-panel/.sw-bst 根类)。
// 变异证红（本轮实录,逐字节还原+sha256 对拍 579690f4… 全等通过）:
//   M1 摘门行(if (this.vinvWheelInFancyPanel(e)) return;)→ ①②④⑤a+结构面红(③绿);
//   M2 门改恒真(if (true) return;)→ ③④⑤b+结构面红(①②⑤a 绿);
//   M3 名单 .sw-bst → .sw-bstX → ②⑤a 红(.sw-bst token 两消费面,①③④绿)。
// ★BJ-C4-F2（2026-10-06 R4 UI 批清偿）:名单补 .sw-itemsearch(道具搜索浮窗强制开
//   背包+原生 overflow 滚,wheel 冒泡 bleed 缺省可达——UI.ts vinvWheelInFancyPanel
//   名单第三 token);⑥测试=token 扩位判别,M6 变异 .sw-itemsearch→.sw-itemsearchX 杀⑥+结构面。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UI } from '../src/ui/UI';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const uiSrc = read('src/ui/UI.ts');
const achSrc = read('src/ui/AchievementsUI.ts');
const bstSrc = read('src/ui/BestiaryPanel.ts');

// ============================================================
// 功能面:vinvGridWheelTick 指针轴独占门(bj103 D 面 Object.create 桩惯例)
// ============================================================
describe('BJ505 功能面:vinvGridWheelTick fancy 面板独占门(vinvWheelInFancyPanel)', () => {
  function mkUi(gameFields: Record<string, unknown>) {
    const ui = Object.create(UI.prototype) as unknown as Record<string, unknown>;
    ui.game = { focusPaused: false, ...gameFields };
    return ui;
  }
  /** 背包开+vanilla 布局活面桩(bj103 同款;vinvWheelInFancyPanel 走真原型方法) */
  function mkLiveUi(gameFields: Record<string, unknown>, craftCalls: { n: number }) {
    const ui = mkUi(gameFields);
    ui._builtLayout = 'vanilla';
    ui.invPanel = { style: { display: 'block' } };          // playerInventory 开(:17547)
    ui.vinvLayoutCtx = {};                                  // 过 ctx 门(下走到列表支)
    ui.vinvCraftAvailV = [];
    ui.vinvPipsUseGrid = false;
    ui.vinvModernCraftOpen = false;
    ui.vinvCraftWheel = () => { craftCalls.n++; };          // 列表轮播消费哨兵
    return ui;
  }
  /** duck-type target(仿 Element.closest 选择器 token 精确匹配——逐 token 非子串,
   *  M3 选择器变异须能杀②;closest=undefined 桩=bj103 无 target 事件流同态) */
  const evtIn = (deltaY: number, panelCls: string | null): WheelEvent => {
    const target = panelCls === null
      ? undefined
      : { closest: (s: string) => (s.split(',').map((t) => t.trim()).includes(`.${panelCls}`)
          ? { panel: panelCls } : null) };
    return { deltaY, deltaMode: 0, stopPropagation() { /* stub */ }, target } as unknown as WheelEvent;
  };

  it('①成就面板滚动→配方列表 offset 不变(target 落 .sw-ach-panel 子树=vinvCraftWheel 零调用)', () => {
    const calls = { n: 0 };
    const ui = mkLiveUi({}, calls);
    (ui.vinvGridWheelTick as (e: WheelEvent) => void).call(ui, evtIn(-120, 'sw-ach-panel'));
    (ui.vinvGridWheelTick as (e: WheelEvent) => void).call(ui, evtIn(240, 'sw-ach-panel'));
    expect(calls.n, '悬停成就面板滚轮=面板独占,游戏域配方列表不接事件(UserInterface.cs:219-222)').toBe(0);
  });

  it('②图鉴滚动→配方列表 offset 不变(target 落 .sw-bst 子树=同门)', () => {
    const calls = { n: 0 };
    const ui = mkLiveUi({}, calls);
    (ui.vinvGridWheelTick as (e: WheelEvent) => void).call(ui, evtIn(-120, 'sw-bst'));
    (ui.vinvGridWheelTick as (e: WheelEvent) => void).call(ui, evtIn(240, 'sw-bst'));
    expect(calls.n, '悬停图鉴面板滚轮=面板独占').toBe(0);
  });

  it('③配方列表自身滚动不回归:覆层外 target(无面板/无 target 桩)照滚', () => {
    const calls = { n: 0 };
    const ui = mkLiveUi({}, calls);
    (ui.vinvGridWheelTick as (e: WheelEvent) => void).call(ui, evtIn(-120, null));      // closest 恒 null=覆层外
    (ui.vinvGridWheelTick as (e: WheelEvent) => void).call(ui, evtIn(120, null));
    expect(calls.n, '覆层外滚轮照滚(滚轮全域=原版本相,不得误杀)').toBe(2);
    // bj103 桩事件流同态:无 target 字段的事件不得被门误拦/误炸
    const calls2 = { n: 0 };
    const ui2 = mkLiveUi({}, calls2);
    (ui2.vinvGridWheelTick as (e: WheelEvent) => void).call(ui2, { deltaY: -120, deltaMode: 0 } as unknown as WheelEvent);
    expect(calls2.n, '无 target 事件流(既有桩契约)零扰').toBe(1);
  });

  it('④面板关闭后配方滚动恢复:关面板=DOM remove,后续 target 落覆层外→照滚', () => {
    const calls = { n: 0 };
    const ui = mkLiveUi({}, calls);
    (ui.vinvGridWheelTick as (e: WheelEvent) => void).call(ui, evtIn(-120, 'sw-ach-panel'));
    expect(calls.n).toBe(0);                            // 面板开:独占
    // 面板关闭(AchievementsUI.closeAchievementsPanel openPanel?.remove() /
    //   BestiaryPanel.close this.panel.remove()——结构面锁见下组);现实滚轮 target
    //   落在覆层外(canvas/背包 DOM)→ closest 失配=配方滚轮复活
    (ui.vinvGridWheelTick as (e: WheelEvent) => void).call(ui, evtIn(-120, null));
    expect(calls.n, '面板关后同手势位置滚轮=配方列表恢复滚动').toBe(1);
  });

  it('⑤暂停轴零扰(RB15d-H4 禁门锁):autoPause 暂停∧背包开=活面保持/独占门只看指针轴', () => {
    const calls = { n: 0 };
    const ui = mkLiveUi({ paused: true }, calls);       // autoPause 全暂停态旗在,不该拦覆层外滚轮
    (ui.vinvGridWheelTick as (e: WheelEvent) => void).call(ui, evtIn(-120, null));
    expect(calls.n, '⑤b autoPause∧背包开滚轮活面(RB15d-H4)=原版 :17549 同相,不得误杀').toBe(1);
    const calls2 = { n: 0 };
    const ui2 = mkLiveUi({ paused: true }, calls2);
    (ui2.vinvGridWheelTick as (e: WheelEvent) => void).call(ui2, evtIn(-120, 'sw-bst'));
    expect(calls2.n, '⑤a 暂停态∧悬停面板:独占门照拦(指针轴独立于暂停轴)').toBe(0);
  });

  it('⑥★BJ-C4-F2 道具搜索浮窗滚轮=面板独占:target 落 .sw-itemsearch 子树 → 配方列表零接事件', () => {
    // 面板先例:openItemSearchPanel 强制开背包(openInventory(true))——本件缺省可达
    // (搜索开着物品栏必须在场可点=SW-BJ81 规格④),列表原生 overflow 滚 + wheel
    // 冒泡 window 级监听 → 不补 token 即列表轮播 bleed(与 ①②同构)。
    const calls = { n: 0 };
    const ui = mkLiveUi({}, calls);
    (ui.vinvGridWheelTick as (e: WheelEvent) => void).call(ui, evtIn(-120, 'sw-itemsearch'));
    (ui.vinvGridWheelTick as (e: WheelEvent) => void).call(ui, evtIn(240, 'sw-itemsearch'));
    expect(calls.n, '悬停道具搜索浮窗滚轮=浮窗自滚域独占,配方列表不接事件').toBe(0);
    // token 精确性:近似 token(.sw-itemsearchX)不得命中(closest 逐 token 非子串)
    const calls2 = { n: 0 };
    const ui2 = mkLiveUi({}, calls2);
    (ui2.vinvGridWheelTick as (e: WheelEvent) => void).call(ui2, evtIn(-120, 'sw-itemsearchX'));
    expect(calls2.n, '近名 token 不误拦(名单逐字)').toBe(1);
  });
});

// ============================================================
// 结构面:门位/判式/名单/面板自滚面与关闭路径(漂移即红)
// ============================================================
describe('BJ505 结构面', () => {
  it('门在 vinvGridWheelTick 体内:playerInventory 门之后、vanillaWheelNotches 消费之前(两支全覆盖)', () => {
    const iTick = uiSrc.indexOf('private vinvGridWheelTick(e: WheelEvent): void {');
    const iGate = uiSrc.indexOf('if (this.vinvWheelInFancyPanel(e)) return;');
    const iInv = uiSrc.indexOf("if (this.invPanel.style.display !== 'block') return;", iTick);
    const iNotch = uiSrc.indexOf('vanillaWheelNotches(e.deltaY, e.deltaMode)', iTick);
    expect(iTick).toBeGreaterThan(-1);
    expect(iGate, 'BJ505 独占门被摘=M1 变异态').toBeGreaterThan(-1);
    expect(iInv).toBeGreaterThan(iTick);
    expect(iGate, '门须在 playerInventory 门之后(指针轴不越暂停轴锚)').toBeGreaterThan(iInv);
    expect(iNotch).toBeGreaterThan(iGate);
  });

  it('判式=duck-type closest(domTargets.isDomUiTarget 同式;名单 token 精确)', () => {
    const iFn = uiSrc.indexOf('private vinvWheelInFancyPanel(e: WheelEvent): boolean {');
    const iNext = uiSrc.indexOf('private vinvBindGridWheel(): void {');
    expect(iFn).toBeGreaterThan(-1);
    expect(iNext).toBeGreaterThan(iFn);
    const body = uiSrc.slice(iFn, iNext);
    expect(body).toContain(".sw-ach-panel, .sw-bst, .sw-itemsearch");
    expect(body).toContain("typeof t?.closest === 'function'");
    expect(body).not.toContain('instanceof Element');   // node 测试桩环境兼容锁
  });

  it('面板自滚面在(独占=面板消费+游戏域让路,双向各自成立)（★BJ506 改判：图鉴滚轮面由自创"换页滚"改判为原版 ScrollWheel(:850-854)=详情栏滚动——面板仍独占 wheel+preventDefault，隔离意图不变）', () => {
    expect(bstSrc).toMatch(/this\.panel\.addEventListener\('wheel', \(e\) => \{/);   // 图鉴滚轮 = 详情栏滚
    expect(bstSrc).toMatch(/\{ passive: false \}\);/);                                // 面板消费（不透游戏域）
    expect(bstSrc).toMatch(/infoEl\.scrollTop \+= e\.deltaY/);                        // 原版 UpdateScrollbar 语义
    expect(achSrc).toMatch(/\.sw-ach-list \{ overflow-y:auto/);                       // 成就原生滚
  });

  it('两面板关闭路径=DOM remove(④恢复语义的机制锚)', () => {
    expect(achSrc).toContain('openPanel?.remove();');
    expect(bstSrc).toMatch(/\n    this\.panel\.remove\(\);\n    this\.flow\.onBack\(\);/);
  });

  it('window 级游戏滚轮路由仍单源(不得另开第二 window 级通道)', () => {
    expect([...uiSrc.matchAll(/window\.addEventListener\('wheel', this\.vinvGridWheelHandler/g)]).toHaveLength(1);
  });
});
