// 坐骑系统（1.4.5.6 原版 1:1 移植：Terraria/Mount.cs + Terraria.ID/MountID.cs +
// Player.cs 骑乘接管段 :26310-26334/:26416/:26637-26700/:35734-35790）。
//
// 数据源 = tools/extract-mounts.mjs 从反编译源码提取的 src/data/vanilla-mounts.json
//（64 坐骑全量：参数/帧组/贴图表名/能力位/召唤物品/坐骑 buff）。
// 矿车族（MountID.Sets.Cart）走 src/entities/Minecart.ts 轨道运动学，本模块不回退
//（isCart 门：参数/帧状态仍可查询，物理由 Minecart 接管）。
//
// 三模物理接管（Player.fixedUpdate 挂钩）：
//   陆行族 —— Run 段参数覆写（Player.cs:26329-26331：maxRun=RunSpeed/accRun=DashSpeed/
//             runAcc=Acceleration），常规 moveAndCollide 碰撞照走；
//   飞行族 —— usesHover（UFO 7/蜜蜂 5/猪鲨崽 12/巫婆扫帚 23/熔岩鲨 49）走 Hover()
//             能量-疲劳双池 1:1；非 hover 的飞行坐骑（驯鹿 0/猪龙 2）走 Flight()
//             飞行时量 + 松键重力/3 衰减；
//   游泳族 —— 海龟 4/猪鲨崽 12/海盗船 44/熔岩鲨 49：buff 131/168/265 授予 ignoreWater
//             （Player.cs:9592-9608）→ 水下不降速不溺水物理，frameState==4 时
//             RunSpeed→swimSpeed、跳跃 +5 高 /+2.5 速（Mount.JumpHeight/JumpSpeed）。
import mountJson from '../data/vanilla-mounts.json';
import { TILE_DEFS } from '../data/tiles';

// ---- 数据表类型（vanilla-mounts.json 提取产物） ----
export interface MountData {
  buff: number;
  /** 变身坐骑（52/54-56/61）与滚轴鞋（57-60）原版未设 = 0 */
  heightBoost?: number;
  flightTimeMax?: number;
  fatigueMax?: number;
  fallDamage?: number;
  extraFall?: number;
  runSpeed: number;
  dashSpeed?: number;
  swimSpeed?: number;
  acceleration: number;
  jumpHeight: number;
  jumpSpeed: number;
  usesHover?: boolean;
  constantJump?: boolean;
  blockExtraJumps?: boolean;
  abilityChargeMax?: number;
  abilityDuration?: number;
  abilityCooldown?: number;
  walkingGraceTimeMax?: number;
  totalFrames: number;
  playerYOffsets?: number[];
  xOffset?: number;
  yOffset?: number;
  playerHeadOffset?: number;
  bodyFrame?: number;
  spawnDust?: number;
  Minecart?: boolean;
  CanRideMinecartTracks?: boolean;
  CanUseWings?: boolean;
  emitsLight?: boolean;
  lightColor?: number[];
  standingFrameStart?: number; standingFrameCount?: number; standingFrameDelay?: number;
  runningFrameStart?: number; runningFrameCount?: number; runningFrameDelay?: number;
  flyingFrameStart?: number; flyingFrameCount?: number; flyingFrameDelay?: number;
  inAirFrameStart?: number; inAirFrameCount?: number; inAirFrameDelay?: number;
  idleFrameStart?: number; idleFrameCount?: number; idleFrameDelay?: number;
  idleFrameLoop?: boolean;
  swimFrameStart?: number; swimFrameCount?: number; swimFrameDelay?: number;
  dashingFrameStart?: number; dashingFrameCount?: number; dashingFrameDelay?: number;
  backTexture?: string; frontTexture?: string;
  backTextureExtra?: string; frontTextureExtra?: string;
  backTextureGlow?: string; frontTextureGlow?: string;
}

export const MOUNT_COUNT: number = mountJson.count;
/** id → 内部名（MountID.cs const 表） */
export const MOUNT_NAMES: Record<string, string> = mountJson.names;
/** id → 数据（Mount.cs Initialize() 提取） */
export const MOUNT_DATA: Record<string, MountData> = mountJson.mounts;
/** MountID.Sets 能力位（CreateBoolSet/CreateIntSet 展开） */
export const MOUNT_SETS: Record<string, boolean[]> = mountJson.sets;
/** 召唤物品 id → 坐骑 id（Item.cs SetDefaults `mountType = N` / DefaultToMinecart） */
export const ITEM_TO_MOUNT: Record<string, number> = mountJson.itemMount;
/** 坐骑 buff id → 坐骑 id（BuffID.Sets.MountType） */
export const BUFF_TO_MOUNT: Record<string, number> = mountJson.buffMount;
/** 主贴图可得性登记（terraria-assets 缺表的坐骑 → 色块近似渲染） */
export const MOUNT_TEXTURE_OK: Record<string, boolean> = mountJson.textureOk;

export const mountName = (id: number): string => MOUNT_NAMES[String(id)] ?? `Mount${id}`;
export const isCartMount = (id: number): boolean => !!MOUNT_SETS.Cart?.[id];

/** 贴图不可得坐骑的色块近似渲染色（按生物族群登记；其余默认棕） */
const MOUNT_FALLBACK_COLOR: Record<number, string> = {
  0: '#B03030', 1: '#E8E0D8', 2: '#C060C0', 3: '#4080FF', 4: '#406040', 5: '#E8B020',
  7: '#9098C0', 8: '#C0C8D0', 9: '#704030', 10: '#F0F0F0', 12: '#60A0E0', 14: '#C8B060',
  17: '#E0E0E0', 23: '#804020', 37: '#F090B0', 40: '#A06030', 41: '#D8D0C0', 42: '#403848',
  43: '#C05030', 44: '#805838', 45: '#705030', 46: '#38A848', 47: '#C04858', 48: '#5858C8',
  49: '#E05020', 50: '#6090FF', 52: '#A0A8B0', 54: '#C8A060', 55: '#909098', 56: '#584868',
  57: '#E8E8E8', 58: '#58C058', 59: '#F0F0F0', 60: '#F090C0', 61: '#F0D048', 62: '#68C8E8',
  63: '#F08040',
};
export const mountFallbackColor = (id: number): string => MOUNT_FALLBACK_COLOR[id] ?? '#8A6A4A';

/** 坐骑 buff 授予的水下自由语义（Player.cs UpdateBuffs :9592-9608：
 *  131 海龟 / 168 猪鲨崽 → ignoreWater+accFlipper；265 熔岩鲨 → canFloatInWater+accFlipper） */
const BUFF_SWIM_FREE = new Set([131, 168, 265, 279, 305]); // +305 熔岩鲨（Player.cs:9602-9608：ignoreWater+accFlipper+lavaImmune+lavaVision+fireWalk）

/** MountInstance 消费的玩家视图（结构性接口，避免与 Player 循环依赖） */
export interface MountedPlayerView {
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  onGround: boolean;
  inWater: boolean;
  facing: number;
  inputX: number; inputJump: boolean; inputUp: boolean; inputDown: boolean;
  /** 上一 tick 是否按下跳跃（releaseJump 语义：松开后才可重触发飞行/起跳） */
  prevInputJump: boolean;
  gravDir: number;
  /** 缓存世界（fixedUpdate 每帧刷新；Hover/TryBeginningFlight 的 tile 探针用） */
  store: {
    inBounds(tx: number, ty: number): boolean;
    idx(tx: number, ty: number): number;
    flags: Uint8Array | number[];
    isSolid(tx: number, ty: number): boolean;
  } | null;
}

/** 帧状态（Mount.cs FrameStanding..FrameDashing 常量） */
export const FRAME_STANDING = 0;
export const FRAME_RUNNING = 1;
export const FRAME_IN_AIR = 2;
export const FRAME_FLYING = 3;
export const FRAME_SWIMMING = 4;
export const FRAME_DASHING = 5;

const DEFAULT_GRAVITY = 0.4;

// ============================================================================
// 钻头坐骑（mount 8 Drill Mounted Containment）常量（Mount.cs :303-319）
// ============================================================================

/** :313 drillPickPower——PickTile/PickWall 的镐力 */
export const DRILL_PICK_POWER = 210;
/** :315 drillPickTime——每束命中后再装填 tick（beam.cooldown 初值，1 = 每帧可再射） */
export const DRILL_PICK_TIME = 1;
/** :317 amountOfBeamsAtOnce——同 tick 最多齐射的光束数 */
export const DRILL_BEAMS = 2;
/** :319 maxDrillLength——光束延伸 = min(鼠标距,224)+32（块）/ 再 +16（墙） */
export const DRILL_MAX_LENGTH = 224;
/** DrillSmartCursor_Blocks 的 PlotTileLine 带宽（:3164 65.6 ≈ 4 格扫掠带） */
export const DRILL_BLOCK_BAND = 65.6;
/** DrillSmartCursor_Walls 的带宽（:3197 97.6）与额外 16px 延伸（:3192） */
export const DRILL_WALL_BAND = 97.6;
export const DRILL_WALL_EXTRA = 16;
/** :303/:305 二极管发射点（相对坐骑贴图原点，随 diodeRotation 旋转；Draw :6032） */
export const DRILL_DIODE_1 = { x: 36, y: -6 };
export const DRILL_DIODE_2 = { x: 36, y: 8 };
/** :1308 drillTextureSize（80×80，ClampToDeadZone 死区半径） */
export const DRILL_TEXTURE_SIZE = { x: 80, y: 80 };

