// ============================================================================
// 专家/大师世界强度轴 1:1 移植（Terarria1456 ilspycmd 反编译为唯一标杆）
//   NPC.ScaleStats                    NPC.cs:18081-18105
//   NPC.ScaleStats_ByDifficulty       NPC.cs:18106-18116
//   NPC.ScaleStats_ByDifficulty_Tweaks NPC.cs:18118-18447
//   NPC.ScaleStats_ForExpertHardmode  NPC.cs:18448-18497
//   NPC.ScaleStats_ByPlayerCount      NPC.cs:18498-18659
//   GameDifficultyData.LinearCurve    GameDifficultyData.cs:16-70
//   GameDifficultyLevel               GameDifficultyLevel.cs:8-16
//   Utils.GetLerpValue/Remap          Utils.cs:283-320
//   Main.Difficulty/expertMode/masterMode  Main.cs:2760-2786
//   NPC.GetAttackDamage_ScaledByDifficulty / ForProjectiles  NPC.cs:7015-7035
//   NPC.GetNPCInvasionGroup           NPC.cs:79095-79212
//   NPCID.Sets 四张表                 NPCID.cs:4440/4771/4799/4801
//
// 消费面：Enemy.fromVanilla 造怪（对应原版 NewNPC→SetDefaults→ScaleStats，
// NPC.cs:8322/17791 两个调用点都无差别进 ScaleStats，**Boss 不豁免**——
// 仅 ScaleStats_ForExpertHardmode 对 boss 提前 return，:18471-18474）。
// 本模块纯函数化（状态全走入参/出参 bundle），世界上下文经 bindScaleStatsWorld
// 注入（Game.afterWorldLoad；对应原版 Main 静态单例）。
// ============================================================================
import type { World } from '../world/World';

// ---------------------------------------------------------------------------
// GameDifficultyLevel（GameDifficultyLevel.cs:8-16）：档位是【浮点值】不是枚举序号
//   Journey 0.5 / Classic 1 / Expert 2 / Master 3 / Legendary 4
// ---------------------------------------------------------------------------
export const GDL = {
  JOURNEY: 0.5,
  CLASSIC: 1,
  EXPERT: 2,
  MASTER: 3,
  LEGENDARY: 4,
} as const;

/** float32（C# float 字面量/强转位）。JS number 是 float64，在原版显式 (float) 处对齐 */
const f32 = (v: number): number => Math.fround(v);

/** C# Math.Round(double)（默认 MidpointRounding.ToEven 银行家舍入：.5 → 就近偶数；
 *  JS Math.round 是 .5 远离零舍入，逐半值处会差 1） */
export const roundCS = (v: number): number => {
  const f = Math.floor(v);
  const d = v - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
};

// ---------------------------------------------------------------------------
// Utils.GetLerpValue / Remap（Utils.cs:283-320，Remap 重载默认 clamped=true）
// ---------------------------------------------------------------------------
export function getLerpValue(from: number, to: number, t: number, clamped = false): number {
  if (clamped) {
    if (from < to) {
      if (t < from) return 0;
      if (t > to) return 1;
    } else {
      if (t < to) return 1;
      if (t > from) return 0;
    }
  }
  return (t - from) / (to - from);
}

/** MathHelper.Lerp（XNA：a + (b-a)*t） */
export const lerpF = (a: number, b: number, t: number): number => f32(a + f32(b - a) * t);

/** Utils.Lerp(double)（:246：a + (b-a)*t，双精度）——ByPlayerCount 的 balance 混合用 */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Utils.Remap（:313，默认 clamped=true）——float 重载入参先 (float) 对齐 */
export function remap(fromValue: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  return lerpF(f32(toMin), f32(toMax), getLerpValue(f32(fromMin), f32(fromMax), f32(fromValue), true));
}

// ---------------------------------------------------------------------------
// GameDifficultyData.LinearCurve（GameDifficultyData.cs:16-60）：
//   keys 升序；Sample 找到 value 落入的相邻键区间做线性插值，
//   ≤首键输入取首键输出、≥尾键输入取尾键输出
// ---------------------------------------------------------------------------
export interface CurveKey { input: number; output: number }

