// ★SW-BJ391（2026-09-28）快捷制作长按臂（HoverOverCraftingItemButton Main.cs:42971-43036
//  逐拍面 1:1——shift+左键按住配方行连做,原版单击/长按同链：压拍 num2=(superFastStack+1)
//  ×(ShiftInUse?10:1) → CraftItem(num2)+RefreshStackSplitCooldown,松键归零面 :63422,
//  加速梯 :62728-62755 与取件臂（BJ157）共享 stackSplit 计时面）。
//  判别面：压拍（1|10 两档+30 拍冷却+上膛）/flag4 maxStack-1 不上膛/长按节拍
//  （29 拍第 2 次→stackDelay 梯加速）/Shift 电平逐拍变档/停止三档（松键落臂、
//  元素销毁落臂、离行暂停回行续做）/superFastStack 尾段一拍多件/guidePlaced 门。
// 测试法：UI 原型桩（sw-bj157 mkUi 同法,★类字段初始化器不入原型须显式补）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { UI } from '../src/ui/UI';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import { vanillaItemKey, type VanillaRecipeLike } from '../src/data/vanillaRecipes';

type AnyUI = Record<string, any>;

const WOOD = ITEM_BY_KEY['vi_9_Wood'];            // vid 9 木材（maxStack 9999 = 可连做）
// maxStack-1 成品（flag4 面 :42997-42998——武器类一按一做）：全表扫首个 vi_ 键 maxStack==1 件
let SWORD = -1;
let SWORD_VID = -1;
for (let i = 0; i < ITEM_DEFS.length; i++) {
  const d = ITEM_DEFS[i] as { key: string; maxStack: number } | undefined;
  if (!d) continue;   // 稀疏表（plan-A reorder）有 undefined 洞
  const m = /^vi_(\d+)_/.exec(d.key);
  if (m && SWORD < 0 && d.maxStack === 1) {
    SWORD = i;
    SWORD_VID = +m[1];
  }
}

const woodRecipe = (): VanillaRecipeLike => ({ create: 9, createStack: 1, tile: -1, items: [], groups: [] });
const swordRecipe = (): VanillaRecipeLike => ({ create: SWORD_VID, createStack: 1, tile: -1, items: [], groups: [] });
// ★BJ535 桩面迁移：runCraftArm 悬停门改 hoverHitTest（每拍 elementFromPoint 坐标
//  hit-test——matches(':hover') 的 mousemove 事件流依赖已废）。桩=锚 el（hit 可变）
//  +elementFromPoint mock（命中↔hit：hit=true=光标物理在行上（t===el 命中）;
//  hit=false=光标物理离行,坐标 hit-test 落空）。matches/contains 只作同真值镜像
//  保留（真浏览器 :hover 由事件流维护,桩面不再承载判定）。
type HoverEl = {
  isConnected: boolean;
  matches: (s: string) => boolean;
  contains: (n: unknown) => boolean;
  hit: boolean;
};
let hitAnchor: HoverEl | null = null;
const hoverEl = (hover = true): HoverEl => {
  const el: HoverEl = { isConnected: true, matches: () => el.hit, contains: () => el.hit, hit: hover };
  hitAnchor = el;
  return el;
};
(globalThis as unknown as { document: unknown }).document = {
  elementFromPoint: () => (hitAnchor?.hit ? hitAnchor : null),
};

function mkUi(): { ui: AnyUI; crafts: Array<{ r: VanillaRecipeLike; times: number }> } {
  const ui = Object.create(UI.prototype) as unknown as AnyUI;
  const crafts: Array<{ r: VanillaRecipeLike; times: number }> = [];
  ui.game = {
    player: { inv: {} },
    sfx: { play: () => {} },
    itemId: (k: string) => (k === 'vi_9_Wood' ? WOOD : k === vanillaItemKey(SWORD_VID) ? SWORD : -1),
    vanillaCraft: (r: VanillaRecipeLike, times: number) => { crafts.push({ r, times }); },
  };
  // stackSplit 计时面字段（构造器初始化器,原型桩手工补——bj157 同法）
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
  ui.mouseX = 100;                                       // ★BJ535 光标坐标缓存（hoverHitTest 读面）
  ui.mouseY = 100;
  ui.guidePlaced = false;
  ui.invPanel = { style: { display: 'block' } };
  ui.refreshAll = () => {};
  return { ui, crafts };
}