// ============================================================================
// Scutlix Gunner（mount 9）常量（Mount.cs :297-303/:1374-1397）
// ============================================================================

/** :301 scutlixBaseDamage——两束眼激光的单发伤害（UseAbility :3247 damage3 = 150） */
export const SCUTLIX_SHOT_DAMAGE = 150;
/** :1374-1383 scutlixEyePositions 原表（:1395 已统一减贴图中心 45,54 → 原点=坐骑锚点） */
export const SCUTLIX_EYE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [60 - 45, 2 - 54], [70 - 45, 6 - 54], [68 - 45, 6 - 54], [76 - 45, 12 - 54], [80 - 45, 10 - 54],
  [84 - 45, 18 - 54], [74 - 45, 20 - 54], [76 - 45, 24 - 54], [70 - 45, 34 - 54], [76 - 45, 34 - 54],
];
/** :1397 scutlixTextureSize（45,54）——ClampToDeadZone 死区半径 */
export const SCUTLIX_TEXTURE_SIZE = { x: 45, y: 54 };
/** UpdateEffects :4885/:4886——索敌半径 num3=850 / 上限 num2=1500 */
export const SCUTLIX_SEEK_RANGE = 850;
export const SCUTLIX_SEEK_MAX = 1500;
/** 眼部瞄准帧区间（AimAbility :5384-5399：frameExtra 6..10 对应 ±112.5° 分档） */
export const SCUTLIX_EYE_FRAME_MIN = 6;
export const SCUTLIX_EYE_FRAME_MAX = 10;

/** 猪鲨崽（mount 12）MountFishronSpecial 计数器档位（Mount.cs UpdateEffects :4998/:5003） */
export const FISHRON_COUNTER_LOW_HP = 60;
export const FISHRON_COUNTER_WET = 420;

/** updateMountEffects 的每 tick 上下文（Player 侧组装：敌怪盒/视线/天气/发射桶） */
export interface MountEffectsCtx {
  /** Scutlix 索敌候选（已按 NPC.CanBeChasedBy 口径过滤的敌怪命中盒） */
  scutlixTargets: ScutlixTarget[];
  /** Collision.CanHitLine（Mount.cs :4922 视线门） */
  los(cx: number, cy: number, t: ScutlixTarget): boolean;
  /** 眼激光发射（UseAbility case 9：弹型 606/伤 150/速 14） */
  fireScutlixShot?(x: number, y: number, vx: number, vy: number): void;
  fishron: FishronView;
}

/** fishronSpecial/updateFishron 的玩家视图 */
export interface FishronView {
  hp: number; maxHp: number;
  /** Player.wet（水）——岩浆/蜂蜜湿另有标记，湿水才触发 */
  inWater: boolean; inLava: boolean; inHoney: boolean;
  /** Main.raining */
  raining: boolean;
  /** WorldGen.InAPlaceWithWind（露天迎风：地表以上、无液体、无挡风墙） */
  windExposed: boolean;
}

/** WorldGen.InAPlaceWithWind（WorldGen.cs:66135-66161）1:1 子集：
 *  地表高度以上 + 命中盒每格无液体且无墙（AllowsWind 墙表白名单未实装，有墙即挡风） */
export function inAPlaceWithWind(
  st: Pick<DrillStore, 'inBounds' | 'idx' | 'wall'> & { liquid?: ArrayLike<number> },
  x: number, y: number, w: number, h: number, worldSurface: number,
): boolean {
  // DoesWindBlowAtThisHeight：tileY < worldSurface（remix 世界反转未实装）
  if (Math.floor(y / 16) >= worldSurface) return false;
  const x0 = Math.floor(x / 16), y0 = Math.floor(y / 16);
  const x1 = Math.floor((x + w) / 16), y1 = Math.floor((y + h) / 16);
  for (let i = x0; i <= x1; i++) {
    for (let j = y0; j <= y1; j++) {
      if (!st.inBounds(i, j)) continue;   // 越界格原版 InWorld 门外跳过
      const k = st.idx(i, j);
      if ((st.liquid?.[k] ?? 0) > 0 || st.wall[k] > 0) return false;
    }
  }
  return true;
}

/** 激光弹型（ProjectileID.ScutlixEye = 606；UseAbility :3227 type2） */
export const SCUTLIX_PROJ_ID = 606;

/** Utils.PlotLine（Utils.cs:2327）1:1：谓词返回 false 即中断并返回 false。
 *  主循环 `for (i = x0; i != x1; i += step)` 不含终点格——原版同款语义，勿改。 */
function plotLine(x0: number, y0: number, x1: number, y1: number,
  plot: (x: number, y: number) => boolean, jump: boolean): boolean {
  if (x0 === x1 && y0 === y1) return plot(x0, y0);
  const flag = Math.abs(y1 - y0) > Math.abs(x1 - x0);
  if (flag) { const t = x0; x0 = y0; y0 = t; const t2 = x1; x1 = y1; y1 = t2; }
  const num = Math.abs(x1 - x0);
  const num2 = Math.abs(y1 - y0);
  let num3 = Math.trunc(num / 2);
  let num4 = y0;
  const num5 = x0 < x1 ? 1 : -1;
  const num6 = y0 < y1 ? 1 : -1;
  for (let i = x0; i !== x1; i += num5) {
    if (!plot(flag ? num4 : i, flag ? i : num4)) return false;
    num3 -= num2;
    if (num3 >= 0) continue;
    num4 += num6;
    if (!jump && !plot(flag ? num4 : i, flag ? i : num4)) return false;
    num3 += num;
  }
  return true;
}

/** Utils.PlotTileLine（Utils.cs:2428）1:1：主轴逐格步进，每步扫一条垂直带（jump=false）。
 *  start/end 为世界像素坐标；带宽 width 换算成法向半宽后取整格偏移。 */
function plotTileLineBand(startX: number, startY: number, endX: number, endY: number,
  width: number, plot: (x: number, y: number) => boolean): boolean {
  const half = width / 2;
  let dx = endX - startX, dy = endY - startY;
  const len = Math.hypot(dx, dy);
  if (len > 0) { dx /= len; dy /= len; }
  // 法向 × 半宽（Vector2D(-dir.Y, dir.X) * num）
  const nx = -dy * half, ny = dx * half;
  const toTile = (v: number) => Math.trunc(v / 16);
  const baseX = toTile(startX), baseY = toTile(startY);
  const offMinX = toTile(startX - nx) - baseX, offMinY = toTile(startY - ny) - baseY;
  const offMaxX = toTile(startX + nx) - baseX, offMaxY = toTile(startY + ny) - baseY;
  return plotLine(baseX, baseY, toTile(endX), toTile(endY), (x, y) =>
    plotLine(x + offMinX, y + offMinY, x + offMaxX, y + offMaxY, plot, false), true);
}

/** 钻头光束判定的世界视图（TileStore 结构子集） */
export interface DrillStore {
  w: number; h: number;
  type: ArrayLike<number>;
  wall: ArrayLike<number>;
  inBounds(x: number, y: number): boolean;
  idx(x: number, y: number): number;
  isActive(x: number, y: number): boolean;
}

/** 单束激光状态（Mount.cs DrillBeam :20-27） */
export interface DrillBeam {
  /** curTileTarget（-1,-1 = 空闲） */
  tx: number; ty: number;
  cooldown: number;
  /** lastPurpose：0 = 挖块 / 1 = 拆墙 */
  purpose: number;
}

/** useDrill 的实效回调（Game 侧接线：HitTile 挖掘管线 / 粒子 / 坡面平滑） */
export interface DrillHooks {
  /** controlUseItem（左键按住） */
  useItem: boolean;
  /** controlUseTile（右键按住） */
  useTile: boolean;
  /** Player.PickTile（:52839：镐力 210 走 HitTile 积累） */
  pickTile?(tx: number, ty: number): void;
  /** Player.PickWall（:45328：墙 HitTile type-2 积累 ≥100 即毁） */
  pickWall?(tx: number, ty: number): void;
  /** 命中尘（:3084-3092：dust 230 两粒垂直向） */
  dust?(x: number, y: number, n: number): void;
  /** Tile.SmoothSlope（:3094：命中后平滑邻接坡面） */
  smoothSlope?(tx: number, ty: number): void;
}

