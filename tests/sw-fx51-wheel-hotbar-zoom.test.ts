// SW-FX51（2026-09-13）滚轮域收尾两刀（FX50 登记新债+备案项清偿）。
// 铁律=先定谳再动刀;金标=1457 反编译逐值（1458 同域先核对:FX50 实录 Player.cs 行漂
// −11 语义零变更——热栏 1458:24422/:32027 同为 `/-120`,本刀锚 1457 终值）。
//
// 定谳表：
//   刀1 热栏滚轮整缺（FX50 最大发现:仓内全无 wheel→hotbar 消费）——
//       原版调用域 Player.cs:25385-25407 分支树:mapFullscreen→缩放 /
//       CaptureManager.Active→Scrolling() / !hairWindow→{playerInventory→
//       DoScrollingInInventory(:25404-25405) ; else→HandleHotbarControls(:25406)}。
//       滚轮臂 :32005-32036:`num += PlayerInput.ScrollWheelDelta / -120`（:32029,
//       C# 整除向零;XNA 上滚=+120 ⇒ num=−1=上一格,`/-120` 负号即方向自白）+
//       `selectedItemState.Select(ClampHotbarOffset(selectedItemState.Hotbar + num))`
//       （:32032-32033;ClampHotbarOffset :32134-32145 while >9−10/<0+10 环绕）。
//       门=:32028 `!Main.inFancyUI && !Main.ingameOptionsWindow`（滚轮臂专属;热栏
//       【关包可见态才滚】——playerInventory 门在分支树,数字键块 :25289 无此门=
//       原版刻意不对称,仓内 Game.ts:5617 已按原版登记「背包开着照切栏」）。
//       Select 本地等价=数字键臂同款三件套（selected 写回+afkCounter 清零 :498-499+
//       onInventoryChanged）;SoundID 12（Select :492）两通道现状均不响=同域债登记。
//       基准槽=SelectedItemState.Hotbar 镜像（:391;仓内 smartSelectHotbar :12024 跟随
//       记录）——Shift 智选覆盖期 inv.selected 可为 >9 工具槽,原版基准从不取它
//       （OverrideSelection 从不写 :391,A-F5 同判）。
//       TryInterruptingItemUsage 的滚轮 veto 臂（:24411-24440,读 ScrollWheelDelta 不切槽）
//       仓内 heldProj/Interrupt 面未建模=整域债登记,非本刀。
//   刀2 全屏图缩放复利（FX50 点2 备案债）——Player.cs:25387-25396:
//       `float num8 = PlayerInput.ScrollWheelDelta / 120;`（C# 整除向零）+
//       `Main.mapFullscreenScale *= 1f + num8 * 0.3f;` ⇒ 上滚 ×1.3/下滚 ×0.7,
//       跨帧【复利】（连滚两拍=1.69）;一帧多档 1+n·0.3【线性】（±2 档=×1.6/×0.4）。
//       仓内旧 0.85/1.18 单步退役;鼠标锚/缓动/显示域钳=仓内增益保留（FX50 裁决）,
//       复利基准取 zoomTarget（缓动收终点）——基准取缓动中的 zoom 会被缓动分数吞复利。
//       手柄臂（:25391-25394 ×0.1f）无手柄通道不建（登记）;hairWindow 让位支本仓无
//       对局内理发窗不建模（登记）。
//   支撑刀 Input.wheelDelta 号面升级：sign（浏览器号,±1/事件）→ ±notch 计数档
//       （XNA 号;deltaMode 归一 px 取负入 _wheelPxCarry,整档 ±120 即时发布、余数
//       跨帧留置=RB14d 累计器同款——Chrome ±100px/notch 重映射下逐事件 trunc 整类
//       吞零;原版 PlayerInput.cs:1407 逐事件 ScrollWheelValue+=、:901-902 帧差/120,
//       量化相位在事件界而非帧界 <1 拍差,净档数逐值同）。wheelEventPx 迁
//       core/input/wheel.ts 单源（core 禁反向 import ui/,craftingGrid 原位 re-export,
//       fx38 源锁 :199 不动）。观战退出（Player.cs:17209 !=0 符号无关）与拍照通道
//       （browserWheelDeltaYToVanilla）不受影响。
//
// 变异证红（手工执行实录,样本=对应组全红）：
//   M1 hotbarWheelSwitch `-notches`→`+notches`（翻号）→ A1-A5 红（方向矩阵翻转）
//   M2 hotbarWheelSwitch 基准 smartSelectHotbar→player.inv.selected → A6 红（覆盖期基准错:
//      3+1≠30+1）
//   M3 `((x%10)+10)%10`→`x%10` → A3 红（0−1=−1 负槽溢出）
//   M4 zoom 基准 zoomTarget→zoom（缓动中值）→ C3 红（缓动分数吞复利,3.38→2.66）
//   M5 系数 0.3→0.15（0.85/1.18 旧值回归）→ C1/C2/C3 红（2.6→2.15 等）
//   M6 afkCounter=0 行删 → A7 红;onInventoryChanged 行删 → A7 红
//   M7 分支序互换（capture 支提到 map 支前）→ B1+B2 红（支序断言,实测 2 红）
//   M8 Input 入账取负删去（carry += px）→ E1+FX50-B1 源锁红（实测 2 红;D3=转录面,源锁锚真身）
//   M9 Input 发布面改逐事件 trunc（余数不留置）→ E1+FX50-B1 红（实测 2 红）
//   M9t 转录面同变异（carryModel 去累计）→ D1/D2/D5 红（实测 4 红=余数留置语义判别力）
//   M10b frame() 暂停支删 resetWheelAccumulators() 调用 → E2 红（实测 1 红;注释掉不红=
//        toContain 子串语义,变异须整行删除）
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { wheelEventPx } from '../src/core/input/wheel';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const gameSrc = read('src/core/Game.ts');
const inputSrc = read('src/core/Input.ts');
const gridSrc = read('src/ui/craftingGrid.ts');

