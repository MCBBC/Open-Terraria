// SW-FX38（2026-09-11）合成配方列表滚轮【滚距/步进/吸附】语义定谳刀。
// 用户报:"背包下合成配方列表滚动时切换的速度是不是比原版快?" → 三重偏差定谳+1:1 校正:
//   ①滚距:旧 `Math.max(1, Math.round(deltaY/120))` 对【任意非零 deltaY 莫名 +1 档】
//     ——子档拍(trackpad/高解析滚轮 ±[1,119])原版整吞(Main.cs:17593 C# 整除向零截断,
//     全链无累积器:PlayerInput.cs:901-902 每帧直差,120/notch 量化在 OS 层);
//   ②方向:XNA/MonoGame ScrollWheelValue【上滚为正】(docs.monogame.net MouseState)⇒
//     浏览器 deltaY>0=下滚=原版负档——旧实现同号=手势反转;仓内经验锚 ChestUI.cs:
//     306-312 Scroll(mouseWheel>0)→行--("下滚=箱子下翻"玩家体感即 wheel-down 负档);
//   ③吸附:原版"切换速度"本体=DrawRecipes_AdjustRecipeOffsetSnappy(CraftingUI.cs:
//     376-404)每拍 0.97 衰减+6.5px 滑行(65px 行距 ≈9-10 拍),tick 每越 65px 行界一响
//     (:388-393)——旧实现瞬时重排(登记偏差,本刀清偿)。
// 变异证红:vanillaWheelNotches 取消负号→方向组红;trunc→round→子档组红;
//   craftSnapEase 去 0.97/去 6.5→轨迹组红;craftSnapCrossedRow 改 floor→负域行界组红。
// 正本:1457 反编译(Terarria1457/);1458 同域零变更(CraftingUI.cs/UIList.cs/
//   DoScrollingInInventory 逐字节 diff 全等,本轮实证)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vanillaWheelNotches, craftSnapEase, craftSnapCrossedRow } from '../src/ui/craftingGrid';
import {
  craftGridRecStartAfterUp, craftGridRecStartAfterDown, clampCraftGridRecStart,
} from '../src/ui/craftingGrid';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const uiSrc = read('src/ui/UI.ts');
const gridSrc = read('src/ui/craftingGrid.ts');

// ============================================================
// ① 滚轮档数(Main.cs:17593 int num = PlayerInput.ScrollWheelDelta / 120)
// ============================================================
describe('SW-FX38 滚轮档数 vanillaWheelNotches（Main.cs:17593）', () => {
  it('C# 整除向零截断:子档拍 ±[1,119] 整吞=0(无累积器),±120=±1', () => {
    expect(vanillaWheelNotches(0)).toBe(0);
    for (const d of [1, 40, 60, 100, 119, -1, -40, -60, -100, -119]) {
      expect(vanillaWheelNotches(d)).toBe(0);   // 旧 max(1,·)+round 在此虚生 1 档=滚距偏快根因
    }
    expect(vanillaWheelNotches(120)).toBe(-1);
    expect(vanillaWheelNotches(-120)).toBe(1);
  });
  it('一拍多档整批:±240=±2、±360=±3(主调一次 += 全走,CraftingUI.cs:574)', () => {
    expect(vanillaWheelNotches(240)).toBe(-2);
    expect(vanillaWheelNotches(-240)).toBe(2);
    expect(vanillaWheelNotches(360)).toBe(-3);
    expect(vanillaWheelNotches(-360)).toBe(3);
  });
  it('方向=XNA 上滚为正 ⇒ 浏览器 deltaY<0(上滚)=+1 档(取负对齐)', () => {
    // 原版语义:ScrollCraftingList(+1)=focusRecipe+1=焦点行【下移】(后面配方居中);
    // 浏览器同手势(上滚)deltaY<0 → 必须 +1
    expect(vanillaWheelNotches(-120)).toBe(1);
    expect(vanillaWheelNotches(120)).toBe(-1);
  });
  it('trunc 非 floor(-250/120 向零=-2 非 -3)+ 浮点 deltaY', () => {
    expect(vanillaWheelNotches(-250)).toBe(2);      // floor 会给 3 = 伪多档
    expect(vanillaWheelNotches(250)).toBe(-2);
    expect(vanillaWheelNotches(119.999)).toBe(0);
    expect(vanillaWheelNotches(-120.5)).toBe(1);
  });
  it('行模式归一(★SW-RB14d F1 重锚:1 行≈40px、Firefox 每 notch≈3 行——旧「±1 行=±1 档」3× 过计;' +
    '亚 notch 吞零由滚轮累计器余数留置补偿,不归一=列表死轮的意图不变)', () => {
    expect(vanillaWheelNotches(-3, 1)).toBe(1);     // Firefox 鼠标一格=±3 行
    expect(vanillaWheelNotches(3, 1)).toBe(-1);
    expect(vanillaWheelNotches(-1, 1)).toBe(0);     // 亚 notch 吞（累计器三拍汇 1 档）
    expect(vanillaWheelNotches(-6, 1)).toBe(2);
    expect(vanillaWheelNotches(-2, 2)).toBe(2);     // 页模式近似 120px/页
  });
});

