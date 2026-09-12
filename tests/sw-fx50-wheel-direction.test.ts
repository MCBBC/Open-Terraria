// SW-FX50（2026-09-12）方向家族滚轮反转复核刀（FX38 剩债三点逐一定谳）。
// 铁律=先定谳再动刀;金标=1457 反编译（1458 同域核对：CaptureInterface.cs/
// PlayerInput.cs/UserInterface.cs/UIList.cs 本轮逐文件核对本刀涉及面零数值变更）。
//
// 定谳表：
//   点1 main.ts:626 拍照模式 pendingWheel —— 旧 `+sign(deltaY)` 与原版
//       ScrollWheelDelta 符号相反（PlayerInput.cs:901-902 `ScrollWheelDelta =
//       ScrollWheelValue − ScrollWheelValueOld`,XNA MouseState.ScrollWheelValue
//       上滚为正 ⇒ 原版上滚=+120;浏览器 deltaY 下滚为正）。唯一消费面 scrolling()
//       （CaptureInterface.cs:1523-1545 照抄,无补偿臂）的 `num%=30` 归一 + `±2`
//       环绕 ⇒ 终模式只随 notch 总数【奇偶】（30、2 皆偶 ⇒ num 与 30−num 同奇偶,
//       ±1 两向同果）⇒ 符号差在现消费面【不可观测】——本刀修=字段语义对齐原版
//       约定（零行为差,防未来量值型消费面踩反转雷）,非行为修复。
//   点2 core/Input.ts:246 wheelDelta（浏览器号,+1=下滚）——两消费面皆无反转：
//       ①观战退出 Game.ts:4464 `if (inp.wheelDelta)` 与原版 Player.cs:17209
//       `PlayerInput.ScrollWheelDelta != 0` 同为【符号无关】1:1;
//       ②全屏地图缩放 Game.ts:8252 `>0 ? 0.85 : 1.18` 消费端补偿臂：浏览器下滚
//       (+1)→×0.85 缩小 = 原版下滚 ×0.7（Player.cs:25385-25392 `num8 =
//       ScrollWheelDelta/120; mapFullscreenScale *= 1f+num8*0.3f`,下滚 delta=−120
//       ⇒ ×0.7 缩小）同向；上滚两版同放大。⇒ 不修（本相正确）。
//       偏差备案（登记债,非本刀面）：倍率 0.85/1.18 ≠ 原版 0.7/1.3,且一帧多档
//       不复利（原版 num8=±2 ⇒ ×1.6/×0.4;仓内恒单步）+鼠标锚点缩放为仓内增益。
//   点3 VUI.ts:72 —— RB14d 修复在位复核：`VUI.wheel += -Math.sign(e.deltaY)`
//       单次取负;消费链 UserInterface.ts:126 直通（UserInterface.cs:219-222）+
//       UIList `viewPosition -= evt.scrollWheelValue`（UIList.cs:109-116 照抄）
//       ⇒ 上滚向顶=原版本相。不修（已修;本刀补消费面行为钉+链锁）。
//
// 变异证红（手工执行实录）：M1 助手翻号→A1+A2+A3 红（A2 红在「合计≡原版直差」
//   判别线;转录级奇偶不变量断言为纯数学恒等式不可红——即「旧 +sign 的可观测行为
//   本已 1:1」的证明本体）;M2 main.ts 回退旧式→A3 红;M3 缩放三元互换→B2 红;
//   M4 VUI 去负号→C1 红;M5 UIList `-=`→`+=`→C1+C2 红。
// 1458 同域核对（2026-09-12 实证）：CaptureInterface.cs/PlayerInput.cs/UIList.cs/
//   UserInterface.cs 1457≡1458 逐字节全等（Player.cs 行号漂移 −11,语义零变更:
//   spectate 退出 1458:17198 同为 `ScrollWheelDelta != 0`,热栏 1458:24422/:32027
//   同为 `/-120`,SelectedMode-=num 1458:1532）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CaptureInterface, browserWheelDeltaYToVanilla } from '../src/render/CaptureMode';
import { UIList } from '../src/vui/elements/UIList';
import { UIScrollWheelEvent } from '../src/vui/core/UIMouseEvent';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const mainSrc = read('src/main.ts');
const captureSrc = read('src/render/CaptureMode.ts');
const inputSrc = read('src/core/Input.ts');
const gameSrc = read('src/core/Game.ts');
const vuiSrc = read('src/vui/VUI.ts');
const uiSrc = read('src/vui/core/UserInterface.ts');
const listSrc = read('src/vui/elements/UIList.ts');