export const drillBeamIdle = (): DrillBeam => ({ tx: -1, ty: -1, cooldown: 0, purpose: 0 });

/** WorldGen.CanKillTile 子集（同 SmartCursor 口径：只看"镐可破坏"，不查承载结构；
 *  越界/未激活按 CanKillTile 的 null/inactive → false 处理） */
function drillCanKillTile(st: DrillStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y) || !st.isActive(x, y)) return false;
  return (TILE_DEFS[st.type[st.idx(x, y)]]?.pick ?? -1) >= 0;
}

/** DrillSmartCursor_Blocks（Mount.cs :3145-3179）1:1：
 *  从玩家中心朝鼠标方向扫带（65.6px 宽），途中第一块"可破坏实体格"即目标；
 *  已被其他束以挖块目的锁定的格跳过（两束分工）。无目标返回 null。 */
export function drillBlockTarget(
  st: DrillStore, centerX: number, centerY: number,
  aimX: number, aimY: number, beams: readonly DrillBeam[],
): { x: number; y: number } | null {
  const rawX = aimX - centerX, rawY = aimY - centerY;
  const dist = Math.hypot(rawX, rawY);
  let len = dist > DRILL_MAX_LENGTH ? DRILL_MAX_LENGTH : dist;
  len += 32;
  const inv = dist > 0 ? len / dist : 0;
  const endX = centerX + rawX * inv, endY = centerY + rawY * inv;
  let target: { x: number; y: number } | null = null;
  const hit = !plotTileLineBand(centerX, centerY, endX, endY, DRILL_BLOCK_BAND, (x, y) => {
    target = { x, y };
    for (const b of beams) {
      if (b.tx === x && b.ty === y && b.purpose === 0) return true;   // 已锁定 → 跳过
    }
    if (!drillCanKillTile(st, x, y)) return true;                     // 不可破坏 → 跳过
    return false;                                                     // 命中目标
  });
  return hit ? target : null;
}

/** DrillSmartCursor_Walls（Mount.cs :3181-3218）1:1：
 *  同向扫带（97.6px 宽 + 16px 延伸），第一格"有可拆背景墙"即目标。
 *  CanPlayerSmashWall（Player.cs:45303）取子集：wall 350 不可拆；wallHouse 3×3 曝露
 *  规则未实装（本仓锤墙路径同样不查——登记偏差）。 */
export function drillWallTarget(
  st: DrillStore, centerX: number, centerY: number,
  aimX: number, aimY: number, beams: readonly DrillBeam[],
): { x: number; y: number } | null {
  const rawX = aimX - centerX, rawY = aimY - centerY;
  const dist = Math.hypot(rawX, rawY);
  let len = dist > DRILL_MAX_LENGTH ? DRILL_MAX_LENGTH : dist;
  len += 32 + DRILL_WALL_EXTRA;
  const inv = dist > 0 ? len / dist : 0;
  const endX = centerX + rawX * inv, endY = centerY + rawY * inv;
  let target: { x: number; y: number } | null = null;
  const hit = !plotTileLineBand(centerX, centerY, endX, endY, DRILL_WALL_BAND, (x, y) => {
    target = { x, y };
    for (const b of beams) {
      if (b.tx === x && b.ty === y && b.purpose === 1) return true;
    }
    if (!st.inBounds(x, y)) return false;            // 原版 tile==null → return false（即目标）
    const wall = st.wall[st.idx(x, y)];
    return !(wall > 0 && wall !== 350);              // 有可拆墙 → false（目标）
  });
  return hit ? target : null;
}

/** ClampToDeadZone（Mount.cs :5294-5332）——瞄准点贴着玩家时外推到死区边缘，
 *  避免零向量方向抖动。deadX/deadY = 各坐骑贴图半尺寸（9: 45×54 / 8: 80×80） */
export function clampToDeadZone(
  centerX: number, centerY: number, x: number, y: number, deadX: number, deadY: number,
): { x: number; y: number } {
  let dx = x - centerX, dy = y - centerY;
  if (dx > -deadX && dx < deadX && dy > -deadY && dy < deadY) {
    const sx = deadX / Math.abs(dx);
    const sy = deadY / Math.abs(dy);
    const s = sx > sy ? sy : sx;
    if (Number.isFinite(s)) { dx *= s; dy *= s; }
  }
  return { x: dx + centerX, y: dy + centerY };
}

/** Scutlix 索敌目标的实体视图（NPC.CanBeChasedBy 过滤后的候选，Player 侧组装） */
export interface ScutlixTarget { x: number; y: number; w: number; h: number }

/** UpdateEffects case 9/46 索敌段（Mount.cs :4884-4930）1:1：
 *  850px 内、朝向锥 ±60° 内、视线可达的最近敌怪（1500px 上限内取更近者） */
export function scutlixFindTarget(
  p: { x: number; y: number; w: number; h: number; facing: number },
  npcs: readonly ScutlixTarget[],
  los: (cx: number, cy: number, t: ScutlixTarget) => boolean,
): ScutlixTarget | null {
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  let best: ScutlixTarget | null = null;
  let found = false;
  let bestD = SCUTLIX_SEEK_MAX;
  for (const n of npcs) {
    const vx = n.x + n.w / 2 - cx, vy = n.y + n.h / 2 - cy;
    const d = Math.hypot(vx, vy);
    if (d >= SCUTLIX_SEEK_RANGE) continue;
    const bestDist = best ? Math.hypot(best.x + best.w / 2 - cx, best.y + best.h / 2 - cy) : 0;
    if (!((bestDist > d && d < SCUTLIX_SEEK_MAX) || !found)) continue;
    // 朝向锥（:4909-4918）：面右限 |角| ≤ π/3；面左限 |角| ≥ 2π/3
    const ang = Math.abs(Math.atan2(vy, vx));
    let cone = true;
    if (p.facing === 1 && ang > 1.047197594907988) cone = false;
    else if (p.facing === -1 && ang < 2.0943951461045853) cone = false;
    if (cone && los(cx, cy, n)) {
      bestD = d; best = n; found = true;
    }
  }
  return found ? best : null;
}

/**
 * 单坐骑实例状态机（Mount.cs 实例字段 + 行为 1:1）。
 * 玩家持有恒一个实例（player.mount），active 即骑乘中。
 */
export class MountInstance {
  active = false;
  type = -1;
  /** 当前帧索引（竖排帧条第 frame 行） */
  frame = 0;
  private frameCounter = 0;
  frameExtra = 0;
  private frameExtraCounter = 0;
  /** 帧状态机态（FRAME_*） */
  frameState = FRAME_STANDING;
  /** 飞行剩余 tick（flightTimeMax；ResetFlightTime 重置） */
  flyTime = 0;
  /** 飞行疲劳（hover 族用尽 flyTime 后累积，疲劳越高爬升越弱） */
  fatigue = 0;
  /** 疲劳池上限（Mount._fatigueMax；公开供测试与 runSpeed 的疲劳比直读） */
  fatigueMax = 0;
  abilityCharging = false;
  abilityCharge = 0;
  abilityCooldown = 0;
  abilityDuration = 0;
  /** 钻头激光激活态（Mount.cs _abilityActive :357；UseAbility case 8 开合） */
  abilityActive = false;
  /** Scutlix/Santank 瞄准中（_aiming :359——眼部帧与朝向锁定门 AllowDirectionChange） */
  aiming = false;
  /** Scutlix 背向移动时动画倒放（_flipDraw :327；UpdateFrame :4247/:4455 消费） */
  flipDraw = false;
  /** 猪鲨崽 MountFishronSpecial 计数器（Player.MountFishronSpecialCounter :2868） */
  fishronCounter = 0;
  /** 猪鲨崽增益本 tick 生效缓存（UpdateEffects case 12 先算后消费） */
  fishronBoost = false;
  /** 坐骑特殊跳（hasJumpOption_*）空中段是否已消费（Player.canJumpAgain_* 语义） */
  mountJumpReady = false;
  /** 坐骑特殊跳进行中（isPerformingJump_*——蜥蜴/山羊两版源码均无复位，骑乘期内常驻） */
  mountJumpPerforming = false;
  // ---- 钻头坐骑（mount 8）专属态（DrillMountData :36-50） ----
  private drillBeams: DrillBeam[] = [drillBeamIdle(), drillBeamIdle()];
  private drillBeamCooldown = 0;
  /** 二极管当前角（AimAbility 目标角的 0.85/0.15 lerp，UpdateDrill :3011） */
  diodeRotation = 0;
  diodeRotationTarget = 0;
  /** 外环旋转（Hover case 8 :3474-3488：随 vx/80 累积，供背层贴图旋转） */
  outerRingRotation = 0;
  /** 光标世界位（crosshairPosition :48——本地玩家=鼠标世界坐标） */
  crosshairX = 0;
  crosshairY = 0;
  /** 离地行走宽限（UpdateFrame :3599：vy!=0 起每帧 -1，归零才切空中帧） */
  walkingGraceTime = 0;
  private idleTime = 0;
  private idleTimeNext = -1;
  /** 待机随机数种子（UpdateFrame state0 idle 触发 rand(900,1500) 的本仓等价） */
  private idleRand = Math.random();

