// ★SW-BJ430（2026-10-02）制作列表站压拍两臂分派（craftListPress）——用户拍板按原版
//  完整移植,翻案 X4-债5「classic 首击合并语义维持」。判别面 =
//  HoverOverCraftingItemButton (Main.cs:42971-43036) if/else-if 两臂 1:1：
//  ①首击聚焦不合成（:43020-43024 聚焦支:focusRecipe+stackSplit=15+Sound12+不上膛）
//  ②二击起合成（:42988 合成支:craftPressTick 压拍 1|10+30 拍冷却+上膛,长按加速梯承 BJ391）
//  ③guideItem.IsAir 门（:42988——guidePlaced 态点焦点行落聚焦支不合成）
//  ④按住期不连做（_preventCraftingBecauseClickWasUsedToChangeFocusedRecipe 旗面=不上膛承载）
//  ⑤离行暂停/回行续做（runCraftArm :hover 复核,BJ391 面——本文件自 list 两臂链入做端到端）
//  ⑥count≤0 防御门
// 测试法：UI 原型桩（sw-bj391 mkUi 同法,★类字段初始化器不入原型须显式补）。
import { describe, it, expect } from 'vitest';
import { UI } from '../src/ui/UI';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import { vanillaItemKey, type VanillaRecipeLike } from '../src/data/vanillaRecipes';

type AnyUI = Record<string, any>;

const WOOD = ITEM_BY_KEY['vi_9_Wood'];            // vid 9 木材（maxStack 9999 = 可连做）

const woodRecipe = (): VanillaRecipeLike => ({ create: 9, createStack: 1, tile: -1, items: [], groups: [] });
type HoverEl = { isConnected: boolean; matches: (s: string) => boolean };
const hoverEl = (hover = true): HoverEl => ({ isConnected: true, matches: () => hover });

function mkUi(): { ui: AnyUI; crafts: Array<{ r: VanillaRecipeLike; times: number }>; sounds: string[] } {
  const ui = Object.create(UI.prototype) as unknown as AnyUI;
  const crafts: Array<{ r: VanillaRecipeLike; times: number }> = [];
  const sounds: string[] = [];
  ui.game = {
    player: { inv: {} },
    sfx: { play: (n: string) => sounds.push(n) },
    itemId: (k: string) => (k === 'vi_9_Wood' ? WOOD : -1),
    vanillaCraft: (r: VanillaRecipeLike, times: number) => { crafts.push({ r, times }); },
  };
  // 构造器初始化器字段（原型桩手工补——bj157/bj391 同法）
  ui.stackSplit = 0;
  ui.stackDelay = 7;
  ui.stackCounter = 0;
  ui.superFastStack = 0;
  ui.timesTriedToFastStack = 0;
  ui.rcHold = null;
  ui.craftHold = null;
  ui.uiBtnRight = false;
  ui.uiBtnLeft = false;
  ui.uiBtnShift = false;
  ui.guidePlaced = false;
  ui.craftFocus = -1;
  ui.hoverFocus = -1;
  ui.invPanel = { style: { display: 'block' } };
  ui.refreshAll = () => {};
  ui.returnCraftGrid = () => {};
  return { ui, crafts, sounds };
}

// ============ ① 首击聚焦不合成（:43020-43024 聚焦支,翻案 X4-债5 主判据） ============
describe('BJ430 ① 首击聚焦——vanilla :43020 聚焦支（不合成）', () => {
  it('非焦点行首击=零合成+聚焦+stackSplit=15+Sound12+不上膛', () => {
    const { ui, crafts, sounds } = mkUi();
    const r = woodRecipe();
    ui.craftListPress(2, { r, count: 3 }, false, hoverEl());
    expect(crafts).toEqual([]);                    // ★首击不合成（旧单击语义在此合成 1 次）
    expect(ui.craftFocus).toBe(2);                 // focusRecipe = recipeIndex（:43020）
    expect(ui.stackSplit).toBe(15);                // :43021
    expect(sounds).toEqual(['menuTick']);          // :43023 Sound 12
    expect(ui.craftHold).toBeNull();               // 不上膛（prevent 旗面）=按住期零连做
  });

  it('首击按住不放（无松键重按）→ 任意拍数恒零合成（:42988 prevent 旗恒阻面）', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    ui.craftListPress(2, { r, count: 3 }, false, hoverEl());
    ui.uiBtnLeft = true;                           // 按住不放（旧语义会在第 29 拍起连做）
    for (let t = 0; t < 90; t++) ui.tickStackSplitMain();
    expect(crafts).toEqual([]);                    // 90 拍（1.5s）零合成
    expect(ui.craftHold).toBeNull();
  });

  it('count≤0 防御门：零合成零聚焦零音', () => {
    const { ui, crafts, sounds } = mkUi();
    const r = woodRecipe();
    ui.craftListPress(2, { r, count: 0 }, false, hoverEl());
    expect(crafts).toEqual([]);
    expect(ui.craftFocus).toBe(-1);
    expect(sounds).toEqual([]);
    expect(ui.stackSplit).toBe(0);
  });
});