// ============================================================
// ② 吸附一步(CraftingUI.cs:381-382 original=MoveTowards(num2·0.97, 0, 6.5))
// ============================================================
describe('SW-FX38 吸附步进 craftSnapEase（CraftingUI.cs:381-382）', () => {
  it('单步精确值:0.97 衰减 + 6.5px/拍 线性', () => {
    expect(craftSnapEase(-65)).toBeCloseTo(-56.55, 10);       // 0.97·-65=-63.05 → +6.5
    expect(craftSnapEase(-56.55)).toBeCloseTo(-48.3535, 10);
    expect(craftSnapEase(65)).toBeCloseTo(56.55, 10);          // 正域(焦点行自上方入位)对称
    expect(craftSnapEase(0)).toBe(0);
  });
  it('MoveTowards 终点语义:|num2·0.97|≤6.5 → 0(一步收口)', () => {
    expect(craftSnapEase(-6.7)).toBe(0);        // 0.97·-6.7=-6.499 → 0
    expect(craftSnapEase(-6.71)).toBeCloseTo(-0.0087, 10);
    expect(craftSnapEase(-5)).toBe(0);
    expect(craftSnapEase(3)).toBe(0);
  });
});

// ============================================================
// ③ 行界越格判响(CraftingUI.cs:388-393 trunc(num2/65)≠trunc(original/65)→SoundID 12)
// ============================================================
describe('SW-FX38 行界判响 craftSnapCrossedRow（CraftingUI.cs:388-393）', () => {
  it('1 行滑行:首拍越界一响,余拍静默;settle 帧(num2≈0→0)不响', () => {
    expect(craftSnapCrossedRow(-65, craftSnapEase(-65))).toBe(true);        // -1 → 0
    expect(craftSnapCrossedRow(craftSnapEase(-65), craftSnapEase(craftSnapEase(-65)))).toBe(false);
    expect(craftSnapCrossedRow(-3.2, 0)).toBe(false);                        // trunc(-3.2/65)=0=trunc(0)
    expect(craftSnapCrossedRow(0, 0)).toBe(false);                           // 钳位 no-op 无音
  });
  it('瞬吸(fast)一次跨多行界=一响(CraftingUI.cs:383-386 original=0 直达)', () => {
    expect(craftSnapCrossedRow(-130, 0)).toBe(true);
    expect(craftSnapCrossedRow(-195, 0)).toBe(true);
  });
});

// ============================================================
// ④ 滑行轨迹模型(0.97×-6.5 递推;原版"切换速度"本体)
// ============================================================
describe('SW-FX38 滑行轨迹模型(CraftingUI.cs:376-404 递推)', () => {
  const glide = (start: number): { frames: number[]; ticks: number; settle: number } => {
    const frames: number[] = [];
    let ticks = 0;
    let v = start;
    for (let f = 0; f < 60 && v !== 0; f++) {
      const n = craftSnapEase(v);
      if (craftSnapCrossedRow(v, n)) ticks++;
      frames.push(n);
      v = n;
    }
    return { frames, ticks, settle: frames.length };
  };
  it('1 行(65px)≈9 拍收敛(≈150ms@60fps),行界音恰 1 响', () => {
    const r = glide(-65);
    expect(r.settle).toBe(9);
    expect(r.ticks).toBe(1);
    expect(r.frames[0]).toBeCloseTo(-56.55, 10);
    expect(r.frames[8]).toBe(0);
  });
  it('2 行(130px)=16 拍收敛,行界音 2 响(-65 界+0 界)随滑行散布', () => {
    const r = glide(-130);
    expect(r.settle).toBe(16);
    expect(r.ticks).toBe(2);
    expect(r.frames[0]).toBeCloseTo(-119.6, 10);
  });
  it('上方入位(+65)对称同拍频', () => {
    const r = glide(65);
    expect(r.settle).toBe(9);
    expect(r.ticks).toBe(1);
  });
});