  get data(): MountData | null {
    return this.active ? MOUNT_DATA[String(this.type)] ?? null : null;
  }

  /** 矿车族：物理由 Minecart.ts 接管（Player.ridingCart 分支），本实例只保留参数查询 */
  get isCart(): boolean {
    return this.active && isCartMount(this.type);
  }

  get buff(): number { return this.data?.buff ?? -1; }
  get bodyFrame(): number { return this.data?.bodyFrame ?? 3; }
  get heightBoost(): number { return this.data?.heightBoost ?? 0; }
  get blockExtraJumps(): boolean { return !!this.data?.blockExtraJumps; }
  get autoJump(): boolean { return !!this.data?.constantJump; }
  get fallDamageFactor(): number { return this.data?.fallDamage ?? 1; }
  get extraFall(): number { return this.data?.extraFall ?? 0; }
  /** 游泳族门：坐骑 buff 在水下自由集内（Player.cs:9592-9608 的 ignoreWater 等价） */
  get swimFree(): boolean { return this.active && BUFF_SWIM_FREE.has(this.buff); }

  // ---- Mount.cs RunSpeed getter :451-486（每坐骑特例 1:1） ----
  runSpeed(): number {
    const d = this.data;
    if (!d) return 0;
    // 海龟/猪鲨崽/海盗船/熔岩鲨：游泳帧态下取 swimSpeed
    if (this.type === 4 && this.frameState === FRAME_SWIMMING) return d.swimSpeed ?? d.runSpeed;
    if ((this.type === 12 || this.type === 44 || this.type === 49) && this.frameState === FRAME_SWIMMING) {
      return d.swimSpeed ?? d.runSpeed;
    }
    if (this.type === 12 && this.frameState === FRAME_IN_AIR) return d.runSpeed + 13.5;
    if (this.type === 44 && this.frameState === FRAME_IN_AIR) return d.runSpeed + 4;
    if (this.type === 5 && this.frameState === FRAME_IN_AIR) {
      const t = this.fatigueMax > 0 ? this.fatigue / this.fatigueMax : 0;
      return d.runSpeed + 4 * (1 - t);
    }
    if (this.type === 50 && this.frameState === FRAME_IN_AIR) return d.runSpeed + 2;
    return d.runSpeed;
  }

  get dashSpeed(): number { return this.data?.dashSpeed ?? this.data?.runSpeed ?? 0; }
  get acceleration(): number { return this.data?.acceleration ?? 0.1; }
  /** MountData.dashSpeed 裸值（C# 字段默认 0——14/17/37/43/52 五坐骑未设）。
   *  上方 dashSpeed 的 runSpeed 回退是旧接入的近似（accRunSpeed 用途下与 0 等价），
   *  冲刺门（免击退/冲刺帧）按原版取裸值 */
  get dashSpeedRaw(): number { return this.data?.dashSpeed ?? 0; }

  /** UpdateEffects :4933/:4877/:4956/:4963 授予的空中再跳（hasJumpOption_*）。
   *  独角兽 10 / 圣诞坦克 46 / 山羊 47 / 蜥蜴 14——JumpMovement :20435-20688 链消费 */
  get jumpOption(): 'Unicorn' | 'Santank' | 'WallOfFleshGoat' | 'Basilisk' | null {
    if (!this.active) return null;
    switch (this.type) {
      case 10: return 'Unicorn';
      case 46: return 'Santank';
      case 47: return 'WallOfFleshGoat';
      case 14: return 'Basilisk';
      default: return null;
    }
  }

  /** 特殊跳跳跃保持时长（JumpMovement :20603/:20631/:20659：
   *  独角兽/山羊 = jumpHeight×2；蜥蜴 = trunc(jumpHeight×0.75)） */
  mountJumpTicks(): number {
    const jh = this.data?.jumpHeight ?? 0;
    return this.type === 14 ? Math.trunc(jh * 0.75) : jh * 2;
  }

  /** 冲刺态免击退门（UpdateEffects :4962/:4968：|vx| > DashSpeed - RunSpeed/2）。
   *  蜥蜴未设 dashSpeed（裸值 0）→ 门恒过——原版同款数值怪癖，照抄 */
  dashNoKnockback(vx: number): boolean {
    if (!this.active) return false;
    return Math.abs(vx) > this.dashSpeedRaw - this.runSpeed() / 2;
  }

  /** 冲刺帧触发门（UpdateFrame case 10/40/41/42/47 :3827）——与免击退同式 */
  isDashingSpeed(vx: number): boolean {
    return Math.abs(vx) > this.dashSpeedRaw - this.runSpeed() / 2;
  }

  /** Mount.AllowDirectionChange（:604-615）：Scutlix/Santank 瞄准中锁朝向
   *  （Player.cs:19549 HorizontalMovement 改向门） */
  get allowDirectionChange(): boolean {
    if (this.type !== 9 && this.type !== 46) return true;
    return !this.aiming;
  }

  /** 猪鲨崽增益判定（Player.cs:3882-3896 MountFishronSpecial 1:1）：
   *  半血以下 / 水湿（岩浆蜂蜜不算）/ 滴水 buff 103 / 计数器 > 0 / 雨中露天
   *  任一成立即全额（hover ×1、移速不减半、四系伤害 +15%）。
   *  dripping（buff 103）本仓未实装，按 false 计——计数器已覆盖出水后的 420t 余效 */
  fishronSpecial(p: FishronView): boolean {
    const half = Math.floor(p.maxHp / 2);   // C# int 除法
    if (p.hp >= half && (!p.inWater || p.inLava || p.inHoney)
      && !(this.fishronCounter > 0)) {
      if (p.raining) return p.windExposed;
      return false;
    }
    return true;
  }

  /** 猪鲨崽计数器维护（UpdateEffects case 12 :4996-5003）：
   *  先衰减（Player.cs:25340 UpdateBuffs 段）再判增益；
   *  半血以下 → 60；湿身或雨中露天 → 420（离开后的余效时长） */
  updateFishron(p: FishronView): boolean {
    if (this.fishronCounter > 0) this.fishronCounter -= 1;
    this.fishronBoost = this.fishronSpecial(p);
    const half = Math.floor(p.maxHp / 2);
    if (p.hp <= half) this.fishronCounter = FISHRON_COUNTER_LOW_HP;
    if (p.inWater || (p.raining && p.windExposed)) this.fishronCounter = FISHRON_COUNTER_WET;
    return this.fishronBoost;
  }

  // ---- Mount.cs JumpHeight/JumpSpeed :2767-2816 ----
  jumpHeight(xVelocity: number): number {
    const d = this.data;
    if (!d) return 0;
    let n = d.jumpHeight;
    if (this.type === 0) n += Math.trunc(Math.abs(xVelocity) / 4);
    else if (this.type === 1) n += Math.trunc(Math.abs(xVelocity) / 2.5);
    else if ((this.type === 4 || this.type === 49) && this.frameState === FRAME_SWIMMING) n += 5;
    return n;
  }

  jumpSpeed(xVelocity: number): number {
    const d = this.data;
    if (!d) return 0;
    let n = d.jumpSpeed;
    if (this.type === 0 || this.type === 1) n += Math.abs(xVelocity) / 7;
    else if ((this.type === 4 || this.type === 49) && this.frameState === FRAME_SWIMMING) n += 2.5;
    return n;
  }

  // ---- Mount.cs CanFly/CanHover :2817-2859 ----
  canFly(p: MountedPlayerView): boolean {
    if (!this.active) return false;
    const d = this.data;
    if (!d) return false;
    if ((d.flightTimeMax ?? 0) === 0) return false;
    if (this.type === 48) return false;    // DarkMageBook 永不飞行
    void p;
    return true;
  }

  canHover(p: MountedPlayerView): boolean {
    if (!this.active) return false;
    const d = this.data;
    if (!d || !d.usesHover) return false;
    if (this.type === 49) return this.frameState === FRAME_SWIMMING;   // 熔岩鲨只在水中悬停
    void p;
    return true;
  }

  /** hover 是否豁免疲劳池——DoesHoverIgnoresFatigue（Mount.cs:3534-3542）是【固定
   *  类型表】{7,8,12,23,44,49,56,61}：这些坐骑永不耗能；只有蜜蜂 5 与暗黑魔法书
   *  48 真正吃能量池（曾误判为 fatigueMax<=0，致 UFO/钻头/猪鲨崽等全部误耗能坠落） */
  private static readonly HOVER_IGNORES_FATIGUE = new Set([7, 8, 12, 23, 44, 49, 56, 61]);
  private hoverIgnoresFatigue(): boolean {
    return MountInstance.HOVER_IGNORES_FATIGUE.has(this.type);
  }

