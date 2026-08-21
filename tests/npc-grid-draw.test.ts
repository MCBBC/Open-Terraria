// 2D 网格贴图 NPC 帧引擎回归：657/576/577/696/564/565/668 七个"网格帧"NPC 的
// FindFrame 索引状态机（NPC.cs:67295+ 大 switch 专属 case）1:1 序列验证。
// 通用 vnpc 竖切路径会把网格表整行画出来（画错成多倍宽）——这些 NPC 的帧索引语义
// 必须与原版逐 tick 一致，切格绘制才有意义。
//
// 注意原版 frameCounter 语义：初值 0、每 tick 先 +=1 再比阈值——因此每段【首帧
// 比标称持帧少 1 tick】（如"每 4t 推进"实际首帧显示 3 tick）。以下断言全部按
// 反编译逐行手推的精确值书写。
import { describe, it, expect } from 'vitest';
import {
  queenSlimeNextFrame,
  dd2OgreNextFrame,
  npc696NextFrame,
  darkMageNextFrame,
  deerclopsNextFrame,
  type NpcGridFrameState,
} from '../src/render/Renderer';

function st(): NpcGridFrameState { return { counter: 0, idx: 0 }; }

/** 驱动 n tick，收集每 tick 的帧索引 */
function run(fn: () => number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(fn());
  return out;
}
/** 状态序列去重压缩（保留顺序）——校验"持帧→推进"节奏用 */
function compress(seq: number[]): number[] {
  return seq.filter((v, i) => i === 0 || v !== seq[i - 1]);
}

describe('657 史莱姆皇后（FindFrame case 657，NPC.cs:67503-67614）', () => {
  it('一阶段上升：4→7 每 4 tick 推进，到 7 后悬停', () => {
    const s = st();
    const seq = run(() => queenSlimeNextFrame(s, { half: false, flying: false, vy: -5, ai0: 3, ai1: 0 }), 40);
    expect(compress(seq)).toEqual([4, 5, 6, 7]);
    expect(seq.slice(0, 3)).toEqual([4, 4, 4]); // 首帧 3 tick（counter 初值 0 先加后比）
  });
  it('二段(half)上升：4→7 后转 22，20→23 每 5 tick 循环', () => {
    const s = st();
    const seq = run(() => queenSlimeNextFrame(s, { half: true, flying: true, vy: 0, ai0: 0, ai1: 0 }), 60);
    expect(compress(seq).slice(0, 7)).toEqual([4, 5, 6, 22, 23, 20, 21]);
    // 23 → 回卷 20 继续循环（闭合）
    expect(compress(seq).slice(4, 8)).toEqual([23, 20, 21, 22]);
  });
  it('下降(vy>0)：8→10 每 8 tick 推进，停在 10', () => {
    const s = st();
    const seq = run(() => queenSlimeNextFrame(s, { half: false, flying: false, vy: 3, ai0: 0, ai1: 0 }), 60);
    expect(compress(seq)).toEqual([8, 9, 10]);
  });
  it('落地 ai0==5：帧 13/14/15 按 (ai1/3)%3', () => {
    for (const [ai1, want] of [[0, 13], [3, 14], [6, 15], [9, 13], [15, 15]] as const) {
      const s = st();
      expect(queenSlimeNextFrame(s, { half: false, flying: false, vy: 0, ai0: 5, ai1 })).toBe(want);
    }
  });
  it('落地 ai0==4：帧 12/11/10 按 ai1/15', () => {
    for (const [ai1, want] of [[0, 12], [15, 11], [30, 10], [45, 10], [60, 12]] as const) {
      const s = st();
      expect(queenSlimeNextFrame(s, { half: false, flying: false, vy: 0, ai0: 4, ai1 })).toBe(want);
    }
  });
  it('地面行走：0→3 每 6 tick 循环；从空中落地先走 10→12 每 6t 再回 0', () => {
    const s = st();
    const seq = run(() => queenSlimeNextFrame(s, { half: false, flying: false, vy: 0, ai0: 3, ai1: 0 }), 30);
    expect(compress(seq)).toEqual([0, 1, 2, 3]);
    const s2: NpcGridFrameState = { counter: 0, idx: 10 };
    const seq2 = run(() => queenSlimeNextFrame(s2, { half: false, flying: false, vy: 0, ai0: 0, ai1: 0 }), 30);
    // 回 0 后 flag14 失效 → step 恢复 10（0 段持 10t）
    expect(compress(seq2)).toEqual([10, 11, 12, 0, 1]);
  });
});

