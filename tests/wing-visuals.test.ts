// 翅膀视觉层回归（DrawPlayer_09_Wings :655-1040 + WingFrame :29002-30045 +
// 滑翔帧段 :26874-27010）。
// 背景：曾因渲染锚点双重平移（世界坐标叠进脚底局部空间）+ 内层再镜像 + 帧数写死
// 7/6（原版 generic=4）三连 bug，翅膀画到屏幕外/永不翻转/错切片——"背后没翅膀"。
import { describe, it, expect } from 'vitest';
import {
  wingDrawOf, stepWingFrame, wingDrawFrame, wingAnchorForRow, HEADGEAR_ZERO_ROWS,
  stealthFactors,
  FLAP_HOVER_SET, VISUAL_HOVER_SET,
  type WingFrameState, type WingFrameInput,
} from '../src/data/vanillaWingVisuals';
import { VanillaDust } from '../src/fx/VanillaDust';
import { dyeApplyOf, dyeEntryOf, dyeCount } from '../src/data/vanillaDyes';

function st(frame = 0, counter = 0): WingFrameState { return { frame, counter }; }

/** 常用输入底板（按需覆盖） */
function inp(over: Partial<WingFrameInput> = {}): WingFrameInput {
  return {
    flap: false, jump: false, vy: 0, controlJump: false, controlLR: false,
    hoverDown: false, hoverUp: false, wingTime: 100, glide: false,
    downDash: false, waterFloat: false, shouldDraw: true,
    ...over,
  };
}

describe('wingDrawOf 绘制表（DrawPlayer_09_Wings）', () => {
  it('generic 款 = 4 帧 + 默认锚 (−9,−19)，无 alwaysAir 门', () => {
    // 天使之翼 492→1 / 恶魔 493→2 / 叶翅 665→3
    for (const s of [1, 2, 3, 7, 9, 20, 46]) {
      expect(wingDrawOf(s).frames).toBe(4);
      expect(wingDrawOf(s).anchor).toEqual([-9, -19]);
      expect(wingDrawOf(s).alwaysAir).toBeFalsy();
    }
  });
  it('逐款偏移微调：5=(−5,−23) 12=(−10,−20) 27=(−6,−19) 41=(−10,−19) 43=(−14,−26,7帧)', () => {
    expect(wingDrawOf(5).anchor).toEqual([-5, -23]);
    expect(wingDrawOf(12).anchor).toEqual([-10, -20]);
    expect(wingDrawOf(27).anchor).toEqual([-6, -19]);
    expect(wingDrawOf(41).anchor).toEqual([-10, -19]);
    expect(wingDrawOf(43)).toMatchObject({ frames: 7, anchor: [-14, -26] });
    expect(wingDrawOf(44)).toMatchObject({ frames: 7, anchor: [-9, -19] });
  });
  it('特殊分支：22=(−9,+5,7帧,门) 28=(0,−2,miscCounter,门) 34=(−4,−21,6帧,门) 45=(0,+1,6帧,门) 48=(0,−21,8帧,门) 51=(0,−15,8帧) 47/49=(−3,−20,11帧) 50=(−4,−19,11帧) 39=(−6,−28,6帧,门) 40=(−4,−21,14帧)', () => {
    expect(wingDrawOf(22)).toMatchObject({ frames: 7, anchor: [-9, 5], alwaysAir: true });
    expect(wingDrawOf(28)).toMatchObject({ frames: 4, anchor: [0, -2], alwaysAir: true, drawFrameFrom: 'miscCounter' });
    expect(wingDrawOf(34)).toMatchObject({ frames: 6, anchor: [-4, -21], alwaysAir: true });
    expect(wingDrawOf(39)).toMatchObject({ frames: 6, anchor: [-6, -28], alwaysAir: true });
    expect(wingDrawOf(45)).toMatchObject({ frames: 6, anchor: [0, 1], alwaysAir: true });
    expect(wingDrawOf(48)).toMatchObject({ frames: 8, anchor: [0, -21], alwaysAir: true });
    expect(wingDrawOf(51)).toMatchObject({ frames: 8, anchor: [0, -15] });
    expect(wingDrawOf(47)).toMatchObject({ frames: 11, anchor: [-3, -20] });
    expect(wingDrawOf(49)).toMatchObject({ frames: 11, anchor: [-3, -20] });
    expect(wingDrawOf(50)).toMatchObject({ frames: 11, anchor: [-4, -19] });
    expect(wingDrawOf(40)).toMatchObject({ frames: 14, anchor: [-4, -21] });
  });
  it('flap hover 档集合（:26477）≠ 视觉 canHover 集（:28994）——两者勿混', () => {
    expect([...FLAP_HOVER_SET].sort((a, b) => a - b)).toEqual([22, 28, 29, 30, 32, 33, 35, 37, 45]);
    expect([...VISUAL_HOVER_SET].sort((a, b) => a - b)).toEqual([22, 28, 30, 31, 33, 35, 44, 45]);
    // 29/32 仅 flap 档；31/44 仅视觉集
    expect(FLAP_HOVER_SET.has(29) && FLAP_HOVER_SET.has(32)).toBe(true);
    expect(VISUAL_HOVER_SET.has(29) || VISUAL_HOVER_SET.has(32)).toBe(false);
    expect(VISUAL_HOVER_SET.has(31) && VISUAL_HOVER_SET.has(44)).toBe(true);
    expect(FLAP_HOVER_SET.has(31) || FLAP_HOVER_SET.has(44)).toBe(false);
  });
  it('叠画表（第二 pass 全亮族）：27/30 Glow 127、23 Flame_8 200、43 Glow_272×2、47 Glow_366 180、38 Arkhalis、22 火焰簇、28 Extra_38、50 免疫双画、40 Betsy、45 拖尾', () => {
    expect(wingDrawOf(27).overlay).toMatchObject({ kind: 'plain', file: 'Glow_92.png', alpha: 127 });
    expect(wingDrawOf(30).overlay).toMatchObject({ kind: 'plain', file: 'Glow_181.png', alpha: 127 });   // :1038
    expect(wingDrawOf(23).overlay).toMatchObject({ kind: 'plain', file: 'Flame_8.png', tint: 200, alpha: 200 });
    expect(wingDrawOf(43).overlay).toMatchObject({ kind: 'jitter2', file: 'Glow_272.png', tint: 230, alpha: 60 });
    expect(wingDrawOf(47).overlay).toMatchObject({ kind: 'plain', file: 'Glow_366.png', alpha: 180 });
    expect(wingDrawOf(38).overlay).toMatchObject({ kind: 'arkhalis', file: 'Glow_251.png' });            // :1044
    expect(wingDrawOf(22).overlay).toMatchObject({ kind: 'flames7' });
    expect(wingDrawOf(28).overlay).toMatchObject({ kind: 'extra38' });
    expect(wingDrawOf(50).overlay).toMatchObject({ kind: 'immune' });
    expect(wingDrawOf(40).overlay).toMatchObject({ kind: 'betsy' });
    expect(wingDrawOf(45).overlay).toMatchObject({ kind: 'trail45' });
    // 无叠画款
    for (const s of [1, 2, 3, 5, 9, 12, 34, 39, 48, 49, 51]) {
      expect(wingDrawOf(s).overlay, `slot ${s}`).toBeUndefined();
    }
  });
  it('全亮主纹理族 mainGlow：28/44/45=white、34=c250a100、9/29=c250a100sq、51=luna；其余 lit（合成前）', () => {
    expect(wingDrawOf(28).mainGlow).toBe('white');   // :714 Lerp t=1
    expect(wingDrawOf(44).mainGlow).toBe('white');   // :1032 RT 层
    expect(wingDrawOf(45).mainGlow).toBe('white');   // :729
    expect(wingDrawOf(34).mainGlow).toBe('c250a100'); // :766
    expect(wingDrawOf(51).mainGlow).toBe('luna');     // :781 GetLunaGlowColor
    // 9/29（:964-969）：Color(250³,100)×s²（stealth 先平方再取色）——2026-08-19 booster 批
    expect(wingDrawOf(9).mainGlow).toBe('c250a100sq');
    expect(wingDrawOf(29).mainGlow).toBe('c250a100sq');
    expect(wingDrawOf(44).rainbowLayer).toBe(true);
    for (const s of [1, 2, 3, 22, 23, 27, 30, 31, 32, 38, 39, 40, 43, 47, 48, 49, 50]) {
      if (s === 40) continue;   // 40 走 betsy 叠画
      expect(wingDrawOf(s).mainGlow, `slot ${s}`).toBeUndefined();
    }
  });
  it('47/49 headgearRow 锚点：行 ∈{7,8,9,14,15,16} → Y=−22，其余 → −20', () => {
    const d47 = wingDrawOf(47);
    expect(d47.headgearRow).toBe(true);
    expect(wingAnchorForRow(d47, 0)).toEqual([-3, -20]);
    expect(wingAnchorForRow(d47, 7)).toEqual([-3, -22]);   // OffsetsPlayerHeadgear 行 7 = 0
    expect(wingAnchorForRow(d47, 14)).toEqual([-3, -22]);
    expect(wingAnchorForRow(d47, 19)).toEqual([-3, -20]);
    // 非 47/49 款行修正直通
    expect(wingAnchorForRow(wingDrawOf(1), 7)).toEqual([-9, -19]);
    expect([...HEADGEAR_ZERO_ROWS]).toEqual([7, 8, 9, 14, 15, 16]);
  });
});