  // ---- 能量/疲劳恢复（Mount.cs :2897-2945） ----
  abilityRecovery(): void {
    if (this.abilityCharging) {
      if (this.abilityCharge < (this.data?.abilityChargeMax ?? 0)) this.abilityCharge++;
    } else if (this.abilityCharge > 0) this.abilityCharge--;
    if (this.abilityCooldown > 0) this.abilityCooldown--;
    if (this.abilityDuration > 0) this.abilityDuration--;
  }

  fatigueRecovery(): void {
    if (this.fatigue > 2) this.fatigue -= 2;
    else this.fatigue = 0;
  }

  // ---- 钻头坐骑（mount 8）能力链（Mount.cs UpdateDrill/UseDrill/UseAbility/AimAbility） ----

  get isDrill(): boolean { return this.active && this.type === 8; }

  /** UpdateDrill（:3000-3021）每 tick 维护：光束冷却衰减（==1 档清目标）、
   *  二极管角向目标角 lerp、全局 beamCooldown 递减 */
  updateDrill(): void {
    for (const b of this.drillBeams) {
      if (b.cooldown > 1) b.cooldown--;
      else if (b.cooldown === 1) { b.cooldown = 0; b.tx = -1; b.ty = -1; }
    }
    this.diodeRotation = this.diodeRotation * 0.85 + 0.15 * this.diodeRotationTarget;
    if (this.drillBeamCooldown > 0) this.drillBeamCooldown--;
  }

  /** AimAbility case 8（:5465-5498）：光标死区外推 → 二极管目标角（取最短旋转路径）。
   *  aimX/aimY = 鼠标世界坐标（本地玩家） */
  aimDrill(centerX: number, centerY: number, aimX: number, aimY: number): boolean {
    const c = clampToDeadZone(centerX, centerY, aimX, aimY,
      DRILL_TEXTURE_SIZE.x, DRILL_TEXTURE_SIZE.y);
    let target = Math.atan2(c.y - centerY, c.x - centerX);
    if (target < 0) target += Math.PI * 2;
    this.diodeRotationTarget = target;
    let cur = this.diodeRotation % (Math.PI * 2);
    if (cur < 0) cur += Math.PI * 2;
    if (cur < target) {
      if (target - cur > Math.PI) cur += Math.PI * 2;
    } else if (cur - target > Math.PI) {
      cur -= Math.PI * 2;
    }
    this.diodeRotation = cur;
    this.crosshairX = aimX;
    this.crosshairY = aimY;
    return true;
  }

  /** UseAbility case 8（:3282-3303）：toggleOn 边沿开激光（原版伴生光标投射物 453，
   *  本仓以 abilityActive 单一真源表达——释放按键即关，见 driveDrill） */
  setDrillActive(on: boolean): void {
    if (!on) {
      this.abilityActive = false;
    } else if (!this.abilityActive) {
      this.abilityActive = true;
    }
  }

  /** UseDrill（:3023-3143）1:1：激光激活 + 按住左键挖块 / 按住右键拆墙。
   *  每 tick 最多 DRILL_BEAMS 束齐射（各自找首个未被锁定的目标格）；
   *  挖掘实效经 hooks 回调（Game 侧接 HitTile 管线） */
  useDrill(p: MountedPlayerView, h: DrillHooks): void {
    if (this.type !== 8 || !this.abilityActive) return;
    const st = p.store as DrillStore | null;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    if (h.useItem && st) {
      for (let i = 0; i < DRILL_BEAMS; i++) {
        if (this.drillBeamCooldown !== 0) break;
        for (const beam of this.drillBeams) {
          if (beam.cooldown !== 0) continue;
          const t = drillBlockTarget(st, cx, cy, this.crosshairX, this.crosshairY, this.drillBeams);
          if (!t) continue;
          beam.tx = t.x; beam.ty = t.y;
          h.pickTile?.(t.x, t.y);
          h.dust?.(t.x * 16 + 8, t.y * 16 + 8, 2);
          h.smoothSlope?.(t.x, t.y);
          beam.cooldown = DRILL_PICK_TIME;
          beam.purpose = 0;
          break;
        }
      }
    }
    if (!h.useTile || !st) return;
    for (let i = 0; i < DRILL_BEAMS; i++) {
      if (this.drillBeamCooldown !== 0) break;
      for (const beam of this.drillBeams) {
        if (beam.cooldown !== 0) continue;
        const t = drillWallTarget(st, cx, cy, this.crosshairX, this.crosshairY, this.drillBeams);
        if (!t) continue;
        beam.tx = t.x; beam.ty = t.y;
        h.pickWall?.(t.x, t.y);
        h.dust?.(t.x * 16 + 8, t.y * 16 + 8, 2);
        beam.cooldown = DRILL_PICK_TIME;
        beam.purpose = 1;
        break;
      }
    }
  }

  /** 当前光束目标（渲染层消费：两束激光的终点格） */
  get beams(): readonly DrillBeam[] { return this.drillBeams; }

  // ---- Scutlix Gunner（mount 9）能力链（AimAbility/UseAbility/UpdateEffects case 9） ----

  /** ResetHeadPosition（:5281-5292）：失瞄后眼部帧复位、朝向解锁 */
  resetHeadPosition(): void {
    if (this.aiming) {
      this.aiming = false;
      this.frameExtra = 0;
      this.flipDraw = false;
    }
  }

  /** AimAbility case 9（:5338-5418）1:1：目标点死区外推 → 朝向翻转（±90° 外换向）+
   *  眼部瞄准帧分档（6..10 对应 ±112.5°/±67.5°/±22.5° 带）+ 背向移动倒放标记。
   *  返回 frameExtra 或朝向是否变化（原版返回值仅用于联网同步） */
  aimScutlix(p: MountedPlayerView, aimX: number, aimY: number): boolean {
    this.aiming = true;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const c = clampToDeadZone(cx, cy, aimX, aimY, SCUTLIX_TEXTURE_SIZE.x, SCUTLIX_TEXTURE_SIZE.y);
    const beforeFrame = this.frameExtra;
    const beforeDir = p.facing;
    let deg = Math.atan2(c.y - cy, c.x - cx) * 180 / Math.PI;
    if (deg > 90) { p.facing = -1; deg = 180 - deg; }
    else if (deg < -90) { p.facing = -1; deg = -180 - deg; }
    else { p.facing = 1; }
    this.flipDraw = (p.facing > 0 && p.vx < 0) || (p.facing < 0 && p.vx > 0);
    if (deg >= 0) {
      if (deg < 22.5) this.frameExtra = 8;
      else if (deg < 67.5) this.frameExtra = 9;
      else if (deg < 112.5) this.frameExtra = 10;
    } else if (deg > -22.5) {
      this.frameExtra = 8;
    } else if (deg > -67.5) {
      this.frameExtra = 7;
    } else if (deg > -112.5) {
      this.frameExtra = 6;
    }
    return this.frameExtra !== beforeFrame || p.facing !== beforeDir;
  }

  /** UseAbility case 9（:3223-3254）1:1：眼部双激光。
   *  出生点 = 玩家底心 + 眼偏移（frameExtra 档对应 2 连号）+ 朝向翻转 + 一帧初速前移；
   *  弹速 = 朝目标单位向量 ×14，伤害 150。fire 回调由 Player 侧接投射物桶 */
  fireScutlix(p: MountedPlayerView, aimX: number, aimY: number,
    fire: (x: number, y: number, vx: number, vy: number) => void): void {
    const c = clampToDeadZone(p.x + p.w / 2, p.y + p.h / 2, aimX, aimY,
      SCUTLIX_TEXTURE_SIZE.x, SCUTLIX_TEXTURE_SIZE.y);
    const bottomX = p.x + p.w / 2;
    const bottomY = p.y + p.h;
    const base = (this.frameExtra - SCUTLIX_EYE_FRAME_MIN) * 2;
    const xOff = this.data?.xOffset ?? 0;
    const yOff = this.data?.yOffset ?? 0;
    for (let i = 0; i < 2; i++) {
      const eye = SCUTLIX_EYE_OFFSETS[base + i];
      if (!eye) continue;
      const ex = p.facing === -1 ? bottomX - eye[0] - xOff : bottomX + eye[0] + xOff;
      const ey = bottomY + eye[1] + yOff;
      let dx = c.x - ex, dy = c.y - ey;
      const len = Math.hypot(dx, dy);
      if (len > 0) { dx = dx / len * 14; dy = dy / len * 14; }
      fire(ex + dx, ey + dy, dx, dy);
    }
  }