describe('576/577 DD2 食人魔（FindFrame case 576/577，NPC.cs:68241-68380）', () => {
  it('走路 ai0>0&&ai1==0：11→20（13/19 持 8、14/18 持 2，其余持 4），末帧停住', () => {
    const s = st();
    const seq = run(() => dd2OgreNextFrame(s, { ai0: 1, ai1: 0, vx: 0, vy: 0 }), 200);
    expect(compress(seq).slice(0, 10)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    // 持帧数：仅入段首帧（范围复位）少 1 拍=3；段内帧（推进调用当场显示新帧、
    // counter 清 0）恰持标称值：13/19=8、14/18=2、其余 4
    const holds: Record<number, number> = {};
    for (const f of seq) holds[f] = (holds[f] ?? 0) + 1;
    expect(holds[11]).toBe(3); expect(holds[13]).toBe(8); expect(holds[14]).toBe(2);
    expect(holds[18]).toBe(2); expect(holds[19]).toBe(8);
    expect(seq[seq.length - 1]).toBe(20); // 帧末停住（原版 idx==20 后 counter 不复位）
  });
  it('攻击 ai0>0&&ai1==2：39 入段 → …→47 → 37→38；47 持 26；38/46腾空 冻结', () => {
    const s = st();
    const seq = run(() => dd2OgreNextFrame(s, { ai0: 1, ai1: 2, vx: 0, vy: 0 }), 200);
    expect(compress(seq).slice(0, 8)).toEqual([39, 40, 41, 42, 43, 44, 45, 46]);
    const holds: Record<number, number> = {};
    for (const f of seq) holds[f] = (holds[f] ?? 0) + 1;
    expect(holds[47]).toBeGreaterThanOrEqual(25); // 持 26（首帧少 1 拍后进入的段为 26）
    expect(seq).toContain(37);
    expect(seq[seq.length - 1]).toBe(38); // 38 起手不推进（flag12=false），地面态永久冻结
    // 46 腾空：帧冻结（flag12=false 不累加 counter）
    const sAir: NpcGridFrameState = { counter: 0, idx: 46 };
    const air = run(() => dd2OgreNextFrame(sAir, { ai0: 1, ai1: 2, vx: 0, vy: -3 }), 30);
    expect(air.every((f) => f === 46)).toBe(true);
    // 38 起手冻结
    const s38: NpcGridFrameState = { counter: 0, idx: 38 };
    const f38 = run(() => dd2OgreNextFrame(s38, { ai0: 1, ai1: 2, vx: 0, vy: 0 }), 30);
    expect(f38.every((f) => f === 38)).toBe(true);
  });
  it('施法 ai0>0&&ai1==1：21→38 持 5 线性推进', () => {
    const s = st();
    const seq = run(() => dd2OgreNextFrame(s, { ai0: 1, ai1: 1, vx: 0, vy: 0 }), 120);
    expect(compress(seq)).toEqual([21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38]);
  });
  it('默认：腾空=43 / 站定=0 / 行走 1..10 按 |vx| 累加（60 一循环）', () => {
    const sA = st();
    expect(dd2OgreNextFrame(sA, { ai0: -1120, ai1: 0, vx: 0, vy: -2 })).toBe(43);
    const sB = st();
    expect(dd2OgreNextFrame(sB, { ai0: -1120, ai1: 0, vx: 0, vy: 0 })).toBe(0);
    const sC = st();
    const walk = run(() => dd2OgreNextFrame(sC, { ai0: -1120, ai1: 0, vx: 3, vy: 0 }), 40);
    expect(compress(walk).slice(0, 11)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1]);
    expect(walk.every((f) => f >= 1 && f <= 10)).toBe(true);
  });
});

describe('696（FindFrame case 696，NPC.cs:67332-67388）', () => {
  it('ai0==1：0..7 每 4 tick 循环', () => {
    const s = st();
    const seq = run(() => npc696NextFrame(s, { ai0: 1 }), 40);
    expect(compress(seq).slice(0, 9)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
  });
  it('ai0==2：45..52 每 4 tick 循环', () => {
    const s = st();
    const seq = run(() => npc696NextFrame(s, { ai0: 2 }), 40);
    expect(compress(seq).slice(0, 9)).toEqual([45, 46, 47, 48, 49, 50, 51, 52, 45]);
  });
  it('默认：9..16 每 10 tick 循环', () => {
    const s = st();
    const seq = run(() => npc696NextFrame(s, { ai0: 0 }), 90);
    expect(compress(seq).slice(0, 9)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 9]);
  });
});