describe('WingFrame 帧状态机（generic 尾段 :29975-30045）', () => {
  it('flap：5t/帧推进 0→1→2→3→0（counter>rate 才进帧）', () => {
    const s = st();
    const seq: number[] = [];
    for (let t = 0; t < 24; t++) {
      stepWingFrame(1, s, inp({ flap: true, vy: -3 }));
      seq.push(s.frame);
    }
    // 第 5 tick 末进帧：帧 0 持续 tick1-4、帧 1 持续 tick5-9……
    expect(seq.slice(0, 4).every((f) => f === 0)).toBe(true);
    expect(seq.slice(4, 9).every((f) => f === 1)).toBe(true);
    expect(seq.slice(9, 14).every((f) => f === 2)).toBe(true);
    expect(seq.slice(14, 19).every((f) => f === 3)).toBe(true);
    expect(seq[19]).toBe(0);   // 回绕
  });
  it('下落（!flap && vy≠0）→ 帧 1；地面 → 0 且计数清零', () => {
    const s = st(3, 9);
    stepWingFrame(1, s, inp({ vy: 5 }));
    expect(s.frame).toBe(1);
    stepWingFrame(1, s, inp({ vy: 0 }));
    expect(s.frame).toBe(0);
    expect(s.counter).toBe(0);
  });
  it('32：rate=3 + 下落帧 3；43：rate=3/max=7/reset=1 + 下落 2（水上→0）；48：rate=2/max=8', () => {
    // 32 下落帧 3
    const s32 = st();
    stepWingFrame(32, s32, inp({ vy: 5 }));
    expect(s32.frame).toBe(3);
    // 43 flap 进帧 3t/帧，回绕到 1
    const s43 = st();
    for (let t = 0; t < 3 * 8; t++) stepWingFrame(43, s43, inp({ flap: true, vy: -3 }));
    expect(s43.frame).toBeGreaterThanOrEqual(1);
    expect(s43.frame).toBeLessThanOrEqual(6);
    // 43 下落 → 2，水上漂浮 → 0
    const s43f = st();
    stepWingFrame(43, s43f, inp({ vy: 5 }));
    expect(s43f.frame).toBe(2);
    stepWingFrame(43, s43f, inp({ vy: 5, waterFloat: true }));
    expect(s43f.frame).toBe(0);
    // 48 rate=2：2t 进一帧
    const s48 = st();
    stepWingFrame(48, s48, inp({ flap: true, vy: -3 }));
    expect(s48.frame).toBe(0);
    stepWingFrame(48, s48, inp({ flap: true, vy: -3 }));
    stepWingFrame(48, s48, inp({ flap: true, vy: -3 }));
    expect(s48.frame).toBe(1);
  });
});

describe('WingFrame 逐款分支', () => {
  it('4（妖精翼）：flap 循环 0→1→2（5t/帧）；非 flap → 帧 3', () => {
    const s = st();
    for (let t = 0; t < 5; t++) stepWingFrame(4, s, inp({ flap: true, vy: -3 }));
    expect(s.frame).toBe(1);            // 第 5 tick 末进帧
    for (let t = 0; t < 5; t++) stepWingFrame(4, s, inp({ flap: true, vy: -3 }));
    expect(s.frame).toBe(2);            // 0→1→2 循环（无帧 3）
    for (let t = 0; t < 5; t++) stepWingFrame(4, s, inp({ flap: true, vy: -3 }));
    expect(s.frame).toBe(0);            // ≥3 回绕 0
    stepWingFrame(4, s, inp({ vy: 0, controlJump: false }));
    expect(s.frame).toBe(3);            // 张翼
  });
  it('22（日光炎翼）：!controlJump→0；hoverDown+移动 [1,2,3,2]@2t；常态 [4,5,6,5]@2t', () => {
    const s = st();
    stepWingFrame(22, s, inp({ controlJump: true, wingTime: 100, hoverDown: true, controlLR: true }));
    expect(s.frame).toBe(1);
    stepWingFrame(22, s, inp({ controlJump: true, wingTime: 100, hoverDown: true, controlLR: true }));
    expect(s.frame).toBe(2);
    // 常态（非 hoverDown）：counter1→4 / 2,3→5 / 4,5→6 / 6→5（@2t）
    const s2 = st();
    stepWingFrame(22, s2, inp({ controlJump: true, wingTime: 100 }));
    expect(s2.frame).toBe(4);
    for (let t = 0; t < 3; t++) stepWingFrame(22, s2, inp({ controlJump: true, wingTime: 100 }));
    expect(s2.frame).toBe(6);           // counter=4 → <6
  });
  it('12：flap [1,2,3,2]@5t；下落 → 2；地面 → 0', () => {
    const s = st();
    stepWingFrame(12, s, inp({ flap: true, vy: -3 }));
    expect(s.frame).toBe(1);
    for (let t = 0; t < 3; t++) stepWingFrame(12, s, inp({ flap: true, vy: -3 }));
    expect(s.frame).toBe(1);            // counter<5 段（tick1-4 = 帧 1）
    stepWingFrame(12, s, inp({ flap: true, vy: -3 }));
    expect(s.frame).toBe(2);            // counter=5 → 进 2
    for (let t = 0; t < 6; t++) stepWingFrame(12, s, inp({ flap: true, vy: -3 }));
    expect(s.frame).toBe(3);            // counter ∈ [10,15) → 3
    stepWingFrame(12, s, inp({ vy: 5 }));
    expect(s.frame).toBe(2);
    stepWingFrame(12, s, inp({ vy: 0 }));
    expect(s.frame).toBe(0);
  });
  it('30：flap 1+counter/2 回绕 6（帧 1-3）；地面 → 0', () => {
    const s = st();
    for (let t = 0; t < 2; t++) stepWingFrame(30, s, inp({ flap: true, vy: -3 }));
    expect(s.frame).toBe(2);            // counter=2 → 1+2/2
    for (let t = 0; t < 20; t++) stepWingFrame(30, s, inp({ flap: true, vy: -3 }));
    expect(s.frame).toBeGreaterThanOrEqual(1);
    expect(s.frame).toBeLessThanOrEqual(3);
    stepWingFrame(30, s, inp({ vy: 0 }));
    expect(s.frame).toBe(0);
  });
  it('34/39（门内）：flap rate4／按跳 rate9／else rate6，帧 0-5 循环；门外落 generic', () => {
    const s = st();
    for (let t = 0; t < 4; t++) stepWingFrame(34, s, inp({ flap: true, vy: -3, shouldDraw: true }));
    expect(s.frame).toBe(1);            // counter=4 → 4/4
    const s39 = st();
    for (let t = 0; t < 9; t++) stepWingFrame(39, s39, inp({ vy: 5, controlJump: true, shouldDraw: true }));
    expect(s39.frame).toBe(1);          // 9/9
    // 门外（地面）→ generic：帧 0
    const g = st(2, 0);
    stepWingFrame(34, g, inp({ vy: 0, shouldDraw: false }));
    expect(g.frame).toBe(0);
  });
  it('45（门内）：vy≠0 时 counter/3（无时 5）回绕 18；vy==0 → 0', () => {
    const s = st();
    for (let t = 0; t < 3; t++) stepWingFrame(45, s, inp({ vy: -3, wingTime: 100, shouldDraw: true }));
    expect(s.frame).toBe(1);
    stepWingFrame(45, s, inp({ vy: 0, shouldDraw: true }));
    expect(s.frame).toBe(0);
  });
  it('44（门内）：flap/地面 1+counter/5 回绕 30；下落按跳 2／else 3', () => {
    const s = st();
    for (let t = 0; t < 5; t++) stepWingFrame(44, s, inp({ flap: true, vy: -3, shouldDraw: true }));
    expect(s.frame).toBe(2);            // 1+5/5
    stepWingFrame(44, s, inp({ vy: 5, controlJump: true, shouldDraw: true }));
    expect(s.frame).toBe(2);
    stepWingFrame(44, s, inp({ vy: 5, controlJump: false, shouldDraw: true }));
    expect(s.frame).toBe(3);
  });
  it('51：帧 2-7 循环（rate 4/6/8）；地面 → 0', () => {
    const s = st();
    for (let t = 0; t < 100; t++) stepWingFrame(51, s, inp({ flap: true, vy: -3 }));
    expect(s.frame).toBeGreaterThanOrEqual(2);
    expect(s.frame).toBeLessThanOrEqual(7);
    stepWingFrame(51, s, inp({ vy: 0 }));
    expect(s.frame).toBe(0);
  });
  it('47/49/50（11 帧）：flap 循环 2..10；50 转移 1→3；地面 → 0', () => {
    const s47 = st();
    stepWingFrame(47, s47, inp({ flap: true, vy: -3 }));
    expect(s47.frame).toBe(2);          // 0 → 2
    // 推进到帧 10 后回绕 2
    for (let t = 0; t < 200; t++) stepWingFrame(47, s47, inp({ flap: true, vy: -3 }));
    expect(s47.frame).toBeGreaterThanOrEqual(2);
    expect(s47.frame).toBeLessThanOrEqual(10);
    stepWingFrame(47, s47, inp({ vy: 0 }));
    expect(s47.frame).toBe(0);
    // 50：帧 1 时推进转移 → 3
    const s50 = st(1, 100);
    stepWingFrame(50, s50, inp({ flap: true, vy: -3 }));
    expect(s50.frame).toBe(3);
  });
  it('33/38：WingFrame 不动帧（只喷尘）；帧仅由滑翔覆盖驱动 → 2，落地保持（原版语义）', () => {
    const s = st();
    stepWingFrame(33, s, inp({ flap: true, vy: -3 }));
    expect(s.frame).toBe(0);            // flap 也不动
    stepWingFrame(33, s, inp({ vy: 5, controlJump: true, glide: true }));
    expect(s.frame).toBe(2);            // 滑翔覆盖
    stepWingFrame(33, s, inp({ vy: 0, glide: false }));
    expect(s.frame).toBe(2);            // 落地不归零（原版 33/38 分支 return 早退）
  });
});