  /** UpdateEffects case 9/46 索敌-充能-开火主循环（:4875-4954，type 9 分支）：
   *  有目标且冷却归零 → 瞄准+停充+开火（冷却重置 20）；有目标冷却中 → 瞄准+持续充能；
   *  无目标 → 停充+头部复位。返回本 tick 是否开火 */
  updateScutlix(p: MountedPlayerView, target: ScutlixTarget | null,
    fire: (x: number, y: number, vx: number, vy: number) => void): boolean {
    if (this.type !== 9) return false;
    if (target) {
      const tx = target.x + target.w / 2, ty = target.y + target.h / 2;
      if (this.abilityCooldown === 0) {
        this.aimScutlix(p, tx, ty);
        this.stopAbilityCharge();
        this.fireScutlix(p, tx, ty, fire);
        return true;
      }
      this.aimScutlix(p, tx, ty);
      this.abilityCharging = true;
      return false;
    }
    this.abilityCharging = false;
    this.resetHeadPosition();
    return false;
  }

  /** StopAbilityCharge（:2886-2895）：9/46 停充并重置冷却/持续时长 */
  stopAbilityCharge(): void {
    if (this.type === 9 || this.type === 46) {
      this.abilityCharging = false;
      this.abilityCooldown = this.data?.abilityCooldown ?? 0;
      this.abilityDuration = this.data?.abilityDuration ?? 0;
    }
  }

  /** 每 tick 能力维护（Player.fixedUpdate 挂点，对应 Player.cs:25373 UpdateEffects
   *  的能力相关子集）：猪鲨崽计数器/增益旗 + Scutlix 索敌-充能-开火。
   *  在 mount.upkeep 之后调用——hover() 消费的 fishronBoost 在本 tick 内即新鲜 */
  updateMountEffects(p: MountedPlayerView, ctx: MountEffectsCtx): void {
    if (!this.active || this.isCart) return;
    if (this.type === 12) {
      this.updateFishron(ctx.fishron);
    } else {
      this.fishronBoost = false;
    }
    if (this.type === 9) {
      const target = scutlixFindTarget(p, ctx.scutlixTargets, ctx.los);
      this.updateScutlix(p, target, ctx.fireScutlixShot ?? (() => { /* 无投射物桶：静默 */ }));
    }
  }

  /** 非悬停飞行坐骑的能量消费（Flight :2937：flyTime 递减，耗尽返回 false） */
  flight(): boolean {
    if (this.flyTime <= 0) return false;
    this.flyTime--;
    return true;
  }

  resetFlightTime(p: MountedPlayerView): void {
    const d = this.data;
    this.flyTime = this.active ? d?.flightTimeMax ?? 0 : 0;
    // 驯鹿：落地瞬间按水平速度续飞（:5267 flyTime += |vx|*20）
    if (this.type === 0) this.flyTime += Math.trunc(Math.abs(p.vx) * 20);
  }

  // ---- 悬停物理（Mount.cs Hover :3310-3466 主体 1:1） ----
  hover(p: MountedPlayerView): boolean {
    const d = this.data;
    if (!d) return false;
    const noFatigue = this.hoverIgnoresFatigue();
    // 悬停生效帧态（:3313-3332）：默认空中/游泳；熔岩鲨限游泳；56/61 蝙蝠/精灵族含飞行
    let flyingState = this.frameState === FRAME_IN_AIR || this.frameState === FRAME_SWIMMING;
    if (this.type === 49) flyingState = this.frameState === FRAME_SWIMMING;
    if (this.type === 56 || this.type === 61) {
      flyingState = this.frameState === FRAME_IN_AIR || this.frameState === FRAME_FLYING;
    }
    if (flyingState) {
      let canLift = true;
      let mult = 1;
      // 猪鲨崽非增益态减半（:3354 `if (_type == 12 && !mountedPlayer.MountFishronSpecial) num = 0.5f`）——
      // 增益态 = 湿身/半血以下/雨中露天（见 fishronSpecial），湿身是【全额】而非减半
      if (this.type === 12 && !this.fishronBoost) mult = 0.5;
      const fatigueRatio = noFatigue ? 0 : this.fatigueMax > 0 ? this.fatigue / this.fatigueMax : 0;
      // 能量池：先吃 flyTime，尽后累积疲劳，疲劳满则失去升力（:3322-3342）
      if (!noFatigue) {
        if (this.flyTime > 0) this.flyTime--;
        else if (this.fatigue < this.fatigueMax) this.fatigue += 1;
        else canLift = false;
      }
      let vMin = 4 * fatigueRatio;
      let vMax = 4 * fatigueRatio;
      if (vMin === 0) vMin = -0.001;
      if (vMax === 0) vMax = -0.001;
      let vy = p.vy;
      // 升降输入（:3396-3424）
      if ((p.inputUp || p.inputJump) && canLift) {
        vMin = -2 - 6 * (1 - fatigueRatio);
        if (this.type === 56 || this.type === 61) vMin = -d.dashSpeed!;
        vy -= d.acceleration * mult;
      } else if (p.inputDown) {
        vMax = 8;
        if (this.type === 56 || this.type === 61) vMax = d.dashSpeed!;
        vy += d.acceleration * mult;
      }
      // 钳位带（:3426-3436：超带按 acceleration 回拉）
      if (vy < vMin) {
        vy = (vMin - vy < d.acceleration) ? vMin : vy + d.acceleration * mult;
      } else if (vy > vMax) {
        vy = (vy - vMax < d.acceleration) ? vMax : vy - d.acceleration * mult;
      }
      if (this.type === 56 || this.type === 61) {
        if (vMin !== -0.001) vy = Math.max(vy, vMin);
        if (vMax !== -0.001) vy = Math.min(vy, vMax);
      }
      p.vy = vy;
    } else if (!noFatigue) {
      // 非悬停帧态：正常重力（:3440）
      p.vy += DEFAULT_GRAVITY * p.gravDir;
    }
    return true;
  }

  /** 起跳瞬间向上的 hover 触发（Player.cs:26416：vy==0 且 CanHover 且按上且松键边沿） */
  tryStartHover(p: MountedPlayerView): void {
    if (p.vy === 0 && this.canHover(p) && p.inputUp && !p.prevInputJump) {
      p.vy = -(this.acceleration + DEFAULT_GRAVITY + 0.001);
    }
  }

  /** 退出飞行帧态探测（Mount.cs TryBeginningFlight :4509-4528） */
  tryBeginningFlight(p: MountedPlayerView, state: number): void {
    if (this.frameState === state || (state !== FRAME_IN_AIR && state !== FRAME_FLYING)
      || !this.canHover(p) || p.inputUp || p.inputDown || p.inputJump) return;
    const st = p.store;
    if (!st) return;
    const ty = Math.floor((p.y + p.h + 1) / 16);
    let blocked = false;
    for (let tx = Math.floor(p.x / 16); tx <= Math.floor((p.x + p.w - 1) / 16); tx++) {
      if (st.inBounds(tx, ty) && st.flags[st.idx(tx, ty)] && st.isSolid(tx, ty)) { blocked = true; break; }
    }
    if (blocked && this.hoverIgnoresFatigue()) p.y -= 0.001;
  }

  /** 落地帧态探测（Mount.cs TryLanding :4544-4558：无升降输入且下方 4px 无地面） */
  tryLanding(p: MountedPlayerView): void {
    if ((this.frameState === FRAME_FLYING || this.frameState === FRAME_IN_AIR)
      && !p.inputUp && !p.inputDown && !p.inputJump) {
      const st = p.store;
      if (!st) return;
      const ty = Math.floor((p.y + p.h + 4) / 16);
      let grounded = false;
      for (let tx = Math.floor(p.x / 16); tx <= Math.floor((p.x + p.w - 1) / 16); tx++) {
        if (st.inBounds(tx, ty) && st.flags[st.idx(tx, ty)] && st.isSolid(tx, ty)) { grounded = true; break; }
      }
      if (!grounded) this.updateFrame(p, this.intendedGroundedFrame(p), p.vx, p.vy);
    }
  }

  /** 地面帧态意图（Mount.cs GetIntendedGroundedFrame :4529-4543） */
  intendedGroundedFrame(p: MountedPlayerView): number {
    const still = p.vx === 0;
    if (still) return FRAME_STANDING;
    return FRAME_RUNNING;
  }