describe('564/565 暗黑魔法师（FindFrame case 564/565，NPC.cs:68657-69085）', () => {
  it('ai1==0 暗影矢：5/6/7 三循环×3 + 8..12 线性，7t/帧、98t 一循环', () => {
    const s = st();
    const seq = run(() => darkMageNextFrame(s, { ai0: 1, ai1: 0, speed: 0 }), 98);
    expect(compress(seq).slice(0, 14)).toEqual([5, 6, 7, 5, 6, 7, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(seq[97]).toBe(5); // 第 98t 阈值链触底 → 回卷帧 5 并清 counter
    const seq2 = run(() => darkMageNextFrame(s, { ai0: 1, ai1: 0, speed: 0 }), 49);
    expect(compress(seq2).slice(0, 7)).toEqual([5, 6, 7, 5, 6, 7, 5]); // 续循环不重置
  });
  it('ai1==1 治疗：13..20 → 18/19/20 回摆 → 21..25，8t/帧、128t 一循环', () => {
    const s = st();
    const seq = run(() => darkMageNextFrame(s, { ai0: 1, ai1: 1, speed: 0 }), 128);
    expect(compress(seq).slice(0, 16)).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 18, 19, 20, 21, 22, 23, 24, 25]);
    expect(seq[127]).toBe(13); // 128t 回卷
  });
  it('ai1==2 召骷髅：26-29 三循环×3 + 30..40 线性，8t/帧、184t 一循环', () => {
    const s = st();
    const seq = run(() => darkMageNextFrame(s, { ai0: 1, ai1: 2, speed: 0 }), 184);
    expect(compress(seq).slice(0, 23)).toEqual([
      26, 27, 28, 29, 26, 27, 28, 29, 26, 27, 28, 29,
      30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
    ]);
    expect(seq[183]).toBe(26); // 184t 回卷
  });
  it('招间(ai0<=0)漂浮：counter += |v|*0.1+1，帧 0..4、40 一循环', () => {
    const s = st();
    const seq = run(() => darkMageNextFrame(s, { ai0: -20, ai1: 0, speed: 2 }), 60);
    expect(compress(seq).slice(0, 6)).toEqual([0, 1, 2, 3, 4, 0]);
    expect(seq.every((f) => f >= 0 && f <= 4)).toBe(true);
  });
  it('切招时入段越界清 counter 重放', () => {
    // 从漂浮帧 2 直接进 ai1==1 → 越界（2 < 13）→ counter 清零从 13 起播
    const s: NpcGridFrameState = { counter: 0, idx: 2 };
    expect(darkMageNextFrame(s, { ai0: 1, ai1: 1, speed: 0 })).toBe(13);
    // 段内帧（如 20）不清 counter——按 counter=100 续播到 seq[12]=22（非从头 14）
    const s2: NpcGridFrameState = { counter: 100, idx: 20 };
    expect(darkMageNextFrame(s2, { ai0: 1, ai1: 1, speed: 0 })).toBe(22);
  });
});

describe('668 鹿角怪（FindFrame case 668，1457 NPC.cs:67543-67579 攻击态帧计数直读 ai[1] + 序列表 :6516-6534）', () => {
  it('ai0==1/4：攻击 1 表 [12,13,14,13,14,13,14,13,14,15,16,17]，每 4t 一格钳末帧'
    + '（1457：frameCounter=ai[1]，AI 相位驱动）', () => {
    for (const ai0 of [1, 4]) {
      const s = st();
      let ai1 = 0;
      const seq = run(() => deerclopsNextFrame(s, { ai0, ai1: ai1++, vx: 0, vy: 0 }), 60);
      expect(compress(seq)).toEqual([12, 13, 14, 13, 14, 13, 14, 13, 14, 15, 16, 17]);
      expect(seq[seq.length - 1]).toBe(17); // FromSequence 钳末帧后停住
    }
  });
  it('ai0==2：攻击 2 表 [12,15,16,17×4,13,18×4,12]（入段范围 12..18 非 12..12）', () => {
    const s = st();
    let ai1 = 0;
    const seq = run(() => deerclopsNextFrame(s, { ai0: 2, ai1: ai1++, vx: 0, vy: 0 }), 60);
    expect(compress(seq)).toEqual([12, 15, 16, 17, 13, 18, 12]);
    // 表长 13（每格 4t）：17 与 18 各占 4 格（16t）
    const holds: Record<number, number> = {};
    for (const f of seq) holds[f] = (holds[f] ?? 0) + 1;
    expect(holds[17]).toBe(16); expect(holds[18]).toBe(16);
  });
  it('ai0∈{3,5,7,8}：攻击 3 表 [19,20,21,22,21,22,…]（入段范围 19..24 非 19..19）', () => {
    for (const ai0 of [3, 5, 7, 8]) {
      const s = st();
      let ai1 = 0;
      // 24t（ai1 0..23）= 6 格；1457 直读 ai[1] 后 tick 数即帧钟（旧本地自增多 1 拍）
      const seq = run(() => deerclopsNextFrame(s, { ai0, ai1: ai1++, vx: 0, vy: 0 }), 24);
      expect(compress(seq)).toEqual([19, 20, 21, 22, 21, 22]);
    }
  });
  it('默认：vy>0 → 帧 1；站定 → 帧 0；行走 2..11 按 |vx| 累加（150 一循环）', () => {
    const sA = st();
    expect(deerclopsNextFrame(sA, { ai0: 0, vx: 0, vy: 2 })).toBe(1);
    const sB = st();
    expect(deerclopsNextFrame(sB, { ai0: 0, vx: 0, vy: 0 })).toBe(0);
    const sC = st();
    const walk = run(() => deerclopsNextFrame(sC, { ai0: 0, vx: 2, vy: 0 }), 80);
    expect(compress(walk).slice(0, 11)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 2]);
    expect(walk.every((f) => f >= 2 && f <= 11)).toBe(true);
  });
});
