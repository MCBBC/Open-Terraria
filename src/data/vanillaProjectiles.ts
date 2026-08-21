// 原版投射物数据（tools/extract-projectiles.mjs 从 Terarria1456 Projectile.cs SetDefaults 提取）。
// 注意 1456 的 SetDefaults 是 if/else-if 链（非 switch），且长矛/悠悠球/连枷等族走
// DefaultTo*() 辅助方法（aiStyle 19/99/15）、悠悠球批量定义在 `type >= A && type <= B` 区间块。
import projJson from './vanilla-projectiles.json';

export interface ProjectileData {
  aiStyle?: number;
  width?: number;
  height?: number;
  penetrate?: number;
  timeLeft?: number;
  damage?: number;
  light?: number;
  /** 绘制 scale（SetDefaults，196 款非 1；绘制尺寸 = 贴图原生 × scale，非判定盒宽） */
  scale?: number;
  /** 每帧额外子步（SetDefaults，249 款非 0；总步数 = 1+extraUpdates——子弹 14=1、高速弹 207=2） */
  extraUpdates?: number;
  /** 弹幕自带穿甲（Projectile.cs:260 armorPenetration；SetDefaults 逐型直写，
   *  25 款非 0——StrikeNPC :12068 num3 = 玩家 GetArmorPenetration(melee) + 本值，
   *  再入 NPC.checkArmorPenetration :81913 池（+ichor15/broken20/betsy40）。
   *  条件档（148 remixWorld=20）提取器不可静态求值，未入表（登记） */
  armorPenetration?: number;
  /** 1457: 局部 NPC 无敌帧（usesLocalNPCImmunity=true + localNPCHitCooldown=N，
   *  Projectile.cs:10688-10689 ApplyGemStaffStats 等）——同一弹对同一敌 N t 后可再命中
   *  （缺省=命中即永久免疫，Arrow.hitSet 旧语义）。Arrow 命中环按本列切换冷却表 */
  localNPCHitCooldown?: number;
  friendly?: boolean;
  melee?: boolean;
  ranged?: boolean;
  magic?: boolean;
  minion?: boolean;
  hostile?: boolean;
  tileCollide?: boolean;
  ignoreWater?: boolean;
}

const TABLE = projJson as unknown as Record<string, ProjectileData>;

/** 原版 projectile type → 投射物数据（无条目返回 null） */
export function projectileData(type: number): ProjectileData | null {
  return TABLE[String(type)] ?? null;
}

// ---- aiStyle 家族常量（ProjectileAIStyleIDs / 源码辅助方法实测值） ----
export const AI_ARROW = 1;        // 直飞弹（箭/子弹/大部分魔法弹）
export const AI_THROWN = 2;       // 抛物线投掷物（手里剑/飞刀，重力 0.3/tick）
export const AI_BOOMERANG = 3;    // 回旋镖（飞出后返回）
export const AI_FLAIL = 15;       // 连枷（抛掷甩链）
export const AI_GRENADE = 16;     // 弹跳爆炸物（手雷/炸弹/炸药，引信爆炸）
export const AI_SPEAR = 19;       // 长矛（随角色前刺）
export const AI_ANCHORED = 13;    // 锚定链族（AI_013:鱼叉/Golem拳/KO加农/链刀——锚在角色上伸缩,归长矛近似）
export const AI_YOYO = 99;        // 悠悠球（按住持续滞留）
export const AI_SHORTSWORD = 161; // 短剑直刺
export const AI_WHIP = 165;       // 鞭
export const AI_GLOWSTICK = 14;   // 荧光棒族（弹跳物理/粘性/妖精）