  // ---- 帧状态机（Mount.cs UpdateFrame :3563-4490 的通用路径 + 常用族特例） ----
  updateFrame(p: MountedPlayerView, state: number, vx: number, vy: number): void {
    const d = this.data;
    if (!d) return;
    if (this.frameState !== state) {
      this.frameState = state;
      this.frameCounter = 0;
    }
    if (state !== FRAME_STANDING) this.idleTime = 0;
    // 离地行走宽限（:3599-3607）
    if (vy === 0) this.walkingGraceTime = d.walkingGraceTimeMax ?? 0;
    else if (this.walkingGraceTime > 0) this.walkingGraceTime--;
    if (p.inputDown && p.vy > 0) this.walkingGraceTime = 0;

    // ---- 每坐骑特例段（Mount.cs UpdateFrame 首个 switch(_type) :3619-4130） ----
    switch (this.type) {
      case 7:
        // UFO 帧组恒取空中组（:3688 case 7: state = 2）——frameState 本身不变
        state = FRAME_IN_AIR;
        break;
      case 9:
        // Scutlix 眼部待机动画（:3715-3730）：非瞄准时 0-5 帧 @12 循环；瞄准中由
        // aimScutlix 直接驱动 frameExtra（6-10 档），此处跳过
        if (this.aiming) break;
        this.frameExtraCounter += 1;
        if (this.frameExtraCounter >= 12) {
          this.frameExtraCounter = 0;
          this.frameExtra++;
          if (this.frameExtra >= SCUTLIX_EYE_FRAME_MIN) this.frameExtra = 0;
        }
        break;
      case 46:
        // 圣诞坦克腿部副帧（:3731-3774）：非站立态一律按跑动；待机 12 / 行走 12-23
        // 随 |vx| @8 / 瞄准中 24-26 @3
        if (state !== FRAME_STANDING) state = FRAME_RUNNING;
        if (!this.aiming) {
          if (state === FRAME_STANDING) { this.frameExtra = 12; this.frameExtraCounter = 0; break; }
          if (this.frameExtra < 12) this.frameExtra = 12;
          this.frameExtraCounter += Math.abs(vx);
          if (this.frameExtraCounter >= 8) {
            this.frameExtraCounter = 0;
            this.frameExtra++;
            if (this.frameExtra >= 24) this.frameExtra = 12;
          }
          break;
        }
        if (this.frameExtra < 24) this.frameExtra = 24;
        this.frameExtraCounter += 1;
        if (this.frameExtraCounter >= 3) {
          this.frameExtraCounter = 0;
          this.frameExtra++;
          if (this.frameExtra >= 27) this.frameExtra = 24;
        }
        break;
      case 50:
        // 史后坐骑（皇后史莱姆）挤压副帧（:4041-4061）：落地恒 3；空中 0-3 @7 循环
        //（flyTime 有余时双倍速）。该副帧驱动 Extra_206/207 眼翼层（见 Renderer）
        if (vy === 0) {
          this.frameExtraCounter = 0;
          this.frameExtra = 3;
          break;
        }
        this.frameExtraCounter += 1;
        if (this.flyTime > 0) this.frameExtraCounter += 1;
        if (this.frameExtraCounter > 7) {
          this.frameExtraCounter = 0;
          this.frameExtra++;
          if (this.frameExtra > 3) this.frameExtra = 0;
        }
        break;
      case 10:
      case 40:
      case 41:
      case 42:
      case 47: {
        // 冲刺帧门（:3827-3838）：跑动中 |vx| > DashSpeed-RunSpeed/2 → 切冲刺帧组；
        // frameExtra 为冲刺尘节奏计数（每 6 拍一簇——尘效未接，登记）
        const flag6 = this.isDashingSpeed(vx);
        if (state === FRAME_RUNNING) {
          if (flag6) {
            state = FRAME_DASHING;
            this.frameExtra++;      // 原版无上限自增（:3836），离开冲刺态即归零
          } else {
            this.frameExtra = 0;
          }
        }
        break;
      }
      default:
        break;
    }

    switch (state) {
      case FRAME_STANDING: {
        // 待机帧（:4139-4226）：站立 delay 计数 + idle 段（rand(900,1500) 后播 idle 动画）
        if ((d.idleFrameCount ?? 0) !== 0) {
          if (this.idleTime === 0) {
            this.idleTimeNext = 900 + Math.trunc(this.idleRand * 600);
            if (this.type === 2) this.idleTimeNext = 600 + Math.trunc(this.idleRand * 300);
            this.idleRand = Math.random();
          }
          this.idleTime++;
        }
        this.frameCounter += 1;
        if ((d.idleFrameCount ?? 0) !== 0 && this.idleTime >= this.idleTimeNext) {
          const delay = d.idleFrameDelay ?? 12;
          const step = Math.trunc((this.idleTime - this.idleTimeNext) / delay);
          if (step >= (d.idleFrameCount ?? 0)) {
            if (d.idleFrameLoop) { this.idleTime = this.idleTimeNext; this.frame = d.idleFrameStart ?? 0; }
            else { this.frameCounter = 0; this.frame = d.standingFrameStart ?? 0; this.idleTime = 0; }
          } else {
            this.frame = (d.idleFrameStart ?? 0) + step;
          }
        } else if (this.frameCounter > (d.standingFrameDelay ?? 12)) {
          this.frameCounter -= d.standingFrameDelay ?? 12;
          this.frame++;
        }
        if (this.frame < (d.standingFrameStart ?? 0)
          || this.frame >= (d.standingFrameStart ?? 0) + Math.max(1, d.standingFrameCount ?? 1)) {
          this.frame = d.standingFrameStart ?? 0;
        }
        break;
      }
      case FRAME_RUNNING: {
        // 跑动帧速率 = 水平速度（:4228-4292）；海盗船/暗黑魔法书族取速度比例；
        // Scutlix/圣诞坦克背向移动（flipDraw）时速率取负——帧倒放（:4245-4291）
        let rate = Math.abs(vx);
        if (this.type === 44) rate = Math.max(1, Math.abs(vx) * 0.25);
        if (this.type === 48) rate = Math.max(0.5, Math.hypot(vx, vy) * 0.125);
        if (this.type === 50) rate = Math.abs(vx) * 0.5;
        if ((this.type === 9 || this.type === 46) && this.flipDraw) rate = -Math.abs(vx);
        this.frameCounter += rate;
        if (rate >= 0) {
          if (this.frameCounter > (d.runningFrameDelay ?? 12)) {
            this.frameCounter -= d.runningFrameDelay ?? 12;
            this.frame++;
          }
          if (this.frame < (d.runningFrameStart ?? 0)
            || this.frame >= (d.runningFrameStart ?? 0) + Math.max(1, d.runningFrameCount ?? 1)) {
            this.frame = d.runningFrameStart ?? 0;
          }
        } else {
          // 倒放（:4281-4291）：计数为负才回退帧，出界钳到组尾
          if (this.frameCounter < 0) {
            this.frameCounter += d.runningFrameDelay ?? 12;
            this.frame--;
          }
          if (this.frame < (d.runningFrameStart ?? 0)
            || this.frame >= (d.runningFrameStart ?? 0) + Math.max(1, d.runningFrameCount ?? 1)) {
            this.frame = (d.runningFrameStart ?? 0) + Math.max(1, d.runningFrameCount ?? 1) - 1;
          }
        }
        break;
      }
      case FRAME_FLYING: {
        this.frameCounter += 1;
        if (this.frameCounter > (d.flyingFrameDelay ?? 12)) {
          this.frameCounter -= d.flyingFrameDelay ?? 12;
          this.frame++;
        }
        if (this.frame < (d.flyingFrameStart ?? 0)
          || this.frame >= (d.flyingFrameStart ?? 0) + Math.max(1, d.flyingFrameCount ?? 1)) {
          this.frame = d.flyingFrameStart ?? 0;
        }
        break;
      }
      case FRAME_IN_AIR: {
        this.frameCounter += 1;
        if (this.frameCounter > (d.inAirFrameDelay ?? 12)) {
          this.frameCounter -= d.inAirFrameDelay ?? 12;
          this.frame++;
        }
        if (this.frame < (d.inAirFrameStart ?? 0)
          || this.frame >= (d.inAirFrameStart ?? 0) + Math.max(1, d.inAirFrameCount ?? 1)) {
          this.frame = d.inAirFrameStart ?? 0;
        }
        // 蜜蜂悬停副帧（翅膀层 :4412-4425：疲劳越低拍越快）
        if (this.type === 5 && (d.fatigueMax ?? 0) > 0) {
          const t = this.fatigue / this.fatigueMax;
          this.frameExtraCounter += 6 - 4 * t;
          if (this.frameExtraCounter > (d.flyingFrameDelay ?? 12)) {
            this.frameExtra++;
            this.frameExtraCounter -= d.flyingFrameDelay ?? 12;
          }
          if (this.frameExtra < (d.flyingFrameStart ?? 0)
            || this.frameExtra >= (d.flyingFrameStart ?? 0) + Math.max(1, d.flyingFrameCount ?? 1)) {
            this.frameExtra = d.flyingFrameStart ?? 0;
          }
        }
        break;
      }
      case FRAME_SWIMMING: {
        // 游泳帧速率 = 平均速度（:4427-4446）
        const rate = Math.trunc((Math.abs(vx) + Math.abs(vy)) / 2);
        this.frameCounter += rate;
        if (this.frameCounter > (d.swimFrameDelay ?? 12)) {
          this.frameCounter -= d.swimFrameDelay ?? 12;
          this.frame++;
        }
        if (this.frame < (d.swimFrameStart ?? 0)
          || this.frame >= (d.swimFrameStart ?? 0) + Math.max(1, d.swimFrameCount ?? 1)) {
          this.frame = d.swimFrameStart ?? 0;
        }
        break;
      }
      case FRAME_DASHING: {
        // 冲刺帧速率（:4452-4480）：Scutlix 背向移动倒放，其余按 |vx|
        const rate = this.type === 9 && this.flipDraw ? -Math.abs(vx) : Math.abs(vx);
        this.frameCounter += rate;
        if (rate >= 0) {
          if (this.frameCounter > (d.dashingFrameDelay ?? 40)) {
            this.frameCounter -= d.dashingFrameDelay ?? 40;
            this.frame++;
          }
          if (this.frame < (d.dashingFrameStart ?? 0)
            || this.frame >= (d.dashingFrameStart ?? 0) + Math.max(1, d.dashingFrameCount ?? 1)) {
            this.frame = d.dashingFrameStart ?? 0;
          }
        } else {
          if (this.frameCounter < 0) {
            this.frameCounter += d.dashingFrameDelay ?? 40;
            this.frame--;
          }
          if (this.frame < (d.dashingFrameStart ?? 0)
            || this.frame >= (d.dashingFrameStart ?? 0) + Math.max(1, d.dashingFrameCount ?? 1)) {
            this.frame = (d.dashingFrameStart ?? 0) + Math.max(1, d.dashingFrameCount ?? 1) - 1;
          }
        }
        break;
      }
    }
  }