describe('滑翔帧覆盖（:26874-27010）', () => {
  it('默认款 → 2；48→3、40→0、44→2、43→1、12→3；22/28/45/51/47/49/50/24 除外不覆盖', () => {
    const mk = (slot: number) => { const s = st(0, 0); stepWingFrame(slot, s, inp({ vy: 5, controlJump: true, glide: true })); return s.frame; };
    expect(mk(1)).toBe(2);
    expect(mk(48)).toBe(3);
    expect(mk(40)).toBe(0);
    expect(mk(44)).toBe(2);
    expect(mk(43)).toBe(1);
    expect(mk(12)).toBe(3);
    // 排除款 24：glide 不覆盖，但自身 WingFrame 下落按跳分支动画 → 1
    expect(mk(24)).toBe(1);
  });
  it('glide 恒循环款：30 → 1-3 / 34 → 0-5 / 39 → 0-5', () => {
    const s30 = st();
    for (let t = 0; t < 30; t++) stepWingFrame(30, s30, inp({ vy: 5, controlJump: true, glide: true }));
    expect(s30.frame).toBeGreaterThanOrEqual(1);
    expect(s30.frame).toBeLessThanOrEqual(3);
    const s34 = st();
    for (let t = 0; t < 100; t++) stepWingFrame(34, s34, inp({ vy: 5, controlJump: true, glide: true, shouldDraw: true }));
    expect(s34.frame).toBeGreaterThanOrEqual(0);
    expect(s34.frame).toBeLessThanOrEqual(5);
  });
});

describe('wingDrawFrame 绘制帧派生', () => {
  it('28 走 miscCounter/5%4 独立动画（不吃 wingFrame）', () => {
    expect(wingDrawFrame(28, st(3, 0), 0)).toBe(0);
    expect(wingDrawFrame(28, st(3, 0), 5)).toBe(1);
    expect(wingDrawFrame(28, st(3, 0), 15)).toBe(3);
    expect(wingDrawFrame(28, st(3, 0), 20)).toBe(0);   // 回绕
  });
  it('wingFrame 越界钳回合法区间（generic 4 帧）', () => {
    expect(wingDrawFrame(1, st(9, 0), 0)).toBe(0);     // clampFrame 越界归 0
    expect(wingDrawFrame(1, st(2, 0), 0)).toBe(2);
  });
});

// ===================== VanillaDust 引擎（Dust.cs/Main.DrawDust） =====================
describe('VanillaDust：NewDust 初始化（:75-285）', () => {
  it('帧映射公式（:176-191）：type<100 → X=10·type；≥100 每 100 减 1000 加 Y+30', () => {
    const vd = new VanillaDust();
    const d6 = vd.spawn(0, 0, 10, 10, 6);
    expect(d6).not.toBeNull();
    expect(d6!.fx).toBe(60);
    expect([0, 10, 20]).toContain(d6!.fy);
    const d261 = vd.spawn(0, 0, 10, 10, 261);
    expect(d261!.fx).toBe(610);   // 2610 − 2000
    expect([60, 70, 80]).toContain(d261!.fy);   // 60 + 10·rand(3)
    const d217 = vd.spawn(0, 0, 10, 10, 217);
    expect(d217!.fx).toBe(170);
    expect([60, 70, 80]).toContain(d217!.fy);
  });
  it('位置/速度/缩放抖动与 type-6 烟雾初速特例（:165-172/:221-226）', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(100, 100, 30, 30, 76, 1, 2, 50, null, 1);
    expect(d!.x).toBeGreaterThanOrEqual(104);        // Position + rand(w−4) + 4
    expect(d!.x).toBeLessThan(130);
    expect(d!.y).toBeGreaterThanOrEqual(104);
    expect(d!.vx).toBeGreaterThanOrEqual(1 - 2);     // rand(-20,21)×0.1 + SpeedX
    expect(d!.vx).toBeLessThanOrEqual(1 + 2.1);
    expect(d!.alpha).toBe(50);
    expect(d!.scale).toBeGreaterThan(0.8);           // (1 + rand(-0.2,0.2)) × 1
    expect(d!.scale).toBeLessThan(1.21);
    // type 6 特例：vy ∈ [-1, 0.5)、vx×0.3、scale×0.7
    const s6 = vd.spawn(0, 0, 30, 30, 6, 0, 5);
    expect(s6!.vy).toBeGreaterThanOrEqual(-1);
    expect(s6!.vy).toBeLessThan(0.5 + 5);            // +SpeedY
    expect(s6!.scale).toBeLessThanOrEqual(0.7 * 1.21);
  });
});

