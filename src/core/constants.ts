// 全局调参集中地：物理、渲染、生成、平衡数值
export const TILE = 16; // tile 尺寸（px）

// ---- 物理 ----
// 玩家重力/移速/下落上限对齐 Player.cs:2376-2386（defaultGravity 0.4 / maxFallSpeed 10(+0.01) / accWalk 3）
export const GRAVITY = 0.4; // px/tick^2
export const MAX_FALL_SPEED = 10;
export const PLAYER_WALK_ACCEL = 0.32;
export const PLAYER_WALK_MAX = 3; // px/tick（15 mph）
export const PLAYER_FRICTION = 0.72; // 地面摩擦系数（乘法）
export const PLAYER_AIR_FRICTION = 0.94;
// 掉落物独立物理（WorldItem.cs:418-450：空气 0.1/7、水 0.08/5、蜂蜜 0.05/3）——勿与玩家 GRAVITY 耦合
export const ITEM_GRAVITY = 0.1;
export const ITEM_MAX_FALL = 7;
export const PLAYER_JUMP_SPEED = 6.6;
export const PLAYER_JUMP_TICKS = 9; // 长按跳跃的持续加速度 tick 数
export const ENEMY_GRAVITY = 0.32;

// ---- 世界 ----
export const CHUNK = 16; // chunk 边长（tile）

// ---- 光照 ----

// ---- 时间 ----
export const DAY_LENGTH = 24 * 60 * 60 * 1000 / 60; // 1 游戏日 = 24 现实分钟（ms 现实时间）
export const TICK_RATE = 60; // 固定逻辑帧率

// ---- 战斗 ----
export const PLAYER_IFRAME_TICKS = 40; // 受击无敌帧
export const PLAYER_MAX_HP = 100;
export const KNOCKBACK_BASE = 3.2;
export const ENEMY_CAP = 9;
export const MAGNET_RADIUS = 3.2 * TILE; // 掉落物磁吸半径（px）
export const PICKUP_DELAY = 25; // 掉落物产生后多少 tick 才能被拾取

// ---- 敌人生成 ----
export const SPAWN_MIN_DIST = 42 * TILE; // 距玩家最小生成距离：必在屏幕外（zoom1.25 半屏≈32格）
export const SPAWN_MAX_DIST = 72 * TILE;
export const SPAWN_CHECK_INTERVAL = 30; // tick