  /** 每帧帧态调度（Player.cs:35745-35790 的 mount.UpdateFrame 分派 1:1）。
   *  飞行帧态门 = FlyTime>0 && jump==0 && controlJump && !CanHover（:35734） */
  updateFrameDispatch(p: MountedPlayerView): void {
    if (p.vy !== 0 && this.walkingGraceTime <= 0) {
      if (this.flyTime > 0 && p.inputJump && !this.canHover(p)) {
        this.tryBeginningFlight(p, FRAME_FLYING);
        this.updateFrame(p, FRAME_FLYING, p.vx, p.vy);
        this.tryLanding(p);
      } else if (p.inWater) {
        this.updateFrame(p, FRAME_SWIMMING, p.vx, p.vy);
      } else {
        this.tryBeginningFlight(p, FRAME_IN_AIR);
        this.updateFrame(p, FRAME_IN_AIR, p.vx, p.vy);
        this.tryLanding(p);
      }
    } else {
      this.updateFrame(p, this.intendedGroundedFrame(p), p.vx, p.vy);
    }
  }

  // ---- 上下坐骑 ----

  /** 上坐骑（Mount.cs SetMount :6184-6296）：同型/无效 id/蜜蜂浸水 拒绝；
   *  换骑先复位旧实例。坐骑 buff（AddBuff(buff,3600)）不入 BuffState——原版该 buff
   *  是 TimeLeftDoesNotDecrease 的占位（每 tick 刷回 10t，掉 buff 即下坐），本仓以
   *  mount.active 单一真源表达，buff 附带效果（131/168/265 的 ignoreWater 等）由
   *  swimFree/免淹门直接消费；出生尘（DoSpawnDust :6363）经 game 回调 */
  setMount(m: number, p: MountedPlayerView & { buffs?: { remove(t: unknown): void } }, game?: {
    spawnParticles?(x: number, y: number, color: string, n: number, spd?: number): void;
  }): boolean {
    if (this.type === m || m < 0 || m >= MOUNT_COUNT) return false;
    if (m === 5 && p.inWater) return false;              // 蜜蜂座骑浸水不可上（:6190）
    if (this.active) {
      this.reset();
    }
    this.active = true;
    this.flyTime = 0;
    this.type = m;
    const d = this.data;
    this.fatigueMax = d?.fatigueMax ?? 0;
    // 眼炮族冷却下限（SetMount :6224-6231：Scutlix 上坐即预热 20 / 圣诞坦克 40）
    if (m === 9 && this.abilityCooldown < 20) this.abilityCooldown = 20;
    if (m === 46 && this.abilityCooldown < 40) this.abilityCooldown = 40;
    // 出生尘（DoSpawnDust :6363：spawnDust 族；本仓粒子为程序化圆，数量 10）
    if (game?.spawnParticles && d?.spawnDust) {
      game.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#C8C8C8', 10, 1.5);
    }
    return true;
  }

  /** 下坐空间检查（Mount.cs CanDismountWithResult :6600：42 高玩家盒能放下才许下） */
  canDismount(p: MountedPlayerView): boolean {
    const st = p.store;
    if (!st) return true;
    const h = 42;
    for (let tx = Math.floor(p.x / 16); tx <= Math.floor((p.x + p.w - 1) / 16); tx++) {
      for (let ty = Math.floor((p.y + p.h - h) / 16); ty <= Math.floor((p.y + p.h - 1) / 16); ty++) {
        if (st.inBounds(tx, ty) && st.flags[st.idx(tx, ty)] && st.isSolid(tx, ty)) return false;
      }
    }
    return true;
  }

  tryDismount(p: MountedPlayerView): boolean {
    if (!this.canDismount(p)) return false;
    this.dismount(p);
    return true;
  }

  dismount(p?: MountedPlayerView, game?: {
    spawnParticles?(x: number, y: number, color: string, n: number, spd?: number): void;
  }): void {
    if (!this.active) return;
    if (game?.spawnParticles && this.data?.spawnDust) {
      game.spawnParticles((p?.x ?? 0) + (p?.w ?? 0) / 2, (p?.y ?? 0) + (p?.h ?? 0) / 2, '#C8C8C8', 10, 1.5);
    }
    this.reset();
  }

  reset(): void {
    this.active = false;
    this.type = -1;
    this.frame = 0;
    this.frameCounter = 0;
    this.frameExtra = 0;
    this.frameExtraCounter = 0;
    this.frameState = FRAME_STANDING;
    this.flyTime = 0;
    this.fatigue = 0;
    this.fatigueMax = 0;
    this.idleTime = 0;
    this.idleTimeNext = -1;
    this.abilityCharging = false;
    this.abilityCharge = 0;
    this.abilityCooldown = 0;
    this.abilityDuration = 0;
    this.abilityActive = false;
    this.aiming = false;
    this.flipDraw = false;
    this.fishronCounter = 0;
    this.fishronBoost = false;
    this.mountJumpReady = false;
    this.mountJumpPerforming = false;
    this.drillBeams = [drillBeamIdle(), drillBeamIdle()];
    this.drillBeamCooldown = 0;
    this.diodeRotation = 0;
    this.diodeRotationTarget = 0;
    this.outerRingRotation = 0;
    this.crosshairX = 0;
    this.crosshairY = 0;
    this.walkingGraceTime = 0;
  }

  /** 每 tick 维护（Player.fixedUpdate 挂点）：能量恢复 + 地面飞行时量回充 + 帧态机 */
  upkeep(p: MountedPlayerView): void {
    if (!this.active || this.isCart) return;
    this.abilityRecovery();
    if (p.onGround || p.vy === 0) {
      this.resetFlightTime(p);
      this.fatigueRecovery();
    }
    this.tryStartHover(p);
    this.updateFrameDispatch(p);
  }

  // ---- 渲染信息 ----

  /** 玩家绘制纵向偏移（Mount.PlayerOffset :409-423：playerYOffsets[当前帧]） */
  get playerOffset(): number {
    const d = this.data;
    if (!d || !d.playerYOffsets?.length) return 0;
    if (this.frame >= d.totalFrames) return 0;
    return d.playerYOffsets[this.frame] ?? 0;
  }

  get textures(): { back?: string; front?: string; backExtra?: string; frontExtra?: string } {
    const d = this.data;
    if (!d) return {};
    const f = (n?: string) => (n ? `vanilla/${n}` : undefined);
    return { back: f(d.backTexture), front: f(d.frontTexture), backExtra: f(d.backTextureExtra), frontExtra: f(d.frontTextureExtra) };
  }
}

/** 物品 id（vanilla）→ 坐骑 id；非召唤物返回 -1 */
export function mountOfItem(vanillaItemId: number): number {
  const m = ITEM_TO_MOUNT[String(vanillaItemId)];
  return m === undefined ? -1 : m;
}

/** 坐骑 buff id → 坐骑 id（BuffID.Sets.MountType） */
export function mountOfBuff(buffId: number): number {
  const m = BUFF_TO_MOUNT[String(buffId)];
  return m === undefined ? -1 : m;
}