describe('VanillaDust：UpdateDust 生命周期（:423-2450）', () => {
  it('fadeIn 生长目标语义（:2148-2171）：0<f<100 → +0.03/t 至超 fadeIn 转 0，随后 −0.01/t', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 5, 5, 217, 0, 1.5)!;   // 无特例型
    d.fadeIn = 2; d.noGravity = true; d.scale = 1.5;
    vd.update(0, 0, 1920, 1080);
    expect(d.scale).toBeCloseTo(1.53, 5);           // 生长中
    expect(d.fadeIn).toBe(2);
    for (let i = 0; i < 20; i++) vd.update(0, 0, 1920, 1080);
    expect(d.fadeIn).toBe(0);                        // scale > 2 后转衰
    const s0 = d.scale;
    vd.update(0, 0, 1920, 1080);
    // 衰减档 = 老化 −0.01（:2194）+ 链 B 兜底 −0.04（:2384——217 无链 A 专档且
    // noGravity，恒命中；扩展批接入后本型行为对齐原版，旧断言只算了老化项）
    expect(d.scale).toBeCloseTo(s0 - 0.01 - 0.04, 5);
  });
  it('261 型专属段（:705-727）：noGravity 阻尼 0.93+0.97/0.99 + 缩小 0.0025 + 持续玩家跟随 + 光收集', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(500, 500, 10, 10, 261)!;
    d.noGravity = true; d.scale = 2; d.fadeIn = 0;
    d.followPlayer = true;
    vd.update(0, 0, 1920, 1080, 3, -2);
    expect(d.x).toBeGreaterThan(500);                // 跟随 3px 且未清（261 持续）
    expect(d.followPlayer).toBe(true);
    expect(d.scale).toBeCloseTo(2 - 0.01, 5);        // 专属段 ±0.0025 相抵 + 通用衰落 −0.01
    expect(vd.lights.length).toBe(1);
    expect(vd.lights[0].g).toBeGreaterThan(vd.lights[0].r);   // (0.4,0.6,0.7) 比例
  });
  it('264 型（:625-641）：一次性玩家跟随 + 光按尘色比例', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(500, 500, 10, 10, 264, 0, 0, 0, { r: 50, g: 120, b: 255, a: 200 })!;
    d.noGravity = true; d.followPlayer = true; d.followOnce = true;
    vd.update(0, 0, 1920, 1080, 4, 0);
    expect(d.followPlayer).toBe(false);              // 一次性后清
    expect(vd.lights[0].b).toBeGreaterThan(vd.lights[0].g);
  });
  it('重力族 vy+0.1（:1889-1897）；缩没 0.1 失活（:2432-2436）；屏底清除（:2387）', () => {
    const vd = new VanillaDust();
    // 217（无链 A 专档）才落 :1884 重力链接——55 已入 :1759 链接（扩展批接入后
    // 无重力，源码同款；旧测试误把 55 当落体尘）
    const d = vd.spawn(100, 100, 5, 5, 217)!;
    d.vy = 0; d.scale = 0.5;
    vd.update(0, 0, 1920, 1080);
    expect(d.vy).toBeGreaterThan(0.09);              // 重力
    d.scale = 0.05;
    vd.update(0, 0, 1920, 1080);
    expect(d.active).toBe(false);                    // 缩没（217 衰减档 −0.01，链 B 不命中 noGravity=false）
    const d2 = vd.spawn(100, 2000, 5, 5, 55)!;
    vd.update(0, 0, 1920, 1080);                     // 屏底 y>1080
    expect(d2.active).toBe(false);
  });
  it('GetAlpha 消费表（:2469-2772）：261=(230,115)/6=(255,25)/182 透明/默认=(255−alpha)/255', () => {
    const vd = new VanillaDust();
    const a261 = vd.spawn(0, 0, 5, 5, 261)!; a261.alpha = 100;
    expect(VanillaDust.alphaOf(a261)).toEqual({ rgb: 230 / 255, a: 115 / 255 });
    const a6 = vd.spawn(0, 0, 5, 5, 6)!; a6.alpha = 100;
    expect(VanillaDust.alphaOf(a6)).toEqual({ rgb: 1, a: 25 / 255 });
    const a182 = vd.spawn(0, 0, 5, 5, 182)!;
    expect(VanillaDust.alphaOf(a182)).toEqual({ rgb: 1, a: 0 });
    const dft = vd.spawn(0, 0, 5, 5, 76, 0, 0, 50)!;
    expect(VanillaDust.alphaOf(dft)).toEqual({ rgb: 205 / 255, a: 205 / 255 });
    // 86 noLight=false → A=0；noLight=true → 默认档
    const a86 = vd.spawn(0, 0, 5, 5, 86, 0, 0, 100)!;
    expect(VanillaDust.alphaOf(a86).a).toBe(0);
    a86.noLight = true;
    expect(VanillaDust.alphaOf(a86).a).toBeCloseTo(155 / 255, 5);
  });
  it('GetColor 加性钳位（:2773-2817）：color − (255 − base)', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 5, 5, 264, 0, 0, 0, { r: 50, g: 200, b: 255, a: 255 })!;
    const cp = VanillaDust.colorPass(d, 0.5, 0.5)!;
    expect(cp.r).toBe(0);                            // 50 − 127.5 → 钳 0
    expect(cp.g).toBeCloseTo(72 / 255, 5);           // 200 − 127.5 → C# int 截断 72
    expect(cp.b).toBeCloseTo(127 / 255, 5);          // 255 − 127.5 → 127
    expect(cp.a).toBeCloseTo(127 / 255, 5);
    // 无自定义色 → null
    const d2 = vd.spawn(0, 0, 5, 5, 6)!;
    expect(VanillaDust.colorPass(d2, 1, 1)).toBeNull();
  });
  it('each(fullbright) 分族（:38406：6/15/59-64 强制 White）', () => {
    const vd = new VanillaDust();
    vd.spawn(0, 0, 5, 5, 6);
    vd.spawn(0, 0, 5, 5, 62);
    vd.spawn(0, 0, 5, 5, 261);
    vd.spawn(0, 0, 5, 5, 55);
    const fb = [...vd.each(true)].map((d) => d.type).sort((a, b) => a - b);
    const lit = [...vd.each(false)].map((d) => d.type).sort((a, b) => a - b);
    expect(fb).toEqual([6, 62]);
    expect(lit).toEqual([55, 261]);
  });
});