export function sampleCurve(keys: readonly CurveKey[], value: number): number {
  let key = keys[0];
  let key2 = key;
  for (let i = 0; i < keys.length; i++) {
    key2 = keys[i];
    if (value <= key2.input) break;
    key = key2;
  }
  const num = f32(key2.input - key.input);
  const num2 = f32(key2.output - key.output);
  if (num === 0) return key.output;
  return f32(f32(f32(value - key.input) * num2) / num + key.output);
}

// 六条难度曲线（GameDifficultyData.cs:62-70，键值逐项照抄）
export const ENEMY_MAX_LIFE_MULTIPLIER: readonly CurveKey[] = [
  { input: GDL.JOURNEY, output: 0.5 }, { input: GDL.LEGENDARY, output: 4 },
];
export const ENEMY_DAMAGE_MULTIPLIER: readonly CurveKey[] = [
  { input: GDL.JOURNEY, output: 0.5 }, { input: GDL.MASTER, output: 3 }, { input: GDL.LEGENDARY, output: 5.3333335 },
];
export const HOSTILE_PROJECTILE_DAMAGE_MULTIPLIER: readonly CurveKey[] = [
  { input: GDL.JOURNEY, output: 0.5 }, { input: GDL.MASTER, output: 3 },
];
export const KNOCKBACK_TO_ENEMIES_MULTIPLIER: readonly CurveKey[] = [
  { input: GDL.CLASSIC, output: 1 }, { input: GDL.MASTER, output: 0.8 },
];
export const ENEMY_MONEY_DROP_MULTIPLIER: readonly CurveKey[] = [
  { input: GDL.CLASSIC, output: 1 }, { input: GDL.EXPERT, output: 2.5 },
  { input: GDL.MASTER, output: 2.5 }, { input: GDL.LEGENDARY, output: 3.5 },
];

// ---------------------------------------------------------------------------
// Main.Difficulty / expertMode / masterMode（Main.cs:2760-2786）
//   ★ GameMode 3（旅程）**不**抬档——旅程世界的 NPC 数值=经典档；真正的旅程
//     0.5× 由 _gameModeDifficultyOverride（Main.cs:17245，旅程"给 NPC 的强度"
//     滑杆 StrengthMultiplierToGiveNPCs）注入，本仓未建模旅程能力滑杆 → 恒 null。
//   ★ getGoodWorld（for the worthy 种子）整体 +1 档（:2783-2785）——经典 FTW 世界
//     的 expertMode 即为 true，克脑 40 爬行者/饥饿者专家分支/持械僵尸全数生效。
//   我方 world.difficulty：0 经典 / 1 专家 / 2 大师 / 3 旅程（World.ts:73）。
// ---------------------------------------------------------------------------
export function mainDifficulty(world: Pick<World, 'difficulty' | 'seedFlags'> | null | undefined): number {
  let num: number = GDL.CLASSIC;
  if (world) {
    if (world.difficulty === 1) num = GDL.EXPERT;
    else if (world.difficulty === 2) num = GDL.MASTER;
    if (world.seedFlags?.getGoodWorld) num += 1;
  }
  return num;
}

/** Main.expertMode（Main.cs:2762）：Difficulty >= Expert（getGoodWorld 抬档后同样生效） */
export function mainExpertMode(world: Pick<World, 'difficulty' | 'seedFlags'> | null | undefined): boolean {
  return mainDifficulty(world) >= GDL.EXPERT;
}

/** Main.masterMode（Main.cs:2760）：Difficulty >= Master */
export function mainMasterMode(world: Pick<World, 'difficulty' | 'seedFlags'> | null | undefined): boolean {
  return mainDifficulty(world) >= GDL.MASTER;
}