// ============ 压拍面（craftPressTick = HoverOverCraftingItemButton 压拍 1:1） ============
describe('BJ391 ① 压拍面——单击语义=原版压拍 num2 1|10 两档', () => {
  it('Shift 压拍=连做 10+进 30 拍冷却+上膛（:43013-43018）', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    ui.craftPressTick(r, true, hoverEl(), 'list');
    expect(crafts).toEqual([{ r, times: 10 }]);   // 压拍 num2=(0+1)×10（ShiftInUse）
    expect(ui.stackSplit).toBe(30);               // RefreshStackSplitCooldown 首压支
    expect(ui.craftHold?.r).toBe(r);              // maxStack>1 上膛
    expect(ui.craftHold?.kind).toBe('list');
  });

  it('无 Shift 压拍=1;maxStack-1 成品不上膛（flag4 :42996-42998——武器类一按一做）', () => {
    const { ui, crafts } = mkUi();
    const wood = woodRecipe();
    ui.craftPressTick(wood, false, hoverEl(), 'list');
    expect(crafts).toEqual([{ r: wood, times: 1 }]);
    const sword = swordRecipe();
    ui.craftPressTick(sword, true, hoverEl(), 'list');
    expect(crafts).toHaveLength(2);               // 压拍照常合成
    expect(ui.craftHold).toBeNull();              // 按住期 flag5 恒阻=不上膛
  });

  it('松键归零面（:63422）：落臂归零后再压立即合成（非等 30 拍冷却）', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    const el = hoverEl();
    ui.craftPressTick(r, false, el, 'list');
    ui.uiBtnLeft = true;
    for (let t = 0; t < 5; t++) ui.tickStackSplitMain();   // 按住中 stackSplit≈25
    ui.uiBtnLeft = false;                                  // 松键
    ui.tickStackSplitMain();                               // 落臂+归零
    expect(ui.craftHold).toBeNull();
    expect(ui.stackSplit).toBe(0);
    ui.craftPressTick(r, false, el, 'list');               // 重按：立即第 2 次
    expect(crafts).toHaveLength(2);
  });
});

// ============ 长按节拍（与取件臂 BJ157 共享 stackSplit 计时面） ============
describe('BJ391 ② 长按连做节拍——冷却窗+stackDelay 加速梯', () => {
  it('压拍后 28 拍内不连做,第 29 拍第 2 次,续做冷却收窄 stackDelay=7（:42999 门）', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    ui.craftPressTick(r, false, hoverEl(), 'list');
    ui.uiBtnLeft = true;
    for (let t = 0; t < 28; t++) ui.tickStackSplitMain();
    expect(crafts).toHaveLength(1);               // 冷却窗内不连做
    ui.tickStackSplitMain();                      // 第 29 拍 stackSplit=1 → 连做
    expect(crafts).toHaveLength(2);
    expect(crafts[1]!.times).toBe(1);             // 无 Shift num2=1
    expect(ui.stackSplit).toBe(7);                // 续做支 → stackDelay（非 30=加速）
  });

  it('加速梯：第 2 次后 6 拍即第 3 次（stackDelay 梯,非恒 30/29）', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    ui.craftPressTick(r, false, hoverEl(), 'list');
    ui.uiBtnLeft = true;
    for (let t = 0; t < 29; t++) ui.tickStackSplitMain();   // 第 2 次
    expect(crafts).toHaveLength(2);
    for (let t = 0; t < 5; t++) ui.tickStackSplitMain();
    expect(crafts).toHaveLength(2);               // 冷却 7 → 第 5 拍仍未做
    ui.tickStackSplitMain();
    expect(crafts).toHaveLength(3);               // 第 6 拍第 3 次（间隔 6<29）
  });

  it('Shift 电平逐拍（ShiftInUse :300-306 每拍读）：长按中按 Shift 下一拍即 ×10', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    ui.craftPressTick(r, false, hoverEl(), 'list');
    ui.uiBtnLeft = true;
    for (let t = 0; t < 29; t++) ui.tickStackSplitMain();   // 第 2 次（无 Shift,1 件）
    expect(crafts[1]!.times).toBe(1);
    ui.uiBtnShift = true;                         // 按住中按 Shift
    for (let t = 0; t < 6; t++) ui.tickStackSplitMain();
    expect(crafts).toHaveLength(3);
    expect(crafts[2]!.times).toBe(10);            // 下一拍起 ×10（num2=1×10）
  });
});

