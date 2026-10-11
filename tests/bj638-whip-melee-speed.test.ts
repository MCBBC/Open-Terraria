// BJ638 鞭攻速馈入（2026-10-11,用户实报：+70% 近战攻速饰品下鞭用时 27≡27 tick 全免疫）
//  权威：Terarria1457/Terraria/Player.cs:29253-29262（CapAttackSpeeds——summonerWeaponSpeedBonus
//  = TurnAttackSpeedToUseTimeMultiplier(meleeSpeed + swb)：装备近战攻速与鞭 buff 在取倒数
//  【前】加算合流）+ :4461（ApplyItemAnimation 鞭支 SetItemAnimation(useAnimation,
//  summonerWeaponSpeedBonus × whipUseTimeMultiplier)）+ :4445（val=(int)(base×mult) 截断）
//  + Terraria.DataStructures/ArmorSetBonuses.cs:120-127（ObsidianOutlaw：whipUseTimeMultiplier
//  ×= 1/1.15 乘在用时倍率上）+ Projectile.cs:49219-49221（GetWhipSettings timeToFlyOut =
//  itemAnimationMax × MaxUpdates）+ :10200-10208（buff 311 +0.35 / 308 +0.25 / 314 +0.12）。
//  旧式 1+swb×whipSpd 双债：漏 meleeSpeed（鞭对攻速饰品全免疫）+ whipSpd 错乘 buff 和。
import { describe, it, expect } from 'vitest';
import { WhipProj, whipUseTimeFold } from '../src/entities/WhipProj';
import type { Player } from '../src/entities/Player';

describe('whipUseTimeFold（Player.cs:29253-29262 + :4461 合流式）', () => {
  it('无攻速无 buff 恒 1（鞭用时不变——中性面）', () => {
    expect(whipUseTimeFold(1, 0, 1)).toBe(1);
  });

  it('+70% 近战攻速（attackSpeedMult=1/1.7）→ 用时倍率 1/1.7（鞭吃攻速饰品=本案主诉）', () => {
    expect(whipUseTimeFold(1 / 1.7, 0, 1)).toBeCloseTo(1 / 1.7, 12);
  });

  it('鞭 buff 与攻速【加算】合流：1/1.7 速度 + 黑收成 0.35 → 1/2.05（:29257 num + swb）', () => {
    expect(whipUseTimeFold(1 / 1.7, 0.35, 1)).toBeCloseTo(1 / 2.05, 12);
    // 无攻速只有 buff：1/(1+0.35)（meleeSpeed 基线 1,与旧式同值——buff 面回归零漂移）
    expect(whipUseTimeFold(1, 0.35, 1)).toBeCloseTo(1 / 1.35, 12);
    expect(whipUseTimeFold(1, 0.35 + 0.25 + 0.12, 1)).toBeCloseTo(1 / 1.72, 12);   // 三鞭全开
  });

  it('封顶 3 且单调：速度面 5 → 1/3；5+0.35 先加后封 = 先封后加同值 1/3', () => {
    expect(whipUseTimeFold(1 / 5, 0, 1)).toBeCloseTo(1 / 3, 12);
    expect(whipUseTimeFold(1 / 5, 0.35, 1)).toBeCloseTo(1 / 3, 12);
  });

  it('黑曜套 whipSpd=1/1.15 乘【用时倍率】整体（ArmorSetBonuses.ObsidianOutlaw :124-126）', () => {
    expect(whipUseTimeFold(1, 0, 1 / 1.15)).toBeCloseTo(1 / 1.15, 12);
    // 与旧式分野：黑曜套+黑收成 = (1/1.15)/1.35,非 1/(1+0.35×(1/1.15))
    expect(whipUseTimeFold(1, 0.35, 1 / 1.15)).toBeCloseTo((1 / 1.15) / 1.35, 12);
  });

  it('Weak 减速（attackSpeedMult=1/0.949）→ 用时倍率 >1 变慢（方向双向正确）', () => {
    expect(whipUseTimeFold(1 / 0.949, 0, 1)).toBeCloseTo(1 / 0.949, 12);
  });

  it('桩面 attackSpeedMult=0 → 1 兜底（BJ175 ?? 防御同款）', () => {
    expect(whipUseTimeFold(0, 0, 1)).toBe(1);
  });
});

describe('WhipProj.anim = itemAnimationMax（:4445 截断 + :49220 timeToFlyOut 源）', () => {
  const OW = (o: Record<string, unknown> | null) =>
    (() => o) as unknown as () => Player | null;   // 鸭子型 owner（batch-c-1457 mock 同形）

  it('+70% 攻速：30 → floor(30×(1/1.7)) = 17（原版 (int) 截断,非 round）', () => {
    const w = new WhipProj(0, 0, 0, 914, 4913, 10, 1.5, 30, 4,
      OW({ attackSpeedMult: 1 / 1.7, whipBuffs: {}, equipStats: {} }));
    expect(w.anim).toBe(17);
  });

  it('黑收成 buff + 70% 攻速：floor(30×(1/2.05)) = 14（加算合流,非旧式 1+swb）', () => {
    const w = new WhipProj(0, 0, 0, 914, 4913, 10, 1.5, 30, 4,
      OW({ attackSpeedMult: 1 / 1.7, whipBuffs: { 311: 180 }, equipStats: {} }));
    expect(w.anim).toBe(14);
  });

  it('黑曜套+黑收成（无攻速）：floor(30×(1/1.15)/1.35) = 19（旧式 = 23,变快方向纠正）', () => {
    const w = new WhipProj(0, 0, 0, 914, 4913, 10, 1.5, 30, 4,
      OW({ attackSpeedMult: 1, whipBuffs: { 311: 180 }, equipStats: { whipSpd: 1 / 1.15 } }));
    expect(w.anim).toBe(19);
  });

  it('黑曜套单独（无 buff 无攻速）：floor(30×(1/1.15)) = 26——套装终于生效（旧式恒 30）', () => {
    const w = new WhipProj(0, 0, 0, 914, 4913, 10, 1.5, 30, 4,
      OW({ attackSpeedMult: 1, whipBuffs: {}, equipStats: { whipSpd: 1 / 1.15 } }));
    expect(w.anim).toBe(26);
  });

  it('owner null / 空 mock：anim = 30 中性（鸭子型旧 mock 零漂移）', () => {
    expect(new WhipProj(0, 0, 0, 914, 4913, 10, 1.5, 30, 4, OW(null)).anim).toBe(30);
    expect(new WhipProj(0, 0, 0, 914, 4913, 10, 1.5, 30, 4,
      OW({ attackSpeedMult: 1, whipBuffs: {}, equipStats: {} })).anim).toBe(30);
  });

  it('timeToFlyOut = itemAnimationMax × MaxUpdates（GetWhipSettings :49220）随攻速缩放', () => {
    const slow = new WhipProj(0, 0, 0, 914, 4913, 10, 1.5, 30, 4,
      OW({ attackSpeedMult: 1, whipBuffs: {}, equipStats: {} }));
    const fast = new WhipProj(0, 0, 0, 914, 4913, 10, 1.5, 30, 4,
      OW({ attackSpeedMult: 1 / 1.7, whipBuffs: {}, equipStats: {} }));
    expect(slow.timeToFlyOut).toBe(30 * 2);           // Snapthorn 无 MaxUpdates 加成档（(1)+1=2）
    expect(fast.timeToFlyOut).toBe(17 * 2);
    expect(fast.timeToFlyOut / slow.timeToFlyOut).toBeCloseTo(17 / 30, 12);   // 比值=anim 比
  });
});
