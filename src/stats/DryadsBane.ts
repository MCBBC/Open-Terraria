/**
 * 树妖煞（Dryad's Bane，debuff 186）DoT 每秒伤害进度链单源模块。
 *
 * 原文锚：Terarria1457/Terraria/NPC.cs:92898-92963 GetDryadsBaneDamagePerSecond
 *   （1458 同位同文逐字相同——2026-09-01 diff 实证；1456 无此方法，同链内联在
 *   DoT 更新处 Terarria1456/Terraria/NPC.cs:92852-92904，数值逐项一致）
 *   private int GetDryadsBaneDamagePerSecond()          // :92898
 *   {
 *     int num = 4;                       // :92900 基础每秒伤害
 *     float num2 = 1f;                   // :92901 进度乘区（独立 if 累加——不是
 *                                        // else-if，多个命中全部叠加、无首中即停）
 *     if (downedBoss1)      num2 += 0.1f;   // :92902-92905 克眼
 *     if (downedBoss2)      num2 += 0.1f;   // :92906-92909 世吞/克脑
 *     if (downedBoss3)      num2 += 0.1f;   // :92910-92913 骷髅王
 *     if (downedQueenBee)   num2 += 0.1f;   // :92914-92917 蜂后
 *     if (Main.hardMode)    num2 += 0.4f;   // :92918-92921
 *     if (downedQueenSlime)     num2 += 0.15f;   // :92922-92925 史莱姆皇后
 *     if (downedMechBoss1)      num2 += 0.15f;   // :92926-92929 毁灭者
 *     if (downedMechBoss2)      num2 += 0.15f;   // :92930-92933 双子魔眼
 *     if (downedMechBoss3)      num2 += 0.15f;   // :92934-92937 机械骷髅王
 *     if (downedPlantBoss)      num2 += 0.15f;   // :92938-92941 世花
 *     if (downedGolemBoss)      num2 += 0.15f;   // :92942-92945 石巨人
 *     if (downedAncientCultist) num2 += 0.15f;   // :92946-92949 拜月教主
 *     if (downedEmpressOfLight) num2 += 0.15f;   // :92950-92953 光女
 *     if (downedFishron)        num2 += 0.15f;   // :92954-92957 猪鲨龙
 *     if (Main.infectedSeed) num *= 2;           // :92958-92961 ×2
 *     return GetAttackDamage_ForTownNPC((float)num * num2);   // :92962→曲线 :7089
 *   }
 * 消费端：DoT 记账 NPC.cs:92797-92801 `none.Add(dps*2, dps/3)` = dps HP/s；
 * 施加端 Projectile.cs:41967-41970（弹 586 AI_111 else-if 臂，树妖祝福光环）。
 *
 * ★与 AI_007 城镇 NPC 自卫攻击的进度强化链（TownNpcProgressionBoost，
 *   NPC.cs:53400-53557 → stats 侧 TownNPC.townNpcProgressionBoost）是两条不同的链：
 *   本链【没有】combatBook/史莱姆王/鹿角兔/tipsy/skyblock 条目，首段四项是 +0.1
 *   （自卫链是 +0.05/+0.1/+0.15 混档）。2026-09-01 前 TownNPC.updateDryadWardAura
 *   曾误接 townNpcProgressionBoost().damageMul：战斗书世界 dps 多算 +50%（双书）、
 *   各旗标错档——本模块即翻正载体。消费端只显式挑取下列字段，防再串链。
 *
 * ★float32 保真（禁近似）：C# num2 为 float，每个 += 都在 float32 上舍入；JS 双精度
 *   直算会在约 17% 的旗标组合上把截断 dps 偏掉一档（实证组合 boss1+hardMode+
 *   queenSlime+mech1+mech2+mech3+plant：float32 链恰为 2.25f → ×4=9.000000→(int)=9；
 *   double 直算 2.2499999999999996 → ×4=8.999999…→(int)=8）。故逐项 Math.fround。
 */

import { f32, getAttackDamageForTownNPC } from './ScaleStats';

/** GetDryadsBaneDamagePerSecond 的进度链输入。缺省字段 = 原版静态位默认 false
 *  （成员格式镜像 townNpcProgressionFromWorld 的命名域，但仅列原文本链所读的旗标；
 *  infectedSeed 本仓来源 = world.seedFlags.infectedSeed（"purify this" 种子） */
