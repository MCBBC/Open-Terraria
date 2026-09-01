// GenerationProgress 移植（GenProgress.ts）核心语义锁定：
// ① 加权账目——顺序窗口 Start/Set/End 的 doneWeight/totalWeight 收敛到 [0,1] 且末端=1；
// ② 文案粘滞——无 VAN_PASS_MESSAGE 词条的 beginVan 不改显示键（原版 Message 持久）；
// ③ 自愈——leaveSlot 把未显式 beginVan 的声明成员权重一次性补收；
// ④ 限流——makeThrottledSink 首帧/force/label 变化必达，微小抖动被抑制。
import { describe, it, expect, vi } from 'vitest';
import { GenProgress, makeThrottledSink } from '../src/world/gen/GenProgress';

describe('GenProgress 加权账目', () => {
  it('EnterSlot→beginVan/set→leaveSlot 账目收敛（末端 overall=1）', () => {
    const prog = new GenProgress(null);
    prog.totalWeight = prog.weightOf('Terrain') + prog.weightOf('Dunes') + 10;
    prog.enterSlot('原版地形', ['Reset', 'Terrain']);
    prog.beginVan('Reset');
    prog.set(0.5);
    expect(prog.overall).toBeCloseTo(0.5 * prog.weightOf('Reset') / prog.totalWeight, 9);
    prog.beginVan('Terrain');                 // 自动收 Reset 账
    prog.set(0.25);
    prog.endVan();
    // LeaveSlot 自愈：本槽已全部显式消费 → 不产生额外账
    prog.leaveSlot();
    const afterSlot1 = prog.overall;
    prog.beginTail();
    prog.set(0.5);
    prog.finish();
    expect(prog.overall).toBeLessThanOrEqual(1);
    expect(prog.overall).toBeGreaterThanOrEqual(afterSlot1);
    expect(prog.done).toBe(prog.totalWeight);
  });

  it('声明成员未消费时 leaveSlot 补收（自愈）', () => {
    const prog = new GenProgress(null);
    prog.totalWeight = prog.weightOf('Jungle') + prog.weightOf('Full Desert');
    prog.enterSlot('生物群系', ['Generate Ice Biome', 'Jungle']);   // 两个都未 begin
    prog.beginTail();                          // closeWindow 关闭空窗
    prog.finish();
    expect(prog.done).toBe(prog.totalWeight);          // TotalWeight 全部被补收
  });
});

describe('GenProgress 文案粘滞', () => {
  it('无词条的 beginVan 不覆盖显示键（原版 Message 持久语义）', () => {
    const seen: Array<string | undefined> = [];
    const prog = new GenProgress((label) => seen.push(label));
    prog.totalWeight = 100;
    prog.enterSlot('洞穴', ['Ocean Sand', 'Grass', 'Sand Patches']);
    prog.beginVan('Sand Patches');             // 有词条
    expect(seen[seen.length - 1]).toBe('WorldGeneration.SandPatches');
    prog.beginVan('Grass');                    // 无词条 → 粘滞不换字（重复上屏同键；
                                               //   省字节优化由 makeThrottledSink.lastLabel 完成）
    expect(seen[seen.length - 1]).toBe('WorldGeneration.SandPatches');
    expect((prog as unknown as { displayKey: string | null }).displayKey)
      .toBe('WorldGeneration.SandPatches');
  });
});

describe('makeThrottledSink 限流', () => {
  it('首帧/force/标签变化必达；同帧微抖被吞', () => {
    const out: Array<[string | undefined, number]> = [];
    const sink = makeThrottledSink((l, p) => out.push([l, p]));
    sink('a', 0.100, 0, false);
    sink('a', 0.101, 0.01, false);              // Δp<0.004 抑制
    sink('a', 0.105, 0.2, true);                // force 必达
    sink('b', 0.200, 0.3, false);               // 标签变化必达
    expect(out.map((x) => x[0])).toEqual(['a', 'a', 'b']);
    expect(out[1]![1]).toBe(0.105);
  });
});

describe('beginVan 声明护栏（终清零批）', () => {
  it('多成员槽内 begin 未声明成员：console.warn 告警（Dungeon 漏声明回归锁）', () => {
    const warns: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((m?: unknown) => warns.push(String(m)));
    const prog = new GenProgress(null);
    prog.totalWeight = 10;
    prog.enterSlot('生物群系', ['Slush', 'Mountain Caves', 'Beaches']);
    prog.beginVan('Slush');
    expect(warns.filter((w) => w.includes('未声明'))).toHaveLength(0);
    prog.beginVan('Dungeon');                        // ★曾漏声明的实况
    expect(warns.some((w) => w.includes('"Dungeon"') && w.includes('生物群系'))).toBe(true);
    spy.mockRestore();
  });
  it('单成员槽自动开窗不告警；已声明成员不告警', () => {
    const warns: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((m?: unknown) => warns.push(String(m)));
    const prog = new GenProgress(null);
    prog.totalWeight = 5;
    prog.enterSlot('沙丘', ['Dunes']);               // 单成员
    expect(warns).toHaveLength(0);
    prog.endVan();
    const prog2 = new GenProgress(null);
    prog2.totalWeight = 10;
    prog2.enterSlot('洞穴', ['Rock Layer Caves', 'Surface Caves']);
    prog2.beginVan('Rock Layer Caves');
    prog2.beginVan('Surface Caves');
    expect(warns).toHaveLength(0);
    spy.mockRestore();
  });
});
