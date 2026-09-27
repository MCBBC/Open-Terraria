// ★D类 draw 周期时钟残部重钉（2026-09-27,火焰族 TileFlames 同判例收尾批）:
//  原版 FindFrame 每 update 调一次（1457 NPC.cs:91626,tick 驱动）——owl/mimic/queenSlime/
//  ogre/696/darkMage/Deerclops 弱状态格帧机旧版每 draw 调用推进一次,rAF>60Hz（用户实报
//  120fps 火苗快一倍同源）动画加速;WoF wofDrawFrameIndex 原版即 draw 驱动（Main.cs:39089
//  DrawWOFBody 内 ++）保持不动。修=tickClockSteps 按 animT 门闸:首绘 1 步/同 tick 重入
//  零推进/跨 tick 追赶钳 3。红判别器:同 animT 重复调用帧号冻结(旧版会推进);bump animT
//  才推进。附带:vanillaFrameIdx 的 DebugReport 复算路径同 tick 重入不再污染动画状态。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { vanillaFrameIdx, tickClockSteps } from '../src/render/Renderer';
import type { Enemy } from '../src/entities/Enemy';

const ENG = readFileSync(new URL('../src/render/Renderer.ts', import.meta.url), 'utf8');

/** 最小假敌怪（vanillaFrameIdx 消费面字段;结构化构造免整链 World 装配） */
function fakeEnemy(fields: Record<string, unknown>): Enemy {
  return {
    customFrameIdx: null,
    vanilla: undefined,
    animT: 100,
    vx: 0, vy: 0,
    onGround: true,
    walkCycleT: 0,
    ai0: 0, ai1: 0, ai2: 0,
    wet: false,
    lai0: 0, lai1: 0,
    facing: 1,
    ...fields,
  } as unknown as Enemy;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('tickClockSteps 共门（纯函数契约）', () => {
  it('首绘（无 tick 记账）恒推 1 步', () => {
    expect(tickClockSteps(undefined, 0)).toBe(1);
    expect(tickClockSteps(undefined, 500)).toBe(1);
  });
  it('同 tick 重入=0 步（多 draw 每帧零推进=120fps 不加速）', () => {
    expect(tickClockSteps(100, 100)).toBe(0);
  });
  it('跨 tick=elapsed;钳 3（长停滞追赶有界,不放大 RNG 消耗）', () => {
    expect(tickClockSteps(100, 101)).toBe(1);
    expect(tickClockSteps(100, 102)).toBe(2);   // 30fps 渲染不掉速
    expect(tickClockSteps(100, 200)).toBe(3);   // 钳 3
  });
  it('animT 回拨（测试 pin）→0 步不倒退', () => {
    expect(tickClockSteps(100, 50)).toBe(0);
  });
});

describe('★D类 owl/mimic 弱状态帧机重钉（vanillaFrameIdx 路径）', () => {
  it('mimic 473（ai0=8 悬浮档）:同 tick 30 次重入帧号冻结在 3（旧版会爬到 6=120fps 加速红）', () => {
    const e = fakeEnemy({ vanillaId: 473, ai0: 8, animT: 100 });
    const frames = 14;
    const first = vanillaFrameIdx(e, frames);
    expect(first).toBe(3);
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) seen.add(vanillaFrameIdx(e, frames));
    expect(seen).toEqual(new Set([3]));           // 同 tick 重入零推进
  });

  it('mimic 跨 tick 推进:bump animT 才走格（追赶钳 3 步）', () => {
    const e = fakeEnemy({ vanillaId: 473, ai0: 8, animT: 100 });
    expect(vanillaFrameIdx(e, 14)).toBe(3);       // counter=1
    e.animT = 102;                                 // +2 tick→追赶 2 步→counter=3→帧 3
    expect(vanillaFrameIdx(e, 14)).toBe(3);
    e.animT = 106;                                 // +4 tick→钳 3 步→counter=6→帧 4
    expect(vanillaFrameIdx(e, 14)).toBe(4);
  });

  it('owl 611 站定转头:同 tick 重入帧号恒定且零 RNG 重掷（RNG 钉 0 消歧）', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0);   // rand*80=0<1→band 内必推进;重掷恒 band0
    const e = fakeEnemy({ vanillaId: 611, vx: 0, vy: 0, animT: 50 });
    const frames = 13;
    const results: number[] = [];
    for (let i = 0; i < 30; i++) results.push(vanillaFrameIdx(e, frames));
    expect(new Set(results).size).toBe(1);         // 同 tick 冻结
    const callsAfterFreeze = rnd.mock.calls.length;
    for (let i = 0; i < 20; i++) vanillaFrameIdx(e, frames);
    expect(rnd.mock.calls.length).toBe(callsAfterFreeze);   // 重入零 RNG 消耗
  });

  it('owl 跨 tick:RNG 钉 0 时 counter 逐 tick 推进→帧带轮转（非恒值）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const e = fakeEnemy({ vanillaId: 611, vx: 0, vy: 0, animT: 0 });
    const frames = 13;
    const seen = new Set<number>();
    for (let t = 1; t <= 40; t++) { e.animT = t; seen.add(vanillaFrameIdx(e, frames)); }
    expect(seen.size).toBeGreaterThanOrEqual(2);   // band0 [0,1,2,1] 每 10t 轮转
  });
});

describe('★D类 五台格帧机走 gridFrameTick 门（接线源锚）', () => {
  it('queenSlime/ogre/696/darkMage/deerclops 五调用点全部过门', () => {
    expect(ENG.match(/this\.gridFrameTick\(e,/g)?.length).toBe(5);
  });
  it('WoF wofDrawFrameIndex 保持 draw 驱动（原版 Main.cs:39089 DrawWOFBody 内 ++,不改）', () => {
    expect(ENG).toContain('let wofDrawFrameIndex = 0;');
    expect(ENG).toContain('++wofDrawFrameIndex >= 18');
  });
});