/** CaptureInterface.cs:1523-1545 逐字转录（C# int 除法向零截断、% 随被除号、
 *  num<0 +=30 归一、SelectedMode -= num、±2 环绕——与
 *  CaptureMode.scrolling() 同一公式,此处独立转录作原版参照面） */
function vanillaScrolling(selectedMode: number, scrollWheelDelta: number): number {
  let num = Math.trunc(scrollWheelDelta / 120);
  num %= 30;
  if (num < 0) num += 30;
  let sm = selectedMode - num;
  while (sm < 0) sm += 2;
  while (sm > 2) sm -= 2;
  return sm;
}

// ═══ 点1：main.ts:626 拍照模式 pendingWheel 符号（修=对齐原版约定） ═══
describe('SW-FX50 A：拍照模式滚轮符号（PlayerInput.cs:901-902 上滚为正）', () => {
  it('A1 符号矩阵：浏览器上滚(deltaY<0)=原版 +120、下滚=−120（任意非零=1 notch）', () => {
    expect(browserWheelDeltaYToVanilla(-120)).toBe(120);   // 上滚 → 原版 ScrollWheelDelta +120
    expect(browserWheelDeltaYToVanilla(120)).toBe(-120);   // 下滚 → −120
    expect(browserWheelDeltaYToVanilla(-100)).toBe(120);   // Chrome notch=±100px 同号面
    expect(browserWheelDeltaYToVanilla(7)).toBe(-120);     // trackpad 子档:既有面=1 notch(量值归一=登记债)
    expect(browserWheelDeltaYToVanilla(0)).toBe(0);
  });

  it('A2 行为等价矩阵：仓路径(助手+scrolling) ≡ 原版转录(原版符号),且 ±Σ 两向同果（奇偶不变量）', () => {
    // 突发=浏览器 deltaY 序列（±120/notch 档面;混合向含 0 和）。
    // 原版帧内 ScrollWheelDelta = Σ(−dY)（每事件原版增量=浏览器取负）。
    const bursts: number[][] = [
      [120], [-120],                       // 单档下/上
      [120, 120], [-120, -120],           // 双档下/上
      [120, 120, 120, 120, 120],          // 下 5
      [-120, -120, -120, -120, -120],     // 上 5
      [120, -120],                        // 抵消（和=0,两向全等平凡支）
      [120, -120, 120],                   // 混向 Σ=+120
      Array.from({ length: 29 }, () => 120),   // 下 29（num=29）
      Array.from({ length: 31 }, () => -120),  // 上 31（vanilla num=31%30=1）
    ];
    for (const start of [0, 1, 2]) {
      for (const burst of bursts) {
        const sum = burst.reduce((s, d) => s + d, 0);
        // 奇偶不变量（定谳核心）：原版对 +Σ 与 −Σ 给出同一终模式
        // （%30 归一取 30−num ≡ num (mod 2),30/2 皆偶）⇒ 旧 +sign 的符号差不可观测
        expect(vanillaScrolling(start, -sum)).toBe(vanillaScrolling(start, sum));
        // 仓路径 ≡ 原版（原版符号参照面）
        const cm = new CaptureInterface();
        cm.selectedMode = start;
        const vanillaDelta = burst.reduce((s, d) => s + browserWheelDeltaYToVanilla(d), 0);
        expect(vanillaDelta === -sum).toBe(true);   // 助手逐事件取负 ⇒ 帧内合计 ≡ 原版直差（=== 兼容 ±0）
        cm.pendingWheel = vanillaDelta;
        cm.scrolling();
        expect(cm.selectedMode).toBe(vanillaScrolling(start, -sum));
        expect(cm.pendingWheel).toBe(0);          // 消费即清（既有面回归锁）
      }
    }
  });

  it('A3 源锁：main.ts 捕获点走助手,旧裸 +sign(deltaY) 退役', () => {
    expect(mainSrc).toContain('cm.pendingWheel += browserWheelDeltaYToVanilla(e.deltaY);');
    expect(mainSrc).not.toContain('cm.pendingWheel += Math.sign(e.deltaY) * 120;');
    expect(captureSrc).toContain('export function browserWheelDeltaYToVanilla(deltaY: number): number {');
    expect(captureSrc).toContain('return s === 0 ? 0 : -s * 120;');
  });
});