// ============================================================
// ⑤ 滚距步进序列对拍(focus = clamp(focus+notches);网格 recStart 逐档钳制)
// ============================================================
describe('SW-FX38 滚距步进序列(Main.cs:17593+CraftingUI.cs:572-583 直算对拍)', () => {
  const stepFocus = (focus: number, n: number, len: number): number =>
    Math.min(len - 1, Math.max(0, focus + n));   // CraftingUI.cs:574-582 逐字
  it('列表:逐 notch ±1、整批 +3、双端钳制 no-op', () => {
    let f = 0;
    const len = 60;
    for (let i = 0; i < 3; i++) { f = stepFocus(f, vanillaWheelNotches(-120), len); }   // 上滚×3
    expect(f).toBe(3);
    f = stepFocus(f, vanillaWheelNotches(-240), len);   // 一拍两档整批
    expect(f).toBe(5);
    f = stepFocus(f, vanillaWheelNotches(120), len);    // 下滚一档
    expect(f).toBe(4);
    f = stepFocus(f, vanillaWheelNotches(120), len);
    expect(f).toBe(3);
    expect(stepFocus(0, vanillaWheelNotches(120), len)).toBe(0);        // 顶端下滚钳 0(无音)
    expect(stepFocus(len - 1, vanillaWheelNotches(-120), len)).toBe(len - 1);   // 尾端上滚钳 n-1
  });
  it('列表:子档拍零位移(deltaY=±40/±100 序列全程 focus 不动)', () => {
    let f = 10;
    for (const d of [40, -40, 100, -100, 60, -119]) {
      const n = vanillaWheelNotches(d);
      if (n !== 0) f = stepFocus(f, n, 60);   // vinvCraftWheel :num===0 早退同相
    }
    expect(f).toBe(10);
  });
  it('网格:每档 ±cols,+=支钳 avail-cols(尾页半空=原版逐字),−=支钳 0', () => {
    const cols = 5, avail = 13;
    let rs = 0;
    rs = craftGridRecStartAfterDown(rs, cols, avail);   // 上滚档1(notches=+1 → AfterDown)
    expect(rs).toBe(5);
    rs = craftGridRecStartAfterDown(rs, cols, avail);
    expect(rs).toBe(8);                                 // 10 > 13-5=8 → 钳 8(尾页半空)
    rs = craftGridRecStartAfterDown(rs, cols, avail);
    expect(rs).toBe(8);                                 // 顶死
    rs = craftGridRecStartAfterUp(rs, cols);            // 下滚档(notches=-1 → AfterUp,无音)
    expect(rs).toBe(3);
    rs = craftGridRecStartAfterUp(rs, cols);
    expect(rs).toBe(0);                                 // -2 < 0 → 0
  });
  it('网格:每拍绘制钳制(recStart>avail-page 收页,再钳 0)与滚轮钳不互踩', () => {
    const cols = 5, rows = 5, avail = 13;
    expect(clampCraftGridRecStart(8, avail, cols, rows)).toBe(0);   // avail-page=-12<0 → 0
    expect(clampCraftGridRecStart(3, 40, cols, rows)).toBe(3);      // 页内不动
    expect(clampCraftGridRecStart(20, 40, cols, rows)).toBe(15);    // 40-25=15
  });
  it('网格:子档拍不分页(deltaY=±40 → notches=0 → while 不进)', () => {
    expect(vanillaWheelNotches(40)).toBe(0);
    expect(vanillaWheelNotches(-40)).toBe(0);
  });
});