export interface DryadsBaneProgress {
  downedBoss1?: boolean;          // 克眼（NPC.downedBoss1 :6262）
  downedBoss2?: boolean;          // 世吞 13 / 克脑 266（:6264）
  downedBoss3?: boolean;          // 骷髅王（:6266）
  downedQueenBee?: boolean;       // 蜂后（:6268）
  hardMode?: boolean;             // Main.hardMode（肉山 → StartHardmode :80286）
  downedQueenSlime?: boolean;     // 史莱姆皇后（:6312）
  downedMechBoss1?: boolean;      // 毁灭者（:6340）
  downedMechBoss2?: boolean;      // 双子魔眼 125/126（:6342）
  downedMechBoss3?: boolean;      // 机械骷髅王（:6344）
  downedPlantBoss?: boolean;      // 世花（:6280）
  downedGolemBoss?: boolean;      // 石巨人（:6282）
  downedAncientCultist?: boolean; // 拜月教主（:6298）
  downedEmpressOfLight?: boolean; // 光女（:6310）
  downedFishron?: boolean;        // 猪鲨龙（:6286）
  infectedSeed?: boolean;         // Main.infectedSeed（Main.cs:350；WorldGen.cs:561）
}

const ADD_010 = f32(0.1);   // 首段四王档 0.1f（float32 字面量值 0.100000001490116…）
const ADD_040 = f32(0.4);   // 困难模式大档 0.4f
const ADD_015 = f32(0.15);  // 其余诸王档 0.15f

/** 进度乘区 num2（:92899 起独立 if 累加；float32 逐步舍入，与原文操作序逐位一致）。
 *  单独导出供表测逐项断言（非消费面必需）。 */
export function dryadsBaneMultiplier(p: DryadsBaneProgress): number {
  let num2 = 1;                              // num2 = 1f（:92901）
  if (p.downedBoss1) num2 = f32(num2 + ADD_010);          // :92902-92905
  if (p.downedBoss2) num2 = f32(num2 + ADD_010);          // :92906-92909
  if (p.downedBoss3) num2 = f32(num2 + ADD_010);          // :92910-92913
  if (p.downedQueenBee) num2 = f32(num2 + ADD_010);       // :92914-92917
  if (p.hardMode) num2 = f32(num2 + ADD_040);             // :92918-92921
  if (p.downedQueenSlime) num2 = f32(num2 + ADD_015);     // :92922-92925
  if (p.downedMechBoss1) num2 = f32(num2 + ADD_015);      // :92926-92929
  if (p.downedMechBoss2) num2 = f32(num2 + ADD_015);      // :92930-92933
  if (p.downedMechBoss3) num2 = f32(num2 + ADD_015);      // :92934-92937
  if (p.downedPlantBoss) num2 = f32(num2 + ADD_015);      // :92938-92941
  if (p.downedGolemBoss) num2 = f32(num2 + ADD_015);      // :92942-92945
  if (p.downedAncientCultist) num2 = f32(num2 + ADD_015); // :92946-92949
  if (p.downedEmpressOfLight) num2 = f32(num2 + ADD_015); // :92950-92953
  if (p.downedFishron) num2 = f32(num2 + ADD_015);        // :92954-92957
  return num2;
}

/** GetDryadsBaneDamagePerSecond 1:1（:92898-92963）：基 4（infectedSeed ×2）×
 *  进度乘区，外层 GetAttackDamage_ForTownNPC（:7089 = ×TownNPCDamageMultiplier.
 *  Sample(Main.Difficulty) 后 (int) 向零截断，复用 stats/ScaleStats 同名实现）。
 *  返回 DoT 记账用的「每秒伤害」整型（消费端 ×2 进 Tally 步长、÷3 进计数环）。 */
export function getDryadsBaneDamagePerSecond(p: DryadsBaneProgress, difficulty: number): number {
  let num = 4;                                   // num = 4（:92900）
  if (p.infectedSeed) num *= 2;                  // Main.infectedSeed ×2（:92958-92961）
  return getAttackDamageForTownNPC(f32(num * dryadsBaneMultiplier(p)), difficulty);
}