// ---------------------------------------------------------------------------
// NPCID.Sets（NPCID.cs：Factory.CreateBoolSet(...) 等价"集合包含"）
// ---------------------------------------------------------------------------
/** NeedsExpertScaling（:4799）：命中即强制进 ScaleStats（无视 lifeMax/damage 门） */
export const NEEDS_EXPERT_SCALING = new Set([25, 30, 665, 33, 112, 666, 261, 265, 371, 516, 519, 397, 396, 398, 491]);
/** ProjectileNPC（:4801）：弹体 NPC——不缩 life/value，ExpertHardmode 段只乘 damage */
export const PROJECTILE_NPC = new Set([25, 30, 665, 33, 112, 666, 261, 265, 371, 516, 519]);
/** DontDoHardmodeScaling（:4440）：豁免 ExpertHardmode 兜底增强 */
export const DONT_DO_HARDSMODE_SCALING = new Set([5, 13, 14, 15, 267, 113, 114, 115, 116, 117, 118, 119, 658, 659, 660, 400, 522]);
/** BelongsToInvasionOldOnesArmy（:4771） */
export const OLD_ONES_ARMY = new Set([552, 553, 554, 561, 562, 563, 555, 556, 557, 558, 559, 560, 576, 577, 568, 569, 566, 567, 570, 571, 572, 573, 548, 549, 564, 565, 574, 575, 551, 578]);

/** NPC.CommonMasterBossLifeReduction（NPC.cs:6500） */
export const COMMON_MASTER_BOSS_LIFE_REDUCTION = 0.85;

// ---------------------------------------------------------------------------
// NPC.GetNPCInvasionGroup（NPC.cs:79095-79212）：
//   1 哥布林 / 2 雪人军团 / 3 海盗 / 4 火星 / -1 南瓜月 / -2 霜月 / -3 旧日军团 / 0 其他
// ---------------------------------------------------------------------------
export function getNPCInvasionGroup(npcID: number): number {
  if (npcID === 26 || npcID === 27 || npcID === 28 || npcID === 29 || npcID === 111 || npcID === 471 || npcID === 472) return 1;
  if (npcID === 143 || npcID === 144 || npcID === 145) return 2;
  if (npcID === 212 || npcID === 213 || npcID === 214 || npcID === 215 || npcID === 216
    || npcID === 252 || npcID === 491 || npcID === 492 || npcID === 662) return 3;
  if (npcID === 381 || npcID === 382 || npcID === 383 || npcID === 385 || npcID === 386 || npcID === 387
    || npcID === 388 || npcID === 389 || npcID === 390 || npcID === 391 || npcID === 394 || npcID === 395 || npcID === 520) return 4;
  if (npcID >= 338 && npcID <= 352) return -1;
  if ((npcID >= 305 && npcID <= 315) || npcID === 325 || npcID === 326 || npcID === 327 || npcID === 329 || npcID === 330) return -2;
  if ((npcID >= 547 && npcID <= 578)) return -3;
  return 0;
}

// ---------------------------------------------------------------------------
// NPC.GetAttackDamage_* 家族（NPC.cs:7010-7035）——AI 段逐处消费的难度伤害 API
// ---------------------------------------------------------------------------
/** GetKnockbackMultiplier_ScaledByDifficulty（:7010） */
export function getKnockbackMultiplierScaledByDifficulty(normalKnockbackMult: number, difficulty: number): number {
  return f32(normalKnockbackMult * sampleCurve(KNOCKBACK_TO_ENEMIES_MULTIPLIER, difficulty));
}

/** GetAttackDamage_ScaledByDifficulty（:7015）：(int)(normal * EnemyDamageMultiplier.Sample(difficulty)) */
export function getAttackDamageScaledByDifficulty(normalDamage: number, difficulty: number): number {
  return Math.trunc(f32(normalDamage * sampleCurve(ENEMY_DAMAGE_MULTIPLIER, difficulty)));
}

/** GetAttackDamage_CappedAtMaster（:7020）：大师以上钳在 Master 档 */
export function getAttackDamageCappedAtMaster(normalDamage: number, difficulty: number): number {
  const num = Math.min(difficulty, GDL.MASTER);
  return Math.trunc(f32(normalDamage * sampleCurve(ENEMY_DAMAGE_MULTIPLIER, num)));
}

/** GetAttackDamage_ForProjectiles（:7031）：Remap(difficulty, Classic, Expert, normal, expert) */
export function getAttackDamageForProjectiles(normalDamage: number, expertDamage: number, difficulty: number): number {
  return Math.trunc(remap(difficulty, GDL.CLASSIC, GDL.EXPERT, normalDamage, expertDamage));
}

