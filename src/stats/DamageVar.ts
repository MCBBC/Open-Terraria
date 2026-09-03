/**
 * ★F9（2026-08-31 蓝队三批）Main.DamageVar 单源模块。
 *
 * 原文锚：Terarria1457/Terraria/Main.cs:67097-67124
 *   public static int DamageVar(float dmg, float luck = 0f)
 *     float num = dmg * (1f + rand.Next(-15, 16) * 0.01f);
 *     if (luck > 0) { if (rand.NextFloat() < luck) { …取较大 } }
 *     else if (luck < 0 && rand.NextFloat() < -luck) { …取较小 }
 *     return (int)Math.Round(num);
 *
 * 三要素：
 *  ① 离散档 —— rand.Next(-15,16) ∈ [-15,15] 共 31 档整数乘区，非连续均匀；
 *  ② 银行家舍入 —— C# Math.Round 默认 MidpointRounding.ToEven：x.5 取偶数
 *    （2.5→2、3.5→4）。JS Math.round 是 half-up（2.5→3），中点档位差一档；
 *  ③ luck 重掷取极值 —— luck>0 时以 |luck| 概率重掷取 max、luck<0 取 min；
 *  ④ float32 域（★SW-T1 2026-09-04 补）——原版乘链逐级 float32 舍入，见 tiered。
 *
 * 调用点全景（旧实现三处形态全部收编于此）：
 *  · stats/ScaleStats.damageVar——委托到本模块（敌弹 EVP/爆炸/荆棘等既有消费面）；
 *  · Game.ts 近战挥击链（ProcessHitAgainstNPC :44654 `Main.DamageVar(damage, luck)`，
 *    曾写连续 uniform×30−15 + half-up round = 双偏差）；
 *  · PvP 近战线载伤（ItemCheck_MeleeHitPVP :44438 同式）与联机弹幕傀儡结算；
 *  · 弹侧实体结算（村正刀气 977/血舌球 524/火山爆弹 978 等——原版 Damage_PVE
 *    :12959 `int dmg = Main.DamageVar(num15, player.luck)`）。
 */

/** C# (int)Math.Round 的 MidpointRounding.ToEven 等价（输入域为正伤害值）。 */
export function toEvenRound(x: number): number {
  const fl = Math.floor(x);
  const frac = x - fl;
  if (frac > 0.5) return fl + 1;
  if (frac < 0.5) return fl;
  return fl % 2 === 0 ? fl : fl + 1;
}

/** 单次 ±15% 离散档乘积——★SW-T1 2026-09-04：float32 逐级精确化（推翻旧"double
 *  直算、不做 fround"近似）。原版全式在 float32 域：`dmg * (1f + (float)tier * 0.01f)`
 *  （Main.cs:67102），每级一次向偶舍入；double 直算在 ~0.31% 的 (base,tier) 组合
 *  （如 50×+9 档：原版 54、double 55）越中点差 ±1，违反"反编译唯一标杆"。
 *  精确性论证：tier(int,≤5bit)×f32(0.01) 双精度内精确 → fround=正确舍入的 float32
 *  乘积；1+x（x∈[0.85,1.15] float32）双精度内精确 → fround=C# float 加法；
 *  两 float32 之积 ≤48bit 双精度内精确 → fround=C# float 乘法；Math.Round 收
 *  float 加宽 double（无损）后 ToEven。 */
function tiered(base: number, rnd: () => number): number {
  const tier = Math.floor(rnd() * 31) - 15;      // rand.Next(-15,16)
  const factor = Math.fround(1 + Math.fround(tier * Math.fround(0.01)));
  return Math.fround(Math.fround(base) * factor);
}

/** Main.DamageVar 完整体。rnd 可注入确定性随机源（单测/对拍）。 */
export function damageVarRoll(base: number, luck: number, rnd: () => number = Math.random): number {
  let num = tiered(base, rnd);
  if (luck > 0) {
    if (rnd() < luck) {
      const second = tiered(base, rnd);
      if (second > num) num = second;
    }
  } else if (luck < 0 && rnd() < -luck) {
    const second = tiered(base, rnd);
    if (second < num) num = second;
  }
  return toEvenRound(num);
}
