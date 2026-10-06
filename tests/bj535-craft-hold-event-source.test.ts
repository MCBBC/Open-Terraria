// ★BJ535（2026-10-06 用户实报）长按批量制作 Windows 需晃动鼠标——定谳：
//  runCraftArm 悬停门曾用 el.matches(':hover')（CSS 伪类=浏览器 hit-test 缓存,其
//  刷新由 mousemove 事件流驱动）。原版推进形态=HoverOverCraftingItemButton
//  (Main.cs:42971-43036) 由 Update/Draw 面逐拍调用,悬停判定每拍基于 Main.mouseX/
//  mouseY 坐标重算,【不依赖输入事件流】。本仓长按合成→refreshAll 整表重建→臂锚换
//  新行（UI.ts 四站换锚）,Windows 静止鼠标零 mousemove ⇒ 新行 hover 位永不建立 ⇒
//  推进冻结,晃动鼠标补流才恢复;mac 触摸板微动持续供流掩盖。探针实证锚
//  scripts/_bj535-hover-maintenance.mjs:Chrome 154 下 mousemove 正常派发
//  mouseenter（事件流注入健康）而 matches(':hover') 不随建立/elementFromPoint 恒
//  正确——CSS hover 维护面与几何 hit-test 的通道分离。落刀=hoverHitTest
//  （每拍 document.elementFromPoint(mouseX,mouseY) 坐标 hit-test,t===el‖contains
//  =子元素传播,与 :hover 同义;坐标=最后已知光标位,静止期即精确位）。
//  判别面（本文件）：
//  ① 静止鼠标推进（Windows 形态负向锁）——锚行 matches/contains 恒 false（=重建后
//    零 mousemove 的 hover 位未建立形态）+坐标 hit-test 每拍命中 → 推进持续。
//    ★变异 B 判别器（runCraftArm 恢复 matches(':hover') 门 → 本测试红;BJ391 旧桩
//    matches()=>true 对该变异失明=幻影桩本质）。
//  ② 事件流无关性——推进全程 mouseX/mouseY 缓存不变（elementFromPoint 收到坐标逐
//    拍同值=静止光标 hit-test 用最后已知位）;光标物理离行（hit-test 落空）→ 暂停不
//    清锚,回位 → 续做。桩面无任何事件派发通道,推进仍走=事件流无关性直证。
//    ★变异 A 判别器（hoverHitTest 退化恒 isConnected → 离行段红,BJ391 离行同红）。
//  ③ BJ430 两臂链端到端——首击聚焦零合成→二击压拍合成+上膛→长按零事件持续推进。
// 测试法：UI 原型桩（sw-bj391 mkUi 同法,★类字段初始化器不入原型须显式补）。
import { describe, it, expect } from 'vitest';
import { UI } from '../src/ui/UI';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import { vanillaItemKey, type VanillaRecipeLike } from '../src/data/vanillaRecipes';

type AnyUI = Record<string, any>;

const WOOD = ITEM_BY_KEY['vi_9_Wood'];

const woodRecipe = (): VanillaRecipeLike => ({ create: 9, createStack: 1, tile: -1, items: [], groups: [] });

// 桩面：elementFromPoint mock=每拍坐标 hit-test 的返回值（hitTarget=null=光标物理
// 离行/行外;=锚 el=光标在行上）——坐标参数全记录（静止光标断言用）。
let hitTarget: { isConnected: boolean; contains: (n: unknown) => boolean } | null = null;
const hitCalls: Array<{ x: number; y: number }> = [];
(globalThis as unknown as { document: unknown }).document = {
  elementFromPoint: (x: number, y: number) => { hitCalls.push({ x, y }); return hitTarget; },
};
/** 重建后 hover 位未建立的配方行：matches/contains 恒 false（真浏览器 :hover 伪类
 *  在零 mousemove 下对新行不建立——Chrome 154 探针+Windows 用户物证同形态）。
 *  ★修复后判定不走 matches,此桩在 hoverHitTest 下命中与否只由 hitTarget 决定。 */
const rebuiltRow = (): any => ({ isConnected: true, matches: () => false, contains: () => false });

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
  ui.mouseX = 100;
  ui.mouseY = 100;
  ui.guidePlaced = false;
  ui.craftFocus = -1;
  ui.hoverFocus = -1;
  ui.invPanel = { style: { display: 'block' } };
  ui.refreshAll = () => {};
  ui.returnCraftGrid = () => {};
  hitCalls.length = 0;
  hitTarget = null;
  return { ui, crafts, sounds };
}