// ============ 停止条件三档 ============
describe('BJ391 ③ 停止条件——松键落臂/元素销毁落臂/离行暂停回行续做', () => {
  it('离行暂停不清锚,回行续做（原版 Draw 逐帧仅悬停焦点行调用面）', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    const el = hoverEl(false);                    // 按住中拖离行（hit-test 落空）
    ui.craftPressTick(r, false, el, 'list');
    ui.uiBtnLeft = true;
    for (let t = 0; t < 40; t++) ui.tickStackSplitMain();
    expect(crafts).toHaveLength(1);               // 离行期不连做
    expect(ui.craftHold).not.toBeNull();          // 暂停不清锚
    el.hit = true;                                // 拖回行（坐标 hit-test 重新命中）
    ui.tickStackSplitMain();
    expect(crafts).toHaveLength(2);               // 回行续做
  });

  it('元素销毁落臂：面板关/池重建未及物化（isConnected=false）→ 落臂不再连做', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    const el = hoverEl();
    ui.craftPressTick(r, false, el, 'list');
    ui.uiBtnLeft = true;
    el.isConnected = false;                       // 行随刷新销亡
    ui.tickStackSplitMain();
    expect(ui.craftHold).toBeNull();
    for (let t = 0; t < 40; t++) ui.tickStackSplitMain();
    expect(crafts).toHaveLength(1);
  });

  it('guidePlaced 门（:42988 guideItem.IsAir）：反查态长按不连做', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    ui.craftPressTick(r, false, hoverEl(), 'list');
    ui.guidePlaced = true;
    ui.uiBtnLeft = true;
    for (let t = 0; t < 40; t++) ui.tickStackSplitMain();
    expect(crafts).toHaveLength(1);
  });
});

// ============ superFastStack 尾段（:62739-62751 梯底一拍多件） ============
describe('BJ391 ④ superFastStack 尾段——长按尾段一拍多件', () => {
  it('无 Shift：长按尾段一拍多件（num2=superFastStack+1>1,naive 恒 1 不成立）', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    ui.craftPressTick(r, false, hoverEl(), 'list');
    ui.uiBtnLeft = true;
    for (let t = 0; t < 800; t++) ui.tickStackSplitMain();
    const maxTimes = Math.max(...crafts.map((c) => c.times));
    expect(maxTimes).toBeGreaterThan(1);          // 梯底 superFastStack 支
  });

  it('有 Shift：长按尾段一拍 >10 件（num2=(superFastStack+1)×10）', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    ui.craftPressTick(r, true, hoverEl(), 'list');
    ui.uiBtnLeft = true;
    ui.uiBtnShift = true;
    for (let t = 0; t < 800; t++) ui.tickStackSplitMain();
    const maxTimes = Math.max(...crafts.map((c) => c.times));
    expect(maxTimes).toBeGreaterThan(10);         // 超 Shift 单档 10=尾段乘数支
  });
});

// ============ 结构锁（变异面：摘任意一站接线/换锚/tick⑤ 即红） ============
describe('BJ391 ⑤ 结构锁——四站压面接线+tick⑤+四站换锚', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/ui/UI.ts'), 'utf8');
  it('craftPressTick 四站调用+定义（classic 列表/鱼眼格/modern 格/详情槽）', () => {
    expect((src.match(/craftPressTick\(/g) ?? []).length).toBe(5);   // 4 站+1 定义
    expect(src.includes("'list'")).toBe(true);
    expect(src.includes("'fisheye'")).toBe(true);
    expect(src.includes("'mcell'")).toBe(true);
    expect(src.includes("'mdetail'")).toBe(true);
  });
  it('tickStackSplitMain 尾接 runCraftArm();四站重建换锚齐备', () => {
    expect(src.includes('this.runCraftArm();')).toBe(true);
    expect((src.match(/this\.craftHold\.el = /g) ?? []).length).toBe(4);
  });
});

// ============ 夹具自检 ============
describe('BJ391 0 夹具自检', () => {
  it('木材 vid 9 反解+maxStack>1;maxStack-1 件在册且 vid 可反解', () => {
    expect(vanillaItemKey(9)).toBe('vi_9_Wood');
    expect(ITEM_DEFS[WOOD].maxStack).toBeGreaterThan(1);
    expect(SWORD).toBeGreaterThan(-1);
    expect(ITEM_DEFS[SWORD].maxStack).toBe(1);
    expect(vanillaItemKey(SWORD_VID)).toBeTruthy();
  });
});
