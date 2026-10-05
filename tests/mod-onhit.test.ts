// B6 mod OnHitNPC 钩(受理命中缝):注册 fail-fast + 派发命中/未注册 miss + 域外零调。
import { describe, it, expect, beforeEach } from 'vitest';
import { registerModOnHitNpc, runModOnHitNpc, registerModNpcDeath, runModOnNpcDeath, setModAudioSink, playModSound, _resetModHooksForTests } from '../src/mods/hooks';

describe('mod OnHitNPC 钩(P7 GAPS #1 收口)', () => {
  beforeEach(() => _resetModHooksForTests());

  it('注册+派发:命中 vid 调用,damage/crit/killed 透传', () => {
    const seen: Array<{ vid: number; ctx: { damage: number; crit: boolean; killed: boolean } }> = [];
    registerModOnHitNpc(30000, (e, g, ctx) => { seen.push({ vid: (e as unknown as { vid: number }).vid, ctx }); });
    const enemy = { vid: 42 };
    const game = {};
    runModOnHitNpc(30000, enemy as never, game as never, { damage: 55, crit: true, killed: false });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.vid).toBe(42);
    expect(seen[0]!.ctx).toEqual({ damage: 55, crit: true, killed: false });
  });

  it('未注册 vid/原版 vid/undefined → 零调用零异常(空表零成本门)', () => {
    registerModOnHitNpc(30000, () => { throw new Error('不应被调'); });
    expect(() => runModOnHitNpc(30001, {} as never, {} as never, { damage: 1, crit: false, killed: false })).not.toThrow();
    expect(() => runModOnHitNpc(1, {} as never, {} as never, { damage: 1, crit: false, killed: false })).not.toThrow();
    expect(() => runModOnHitNpc(undefined, {} as never, {} as never, { damage: 1, crit: false, killed: false })).not.toThrow();
  });

  it('重复注册 fail-fast;域外 vid 拒注册', () => {
    registerModOnHitNpc(30000, () => {});
    expect(() => registerModOnHitNpc(30000, () => {})).toThrow(/重复注册/);
    expect(() => registerModOnHitNpc(1, () => {})).toThrow(/≥30000/);
  });
});

describe('mod OnNpcDeath 钩(Hive Tumor→Boss 遭遇链面)', () => {
  beforeEach(() => _resetModHooksForTests());

  it('注册+派发:mod id 死亡调用;原版 id/未注册=零调', () => {
    const seen: number[] = [];
    registerModNpcDeath(800, (e) => { seen.push((e as unknown as { vid: number }).vid); });
    runModOnNpcDeath(800, { vid: 7 } as never, {} as never);
    expect(seen).toEqual([7]);
    runModOnNpcDeath(1, { vid: 1 } as never, {} as never);       // 原版域
    runModOnNpcDeath(801, { vid: 2 } as never, {} as never);     // 未注册 mod id
    runModOnNpcDeath(null, { vid: 3 } as never, {} as never);
    expect(seen).toEqual([7]);
    expect(() => registerModNpcDeath(800, () => {})).toThrow(/重复注册/);   // fail-fast
  });
});

describe('mod 音效通道(sw.playSound)', () => {
  it('sink 派发:未注 sink 零异常;注入后透传 files/volume/坐标', () => {
    expect(() => playModSound(['NPC_Hit_1'], 1, 0, 0)).not.toThrow();   // 无 sink=静默
    const calls: Array<{ files: string[]; v: number; x?: number; y?: number }> = [];
    setModAudioSink((files, v, x, y) => { calls.push({ files, v, x, y }); });
    playModSound(['Item_74'], 0.8, 100, 200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.files).toEqual(['Item_74']);
    expect(calls[0]!.v).toBe(0.8);
    expect(calls[0]!.x).toBe(100);
  });
});