// ===================== 拴绳批逐型 Update 分支（Dust.cs 链 A/链 B） =====================
describe('VanillaDust：拴绳批逐型分支（43/15/267/278/6）', () => {
  /** 金系闪光 spawn 形态（LeashedCritter.ts goldCritterSparkle：43, alpha 254,
   *  黄色, scale 0.5, velocity 清零） */
  const gold = (vd: VanillaDust) => {
    const d = vd.spawn(0, 0, 5, 5, 43, 0, 0, 254, { r: 255, g: 255, b: 0, a: 255 }, 0.5)!;
    d.vx = 0; d.vy = 0; d.scale = 0.5;   // spawn ±20% 抖动归零，公式断言才确定
    return d;
  };

  it('43 型（:1472-1518）：旋转 +0.1·scale、照度门取光发光、alpha<255 生长档 +0.09', () => {
    const vd = new VanillaDust();
    const d = gold(vd);
    const bright = () => [255, 255, 255] as [number, number, number];
    vd.update(0, 0, 1920, 1080, 0, 0, bright);
    expect(d.rotation).toBeCloseTo(0.1 * 0.5, 5);          // :1474（演化前 scale）
    expect(d.scale).toBeCloseTo(0.5 + 0.09 - 0.01, 5);     // :1487 分支 + :2194 老化
    expect(d.alpha).toBe(254);                             // 未触顶
    // :1475-1484 光 = GetColor/270 × scale·1.07 × color/255（黄尘蓝通道恒 0）
    expect(vd.lights.length).toBe(1);
    expect(vd.lights[0].r).toBeCloseTo((255 / 270) * 0.5 * 1.07, 5);
    expect(vd.lights[0].g).toBeCloseTo((255 / 270) * 0.5 * 1.07, 5);
    expect(vd.lights[0].b).toBe(0);
  });
  it('43 型生长触顶（:1485-1493）：scale≥1 → 钳 1 + alpha=255，随后走收缩档', () => {
    const vd = new VanillaDust();
    const d = gold(vd);
    const bright = () => [255, 255, 255] as [number, number, number];
    for (let i = 0; i < 7; i++) vd.update(0, 0, 1920, 1080, 0, 0, bright);   // 0.5→…→0.98→触顶
    expect(d.alpha).toBe(255);
    expect(d.scale).toBeCloseTo(0.99, 5);                  // 钳 1 后老化 −0.01
    vd.update(0, 0, 1920, 1080, 0, 0, bright);
    expect(d.scale).toBeCloseTo(0.98, 5);                  // :2194 收缩（0.99 未过 0.8 档）
    expect(d.active).toBe(true);
  });
  it('43 型照度门（:1505-1508）：三通道全 <0.05 直接失活且不发光', () => {
    const vd = new VanillaDust();
    const d = gold(vd);
    vd.update(0, 0, 1920, 1080, 0, 0, () => [0, 0, 0]);
    expect(d.active).toBe(false);
    expect(vd.lights.length).toBe(0);
    // noLightEmittance（:1509）：门过了也不发光
    const vd2 = new VanillaDust();
    const d2 = gold(vd2);
    d2.noLightEmittance = true;
    vd2.update(0, 0, 1920, 1080, 0, 0, () => [255, 255, 255]);
    expect(d2.active).toBe(true);
    expect(vd2.lights.length).toBe(0);
  });
  it('43 型持续玩家跟随（:1513-1517）：customData=Player 逐 tick 加位移差', () => {
    const vd = new VanillaDust();
    const d = gold(vd);
    d.followPlayer = true;
    const x0 = d.x, y0 = d.y;
    vd.update(0, 0, 1920, 1080, 5, -3, () => [255, 255, 255]);
    expect(d.x).toBeCloseTo(x0 + 5, 5);
    expect(d.y).toBeCloseTo(y0 - 3, 5);
    expect(d.followPlayer).toBe(true);                     // 持续档（非一次性）
  });

  it('15 型（:1519-1551）：双轴 0.98 阻尼、scale 直取光 (0.45,0.55,1)、无重力', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 5, 5, 15, 0, 0, 150, null, 1.1)!;
    d.vx = 1; d.vy = 2; d.scale = 1.1;
    vd.update(0, 0, 1920, 1080);
    expect(d.vx).toBeCloseTo(0.98, 5);
    expect(d.vy).toBeCloseTo(1.96, 5);                     // 无通用重力 +0.1（链 A 独占）
    expect(d.scale).toBeCloseTo(1.1 - 0.01, 5);            // 仅老化收缩
    expect(d.rotation).toBeCloseTo(0.98 * 0.5, 5);         // :2146 通用旋转照常
    expect(vd.lights.length).toBe(1);
    expect(vd.lights[0].r).toBeCloseTo(0.45, 5);           // :1540（1.1 钳 1 后 k=1）
    expect(vd.lights[0].g).toBeCloseTo(0.55, 5);
    expect(vd.lights[0].b).toBeCloseTo(1, 5);
  });
  it('15 族变体（:1525-1549）：58 光 ×0.8 档、274 仅阻尼无光、noLight 加重阻尼', () => {
    const vd = new VanillaDust();
    const d58 = vd.spawn(0, 0, 5, 5, 58, 0, 0, 255, null, 1.2)!;
    d58.vx = 1; d58.vy = 0; d58.scale = 1.2;
    vd.update(0, 0, 1920, 1080);
    expect(vd.lights.length).toBe(1);
    expect(vd.lights[0].r).toBeCloseTo(1.2 * 0.8, 5);      // :1528 num85=scale×0.8 未触顶
    expect(vd.lights[0].g).toBeCloseTo(1.2 * 0.8 * 0.55, 5);
    const vd2 = new VanillaDust();
    const d274 = vd2.spawn(0, 0, 5, 5, 274)!;
    d274.vx = 1;
    vd2.update(0, 0, 1920, 1080);
    expect(d274.vx).toBeCloseTo(0.98, 5);                  // 阻尼照常
    expect(vd2.lights.length).toBe(0);                     // 274/292 无 AddLight 分支
    const vd3 = new VanillaDust();
    const d15 = vd3.spawn(0, 0, 5, 5, 15)!;
    d15.vx = 1; d15.noLight = true;
    vd3.update(0, 0, 1920, 1080);
    expect(d15.vx).toBeCloseTo(0.98 * 0.95, 5);            // :1530-1533 noLight ×0.95
  });

  it('267 型（:1660-1686）：方向旋转 ±1、双轴 0.98、scale+0.02、自色光 ×min(scale·0.8,1)', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 5, 5, 267, 0, 0, 0, { r: 255, g: 128, b: 0, a: 255 })!;
    d.vx = 1.5; d.vy = 0.5; d.scale = 0.35; d.noGravity = true; d.fadeIn = 0.9;
    vd.update(0, 0, 1920, 1080);
    expect(d.rotation).toBeCloseTo(1 + 1.5 * 0.98 * 0.5, 5);   // :1668 分支 + :2146 通用
    expect(d.vx).toBeCloseTo(1.5 * 0.98 * 0.92, 5);            // 链 A 0.98 + 链 B 兜底 0.92
    expect(d.scale).toBeCloseTo(0.35 + 0.02 + 0.03, 5);        // :1672 生长 + :2179 fadeIn 档
    const k = Math.min((0.35 + 0.02) * 0.8, 1);
    expect(vd.lights.length).toBe(1);
    expect(vd.lights[0].r).toBeCloseTo(k, 5);                  // color.R=255
    expect(vd.lights[0].g).toBeCloseTo(k * 128 / 255, 5);
    expect(d.fadeIn).toBe(0.9);                                // 未超生长目标
  });
  it('267 型生长转衰（:2181-2184 + :2379-2386）：超 fadeIn 后净 −0.03/t 收缩', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 5, 5, 267)!;
    d.vx = 0; d.scale = 0.35; d.noGravity = true; d.fadeIn = 0.9;
    let guard = 0;
    while (d.fadeIn !== 0 && guard++ < 200) vd.update(0, 0, 1920, 1080);
    expect(d.fadeIn).toBe(0);
    const s = d.scale;
    vd.update(0, 0, 1920, 1080);
    expect(d.scale).toBeCloseTo(s - 0.03, 5);              // +0.02 −0.01 −0.04 三段合计
  });
  it('267 型 noLight 自愈（:1678-1681）：清旗后照常发光', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 5, 5, 267, 0, 0, 0, { r: 255, g: 255, b: 255, a: 255 })!;
    d.noLight = true;
    vd.update(0, 0, 1920, 1080);
    expect(d.noLight).toBe(false);
    expect(vd.lights.length).toBe(1);
  });

  it('278 型妖精路径（:2240-2269）：链 A 0.99 + 链 B 0.93 阻尼、noLight 不发光', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 4, 4, 278, 0, 0, 200, { r: 50, g: 205, b: 50, a: 255 }, 0.65)!;
    d.vx = 1; d.vy = 0; d.scale = 0.65; d.noGravity = true; d.noLight = true;   // updateFairy 形态
    vd.update(0, 0, 1920, 1080);
    expect(d.vx).toBeCloseTo(1 * 0.99 * 0.93, 5);          // :2136 兜底 + :2253
    expect(d.scale).toBeCloseTo(0.65 - 0.01 + 0.0025, 5);  // :2256 fadeIn==0 补 + :2194
    expect(d.rotation).toBeCloseTo(1 * 0.99 * 0.5, 5);
    expect(vd.lights.length).toBe(0);                      // noLight 门（:2247）
  });
  it('278 型发光 + 入实心格收缩（:2247-2268）：scale×0.9、velocity×0.25', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 4, 4, 278, 0, 0, 0, { r: 255, g: 255, b: 255, a: 255 }, 1)!;
    d.vx = 1; d.vy = 0; d.scale = 1; d.fadeIn = 0;         // noGravity=false 走 0.95 档
    vd.update(0, 0, 1920, 1080, 0, 0, null, () => true);
    expect(vd.lights.length).toBe(1);
    expect(vd.lights[0].r).toBeCloseTo((1 - 0.01), 5);     // 老化后 scale 的 min(scale,1)
    expect(d.scale).toBeCloseTo((1 - 0.01 - 0.0025) * 0.9, 5);   // :2266
    expect(d.vx).toBeCloseTo(1 * 0.99 * 0.95 * 0.25, 5);   // :2267
    // 不实心 → 无收缩档
    const vd2 = new VanillaDust();
    const d2 = vd2.spawn(0, 0, 4, 4, 278, 0, 0, 0, { r: 255, g: 255, b: 255, a: 255 }, 1)!;
    d2.vx = 1; d2.scale = 1; d2.fadeIn = 0;
    vd2.update(0, 0, 1920, 1080, 0, 0, null, () => false);
    expect(d2.vx).toBeCloseTo(1 * 0.99 * 0.95, 5);
    expect(d2.scale).toBeCloseTo(1 - 0.01 - 0.0025, 5);
  });

  it('6 型（:890-1092）：轻重力 +0.05（非通用 0.1）+ 灰橙光 ×min(scale·1.4,0.6)', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 5, 5, 6, 0, 0, 254)!;
    d.vx = 0; d.vy = 0; d.scale = 1;
    vd.update(0, 0, 1920, 1080);
    expect(d.vy).toBeCloseTo(0.05, 5);                     // :892-895（跳过 :1884 的 0.1）
    expect(d.scale).toBeCloseTo(0.99, 5);
    expect(vd.lights.length).toBe(1);
    expect(vd.lights[0].r).toBeCloseTo(0.6, 5);            // :1083-1090 尾档（钳 0.6）
    expect(vd.lights[0].g).toBeCloseTo(0.6 * 0.65, 5);
    expect(vd.lights[0].b).toBeCloseTo(0.6 * 0.4, 5);
  });
  it('6 型 noGravity（翅膀批形态）：链 B 兜底 ×0.92 + fadeIn==0 时 scale−0.04', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 5, 5, 6)!;
    d.vx = 1; d.vy = 0; d.scale = 1; d.noGravity = true; d.fadeIn = 0;
    vd.update(0, 0, 1920, 1080);
    expect(d.vy).toBe(0);                                  // 无重力档
    expect(d.vx).toBeCloseTo(0.92, 5);                     // :2381
    expect(d.scale).toBeCloseTo(1 - 0.01 - 0.04, 5);       // :2194 + :2384
  });

  it('CloneDust（:260-288）：字段级复制回池（rotation/frame 原样，noLightEmittance 不复制）', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(100, 100, 10, 10, 267, 1, 2, 50, { r: 10, g: 20, b: 30, a: 40 }, 1.5)!;
    d.vx = 1; d.vy = 2; d.scale = 1.5;                     // spawn 抖动归零（公式断言）
    d.rotation = 0.7; d.fadeIn = 0.8; d.noGravity = true; d.noLight = true;
    d.noLightEmittance = true; d.followPlayer = true;
    const c = vd.clone(d)!;
    expect(c).not.toBe(d);
    expect(c.type).toBe(267);
    expect(c.x).toBe(d.x); expect(c.y).toBe(d.y);
    expect(c.vx).toBe(1); expect(c.vy).toBe(2);            // 覆盖 spawn 抖动
    expect(c.scale).toBe(1.5);                             // 覆盖 spawn 缩放抖动
    expect(c.rotation).toBe(0.7);                          // :278（旧适配器漏项）
    expect(c.fadeIn).toBe(0.8);
    expect(c.alpha).toBe(50);
    expect(c.noGravity).toBe(true); expect(c.noLight).toBe(true);
    expect(c.noLightEmittance).toBe(false);                // :273-286 字段表无此项
    expect(c.color).toBe(d.color);
    expect(c.fx).toBe(d.fx); expect(c.fy).toBe(d.fy);      // :284 frame 原样（非重掷）
    expect(c.followPlayer).toBe(true);
    // 源尘失活 → 自身返回（:267-270 dustIndex==maxDustToDraw 等价）
    d.active = false;
    expect(vd.clone(d)).toBe(d);
    // 池满 → null
    const full = new VanillaDust();
    for (let i = 0; i < 512; i++) full.spawn(0, 0, 5, 5, 267);
    const src = full.spawn(0, 0, 5, 5, 267);
    expect(src).toBeNull();
    const any = [...full.each(false)][0];
    expect(full.clone(any)).toBeNull();
  });

  it('拴绳批消费集回归：GetAlpha 逐型表（:2628/:2721/:2743）', () => {
    const vd = new VanillaDust();
    const d267 = vd.spawn(0, 0, 5, 5, 267)!;
    expect(VanillaDust.alphaOf(d267)).toEqual({ rgb: 1, a: 0 });
    const d278 = vd.spawn(0, 0, 5, 5, 278)!;
    expect(VanillaDust.alphaOf(d278)).toEqual({ rgb: 1, a: 25 / 255 });
    const d58 = vd.spawn(0, 0, 5, 5, 58)!;
    expect(VanillaDust.alphaOf(d58)).toEqual({ rgb: 1, a: 0 });
    const d15 = vd.spawn(0, 0, 5, 5, 15, 0, 0, 150)!;      // 亮色族默认档（画在合成后）
    expect(VanillaDust.alphaOf(d15)).toEqual({ rgb: 105 / 255, a: 105 / 255 });
  });
});

