// ★②-F4 难度曲线构造期 f32 预折钉测（2026-09-01 五轮轻验证收口批）——
// 权威：Terarria1457/Terraria.DataStructures/GameDifficultyData.cs（Key(float,float)
// 构造即 (float) 舍入，Sample 全程 float 域）。
// 背景：旧形态把 raw double 写进表、采样期才对差值 fround——在含非精确字面量的
// 曲线上倒置「构造舍入」与「差值舍入」次序。影响面逐曲线核算（difficulty 网格
// 1..4 步长 0.0025）：
//   ENEMY_MAX_LIFE / ENEMY_DAMAGE / HOSTILE_PROJECTILE / MONEY / TOWN_NPC：
//     折前折后逐点 bit 相等（字面量均精确或双邻舍入同槽）；
//   KNOCKBACK_TO_ENEMIES_MULTIPLIER：上限 |Δ|=5.9604644775390625e-8（0.8f 邻位差），
//     num2 = −0.19999998807907104（新/真）vs −0.20000000298023224（旧）——任务单
//     点名的「2.75 轴 −0.20000000…2 之别」；
//   LightningPlayerDamageScaling（proj1457.ts 第七表）：上限 |Δ|=2.980232e-8 且
//     Legendary(4) 段存在 (int)(dmg×Sample) 截断翻档组（dmg=5k k∈N⁺：旧 1 → 新 2），
//     预折后与 C# 一致。
import { describe, it, expect } from 'vitest';
import {
  f32, sampleCurve, GDL, curveKey,
  ENEMY_MAX_LIFE_MULTIPLIER, ENEMY_DAMAGE_MULTIPLIER,
  HOSTILE_PROJECTILE_DAMAGE_MULTIPLIER, KNOCKBACK_TO_ENEMIES_MULTIPLIER,
  ENEMY_MONEY_DROP_MULTIPLIER, TOWN_NPC_DAMAGE_MULTIPLIER,
} from '../src/stats/ScaleStats';
import { LIGHTNING_PLAYER_DAMAGE_SCALING } from '../src/entities/proj1457';

/** 旧形态参考实现（raw double 表 + 采样期 fround 差值）——反证护栏用 */
function legacySample(rawKeys: readonly { input: number; output: number }[], value: number): number {
  let key = rawKeys[0]!;
  let key2 = key;
  for (let i = 0; i < rawKeys.length; i++) {
    key2 = rawKeys[i]!;
    if (value <= key2.input) break;
    key = key2;
  }
  const num = f32(key2.input - key.input);
  const num2 = f32(key2.output - key.output);
  if (num === 0) return key.output;
  return f32(f32(f32(value - key.input) * num2) / num + key.output);
}