// ---- 原型壳（spectate-self.test.ts 同款:private 仅编译期,vitest 无 DOM 不走构造器）----
interface WheelShell {
  player: Player;
  input: { mouseX: number; mouseY: number; wheelDelta: number };
  renderer: {
    fullMap: { open: boolean; zoom: number; zoomTarget: number };
    zoomFullMapAt: (z: number, x: number, y: number) => void;
    captureMode: { active: boolean };
  };
  smartSelectHotbar: number;
  paused: boolean;
  cb: { onInventoryChanged: ReturnType<typeof vi.fn> };
  // BJ68 2026-09-14:hotbarWheelSwitch 接 Select 音(SoundID 12)后触及 sfx sink——壳补桩
  sfx: { play: ReturnType<typeof vi.fn> };
  fullMapWheelZoom(): void;
  hotbarWheelSwitch(notches: number): void;
}

/** 组装壳:热栏基准槽 3、全屏图 zoom=zoomTarget=2（缓动已收敛态） */
function wheelShell() {
  const p = new Player(100, 100, new Inventory());
  const calls: Array<{ z: number; x: number; y: number }> = [];
  const fm = { open: true, zoom: 2, zoomTarget: 2 };
  const g = Object.create(Game.prototype) as unknown as WheelShell;
  g.player = p;
  g.input = { mouseX: 320, mouseY: 240, wheelDelta: 0 };
  g.renderer = {
    fullMap: fm,
    // 结算等价=写 zoomTarget（Renderer.zoomFullMapAt 的锚点/钳半边不在本刀面,见 C 组注）
    zoomFullMapAt: (z, x, y) => { fm.zoomTarget = z; calls.push({ z, x, y }); },
    captureMode: { active: false },
  };
  g.smartSelectHotbar = 3;
  g.paused = false;
  g.cb = { onInventoryChanged: vi.fn() };
  g.sfx = { play: vi.fn() };   // BJ68:menuTick 桩（音效面断言在 bj68-select-sound-interrupt.test.ts）
  return { g, calls, fm, p };
}