// ===================== stealth 视觉因子（PlayerDrawSet :1523-1660） =====================
describe('stealthFactors 三分支', () => {
  it('无潜行态全 1（settled/clamp/skinMul=1，无 vortexTint）', () => {
    const f = stealthFactors(0, false, false, false);
    expect(f).toEqual({ settled: 1, clamp: 1, vortexTint: null, skinMul: 1 });
  });
  it('3106/蘑菇矿：settled=(1+s·10)/11、skinMul=s²（s 下限 0.03）', () => {
    const f = stealthFactors(0.5, true, false, false);
    expect(f.settled).toBeCloseTo((1 + 0.5 * 10) / 11, 6);
    expect(f.clamp).toBe(0.5);
    expect(f.skinMul).toBe(0.25);
    expect(f.vortexTint).toBeNull();
    const lo = stealthFactors(0, false, true, false);
    expect(lo.clamp).toBe(0.03);            // :1527-1529 下限
    expect(lo.settled).toBeCloseTo((1 + 0.3) / 11, 6);
  });
  it('星璇：settled=s′、secondColor tint=Lerp(White→(0,0.12,0.16),1−s′)', () => {
    const f = stealthFactors(0.4, false, false, true);
    expect(f.settled).toBe(0.4);
    const k = 0.6;
    expect(f.vortexTint).toEqual([1 - k, 1 - 0.88 * k, 1 - 0.84 * k]);
    expect(f.skinMul).toBeCloseTo(0.16, 6);
  });
});

// ===================== cWings 染料（DyeInitializer.cs 116 条） =====================
describe('vanillaDyes 表（SM2 执行，无仿真近似）', () => {
  it('基础族展开（:26-29）：1007 红 → base/黑+12/亮+31(色×0.5+0.5)/银+44', () => {
    const base = dyeApplyOf(1007)!;
    expect(base.tech).toBe('ArmorColored');
    expect(base.uniforms.uColor).toEqual([1, 0, 0]);
    expect(base.uniforms.uSaturation).toBe(1.2);
    const black = dyeApplyOf(1019)!;    // 1007+12 → ArmorColoredAndBlack
    expect(black.tech).toBe('ArmorColoredAndBlack');
    expect(black.uniforms.uColor).toEqual([1, 0, 0]);
    const bright = dyeApplyOf(1038)!;   // 1007+31 → ArmorColored 色×0.5+0.5
    expect(bright.uniforms.uColor).toEqual([1, 0.5, 0.5]);
    const silver = dyeApplyOf(1051)!;   // 1007+44 → ArmorColoredAndSilverTrim
    expect(silver.tech).toBe('ArmorColoredAndSilverTrim');
    expect(silver.uniforms.uColor).toEqual([1, 0, 0]);
  });
  it('渐变族/特效族全部有可执行 pass（旧 effect 缺口清零）', () => {
    expect(dyeEntryOf(1031)!.tech).toBe('ArmorColoredGradient');   // 红黄渐变
    expect(dyeEntryOf(1031)!.secondary).toEqual([1, 1, 0]);
    expect(dyeApplyOf(1066)!.tech).toBe('ArmorColoredRainbow');    // 彩虹（曾是缺口）
    expect(dyeApplyOf(4778)!.tech).toBe('ArmorHallowBoss');        // HallowBoss
    expect(dyeApplyOf(3026)!.tech).toBe('ArmorReflectiveColor');   // 反射
    expect(dyeCount()).toBe(116);
  });
});

// ===================== wingDyeVid（Player.cs:9306-9312 cWings 链） =====================
describe('Player.wingDyeVid 染料槽派生', () => {
  it('armor 0..19 最后 wingSlot>0 槽 → dye[i%10]（vanity 胜出）', { timeout: 30000 }, async () => {
    const { Player } = await import('../src/entities/Player');
    const { Inventory } = await import('../src/items/Inventory');
    const p = new Player(0, 0, new Inventory());
    // vi_492 恶魔之翼（wing=1）进功能槽 3；vi_1007 红染料进 dye[3]
    const key = Object.keys((globalThis as { __swItems?: Record<string, number> }).__swItems ?? {});
    void key;
    const { ITEM_DEFS } = await import('../src/data/items');
    const { viIdFromKey } = await import('../src/data/vanillaItemCombat');
    const find = (vid: number) => {
      for (const [id, d] of Object.entries(ITEM_DEFS)) {
        if (d && viIdFromKey(d.key) === vid) return +id;
      }
      return -1;
    };
    const wingId = find(492), redDye = find(1007), blueDye = find(1015);
    expect(wingId).toBeGreaterThan(0);
    p.inv.armor[3] = { id: wingId, stack: 1 } as never;
    expect(p.wingDyeVid()).toBe(-1);                    // 无染料
    p.inv.dye[3] = { id: redDye, stack: 1 } as never;
    expect(p.wingDyeVid()).toBe(1007);
    // vanity 槽 13（10+3）放同款翅膀 + 蓝 → vanity 胜出
    p.inv.armor[13] = { id: wingId, stack: 1 } as never;
    p.inv.dye[3] = { id: blueDye, stack: 1 } as never;
    expect(p.wingDyeVid()).toBe(1015);
  });
});

