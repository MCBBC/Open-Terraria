// ★P0-A 塌方链修复锁（2026-09-25 定谳续刀）。
// 定谳:acquireSwPipe 持续 null（渐进闩/饥饿锁两扇门）而 newWorldCompose 静默返
// null 每帧 ??= 重试不写指纹,_markPath 只对 'lrecon-fail'/'lrecon-skip' 前缀记
// lastFail——compose 未起的帧记普通 'lrecon' 与正常初段同桶 ⇒ 用户会话 26484 帧
// @25fps 全 2D 塌方 17 分钟零归因。本刀:①各失败支带指纹+skip 帧计数;②init 闩
// 30s→2-3.5-5s 渐进+饥饿锁半开试探（连续 ≥2 拍成功才闭合）;③一次性降级 toast
// （SWPIPE_DEGRADE_TOAST 回滚口）;④F5 starve/swpipe 快照面。
// node 可跑面:GLStats 半开试探行为锁（vi.resetModules 隔离模块态）+Renderer 侧
// 原型实例行为锁（绕构造器判例 bj316——GLPipeline 需 DOM）+源码锚。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Renderer } from '../src/render/Renderer';

const RDR = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const GLS = readFileSync(join(__dirname, '../src/render/GLStats.ts'), 'utf8');
const DBR = readFileSync(join(__dirname, '../src/debug/DebugReport.ts'), 'utf8');

// ---- Renderer 原型实例（手工字段——构造器拖整条 DOM 链,bj316 判例） ----
function makeR(): { r: Renderer; a: Record<string, unknown> } {
  const r = Object.create(Renderer.prototype) as Renderer;
  const a = r as unknown as Record<string, unknown>;
  a._diagFrame = 7;              // 任意非零帧戳
  a._swPipeMarkFrame = -1;
  a.composePathStats = {};
  a.composePathUsed = '';
  a.composeLastFail = '';
  a.composeSkipFrames = 0;
  a.composeSkipStreak = 0;
  a.swPipeFailWhy = '';
  a.swPipeLastOkAt = 0;
  a.swPipeRetryAt = 0;
  a.swPipeRetryLadder = 0;
  a.cloudPipeRetryAt = 0;
  a.cloudPipeRetryLadder = 0;
  a.worldPipeRetryAt = 0;
  a.worldPipeRetryLadder = 0;
  a._swPipeDegradeToasted = false;
  a._swPipeDegradeToastAt = 0;
  a.cbOnSwPipeDegrade = null;
  a.swPipe = null;
  return { r, a };
}