// ============ ① 静止鼠标推进（Windows 形态负向锁,★变异 B 判别器） ============
describe('BJ535 ① 静止鼠标推进——长按+零 mousemove,数量持续推进', () => {
  it('锚行 :hover 位未建立（matches/contains 恒 false）+坐标 hit-test 恒命中 → 长按推进不停', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    const el = rebuiltRow();
    hitTarget = el;                                // 光标物理停在行上（静止,零 mousemove）
    ui.craftPressTick(r, false, el, 'list');       // 压拍合成+上膛（锚=el）
    ui.uiBtnLeft = true;
    for (let t = 0; t < 40; t++) ui.tickStackSplitMain();   // 40 拍零事件
    expect(crafts.length).toBeGreaterThanOrEqual(2);        // ≥2 次（30 拍冷却后推进）
    expect(ui.craftHold).not.toBeNull();           // 推进中不落臂
  });

  it('BJ430 两臂链端到端：首击聚焦零合成→二击合成+上膛→长按零事件持续推进', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    const el1 = rebuiltRow();
    hitTarget = el1;
    ui.craftListPress(0, { r, count: 999 }, false, el1);    // 首击聚焦（不合成）
    expect(crafts).toEqual([]);
    ui.uiBtnLeft = false;
    ui.tickStackSplitMain();                       // 松键归零（:63422）
    const el2 = rebuiltRow();                      // 长按中重建的新行（hover 位未建立）
    hitTarget = el2;
    ui.craftListPress(0, { r, count: 999 }, false, el2);    // 二击=压拍合成+上膛
    expect(crafts).toEqual([{ r, times: 1 }]);
    ui.uiBtnLeft = true;
    for (let t = 0; t < 40; t++) ui.tickStackSplitMain();   // 长按零 mousemove
    expect(crafts.length).toBeGreaterThanOrEqual(2);        // 推进恢复且持续（Windows 晃动不再必需）
  });
});

// ============ ② 事件流无关性（★变异 A 判别器） ============
describe('BJ535 ② 推进由每拍坐标 hit-test 决定,与 mousemove 事件流无关', () => {
  it('静止光标：elementFromPoint 逐拍收同坐标（mouseX/mouseY 缓存全程不变）', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    const el = rebuiltRow();
    hitTarget = el;
    ui.craftPressTick(r, false, el, 'list');
    ui.uiBtnLeft = true;
    for (let t = 0; t < 40; t++) ui.tickStackSplitMain();
    expect(crafts.length).toBeGreaterThanOrEqual(2);
    expect(hitCalls.length).toBeGreaterThanOrEqual(40);     // 每拍重算（tick 驱动）
    const first = hitCalls[0]!;
    expect(hitCalls.every((c) => c.x === first.x && c.y === first.y)).toBe(true);   // 零事件,坐标恒定
  });

  it('光标物理离行（hit-test 落空）→ 暂停不清锚;回位 → 续做（推进随 hit-test,不随事件派发）', () => {
    const { ui, crafts } = mkUi();
    const r = woodRecipe();
    const el = rebuiltRow();
    hitTarget = el;
    ui.craftPressTick(r, false, el, 'list');
    ui.uiBtnLeft = true;
    for (let t = 0; t < 40; t++) ui.tickStackSplitMain();
    expect(crafts.length).toBeGreaterThanOrEqual(2);
    hitTarget = null;                              // 光标物理离行（无任何事件派发）
    const n0 = crafts.length;
    for (let t = 0; t < 30; t++) ui.tickStackSplitMain();
    expect(crafts.length).toBe(n0);                // 离行暂停
    expect(ui.craftHold).not.toBeNull();           // 暂停不清锚
    hitTarget = el;                                // 光标回位（同样零事件）
    ui.tickStackSplitMain();
    expect(crafts.length).toBeGreaterThan(n0);     // 回位续做
  });
});

// ============ 夹具自检 ============
describe('BJ535 0 夹具自检', () => {
  it('木材 vid 9 反解+maxStack>1;桩面 :hover 位未建立形态忠实（matches 恒 false）', () => {
    expect(vanillaItemKey(9)).toBe('vi_9_Wood');
    expect(ITEM_DEFS[WOOD].maxStack).toBeGreaterThan(1);
    const el = rebuiltRow();
    expect(el.matches(':hover')).toBe(false);      // 幻影反面：不喂 hover 建立假象
    expect(el.contains(null)).toBe(false);
  });
});