// ===================== 逐型扩展批（230 钻头尘 / 翅膀族 31·55·76·217·229·240） =====================
// 标杆 = Terarria1456/Terraria/Dust.cs UpdateDust / GetAlpha 逐分支：
//   230 独立段 :644-663（非链 A：重力门照常 + :2136 兜底）+ GetAlpha :2616-2619
//   229 烟雾族链接 :890-1092（轻重力 :892 / customData 跟随 :896-917 / 光 :976-983）
//   31  组链接 :1336-1394（0.98 阻尼 + noGravity 加速涨 alpha :1367-1377）
//   55  组链接 :1759-1799（0.98 阻尼 + 白黄光 :1764-1771）+ GetAlpha (num+3)/4 :2725
//   76  专档 :1810-1828（雪尘：scale+0.009 / 玩家下坠 Lerp / 实心收缩）
//   217 无专档（全文无分支）→ 仅 :2136 兜底 + 链 B :2379
//   240 仅 customData=Projectile 跟随 :592-599（本仓消费方不设）→ 兜底 + 链 B
//   链 B 兜底 :2379-2386（type!=304 && noGravity → velocity×0.92 + fadeIn==0 时 scale−0.04）
describe('VanillaDust：逐型扩展批（230/229/31/55/76/217/240）', () => {
  /** 抖动归零：公式断言用（spawn 的 ±20% 抖动覆写掉） */
  const steady = (d: NonNullable<ReturnType<VanillaDust['spawn']>>, vx = 0, vy = 0, scale = 1) => {
    d.x = 500; d.y = 500; d.vx = vx; d.vy = vy; d.scale = scale; d.alpha = 0;
    return d;
  };

  it('230 型（:644-663）：光 (scale·0.6)²×(0.5,0.9,1) 无 noLight 门 + scale+0.02 + 玩家吸引', () => {
    const vd = new VanillaDust();
    const d = steady(vd.spawn(0, 0, 5, 5, 230)!, 3, -4, 2);
    d.noGravity = true; d.followPlayer = true;
    // 玩家在尘右侧 100px（含 X）——吸引方向 = 尘→玩家（velocity += 单位向量×负号）
    vd.update(0, 0, 1920, 1080, 0, 0, null, null, { cx: 600, cy: 500, vy: 0 });
    expect(vd.lights.length).toBe(1);
    expect(vd.lights[0].r).toBeCloseTo((2 * 0.6) * (2 * 0.6) * 0.5, 5);
    expect(vd.lights[0].g).toBeCloseTo((2 * 0.6) * (2 * 0.6) * 0.9, 5);
    expect(vd.lights[0].b).toBeCloseTo((2 * 0.6) * (2 * 0.6) * 1.0, 5);
    expect(d.scale).toBeCloseTo(2 + 0.02 - 0.01 - 0.04, 5);   // :653 +0.02 / 老化 −0.01 / 链 B −0.04
    // 吸引向量取自位移后位置（:480 先 position += velocity）——精确公式断言
    const rx = (500 + 3) - 600, ry = (500 - 4) - 500;
    const len = Math.hypot(rx, ry), pull = 100 / Math.max(50, len);
    expect(d.vx).toBeCloseTo((3 - (rx / len) * pull) * 0.99 * 0.92, 5);   // :662 后 :2136 ×0.99 再链 B
    expect(d.vy).toBeCloseTo((-4 - (ry / len) * pull) * 0.92, 5);         // :2136 只作用 vx
    // 无玩家探针：吸引关闭，速度只剩兜底 × 链 B
    const vd2 = new VanillaDust();
    const d2 = steady(vd2.spawn(0, 0, 5, 5, 230)!, 3, -4, 2);
    d2.noGravity = true; d2.followPlayer = true;
    vd2.update(0, 0, 1920, 1080);
    expect(d2.vx).toBeCloseTo(3 * 0.99 * 0.92, 5);
    expect(d2.vy).toBeCloseTo(-4 * 0.92, 5);
  });

  it('230 型 scale 钳 len/24−1（:661）：贴近玩家时尘面收缩', () => {
    const vd = new VanillaDust();
    const d = steady(vd.spawn(0, 0, 5, 5, 230)!, 0, 0, 2);
    d.noGravity = true; d.followPlayer = true;
    vd.update(0, 0, 1920, 1080, 0, 0, null, null, { cx: 524, cy: 500, vy: 0 });  // len=24
    expect(d.scale).toBeCloseTo(Math.min(2 + 0.02, 24 / 24 - 1) - 0.01 - 0.04, 5);  // 钳到 0 后老化
    expect(d.active).toBe(false);                    // scale<0.1 缩没清除（:2432）
  });

  it('230 型 noGravity=false 时重力门照常（独立段非链 A 链接）', () => {
    const vd = new VanillaDust();
    const d = steady(vd.spawn(0, 0, 5, 5, 230)!, 0, 0, 1);
    d.followPlayer = false;                          // noGravity 缺省 false
    vd.update(0, 0, 1920, 1080);
    expect(d.vy).toBeCloseTo(0.1, 5);                // :1892 +0.1（链 B 需 noGravity 不命中）
  });

  it('229 型（:890-1092 烟雾族）：轻重力 0.05 + 蓝 青光 (0.3,0.65,0.7) + 持续跟随', () => {
    const vd = new VanillaDust();
    const d = steady(vd.spawn(0, 0, 5, 5, 229)!, 0, 0, 0.5);
    d.followPlayer = true;
    const x0 = d.x, y0 = d.y;
    vd.update(0, 0, 1920, 1080, 6, -2);
    expect(d.vy).toBeCloseTo(0.05, 5);               // :894 轻重力（链 B 需 noGravity 不命中）
    expect(d.vx).toBeCloseTo(0, 5);
    expect(d.x).toBeCloseTo(x0 + 6, 5);              // :903-907 customData=Player 跟随
    expect(d.y).toBeCloseTo(y0 - 2, 5);
    expect(vd.lights.length).toBe(1);
    expect(vd.lights[0].r).toBeCloseTo(0.5 * 1.4 * 0.3, 5);   // :976-983（scale·1.4 钳 1）
    expect(vd.lights[0].g).toBeCloseTo(0.5 * 1.4 * 0.65, 5);
    expect(vd.lights[0].b).toBeCloseTo(0.5 * 1.4 * 0.7, 5);
    // GetAlpha :2659-2663：A=25 常量（Lerp(White,0.6) 以全亮基底近似）
    expect(VanillaDust.alphaOf(d).a).toBeCloseTo(25 / 255, 5);
  });

  it('31 型（:1336-1394）：双轴 0.98 阻尼 + noGravity ×1.02 加速 + alpha+4 触顶塌缩', () => {
    const vd = new VanillaDust();
    const d = steady(vd.spawn(0, 0, 5, 5, 31)!, 2, 2, 1);
    d.noGravity = true; d.alpha = 100;
    vd.update(0, 0, 1920, 1080);
    expect(d.vx).toBeCloseTo(2 * 0.98 * 1.02 * 0.92, 4);      // :1339/:1369 + 链 B
    expect(d.scale).toBeCloseTo(1 + 0.02 - 0.01 - 0.04, 5);   // :1370 + 老化 −0.01 + 链 B −0.04
    expect(d.alpha).toBe(104);                                // :1371
    d.alpha = 254;
    vd.update(0, 0, 1920, 1080);
    expect(d.alpha).toBe(255);                                // :1372-1376 触顶
    expect(d.scale).toBeLessThan(0.1);                        // :1374 塌缩 → 缩没
    expect(d.active).toBe(false);
  });

  it('55 型（:1759-1799）：双轴 0.98 阻尼 + 白黄光 (1,1,0.6)×min(scale·0.8,1)', () => {
    const vd = new VanillaDust();
    const d = steady(vd.spawn(0, 0, 5, 5, 55)!, 1, 1, 1.5);
    vd.update(0, 0, 1920, 1080);
    expect(d.vx).toBeCloseTo(0.98, 5);
    expect(d.vy).toBeCloseTo(0.98, 5);                 // 链 A 命中 → 无通用重力 +0.1
    expect(vd.lights.length).toBe(1);
    expect(vd.lights[0].r).toBeCloseTo(1, 5);          // :1764-1770 1.5×0.8=1.2 钳 1
    expect(vd.lights[0].b).toBeCloseTo(0.6, 5);
    // GetAlpha :2725：(num+3)/4 光乘区折减族（alpha=0 → num=1 → 1.0）
    expect(VanillaDust.alphaOf(d).rgb).toBeCloseTo(1, 5);
    d.alpha = 200;
    const num = 55 / 255;
    expect(VanillaDust.alphaOf(d).rgb).toBeCloseTo((num + 3) / 4, 5);
    expect(VanillaDust.alphaOf(d).a).toBeCloseTo(num, 5);
  });

  it('76 型（:1810-1828）：scale+0.009 + 玩家下坠 Lerp 0.04 + noLight 门', () => {
    const vd = new VanillaDust();
    const d = steady(vd.spawn(0, 0, 5, 5, 76)!, 0, 0, 1);
    d.noGravity = true; d.fadeIn = 1.1; d.noLight = true;   // 翅膀 10 出生形态（:30288-30292）
    vd.update(0, 0, 1920, 1080, 0, 0, null, null, { cx: 500, cy: 500, vy: 8 });
    expect(d.scale).toBeCloseTo(1 + 0.009 + 0.03, 5);  // :1813 + fadeIn 生长段 :2179
    expect(d.vy).toBeCloseTo(0, 5);                    // fadeIn≠0 → 下坠门不开（:1815）
    // fadeIn 归零后（生长完成）：vy 向玩家下坠速度 Lerp，noLight 不做 0.2 位移
    const y0 = d.y;
    d.fadeIn = 0;
    vd.update(0, 0, 1920, 1080, 0, 0, null, null, { cx: 500, cy: 500, vy: 8 });
    expect(d.vy).toBeCloseTo(8 * 0.04 * 0.92, 5);      // :1817 Lerp + 链 B ×0.92
    expect(d.y).toBeCloseTo(y0, 5);                    // noLight=true → 无 +vy·0.2
    d.noLight = false;
    const y1 = d.y;
    vd.update(0, 0, 1920, 1080, 0, 0, null, null, { cx: 500, cy: 500, vy: 8 });
    expect(d.y).toBeGreaterThan(y1 + 8 * 0.2 - 0.01);  // :1821 位移 + 链 B 收缩 −0.04
  });

  it('76 型入实心格收缩（:1823-1827）：scale×0.9 + 速度×0.25', () => {
    const vd = new VanillaDust();
    const d = steady(vd.spawn(0, 0, 5, 5, 76)!, 2, 3, 1);
    d.noGravity = true; d.fadeIn = 0;
    vd.update(0, 0, 1920, 1080, 0, 0, null, () => true);
    expect(d.vx).toBeCloseTo(2 * 0.25 * 0.92, 5);
    expect(d.vy).toBeCloseTo(3 * 0.25 * 0.92, 5);      // ×0.25 ×链 B（无玩家 → 无 Lerp）
    expect(d.scale).toBeCloseTo((1 + 0.009) * 0.9 - 0.01 - 0.04, 5);
  });

  it('217/240 型：无链 A 专档——仅 :2136 兜底 vx×0.99 + 链 B（noGravity ×0.92/−0.04）', () => {
    for (const type of [217, 240]) {
      const vd = new VanillaDust();
      const d = steady(vd.spawn(0, 0, 5, 5, type)!, 2, 2, 1.4);
      d.noGravity = true;
      vd.update(0, 0, 1920, 1080);
      expect(d.vx).toBeCloseTo(2 * 0.99 * 0.92, 5);
      expect(d.vy).toBeCloseTo(2 * 0.92, 5);
      expect(d.scale).toBeCloseTo(1.4 - 0.01 - 0.04, 5);   // 老化 −0.01 + 链 B −0.04
      // GetAlpha 默认档（无 217/240 专档）
      expect(VanillaDust.alphaOf(d).rgb).toBeCloseTo(1, 5);
    }
  });

  it('翅膀出生形态回归：31(noGravity+alpha100) / 55(alpha200 落体) / 217(noGravity+noLight)', () => {
    // wings 37 → dust 31（:30416-30421）/ wings 6 → dust 55（:30359-30362）/
    // wings 26 → dust 217（:30383-30388）——出生旗标组合与源码逐项对齐
    const vd = new VanillaDust();
    const d31 = vd.spawn(0, 0, 24, 40, 31, 0, 0, 100)!;
    expect(d31.alpha).toBe(100);
    const d55 = vd.spawn(0, 0, 30, 30, 55, 0, 0, 200)!;
    expect(d55.alpha).toBe(200);
    expect(d55.noGravity).toBe(false);            // 55 型出生不设 noGravity（落体尘）
    const d217 = vd.spawn(0, 0, 18, 40, 217, 0, 0, 100, null, 1.4)!;
    expect(d217.noGravity).toBe(false);           // noGravity 由消费方置位（spawn 后）
  });
});