describe('P0-A ① 降级全带指纹（markSwPipeSkip 帧去重+skip 计数）', () => {
  it('三失败因各自落 lrecon-skip:swpipe-* 指纹+composeSkipFrames 逐帧累计', () => {
    const { r, a } = makeR();
    (r as unknown as { markSwPipeSkip: (w: string) => void }).markSwPipeSkip('starvelock');
    expect(a.composePathStats).toMatchObject({ 'lrecon-skip:swpipe-starvelock': 1 });
    expect(a.composeLastFail).toBe('swpipe-starvelock');   // _markPath 前缀闩连续归因
    expect(a.composePathUsed).toBe('lrecon-skip:swpipe-starvelock');
    expect(a.composeSkipFrames).toBe(1);
    expect(a.composeSkipStreak).toBe(1);
    // 同帧第二消费方失败:指纹/计数不重复（帧去重）
    (r as unknown as { markSwPipeSkip: (w: string) => void }).markSwPipeSkip('backoff');
    expect(a.composeSkipFrames).toBe(1);
    expect(a.swPipeFailWhy).toBe('backoff');               // 失败因仍更新（归因面最新值）
    // 新帧:再计一次
    a._diagFrame = 8;
    (r as unknown as { markSwPipeSkip: (w: string) => void }).markSwPipeSkip('backoff');
    expect(a.composeSkipFrames).toBe(2);
    expect(a.composeSkipStreak).toBe(2);
    expect(a.composePathStats).toMatchObject({ 'lrecon-skip:swpipe-backoff': 1 });
  });
  it('acquireSwPipe 各失败支/swpipeBackoff/starvelock/init-fail 分支源码锚+newWorldCompose null 支接线', () => {
    // 三失败因在 acquireSwPipe/reviveSwPipe 各自落账（退避窗/饥饿锁/init 实败）
    expect(RDR.match(/markSwPipeSkip\('backoff'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(RDR.match(/markSwPipeSkip\('starvelock'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(RDR.match(/markSwPipeSkip\('init-fail'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    // newWorldCompose null 支按 acquire 失败因补账+toast
    expect(RDR).toContain("this.markSwPipeSkip((this.swPipeFailWhy || 'backoff') as 'backoff' | 'init-fail' | 'starvelock');");
    expect(RDR).toContain('this.notifySwPipeDegrade();');
    // _markPath 前缀闩对 'lrecon-skip' 生效（既有语义,防回退）
    expect(RDR).toContain("p.startsWith('lrecon-fail') || p.startsWith('lrecon-skip')");
  });
});

describe('P0-A ② 自愈提速（渐进闩+半开试探）', () => {
  it('armRetryLatch 渐进阶 2→3.5→5s 封顶（原 30s 定值闩反锁）', () => {
    const { r, a } = makeR();
    const arm = (r as unknown as { armRetryLatch: (k: 'swpipe' | 'cloud' | 'world') => void });
    arm.armRetryLatch('swpipe');
    const d1 = (a.swPipeRetryAt as number) - performance.now();
    expect(d1).toBeGreaterThan(1_500); expect(d1).toBeLessThanOrEqual(2_100);
    arm.armRetryLatch('swpipe');
    const d2 = (a.swPipeRetryAt as number) - performance.now();
    expect(d2).toBeGreaterThan(3_000); expect(d2).toBeLessThanOrEqual(3_600);
    arm.armRetryLatch('swpipe'); arm.armRetryLatch('swpipe');
    const d4 = (a.swPipeRetryAt as number) - performance.now();
    expect(d4).toBeGreaterThan(4_500); expect(d4).toBeLessThanOrEqual(5_100);   // 封顶 5s
    // 三闩独立阶梯
    expect(a.cloudPipeRetryLadder).toBe(0); expect(a.worldPipeRetryLadder).toBe(0);
  });
  it('成功归零:阶梯/失败因/skip streak 复位（源码锚:健康早退支+init 成功支）', () => {
    expect(RDR).toContain('this.swPipeRetryLadder = 0;');
    expect(RDR).toContain('this.cloudPipeRetryLadder = 0;');
    expect(RDR).toContain('this.worldPipeRetryLadder = 0;');
    expect(RDR).toContain('noteStarveProbeOk();');
    expect(RDR).toContain('noteStarveProbeFail();');
    expect(RDR).toContain('this.composeSkipStreak = 0;');
  });
  it('GLStats 半开试探:饥饿窗内放行一拍;连续 ≥2 拍成功才闭合;新丢失/失败打断 streak', async () => {
    vi.resetModules();
    let t = 100_000;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => t);
    try {
      const G = await import('../src/render/GLStats');
      const events: boolean[] = [];
      G.onStarveTransition((on) => events.push(on));
      // 3 次丢失→饥饿;窗刚起=lastProbeAt −∞⇒首调即半开试探放行,紧随同拍=扣押
      G.noteContextLost('t1'); G.noteContextLost('t2'); G.noteContextLost('t3');
      expect(G.starvedLock()).toBe(false);
      expect(G.starvedLock()).toBe(true);
      expect(events).toEqual([true]);        // 转场沿不因试探拍隐瞒/重复
      // 第 1 拍成功:streak=1,未闭合
      G.noteStarveProbeOk();
      t += 6_000;
      expect(G.starvedLock()).toBe(false);   // 第 2 拍放行
      G.noteStarveProbeOk();                 // 连续第 2 拍→闭合清窗
      expect(G.starvedLock()).toBe(false);
      expect(events).toEqual([true, false]);
      // 重进饥饿:短距内首调=扣押（试探未到期）;失败登记打断 streak
      G.noteContextLost('t4'); G.noteContextLost('t5'); G.noteContextLost('t6');
      t += 2_000;
      expect(G.starvedLock()).toBe(true);
      t += 4_000;
      expect(G.starvedLock()).toBe(false);   // 半开拍
      G.noteStarveProbeOk();
      G.noteStarveProbeFail();               // streak 打断
      t += 6_000;
      expect(G.starvedLock()).toBe(false);
      G.noteStarveProbeOk();                 // 仅 streak=1
      expect(G.starvedLock()).toBe(true);    // 未闭合（单拍侥幸不回切）
      const snap = G.starveSnapshot();
      expect(snap.active).toBe(true);
      expect(snap.ever).toBe(true);
      expect(snap.losses).toBe(3);
      expect(snap.probeOkStreak).toBe(1);
      expect(snap.windowRemainMs).toBeGreaterThan(0);
      expect(snap.nextProbeInMs).toBeGreaterThanOrEqual(0);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('P0-A ③ 一次性降级 toast（BJ258 式明令分歧通道）', () => {
  it('episode 首帧一次;episode 内不重复;SWPIPE_DEGRADE_TOAST=false 静默（回滚口）', () => {
    const { r, a } = makeR();
    const fired: number[] = [];
    a.cbOnSwPipeDegrade = () => fired.push(1);
    const notify = (r as unknown as { notifySwPipeDegrade: () => void });
    notify.notifySwPipeDegrade();
    notify.notifySwPipeDegrade();
    notify.notifySwPipeDegrade();
    expect(fired.length).toBe(1);
    expect(a._swPipeDegradeToasted).toBe(true);
    // 回滚口
    Renderer.SWPIPE_DEGRADE_TOAST = false;
    a._swPipeDegradeToasted = false;
    notify.notifySwPipeDegrade();
    expect(fired.length).toBe(1);          // 通道关闭=不再提示
    Renderer.SWPIPE_DEGRADE_TOAST = true;
  });
  it('恢复再武装在健康支（源码锚）+Game 接线 l10n 键+F5 双面接线', () => {
    expect(RDR).toContain('if (this._swPipeDegradeToasted && now - this._swPipeDegradeToastAt > Renderer.SWPIPE_TOAST_REARM_MS) {');
    expect(RDR).toContain('swPipeDiag(): Record<string, unknown> {');
    expect(RDR).toContain('cbOnSwPipeDegrade: (() => void) | null = null;');
    const GAME = readFileSync(join(__dirname, '../src/core/Game.ts'), 'utf8');
    expect(GAME).toContain('this.renderer.cbOnSwPipeDegrade = () => {');
    expect(GAME).toContain("Lang.text('Mods.SandboxWorld.Toast.Gpu2DFallback')");
    expect(DBR).toContain('skipFrames: g.renderer?.composeSkipFrames ?? null,');
    expect(DBR).toContain("swpipe: typeof (g.renderer as { swPipeDiag?: () => unknown })?.swPipeDiag === 'function'");
    // starve 快照面由 Renderer.swPipeDiag() 内嵌（GLStats.starveSnapshot）
    expect(RDR).toContain('starve: starveSnapshot(),');
  });
  it('l10n 键全语言在场+构建产物命中（audit 同源）', () => {
    const zh = JSON.parse(readFileSync(join(__dirname, '../../tools/l10n-custom/zh-Hans.json'), 'utf8'));
    const en = JSON.parse(readFileSync(join(__dirname, '../../tools/l10n-custom/en-US.json'), 'utf8'));
    expect(zh.Mods['SandboxWorld.Toast.Gpu2DFallback']).toBeTruthy();
    expect(en.Mods['SandboxWorld.Toast.Gpu2DFallback']).toBeTruthy();
    const built = JSON.parse(readFileSync(join(__dirname, '../public/l10n/zh-Hans.json'), 'utf8'));
    expect(built.Mods['SandboxWorld.Toast.Gpu2DFallback']).toBeTruthy();
  });
});
