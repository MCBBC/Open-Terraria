// ★P0-C 闩族合集修复锁（2026-09-25 trace-231810 定谳续刀——塌方链同族新分层）。
// 定谳①（worldGl 闩）:drawArrays 全 trace 仅 22 次/616 帧=GL quad 发射几乎不在场,
//  而 compose 活着（texSubImage2D n=557≈1/帧）——已建 worldCompose 实例无逐帧门
//  照跑,bgl 工厂（acquireWorldGl）逐帧过 starvedLock/闩门;且共管画布上多监听者
//  （云层+世界层）对同一真实 contextlost 各记一笔→饥饿窗被灌满,2 次真实丢失即
//  假性饥饿扳锁=「compose 活而它死」的分层塌方主因。修=noteContextLostOnce 同
//  canvas 去重（250ms 窗）+acquireWorldGl 失败因指纹（world-gl-skip:*）。
// 定谳②（C9c 门）:v1 固定 12ms 绝对阈在忙机恒超标（用户 lagMs 恒 ~20>12,F5 实测）
//  → live 永不可达=warmup 本地双跑永久化（光照主线程残部 1911ms+worker 同跑,
//  「骤降难回升」闩族第三枚）。修=滑动 p50 相对判据（进=1.5×tick≈25ms/出=2.5×tick
//  ≈42ms,滞回 8/2 不变;?lightlag=ms 手动绝对阈保留）。
// node 可跑面:GLStats 去重行为锁+liveGateStep 纯函数锁+Renderer 原型行为锁（bj316
//  判例绕构造器）+源码锚。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Renderer } from '../src/render/Renderer';
import { LIGHT_GATE_MODE, LIGHT_LIVE_ENTER_MS, LIGHT_LIVE_EXIT_MS, LIGHT_TICK_MS, lightGateDiag, liveGateStep } from '../src/lighting/LightingEngine';

const RDR = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const GLS = readFileSync(join(__dirname, '../src/render/GLStats.ts'), 'utf8');
const LAY = readFileSync(join(__dirname, '../src/render/GLSpriteLayer.ts'), 'utf8');
const ENG = readFileSync(join(__dirname, '../src/lighting/LightingEngine.ts'), 'utf8');
const DBR = readFileSync(join(__dirname, '../src/debug/DebugReport.ts'), 'utf8');

describe('P0-C ① 同上下文丢失只记一笔（审计窗反污染）', () => {
  it('同 canvas key 250ms 内多笔报告→窗计 1;异 key 各计;超窗再计', async () => {
    vi.resetModules();
    let t = 500_000;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => t);
    try {
      const G = await import('../src/render/GLStats');
      const cv = { __canvas: 'shared-pipe-canvas' };   // 共管管线画布替身
      const other = { __canvas: 'main' };
      G.noteContextLostOnce(cv, 'sprite:swpipe');      // 云层监听者
      G.noteContextLostOnce(cv, 'sprite:swpipe');      // 世界层监听者（同事件）
      G.noteContextLostOnce(cv, 'sprite:swpipe');      // 管线本体（同事件）
      expect(G.starveSnapshot().losses).toBe(1);       // 单次真实丢失=窗 1 笔
      G.noteContextLostOnce(other, 'main');
      expect(G.starveSnapshot().losses).toBe(2);       // 异上下文=真丢失,各计
      t += 300;
      G.noteContextLostOnce(cv, 'sprite:swpipe');
      expect(G.starveSnapshot().losses).toBe(3);       // 超窗=该上下文第二次真实丢失
    } finally {
      spy.mockRestore();
    }
  });
  it('源码锚:GLSpriteLayer 管线支换 noteContextLostOnce（共享 canvas）;独立支保留直记（自持画布单监听）', () => {
    expect(GLS).toContain('export function noteContextLostOnce(ctxKey: object, tag: string): void {');
    expect(LAY).toContain('noteContextLostOnce(this.canvas, `sprite:${this.statName}`)');
    expect(LAY.match(/noteContextLost\(`sprite:\$\{this\.statName\}`\)/g)?.length ?? 0).toBe(1);  // 独立 init() 支恰一处
  });
});