// ===================== VanillaDust：NewDustPerfect 变体通道（B3 根修） =====================
// Dust.cs:52-63——NewDustPerfect(Position, Type, Velocity) 内部走完整 NewDust 链后仅
// 覆写 position/velocity 两字段：0 宽盒抖动窗与烟雾族特例（216-222 表内 242/75/169 的
// vy 重掷+vx×0.3）被消解，定向速度原样入池；scale×0.7 等其余字段保持 NewDust 结果。
describe('VanillaDust：NewDustPerfect 通道（Dust.cs:52-63,B3 剑族尘锥根修）', () => {
  it('perfect=true：position/velocity 完整覆写,烟雾族 242 不被 vy 重掷/vx×0.3 吞噬', () => {
    const vd = new VanillaDust();
    // 对照组：普通 NewDust 通道下 242 在烟雾名单(:216),定向速度必被改写
    const plain = vd.spawn(100, 200, 40, 40, 242, 3, -2)!;
    expect(plain.vx).not.toBe(3);                  // ×0.3 吞噬
    expect(Math.abs(plain.vy + 2)).toBeGreaterThan(0.001);   // vy 已重掷为 [-1,0.5)
    expect(plain.x).not.toBe(100);                 // 盒抖动窗
    const p = vd.spawn(100, 200, 40, 40, 242, 3, -2, 0, null, 1, { perfect: true })!;
    expect(p.vx).toBe(3);
    expect(p.vy).toBe(-2);
    expect(p.x).toBe(100);                          // dust.position = Position
    expect(p.y).toBe(200);
    expect(p.scale).toBeLessThanOrEqual(0.7 * 1.21 + 1e-9);   // 内部链未被跳过:×0.7 照走
    // 烟雾名单其余三剑尘型同样直通
    for (const t of [75, 169]) {
      const d = vd.spawn(-50, -30, 12, 12, t, -4.2, 0.8, 0, null, 1, { perfect: true })!;
      expect(d.vx).toBe(-4.2);
      expect(d.vy).toBe(0.8);
      expect(d.x).toBe(-50);
      expect(d.y).toBe(-30);
    }
    const d107 = vd.spawn(10, 20, 30, 30, 107, 2.5, 1.5, 0, null, 1, { perfect: true })!;
    expect(d107.vx).toBe(2.5);
    expect(d107.vy).toBe(1.5);
  });

  it('perfect=true 后照常老化积分（update 按 velocity 推进,noGravity 由调用侧置位）', () => {
    const vd = new VanillaDust();
    const p = vd.spawn(500, 600, 0, 0, 169, 3, -2, 0, null, 1, { perfect: true })!;
    p.noGravity = true;
    vd.update(0, 0, 4000, 4000);
    expect(p.active).toBe(true);
    expect(p.x).toBeCloseTo(503);
    expect(p.y).toBeCloseTo(598);
    expect(p.scale).toBeLessThan(1);               // fadeIn=0 → 逐 tick −0.01 衰落链未变
  });

  it('普通通道（缺省 opts）行为零变化：初速随机叠加 SpeedX/SpeedY', () => {
    const vd = new VanillaDust();
    let jittered = false;
    for (let i = 0; i < 64 && !jittered; i++) {
      const d = vd.spawn(100, 100, 40, 40, 107, 3, 1)!;
      if (d.vx !== 3 || d.vy !== 1) jittered = true;     // ±2 rand 抖动一直在
      expect(d.type).toBe(107);
    }
    expect(jittered).toBe(true);
  });
});
