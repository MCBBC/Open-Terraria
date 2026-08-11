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
export const AI_YOYO = 99;        // 悠悠球（按住持续滞留）
export const AI_SHORTSWORD = 161; // 短剑直刺
export const AI_WHIP = 165;       // 鞭
export const AI_GLOWSTICK = 14;   // 荧光棒族（弹跳物理/粘性/妖精）