// ============ ② 二击起合成（:42988 合成支,压拍面承 BJ391） ============
describe('BJ430 ② 二击起合成——vanilla :42988 合成支', () => {
  it('松键重按焦点行=压拍合成 1+进冷却+上膛（stackSplit 30,加速梯承 BJ391）', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    ui.craftListPress(2, { r, count: 3 }, false, hoverEl());   // 首击聚焦
    ui.uiBtnLeft = false;
    ui.tickStackSplitMain();                       // 松键归零面 :63422（stackSplit 15→0）
    ui.craftListPress(2, { r, count: 3 }, false, hoverEl());   // 二击=合成
    expect(crafts).toEqual([{ r, times: 1 }]);     // 压拍 num2=1（无 Shift）
    expect(ui.stackSplit).toBe(30);                // RefreshStackSplitCooldown 首压支
    expect(ui.craftHold?.r).toBe(r);               // maxStack>1 上膛
    expect(ui.craftHold?.kind).toBe('list');
  });

  it('Shift 焦点重按=10 件档（num2=(superFastStack+1)×10）', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    ui.craftListPress(4, { r, count: 99 }, false, hoverEl());
    ui.uiBtnLeft = false;
    ui.tickStackSplitMain();
    ui.craftListPress(4, { r, count: 99 }, true, hoverEl());
    expect(crafts).toEqual([{ r, times: 10 }]);
  });

  it('两臂链+长按加速梯端到端：二击后按住,29 拍第 2 次→stackDelay 梯续窄', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    ui.craftListPress(2, { r, count: 999 }, false, hoverEl());   // 首击聚焦
    ui.uiBtnLeft = false;
    ui.tickStackSplitMain();                       // 松键归零（:63422）
    ui.tickStackSplitMain();                       // stackSplit==0 拍=梯全量复位（:62728,真实松手≥2 帧）
    ui.craftListPress(2, { r, count: 999 }, false, hoverEl());   // 二击（craft #1）
    ui.uiBtnLeft = true;
    for (let t = 0; t < 28; t++) ui.tickStackSplitMain();
    expect(crafts).toHaveLength(1);                // 30 拍冷却窗内不连做
    ui.tickStackSplitMain();                       // 第 29 拍 stackSplit=1 → craft #2
    expect(crafts).toHaveLength(2);
    expect(crafts[1]!.times).toBe(1);
    expect(ui.stackSplit).toBe(7);                 // 续做支 → stackDelay（非 30=加速）
    for (let t = 0; t < 6; t++) ui.tickStackSplitMain();
    expect(crafts).toHaveLength(3);                // stackDelay=7 窗满 → craft #3
  });

  it('离行暂停/回行续做（runCraftArm :hover 复核——移出重置面之一）', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    const el = hoverEl();
    ui.craftListPress(2, { r, count: 999 }, false, el);          // 聚焦
    ui.uiBtnLeft = false;
    ui.tickStackSplitMain();
    ui.craftListPress(2, { r, count: 999 }, false, el);          // 二击 craft #1
    ui.uiBtnLeft = true;
    for (let t = 0; t < 29; t++) ui.tickStackSplitMain();
    expect(crafts).toHaveLength(2);
    const off = hoverEl(false);                    // 移出行（:hover 失）
    ui.craftHold!.el = off;
    for (let t = 0; t < 40; t++) ui.tickStackSplitMain();
    expect(crafts).toHaveLength(2);                // 离行暂停
    ui.craftHold!.el = el;                         // 回行
    ui.tickStackSplitMain();
    expect(crafts).toHaveLength(3);                // 回行续做
  });
});

// ============ ③ guideItem.IsAir 门（:42988） ============
describe('BJ430 ③ guidePlaced 门——:42988 guideItem.IsAir', () => {
  it('guidePlaced∧焦点行：不合成,落聚焦支（Sound12+stackSplit=15）,不上膛', () => {
    const { ui, crafts, sounds } = mkUi();
    const r = woodRecipe();
    ui.guidePlaced = { id: WOOD, stack: 1 };       // 向导反查态
    ui.craftFocus = 2;                             // 已聚焦
    ui.craftListPress(2, { r, count: 3 }, false, hoverEl());
    expect(crafts).toEqual([]);                    // 合成支死（原版 guideItem.IsAir 门）
    expect(sounds).toEqual(['menuTick']);          // 聚焦支音 12
    expect(ui.stackSplit).toBe(15);
    expect(ui.craftHold).toBeNull();
    expect(ui.craftFocus).toBe(2);                 // 聚焦支照常回写
  });
});

// ============ ④ 焦点行切换（聚焦支回写面） ============
describe('BJ430 ④ 焦点切换——聚焦另一行不合成', () => {
  it('A 行聚焦后点 B 行：零合成,B 行聚焦,Sound12', () => {
    const { ui, crafts, sounds } = mkUi();
    const ra = woodRecipe();
    const rb = woodRecipe();
    ui.craftListPress(2, { r: ra, count: 3 }, false, hoverEl());   // 首击 A 聚焦
    ui.craftListPress(5, { r: rb, count: 3 }, false, hoverEl());   // 点 B（非焦点行）
    expect(crafts).toEqual([]);                    // 两击均聚焦支
    expect(ui.craftFocus).toBe(5);
    expect(sounds).toEqual(['menuTick', 'menuTick']);
  });
});