/** 敌对弹幕命中玩家的难度乘区（Projectile.cs:264/544 hostileDamageScaling =
 *  GameDifficultyData.HostileProjectileDamageMultiplier，Damage_EVP :13770 消费：
 *  `if (!reflected) num3 = (int)(num3 * hostileDamageScaling.Sample(Main.Difficulty))`） */
export function hostileProjectileDamage(damage: number, difficulty: number): number {
  return Math.trunc(f32(damage * sampleCurve(HOSTILE_PROJECTILE_DAMAGE_MULTIPLIER, difficulty)));
}

// ---------------------------------------------------------------------------
// 待缩放属性 bundle（对应 NPC 字段；knockBackResist 用【原版语义】=承受击退比例）
// ---------------------------------------------------------------------------
export interface ScalingStats {
  type: number;
  lifeMax: number;
  damage: number;
  value: number;
  defense: number;
  knockBackResist: number;
  boss: boolean;
  friendly: boolean;
  townNPC: boolean;
  /** npc.scale——Tweaks 专家段 ×1.05/×1.2（:18205-18207 等） */
  scale: number;
  /** npc.difficulty（ScaleStats 内写入；缺省 0 = 未缩放，对应原版字段初值） */
  difficulty: number;
}

/** 世界上下文（原版 Main 静态的只读投影） */
export interface ScaleStatsWorld {
  /** Main.Difficulty（Main.cs:2764-2786，mainDifficulty() 求值结果） */
  difficulty: number;
  /** Main.hardMode */
  hardMode: boolean;
  /** Main.getGoodWorld */
  getGoodWorld: boolean;
  /** NPC.downedPlantBoss（ExpertHardmode 段 :18462 +20 阈值） */
  downedPlantBoss: boolean;
  /** NPC.AnyNPCs(type)（Tweaks/ExpertHardmode 的 getGoodWorld 联动门） */
  anyNpc: (type: number) => boolean;
  /** NPC.GetActivePlayerCount()（单人恒 1，Main.cs:18518-18521 netMode==0） */
  activePlayerCount: number;
}

/** 经典档缺省上下文（未绑定世界时用——数值与原版 Main 未加载世界时一致走 Classic） */
export const CLASSIC_SCALE_WORLD: ScaleStatsWorld = {
  difficulty: GDL.CLASSIC, hardMode: false, getGoodWorld: false, downedPlantBoss: false,
  anyNpc: () => false, activePlayerCount: 1,
};

// ---------------------------------------------------------------------------
// 世界绑定（Enemy.fromVanilla 无 world 引用；Game.afterWorldLoad 注入，
// 对应原版 Main 静态单例语义——存档不持久化缩放值，每次生成现场重算）
// ---------------------------------------------------------------------------
let boundWorld: ScaleStatsWorld | null = null;

export function bindScaleStatsWorld(ctx: ScaleStatsWorld | null): void { boundWorld = ctx; }

export function scaleStatsWorld(): ScaleStatsWorld { return boundWorld ?? CLASSIC_SCALE_WORLD; }

/** World → ScaleStatsWorld 投影（Game.afterWorldLoad 用；anyNpc 由实体桶实现） */
export function scaleStatsWorldOf(
  world: Pick<World, 'difficulty' | 'seedFlags' | 'flags'>,
  anyNpc: (type: number) => boolean,
): ScaleStatsWorld {
  return {
    difficulty: mainDifficulty(world),
    hardMode: !!world.flags?.hardMode,
    getGoodWorld: !!world.seedFlags?.getGoodWorld,
    downedPlantBoss: !!world.flags?.['downed_262'],
    anyNpc,
    activePlayerCount: 1,   // 单机（NPC.GetActivePlayerCount :18518 netMode==0 → 1）
  };
}

