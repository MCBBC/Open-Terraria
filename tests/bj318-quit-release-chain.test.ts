// ★BJ318（2026-09-23）退世界释放链 tripwire（源码锚锁——BJ280 UnloadGuard 同款
// 手法：Game 构造器依赖全量 DOM/GL,node 测试环境无法 boot,以源码锚定关键释放
// 调用不被未来重构静默移除）。
//
// 定谳背景（用户实报 tab 1.7GB → 大世界读档 "[worldGen worker] Array buffer
// allocation failed"）：进出世界每轮 ~103MB（小世界）阶梯爬升。堆快照 retainer
// 链定谳主钉 = window 调试句柄族（__swRec→recorder 闭包→Game；__swMapDebug 闭包
// 直捕 Game；__swNatureParticles.st→旧 TileStore）+ memSentinel/GPU 看门狗两个
// 裸 setInterval 闭包。修复=Game.destroy 摘除全族 + Renderer.dispose 摘看门狗。
// 本测试锁：①destroy 摘除清单 ②NatureParticles.unbindStore 存在 ③memSentinel/
// GPU 看门狗句柄化 ④C8 WaveWorker worker 上下文禁 fork 守卫（同战役收口）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('BJ318 退世界释放链（源码锚 tripwire）', () => {
  const game = read('src/core/Game.ts');

  it('Game.destroy 摘除 window 调试句柄族（快照定谳主钉）', () => {
    expect(game).toContain('if (dbg.__swRec === this.recorder) dbg.__swRec = null;');
    expect(game).toContain('if (dbg.__swAudioRec === this.audioRec) dbg.__swAudioRec = null;');
    expect(game).toContain('dbg.__swMapDebug = null;');
    expect(game).toContain('if (dbg.__swResearch === this.research) dbg.__swResearch = null;');
    expect(game).toContain('if (dbg.__swAchievements === this.achievements) dbg.__swAchievements = null;');
  });

  it('Game.destroy 摘 memSentinel interval + 解绑 natureParticles store', () => {
    expect(game).toContain('this.memSentinelTimer');
    expect(game).toContain('clearInterval(this.memSentinelTimer)');
    expect(game).toContain('natureParticles.unbindStore();');
  });

  it('Game.destroy terminate 本实例 worldGen worker（跨局 isolate 滞留）', () => {
    expect(game).toContain('this.genClient?.terminate();');
  });

  it('NatureParticles 提供 unbindStore（st 旧 TileStore 解绑）', () => {
    const np = read('src/render/NatureParticles.ts');
    expect(np).toContain('unbindStore(): void');
  });

  it('Renderer.dispose 摘 GPU 看门狗 interval + window contextlost 哨兵（闭包持 Renderer→world.store）', () => {
    const rd = read('src/render/Renderer.ts');
    expect(rd).toContain('this.gpuWatchdogTimer');
    expect(rd).toContain('clearInterval(this.gpuWatchdogTimer)');
    // ★BJ318 残锚定谳：window contextlost 哨兵 onLost 闭包捕获 Renderer,
    // dispose 不摘=退世界死 Renderer 岛永久滞留（WeakRef 二分实测）
    expect(rd).toContain('this.gpuSentinelRemove?.()');
    expect(rd).toMatch(/dispose\(\): void [\s\S]*gpuSentinelRemove\?\.\(\)[\s\S]*removeEventListener\('resize'/);
  });

  it('mainFlow.quitToMenu 拆住房面板 + 收 flowGenClient worker', () => {
    const mf = read('src/mainFlow.ts');
    expect(mf).toContain('__swHousingPanel = null');
    expect(mf).toContain('flowGenClient?.terminate();');
  });

  it('WaterWaves worker 上下文禁 fork（C8 叉炸弹修复双保险锚定）', () => {
    const ww = read('src/render/WaterWaves.ts');
    // ①旗表达式：无 document 恒 false（worker 上下文）
    expect(ww).toContain("if (typeof document === 'undefined') return false;");
    // ②_wwEnsure 双保险：worker 上下文永不 spawn
    expect(ww).toContain("if (typeof document === 'undefined') { this._wwSpawned = true; return; }");
  });

  it('读档 OOM 文案接线（worker 分配失败→可操作提示）', () => {
    const mf = read('src/mainFlow.ts');
    expect(mf).toContain('isOomLoadError');
    expect(mf).toContain('Mods.SandboxWorld.Toast.LoadOom');
  });
});
