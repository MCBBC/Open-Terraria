// 甲虫 buff 族 + 环境光环五缺口补图（2026-08-31 实装批）的纯逻辑面测试。
// 原版权威：Player.cs:10430-10531（两族效果循环）/ :16615-16697（两臂授予）/
// :19922-19946+:20221-20232（强风推力）/ BuffID.cs:343-353（内部名）。
import { describe, it, expect } from 'vitest';
import { BeetleMeter } from '../src/player/BeetleMeter';
import { windPushImpulse } from '../src/entities/Player';
import { BuffType, BUFF_DEFS, buffTypeByVanilla } from '../src/stats/Buffs';

// ---- 风推脉冲（:19922-19940 逐系数） ----
describe('MightyWind windPushImpulse', () => {
  it('微风基速 = sign×0.06', () => {
    expect(windPushImpulse(0.3, false, false)).toBeCloseTo(0.06, 10);
    expect(windPushImpulse(-0.3, false, false)).toBeCloseTo(-0.06, 10);
  });
  it('强风(|wind|>0.5) ×1.37', () => {
    expect(windPushImpulse(0.8, false, false)).toBeCloseTo(0.06 * 1.37, 10);
  });
  it('腾空 ×1.5', () => {
    expect(windPushImpulse(0.8, true, false)).toBeCloseTo(0.06 * 1.37 * 1.5, 10);
  });
  it('持方向键 ×0.8 且钳 ±0.072（:19936-19939）', () => {
    // 强风腾空持键：0.1233×0.8=0.09864 → 钳到 0.072
    expect(windPushImpulse(0.8, true, true)).toBeCloseTo(0.072, 10);
    // 微风持键：0.06×0.8=0.048 不触钳
    expect(windPushImpulse(0.3, false, true)).toBeCloseTo(0.048, 10);
    expect(windPushImpulse(-0.8, true, true)).toBeCloseTo(-0.072, 10);
  });
});

// ---- 甲虫 buff 钉值/换档/换族/衰减（BeetleMeter.pinBuffs） ----
interface FakeBuffs {
  applied: Array<[BuffType, number]>;
  removed: BuffType[];
  live: Map<BuffType, number>;
}
function fakeBuffs(): FakeBuffs & { apply(t: BuffType, s: number): void; remove(t: BuffType): void } {
  const f = { applied: [] as Array<[BuffType, number]>, removed: [] as BuffType[], live: new Map<BuffType, number>() };
  return {
    ...f,
    apply(t: BuffType, s: number) { f.applied.push([t, s]); f.live.set(t, s); },
    remove(t: BuffType) { f.removed.push(t); f.live.delete(t); },
  };
}