// ============================================================
// ⑥ 接线锚定(UI.ts/craftingGrid.ts 消费点漂移即红)
// ============================================================
describe('SW-FX38 接线锚定', () => {
  it('craftingGrid.ts 三纯函数在仓且带 1457 锚注', () => {
    expect(gridSrc).toMatch(/export function vanillaWheelNotches\(deltaY: number, deltaMode = 0\): number \{[^]*?const n = Math\.trunc\(-px \/ 120\);\s*\n\s*return n === 0 \? 0 : n;/);
    expect(gridSrc).toMatch(/export function craftSnapEase\(v: number\): number \{/);
    expect(gridSrc).toMatch(/export function craftSnapCrossedRow\(a: number, b: number\): boolean \{\s*\n\s*return Math\.trunc\(a \/ 65\) !== Math\.trunc\(b \/ 65\);/);
    expect(gridSrc).toMatch(/Main\.cs:17593/);
    expect(gridSrc).toMatch(/CraftingUI\.cs:381-382/);
  });
  it('UI.ts:窗口级网格支吃共享档数器(单源,无本地 round/abs 派生)', () => {
    expect(uiSrc).toMatch(/const notches = vanillaWheelNotches\(e\.deltaY, e\.deltaMode\);[^\n]*\n\s*if \(this\.vinvPipsUseGrid\)/);   // ★SW-RB14d：补传 deltaMode
    expect(uiSrc).not.toMatch(/Math\.round\(e\.deltaY \/ 120\)/);
    expect(uiSrc).not.toMatch(/Math\.abs\(Math\.round\(e\.deltaY \/ 120\)\)/);
  });
  it('UI.ts:列表滚轮=vanillaWheelNotches+单次整批钳制+子档早退(CraftingUI.cs:574-582)', () => {
    expect(uiSrc).toMatch(/this\.vinvCraftWheelPendPx \+= wheelEventPx\(e\.deltaY, e\.deltaMode\);/);   // ★SW-RB14d F2：跨事件累计
    expect(uiSrc).toMatch(/const num = vanillaWheelNotches\(this\.vinvCraftWheelPendPx\);[^\n]*\n\s*if \(num === 0\) return;/);   // 帧差分量化同构
    expect(uiSrc).toMatch(/this\.vinvCraftWheelPendPx \+= num \* 120;/);   // 整档消费余数留置
    expect(uiSrc).toMatch(/Math\.min\(rows\.length - 1, Math\.max\(0, this\.vinvCraftFocusV \+ num\)\)/);
    expect(uiSrc).not.toMatch(/Math\.max\(1, steps\)/);   // 旧虚生档=回归哨兵
    expect(uiSrc).not.toMatch(/vinvCraftWheel\(e, steps\)/);
  });
  it('UI.ts:吸附状态+步进消费面(滚轮/列表格点/网格格点/60fps 配额环)', () => {
    expect(uiSrc).toMatch(/private vinvCraftGlideY = 0;/);
    expect(uiSrc).toMatch(/private vinvCraftFastScroll = false;/);
    expect(uiSrc).toMatch(/private vinvCraftSnapStep\(\): boolean \{/);
    // 60fps 配额步进环(pulse tick 内)
    expect(uiSrc).toMatch(/this\.vinvCraftGlideAcc \+= dt \/ \(1000 \/ 60\);[^]*?for \(let k = 0; k < steps; k\+\+\) this\.vinvCraftSnapStep\(\);/);
    // 关包置 fast(Main.cs:46428 每拍语义)——pulse 隐藏门
    expect(uiSrc).toMatch(/this\.vinvCraftFastScroll = true;\s*\/\/ ★SW-FX38:!playerInventory/);
    // 网格格点=瞬吸(CraftingUI.cs:523 recFastScroll=true)
    expect(uiSrc).toMatch(/this\.vinvCraftFastScroll = true;\s*\/\/ ★SW-FX38 :523 recFastScroll=true/);
    // 列表格点=滑行(HoverOverCraftingItemButton :43032-43035 无 fast)
    expect(uiSrc).toMatch(/this\.vinvCraftFocusGoto\(idx\);\s*\n\s*this\.game\.sfx\.play\('menuTick', 1\);\s*\n\s*this\.vinvCraftSnapStep\(\);/);
  });
  it('UI.ts:鱼眼几何/渐隐吃吸附值(CraftingUI.cs:177/:358-369 读 availableRecipeY)', () => {
    expect(uiSrc).toMatch(/const yOff = \(i - this\.vinvCraftFocusV\) \* 65 \+ this\.vinvCraftGlideY;/);
    // ★SW-RB14d F3 重锚：重建期=身份追焦+钳制+glideY 不动（Recipe.cs:478-494 + VisuallyRepositionRecipes :131-139）
    expect(uiSrc).toMatch(/const idx = avail\.findIndex\(\(p2\) => p2\.r === oldRecipe\);/);
    expect(uiSrc).toMatch(/this\.vinvCraftFocusV = nextFocus;/);
    expect(uiSrc).not.toMatch(/vinvCraftFocusGoto\(Math\.min\(this\.vinvCraftFocusV/);   // 旧钳制播种式退役
  });
  it('滚轮面无音效(音走行界:CraftingUI.cs:572-583 全程无 PlaySound)', () => {
    const wheelBlock = uiSrc.slice(uiSrc.indexOf('private vinvCraftWheel(e: WheelEvent)'), uiSrc.indexOf('private vinvCraftFocusGoto'));
    expect(wheelBlock).not.toContain("sfx.play");
  });
});