// ═══ 点2：Input.ts:246 观战退出/全屏地图缩放（定谳:不修——符号无关+消费端补偿臂） ═══
describe('SW-FX50 B：world wheelDelta（浏览器号）两消费面（Player.cs:17209/:25385-25392）', () => {
  it('B1 源锁：Input 浏览器号入账 + endFrame 统一清零（量纲不归一=只取号,sign 面）', () => {
    expect(inputSrc).toContain('this.wheelDelta += Math.sign(e.deltaY);');
    expect(inputSrc).toContain('this.wheelDelta = 0;');   // endFrame（fixedUpdate 尾）
  });

  it('B2 全屏地图缩放方向（Game.ts:8252 补偿臂）：下滚→缩小/上滚→放大 ≡ 原版 ×0.7/×1.3 同向', () => {
    // 消费端补偿臂值面锁定（互换 0.85/1.18 即红）
    const m = gameSrc.match(/inp\.wheelDelta > 0 \? ([\d.]+) : ([\d.]+)/);
    expect(m).not.toBeNull();
    const downMult = parseFloat(m![1]);   // 浏览器下滚(+1) → 缩放倍率
    const upMult = parseFloat(m![2]);     // 浏览器上滚(−1) → 缩放倍率
    // 原版 Player.cs:25385-25392：num8=ScrollWheelDelta/120;scale *= 1+num8*0.3
    // XNA 上滚为正 ⇒ 上滚 ×1.3（放大）、下滚 ×0.7（缩小）
    const VAN_UP = 1 + 0.3;
    const VAN_DOWN = 1 - 0.3;
    expect(upMult).toBeGreaterThan(1);    expect(VAN_UP).toBeGreaterThan(1);    // 上滚=放大,两版同向
    expect(downMult).toBeLessThan(1);     expect(VAN_DOWN).toBeLessThan(1);     // 下滚=缩小,两版同向
    // 门序锁：mapFullscreen 先、无图不开缩放（Player.cs:25385 if(mapFullscreen) 前置）
    expect(gameSrc).toContain('if (inp.wheelDelta !== 0) {');
    expect(gameSrc).toContain('if (this.renderer.fullMap.open) {');
  });

  it('B3 观战滚轮退出符号无关（Player.cs:17209 ScrollWheelDelta != 0 → SetOrRequestSpectating(-1)）', () => {
    // 原版只判非零——任意方向滚轮皆退出,无方向语义可言 = 反转类缺陷对此面免疫
    expect(gameSrc).toContain('if (inp.wheelDelta) {');
    expect(gameSrc).toContain('this.setSpectating(-1);');
    expect(gameSrc).toContain('inp.wheelDelta = 0;');   // 置 0 消费（防同帧缩放半边重复吃）
  });
});

// ═══ 点3：VUI.ts:72 RB14d 修复在位复核（单次取负 + 消费面链锁） ═══
describe('SW-FX50 C：VUI 滚轮链复核（RB14d 修复回归锁;UserInterface.cs:219-222 → UIList.cs:109-116）', () => {
  it('C1 源锁：捕获点单次取负;UserInterface 直通不反号;UIList viewPosition −= 照抄', () => {
    expect(vuiSrc).toContain('VUI.wheel += -Math.sign(e.deltaY);');
    // 直通面：wheelDelta 原样进 UIScrollWheelEvent（二次取负/翻转即红）
    expect(uiSrc).toContain('target?.scrollWheel(new UIScrollWheelEvent(target, this.mousePosition, wheelDelta));');
    // 消费面：UIList.cs:114 `_scrollbar.ViewPosition -= evt.ScrollWheelValue` 照抄
    expect(listSrc).toContain('this.scrollbar.viewPosition -= evt.scrollWheelValue;');
  });

  it('C2 行为端到端（原版号约定）：+1（上滚）→ viewPosition 向顶,−1（下滚）→ 向底', () => {
    const list = new UIList();
    const sb = { viewPosition: 100 };
    (list as unknown as { scrollbar: unknown }).scrollbar = sb;
    // 上滚：浏览器 deltaY −120 → VUI 取负 ⇒ scrollWheelValue=+1（原版 ScrollWheelDeltaForUI 语义）
    list.scrollWheel(new UIScrollWheelEvent(list, { x: 0, y: 0 }, 1));
    expect(sb.viewPosition).toBe(99);    // UIList.cs:114 向顶（原版上滚=列表上移）
    // 下滚：deltaY +120 → scrollWheelValue=−1
    list.scrollWheel(new UIScrollWheelEvent(list, { x: 0, y: 0 }, -1));
    expect(sb.viewPosition).toBe(100);   // 向底,回原位
    list.scrollWheel(new UIScrollWheelEvent(list, { x: 0, y: 0 }, -1));
    expect(sb.viewPosition).toBe(101);
  });
});
