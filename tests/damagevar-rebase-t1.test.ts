import { describe, it, expect, vi } from 'vitest';
import { toEvenRound, damageVarRoll } from '../src/stats/DamageVar';
import { Game } from '../src/core/Game';
import { ZenithSword } from '../src/entities/SwingArc';
import { SantankShellProj } from '../src/entities/Mounts';

// ★SW-T1 2026-09-04 DamageVar 全仓重基线回归：31 档离散 + float32 逐级舍入 + ToEven
// （C# (int)Math.Round 银行家）替换全仓连续内联式 `1+(rand×30−15)/100`+half-up。
// 链路用例覆盖三个实际改写文件;Arrow.ts 无 DV 内联位点（grep 命中的 :4520 是尘坐标抖动）。
const tierRnd = (t: number) => () => (t + 15.5) / 31;   // floor(rnd×31)−15 恰回该档
const mkGame = (ens: unknown[]) => ({
  playSfxFiles: () => {}, spawnDust: () => null, addLightAt: () => {}, critters: () => [], enemies: () => ens,
  player: { luck: 0, cx: -9999, cy: -9999, x: -9999, y: -9999, w: 0, h: 0, dead: false, equipStats: {} },
}) as never;

describe('SW-T1 DamageVar 重基线（31 档/float32/ToEven/luck）', () => {
  it('toEvenRound = C# ToEven：x.5 取偶（half-up 差 1 档序列）', () => {
    for (const [x, w] of [[0.5, 0], [1.5, 2], [2.5, 2], [3.5, 4], [4.5, 4], [52.5, 52], [84.5, 84], [85.5, 86]] as const)
      expect(toEvenRound(x)).toBe(w);
    expect(toEvenRound(84.999)).toBe(85);   // 非中点照常 ceil 方向
  });
  it('31 档离散：全档扫描输出恰 31 个整值且恒 ≤115;float32 中点案对原版', () => {
    const outs = new Set<number>();
    for (let t = -15; t <= 15; t++) { const v = damageVarRoll(100, 0, tierRnd(t)); outs.add(v); expect(v).toBeGreaterThanOrEqual(85); }
    expect(outs.size).toBe(31);
    // 原版 float32 真值锚（Main.cs:67103 逐级 f32 舍入;double 直算会得 55/29/32;
    // SW-X1 2026-09-04 引注勘误,曾 :67102）
    expect(damageVarRoll(50, 0, tierRnd(9))).toBe(54); expect(damageVarRoll(25, 0, tierRnd(14))).toBe(28);
    expect(damageVarRoll(30, 0, tierRnd(5))).toBe(31);
  });
  it('luck 方向：>0 重掷取 max（利玩家弹）/<0 取 min/luck=0 恰一掷', () => {
    expect(damageVarRoll(100, 0.99, () => 0.999)).toBe(115);
    expect(damageVarRoll(100, -1, () => 0)).toBe(85);
    let calls = 0; damageVarRoll(100, 0, () => { calls++; return 0.5; }); expect(calls).toBe(1);
  });
  it('链路① Game.explodeNpcDamageChain：DV 单源在 1002 半伤【前】,luck 重掷可达链内', () => {
    let i = 0; const seq = () => [0.5, 0.1, 0][i++ % 3];          // 主档 0→100,门过,重掷 −15→85,max=100
    expect(Game.explodeNpcDamageChain({ projId: 1002, npcType: 0, damage: 100, luck: 1, bannerMult: 1, expertMode: false, rnd: seq })).toBe(50);
    let j = 0; const seqMin = () => [0, 0.1, 0.9999999][j++ % 3]; // min(85,115)=85 → trunc/2=42
    expect(Game.explodeNpcDamageChain({ projId: 1002, npcType: 0, damage: 100, luck: -1, bannerMult: 1, expertMode: false, rnd: seqMin })).toBe(42);
  });
  it('链路② Mounts 圣坦炮弹爆散 NPC 面：DV(luck 正向)在 banner 前（rand=0.9→+12 档 100→112）', () => {
    const seen: number[] = [];
    const ens = [{ x: 980, y: 980, w: 40, h: 40, dead: false, id: 1, hurt: (d: number) => { seen.push(d); return true; } }];
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    try { (new SantankShellProj(1000, 1000, 0, 0, 100, 8, 930) as unknown as { explode: (g: never) => void }).explode(mkGame(ens)); }
    finally { rand.mockRestore(); }
    expect(seen).toEqual([112]);
  });
  it('链路③ SwingArc 天顶剑终弹 933：命中 DV luck 正向 31 档（rand=0.9→+12 档 50→56,crit 不中）', () => {
    const seen: Array<[number, boolean]> = []; const ens: unknown[] = [];
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.9);   // 构造前钉 ai0=80+命中掷
    try {
      const arc = new ZenithSword({ cx: 1020, cy: 1020, x: 1020, y: 1020 } as never, 1022, 1022, 50, 0, 6.5);
      const step = (arc as unknown as { step: (g: never) => void }).step;
      step.call(arc, mkGame(ens));                           // 探步（空表不命中）→ 读轨道位姿
      (arc as unknown as { counter: number }).counter = 0;   // 重放同参位姿
      ens.push({ x: arc.cx - 20, y: arc.cy - 20, w: 40, h: 40, dead: false, id: 7,
        hurt: (d: number, _kx: number, _ky: number, _ga: unknown, _pen: number, crit: boolean) => { seen.push([d, crit]); return true; } });
      step.call(arc, mkGame(ens));
    } finally { rand.mockRestore(); }
    expect(seen).toEqual([[56, false]]);
  });
});