// ═══ 刀1 A：热栏滚轮切换矩阵（Player.cs:32029 /-120 + :32134 ClampHotbarOffset） ═══
describe('SW-FX51 A：热栏滚轮切换（HandleHotbarControls 滚轮臂 1:1）', () => {
  it('A1 上滚=上一格（XNA 上滚=+120 ⇒ num=120/-120=−1,selected−1 向左）', () => {
    const { g, p } = wheelShell();
    g.smartSelectHotbar = 3;
    g.hotbarWheelSwitch(1);                       // notches=+1（上滚一档）
    expect(p.inv.selected).toBe(2);
  });

  it('A2 下滚=下一格（−120/-120=+1,selected+1 向右）', () => {
    const { g, p } = wheelShell();
    g.smartSelectHotbar = 3;
    g.hotbarWheelSwitch(-1);
    expect(p.inv.selected).toBe(4);
  });

  it('A3 环绕：槽 0 上滚 → 9（ClampHotbarOffset <0 +10,:32138-32140）', () => {
    const { g, p } = wheelShell();
    g.smartSelectHotbar = 0;
    g.hotbarWheelSwitch(1);
    expect(p.inv.selected).toBe(9);
  });

  it('A4 环绕：槽 9 下滚 → 0（>9 −10,:32135-32137）', () => {
    const { g, p } = wheelShell();
    g.smartSelectHotbar = 9;
    g.hotbarWheelSwitch(-1);
    expect(p.inv.selected).toBe(0);
  });

  it('A5 一帧多档：±2/±3 档直走（ScrollWheelDelta ±240.. ⇒ num=∓2..,C# 整除向零）', () => {
    const { g, p } = wheelShell();
    g.smartSelectHotbar = 5;
    g.hotbarWheelSwitch(2);                       // 上滚两档 → 3
    expect(p.inv.selected).toBe(3);
    g.smartSelectHotbar = 5;
    g.hotbarWheelSwitch(-3);                      // 下滚三档 → 8
    expect(p.inv.selected).toBe(8);
  });

  it('A6 基准槽=Hotbar 镜像非 inv.selected（覆盖期 :391 不被 >9 槽污染,A-F5 同判）', () => {
    const { g, p } = wheelShell();
    g.smartSelectHotbar = 3;
    p.inv.selected = 30;                          // Shift 智选覆盖态（工具槽 30）
    g.hotbarWheelSwitch(1);
    expect(p.inv.selected).toBe(2);               // 3−1,非 30−1=29
  });

  it('A7 Select 三件套：afkCounter 清零（:498）+ onInventoryChanged（数字键臂同款）', () => {
    const { g, p } = wheelShell();
    p.afkCounter = 100;
    g.hotbarWheelSwitch(1);
    expect(p.afkCounter).toBe(0);
    expect(g.cb.onInventoryChanged).toHaveBeenCalledTimes(1);
  });
});

// ═══ 刀1 B：fixedUpdate 滚轮分支树（Player.cs:25385-25407 逐支次序） ═══
describe('SW-FX51 B：滚轮分支树源锁（mapFullscreen→capture→playerInventory→热栏）', () => {
  // 块内切片定位（块锚注释唯一;★滚轮视野缩放移除注=块尾唯一锚）
  const block = (() => {
    const s = gameSrc.indexOf('// 滚轮：全屏地图打开时缩放地图');
    const e = gameSrc.indexOf('// ★滚轮视野缩放移除', s);
    return gameSrc.slice(s, e);
  })();

  it('B1 四支齐备（缩放/拍照/背包/热栏）且调用点在位', () => {
    expect(block).toContain('this.fullMapWheelZoom();');
    expect(block).toContain('} else if (this.renderer.captureMode.active) {');
    expect(block).toContain('__swUI?.inventoryOpen ?? false');
    expect(block).toContain('} else if (!this.paused) {');
    expect(block).toContain('this.hotbarWheelSwitch(inp.wheelDelta);');
  });

  it('B2 支序=原版（:25387 map→:25397 capture→:25404 背包→:25406 热栏;换序即红）', () => {
    const iZoom = block.indexOf('this.fullMapWheelZoom();');
    const iCap = block.indexOf('this.renderer.captureMode.active');
    const iInv = block.indexOf('__swUI?.inventoryOpen ?? false');
    const iPaused = block.indexOf('!this.paused');
    const iHotbar = block.indexOf('this.hotbarWheelSwitch(inp.wheelDelta);');
    expect(iZoom).toBeGreaterThan(-1);
    expect(iCap).toBeGreaterThan(iZoom);
    expect(iInv).toBeGreaterThan(iCap);
    expect(iPaused).toBeGreaterThan(iInv);
    expect(iHotbar).toBeGreaterThan(iPaused);
  });

  it('B3 滚轮臂专属门：热栏支挂 !paused（inFancyUI∧ingameOptionsWindow :32028 等价）', () => {
    expect(block).toContain('} else if (!this.paused) {');
    // 原版 :25404 背包支在热栏前=关包才滚（热栏可见态门;数字键无此门=刻意不对称）
    expect(block.indexOf('__swUI?.inventoryOpen ?? false'))
      .toBeLessThan(block.indexOf('this.hotbarWheelSwitch'));
  });
});

