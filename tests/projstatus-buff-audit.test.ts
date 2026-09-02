// buff 表审计批金标(2026-09-02):applyMagmaStoneProj 必中三支结构
// (StatusNPC :11529-11541:Next(7)==0→323×360t;else Next(3)==0→120t;else→60t)
// ——曾只移植第一支+落空 return=6/7 命中无 buff(近战弹幕标配,影响面最大)
import { describe, it, expect } from 'vitest';
import { applyMagmaStoneProj } from '../src/entities/projStatus';

describe('applyMagmaStoneProj 必中三支(P.cs:11529-11541)', () => {
  it('magmaStone=true:命中必上 onFire3T,时长只可能 {6,2,1}s,分布三档齐全', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 4000; i++) {
      const en: { onFire3T?: number } = {};
      applyMagmaStoneProj(true, en);
      expect(en.onFire3T).toBeDefined();                       // 必中,无空档
      expect([6, 2, 1]).toContain(en.onFire3T);
      seen.add(en.onFire3T!);
    }
    expect(seen.size).toBe(3);                                 // 三档都会出现
  });
  it('magmaStone=false:零副作用', () => {
    const en: { onFire3T?: number } = {};
    applyMagmaStoneProj(false, en);
    expect(en.onFire3T).toBeUndefined();
  });
});
