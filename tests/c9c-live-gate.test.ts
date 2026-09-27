// ★C9c 自适应 live 门单测（2026-09-24）——滞回步进 liveGateStep 纯函数。
// 背景三案：120fps 高刷滑档（C9b 到达即应用修）→ 用户复报不限帧率/进世界仍延迟
// → C9c liveAuth 门（warmup 禁陈旧倒灌）+ lagMs 滞回门（健康才转 live,饱和回退）。
// ★C9c-v4（2026-09-28）进场简化改写:adaptive 模式 hasResult（首个健康结果）即
// live——v3「连续 8 拍 ≤进阈」进场资格在忙机（主线程忙→lag 恒 50-200ms）永不
// 满足=warmup 永久化（v1 同病换阈复发,定谳见 LightingEngine 头注）;
// lag 计拍退役为纯诊断;手动模式（enterMs===exitMs,?lightlag 面）保留 v1 绝对阈
// 全语义（8 连拍进场+坏拍满 2 强制出场）。
import { describe, it, expect } from 'vitest';
import { liveGateStep, LIGHT_LIVE_ENTER_MS, LIGHT_LIVE_EXIT_MS } from '../src/lighting/LightingEngine';

describe('C9c live 门（v4 进场简化终态）', () => {
  it('lag=0（尚无结果）不计拍,永先进 live', () => {
    let s = liveGateStep(false, 0, 0, 0, false);
    for (let i = 0; i < 20; i++) s = liveGateStep(s.live, s.good, s.bad, 0, false);
    expect(s.live).toBe(false);
    expect(s.good).toBe(0);
  });

  it('无结果（hasResult=false）即使好拍满也不进 live（warmup 短窗行为不变）', () => {
    let s = { live: false, good: 0, bad: 0, fell: false };
    for (let i = 0; i < 30; i++) s = liveGateStep(s.live, s.good, s.bad, 5, false);
    expect(s.live).toBe(false);
    expect(s.good).toBeGreaterThanOrEqual(8);   // 计拍账本照常（纯诊断面 retained）
  });

  it('★v4:首个健康结果即 live（第 1 拍进,忙机永拒定谳删除）', () => {
    let s = liveGateStep(false, 0, 0, 5, true);
    expect(s.live).toBe(true);
    expect(s.fell).toBe(false);
    // lag 超阈的「坏拍」同样进场——lag 只是诊断,不再是进场的否定判据
    let t = liveGateStep(false, 0, 0, 200, true);
    expect(t.live).toBe(true);
  });

  it('★v4 诊断面:lag 计拍照常记账（好拍/坏拍清零语义 retained,不驱动门态）', () => {
    let s = liveGateStep(true, 7, 0, 100, true);   // live 态坏拍:bad++ good 清零
    expect(s.good).toBe(0);
    expect(s.bad).toBe(1);
    expect(s.live).toBe(true);                     // 不退场（出场唯一=看门狗）
    let t = { live: false, good: 7, bad: 0, fell: false };
    t = liveGateStep(t.live, t.good, t.bad, 100, true);   // warmup 坏拍+首结果
    expect(t.bad).toBe(1);
    expect(t.good).toBe(0);
    expect(t.live).toBe(true);                     // v4:hasResult 即 live
  });

  it('★C9c-v3 粘性 live retained:live 态连续坏拍不退场（lag 出场已删——弱机横跳定谳）', () => {
    let s = { live: true, good: 0, bad: 0, fell: false };
    s = liveGateStep(s.live, s.good, s.bad, 50, true);
    expect(s.live).toBe(true);            // 1 拍超阈不退（粘性 retained）
    s = liveGateStep(s.live, s.good, s.bad, 50, true);
    expect(s.live).toBe(true);            // 旧 v2 在此退场=弱机 live/warmup 横跳源,已删
    for (let i = 0; i < 100; i++) s = liveGateStep(s.live, s.good, s.bad, 60, true);
    expect(s.live).toBe(true);            // 恒 live——出场只归看门狗级硬故障
    expect(s.fell).toBe(false);
    expect(s.bad).toBeGreaterThan(0);     // 坏拍仍计数（纯诊断面,不驱动退场）
  });

  it('★v4 手动模式（enterMs===exitMs,?lightlag 面）:v1 绝对阈全语义保留', () => {
    // 小阈（模拟 ?lightlag=1）:lag 恒超阈→好拍永不成→稳定钉 warmup（探针强扭矩面）
    let w = { live: false, good: 0, bad: 0, fell: false };
    for (let i = 0; i < 40; i++) w = liveGateStep(w.live, w.good, w.bad, 50, true, 1, 1);
    expect(w.live).toBe(false);
    // 大阈（模拟 ?lightlag=10000）:8 连好拍进场且坏拍不再强制出场→稳定钉 live
    let l = { live: false, good: 0, bad: 0, fell: false };
    for (let i = 0; i < 7; i++) l = liveGateStep(l.live, l.good, l.bad, 5, true, 10000, 10000);
    expect(l.live).toBe(false);           // 手动保留 8 连拍进场资格（v1 语义）
    l = liveGateStep(l.live, l.good, l.bad, 5, true, 10000, 10000);
    expect(l.live).toBe(true);            // 第 8 拍进入
    for (let i = 0; i < 20; i++) l = liveGateStep(l.live, l.good, l.bad, 5, true, 10000, 10000);
    expect(l.live).toBe(true);
    // 中阈:live 态坏拍满 2 → 强制出场（v1 面已删的 lag 出场只在手动模式保留）
    let m = { live: true, good: 0, bad: 0, fell: false };
    m = liveGateStep(m.live, m.good, m.bad, 50, true, 25, 25);
    expect(m.live).toBe(true);            // 1 拍不退
    m = liveGateStep(m.live, m.good, m.bad, 50, true, 25, 25);
    expect(m.live).toBe(false);           // 坏拍满 2 强制出场（绝对阈探针面）
    expect(m.good).toBe(0);
    expect(m.fell).toBe(false);           // fell 恒 false（兼容保留字段）
  });

  it('自适应缺省阈恒进<出（手动判定=两阈相等的身份面不误伤）', () => {
    expect(LIGHT_LIVE_EXIT_MS).toBeGreaterThan(LIGHT_LIVE_ENTER_MS);
  });
});