// ---------------------------------------------------------------------------
// NPC.ScaleStats（NPC.cs:18081-18105）
// ---------------------------------------------------------------------------
export function scaleStats(
  s: ScalingStats,
  ctx: ScaleStatsWorld = scaleStatsWorld(),
  activePlayersCount?: number | null,
  strengthOverride?: number | null,
): void {
  // 入口门（:18083）：NeedsExpertScaling 白名单 或 通用门
  //   lifeMax>5 && damage!=0 && !friendly && !townNPC
  //   → **Boss 不豁免**（boss 不在排除条件里）；ProjectNPC（25/30/…）靠白名单进入
  if (NEEDS_EXPERT_SCALING.has(s.type) || (s.lifeMax > 5 && s.damage !== 0 && !s.friendly && !s.townNPC)) {
    s.difficulty = strengthOverride != null ? strengthOverride : ctx.difficulty;   // :18086
    if (s.difficulty >= GDL.EXPERT && ctx.hardMode) scaleStatsForExpertHardmode(s, ctx);  // :18087-18089
    scaleStatsByDifficulty(s, ctx);                                                 // :18090
    if (s.difficulty >= GDL.EXPERT) {
      scaleStatsByPlayerCount(s, activePlayersCount != null ? activePlayersCount : ctx.activePlayerCount);  // :18091-18094
    }
    // :18096-18100 弹体 NPC 以外 lifeMax 下限 6（经典档同样生效）
    if ((s.type < 0 || !PROJECTILE_NPC.has(s.type)) && s.lifeMax < 6) s.lifeMax = 6;
    // :18101-18103 defDamage/defDefense/defLifeMax 快照 → 调用侧另存 baseDamage/baseDefense
  }
}

// ---------------------------------------------------------------------------
// NPC.ScaleStats_ByDifficulty（NPC.cs:18106-18116）
// ---------------------------------------------------------------------------
function scaleStatsByDifficulty(s: ScalingStats, ctx: ScaleStatsWorld): void {
  if (s.type < 0 || !PROJECTILE_NPC.has(s.type)) {                       // :18108-18112
    s.lifeMax = Math.trunc(f32(s.lifeMax * sampleCurve(ENEMY_MAX_LIFE_MULTIPLIER, s.difficulty)));
    s.value = Math.trunc(f32(s.value * sampleCurve(ENEMY_MONEY_DROP_MULTIPLIER, s.difficulty)));
  }
  s.damage = getAttackDamageScaledByDifficulty(s.damage, s.difficulty);  // :18113
  s.knockBackResist = getKnockbackMultiplierScaledByDifficulty(s.knockBackResist, s.difficulty);  // :18114
  scaleStatsByDifficultyTweaks(s, ctx);                                  // :18115
}