// ═══ 刀2 C：全屏图缩放复利（Player.cs:25387-25396;0.85/1.18 单步退役） ═══
describe('SW-FX51 C：全屏图缩放（num8=Delta/120;scale *= 1+num8·0.3）', () => {
  it('C1 上滚一档 ×1.3（zoomTarget 基准;锚点坐标透传）', () => {
    const { g, calls } = wheelShell();
    g.input.wheelDelta = 1;
    g.fullMapWheelZoom();
    expect(calls).toHaveLength(1);
    expect(calls[0].z).toBeCloseTo(2 * 1.3, 10);   // ×1.3（旧 0.85/1.18 面回归即红,M5）
    expect(calls[0].x).toBe(320);
    expect(calls[0].y).toBe(240);
  });

  it('C2 下滚一档 ×0.7（方向=XNA 上滚为正;FX50 B2 同向判据保留）', () => {
    const { g, calls } = wheelShell();
    g.input.wheelDelta = -1;
    g.fullMapWheelZoom();
    expect(calls[0].z).toBeCloseTo(2 * 0.7, 10);
  });

  it('C3 跨帧复利：连滚两拍终值=z₀·1.3²（基准=zoomTarget 收终点,缓动不吞复利,M4）', () => {
    const { g, fm } = wheelShell();
    const ease = () => { fm.zoom += (fm.zoomTarget - fm.zoom) * 0.16; };   // Renderer.easeFullMap 每帧步进
    g.input.wheelDelta = 1;
    g.fullMapWheelZoom();
    ease();
    g.input.wheelDelta = 1;
    g.fullMapWheelZoom();
    ease();
    expect(fm.zoomTarget).toBeCloseTo(2 * 1.3 * 1.3, 10);   // =3.38（复利）
    expect(fm.zoom).toBeLessThan(fm.zoomTarget);            // 缓动在途（仓内增益）≠ 基准
  });

  it('C4 一帧多档线性：单拍 +2 档=×1.6（1+n·0.3,非 1.3²=1.69——:25396 逐值）', () => {
    const { g, calls } = wheelShell();
    g.input.wheelDelta = 2;
    g.fullMapWheelZoom();
    expect(calls[0].z).toBeCloseTo(2 * 1.6, 10);
    expect(2 * 1.6).not.toBeCloseTo(2 * 1.3 * 1.3, 2);      // 线性≠复利,同拍判别
  });
});