describe('P0-C ② worldGl 层闩归因面（compose 活而它死的一步归因）', () => {
  it('markWorldGlSkip 帧去重落账 bglPathStats+worldGlSkipFrames', () => {
    const r = Object.create(Renderer.prototype) as Renderer;
    const a = r as unknown as Record<string, unknown>;
    a._diagFrame = 3;
    a._worldGlMarkFrame = -1;
    a.bglPathStats = {};
    a.worldGlSkipFrames = 0;
    a.worldGlFailWhy = '';
    const mark = (r as unknown as { markWorldGlSkip: (w: 'backoff' | 'init-fail' | 'starvelock') => void });
    mark.markWorldGlSkip('starvelock');
    expect(a.bglPathStats).toMatchObject({ 'world-gl-skip:starvelock': 1 });
    expect(a.worldGlSkipFrames).toBe(1);
    expect(a.worldGlFailWhy).toBe('starvelock');
    mark.markWorldGlSkip('backoff');                 // 同帧第二消费方:计数去重
    expect(a.worldGlSkipFrames).toBe(1);
    expect(a.worldGlFailWhy).toBe('backoff');
    a._diagFrame = 4;
    mark.markWorldGlSkip('backoff');
    expect(a.worldGlSkipFrames).toBe(2);
  });
  it('源码锚:acquireWorldGl 三失败支+swPipeDiag.worldGl 块+F5 透传', () => {
    expect(RDR.match(/markWorldGlSkip\('backoff'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(RDR.match(/markWorldGlSkip\('starvelock'\)/g)?.length ?? 0).toBe(1);
    expect(RDR.match(/markWorldGlSkip\('init-fail'\)/g)?.length ?? 0).toBe(1);
    expect(RDR).toContain("this.markWorldGlSkip((this.swPipeFailWhy || 'backoff') as 'backoff' | 'init-fail' | 'starvelock');");
    expect(RDR).toContain('worldGlSkipFrames = 0;');
    expect(RDR).toContain('worldGl: {');
    expect(DBR).toContain('swpipe: typeof (g.renderer as { swPipeDiag?: () => unknown })?.swPipeDiag === \'function\'');
  });
});

describe('P0-C ③ C9c-v2 自适应 live 门（忙机双跑锁死翻案）', () => {
  it('忙机场景（用户案 p50≈20ms）:v2 阈 1.5×tick≈25ms 放行进 live（v1 12ms 永拒）', () => {
    let s = { live: false, good: 0, bad: 0, fell: false };
    for (let i = 0; i < 8; i++) s = liveGateStep(s.live, s.good, s.bad, 20, true);
    expect(s.live).toBe(true);            // v1(12ms 阈)恒拒→v2 放行=双跑锁死消除
  });
  it('★C9c-v3 粘性 live:阈常量保留（进=1.5×tick/出=2.5×tick 仅作计数诊断）,lag 出场已删', () => {
    expect(LIGHT_LIVE_EXIT_MS).toBeGreaterThan(LIGHT_LIVE_ENTER_MS);
    expect(LIGHT_LIVE_ENTER_MS).toBeCloseTo(LIGHT_TICK_MS * 1.5, 6);
    expect(LIGHT_LIVE_EXIT_MS).toBeCloseTo(LIGHT_TICK_MS * 2.5, 6);
    let s = { live: true, good: 0, bad: 0, fell: false };
    s = liveGateStep(s.live, s.good, s.bad, 30, true);    // 30>进阈但<出阈:坏拍 0（live 态按出阈计数）
    expect(s.live).toBe(true);
    s = liveGateStep(s.live, s.good, s.bad, 50, true);    // >出阈:坏拍 1（仅诊断）
    expect(s.live).toBe(true);
    s = liveGateStep(s.live, s.good, s.bad, 50, true);    // 坏拍 2→旧 v2 在此退场;v3 粘性恒 live
    expect(s.live).toBe(true);
    expect(s.fell).toBe(false);
  });
  it('缺省=adaptive 模式;手动阈 ?lightlag 源码锚（v1 绝对语义保留）', () => {
    expect(LIGHT_GATE_MODE).toBe('adaptive');             // node 无 document→非手动
    expect(ENG).toContain("new URLSearchParams(location.search).get('lightlag')");
    expect(ENG).toContain("LIGHT_LAG_MANUAL > 0 ? LIGHT_LAG_MANUAL : LIGHT_TICK_MS * 1.5");
    expect(ENG).toContain("LIGHT_LAG_MANUAL > 0 ? LIGHT_LAG_MANUAL : LIGHT_TICK_MS * 2.5");
  });
  it('lwGate 接线:p50 滑动窗（24 帽）+诊断面导出+F5 lightGate 块', () => {
    expect(ENG).toContain('private lwLagRing: number[] = [];');
    expect(ENG).toContain('if (this.lwLagRing.length > 24) this.lwLagRing.shift();');
    expect(ENG).toContain('const sorted = [...this.lwLagRing].sort((a, b) => a - b);');
    expect(ENG).toContain('export const lightGateDiag = {');
    expect(ENG).toContain('lightGateDiag.live = this.lwLive;');
    expect(DBR).toContain('lightGate: { ...lightGateDiag },');
    expect(lightGateDiag.mode).toBe('adaptive');
    expect(lightGateDiag.enterMs).toBeCloseTo(25, 1);
  });
  it('纯函数缺省阈=自适应常量（既有无阈参调用面行为保持）', () => {
    // 回归锁:lag=5 健康/8 拍进 live（c9c 既有契约在 v2 缺省阈下不回退）
    let s = { live: false, good: 0, bad: 0, fell: false };
    for (let i = 0; i < 8; i++) s = liveGateStep(s.live, s.good, s.bad, 5, true);
    expect(s.live).toBe(true);
  });
});