// ---------------------------------------------------------------------------
// NPC.ScaleStats_ByDifficulty_Tweaks（NPC.cs:18118-18447）
//   num=伤害系数（Classic→Expert）/ num2=生命 Classic→Expert / num3=生命 Expert→Master
// ---------------------------------------------------------------------------
function scaleStatsByDifficultyTweaks(s: ScalingStats, ctx: ScaleStatsWorld): void {
  let num = 1.0;   // damage
  let num2 = 1.0;  // lifeMax (classic→expert)
  let num3 = 1.0;  // lifeMax (expert→master)
  const type = s.type;

  // ---- getGoodWorld 世吞/骷髅王/血肉墙本体降容联动（:18125-18152）----
  //   6 世吞头 且 AnyNPCs(13)（世吞在场）→ 大师生命数 ×0.85、伤害 ×1.5、专家防 +2
  //   32 腐化头 且 AnyNPCs(35)（骷髅王在场）→ 同上、专家防 +6
  //   24 火妖 且 AnyNPCs(113)（血肉墙在场）→ 同上、专家防 +10
  if (ctx.getGoodWorld) {
    if (type === 6 && ctx.anyNpc(13)) {
      num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
      num2 *= 1.5;
      if (s.difficulty >= GDL.EXPERT) s.defense += 2;
    }
    if (type === 32 && ctx.anyNpc(35)) {
      num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
      num2 *= 1.5;
      if (s.difficulty >= GDL.EXPERT) s.defense += 6;
    }
    if (type === 24 && ctx.anyNpc(113)) {
      num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
      num2 *= 1.5;
      if (s.difficulty >= GDL.EXPERT) s.defense += 10;
    }
  }

  // ---- 类型逐档系数（:18154-18386；else-if 链，先命中先得）----
  //   210/211 蜂/毒蜂：生命 ×0.6、伤害 ×0.6、专家防御 Remap(1,0.8)
  if (type === 210 || type === 211) {
    num2 = 0.6;                       // 原文 0.6000000000000001 (double) → (float) 后为 0.6
    num = 0.6;
    s.defense = Math.trunc(remap(s.difficulty, GDL.CLASSIC, GDL.EXPERT, 1, 0.8) * s.defense);
  } else if (type === 5) {            // 5 史莱姆王
    num2 = 0.75;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
  } else if (type === 4) {            // 4 克苏鲁之眼
    num2 = 0.65;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
  } else if (type >= 13 && type <= 15) {  // 世吞三段
    num2 = 0.7;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    if (type === 13) num *= 1.1;      // 头
    if (type === 14) num *= 0.8;      // 身
    if (type === 15) num *= 0.8;      // 尾
    if (s.difficulty >= GDL.EXPERT) { s.scale *= 1.2; s.defense += 2; }
  } else if (type === 266 || type === 267) {  // 克脑 + 爬行者
    num2 = 0.85;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    num *= 0.9;
    if (s.difficulty >= GDL.EXPERT) s.scale *= 1.05;
  } else if (type === 50) {           // 50 骷髅王
    num2 = 0.7;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    num *= 0.8;
  } else if (type === 471) {          // 471 哥布林召唤师
    num2 = 0.85;
  } else if (type === 472) {          // 472 哥布林召唤师(暗影焰)
    num2 = 0.85;
    num = 0.8;
  } else if (type === 492) {          // 492 海盗神射手
    num2 = 0.85;
  } else if (type === 393 || type === 394 || type === 395) {  // 火星飞碟三段
    num2 = 0.85;
  } else if (type === 222) {          // 222 蜂后
    num2 = 0.7;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    num = 0.9;
  } else if (type === 35) {           // 35 骷髅王头(地牢守卫同 id 族)
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    num = 1.1;
  } else if (type === 36) {           // 36 骷髅王手
    num2 = 1.3;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    num = 1.1;
  } else if (type === 668) {          // 668 帝王凝胶(史莱姆皇后召唤物)
    num2 = 0.85;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
  } else if (type === 113 || type === 114) {  // 血肉墙 / 之眼
    num2 = 0.7;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    num = 1.5;
    if (s.difficulty >= GDL.EXPERT) s.defense += 6;
  } else if (type === 115) {          // 115 饥饿者
    num2 = 0.7;
    if (s.difficulty >= GDL.EXPERT) s.defense += 6;
  } else if (type === 116) {          // 116 饥饿者 II
    num2 = 0.7;
  } else if (type === 117 || type === 118 || type === 119) {  // 憎恶蜂群
    num2 = 0.8;
  } else if (type === 657) {          // 657 史莱姆皇后
    num2 = 0.8;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
  } else if (type >= 658 && type <= 660) {  // 皇后水晶/水晶仆从
    num2 = 0.75;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
  } else if (type >= 134 && type <= 136) {  // 毁灭者三段
    num2 = 0.75;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    if (type === 134) num *= 2.0;     // 头
    if (type === 135) num *= 0.85;    // 身
    if (type === 136) num *= 0.85;    // 尾
    if (s.difficulty >= GDL.EXPERT) s.scale *= 1.05;
  } else if (type === 139) {          // 139 毁灭者探针
    num2 = 0.75;
    num = 0.8;
    if (s.difficulty >= GDL.EXPERT) s.scale *= 1.05;
  } else if (type >= 127 && type <= 131) {  // 机械骷髅王 + 部件
    num2 = 0.75;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    num = 0.85;
  } else if (type >= 125 && type <= 126) {  // 双子魔眼
    num2 = 0.75;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    num = 0.85;
  } else if (type === 262) {          // 262 世纪之花
    num2 = 0.7;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    num = 1.15;
  } else if (type === 264) {          // 264 世纪之花钩/触手
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    num = 1.15;
  } else if (type === 636) {          // 636 光之女皇
    num2 = 0.7;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
  } else if (type >= 245 && type <= 249) {  // 石巨人族
    num2 = 0.75;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    num = 0.8;
  } else if (type === 370) {          // 370 猪龙鱼公爵
    num2 = 0.65;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    num = 0.7;
  } else if (type === 371 || type === 372 || type === 373) {  // 猪鲨气泡/鲨龙卷
    if (type !== 371) num2 = 0.75;
    num = 0.75;
  } else if (type === 439 || type === 440 || (type >= 454 && type <= 459) || type === 522 || type === 523) {
    // 拜月教邪教徒 439/440、拜月教忠实信徒 454-459、邪教弓手 522/523
    if (type !== 522) {
      num2 = 0.75;
      num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    }
    num = 0.75;
  } else if (type === 397 || type === 396 || type === 398) {  // 月总手/头/核心
    num2 = 0.75;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    num = 0.75;
  } else if (type === 551) {          // 551 火星走卒(地表 UFO)
    num2 = 0.75;
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
    num = 0.65;
  } else if (OLD_ONES_ARMY.has(type)) {  // 旧日军团全体
    num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
  }

  // ---- 月事件入侵组（:18388-18420）----
  const invasionGroup = getNPCInvasionGroup(type);
  if (invasionGroup === -2 || invasionGroup === -1) {
    switch (type) {
      // 哀木 325 / 南瓜王 327 / 冰女王 345 / 圣诞坦克 346 / 精灵直升机 344：
      // 生命 ×0.65、大师生命 ×0.85、伤害 ×0.75
      case 315: case 325: case 327: case 344: case 345: case 346:
        num2 = 0.65;
        num3 *= COMMON_MASTER_BOSS_LIFE_REDUCTION;
        num = 0.75;
        break;
      default:                        // 其余南瓜/霜月杂兵：生命 ×0.75、伤害 ×0.75
        num2 = 0.75;
        num = 0.75;
        break;
    }
  }

  // ---- 汇总（:18422-18433）----
  let num4 = 1;
  num4 *= remap(s.difficulty, GDL.CLASSIC, GDL.EXPERT, 1, f32(num2));
  num4 *= remap(s.difficulty, GDL.EXPERT, GDL.MASTER, 1, f32(num3));
  s.lifeMax = roundCS(f32(f32(s.lifeMax) * num4));
  let num5 = 1;
  num5 *= remap(s.difficulty, GDL.CLASSIC, GDL.EXPERT, 1, f32(num));
  s.damage = roundCS(f32(f32(s.damage) * num5));
}

