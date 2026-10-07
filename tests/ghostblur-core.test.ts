// ★ghostblur 纯逻辑核行为测试（2026-10-07;GhostBlur.ts decide/ghostAlphaForSpeed）。
//
// 判别力纪律：本文件断言的是【决策输出】而非源文本——实现被变异（速度门摘除/
// α 公式改写/旁路门删除/gap 冷启动删除）必爆红。GL 执行面（blit/mix/present）
// 无法在 node 验证（无 WebGL）——像素 A/B 由 scripts/_ghostblur-ab.mjs 双臂
// 对拍兜底；源锚锁（旗面/调用位/fail-closed 门结构）在 ghostblur-wiring.test.ts。
import { describe, expect, it, beforeEach } from 'vitest';
import {
  GhostCore, ghostAlphaForSpeed, ghostDecideForTest, ghostCoreResetForTest,
  GHOST_SPEED_MIN, GHOST_SPEED_MAX, GHOST_ALPHA_MAX, GHOST_GAP_MS,
} from '../src/render/GhostBlur';

describe('ghostblur 速度→α 纯函数（观感带 0.10-0.25）', () => {
  it('静止/慢速（≤MIN）=0——不脏画面（步行 0.264/疾跑 0.37 全在门外）', () => {
    expect(ghostAlphaForSpeed(0)).toBe(0);
    expect(ghostAlphaForSpeed(0.264)).toBe(0);
    expect(ghostAlphaForSpeed(GHOST_SPEED_MIN)).toBe(0);
    expect(ghostAlphaForSpeed(-1)).toBe(0);
  });
  it('MIN..MAX 线性爬坡;MAX 以上钳满档;满档落在 0.10-0.25 观感带', () => {
    const mid = ghostAlphaForSpeed((GHOST_SPEED_MIN + GHOST_SPEED_MAX) / 2);
    expect(mid).toBeCloseTo(GHOST_ALPHA_MAX / 2, 10);
    expect(ghostAlphaForSpeed(GHOST_SPEED_MAX)).toBeCloseTo(GHOST_ALPHA_MAX, 10);
    expect(ghostAlphaForSpeed(99)).toBeCloseTo(GHOST_ALPHA_MAX, 10);
    expect(GHOST_ALPHA_MAX).toBeGreaterThanOrEqual(0.10);
    expect(GHOST_ALPHA_MAX).toBeLessThanOrEqual(0.25);
  });
});

describe('ghostblur 决策核（每帧恰一次推进）', () => {
  beforeEach(() => ghostCoreResetForTest());

  it('首帧=seed 冷启动（prev 无效,不 mix 不出 α）', () => {
    const d = ghostDecideForTest(100, 100, 0, 1920, 1080, true);
    expect(d.action).toBe('seed');
    expect(d.alpha).toBe(0);
  });

  it('★fail-closed:enabled=false → bypass+全状态复位（再开启走 seed,无陈旧反馈）', () => {
    const c = new GhostCore();
    c.decide(0, 0, 0, 640, 480, true);          // seed
    c.decide(600, 0, 16, 640, 480, true);       // 高速 → mix
    const off = c.decide(600, 0, 32, 640, 480, false);
    expect(off.action).toBe('bypass');
    // 复位后重新开启=seed（不持陈旧 α/相位）
    expect(c.decide(600, 0, 48, 640, 480, true).action).toBe('seed');
  });

  it('★静止=完全旁路（稳态零 GL 写入面——旗关/静止两臂逐位恒等的机制根）', () => {
    ghostDecideForTest(0, 0, 0, 640, 480, true);          // seed
    ghostDecideForTest(0, 0, 16, 640, 480, true);         // 静止第一帧:α 已 0 → bypass
    const d = ghostDecideForTest(0, 0, 32, 640, 480, true);
    expect(d.action).toBe('bypass');
    expect(d.alpha).toBe(0);
  });

  it('★高速=mix 且 α 攻击即时（起速首帧即满档,无半模糊爬坡）', () => {
    ghostDecideForTest(0, 0, 0, 640, 480, true);          // seed
    const d = ghostDecideForTest(0, 0, 16, 640, 480, true); // 相机没动（speed=0）→ bypass
    expect(d.action).toBe('bypass');
    const jump = ghostDecideForTest(48, 0, 32, 640, 480, true);   // 瞬移 48px/16ms=3px/ms
    expect(jump.action).toBe('mix');
    expect(jump.alpha).toBeCloseTo(GHOST_ALPHA_MAX, 10);  // 3 ≥ MAX → 满档
    expect(jump.speed).toBeCloseTo(3, 6);
  });

  it('急停 α 释放=指数衰减（不一次斩断;衰减到地板旁路）', () => {
    ghostDecideForTest(0, 0, 0, 640, 480, true);
    ghostDecideForTest(600, 0, 16, 640, 480, true);       // 满档 mix
    const alphas: number[] = [];
    let t = 32;
    for (let i = 0; i < 64; i++, t += 16) {
      const d = ghostDecideForTest(600, 0, t, 640, 480, true);   // 相机静止
      if (d.action === 'mix') alphas.push(d.alpha);
    }
    expect(alphas.length).toBeGreaterThan(2);             // 有释放尾
    expect(alphas[0]).toBeLessThan(GHOST_ALPHA_MAX);      // 首释放帧已衰减
    for (let i = 1; i < alphas.length; i++) expect(alphas[i]).toBeLessThan(alphas[i - 1]);
    expect(ghostDecideForTest(600, 0, t + 16, 640, 480, true).action).toBe('bypass');   // 地板外旁路
  });

  it('慢速域（speed≤MIN）恒 bypass——α 只在高速域出（衰减尾除外）', () => {
    ghostDecideForTest(0, 0, 0, 640, 480, true);
    // 从未高速过：步行速度 0.264px/ms×16ms≈4.2px 位移
    const d = ghostDecideForTest(4.2, 0, 16, 640, 480, true);
    expect(d.action).toBe('bypass');
  });

  it('长缝（dt≥GAP_MS）→ seed 冷启动（暂停恢复/长卡顿 prev 过期,防陈旧帧鬼影）', () => {
    ghostDecideForTest(0, 0, 0, 640, 480, true);
    ghostDecideForTest(300, 0, 16, 640, 480, true);       // mix
    const d = ghostDecideForTest(300, 0, 16 + GHOST_GAP_MS, 640, 480, true);
    expect(d.action).toBe('seed');
  });

  it('帧面尺寸变化 → seed（FBO 重分配内容失效,种子按新界重取）', () => {
    ghostDecideForTest(0, 0, 0, 640, 480, true);
    const d = ghostDecideForTest(0, 0, 16, 1280, 960, true);
    expect(d.action).toBe('seed');
  });

  it('ping-pong 相位：commitMix（present 落定后由 GL 壳调）翻转——读上写下,读槽永不被同帧写', () => {
    const c = new GhostCore();
    c.decide(0, 0, 0, 640, 480, true);
    expect(c.phase).toBe(0);
    c.decide(600, 0, 16, 640, 480, true);   // decide 只决策,不翻相位
    expect(c.phase).toBe(0);
    c.commitMix();                           // present 成功 → 交换（本帧读槽=下帧写槽）
    expect(c.phase).toBe(1);
    c.commitMix();
    expect(c.phase).toBe(0);
    c.reset();
    expect(c.phase).toBe(0);                 // 复位归零（下次 seed 冷启动同相）
  });
});