// ═══ 支撑刀 D：Input ±notch 入账模型（wheelEventPx 归一 + 余数累计器,RB14d 同款） ═══
describe('SW-FX51 D：Input wheelDelta ±notch 计数档入账模型', () => {
  // Input.ts wheel 监听转录（事件界量化:整档发布+余数留置;endFrame 清 wheelDelta 留 carry）
  function carryModel(events: Array<[number, number]>, resetAfter = -1): Array<[number, number]> {
    let carry = 0;
    let wd = 0;
    const out: Array<[number, number]> = [];
    events.forEach(([dY, dm], i) => {
      carry -= wheelEventPx(dY, dm);                 // 浏览器下滚为正 → XNA 上滚为正
      const n = Math.trunc(carry / 120);
      if (n !== 0) { carry -= n * 120; wd += n; }
      if (i === resetAfter) { out.push([wd, carry]); wd = 0; }   // endFrame 清档留余
    });
    out.push([wd, carry]);
    return out;
  }

  it('D1 Chrome ±100px/notch 重映射：余数留置不吃档（M9:逐事件 trunc 会 0,0,0 整类吞）', () => {
    // 三档上滚（浏览器 deltaY=−100×3）:100→200(发1,余80)→180(发1,余60) → 发布 2 档+60px 余
    // （0.67× 慢速但存活;量值域逐值同 RB14d 判例「净档数逐值同」,精确 1:1 需浏览器保真 ±120=环境债登记）
    expect(carryModel([[-100, 0], [-100, 0], [-100, 0]])).toEqual([[2, 60]]);
  });

  it('D2 标准 ±120：一事件一档;一帧多档 ±2;抵消=0', () => {
    expect(carryModel([[-120, 0]])).toEqual([[1, 0]]);
    expect(carryModel([[-120, 0], [-120, 0]])).toEqual([[2, 0]]);
    expect(carryModel([[120, 0], [-120, 0]])).toEqual([[0, 0]]);
  });

  it('D3 符号锚：浏览器上滚（deltaY<0）→ wheelDelta>0（XNA ScrollWheelValue 上滚为正,M8）', () => {
    const [[wd]] = carryModel([[-120, 0]]);
    expect(wd).toBeGreaterThan(0);
    const [[wd2]] = carryModel([[120, 0]]);
    expect(wd2).toBeLessThan(0);
  });

  it('D4 Firefox 行模式不吞零（wheelEventPx deltaMode=1,±3 行=±120px→±1 档,RB14d 回归锁）', () => {
    expect(carryModel([[-3, 1]])).toEqual([[1, 0]]);
    expect(carryModel([[3, 1]])).toEqual([[-1, 0]]);
  });

  it('D5 endFrame 语义：清计数档、余数跨帧留置（下帧补发整档）', () => {
    const seq = carryModel([[-100, 0], [-100, 0]], 0);   // 首事件后 endFrame（wd 清零）
    expect(seq[0]).toEqual([0, 100]);                // 帧1:0 档,carry=100 留置
    expect(seq[1]).toEqual([1, 80]);                 // 帧2:补发 1 档（vanilla :876-877 帧界重锚同相域）
  });

  it('D6 单源锁：wheelEventPx 定义在 core/input/wheel.ts,craftingGrid 原位 re-export（fx38 锁不回退）', () => {
    expect(read('src/core/input/wheel.ts')).toContain('export function wheelEventPx(deltaY: number, deltaMode = 0): number {');
    expect(gridSrc).toContain("import { wheelEventPx } from '../core/input/wheel';");
    expect(gridSrc).toContain('export { wheelEventPx };');
    expect(gridSrc).toContain('export function vanillaWheelNotches(deltaY: number, deltaMode = 0): number {');
  });
});

// ═══ 源锁 E：Input.ts 入账链（与 fx50 B1 互补:锁 px→档换算与号锚） ═══
describe('SW-FX51 E：Input.ts 源锁', () => {
  it('E1 px 取负入账 + 整档发布公式在位', () => {
    expect(inputSrc).toContain('this._wheelPxCarry -= wheelEventPx(e.deltaY, e.deltaMode);');
    expect(inputSrc).toContain('const notches = Math.trunc(this._wheelPxCarry / 120);');
    expect(inputSrc).toContain('this.wheelDelta += notches;');
    expect(inputSrc).toContain('this._wheelPxCarry -= notches * 120;');
  });

  it('E2 暂停窗重锚：frame() paused 支调 resetWheelAccumulators（PlayerInput.cs:1407-1409 re-anchor 1:1,防恢复拍幻象切槽）', () => {
    expect(inputSrc).toContain('resetWheelAccumulators() {');
    expect(inputSrc).toContain('this._wheelPxCarry = 0;');
    expect(gameSrc).toContain('this.input.resetWheelAccumulators();');
  });
});