describe('BeetleMeter buff 钉值管道', () => {
  it('猛攻族蓄能爬档 → 钉 98/99/100 当档 5/60 秒,非当档立删', () => {
    const fb = fakeBuffs();
    const host = { beetleOrbs: 0, buffs: fb };
    const m = new BeetleMeter();
    m.registerHit(500, true);
    m.tick(host, true, false);
    expect(host.beetleOrbs).toBe(1);
    expect(fb.live.get(BuffType.BeetleMight1)).toBeCloseTo(5 / 60, 10);
    expect(fb.live.has(BuffType.BeetleMight2)).toBe(false);
    m.registerHit(5000, true);   // 500+5000=5500 跨过 400+1200+3600 = 5200 → 3 档
    m.tick(host, true, false);
    expect(host.beetleOrbs).toBe(3);
    expect(fb.live.get(BuffType.BeetleMight3)).toBeCloseTo(5 / 60, 10);
    expect(fb.live.has(BuffType.BeetleMight1)).toBe(false);   // 换档立删旧档（:16686-16696）
  });

  it('换族：猛攻→防御当帧剥 98-100 挂 95-97（:10434-10452 守卫）', () => {
    const fb = fakeBuffs();
    const host: { beetleOrbs: number; buffs: ReturnType<typeof fakeBuffs> } = { beetleOrbs: 0, buffs: fb };
    const m = new BeetleMeter();
    m.tick(host, true, false);       // 猛攻在身一拍（置家族记忆；counter0 → orbs 0）
    host.beetleOrbs = 2;             // 模拟既有球数
    m.tick(host, false, true);       // 换防御甲：防御臂 counter++ 未满 180,球数不变
    expect(host.beetleOrbs).toBe(2);
    expect(fb.live.has(BuffType.BeetleMight2)).toBe(false);
    expect(fb.live.get(BuffType.BeetleEndurance2)).toBeCloseTo(5 / 60, 10);
  });

  it('断供衰减窗不换族、orbs 归零即全剥（:10453-10459 守卫面）', () => {
    const fb = fakeBuffs();
    const host = { beetleOrbs: 0, buffs: fb };
    const m = new BeetleMeter();
    m.registerHit(500, true);
    m.tick(host, true, false);       // orbs=1,家族=猛攻
    expect(fb.live.get(BuffType.BeetleMight1)).toBeCloseTo(5 / 60, 10);
    m.tick(host, false, false);      // 双套离身第 1 tick：衰减窗内仍钉猛攻一档
    expect(host.beetleOrbs).toBe(1);
    expect(fb.live.get(BuffType.BeetleMight1)).toBeCloseTo(5 / 60, 10);
    expect(fb.live.has(BuffType.BeetleEndurance1)).toBe(false);
    for (let i = 0; i < 4; i++) m.tick(host, false, false);
    expect(host.beetleOrbs).toBe(0);   // 5t 维持窗走完（orbLife）
    expect(fb.live.has(BuffType.BeetleMight1)).toBe(false);
  });

  it('裸宿主（无 buffs）不炸——blue-r2 既有用例形态兼容', () => {
    const host = { beetleOrbs: 0 };
    const m = new BeetleMeter();
    expect(() => m.tick(host, true, false)).not.toThrow();
    expect(host.beetleOrbs).toBe(1);
  });
});

// ---- 原版 id 映射（BUFF_DEFS.vanillaBuff ↔ 反查桥） ----
describe('甲虫/光环五缺口 原版 id 映射', () => {
  it('甲虫六档 vanillaBuff = 95..100（BuffID.BeetleEndurance1..3/BeetleMight1..3）', () => {
    expect(BUFF_DEFS[BuffType.BeetleEndurance1].vanillaBuff).toBe(95);
    expect(BUFF_DEFS[BuffType.BeetleEndurance2].vanillaBuff).toBe(96);
    expect(BUFF_DEFS[BuffType.BeetleEndurance3].vanillaBuff).toBe(97);
    expect(BUFF_DEFS[BuffType.BeetleMight1].vanillaBuff).toBe(98);
    expect(BUFF_DEFS[BuffType.BeetleMight2].vanillaBuff).toBe(99);
    expect(BUFF_DEFS[BuffType.BeetleMight3].vanillaBuff).toBe(100);
  });
  it('光环五缺口 vanillaBuff = 86/89/147/194/350 且反查桥贯通', () => {
    expect(BUFF_DEFS[BuffType.WaterCandle].vanillaBuff).toBe(86);
    expect(BUFF_DEFS[BuffType.HeartLamp].vanillaBuff).toBe(89);
    expect(BUFF_DEFS[BuffType.MonsterBanner].vanillaBuff).toBe(147);
    expect(BUFF_DEFS[BuffType.WindPushed].vanillaBuff).toBe(194);
    expect(BUFF_DEFS[BuffType.ShadowCandle].vanillaBuff).toBe(350);
    expect(buffTypeByVanilla(194)).toBe(BuffType.WindPushed);
    expect(buffTypeByVanilla(350)).toBe(BuffType.ShadowCandle);
  });
});
