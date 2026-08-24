// 环境音 cue 斜坡状态机对齐测试（Sfx.stepAmbientCue ≡ LegacyAudioSystem.cs:219-274）
// 覆盖：UpdateAmbientCueState 门开三支（起播/斜坡/sys==0 Immediate 停）+
//       UpdateAmbientCueTowardStopping 门关两支（清零/渐熄后停）+ 60Hz 斜坡时序
import { describe, expect, it } from 'vitest';
import { stepAmbientCue, type AmbientCueState } from '../src/core/Sfx';

const fresh = (): AmbientCueState => ({ fade: 0, playing: false });
/** 连推 n 帧（60Hz 语义），返回末帧返回值 */
const run = (st: AmbientCueState, frames: number, level: number, ambient: number, gate: boolean): number | null => {
  let v: number | null = null;
  for (let i = 0; i < frames; i++) v = stepAmbientCue(st, level, ambient, gate);
  return v;
};

describe('stepAmbientCue（LegacyAudioSystem.cs:219-274 1:1）', () => {
  it('门开首帧：按旧 fade(0) 起播不递增（:236-241 Reuse+Play 返回不斜坡）', () => {
    const st = fresh();
    expect(stepAmbientCue(st, 0.711, 1, true)).toBe(0);   // fade=0 × sys
    expect(st.playing).toBe(true);
    expect(st.fade).toBe(0);
  });

  it('门开斜坡：+0.005/帧 钳 1——200 帧(3.33s)满幅（:243-248）', () => {
    const st = fresh();
    stepAmbientCue(st, 0.711, 1, true);          // 起播帧 fade=0
    expect(run(st, 100, 0.711, 1, true)).toBeCloseTo(Math.min(1, 100 * 0.005) * 0.711, 6);
    expect(st.fade).toBeCloseTo(0.5, 6);
    expect(run(st, 200, 0.711, 1, true)).toBeCloseTo(1 * 0.711, 6);   // 已钳满
    expect(st.fade).toBe(1);
  });

  it('门开但 systemVolume==0：在播 → Immediate 停且 fade 冻结；未播 → null 不动音量(:229-234)', () => {
    const st = fresh();
    run(st, 300, 0.5, 1, true);                  // fade 推到 1
    const v = stepAmbientCue(st, 0, 1, true);    // atmo⁴=0 / ambient=0 → sys=0
    expect(v).toBe(0);
    expect(st.playing).toBe(false);
    expect(st.fade).toBe(1);                     // ★冻结语义（重启后按旧 fade 起播）
    // 未播分支：原版整支 return 什么都不动 → null（调用方跳过音量写入）
    expect(stepAmbientCue(st, 0, 1, true)).toBeNull();
    expect(st.fade).toBe(1);
    // 恢复供量 → 按 fade=1 立即满幅（无斜坡重建）
    expect(stepAmbientCue(st, 0.5, 1, true)).toBeCloseTo(0.5, 6);
  });

  it('门关渐熄：−0.005/帧，audible = fade×sys（sys 用门关后的公式值,:260-272）', () => {
    const st = fresh();
    stepAmbientCue(st, 0.9, 1, true);
    run(st, 200, 0.9, 1, true);                  // fade 满 1
    // 下地底：gate=false 但 level(num7) 不变（原版 TowardStopping 同样收 systemVolume）
    expect(run(st, 60, 0.9, 1, false)).toBeCloseTo((1 - 60 * 0.005) * 0.9, 6);
    expect(run(st, 140, 0.9, 1, false)).toBe(0); // 200 帧耗尽 → Immediate 停
    expect(st.playing).toBe(false);
  });

  it('门关未播放：fade 清零、本帧不动音量（:255-258 返回 null）', () => {
    const st = fresh();
    expect(stepAmbientCue(st, 0.9, 1, false)).toBeNull();
    expect(st.fade).toBe(0);
    // sys==0 冻结过的 fade 被门关清扫（!IsPlaying 分支同样置 0）
    const st2 = fresh();
    run(st2, 100, 0.5, 1, true);
    stepAmbientCue(st2, 0, 1, true);             // Immediate 停,fade 冻结 0.5
    stepAmbientCue(st2, 0.5, 1, false);          // 门关 → 清零
    expect(st2.fade).toBe(0);
  });

  it('ambient 滑条参与 systemVolume（ambientVolume×num7,Main.cs:11742）', () => {
    const st = fresh();
    stepAmbientCue(st, 0.711, 1, true);
    run(st, 200, 0.711, 1, true);
    expect(run(st, 1, 0.711, 0.75, true)).toBeCloseTo(0.711 * 0.75, 6);
  });

  it('level 超 1 输入钳 [0,1]（防御；正常链路 num7/num11 已在公式侧钳过）', () => {
    const st = fresh();
    stepAmbientCue(st, 2, 1, true);
    expect(run(st, 200, 2, 1, true)).toBeCloseTo(1, 6);
  });
});
