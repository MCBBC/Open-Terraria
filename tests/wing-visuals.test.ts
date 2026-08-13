// 翅膀视觉层回归（DrawPlayer_09_Wings :655-1040 + WingFrame :29002-30045 +
// 滑翔帧段 :26874-27010）。
// 背景：曾因渲染锚点双重平移（世界坐标叠进脚底局部空间）+ 内层再镜像 + 帧数写死
// 7/6（原版 generic=4）三连 bug，翅膀画到屏幕外/永不翻转/错切片——"背后没翅膀"。
import { describe, it, expect } from 'vitest';
import {
  wingDrawOf, stepWingFrame, wingDrawFrame,
  FLAP_HOVER_SET, VISUAL_HOVER_SET,
  type WingFrameState, type WingFrameInput,
} from '../src/data/vanillaWingVisuals';

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
