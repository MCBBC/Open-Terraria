// StatusNPC 命中 debuff 表(applyProjStatus)映射与概率语义
import { describe, it, expect, vi } from 'vitest';
import { applyProjStatus } from '../src/entities/projStatus';

describe('applyProjStatus(StatusNPC 表驱动)', () => {
  it('35 阳炎之怒:50% 概率 OnFire 300t=5s', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.49); // < 0.5 命中
    const e: Record<string, number> = {};
    applyProjStatus(35, e);
    expect(e.onFireT).toBe(5);
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // ≥ 0.5 落空
    const e2: Record<string, number> = {};
    applyProjStatus(35, e2);
    expect(e2.onFireT).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('63 粉碎之锤:80% Confused 120-240t(2-4s)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.79);
    const e: Record<string, number> = {};
    applyProjStatus(63, e);
    expect(e.confusedT).toBeGreaterThanOrEqual(2);
    expect(e.confusedT).toBeLessThanOrEqual(4);
    vi.restoreAllMocks();
  });

  it('四新系字段映射(44/153/323/324/204)与 max 合并', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const e: Record<string, number> = { frostburnT: 1 };
    applyProjStatus(172, e);   // 172 = 1/3 Frostburn 180t=3s
    expect(e.frostburnT).toBe(3); // max 合并(1 → 3)
    const e2: Record<string, number> = {};
    applyProjStatus(309, e2);  // Frostburn2 300t=5s
    expect(e2.frostburn2T).toBe(5);
    const e3: Record<string, number> = {};
    applyProjStatus(295, e3);  // OnFire3 480-900t
    expect(e3.onFire3T).toBeGreaterThanOrEqual(8);
    const e4: Record<string, number> = {};
    applyProjStatus(46, e4);   // ShadowFlame 240-299t
    expect(e4.shadowFlameT).toBeGreaterThanOrEqual(4);
    vi.restoreAllMocks();
  });

  it('163 族互斥双分支(mut):单掷骰 r<1/3→600t,r∈[1/3,1)→300t,必中其一', () => {
    const pick = (r: number): number => {
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const e: Record<string, number> = {};
      applyProjStatus(163, e);
      vi.restoreAllMocks();
      return e.onFireT ?? 0;
    };
    expect(pick(0.3)).toBe(10); // 600t=10s
    expect(pick(0.9)).toBe(5);  // 300t=5s
    expect(pick(0.999)).toBe(5); // 必中其一(互斥组无全落空)
  });

  it('504 外层门×互斥:1/2 落空,r∈[0.5,2/3)→323 60-239t,≥2/3→60-119t', () => {
    const pick = (r: number): number => {
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const e: Record<string, number> = {};
      applyProjStatus(504, e);
      vi.restoreAllMocks();
      return e.onFire3T ?? 0;
    };
    // 累积区间:A(60-239t)=[0,1/6) B(60-119t)=[1/6,1/2) 其余落空
    // (mock 单值=外层/内层掷骰同值:0.1→A,0.4→B,0.7→全落空)
    expect(pick(0.1)).toBeGreaterThanOrEqual(1); // A:长 DoT 60-239t(≥1s)
    expect(pick(0.4)).toBeGreaterThan(1);    // B:短 DoT 60-119t
    expect(pick(0.7)).toBe(0);               // 落空
  });
});