// ---------------------------------------------------------------------------
// NPC.ScaleStats_ForExpertHardmode（NPC.cs:18448-18497）
//   专家+困难模式 的"杂兵兜底增强"：把 damage+defense+lifeMax/4 拉到 80
//   （世花后 100）的强度水位。boss / lifeMax>=1000 / DontDoHardmodeScaling 全豁免。
// ---------------------------------------------------------------------------
function scaleStatsForExpertHardmode(s: ScalingStats, ctx: ScaleStatsWorld): void {
  const isProj = s.type >= 0 && PROJECTILE_NPC.has(s.type);   // :18449
  let flag2 = !DONT_DO_HARDSMODE_SCALING.has(s.type);         // :18450
  if (ctx.getGoodWorld) {                                     // :18452-18468
    if ((s.type === 24 || s.type === 25) && ctx.anyNpc(113)) flag2 = false;
    if ((s.type === 32 || s.type === 33) && ctx.anyNpc(35)) flag2 = false;
    if (s.type === 6 && ctx.anyNpc(13)) flag2 = false;
  }
  if (s.boss || s.lifeMax >= 1000) flag2 = false;             // :18469-18472 ★Boss 豁免点
  if (!flag2) return;

  let num = s.damage + s.defense + Math.trunc(s.lifeMax / 4); // :18476-18478 (int 除法)
  if (num === 0) num = 1;
  let num2 = 80;                                              // :18480
  if (ctx.downedPlantBoss) num2 += 20;                        // :18481-18483
  if (num < num2) {                                           // :18484
    const num3 = f32(num2 / num);
    s.damage = Math.trunc(f32(f32(s.damage * num3) * 0.9));   // :18486
    if (!isProj) {                                            // :18487-18492
      s.defense = Math.trunc(f32(s.defense * num3));
      s.lifeMax = Math.trunc(f32(f32(s.lifeMax * num3) * 1.1));
      s.value = Math.trunc(f32(f32(s.value * num3) * 0.8));
    }
  }
}

