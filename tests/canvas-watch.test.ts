// CanvasWatch 速率判定逻辑单测(2026-08-18,纯逻辑无 DOM)。
// 判据(连续窗双档,两轮真机标定返工后的最终形态):
//   急性:≥300 张/窗 连 3 窗;慢性:≥100 张/窗 连 6 窗;60s 冷却。
// 一次性构建(进世界 hardAlpha 洪峰 1621/窗、跑图首见 30/s×2 窗)1-2 窗即衰减 → 不报。
import { describe, it, expect } from 'vitest';
import { RateWatch } from '../src/render/CanvasWatch';

const W = 5; // 窗口秒
const T = (i: number) => i * 5000;

describe('CanvasWatch 连续窗双档判定', () => {
  it('进世界洪峰(单窗 1621 后衰减)不报——hardAlpha 误报回归网', () => {
    const w = new RateWatch();
    expect(w.window(1621, W, T(1)).warn).toBe(false);   // 洪峰窗(streak300=1)
    expect(w.window(150, W, T(2)).warn).toBe(false);    // 余波(streak300=0)
    expect(w.window(30, W, T(3)).warn).toBe(false);
  });

  it('跑图首见瞬态(30/s×2 窗后回落)不报', () => {
    const w = new RateWatch();
    expect(w.window(150, W, T(1)).warn).toBe(false);    // streak100=1
    expect(w.window(150, W, T(2)).warn).toBe(false);    // streak100=2
    expect(w.window(20, W, T(3)).warn).toBe(false);     // 断
    expect(w.window(150, W, T(4)).warn).toBe(false);    // streak100=1
  });

  it('急性事故(cloudTint 形态 1700/窗)第 3 窗报警', () => {
    const w = new RateWatch();
    expect(w.window(1700, W, T(1)).warn).toBe(false);
    expect(w.window(1700, W, T(2)).warn).toBe(false);
    expect(w.window(1700, W, T(3)).warn).toBe(true);    // streak300=3
  });

  it('慢性泄漏(50/s=250/窗)第 6 窗报警(慢性档)', () => {
    const w = new RateWatch();
    for (let i = 1; i <= 5; i++) expect(w.window(250, W, T(i)).warn).toBe(false);
    expect(w.window(250, W, T(6)).warn).toBe(true);     // streak100=6
  });

  it('冷却:报警后 60s 内持续异常不重复,期满再报', () => {
    const w = new RateWatch();
    for (let i = 1; i <= 3; i++) w.window(1700, W, T(i));
    const first = w.window(1700, W, T(3));              // T(3) 已报
    void first;
    expect(w.window(1700, W, T(4)).warn).toBe(false);   // 冷却内
    expect(w.window(1700, W, T(10)).warn).toBe(false);  // 仍冷却(T10-T3=35s)
    expect(w.window(1700, W, T(16)).warn).toBe(true);   // T16-T3=65s 期满
  });

  it('正常稳态(≤6/s)永远不报', () => {
    const w = new RateWatch();
    for (let i = 0; i < 30; i++) expect(w.window(30, W, T(i)).warn).toBe(false);
  });
});