describe('★②-F4 构造期预折：表值即 f32 物化终值', () => {
  it('curveKey 物化语义 + 七表键值逐键 f32 位相等', () => {
    expect(curveKey(GDL.MASTER, 0.8)).toEqual({ input: 3, output: Math.fround(0.8) });
    const tables = [
      ENEMY_MAX_LIFE_MULTIPLIER, ENEMY_DAMAGE_MULTIPLIER, HOSTILE_PROJECTILE_DAMAGE_MULTIPLIER,
      KNOCKBACK_TO_ENEMIES_MULTIPLIER, ENEMY_MONEY_DROP_MULTIPLIER, TOWN_NPC_DAMAGE_MULTIPLIER,
      LIGHTNING_PLAYER_DAMAGE_SCALING,
    ];
    for (const t of tables) {
      for (const k of t) {
        expect(k.input).toBe(Math.fround(k.input));
        expect(k.output).toBe(Math.fround(k.output));
      }
    }
  });

  it('Knockback 实证组：0.8f−1 的 float 域直差（禁 double 直差再折的反向邻居）', () => {
    // C# float 域直差 = -0.19999998807907104；double 直差再 fround = -0.20000000298023224
    // （二者是 0.2 区间的两个相邻 f32 邻居——存表面预折后差值自然落在真值邻位）
    const foldedNum2 = f32(Math.fround(0.8) - 1);
    const legacyNum2 = f32(0.8 - 1);
    expect(foldedNum2).toBe(-0.19999998807907104);
    expect(legacyNum2).toBe(-0.20000000298023224);            // 反证：旧行为确曾取错邻居
    expect(foldedNum2).not.toBe(legacyNum2);
  });

  it('★2.75 轴钉死：sampleCurve(KNOCKBACK,2.75)=0.8250000476837158（旧 0.8249999880790710 退役）', () => {
    expect(sampleCurve(KNOCKBACK_TO_ENEMIES_MULTIPLIER, 2.75)).toBe(0.8250000476837158);
    // 反证护栏：raw double 存表的 legacy 形态在该轴给出另一位邻居
    const rawKB = [{ input: GDL.CLASSIC, output: 1 }, { input: GDL.MASTER, output: 0.8 }];
    expect(legacySample(rawKB, 2.75)).toBe(0.82499998807907104492);
  });

  it('既有消费方断言适配复核：Expert/Master 锚不变（0.9/0.8）且 kbResist 终值乘积位等', () => {
    expect(sampleCurve(KNOCKBACK_TO_ENEMIES_MULTIPLIER, GDL.CLASSIC)).toBeCloseTo(1, 6);
    expect(sampleCurve(KNOCKBACK_TO_ENEMIES_MULTIPLIER, GDL.EXPERT)).toBeCloseTo(0.9, 6);
    expect(sampleCurve(KNOCKBACK_TO_ENEMIES_MULTIPLIER, GDL.MASTER)).toBeCloseTo(0.8, 6);
    // 大师档锚乘积：kbResist 0.45 × sample(bit 级与 C# 同) —— ScaleStats 消费链同源
    expect(f32(0.45 * sampleCurve(KNOCKBACK_TO_ENEMIES_MULTIPLIER, GDL.EXPERT))).toBeCloseTo(0.40499997, 6);
    expect(f32(0.45 * sampleCurve(KNOCKBACK_TO_ENEMIES_MULTIPLIER, GDL.MASTER))).toBeCloseTo(0.36, 6);
  });

  it('零位移五表逐点核算（网格 1..4 步长 0.00025）：折前 legacy 形态逐位相等', () => {
    const raws = new Map<readonly { input: number; output: number }[], readonly { input: number; output: number }[]>([
      [ENEMY_MAX_LIFE_MULTIPLIER, [{ input: GDL.JOURNEY, output: 0.5 }, { input: GDL.LEGENDARY, output: 4 }]],
      [ENEMY_DAMAGE_MULTIPLIER, [
        { input: GDL.JOURNEY, output: 0.5 }, { input: GDL.MASTER, output: 3 },
        { input: GDL.LEGENDARY, output: 5.3333335 }]],
      [HOSTILE_PROJECTILE_DAMAGE_MULTIPLIER, [{ input: GDL.JOURNEY, output: 0.5 }, { input: GDL.MASTER, output: 3 }]],
      [ENEMY_MONEY_DROP_MULTIPLIER, [
        { input: GDL.CLASSIC, output: 1 }, { input: GDL.EXPERT, output: 2.5 },
        { input: GDL.MASTER, output: 2.5 }, { input: GDL.LEGENDARY, output: 3.5 }]],
      [TOWN_NPC_DAMAGE_MULTIPLIER, [
        { input: GDL.JOURNEY, output: 2 }, { input: GDL.CLASSIC, output: 1 },
        { input: GDL.EXPERT, output: 1.5 }, { input: GDL.LEGENDARY, output: 2 }]],
    ]);
    let probes = 0;
    for (const [folded, raw] of raws) {
      for (let k = 4000; k <= 16000; k++) {
        const v = k / 4000;
        expect(sampleCurve(folded, v)).toBe(legacySample(raw, v));
        probes++;
      }
    }
    expect(probes).toBe(5 * 12001);
  });

  it('LightningPlayerDamageScaling：Journey 早退支直出物化值 + n×25k 截断族纠正实证', () => {
    // Sample(0.5)：首键相等段 num===0 直出 key.output —— double 存表给 0.04、
    // 物化后给 fround(0.04)=0.03999999910593033（C# Key(float,float) 构造语义）
    expect(sampleCurve(LIGHTNING_PLAYER_DAMAGE_SCALING, GDL.JOURNEY)).toBe(Math.fround(0.04));
    expect(sampleCurve(LIGHTNING_PLAYER_DAMAGE_SCALING, GDL.JOURNEY)).toBe(0.03999999910593033);
    const rawLI = [
      { input: GDL.JOURNEY, output: 0.04 }, { input: GDL.CLASSIC, output: 0.08 },
      { input: GDL.MASTER, output: 0.24 }, { input: GDL.LEGENDARY, output: 0.4 }];
    expect(legacySample(rawLI, GDL.JOURNEY)).toBe(0.04);                   // 反证旧行为
    // ★消费面吸收实证：lightningEvpFinalDamage 的 f32(f32(dmg)×Sample) 中间舍入把
    //   两形态的样本差全部吸回同格——dmg 1..100000 全轴截断零翻档（探针核算口径,
    //   witness=k×25 家族在裸积面曾呈现 ±1，经真实消费链中间 fround 后同值）
    for (const k of [25, 50, 75]) {
      const vN = Math.trunc(f32(f32(k) * sampleCurve(LIGHTNING_PLAYER_DAMAGE_SCALING, GDL.JOURNEY)));
      const vO = Math.trunc(f32(f32(k) * legacySample(rawLI, GDL.JOURNEY)));
      expect(vN).toBe(vO);                                                // 消费面同值
      if (k === 25) {
        expect(k * legacySample(rawLI, GDL.JOURNEY)).not.toBe(k * sampleCurve(LIGHTNING_PLAYER_DAMAGE_SCALING, GDL.JOURNEY));
      }
    }
    let flips = 0;
    for (const v of [GDL.JOURNEY, GDL.CLASSIC, GDL.MASTER, GDL.LEGENDARY]) {
      for (let dmg = 1; dmg <= 100000; dmg++) {
        const vo = Math.trunc(f32(f32(dmg) * legacySample(rawLI, v)));
        const vn = Math.trunc(f32(f32(dmg) * sampleCurve(LIGHTNING_PLAYER_DAMAGE_SCALING, v)));
        if (vo !== vn) flips++;
      }
    }
    expect(flips).toBe(0);
    // Legendary/Classic/Master 段无新增位移（折前折后逐点同值）
    expect(sampleCurve(LIGHTNING_PLAYER_DAMAGE_SCALING, GDL.LEGENDARY))
      .toBe(legacySample(rawLI, GDL.LEGENDARY));
    expect(sampleCurve(LIGHTNING_PLAYER_DAMAGE_SCALING, GDL.CLASSIC))
      .toBe(legacySample(rawLI, GDL.CLASSIC));
  });
});