// ---------------------------------------------------------------------------
// NPC.ScaleStats_ByPlayerCount（NPC.cs:18498-18659）
//   多人玩家数缩放。单人 balance=1 → 全部 `num *= balance` 恒等，仅多人有意义；
//   击退段全部门在 numPlayers>1，单人同样恒等。1:1 抄录以备多人接入。
// ---------------------------------------------------------------------------
export function getStatScalingFactors(numPlayers: number): { balance: number; boost: number } {
  let balance = 1;
  let boost = 0.35;
  for (let i = 1; i < numPlayers; i++) {
    balance += boost;
    boost += (1 - boost) / 3;
  }
  if (balance > 8) balance = (balance * 2 + 8) / 3;
  if (balance > 1000) balance = 1000;
  return { balance, boost };
}

function scaleStatsByPlayerCount(s: ScalingStats, numPlayers: number): void {
  const { balance, boost } = getStatScalingFactors(numPlayers);
  let num = 1.0;
  const type = s.type;
  if (type === 4) num *= balance;
  if (type >= 13 && type <= 15) {
    num *= balance;
    // 世吞：balance 每 +0.34 一档削击退（:18508-18524）
    for (let num2 = 1; num2 < balance; num2 += 0.34) {
      if (s.knockBackResist < 0.1) { s.knockBackResist = 0; break; }
      s.knockBackResist *= 0.8;
    }
  }
  if (type === 266 || type === 267) num *= balance;
  if (type === 50) num *= balance;
  if (type === 471) num *= lerp(1, balance, 2 / 3);
  if (type === 472) num *= lerp(1, balance, 0.5);
  if (type === 222) num *= balance;
  if (type === 35) num *= balance;
  else if (type === 36) num *= balance;
  if (type === 668) num *= balance;
  if (type === 113 || type === 114) num *= balance;
  else if (type === 115) {
    num *= balance;
    if (numPlayers > 4) s.knockBackResist = 0;
    else if (numPlayers > 1) s.knockBackResist *= 1 - boost;
  } else if (type === 116) {
    num *= balance;
    if (numPlayers > 4) s.knockBackResist = 0;
    else if (numPlayers > 1) s.knockBackResist *= 1 - boost;
  }
  if (type === 657) num *= balance;
  if (type >= 658 && type <= 660) num *= balance;
  if (type >= 134 && type <= 136) num *= balance;
  else if (type === 139) num *= lerp(1, balance, 2 / 3);
  if (type >= 127 && type <= 131) num *= balance;
  if (type >= 125 && type <= 126) num *= balance;
  if (type === 262) num *= balance;
  else if (type === 264) num *= balance;
  if (type === 636) num *= balance;
  if (type >= 245 && type <= 249) num *= balance;
  if (type === 370) num *= balance;
  if (type === 439 || type === 440 || (type >= 454 && type <= 459) || type === 523) num *= balance;
  if (type === 397 || type === 396 || type === 398) num *= balance;
  if (type === 551) num *= balance;
  else if (OLD_ONES_ARMY.has(type)) num *= lerp(1, balance, 6 / 7);   // 原文 0.8571428656578064
  const invasionGroup = getNPCInvasionGroup(type);
  if (invasionGroup === -2 || invasionGroup === -1) {
    switch (type) {
      case 315: case 325: case 327: case 344: case 345: case 346:
        break;   // 月事件 Boss 不吃玩家数生命加成（:18648-18653）
      default:
        num *= 1 + (numPlayers - 1) * 0.2;
        break;
    }
  }
  s.lifeMax = roundCS(s.lifeMax * num);
}
