// 全局调参集中地：物理、渲染、生成、平衡数值
export const TILE = 16; // tile 尺寸（px）

// ---- 物理 ----
// 玩家重力/移速/下落上限对齐 Player.cs:2376-2386（defaultGravity 0.4 / maxFallSpeed 10(+0.01) / accWalk 3）
export const GRAVITY = 0.4; // px/tick^2
// ★GRAVITY 偏差登记（水体交互批结论：维持 0.4，不改 0.3）：
//   0.4 是【玩家】权威值（Player.cs:2376 defaultGravity=0.4），本常量语义=玩家重力——
//   不存在"玩家 0.4 vs 原版 0.3"的偏差。真正的偏差在 NPC 侧：原版 NPC 重力是独立常量
//   0.3（NPC.cs:6026 静态初值；每 tick UpdateNPC_UpdateGravity :91872-91944 重算），
//   本仓约 40 处敌怪/小动物重力点直接复用 GRAVITY → 敌怪下落比原版快 33%、
//   战士 -8/-7/-6/-5 跳梯等原版初速按 0.3 调校的跳跃弧线整体偏低。
//   不对齐的理由：①影响面=全部敌怪跳跃/坠落弧线与既调平衡；②原版同函数还有三段
//   修正未移植——深度缩放（gravity×clamp((y/16-(60+10k))/(worldSurface/6),0.25,1)，
//   地表附近仅 0.25×=0.075）、逐类型覆写（258→0.1/425,427 ai2=1→0.1/426→0.1/
//   576,577 跳扑→0.45/541→0/aiStyle7+ai0=25→0）、湿身档（0.2/7、蜂蜜 0.1/4、微光
//   0.15/5.5——落速帽已在 npcLiquid.ts 补齐，重力值未改）。只改 0.3 不补这三段仍是
//   半对齐；全套移植需 NPC_GRAVITY 新常量+逐点替换，留待重力专项。
//   湿身落速帽（ npcLiquid.updateNpcLiquid 第 6 段）是当前唯一的补偿位。
export const MAX_FALL_SPEED = 10;
export const PLAYER_WALK_ACCEL = 0.32;
export const PLAYER_WALK_MAX = 3; // px/tick（15 mph）
export const PLAYER_FRICTION = 0.72; // 地面摩擦系数（乘法）——旧模型遗留,两段模型用 RUN_*
export const RUN_ACCELERATION = 0.08; // runAcceleration（Player.cs:2388,两段模型全速段）
export const RUN_SLOWDOWN = 0.2;      // runSlowdown（:2390,制动/无输入减速加法基准）
export const PLAYER_AIR_FRICTION = 0.94;
// 掉落物独立物理（WorldItem.cs:418-450：空气 0.1/7、水 0.08/5、蜂蜜 0.05/3）——勿与玩家 GRAVITY 耦合
export const ITEM_GRAVITY = 0.1;
export const ITEM_MAX_FALL = 7;
export const PLAYER_JUMP_SPEED = 6.6;
export const PLAYER_JUMP_TICKS = 9; // 长按跳跃的持续加速度 tick 数
export const ENEMY_GRAVITY = 0.32;   // 原版无此常量（NPC 重力 0.3 走 UpdateNPC_UpdateGravity），勿与 GRAVITY 混用

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
