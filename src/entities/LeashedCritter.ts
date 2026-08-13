// ============================================================================
// LeashedEntity 拴绳实体系统（1.4.4+，标杆 = Terarria1456 反编译全目录）
//
// 原版结构（全部 1:1 对表，行号随实现标注）：
//   Terraria.GameContent/LeashedEntity.cs          —— 注册表 + 按 section 流式
//     更新/绘制（Registry.RegisterAll :113-135 / UpdateEntities :411 /
//     DrawEntities :474；DrawNPCs(behindTiles:false) 起手调 :22163）
//   Terraria.GameContent/LeashedEntities/LeashedCritter.cs
//     —— 拴绳小动物基类：锚桩格 AnchorPosition + 可放回物品（SetDefaults 取
//     sample.makeNPC；Recall :115 越界拉回 = 锚桩中心-16px）
//   Terraria.GameContent.LeashedEntities/{Walker,Crawler,Snail,Runner,Flyer,
//     Fly,NormalButterfly,EmpressButterfly,HellButterfly,Firefly,ShimmerFly,
//     Dragonfly,CrawlingFly,Bird,Waterfowl,Fish,Fairy,Jumper,WaterStrider}
//     LeashedCritter.cs —— 19 个原型（Registry 注册序即 Type 1-19）
//   Terraria.GameContent.LeashedEntities/LeashedKite.cs —— 风筝（Type 0）
//   Terraria.GameContent.Tile_Entities/TECritterAnchor.cs —— tile 724 锚桩 TE：
//     static ctor SetPrototypeCollection 全表（:64-84）按 **makeNPC** 选原型
//   Terraria.GameContent.Tile_Entities/TEKiteAnchor.cs —— tile 723 风筝锚桩 TE
//     （CreateLeashedEntity :54-62 取 ContentSamples.ItemsByType[itemType].shoot）
//   TELeashedEntityAnchor.cs / TELeashedEntityAnchorWithItem.cs —— 放置钩
//     （InsertItem → RespawnLeashedEntity :47-53）/ OnWorldLoaded 重生 / OnRemoved
//     消散 / DropItemForTileBreak 同击掉物
//
// 本仓等价（存档语义不变）：
//   - TE 存储沿用 world/FurnitureItems.ts 的单槽记录（critter_anchor / kite_anchor），
//     实体**不落盘**——读档由 respawnAll 从记录重生（= OnWorldLoaded），锚桩破坏
//     removeAt 消散（= OnRemoved → DespawnLeashedEntity），与原版生命周期完全一致
//   - 原型体系数据驱动：三套移动引擎（walker 地面步进 / flyer 定点巡飞 / jumper
//     弹道跳）+ 每原型参数表（PROTOTYPES），发光/缩放/淡出等族特效走 per-family
//     分支——与原版类层级（Walker→Crawler→Snail 等）一一对应
// ============================================================================
import type { TileStore } from '../world/TileStore';
import { TILE_DEFS } from '../data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { vanillaNpc } from '../data/vanillaNpcs';
import type { NetWriter, NetReader } from '../net/protocol';

// ============================================================================
// msg82 module13 拴绳实体信封（原版 LeashedEntity.NetModule，LeashedEntity.cs:13-107）
//   帧体由 net/leashedSync.ts 编解码；实体段（NetSend/NetReceive 字段序）在下方
//   两个实体类上。sub 编号 = 原版 MessageType 枚举序（Remove/FullSync/PartialSync），
//   PlaceRequest 为本仓新增的访客→房主请求（见 net/leashedSync.ts 信任边界注）
// ============================================================================

export const LEASHED_SUB_REMOVE = 0;
export const LEASHED_SUB_FULL = 1;
export const LEASHED_SUB_PARTIAL = 2;
/** 本仓新增：访客放置锚桩的请求（guest→host 定向转发；原版无——访客放置走
 *  SendTileObject 内联在 msg17 内由服务器重放，本仓 tile 层是客户端权威直通，
 *  实体层须显式请求。见 net/leashedSync.ts） */
export const LEASHED_SUB_PLACE_REQUEST = 3;
/** 本仓新增：访客右键取回锚桩存物的请求（guest→host 定向转发；原版锚桩无
 *  OnPlayerInteraction（TELeashedEntityAnchorWithItem 只有破坏掉物一路），右键
 *  取回是本仓扩展交互——访客端无 furnitureItems 记录，取回必须走房主权威。
 *  见 net/leashedSync.ts applyLeashedRetrieve） */
export const LEASHED_SUB_RETRIEVE_REQUEST = 4;
export const LEASHED_KIND_CRITTER = 0;
export const LEASHED_KIND_KITE = 1;

/** msg82 module13 解析后的信封（LeashedEntityManager 消费；PlaceRequest 只有 vid） */
export interface LeashedNetMsg {
  sub: number;
  netId: number;
  ax: number;
  ay: number;
  kind: number;
  vid: number;
  /** 实体段游标（sub 1/2；指向身份头之后或恒有段起点，见 netApplyFull/netApplyPartial） */
  r: NetReader;
}

/** 世界常量（LeashedCritter.cs:41-43） */
const GRAVITY = 0.3;
const MAX_FALL_SPEED = 10;
/** Recall 越界拉回的等待帧（State_Recalling 持续 20t，LeashedCritter.cs:45） */
const RECALL_DURATION = 20;
/** tile 像素边长 */
const T = 16;

// ============================================================================
// LCG32Random（Terraria.Utilities/LCG32Random.cs 1:1）——LeashedCritter.rand
//   state = state * -1856014347 + 1（uint32 回绕）；Next(max) = state*max >> 32
// ============================================================================

export class LCG32Random {
  state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  /** Advance（LCG32Random.cs:11-14）：imul 取 int32 乘积 + 1，>>>0 归无符号 */
  advance(): void {
    this.state = (Math.imul(this.state | 0, -1856014347) + 1) >>> 0;
  }
  /** Next(uint)（:16-20）：64 位乘高字截断 = floor(state*max / 2^32)（max < 2^21 时 double 精确） */
  next(maxValue: number): number {
    this.advance();
    return Math.floor((this.state * maxValue) / 4294967296);
  }
  /** Next(min,max)（:28-31） */
  range(minValue: number, maxValue: number): number {
    return minValue + this.next(maxValue - minValue);
  }
  /** NextFloat（:39-42） */
  nextFloat(): number {
    this.advance();
    return this.state / 4294967296;
  }
}

// ============================================================================
// 地形查询（WorldGen.SolidTile2 / AnyLiquidAt，1:1）
// ============================================================================

/**
 * WorldGen.SolidTile2(i, j)（WorldGen.cs:70500-70509）逐条件 1:1：
 *  active && tileSolid
 *  && ((Sets.Platforms[type] && (halfBrick || topSlope)) || slope == 0)
 *  && !halfBrick && !inActive
 *  ——平台特例（:70503）与后半 !halfBrick 互斥后仅剩"平台+上半坡（slope 1/2）"一档：
 *  平台平放（slope 0）走 `slope==0` 同样算实心（原版 Main.tileSolid[19]=true，拴绳
 *  小动物可站平台）；下半坡（3/4）一律不算。本仓 TILE_DEFS 平台族 solid=false
 *  （碰撞审计以独立 platform 旗承载），此处并入 tileSolid。
 */
export function solidTile2(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false; // 原版越界 Main.tile[i,j]==null → true；本仓越界恒空（防边缘卡死）
  const i = st.idx(x, y);
  if (st.type[i] === 0) return false;                       // !active
  if (st.wire[i] & 32) return false;                        // inActive（致动缩入）
  if (st.half[i]) return false;                             // halfBrick（含平台 halfBrick 变体——同被 !halfBrick 否决）
  const d = TILE_DEFS[st.type[i]];
  if (!d) return false;
  if (!d.solid && !d.platform) return false;                // !Main.tileSolid（平台族例外并入）
  const slope = st.slope[i];
  const topSlope = slope === 1 || slope === 2;              // Tile.tileData.topSlope()
  return (!!d.platform && topSlope) || slope === 0;
}

/**
 * WorldGen.InAPlaceWithWind(position, width, height)（WorldGen.cs:87586-87627）：
 *  ① DoesWindBlowAtThisHeight(tileY) = tileY < worldSurface（remixWorld 取反，本仓恒正世界）；
 *  ② 覆盖盒内任一格 liquid>0 或（wall>0 && !WallID.Sets.AllowsWind[wall]）→ false。
 *  AllowsWind 全表（WallID.cs:54）：{0,150,138,145,107,152,140,139,141,106,245,315,317}。
 *  风筝升力/风向的门槛判定（LeashedKite.Update :150 / KiteLogic :45865）
 */
const WALL_ALLOWS_WIND: ReadonlySet<number> = new Set([0, 150, 138, 145, 107, 152, 140, 139, 141, 106, 245, 315, 317]);

export function inAPlaceWithWind(
  st: TileStore, px: number, py: number, w: number, h: number, worldSurface: number,
): boolean {
  if (!(py / T < worldSurface)) return false;               // ①高度门（DoesWindBlowAtThisHeight）
  const x0 = Math.floor(px / T), y0 = Math.floor(py / T);
  const x1 = Math.floor((px + w) / T), y1 = Math.floor((py + h) / T);   // ToTileCoordinates（截断）
  for (let i = x0; i <= x1; i++) {
    for (let j = y0; j <= y1; j++) {                        // ② width = 1+x1-x0（含端点）
      if (!st.inBounds(i, j)) continue;                     // 原版 !InWorld 格直接跳过
      const k = st.idx(i, j);
      if (st.liquid[k] !== 0) return false;
      if (st.wall[k] !== 0 && !WALL_ALLOWS_WIND.has(st.wall[k])) return false;
    }
  }
  return true;
}

/**
 * WorldGen.AnyLiquidAt(x, y, liquidType=-1)（WorldGen.cs:70259-70277）：liquid>0。
 *  @param waterOnly true = 第三参 0（只认水，WaterStrider 站水面用）。
 *  ⚠️ 本仓液体类型 +1 编码（Water=0→1），禁止裸写 0（TileStore LIQUID_TYPE 注释）
 */
export function anyLiquidAt(st: TileStore, x: number, y: number, waterOnly = false): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (st.liquid[i] === 0) return false;
  return waterOnly ? st.liquidType[i] === 1 : true;
}

/**
 * DrawBubble 可见判定（LeashedCritter.Draw :200-205）：tile 取 _dummy.Center
 *  （= Center + (0,8)，CopyToDummy :171）；`(isAquatic && liquid<255) ||
 *  (!isAquatic && liquid>0)`——水生（FishLeashedCritter）在非满水格 / 陆生在
 *  有液格 时画 Gore_413 气泡
 */
export function leashedBubbleVisible(st: TileStore, cx: number, cy: number, isAquatic: boolean): boolean {
  const tx = Math.floor(cx / T), ty = Math.floor((cy + 8) / T);
  if (!st.inBounds(tx, ty)) return false;
  const liquid = st.liquid[st.idx(tx, ty)];
  return (isAquatic && liquid < 255) || (!isAquatic && liquid > 0);
}

// ============================================================================
// 原型注册表（LeashedEntity.Registry.RegisterAll :113-135 + 各族 ctor 参数）
// ============================================================================

/** 原型族（= Registry 注册序 1-19；0 = kite） */
export type LeashedFamily =
  | 'walker' | 'crawler' | 'snail' | 'runner'
  | 'flyer' | 'normalButterfly' | 'empressButterfly' | 'hellButterfly'
  | 'firefly' | 'shimmerFly' | 'dragonfly' | 'crawlingFly'
  | 'bird' | 'waterfowl' | 'fish' | 'fairy'
  | 'jumper' | 'waterStrider';

/** 移动引擎（三套：WalkerLeashedCritter / FlyerLeashedCritter / JumperLeashedCritter） */
export type MoveEngine = 'walker' | 'flyer' | 'jumper';

export interface LeashedPrototype {
  family: LeashedFamily;
  /** 放置帧档（Player.cs:42771-42773 previewPlaceStyle → frameX = style*18） */
  anchorStyle: number;
  move: MoveEngine;
  /** 活动半径（格）——LeashedCritter.strayingRangeInBlocks */
  straying: number;
  // ---- walker（WalkerLeashedCritter）----
  walkingPace?: number;
  // ---- flyer（FlyerLeashedCritter）----
  minWaitTime?: number;
  maxWaitTime?: number;
  maxFlySpeed?: number;
  acceleration?: number;
  brakeDuration?: number;
  rotationScalar?: number;
  hoverAmplitude?: number;
  hoverPeriod?: number;
  hasGroundBias?: boolean;
  /** 水生（FishLeashedCritter：isAquatic → DrawBubble 判定反转） */
  isAquatic?: boolean;
  /** Fly 族公共缩放随机段（FlyLeashedCritter.SetDefaults：0.75-1.11） */
  flyScale?: boolean;
  // ---- jumper（JumperLeashedCritter）----
  maxJumpWidth?: number;
  minJumpWidth?: number;
  maxJumpHeight?: number;
  maxJumpDuration?: number;
  jumpCooldown?: number;
  canStandOnWater?: boolean;
  // ---- 族特效 ----
  /** NormalButterfly：variant = item.placeStyle（物品 1994-2001 → 1-8） */
  butterflyVariant?: boolean;
  /** EmpressButterfly：玩家 >300px 渐隐（fadeAmount 0-50） */
  empressFade?: boolean;
  /** Firefly：明灭周期 + 昼地表门（FireflyLeashedCritter.cs:20-58） */
  fireflyGlow?: boolean;
  /** Fairy：环绕彩光 + 尘（FairyLeashedCritter.cs:14-47） */
  fairyGlow?: boolean;
  /** Snail：359 缩放随机 + 360/655 点光（SnailLeashedCritter.cs:10-28） */
  snailFx?: boolean;
  /** HellButterfly：暖色点光（HellButterflyLeashedCritter.cs:12-25） */
  hellGlow?: boolean;
  /** Waterfowl：vy!=0 → 画 NPC type+1 泳姿表（WaterfowlLeashedCritter.cs:16-21） */
  waterfowlSwimSheet?: boolean;
}

/** 逐原型参数表（各族 ctor 默认值 1:1）。
 *  继承关系按原版类层级折叠：Crawler/Runner = walker 改 pace+anchorStyle；
 *  Snail = Crawler + 缩放/点光；Fly 族（Normal/Empress/Hell/Firefly/ShimmerFly）
 *  = Flyer + Fly 缩放；Bird/Waterfowl/Fish/Dragonfly/CrawlingFly/Fairy = Flyer 派生 */
export const PROTOTYPES: Readonly<Record<LeashedFamily, LeashedPrototype>> = {
  // WalkerLeashedCritter.cs:31-34：pace 0.8 / straying 3 / style 0
  walker: { family: 'walker', anchorStyle: 0, move: 'walker', straying: 3, walkingPace: 0.8 },
  // CrawlerLeashedCritter.cs:9-14：style 1 / pace 0.4
  crawler: { family: 'crawler', anchorStyle: 1, move: 'walker', straying: 3, walkingPace: 0.4 },
  // SnailLeashedCritter（Crawler 子类 + SetDefaults/VisualEffects 覆写）
  snail: { family: 'snail', anchorStyle: 1, move: 'walker', straying: 3, walkingPace: 0.4, snailFx: true },
  // RunnerLeashedCritter.cs:9-14：style 1 / pace 1.5
  runner: { family: 'runner', anchorStyle: 1, move: 'walker', straying: 3, walkingPace: 1.5 },
  // FlyerLeashedCritter.cs:23-35：style 4 / straying 7 / wait 60-300 / speed 1 / accel 0.2 / brake 10
  flyer: {
    family: 'flyer', anchorStyle: 4, move: 'flyer', straying: 7,
    minWaitTime: 60, maxWaitTime: 300, maxFlySpeed: 1, acceleration: 0.2, brakeDuration: 10,
    rotationScalar: 0, hoverAmplitude: 0, hoverPeriod: 0, hasGroundBias: false,
  },
  // NormalButterflyLeashedCritter（Fly 子类 + variant = placeStyle）
  normalButterfly: {
    family: 'normalButterfly', anchorStyle: 4, move: 'flyer', straying: 7,
    minWaitTime: 60, maxWaitTime: 300, maxFlySpeed: 1, acceleration: 0.2, brakeDuration: 10,
    rotationScalar: 0, hoverAmplitude: 0, hoverPeriod: 0,
    flyScale: true, butterflyVariant: true,
  },
  empressButterfly: {
    family: 'empressButterfly', anchorStyle: 4, move: 'flyer', straying: 7,
    minWaitTime: 60, maxWaitTime: 300, maxFlySpeed: 1, acceleration: 0.2, brakeDuration: 10,
    rotationScalar: 0, hoverAmplitude: 0, hoverPeriod: 0,
    flyScale: true, empressFade: true,
  },
  hellButterfly: {
    family: 'hellButterfly', anchorStyle: 4, move: 'flyer', straying: 7,
    minWaitTime: 60, maxWaitTime: 300, maxFlySpeed: 1, acceleration: 0.2, brakeDuration: 10,
    rotationScalar: 0, hoverAmplitude: 0, hoverPeriod: 0,
    flyScale: true, hellGlow: true,
  },
  firefly: {
    family: 'firefly', anchorStyle: 4, move: 'flyer', straying: 7,
    minWaitTime: 60, maxWaitTime: 300, maxFlySpeed: 1, acceleration: 0.2, brakeDuration: 10,
    rotationScalar: 0, hoverAmplitude: 0, hoverPeriod: 0,
    flyScale: true, fireflyGlow: true,
  },
  shimmerFly: {
    family: 'shimmerFly', anchorStyle: 4, move: 'flyer', straying: 7,
    minWaitTime: 60, maxWaitTime: 300, maxFlySpeed: 1, acceleration: 0.2, brakeDuration: 10,
    rotationScalar: 0, hoverAmplitude: 0, hoverPeriod: 0,
    flyScale: true,
  },
  // DragonflyLeashedCritter.cs:9-17：wait 10 / speed 2.5 / accel 0.4 / brake 10
  dragonfly: {
    family: 'dragonfly', anchorStyle: 4, move: 'flyer', straying: 7,
    minWaitTime: 10, maxWaitTime: 300, maxFlySpeed: 2.5, acceleration: 0.4, brakeDuration: 10,
    rotationScalar: 0, hoverAmplitude: 0, hoverPeriod: 0, hasGroundBias: false,
  },
  // CrawlingFlyLeashedCritter.cs:9-21：groundBias + scale 0.7-0.9
  crawlingFly: {
    family: 'crawlingFly', anchorStyle: 4, move: 'flyer', straying: 7,
    minWaitTime: 60, maxWaitTime: 300, maxFlySpeed: 1, acceleration: 0.2, brakeDuration: 10,
    rotationScalar: 0, hoverAmplitude: 0, hoverPeriod: 0, hasGroundBias: true,
  },
  // BirdLeashedCritter.cs:10-22：style 2 / wait 120-420 / speed 1.2 / accel 0.1 /
  //   rot 0.25 / brake 10 / hover 3×0.005
  bird: {
    family: 'bird', anchorStyle: 2, move: 'flyer', straying: 7,
    minWaitTime: 120, maxWaitTime: 420, maxFlySpeed: 1.2, acceleration: 0.1, brakeDuration: 10,
    rotationScalar: 0.25, hoverAmplitude: 3, hoverPeriod: 0.005, hasGroundBias: false,
  },
  // WaterfowlLeashedCritter（Bird 子类 + groundBias + 泳姿表）
  waterfowl: {
    family: 'waterfowl', anchorStyle: 2, move: 'flyer', straying: 7,
    minWaitTime: 120, maxWaitTime: 420, maxFlySpeed: 1.2, acceleration: 0.1, brakeDuration: 10,
    rotationScalar: 0.25, hoverAmplitude: 3, hoverPeriod: 0.005, hasGroundBias: true,
    waterfowlSwimSheet: true,
  },
  // FishLeashedCritter.cs:10-30：style 3 / wait 120 / speed 0.5 / accel 0.015 /
  //   hover 10×0.003 / isAquatic
  fish: {
    family: 'fish', anchorStyle: 3, move: 'flyer', straying: 7,
    minWaitTime: 120, maxWaitTime: 300, maxFlySpeed: 0.5, acceleration: 0.015, brakeDuration: 10,
    rotationScalar: 0, hoverAmplitude: 10, hoverPeriod: 0.003, hasGroundBias: false,
    isAquatic: true,
  },
  // FairyLeashedCritter.cs:10-22：wait 30-90 / speed 1.1 / accel 0.05 / rot 0.25 / brake 30
  fairy: {
    family: 'fairy', anchorStyle: 4, move: 'flyer', straying: 7,
    minWaitTime: 30, maxWaitTime: 90, maxFlySpeed: 1.1, acceleration: 0.05, brakeDuration: 30,
    rotationScalar: 0.25, hoverAmplitude: 0, hoverPeriod: 0, hasGroundBias: false,
    fairyGlow: true,
  },
  // JumperLeashedCritter.cs:24-36：straying 12 / wait 180-300 / 跳宽 48-112 / 高 64 / 时长 30 / 冷却 60
  jumper: {
    family: 'jumper', anchorStyle: 0, move: 'jumper', straying: 12,
    minWaitTime: 180, maxWaitTime: 300,
    maxJumpWidth: 112, minJumpWidth: 48, maxJumpHeight: 64, maxJumpDuration: 30,
    jumpCooldown: 60, canStandOnWater: false,
  },
  // WaterStriderLeashedCritter.cs:11-25：wait 60-120 / straying 5 / 跳宽 8-32 / 高 0 /
  //   时长 14 / 冷却 15 / 站水面
  waterStrider: {
    family: 'waterStrider', anchorStyle: 0, move: 'jumper', straying: 5,
    minWaitTime: 60, maxWaitTime: 120,
    maxJumpWidth: 32, minJumpWidth: 8, maxJumpHeight: 0, maxJumpDuration: 14,
    jumpCooldown: 15, canStandOnWater: true,
  },
};

/**
 * TECritterAnchor static ctor 全表（TECritterAnchor.cs:64-84）——按 **NPC id**
 * （= Item.makeNPC）覆写原型。CreateCustomSet 缺省 = WalkerLeashedCritter，
 * SetPrototypeCollection 顺序覆写（661/653 先落 Flyer 再被 Empress/Hell 覆盖）。
 */
const PROTOTYPE_OVERRIDES: ReadonlyArray<readonly [LeashedFamily, readonly number[]]> = [
  // :67 Flyer（444 金蝶留在 Flyer；661/653 随后两行被覆盖）
  ['flyer', [444, 653, 661]],
  // :68 NormalButterfly（356 蝴蝶，variant = placeStyle 1-8）
  ['normalButterfly', [356]],
  // :69 EmpressButterfly（661 帝皇蝶，覆盖 Flyer）
  ['empressButterfly', [661]],
  // :70 HellButterfly（653 地狱蝶，覆盖 Flyer）
  ['hellButterfly', [653]],
  // :71 Firefly（355 萤火虫 / 358 闪电虫 / 654 熔岩蝇）
  ['firefly', [355, 358, 654]],
  // :72 ShimmerFly（677 微光之灵）
  ['shimmerFly', [677]],
  // :73 Dragonfly（595-600 六色蜻蜓 + 601 金蜻蜓）
  ['dragonfly', [595, 596, 601, 597, 598, 599, 600]],
  // :74 CrawlingFly（604/605 瓢虫 + 669 椿象）
  ['crawlingFly', [604, 605, 669]],
  // :75 Fairy（583 粉 / 584 绿 / 585 蓝）
  ['fairy', [585, 584, 583]],
  // :76 Crawler（357 蠕虫 / 448 金蠕虫 / 484-487 夜爬虫族 / 606 蛆 / 616/617 龟）
  ['crawler', [357, 448, 484, 485, 486, 487, 606, 616, 617]],
  // :77 Snail（359 蜗牛 / 360 发光蜗牛 / 655 熔岩蜗牛）
  ['snail', [359, 360, 655]],
  // :78 Runner（300 鼠 / 447 金鼠 / 610 大鼠）
  ['runner', [300, 447, 610]],
  // :79 Bird（74 鸟 / 297 蓝鸟 / 298 红鸟 / 442 金鸟 / 611 鸮 / 671/672 鹦鹉 /
  //   673 鹈鹕?见名 Toucan / 675/674 鸡尾鹦鹉）
  ['bird', [74, 297, 298, 442, 611, 671, 672, 673, 675, 674]],
  // :80 Waterfowl（362/364 鸭 / 602 海鸥 / 608 蹼鷉）
  ['waterfowl', [362, 364, 602, 608]],
  // :81 Fish（55 金鱼 / 592 金金鱼 / 607 鲤齿鱼 / 626/627 海马 / 688 河豚）
  ['fish', [55, 592, 607, 626, 627, 688]],
  // :82 Jumper（377 蚱蜢 / 446 金蚱蜢）
  ['jumper', [377, 446]],
  // :83 WaterStrider（612/613 水黾）
  ['waterStrider', [612, 613]],
];

/** NPC id → 原型族（缺省 walker = CreateCustomSet(WalkerLeashedCritter)） */
export const NPC_FAMILY: ReadonlyMap<number, LeashedFamily> = (() => {
  const m = new Map<number, LeashedFamily>();
  for (const [family, ids] of PROTOTYPE_OVERRIDES) {
    for (const id of ids) m.set(id, family);
  }
  return m;
})();

/** GetLeashedCritterPrototype（TECritterAnchor.cs:94-97）：makeNPC → 原型 */
export function prototypeOfNpc(npcType: number): LeashedPrototype {
  return PROTOTYPES[NPC_FAMILY.get(npcType) ?? 'walker'];
}

/**
 * Item.placeStyle（物品 def）——NormalButterfly 的 variant 取样源
 * （NormalButterflyLeashedCritter.SetDefaults :11-15 = sample.placeStyle）。
 * 读档重生路径（respawnAll）无放置上下文，按 vid 反查物品 def（= 原版
 * ContentSamples.ItemsByType[itemType].placeStyle 同源）
 */
export function placeStyleOfVid(itemVid: number): number {
  const key = VANILLA_ITEM_KEY_BY_ID[itemVid];
  if (key === undefined) return 0;
  const idx = ITEM_BY_KEY[key];
  return idx !== undefined ? ITEM_DEFS[idx]?.placeStyle ?? 0 : 0;
}

/**
 * 放置帧档（Player.cs:42771-42773）：`if (tileToCreate == 724)
 * previewPlaceStyle = GetLeashedCritterPrototype(sItem.type).anchorStyle` ——
 * 与物品自身 placeStyle 解耦（蝶族物品 placeStyle=物种变体 1-8，此处恒取 4）
 */
export function anchorStyleOfItem(itemVid: number): number {
  const npc = ITEM_MAKE_NPC[itemVid];
  return npc !== undefined ? prototypeOfNpc(npc).anchorStyle : 0;
}

// ============================================================================
// Item.makeNPC 全表（Item.cs DefaultToCapturedCritter 调用点逐 case 提取，
//   DefaultToCapturedCritter :47613-47626 = makeNPC=npcId + createTile=724 + consumable）
//   区间展开：1994-2001 → 356（placeStyle=1+type-1994 :21303-21305）、
//   2889-2895 → 442+type-2889（:27378-27386）、4334-4339 → 595+type-4334（:37063-37070）、
//   4831-4837 → 639+type-4831（:39524-39529）、4838-4844 → 646+type-4838（:39535-39540）
// ============================================================================

export const ITEM_MAKE_NPC: Readonly<Record<number, number>> = {
  261: 55,      // 金鱼（:4450）
  1338: 614,    // 爆炸兔（:16549）
  1992: 355,    // 萤火虫（:21292）
  1994: 356, 1995: 356, 1996: 356, 1997: 356, 1998: 356, 1999: 356, 2000: 356, 2001: 356, // 八色蝴蝶（:21300-21305）
  2002: 357,    // 蠕虫（:21360）
  2003: 300,    // 鼠（:21364）
  2004: 358,    // 闪电虫（:21367）
  2006: 359,    // 蜗牛（:21382）
  2007: 360,    // 发光蜗牛（:21386）
  2015: 74,     // 鸟（:21411）
  2016: 297,    // 蓝鸟（:21414）
  2017: 298,    // 红鸟（:21417）
  2018: 299,    // 松鼠（:21420）
  2019: 46,     // 兔（:21423）
  2121: 361,    // 青蛙（:21898）
  2122: 362,    // 鸭（:21901）
  2123: 364,    // 野鸭（:21904）
  2156: 366,    // 蝎子（:22048）
  2157: 367,    // 金蝎子（:22052）
  2205: 148,    // 企鹅（:22303）
  2673: 374,    // 松露虫（:25848）
  2740: 377,    // 蚱蜢（:26139）
  2889: 442, 2890: 443, 2891: 444, 2892: 445, 2893: 446, 2894: 447, 2895: 448, // 金系六件+金蠕虫（:27378）
  3191: 484, 3192: 485, 3193: 486, 3194: 487, // 夜爬虫族（:29580-29592）
  3563: 538, 3564: 539,  // 红松鼠 / 金松鼠（:32012-32015）
  4068: 583, 4069: 584, 4070: 585, // 三色妖精（:35690-35700）
  4274: 592,    // 金金鱼（:36772）
  4334: 595, 4335: 596, 4336: 597, 4337: 598, 4338: 599, 4339: 600, // 六色蜻蜓（:37063）
  4340: 601,    // 金蜻蜓（:37076）
  4359: 602,    // 海鸥（:37166）
  4361: 604, 4362: 605,  // 瓢虫 / 金瓢虫（:37178-37185）
  4363: 606,    // 蛆（:37193）
  4373: 607,    // 鲤齿鱼（:37223）
  4374: 608,    // 蹼鷉（:37229）
  4375: 610,    // 大鼠（:37235）
  4395: 611,    // 鸮（:37307）
  4418: 612, 4419: 613,  // 水黾 / 金水黾（:37393-37400）
  4464: 616, 4465: 617,  // 龟 / 丛林龟（:37692-37696）
  4480: 626, 4482: 627,  // 海马 / 金海马（:37789-37796）
  4831: 639, 4832: 640, 4833: 641, 4834: 642, 4835: 643, 4836: 644, 4837: 645, // 宝石松鼠（:39524）
  4838: 646, 4839: 647, 4840: 648, 4841: 649, 4842: 650, 4843: 651, 4844: 652, // 宝石兔（:39535）
  4845: 653,    // 地狱蝶（:39544）
  4847: 654,    // 熔岩蝇（:39554）
  4849: 655,    // 熔岩蜗牛（:39564）
  4961: 661,    // 帝皇蝶（:40029）
  5132: 669,    // 椿象（:41070）
  5212: 671,    // 猩红鹦鹉（:41134）
  5300: 672,    // 蓝鹦鹉（:42027）
  5311: 673, 5312: 674, 5313: 675, // 鹤?/双色鸡尾鹦鹉（:42161-42173）
  5350: 677,    // 微光之灵（:42429）
  5511: 688,    // 河豚（:43351）
};

// ============================================================================
// 风筝族（Item.DefaultToKite :47457-47468 = createTile=723 + shoot=projId；
//   TEKiteAnchor.CreateLeashedEntity :54-62 取 item.shoot）
// ============================================================================

/** 24 件风筝物品 → Projectile id（DefaultToKite 调用点逐 case 提取） */
export const KITE_ITEM_PROJ: Readonly<Record<number, number>> = {
  4367: 766, 4368: 767, 4369: 768, 4370: 769, 4371: 770, // :37220（type-4367+766）
  4379: 771,    // :37258
  4610: 822, 4611: 823, 4612: 824, // :38223-38229
  4613: 826,    // :38252
  4648: 827, 4649: 828, 4650: 829, 4651: 830, // :38339（827+type-4648）
  4669: 838, 4670: 839, 4671: 840, // :38478-38484
  4674: 843, 4675: 844, 4676: 845, 4677: 846, // :38502-38512
  4681: 850,    // :38528
  4683: 852, 4684: 853, // :38540-38543
};

// ============================================================================
// 运行时环境（Game 每帧注入；netMode!=2 的视觉分支全部走这里）
// ============================================================================

/** Dust.NewDust 返回句柄的可变子集（src/fx/VanillaDust.ts VDust 结构等价） */
export interface LeashedDust {
  type: number;
  x: number; y: number;
  vx: number; vy: number;
  scale: number; fadeIn: number; alpha: number;
  noGravity: boolean; noLight: boolean; noLightEmittance: boolean;
  color: { r: number; g: number; b: number; a: number } | null;
}

/** Dust 池通道（Game 注入 vanillaDust；缺省 = 不生成尘——netMode==2 语义） */
export interface LeashedDustPool {
  /** Dust.NewDust(position, w, h, type, speedX, speedY, alpha, color, scale)（Dust.cs:75-285） */
  spawn(x: number, y: number, w: number, h: number, type: number,
    speedX?: number, speedY?: number, alpha?: number,
    color?: { r: number; g: number; b: number; a: number } | null, scale?: number): LeashedDust | null;
  /** Dust.CloneDust（Dust.cs：字段级复制回池；帝皇蝶二段尘用，缺省跳过） */
  clone?(d: LeashedDust): LeashedDust | null;
}

export interface LeashedEnv {
  /** Main.timeForVisualEffects（悬停相位/妖精尘节奏） */
  timeForVisualEffects: number;
  /** Main.dayTime（萤火虫昼地表门，FireflyLeashedCritter.cs:51-54） */
  dayTime: boolean;
  /** Main.worldSurface（萤火虫地表门 / 风筝 DoesWindBlowAtThisHeight） */
  worldSurface: number;
  /** Main.WindForVisuals（风筝 windTarget，LeashedKite.cs:100-102） */
  windForVisuals: number;
  /** Main.cloudAlpha（风筝，LeashedKite.cs:101） */
  cloudAlpha: number;
  /** Main.LocalPlayer.Center（帝皇蝶 >300px 渐隐门） */
  playerCx: number;
  playerCy: number;
  /** Lighting.AddLight(i, j, r, g, b)（tile 坐标） */
  addLight(i: number, j: number, r: number, g: number, b: number): void;
  /** 原版 Dust 池（金系 43 / 妖精 278 / 帝皇蝶 267 / 地狱蝶 6 / Recall 15） */
  dust?: LeashedDustPool;
  /** Lighting.GetColor(i, j) → [r,g,b] 0-255（金系闪光的照度门，LeashedCritter.cs:143-156） */
  lightAt?(i: number, j: number): [number, number, number];
}

/** 实体点光（update 期收集，Game 侧统一推 LightingEngine） */
export interface LeashedLight { tx: number; ty: number; r: number; g: number; b: number }

// ============================================================================
// LeashedCritterEntity —— 拴绳小动物本体（LeashedCritter.cs + 三引擎）
// ============================================================================

/** State 常量（Walker :17-21 / Jumper :13-15） */
const W_STANDING = 0, W_PICK_DIRECTION = 1, W_WALKING = 2, W_FALLING = 3, W_RECALLING = 4;
const J_NORMAL = 0, J_RECALLING = 1;

/** Flyer 悬空微速度（FlyerLeashedCritter.cs:22——非零才走悬停 bobbing 分支） */
const HOVER_Y_VELOCITY = 0.0001;

export class LeashedCritterEntity {
  /** 锚桩格（= LeashedEntity.AnchorPosition，Point16） */
  readonly ax: number;
  readonly ay: number;
  /** sample.makeNPC（TECritterAnchor.CreateLeashedEntity → SetDefaults） */
  readonly npcType: number;
  readonly proto: LeashedPrototype;

  /** 尺寸 = _dummy.Size（LeashedCritter.SetDefaults :52-57） */
  w: number;
  h: number;
  /** 中心（px）——LeashedEntity.Center（position + Size/2） */
  cx: number;
  cy: number;
  vx = 0;
  vy = 0;
  direction = 1;
  spriteDirection = 1;
  scale = 1;

  rand: LCG32Random;
  waitTime = 0;
  state = 0;
  /** TargetPosition（Point16，格坐标） */
  tx: number;
  ty: number;

  // ---- 渲染态（_dummy.FindFrame 的最小等价）----
  frame = 0;
  frameCounter = 0;
  animT = 0;
  /** NormalButterfly variant（= item.placeStyle，物品 1994-2001 → 1-8） */
  variant = 0;
  /** EmpressButterfly fadeAmount（0-50） */
  fadeAmount = 0;
  /** Firefly 明灭（lightOn + timer） */
  lightOn = false;
  fireflyTimer = 0;
  /** 本实体在 manager 列表的下标（GetBobbingOffset 的 whoAmI*npcType 相位项） */
  whoAmI = 0;

  /** 联机 netId（房主分配，单调；本地实体也持有——房主广播需要，0 = 尚未分配） */
  netId = 0;
  /** 访客端傀儡标记（netApplyFull 重建才置位）：section 再激活不做 Spawn 归位
   *  （原版 client 端 Activate 不调 Spawn，LeashedEntity.cs:216 `if (Main.netMode != 1)`
   *  门——状态以 PartialSync 为准）。房主/单机的本地实体恒 false（仍归位） */
  netPuppet = false;
  /** NetReceive 半包平滑位移（LeashedCritter.cs:33 netOffset；每帧向 0 收敛 2px
   *  （:110-112），绘制经 getDrawOffset 叠加 = Draw :198 `netOffset + GetDrawOffset()`） */
  netOffsetX = 0;
  netOffsetY = 0;

  active = true;

  constructor(ax: number, ay: number, npcType: number, proto: LeashedPrototype, seed: number) {
    this.ax = ax; this.ay = ay;
    this.npcType = npcType;
    this.proto = proto;
    this.rand = new LCG32Random(seed);
    const v = vanillaNpc(npcType);
    this.w = v?.width ?? 10;
    this.h = v?.height ?? 10;
    this.tx = ax;
    this.ty = ay;
    // Spawn（LeashedCritter.cs:103-108）：Center = 锚桩格中心，Target = 锚桩格
    this.cx = ax * T + 8;
    this.cy = ay * T + 8;
  }

  /** SetDefaults（各族覆写折叠）：缩放随机段 */
  setDefaults(itemPlaceStyle: number): void {
    const p = this.proto;
    if (p.butterflyVariant) this.variant = itemPlaceStyle;  // NormalButterfly.cs:11-15
    if (p.flyScale) this.scale = this.rand.range(75, 111) * 0.01; // Fly.cs:9-13
    if (p.family === 'crawlingFly') this.scale = 0.7 + this.rand.nextFloat() * 0.2; // CrawlingFly.cs:17-20
    if (p.snailFx && this.npcType === 359) this.scale = this.rand.range(80, 111) * 0.01; // Snail.cs:10-15
  }

  /** 地形查询用 store（manager 注入；spawn 期即需——Flyer 悬空门 / Jumper 首选点） */
  store: TileStore | null = null;
  /** 本帧环境（update 注入；Recall 尘在引擎深处生成要用） */
  private env: LeashedEnv | null = null;

  /**
   * Spawn(bool newlyAdded)（基类 LeashedCritter.Spawn :103-108 + Flyer :41-51 /
   *  Jumper :38-42 覆写）：Center/Target 归位锚桩——section 再激活
   *  （SectionEntityList.Activate :213-225 → Spawn(false)）同样走此，即游走残位
   *  在玩家临近时拉回锚桩。rand 重播种（:107 Main.rand.Next）从略——本仓种子由
   *  manager 注入以保测试确定性（备案偏差）
   */
  spawn(): void {
    const st = this.store;
    this.cx = this.ax * T + 8;
    this.cy = this.ay * T + 8;
    this.tx = this.ax;
    this.ty = this.ay;
    if (this.proto.move === 'flyer') {
      // FlyerLeashedCritter.Spawn :43-50：锚桩下非实心 → vy=0.0001（走悬停分支）
      if (st && !solidTile2(st, this.ax, this.ay + 1)) this.vy = HOVER_Y_VELOCITY;
      this.pickFlyTarget();
    } else if (this.proto.move === 'jumper') {
      this.pickJumpTarget(); // JumperLeashedCritter.Spawn :40-42 → PickNewTarget
    }
  }

  // ------------------------------------------------------------------
  // 联机序列化（LeashedCritter.cs:59-101 NetSend/NetReceive 字段序 1:1）
  // ------------------------------------------------------------------

  /**
   * NetSend（LeashedCritter.cs:59-73，NormalButterfly.cs:23-30 / ShimmerFly.cs:24-31
   * 族尾部随后）。字段序：full 身份头（npcType/Size，由 manager 在构造前读——
   * HandleFullSync :79-96 先读 type/anchor 再 NewInstance 的拆分）→ 恒有段 → full 尾部。
   *  与原版编码差异（备案）：7bit→u16、Size f32×2→u16×2（尺寸恒整像素）、
   *  位移对走 NetWriter.f16（= 原 WritePackedVector2 的 HalfVector2，Utils.cs:1395）。
   *  ★尾部新增 scale100：原版不传 scale → 访客端重建不跑 SetDefaults、scale 恒 1
   *  （Fly 族 0.75-1.11 随机档全失效）——原版联机渲染失配事实，本仓补传修正
   */
  toNet(w: NetWriter, full: boolean): void {
    if (full) {
      w.u16(this.npcType & 0xffff);
      w.u16(clampU16(this.w));
      w.u16(clampU16(this.h));
    }
    // position - AnchorPosition.ToWorldCoordinates()（:66；本仓 position = Center - Size/2）
    w.f16(this.cx - this.w / 2 - this.ax * T);
    w.f16(this.cy - this.h / 2 - this.ay * T);
    w.bool(this.direction > 0);
    w.u32(this.rand.state >>> 0);
    w.i16(this.waitTime);
    w.u8(this.state & 0xff);
    w.i8(clampSByte(this.tx - this.ax));
    w.i8(clampSByte(this.ty - this.ay));
    if (full) {
      w.u8(this.variant & 0xff);                          // NormalButterfly.cs:26-29
      w.u8(clampU16(Math.round(this.scale * 100)));       // 本仓扩展（见方法注）
      w.u8(clampU16(this.oldPositions?.length ?? 60));    // ShimmerFly.cs:27-30
    }
  }

  /**
   * NetReceive（LeashedCritter.cs:75-101）：恒有段 + full 族尾部（身份头已由
   *  manager 消费）。netOffset 语义 1:1：full 清零 / 半包累积旧位与新位之差
   *  （:90-96），每帧向 0 收敛（:110-112），绘制叠加（:198）
   */
  fromNet(r: NetReader, full: boolean): void {
    const oldCx = this.cx, oldCy = this.cy;
    this.cx = r.f16() + this.ax * T + this.w / 2;
    this.cy = r.f16() + this.ay * T + this.h / 2;
    this.direction = r.bool() ? 1 : -1;
    this.rand.state = r.u32() >>> 0;
    this.waitTime = r.i16();
    this.state = r.u8();
    this.tx = this.ax + clampSByte(r.i8());
    this.ty = this.ay + clampSByte(r.i8());
    if (full) {
      this.variant = r.u8();
      this.scale = r.u8() / 100;
      const trailLen = r.u8();                            // ShimmerFly.cs:35-41
      if (this.npcType === 677 && trailLen > 0
        && (!this.oldPositions || this.oldPositions.length !== trailLen)) {
        this.oldPositions = Array.from({ length: trailLen }, () => ({ x: this.cx, y: this.cy }));
      }
    }
    if (full) { this.netOffsetX = 0; this.netOffsetY = 0; }
    else { this.netOffsetX += oldCx - this.cx; this.netOffsetY += oldCy - this.cy; }
  }

  // ------------------------------------------------------------------
  // Walker 引擎（WalkerLeashedCritter.cs 全文 1:1）
  // ------------------------------------------------------------------
  private updateWalker(st: TileStore, env: LeashedEnv): void {
    const p = this.proto;
    const pace = p.walkingPace ?? 0.8;
    const straying = p.straying;
    // Update :96-98：Center.ToTileCoordinates16
    const tpx = Math.floor(this.cx) >> 4;
    const tpy = Math.floor(this.cy) >> 4;
    this.handleFallingWalker(st, tpx, tpy, straying);
    // :100-107
    this.waitTime--;
    if (this.waitTime <= 0) {
      if (this.state === W_RECALLING) this.recall();
      this.waitTime = this.rand.range(60, 61);
      this.state = this.rand.next(2);
    }
    this.handleWalking(st, pace, straying);
    // :109-113：对角跨格时给 Y 一个推力（翻台阶）
    const dvx = this.tx - tpx;
    const dvy = this.ty - tpy;
    if (Math.abs(dvx) === 1 && Math.abs(dvy) === 1) this.vy = dvy * 2;
    // :114-118：Center.MoveTowards(target, |velocity|)
    const twx = this.tx * T + 8, twy = this.ty * T + 8;
    const maxMove = Math.hypot(this.vx, this.vy);
    moveTowards(this, twx, twy, maxMove);
    if (this.cx === twx && this.cy === twy && this.state === W_STANDING) {
      this.vx = 0; this.vy = 0;
    }
    this.afterMove();
  }

  /** HandleFalling（WalkerLeashedCritter.cs:141-175） */
  private handleFallingWalker(st: TileStore, tpx: number, tpy: number, straying: number): void {
    if (solidTile2(st, tpx, tpy + 1)) {
      this.vy = 0;
      if (this.state === W_FALLING || this.state === W_RECALLING) {
        this.cx = this.tx * T + 8;
        this.cy = this.ty * T + 8;
      }
      if (this.state === W_FALLING) {
        this.state = W_STANDING;
        this.waitTime = 0;
      }
      return;
    }
    this.vy += GRAVITY;
    if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
    this.tx = tpx;
    this.ty = Math.min(tpy + 1, (st.h - 1));
    if (this.state !== W_RECALLING) {
      if (this.ty - this.ay > straying) {
        this.state = W_RECALLING;
        this.waitTime = RECALL_DURATION;
      } else {
        this.state = W_FALLING;
      }
    }
  }

  /** HandleWalking（WalkerLeashedCritter.cs:177-196） */
  private handleWalking(st: TileStore, pace: number, straying: number): void {
    if (this.state === W_FALLING || this.state === W_RECALLING) return;
    this.vx = pace * this.direction;
    const dist = Math.hypot(this.tx * T + 8 - this.cx, this.ty * T + 8 - this.cy);
    if (this.state !== W_STANDING && dist >= 1) return; // :183-185
    if (this.state === W_PICK_DIRECTION) {
      this.direction = this.rand.next(2) * 2 - 1;
      this.state = W_WALKING;
    }
    if (!this.advanceTarget(st, straying)) {
      this.waitTime = 30;
      this.state = W_STANDING;
    }
  }

  /** AdvanceTargetPosition（WalkerLeashedCritter.cs:36-73）：台阶升降决策 */
  private advanceTarget(st: TileStore, straying: number): boolean {
    if (Math.abs(this.tx - this.ax) >= straying) {
      this.direction = Math.sign(this.ax - this.tx) || 1;
    }
    if (!st.inBounds(this.tx + this.direction, this.ty)) {
      this.direction *= -1;
    }
    this.spriteDirection = this.direction;
    const nx = this.tx + this.direction;
    const ny = this.ty;
    const stepUpFree = !solidTile2(st, nx, ny - 1);
    const curFree = !solidTile2(st, nx, ny);
    const belowFree = !solidTile2(st, nx, ny + 1);
    const liquidBelow = anyLiquidAt(st, nx, ny + 1);
    const below2Free = !solidTile2(st, nx, ny + 2);
    const canStepUp = stepUpFree && !curFree;                    // flag5
    const canStepDown = curFree && belowFree && !liquidBelow && !below2Free; // flag6
    const canWalkLevel = curFree && !belowFree;                  // flag7
    if (canStepUp) {
      this.tx = nx; this.ty = ny - 1;
    } else if (canStepDown) {
      this.tx = nx; this.ty = ny + 1;
    } else {
      if (!canWalkLevel) return false;
      this.tx = nx; this.ty = ny;
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Flyer 引擎（FlyerLeashedCritter.cs 全文 1:1）
  // ------------------------------------------------------------------

  /** PickNewTarget（FlyerLeashedCritter.cs:55-66） */
  private pickFlyTarget(): void {
    const p = this.proto;
    const straying = p.straying;
    const groundBias = !!p.hasGroundBias && this.ay === this.ty && this.rand.next(4) !== 0;
    this.tx = this.ax + this.rand.range(-straying, straying + 1);
    this.ty = this.ay + this.rand.range(-straying, 1);
    if (groundBias) this.ty = this.ay;
  }

  private updateFlyer(st: TileStore, env: LeashedEnv): void {
    const p = this.proto;
    const maxFlySpeed = p.maxFlySpeed ?? 1;
    const accel = p.acceleration ?? 0.2;
    const brake = p.brakeDuration ?? 10;
    // Update :73-77
    this.waitTime--;
    if (this.waitTime <= 0) {
      this.waitTime = this.rand.range(p.minWaitTime ?? 60, (p.maxWaitTime ?? 300) + 1);
      this.pickFlyTarget();
    }
    // :79-92：朝目标加速 + 距离刹车限速
    const twx = this.tx * T + 8, twy = this.ty * T + 8;
    const dx = twx - this.cx, dy = twy - this.cy;
    const dist = Math.hypot(dx, dy);
    let dirX = 0, dirY = 0;
    if (dist > 0) { dirX = dx / dist; dirY = dy / dist; }
    this.vx += dirX * accel;
    this.vy += dirY * accel;
    let speed = Math.hypot(this.vx, this.vy);
    const val = Math.min(1, dist / (brake * maxFlySpeed));
    const cap = maxFlySpeed * Math.max(val, 0.25);
    if (speed > cap) {
      this.vx *= cap / speed;
      this.vy *= cap / speed;
      speed = cap;
    }
    // :94-115：抵近或前路实心 → 停驻贴地；否则位移 + 落空时恢复悬空微速度
    const near = dist < maxFlySpeed;
    let blocked = near;
    if (!blocked) {
      const probeX = this.cx + this.w * 0.5 * dirX + this.vx;
      const probeY = this.cy + this.h * 0.5 * dirY + this.vy;
      blocked = solidTile2(st, Math.floor(probeX) >> 4, Math.floor(probeY) >> 4);
    }
    if (blocked) {
      if (near) { this.cx = twx; this.cy = twy; }
      const px = Math.floor(this.cx) >> 4;
      const py = Math.floor(this.cy) >> 4;
      this.vx = 0;
      this.vy = solidTile2(st, px, py + 1) ? 0 : HOVER_Y_VELOCITY;
    } else {
      this.cx += this.vx;
      this.cy += this.vy;
      const px = Math.floor(this.cx) >> 4;
      const py = Math.floor(this.cy) >> 4;
      if (this.vy === 0 && !solidTile2(st, px, py + 1)) this.vy = HOVER_Y_VELOCITY;
    }
    // :117-121：spriteDirection = -direction（飞行族贴图朝向反转）
    const sx = Math.sign(this.vx);
    if (sx !== 0 && sx !== this.direction) {
      this.direction = sx;
      this.spriteDirection = -this.direction;
    }
    this.afterMove();
  }

  // ------------------------------------------------------------------
  // Jumper 引擎（JumperLeashedCritter.cs 全文 1:1）
  // ------------------------------------------------------------------

  private updateJumper(st: TileStore, env: LeashedEnv): void {
    const p = this.proto;
    // Update :49-68
    this.waitTime--;
    if (this.waitTime <= 0) {
      if (this.state === J_NORMAL) {
        if (!this.tryStartJump()) {
          this.pickJumpTarget();
          this.setJumpCooldown();
        }
      } else {
        this.recall();
        this.pickJumpTarget();
        this.setJumpCooldown();
        this.state = J_NORMAL;
      }
    }
    const hit = this.moveJumper(st);
    if (hit && this.state !== J_RECALLING) {
      this.pickJumpTarget();
      this.setJumpCooldown();
    }
    if (Math.hypot(this.tx * T + 8 - this.cx, this.ty * T + 8 - this.cy) < 8) {
      this.cx = this.tx * T + 8;
      this.cy = this.ty * T + 8;
      this.vx = 0; this.vy = 0;
      this.pickJumpTarget();
      this.setJumpCooldown();
    }
    this.spriteDirection = this.direction;
    this.afterMove();
  }

  private setJumpCooldown(): void {
    const p = this.proto;
    this.waitTime = this.rand.range(p.minWaitTime ?? 180, (p.maxWaitTime ?? 300) + 1);
  }

  /** TryStartJump（JumperLeashedCritter.cs:71-96）——弹道初值解算 */
  private tryStartJump(): boolean {
    const p = this.proto;
    const dvx = this.tx * T + 8 - this.cx;
    const dvy = this.ty * T + 8 - this.cy;
    if (-dvy > (p.maxJumpHeight ?? 64)) return false;
    const num = Math.min(Math.abs(dvx), p.maxJumpWidth ?? 112);
    if (num <= (p.minJumpWidth ?? 48)) return false;
    this.direction = Math.sign(dvx) || 1;
    const num2 = num / (p.maxJumpWidth ?? 112);
    const num3 = (p.maxJumpDuration ?? 30) * num2;
    this.vx = (num / num3) * this.direction;
    this.vy = (dvy * num2) / num3 - 0.5 * GRAVITY * num3;
    if (this.vy >= 0) return false;
    this.waitTime = Math.round(num3 + (p.jumpCooldown ?? 60));
    return true;
  }

  /** Move（JumperLeashedCritter.cs:98-139） */
  private moveJumper(st: TileStore): boolean {
    let hitSomething = false;
    const px = Math.floor(this.cx) >> 4;
    const py = Math.floor(this.cy) >> 4;
    const sx = Math.sign(Math.trunc(this.vx));
    if (sx !== 0) this.direction = sx;
    const sy = Math.sign(Math.trunc(this.vy));
    const probeX = this.cx + sx * this.w * 0.5 + this.vx;
    const probeY = this.cy + sy * this.h * 0.5 + this.vy;
    if (!solidTile2(st, Math.floor(probeX) >> 4, Math.floor(probeY) >> 4)) {
      this.moveNoObstruction(st, px, py, probeY);
      return false;
    }
    hitSomething = true;
    const ySolid = sy !== 0 && solidTile2(st, px, py + sy);
    const xSolid = sx !== 0 && solidTile2(st, px + sx, py);
    if (ySolid) this.vy = 0;
    if (xSolid) this.vx = 0;
    if (!ySolid && !xSolid) { this.vx = 0; this.vy = 0; }
    return hitSomething;
  }

  /** Move_NoObstruction（JumperLeashedCritter.cs:141-170） */
  private moveNoObstruction(st: TileStore, curX: number, curY: number, nextY: number): void {
    const p = this.proto;
    if (this.vy >= 0 && nextY % T >= 8) {
      const belowSolid = solidTile2(st, curX, curY + 1)
        || (!!p.canStandOnWater && anyLiquidAt(st, curX, curY + 1, true));
      if (belowSolid) {
        this.cx = curX * T + 8; // currentTile.ToWorldCoordinates()（格中心）
        this.cy = curY * T + 8;
        this.vx = 0; this.vy = 0;
        return;
      }
    }
    this.cx += this.vx;
    this.cy += this.vy;
    this.vy += GRAVITY;
    if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
    if (this.state !== J_RECALLING && curY - this.ay > p.straying) {
      this.state = J_RECALLING;
      this.waitTime = RECALL_DURATION;
    }
  }

  /** PickNewTarget（JumperLeashedCritter.cs:172-207）——跳跃档位选点 */
  private pickJumpTarget(): void {
    const p = this.proto;
    const st = this.store;
    const num = Math.floor((p.maxJumpWidth ?? 112) / T);
    const num2 = Math.floor((p.minJumpWidth ?? 48) / T);
    const roomLeft = this.tx - (this.ax - p.straying);
    const roomRight = (this.ax + p.straying) - this.tx;
    const canLeft = roomLeft >= num2;
    const canRight = roomRight >= num2;
    if (!canLeft && !canRight) return;
    const num5 = canLeft && canRight ? this.rand.next(2) * 2 - 1 : (!canLeft ? 1 : -1);
    const num6 = num5 < 1 ? roomLeft : roomRight;
    const num7 = this.rand.range(1, Math.floor(num6 / num) + 1);
    let num8 = num6 % num;
    if (num8 < num2) num8 = 0;
    const startX = this.tx + (num7 * num + num8) * num5;
    const tile = st ? this.reachableTileFrom(st, startX) : null;
    if (tile) { this.tx = tile[0]; this.ty = tile[1]; }
  }

  /** TryGetReachableTile（JumperLeashedCritter.cs:209-242） */
  private reachableTileFrom(st: TileStore, startX: number): [number, number] | null {
    const p = this.proto;
    const step = Math.sign(this.ax - startX);
    if (step === 0) return null;
    for (let i = startX; i !== this.ax; i += step) {
      const tx = i;
      let ty = this.ay;
      if (solidTile2(st, tx, ty)) {
        const num2 = Math.floor((p.maxJumpHeight ?? 64) / T);
        for (let j = 0; j < num2; j++) {
          ty--;
          if (!solidTile2(st, tx, ty)) return [tx, ty];
        }
        continue;
      }
      for (let k = 0; k < p.straying; k++) {
        ty++;
        if (solidTile2(st, tx, ty)
          || (!!p.canStandOnWater && anyLiquidAt(st, tx, ty, true))) {
          return [tx, ty - 1];
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------------
  // 公共：Recall / VisualEffects / FindFrame
  // ------------------------------------------------------------------

  /** Recall（LeashedCritter.cs:115-134）：前后各 10 颗 Dust 15 + 拉回锚桩上方一格 */
  private recall(): void {
    if (this.env) this.recallDust(this.env);                // :120-124 前 10 颗
    this.cx = this.ax * T + 8;
    this.cy = this.ay * T + 8 - T;
    this.vx = 0;
    this.vy = 0;
    if (this.env) this.recallDust(this.env);                // :128-132 后 10 颗
  }

  /** Update 尾段（CopyToDummy + FindFrame + CopyFromDummy）。
   *  ★VisualEffects 不在此调——族特效有状态（Firefly 明灭计时 / Empress 渐隐
   *  累积），每 tick 只能在 manager.update 的统一收集点跑一次（含点光回传） */
  private afterMove(): void {
    this.animT++;
    this.findFrame();
  }

  /**
   * VisualEffects 各族覆写（金系闪光 LeashedCritter.cs:136-163 / Snail :18-28 /
   * HellButterfly :7-18 / Firefly :17-57 / EmpressButterfly :22-58 / Fairy :19-46 /
   * ShimmerFly :43-53）——尘走原版 Dust 池（env.dust = VanillaDust）。
   * @param outLight 本帧点光（Game 侧推 LightingEngine）
   */
  visualEffects(env: LeashedEnv, outLight?: LeashedLight[]): void {
    const p = this.proto;
    const ti = Math.floor(this.cx / T), tj = Math.floor(this.cy / T);
    this.goldCritterSparkle(env);          // LeashedCritter.VisualEffects :136-163
    if (p.snailFx) {
      if (this.npcType === 360) outLight?.push({ tx: ti, ty: tj, r: 0.1, g: 0.2, b: 0.7 });
      else if (this.npcType === 655) outLight?.push({ tx: ti, ty: tj, r: 0.6, g: 0.3, b: 0.1 });
    }
    if (p.hellGlow) this.updateHellButterfly(env, outLight);
    if (p.fireflyGlow) this.updateFirefly(env, outLight);
    if (p.empressFade) this.updateEmpress(env, outLight);
    if (p.fairyGlow) this.updateFairy(env, outLight);
    if (this.npcType === 677) this.shiftShimmerTrail();   // ShimmerFlyLeashedCritter :43-53
  }

  /** 金系闪光（LeashedCritter.cs:143-161：照度门 + max(R,G,B)/30/300 掷骰，Dust 43） */
  private goldCritterSparkle(env: LeashedEnv): void {
    const dust = env.dust;
    if (!dust || !IS_GOLD_CRITTER.has(this.npcType)) return;
    const ti = Math.floor(this.cx / T), tj = Math.floor(this.cy / T);
    const light = env.lightAt?.(ti, tj) ?? [255, 255, 255];
    if (!(light[0] > 20 || light[1] > 20 || light[2] > 20)) return;
    const peak = Math.max(light[0], light[1], light[2]);
    const roll = Math.floor(peak / 30);                    // C# num /= 30（整除）
    if (Math.floor(Math.random() * 300) >= roll) return;   // Main.rand.Next(300) < num
    const d = dust.spawn(this.cx - this.w / 2, this.cy - this.h / 2, this.w, this.h,
      43, 0, 0, 254, { r: 255, g: 255, b: 0, a: 255 }, 0.5);
    if (d) { d.vx *= 0; d.vy *= 0; }                        // :158-159 velocity *= 0
  }

  /** Recall 尘（LeashedCritter.cs:119-133）：前后各 10 颗 Dust 15（alpha 150 / scale 1.1） */
  recallDust(env: LeashedEnv): void {
    const dust = env.dust;
    if (!dust) return;                                      // netMode==2 语义：无尘
    for (let i = 0; i < 10; i++) {
      dust.spawn(this.cx - this.w / 2, this.cy - this.h / 2, this.w, this.h, 15, 0, 0, 150, null, 1.1);
    }
  }

  /** HellButterfly（:7-18：点光 + 1/60 掷骰 Dust 6 alpha 254） */
  private updateHellButterfly(env: LeashedEnv, outLight?: LeashedLight[]): void {
    outLight?.push({
      tx: Math.floor(this.cx / T), ty: Math.floor(this.cy / T), r: 0.6, g: 0.3, b: 0.1,
    });
    if (Math.floor(Math.random() * 60) !== 0) return;       // Main.rand.Next(60) == 0
    const d = env.dust?.spawn(this.cx - this.w / 2, this.cy - this.h / 2, this.w, this.h, 6, 0, 0, 254);
    if (d) { d.vx *= 0; d.vy *= 0; }
  }

  /** Firefly 明灭（FireflyLeashedCritter.cs:38-58） */
  private updateFirefly(env: LeashedEnv, outLight?: LeashedLight[]): void {
    if (--this.fireflyTimer <= 0) {
      this.fireflyTimer = 0;
      const surfaceDay = env.dayTime && this.cy / T < env.worldSurface + 10;
      if (this.lightOn || !surfaceDay) {
        this.lightOn = !this.lightOn;
        this.fireflyTimer = this.lightOn ? this.rand.range(10, 30) : this.rand.range(30, 180);
      }
    }
    if (this.lightOn && this.fireflyTimer > 3) {
      const ti = Math.floor(this.cx / T), tj = Math.floor(this.cy / T);
      const s = this.scale;
      // :30-44 三型 RGB（355 绿萤 / 358 蓝闪电虫 / 654 熔岩蝇）
      const rgb = this.npcType === 355 ? [0.1095 * s, 0.15 * s, 0.0615 * s]
        : this.npcType === 358 ? [0.10125 * s, 0.21375 * s, 0.225 * s]
          : [0.225 * s, 0.105 * s, 0.06 * s];
      outLight?.push({ tx: ti, ty: tj, r: rgb[0], g: rgb[1], b: rgb[2] });
    }
  }

  /**
   * EmpressButterfly 渐隐 + HSL 环绕光 + 尘 267（EmpressButterflyLeashedCritter.cs:22-58）
   *  尘：1/5 掷骰 → Dust 267（hslToRgb(t*0.3,1,0.5)×0.5），位置覆写为 Center+
   *  NextVector2Circular(w,h)，velocity×rand*0.8 + velocity*0.6，fadeIn 0.6+rand*0.7*num2，
   *  scale 0.35，CloneDust 二段（scale/2、fadeIn×0.85、白×0.5）
   */
  private updateEmpress(env: LeashedEnv, outLight?: LeashedLight[]): void {
    const far = Math.hypot(env.playerCx - this.cx, env.playerCy - this.cy) > 300;
    this.fadeAmount = Math.max(0, Math.min(50, this.fadeAmount + (far ? 1 : -1)));
    const hue = (env.timeForVisualEffects * 0.33) % 1;
    const c = hslToRgb(hue, 1, 0.5);
    outLight?.push({
      tx: Math.floor(this.cx / T), ty: Math.floor(this.cy / T),
      r: c[0] * 0.3 + 0.1, g: c[1] * 0.3 + 0.1, b: c[2] * 0.3 + 0.1,
    });
    if (this.fadeAmount <= 0 || !env.dust) return;           // :30-33 fadeAmount==0 直接返回
    const opacity = this.opacity;
    if (Math.floor(Math.random() * 5) !== 0) return;         // Main.rand.Next(5) == 0
    const num2 = 0.9 + (0.6 - 0.9) * opacity;               // MathHelper.Lerp(0.9, 0.6, opacity)
    const c2 = hslToRgb((env.timeForVisualEffects * 0.3) % 1, 1, 0.5);
    const col = { r: c2[0] * 127.5, g: c2[1] * 127.5, b: c2[2] * 127.5, a: 255 };   // ×0.5
    const d = env.dust.spawn(this.cx - this.w / 2, this.cy - this.h / 2, this.w, this.h,
      267, 0, 0, 0, col);
    if (!d) return;
    // Main.rand.NextVector2Circular(width, height)（半径 w/2, h/2 均匀圆盘）
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random());
    d.x = this.cx + Math.cos(ang) * rad * this.w * 0.5;
    d.y = this.cy + Math.sin(ang) * rad * this.h * 0.5;
    d.vx *= Math.random() * 0.8;
    d.vy *= Math.random() * 0.8;
    d.vx += this.vx * 0.6;
    d.vy += this.vy * 0.6;
    d.noGravity = true;
    d.fadeIn = 0.6 + Math.random() * 0.7 * num2;
    d.scale = 0.35;
    const clone = env.dust.clone?.(d);                       // Dust.CloneDust（num3 != 6000 恒真）
    if (clone) {
      clone.scale /= 2;
      clone.fadeIn *= 0.85;
      clone.color = { r: 127.5, g: 127.5, b: 127.5, a: 127.5 };   // White × 0.5
    }
  }

  /**
   * Fairy 点光 + 环绕尘（FairyLeashedCritter.cs:19-46）：timeForVisualEffects%4==0 且
   *  Main.rand.Next(4)!=0 → Dust 278（Lerp(主色,辅色,NextFloat)，alpha 200，scale 0.65），
   *  位置 Center-(4,4)+NextVector2Circular(2,2)，velocity 清零后 += velocity*0.3
   */
  private updateFairy(env: LeashedEnv, outLight?: LeashedLight[]): void {
    const a = this.npcType === 584 ? [50, 205, 50] : this.npcType === 585 ? [65, 105, 225] : [255, 105, 180];
    const b = this.npcType === 584 ? [32, 178, 170] : this.npcType === 585 ? [173, 216, 230] : [255, 182, 193];
    outLight?.push({
      tx: Math.floor(this.cx / T), ty: Math.floor(this.cy / T),
      r: a[0] / 255 * 0.7, g: a[1] / 255 * 0.7, b: a[2] / 255 * 0.7,
    });
    if (!env.dust) return;
    if (Math.floor(env.timeForVisualEffects) % 4 !== 0) return;   // (int)t % 4 == 0
    if (Math.floor(Math.random() * 4) === 0) return;              // Main.rand.Next(4) != 0
    const t = Math.random();                                      // Color.Lerp(a, b, NextFloat)
    const col = {
      r: a[0] + (b[0] - a[0]) * t,
      g: a[1] + (b[1] - a[1]) * t,
      b: a[2] + (b[2] - a[2]) * t,
      a: 255,
    };
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random());
    const ox = this.cx - 4 + Math.cos(ang) * rad * 2;
    const oy = this.cy - 4 + Math.sin(ang) * rad * 2;
    const d = env.dust.spawn(ox, oy, 4, 4, 278, 0, 0, 200, col, 0.65);
    if (d) {
      d.vx = 0; d.vy = 0;
      d.vx += this.vx * 0.3;
      d.vy += this.vy * 0.3;
      d.noGravity = true;
      d.noLight = true;
    }
  }

  /**
   * ShimmerFly 拖尾历史（ShimmerFlyLeashedCritter.VisualEffects :43-54）：
   *  oldPositions = _dummy.oldPos（NPCID.Sets.TrailCacheLength[677] = 60，NPCID.cs:4805），
   *  每帧右移一格、[0] = position + netOffset（单机 netOffset 恒 0——仅在 NetReceive
   *  半包路径注入（LeashedCritter.cs:90-96），本仓无联机消费端，等价恒 0）。
   *  绘制端消费见 Renderer.drawLeashedFaeling（DrawNPCDirect_Faeling Main.cs:26306-26362）
   */
  oldPositions: Array<{ x: number; y: number }> | null = null;

  private shiftShimmerTrail(): void {
    const n = 60;                                           // TrailCacheLength[677]
    if (!this.oldPositions) this.oldPositions = Array.from({ length: n }, () => ({ x: this.cx, y: this.cy }));
    for (let i = this.oldPositions.length - 1; i > 0; i--) {
      this.oldPositions[i].x = this.oldPositions[i - 1].x;
      this.oldPositions[i].y = this.oldPositions[i - 1].y;
    }
    this.oldPositions[0].x = this.cx;
    this.oldPositions[0].y = this.cy;
  }

  /**
   * _dummy.FindFrame 逐型 1:1（NPC.cs:67295-78074 switch，拴绳可放置 NPC 全集）。
   *  状态帧推进语义：frameCounter（double，负方向累加）+ frame（帧行 index）；
   *  FindFrame 对 spriteDirection 的覆写经 CopyFromDummy（:183-188）持久化——本方法
   *  直接写回 this.spriteDirection；rotation 覆写在 Draw 期 CopyToDummy 重置（:176）
   *  不持久——绘制 rotation 只取各族 rotationScalar 档（见 get rotation）。
   *  视觉掷骰（猫头鹰眨眼/水黾 180 门/风筝 824 族 Next(4)）原版走 Main.rand 全局
   *  视觉流，非实体 LCG——此处 Math.random 等价（不污染 gameplay rand 序列）。
   *  （public = 测试/渲染直调入口；update 经 afterMove 每帧调一次）
   */
  findFrame(): void {
    const meta = vanillaNpc(this.npcType);
    const count = meta?.frames ?? 1;
    // Waterfowl vy!=0 → CopyToDummy type+1（泳姿表），FindFrame 以递增后 type 分派
    const type = this.drawFrameNpcType;
    const vx = this.vx, vy = this.vy;
    const moving = vx !== 0 || vy !== 0;
    switch (type) {
      // ---- 兔族（:77553）----
      case 46: case 47: case 303: case 337: case 443: case 464: case 540: case 614:
      case 646: case 647: case 648: case 649: case 650: case 651: case 652:
        if (vy === 0) {
          if (this.direction === 1) this.spriteDirection = 1;
          if (this.direction === -1) this.spriteDirection = -1;
          if (vx === 0) { this.frame = 0; this.frameCounter = 0; break; }
          this.frameCounter += Math.abs(vx) + 1;
          if (this.frameCounter > 6) { this.frame++; this.frameCounter = 0; }
          if (this.frame >= count) this.frame = 0;
        } else if (vy < 0) { this.frameCounter = 0; this.frame = 4; }
        else { this.frameCounter = 0; this.frame = 6; }
        break;
      // ---- 金鱼族（:74879；拴绳恒 wet=isAquatic）----
      case 55: case 57: case 58: case 102: case 241: case 465: case 592: case 607:
        this.spriteDirection = this.direction;
        this.frameCounter += 1;
        if (this.proto.isAquatic) {
          if (this.frameCounter < 6) this.frame = 0;
          else if (this.frameCounter < 12) this.frame = 1;
          else if (this.frameCounter < 18) this.frame = 2;
          else if (this.frameCounter < 24) this.frame = 3;
          else this.frameCounter = 0;                       // :74907 帧 3 保持
        } else {
          if (this.frameCounter < 6) this.frame = 4;
          else if (this.frameCounter < 12) this.frame = 5;
          else this.frameCounter = 0;                       // :74917 帧 5 保持
        }
        break;
      // ---- 鸟族（:74326：静止=帧4；飞行 4t/帧 循环 0..count-2）----
      case 74: case 297: case 298: case 442: {
        this.spriteDirection = this.direction;
        if (vx === 0 && vy === 0) { this.frame = 4; this.frameCounter = 0; break; }
        this.frameCounter += 1;
        if (this.frameCounter >= 4) { this.frame++; this.frameCounter = 0; }
        if (this.frame >= count - 1) this.frame = 0;
        break;
      }
      // ---- 鹦鹉族（:74352：静止=帧0；飞行循环回卷到帧 1）----
      case 671: case 672: case 673: case 674: case 675:
        this.spriteDirection = this.direction;
        if (vx === 0 && vy === 0) { this.frame = 0; this.frameCounter = 0; break; }
        this.frameCounter += 1;
        if (this.frameCounter >= 4) { this.frameCounter = 0; this.frame++; }
        if (this.frame >= count) this.frame = 1;
        break;
      // ---- 鸮（:74379：spriteDirection=-direction；站姿 40t 眨眼序列 / 飞行 8..count）----
      case 611: case 689: {
        this.spriteDirection = -this.direction;
        if (vx === 0 && vy === 0) {
          if (this.frame < 0 || this.frame >= 8) this.frame = 0;
          const fcInt = Math.floor(this.frameCounter);
          if (fcInt % 40 !== 0 || Math.floor(Math.random() * 80) === 0) this.frameCounter += 1;
          if ((this.frameCounter + 1) % 40 === 39) this.frameCounter = 40 * Math.floor(Math.random() * 3);
          const seg = Math.floor(Math.floor(this.frameCounter) % 40 / 10);   // C# (int)fc%40/10
          const band = Math.floor(this.frameCounter / 40);                    // C# (int)fc/40
          let f: number;
          if (band === 0) f = seg === 3 ? 1 : seg;
          else if (band === 1) f = seg === 0 ? 0 : 2 + seg;
          else f = seg === 0 ? 0 : 4 + seg;
          this.frame = f;
        } else {
          this.frameCounter += 1;
          if (this.frameCounter >= 5) { this.frame++; this.frameCounter = 0; }
          if (this.frame >= count || this.frame < 8) this.frame = 8;
        }
        break;
      }
      // ---- 鸭族/海鸥（:74445 / :74517：静止=0；行走循环 3..9）----
      case 362: case 364: case 608: case 602:
        this.spriteDirection = this.direction;
        if (vx === 0) { this.frameCounter = 0; this.frame = 0; break; }
        this.frameCounter += 1;
        if (this.frameCounter >= 4) { this.frame++; this.frameCounter = 0; }
        if (this.frame >= 10) this.frame = 3;
        if (this.frame < 3) this.frame = 3;
        break;
      // ---- 鸭族泳姿表 363/365/609（:74470；wet 恒 false → 陆行段：11..count-1）----
      case 363: case 365: case 609:
        this.spriteDirection = this.direction;
        if (this.proto.isAquatic) {
          this.frameCounter += 1;
          if (this.frameCounter >= 8) { this.frame++; this.frameCounter = 0; }
          if (this.frame > 2) this.frame = 1;
          if (this.frame < 1) this.frame = 1;
          break;
        }
        if (vx === 0 && vy === 0) { this.frame = 1; this.frameCounter = 0; break; }
        this.frameCounter += 1;
        if (this.frameCounter >= 4) { this.frame++; this.frameCounter = 0; }
        if (this.frame >= count) this.frame = 11;
        if (this.frame < 11) this.frame = 11;
        break;
      // ---- 鼠族（:77215 / :77268 同体：站姿 0↔1 / 行走循环回卷帧 2）----
      case 300: case 447: case 610:
        if (vy === 0) {
          if (this.direction === 1) this.spriteDirection = 1;
          if (this.direction === -1) this.spriteDirection = -1;
          if (vx === 0) {
            this.frameCounter += 1;
            if (this.frameCounter > 8) { this.frame++; this.frameCounter = 0; }
            if (this.frame > 1) this.frame = 0;
            break;
          }
        }
        this.frameCounter += Math.abs(vx) * 0.5 + 1;
        if (this.frameCounter > 6) { this.frame++; this.frameCounter = 0; }
        if (this.frame >= count) this.frame = 2;
        break;
      // ---- 蛙族（:77320：站姿 0..5 循环；跳相 0/6/8/9 六拍）----
      case 361: case 445: case 687:
        this.spriteDirection = this.direction;
        if (this.proto.isAquatic) {
          this.frameCounter = 0;
          this.frame = vx > 0.25 || vx < -0.25 ? 10 : vx > 0.15 || vx < -0.15 ? 11 : 12;
          break;
        }
        if (vy === 0) {
          if (vx === 0) {
            this.frameCounter += 1;
            if (this.frameCounter > 6) { this.frameCounter = 0; this.frame++; }
            if (this.frame > 5) this.frame = 0;
            break;
          }
          this.frameCounter += 1;
          if (this.frameCounter < 6) this.frame = 0;
          else if (this.frameCounter < 12) this.frame = 6;
          else if (this.frameCounter < 18) this.frame = 8;
          else { this.frame = 9; if (this.frameCounter >= 23) this.frameCounter = 0; }
        } else if (vy > 0) this.frame = 9;
        else this.frame = 8;
        break;
      // ---- 龟族（:77388：8t/帧 0..7；静止锁 0；腾空锁 8）----
      case 616: case 617: {
        const walkStep = 8;
        this.spriteDirection = this.direction;
        this.frameCounter += 1;
        if (this.frameCounter > walkStep) {
          this.frameCounter = 0;
          this.frame++;
          if (this.frame > 7) this.frame = 0;
        }
        if (vx === 0) { this.frameCounter = 0; this.frame = 0; }
        if (vy !== 0) { this.frameCounter = 0; this.frame = 8; }
        break;
      }
      // ---- 海马（:77482：wet 速度分档 0..3；vx 定朝向）----
      case 626: case 627:
        if (vx !== 0) this.spriteDirection = vx < 0 ? -1 : 1;
        if (!this.proto.isAquatic) { this.frame = 0; break; }
        {
          const sp = Math.hypot(vx, vy);
          this.frame = sp > 0.15 ? 3 : sp > 0.05 ? 2 : sp > 0.025 ? 1 : 0;
        }
        break;
      // ---- 蝎族（:77522：静止锁 0；|vx| 累加 6 阈值全循环）----
      case 366: case 367:
        if (vy === 0) {
          if (this.direction === 1) this.spriteDirection = 1;
          if (this.direction === -1) this.spriteDirection = -1;
        }
        if (vx === 0) { this.frame = 0; this.frameCounter = 0; break; }
        this.frameCounter += Math.abs(vx) + 1;
        if (this.frameCounter > 6) { this.frame++; this.frameCounter = 0; }
        if (this.frame >= count) this.frame = 0;
        break;
      // ---- 松鼠族（:77160：aiStyle==3 转身锁 0；上升=2 下降=4；行走循环回卷 1）----
      case 299: case 538: case 539: case 639: case 640: case 641: case 642: case 643: case 644: case 645:
        if (vy === 0) {
          if (this.direction === 1) this.spriteDirection = 1;
          if (this.direction === -1) this.spriteDirection = -1;
          const aiStyle = vanillaNpc(this.npcType)?.aiStyle ?? 0;
          if (aiStyle === 3 && ((this.direction < 0 && vx > 0) || (this.direction > 0 && vx < 0))) {
            this.frame = 0; this.frameCounter = 0; break;
          }
          if (vx === 0) { this.frame = 0; this.frameCounter = 0; break; }
          this.frameCounter += Math.abs(vx) * 0.5 + 1;
          if (this.frameCounter > 6) { this.frame++; this.frameCounter = 0; }
          if (this.frame >= count - 1) this.frame = 1;
        } else if (vy < 0) { this.frameCounter = 0; this.frame = 2; }
        else { this.frameCounter = 0; this.frame = 4; }
        break;
      // ---- 企鹅（:77094：localAI0 恒 0 → 段偏移 0；静止锁 0；|vx| 三段 0/1/2）----
      case 148: case 149: case 168: case 470:
        if (vy === 0) {
          if (this.direction === 1) this.spriteDirection = 1;
          if (this.direction === -1) this.spriteDirection = -1;
          if (vx === 0) { this.frame = 0; this.frameCounter = 0; break; }
          this.frameCounter += Math.abs(vx);
          if (this.frameCounter < 6) this.frame = 0;
          else if (this.frameCounter < 12) this.frame = 1;
          else if (this.frameCounter < 15) this.frame = 2;
          else { this.frameCounter = 0; this.frame = 2; }
        } else { this.frameCounter = 0; this.frame = 2; }
        break;
      // ---- 蚱蜢（:71627：腾空=1 落地=0 两态）----
      case 377: case 446:
        this.frame = vy !== 0 ? 1 : 0;
        this.spriteDirection = this.direction;
        break;
      // ---- 松露虫（:71793：地面 6t 空中 3t 循环 1..3）----
      case 374:
        if (vy === 0) {
          if (vx === 0) { this.frame = 0; this.frameCounter = 0; break; }
          this.frameCounter += 1;
          if (this.frameCounter > 6) {
            this.frameCounter = 0; this.frame++;
            if (this.frame >= 4) this.frame = 1;
          }
        } else {
          this.frameCounter += 1;
          if (this.frameCounter > 3) {
            this.frameCounter = 0; this.frame++;
            if (this.frame >= 4) this.frame = 1;
          }
        }
        break;
      // ---- 萤火虫（:73369：4t 亮/3t 暗；localAI2<=0（灯灭）→ 帧 +2）----
      case 355: case 358: case 654:
        this.spriteDirection = this.direction;
        this.frameCounter += 1;
        if (this.frameCounter < 4) this.frame = 0;
        else { this.frame = 1; if (this.frameCounter >= 7) this.frameCounter = 0; }
        if (!this.lightOn) this.frame += 2;
        break;
      // ---- 微光之灵（:73391：counter 双 +1，≥6 推进，0..4 循环）----
      case 677:
        this.spriteDirection = this.direction;
        this.frameCounter += 1;
        this.frameCounter += 1;
        if (this.frameCounter >= 6) {
          this.frameCounter = 0;
          this.frame++;
          if (this.frame >= 5) this.frame = 0;
        }
        break;
      // ---- 蜻蜓（:73403：count*3 一循环，每 3t 一帧全循环）----
      case 595: case 596: case 597: case 598: case 599: case 600: case 601: {
        this.spriteDirection = this.direction;
        this.frameCounter += 1;
        if (this.frameCounter >= count * 3) this.frameCounter = 0;
        this.frame = Math.floor(this.frameCounter / 3);
        break;
      }
      // ---- 蝶族（:73420-73453：0/1/2/1 四相 7t；356 叠物种窗口）----
      case 356: case 444: case 653: case 661: {
        this.spriteDirection = this.direction;
        this.frameCounter += 1 + (Math.abs(vx) + Math.abs(vy)) / 2;
        if (this.frameCounter < 7) this.frame = 0;
        else if (this.frameCounter < 14) this.frame = 1;
        else if (this.frameCounter < 21) this.frame = 2;
        else {
          this.frame = 1;
          if (this.frameCounter >= 27) this.frameCounter = 0;
        }
        if (type !== 444 && type !== 653 && type !== 661) this.frame += 3 * (this.variant - 1);
        break;
      }
      // ---- 蠕虫族（:73455：静止=1；行走 0↔1 12t；腾空=1）----
      case 357: case 448: case 484: case 606:
        if (vy === 0) {
          if (vx === 0) { this.frame = 1; this.frameCounter = 0; }
          else {
            this.frameCounter += 1;
            if (this.frameCounter > 12) {
              this.frameCounter = 0; this.frame++;
              if (this.frame > 1) this.frame = 0;
            }
          }
        } else this.frame = 1;
        break;
      // ---- 附魔夜爬虫（:73511：|vx|×5 累加 10 阈值 0..3 循环；静止/腾空=1）----
      case 485: case 486: case 487:
        this.spriteDirection = this.direction;
        if (vy === 0) {
          if (vx === 0) { this.frame = 1; this.frameCounter = 0; }
          else {
            this.frameCounter += Math.abs(vx * 5);
            if (this.frameCounter > 10) {
              this.frameCounter = 0; this.frame++;
              if (this.frame > 3) this.frame = 0;
            }
          }
        } else this.frame = 1;
        break;
      // ---- 蜗牛（:72919：下坠 4/5 两相 6t；移动 0/1/2/3/2/1 六拍 10t；静止保持）----
      case 359: case 360: case 655:
        if (vy > 1) {
          this.frameCounter += 1;
          if (this.frameCounter < 6) this.frame = 4;
          else {
            this.frame = 5;
            if (this.frameCounter >= 11) this.frameCounter = 0;
          }
        } else {
          if (!moving) break;                                // :72947 velocity==Zero → 保持当前帧
          this.frameCounter += 1;
          if (this.frameCounter < 10) this.frame = 0;
          else if (this.frameCounter < 20) this.frame = 1;
          else if (this.frameCounter < 30) this.frame = 2;
          else if (this.frameCounter < 40) this.frame = 3;
          else if (this.frameCounter < 50) this.frame = 2;
          else {
            this.frame = 1;
            if (this.frameCounter >= 59) this.frameCounter = 0;
          }
        }
        break;
      // ---- 妖精（:70504：4t/帧 0..3 全循环）----
      case 583: case 584: case 585:
        this.frameCounter += 1;
        if (this.frameCounter >= 4) {
          this.frame++; this.frameCounter = 0;
          if (this.frame >= 4) this.frame = 0;
        }
        break;
      // ---- 水黾（:70442：驻留/滑行/疾行三档节拍 2/60，5 帧循环）----
      case 612: case 613: {
        let gate = true;
        if (this.frame === 0 && Math.floor(Math.random() * 180) !== 0) gate = false;
        if (gate) this.frameCounter += 1;
        if (vx !== 0) this.spriteDirection = Math.sign(vx);
        let step = 10;
        const fast = Math.abs(vx) > 1;
        if (Math.abs(vy) > 0.1 || fast) { this.frameCounter = 0; this.frame = 4; }
        else if (this.frame === 0) step = 2;
        if (this.frame === 4) step = fast ? 60 : 2;
        if (this.frameCounter >= step) {
          this.frameCounter = 0; this.frame++;
          if (this.frame >= 5) this.frame = 0;
        }
        break;
      }
      // ---- 瓢虫（:67616：2t/帧；腾空段 +4）/ 椿象（:67636 同体）----
      case 604: case 605: case 669: {
        this.spriteDirection = this.direction;
        const sub = 2;
        if (moving) {
          this.frameCounter += 1;
          if (this.frameCounter >= 4 * sub) this.frameCounter = 0;
        }
        const seg = Math.floor(this.frameCounter / sub);
        this.frame = vy === 0 ? seg : 4 + seg;
        break;
      }
      // ---- 河豚（:74942：wet 8t/帧 0..3 循环；ai[2]==1 充气段 n/a）----
      case 688:
        this.spriteDirection = this.direction;
        if (!this.proto.isAquatic) {
          this.frameCounter += 1;
          if (this.frameCounter >= 12) { this.frameCounter = 0; this.frame++; }
          if (this.frame < 4 || this.frame > 5) this.frame = 4;
        } else {
          this.frameCounter += 1;
          if (this.frameCounter >= 8) { this.frameCounter = 0; this.frame++; }
          if (this.frame > 3) this.frame = 0;
        }
        break;
      default:
        // 拴绳全集均有专属 case（见 NPC_FAMILY 注）；兜底 6t 全循环（FindFrame 通用档）
        this.frame = Math.floor(this.animT / 6) % count;
        break;
    }
  }

  /** FindFrame 分派用的 type（Waterfowl vy!=0 → type+1，WaterfowlLeashedCritter.cs:16-19） */
  private get drawFrameNpcType(): number {
    return this.proto.waterfowlSwimSheet && this.vy !== 0 ? this.npcType + 1 : this.npcType;
  }

  /** 帧选择期渲染覆写：Opacity（Recall 渐隐 + Empress 渐隐） */
  get opacity(): number {
    if (this.proto.move === 'walker' && this.state === W_RECALLING) {
      return this.waitTime / RECALL_DURATION; // WalkerLeashedCritter.CopyToDummy :166-171
    }
    if (this.proto.move === 'jumper' && this.state === J_RECALLING) {
      return this.waitTime / RECALL_DURATION; // JumperLeashedCritter.CopyToDummy :244-249
    }
    if (this.proto.empressFade) {
      // EmpressButterfly.Opacity = GetLerpValue(60, 25, fadeAmount)（:16-17）
      const t = (60 - this.fadeAmount) / (60 - 25);
      return Math.max(0, Math.min(1, t));
    }
    return 1;
  }

  /**
   * 绘制旋转（Draw 期 CopyToDummy 重算）：LeashedCritter.CopyToDummy :176 先置 0，
   *  FlyerLeashedCritter.CopyToDummy :69-74 仅 vy!=0 时 rotation = vx*rotationScalar。
   *  ★FindFrame 各族的 rotation 覆写（蝶族 :73426 vx*0.3 / 鸟族 :74331 vx*0.1 等）
   *  只落在 _dummy 上且 CopyFromDummy（:183-188）不回拷——Draw 再次 CopyToDummy 即被
   *  重置丢弃，故拴绳蝶族绘制 rotation 恒 0（勿把 FindFrame 的 rotation 移植进来）
   */
  get rotation(): number {
    if (this.proto.move === 'flyer' && this.vy !== 0) {
      return this.vx * (this.proto.rotationScalar ?? 0);
    }
    return 0;
  }

  /** 绘制用贴图 NPC（WaterfowlLeashedCritter.cs:16-21：vy!=0 → type+1 泳姿表） */
  get drawNpcType(): number {
    return this.proto.waterfowlSwimSheet && this.vy !== 0 ? this.npcType + 1 : this.npcType;
  }

  /**
   * GetDrawOffset（Walker :182-189 / Flyer :153-170 / Jumper :251-258 /
   * WaterStrider :27-38）——halfBrick 贴地 / 悬停 bobbing / 水面贴合。
   *  出口统一叠加 netOffset（Draw :198 `_dummy.position += netOffset + GetDrawOffset()`；
   *  联机半包平滑位移的消费点——Renderer 无需感知）
   */
  getDrawOffset(env: LeashedEnv): { dx: number; dy: number } {
    const o = this.getDrawOffsetRaw(env);
    return { dx: o.dx + this.netOffsetX, dy: o.dy + this.netOffsetY };
  }

  private getDrawOffsetRaw(env: LeashedEnv): { dx: number; dy: number } {
    const st = this.store;
    const p = this.proto;
    const px = Math.floor(this.cx) >> 4;
    const py = Math.floor(this.cy) >> 4;
    if (p.move === 'flyer') {
      if (this.vy === 0) {
        if (st && st.inBounds(px, py + 1) && st.half[st.idx(px, py + 1)]) return { dx: 0, dy: 8 };
        return { dx: 0, dy: 0 };
      }
      // FishLeashedCritter.GetDrawOffset :35-37：恒走 bobbing（不判 vy）
      if (p.isAquatic) return { dx: 0, dy: this.bobbingOffset(env) };
      if ((p.hoverPeriod ?? 0) === 0 || (p.hoverAmplitude ?? 0) === 0) return { dx: 0, dy: 0 };
      return { dx: 0, dy: this.bobbingOffset(env) };
    }
    if (p.move === 'jumper') {
      // Jumper :251-258：halfBrick → (0, Center.Y % 16)
      if (st && st.inBounds(px, py + 1) && st.half[st.idx(px, py + 1)]) {
        return { dx: 0, dy: this.cy % T };
      }
      // WaterStrider :27-38：向下找液面 → (255-liquid)/16
      if (p.canStandOnWater && st) {
        let qy = py;
        for (let i = 0; i < 2; i++) {
          qy++;
          if (!st.inBounds(px, qy)) break;
          const liq = st.liquid[st.idx(px, qy)];
          if (liq !== 0) return { dx: 0, dy: Math.floor((255 - liq) / T) }; // C# int 除法
        }
      }
      return { dx: 0, dy: 0 };
    }
    // Walker :182-189：halfBrick → (0,8)
    if (st && st.inBounds(px, py + 1) && st.half[st.idx(px, py + 1)]) return { dx: 0, dy: 8 };
    return { dx: 0, dy: 0 };
  }

  /** GetBobbingOffset（FlyerLeashedCritter.cs:172-178） */
  private bobbingOffset(env: LeashedEnv): number {
    let t = env.timeForVisualEffects + this.whoAmI * this.npcType;
    t *= (this.proto.hoverPeriod ?? 0) * Math.PI * 2;
    return Math.sin(t) * (this.proto.hoverAmplitude ?? 0);
  }

  /** 单帧推进（= LeashedEntity.Update；引擎分流） */
  update(st: TileStore, env: LeashedEnv): void {
    this.store = st;
    this.env = env;
    // 基类段（LeashedCritter.Update :110-112，Walker/Flyer/Jumper.Update 首行
    // base.Update()）：netOffset 每帧向 0 收敛 2px（联机半包平滑，单机恒 0 no-op）
    this.netOffsetX = moveTowardsF(this.netOffsetX, 0, 2);
    this.netOffsetY = moveTowardsF(this.netOffsetY, 0, 2);
    if (this.proto.move === 'walker') this.updateWalker(st, env);
    else if (this.proto.move === 'flyer') this.updateFlyer(st, env);
    else this.updateJumper(st, env);
  }
}

/** NPCID.Sets.IsGoldCritter（NPCID.cs:4456）——金系 14 id */
export const IS_GOLD_CRITTER: ReadonlySet<number> = new Set([
  442, 443, 444, 445, 446, 447, 448, 539, 592, 593, 601, 605, 613, 627,
]);

// ============================================================================
// LeashedKiteEntity —— 风筝本体（LeashedKite.cs 全文 1:1 + Projectile.KiteLogic
//   :45809-46036 1:1；绘制走 Renderer.drawLeashedKite = Main.DrawKite :36614-37069）
// ============================================================================

/** ProjectileID.Sets.TrailCacheLength（ProjectileID.cs:293）——风筝族全表（缺省 10） */
export const KITE_TRAIL_LENGTH: Readonly<Record<number, number>> = {
  766: 60, 767: 60, 768: 60, 769: 60, 770: 60, 771: 80,
  822: 80, 823: 80, 824: 60, 826: 60, 827: 65, 828: 60, 829: 60,
  830: 80, 838: 80, 839: 60, 840: 60, 843: 60, 844: 65, 845: 80,
  846: 80, 850: 80, 852: 60, 853: 60,
};

/** KiteLogic 收放线界 num=4 / num2=500（Projectile.cs:45813-45815；owner=255 收放块
 *  不走——锚桩风筝无 channel/controlUseItem 输入，登记于类注释） */

export class LeashedKiteEntity {
  readonly ax: number;
  readonly ay: number;
  readonly projType: number;

  /** Size = _dummy.Size（Projectile.DefaultToKite → 4×4，Projectile.cs:10133-10140） */
  w: number;
  h: number;
  /** Center（LeashedEntity.Center = position + Size/2） */
  cx: number;
  cy: number;
  vx = 0;
  vy = 0;
  rotation = 0;
  spriteDirection = 1;
  /** ai[0]——线长（LeashedKite.cs:20 随无风衰减 250→48；CopyToDummy :255） */
  kiteDistance = 250;
  windTarget = 0;
  windCurrent = 0;
  timeCounter = 0;
  /** Main.cloudAlpha 快照（Update :104——KiteLogic 读 info 不读 Main） */
  cloudAlpha = 0;
  timeWithoutWind = 0;
  /** localAI[0]——无风下垂累积 0..300（KiteLogic :45871，DrawKite num18 源） */
  projectileLocalAI0 = 0;
  /** localAI[1]——下垂/飘飞插值 0..1（KiteLogic :45968，DrawKite num19 源） */
  projectileLocalAI1 = 0;
  frame = 0;
  frameCounter = 0;
  /** localAI[2]——线长变化音效簿记（KiteLogic :45838-45854；owner!=myPlayer 不播） */
  private localAI2 = 0;
  private soundDelay = 0;
  /** Main.player[255].direction（MoveKite 借空 Player 持朝向，KiteLogic 尾行消费） */
  dummyDirection = 1;
  /** 拖尾（oldPos/oldRot/oldSpriteDirection，LeashedKite.cs:26-28；长度 = TrailCacheLength） */
  oldPos: Array<{ x: number; y: number }> = [];
  oldRot: number[] = [];
  oldSpriteDirection: number[] = [];
  active = true;
  /** 联机 netId（同 LeashedCritterEntity——房主广播需要，本地实体也持有） */
  netId = 0;
  /** 访客端傀儡标记（同 LeashedCritterEntity）：Update 不覆写风态
   *  （LeashedKite.cs:144-148 `if (Main.netMode != 1)` 门）、section 再激活不快进 */
  netPuppet = false;
  /** NetReceive 半包平滑位移（LeashedKite.cs:47/87-92/162）——绘制消费需 Renderer
   *  侧 drawLeashedKite 叠加（本仓渲染层暂未接，登记为遗留项，见 GAP 台账⑤） */
  netOffsetX = 0;
  netOffsetY = 0;
  /** 地形查询用 store（manager 注入；InAPlaceWithWind / HandleMovement 需要） */
  store: TileStore | null = null;

  constructor(ax: number, ay: number, projType: number, w: number, h: number) {
    this.ax = ax; this.ay = ay;
    this.projType = projType;
    this.w = w; this.h = h;
    this.cx = ax * T + 8;
    this.cy = ay * T + 8;
  }

  /** AnchorWorldPosition（LeashedKite.cs:49——AnchorPosition.ToWorldCoordinates()） */
  get anchorX(): number { return this.ax * T + 8; }
  get anchorY(): number { return this.ay * T + 8; }

  // ------------------------------------------------------------------
  // 联机序列化（LeashedKite.cs:58-98 NetSend/NetReceive 字段序 1:1）
  // ------------------------------------------------------------------

  /**
   * NetSend（LeashedKite.cs:58-70）。字段序：full 身份头（projType + 本仓扩展的
   *  w/h——原版 Size 由 SetDefaults(projType) 派生，访客端无 _dummy 重建链须随包带）
   *  → 恒有段。编码对齐：position = WriteVector2（f32×2，position 为左上 = Center-Size/2）、
   *  velocity = WritePackedVector2（f16×2）、rotation = u8（256 份之一圈，:66/:81）
   */
  toNet(w: NetWriter, full: boolean): void {
    if (full) {
      w.u16(this.projType & 0xffff);
      w.u16(clampU16(this.w));
      w.u16(clampU16(this.h));
    }
    w.f32(this.cx - this.w / 2);
    w.f32(this.cy - this.h / 2);
    w.f16(this.vx);
    w.f16(this.vy);
    w.u8(Math.trunc((this.rotation * 256) / (Math.PI * 2)) & 0xff);
    w.f32(this.windTarget);
    w.f32(this.cloudAlpha);
    w.f32(this.timeCounter);
  }

  /** NetReceive（LeashedKite.cs:72-98）：恒有段 + netOffset 簿记（full 清零 / 半包累积） */
  fromNet(r: NetReader, full: boolean): void {
    const oldCx = this.cx, oldCy = this.cy;
    this.cx = r.f32() + this.w / 2;
    this.cy = r.f32() + this.h / 2;
    this.vx = r.f16();
    this.vy = r.f16();
    this.rotation = (r.u8() * Math.PI * 2) / 256;
    this.windTarget = r.f32();
    this.cloudAlpha = r.f32();
    this.timeCounter = r.f32();
    if (full) { this.netOffsetX = 0; this.netOffsetY = 0; }
    else { this.netOffsetX += oldCx - this.cx; this.netOffsetY += oldCy - this.cy; }
  }

  /** FixFirstTimeAppearance（LeashedKite.cs:100-107）：NetReceive(full) 尾段——
   *  无风处直接置下垂态（localAI0=300/localAI1=1），防新端风筝凭空悬停 */
  fixFirstTimeAppearance(env: LeashedEnv): void {
    if (!this.inWind(env)) {
      this.projectileLocalAI0 = 300;
      this.projectileLocalAI1 = 1;
    }
  }

  /** Spawn(bool newlyAdded)（LeashedKite.cs:232-239） */
  spawn(st: TileStore, env: LeashedEnv, newlyAdded = true): void {
    this.store = st;
    this.cx = this.anchorX;
    this.cy = this.anchorY;
    this.vx = 0;
    this.vy = -5;
    this.update(st, env, !newlyAdded);
    this.windCurrent = this.windTarget = env.windForVisuals;
    this.cloudAlpha = env.cloudAlpha;
  }

  /** Update()（LeashedKite.cs:117-120 → :122-163） */
  update(st: TileStore, env: LeashedEnv, fastForward = false): void {
    this.store = st;
    if (this.oldPos.length === 0) this.initTrail();
    // NearbySectionsMissing（LeashedEntity.cs:526-538）：netMode!=1 恒 false
    // :135-143：快进或单帧位移 >16px → 整条拖尾吸附当前态（防拉丝）
    const dx = this.cx - this.oldPos[0].x, dy = this.cy - this.oldPos[0].y;
    if (fastForward || dx * dx + dy * dy > 256) this.snapTrail();
    // :144-148 `if (Main.netMode != 1)`——访客端傀儡不覆写：windTarget/cloudAlpha 以
    // PartialSync 为准（FullSync 恒有段），本地环境风仅权威端采样
    if (!this.netPuppet) {
      this.windTarget = env.windForVisuals;
      this.cloudAlpha = env.cloudAlpha;
    }
    // :149-157：windCurrent 先清零；有风处 = Lerp(0, windTarget, 0.05)（快进 = 直取）
    this.windCurrent = 0;
    if (this.inWind(env)) {
      this.windCurrent = fastForward ? this.windTarget : this.windTarget * 0.05;
    } else {
      this.windTarget = 0;
    }
    // :158-160
    const windy = Math.abs(this.windCurrent) >= KITE_WIND_GATE;
    this.timeWithoutWind = !windy ? (fastForward ? 3600 : this.timeWithoutWind + 1) : 0;
    this.kiteDistance = remap(this.timeWithoutWind, 120, 420, 250, 48);
    this.moveKite(st, env, fastForward);
    // netOffset.MoveTowards(0, 2)（:162）——联机半包平滑位移收敛（单机恒 0 no-op）
    this.netOffsetX = moveTowardsF(this.netOffsetX, 0, 2);
    this.netOffsetY = moveTowardsF(this.netOffsetY, 0, 2);
  }

  /** WorldGen.InAPlaceWithWind(position, width, height)（LeashedKite.cs:150） */
  private inWind(env: LeashedEnv): boolean {
    const st = this.store;
    if (!st) return false;
    return inAPlaceWithWind(st, this.cx - this.w / 2, this.cy - this.h / 2, this.w, this.h, env.worldSurface);
  }

  private initTrail(): void {
    const n = KITE_TRAIL_LENGTH[this.projType] ?? 10;
    this.oldPos = Array.from({ length: n }, () => ({ x: this.cx, y: this.cy }));
    this.oldRot = new Array<number>(n).fill(this.rotation);
    this.oldSpriteDirection = new Array<number>(n).fill(this.spriteDirection);
  }

  private snapTrail(): void {
    for (let i = 0; i < this.oldPos.length; i++) {
      this.oldPos[i].x = this.cx; this.oldPos[i].y = this.cy;
      this.oldRot[i] = this.rotation;
      this.oldSpriteDirection[i] = this.spriteDirection;
    }
  }

  /** Utils.Shift(arr, 1) + 记录当前态（LeashedKite.cs:215-220） */
  private shiftTrail(): void {
    for (let i = this.oldPos.length - 1; i > 0; i--) {
      this.oldPos[i].x = this.oldPos[i - 1].x; this.oldPos[i].y = this.oldPos[i - 1].y;
      this.oldRot[i] = this.oldRot[i - 1];
      this.oldSpriteDirection[i] = this.oldSpriteDirection[i - 1];
    }
    this.oldPos[0].x = this.cx; this.oldPos[0].y = this.cy;
    this.oldRot[0] = this.rotation;
    this.oldSpriteDirection[0] = this.spriteDirection;
  }

  /** MoveKite(fastForward)（LeashedKite.cs:165-230） */
  private moveKite(st: TileStore, env: LeashedEnv, fastForward: boolean): void {
    // _dummy.owner = 255；player[255].Center = AnchorWorldPosition（:167-170）
    if (this.timeWithoutWind === 0) {
      const dir = this.cx - this.anchorX < 0 ? -1 : 1;      // :173（!(<0) ? 1 : -1）
      this.spriteDirection = dir;
      this.dummyDirection = dir;
    }
    this.timeCounter += 1 / 60;
    const bobOffset = (this.anchorX + this.anchorY * 0.92) * 0.0025;   // KiteFlyingInfo :180
    if (fastForward) {
      // :187-212：KiteLogic → 顺风力位矢量积分 → 限速 4 → 再 KiteLogic → 无风锁下垂
      this.kiteLogic(st, env, bobOffset);
      this.timeCounter = 6;
      const wY = this.windCurrent > 0 ? -2 : 2;
      const len = Math.hypot(this.windCurrent, wY);
      const nx = len > 0 ? this.windCurrent / len : 0;
      const ny = len > 0 ? wY / len : 0;
      this.vx = nx * this.kiteDistance;
      this.vy = ny * this.kiteDistance;
      this.handleMovement(st);
      // _dummy.position.MoveTowards(自身, 1)（:194）——恒等 no-op（反编译产物），从略
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 4) { this.vx *= 4 / sp; this.vy *= 4 / sp; }
      this.kiteLogic(st, env, bobOffset);
      if (this.windCurrent === 0) {
        this.rotation = 0;
        this.projectileLocalAI0 = 300;
        this.projectileLocalAI1 = 1;
      }
      for (let i = this.oldPos.length - 1; i >= 0; i--) {   // :206-211
        this.oldPos[i].x = this.cx; this.oldPos[i].y = this.cy;
        this.oldRot[i] = this.rotation;
        this.oldSpriteDirection[i] = this.spriteDirection;
      }
      return;
    }
    this.shiftTrail();                                      // :215-220
    this.kiteLogic(st, env, bobOffset);                     // :221
    this.handleMovement(st);                                // :222
    // :223-227：嵌实心 → Bottom.MoveTowards(anchor, 2)（拉绳碰撞回拉）
    if (solidFullTiles(st, this.cx - this.w * 0.5, this.cy - this.h * 0.5, this.w, this.h)) {
      const bx = this.cx;
      const by = this.cy + this.h / 2;                     // _dummy.Bottom
      const ddx = this.anchorX - bx, ddy = this.anchorY - by;
      const sq = ddx * ddx + ddy * ddy;
      if (sq > 0 && 4 < sq) {
        const d = Math.sqrt(sq);
        this.cx += (ddx / d) * 2;
        this.cy += (ddy / d) * 2;
      } else {
        this.cx = this.anchorX;
        this.cy = this.anchorY - this.h / 2;
      }
    }
  }

  /**
   * Projectile.KiteLogic（Projectile.cs:45809-46036，owner=255 恒定档）：
   *  - 收放线块（:45816-45837）owner==Main.myPlayer 才走——锚桩风筝无收放输入
   *    （玩家手持风筝的 channel 收/-5、controlUseItem 放/+5 不适用）
   *  - 线长 ai[0] = kiteDistance（CopyToDummy :255），张力段 :45910-45945
   */
  private kiteLogic(st: TileStore, env: LeashedEnv, bobOffset: number): void {
    void st;
    const ai0 = this.kiteDistance;
    // :45838-45854 localAI[2] 线长簿记 + soundDelay（owner!=myPlayer → 不播音效）
    if (this.localAI2 === 0) this.localAI2 = ai0;
    else if (this.localAI2 !== ai0) {
      this.localAI2 = ai0;
      if (this.soundDelay === 0) this.soundDelay = 30;
    }
    if (this.soundDelay > 0) this.soundDelay--;
    // :45863-45871
    const num6 = this.inWind(env) ? this.windCurrent : 0;
    const windy = Math.abs(num6) >= KITE_WIND_GATE;
    this.projectileLocalAI0 = clampF(this.projectileLocalAI0 - (windy ? 1 : -1), 0, 300);
    const num7 = getLerpValue(0.2, 0.5, Math.abs(num6), true) * 0.5;   // 升力
    // :45873-45885：拍动目标中心（风推 + 正弦摆 + 云湍流）
    let vecX = num6 * 25;
    let vecY = (Math.sin(this.timeCounter + bobOffset) + this.cloudAlpha * 5) * 25;
    if (this.cloudAlpha > 0 && Math.abs(num6) >= this.cloudAlpha / 2 && vecY > 0) {
      vecY *= 1 - Math.abs(num6) * 2;
    }
    const centerX = this.cx + vecX;
    const centerY = this.cy + vecY;
    let vxT = centerX - this.cx, vyT = centerY - this.cy;
    const vl = Math.hypot(vxT, vyT);
    const push = 3 + this.cloudAlpha * 7;
    if (vl > 0) { vxT = vxT / vl * push; vyT = vyT / vl * push; }
    else { vxT = 0; vyT = 0; }
    if (num7 === 0) { vxT = 0; vyT = 0; }
    // extraUpdates=0（CopyToDummy :258）→ :45886-45890 不走
    // :45891-45909：速度趋近拍动矢量 + 升力/微重力
    const num8 = Math.hypot(centerX - this.cx, centerY - this.cy);
    const lerpValue = getLerpValue(5, 10, num8, true);
    const yKeep = this.vy;
    if (num8 > 10) {
      const t = 0.075 * lerpValue;
      this.vx += (vxT - this.vx) * t;
      this.vy += (vyT - this.vy) * t;
    }
    this.vy = yKeep;
    this.vy -= num7;
    this.vy += 0.02 + num7 * 0.25;
    this.vy = clampF(this.vy, -2, 2);
    if (this.cy + this.vy < centerY) {                     // :45902-45905
      this.vy += (this.vy + num7 + 0.01 - this.vy) * 0.75;
    }
    if (Math.abs(this.vx) > 0.02) this.vx *= 0.98;
    // :45910-45945：线张力（超出线长 → 朝锚点回拽 + 俯仰修正）
    const num9 = Math.hypot(this.anchorX - this.cx, this.anchorY - this.cy);
    const num10 = ai0;
    const flag2 = num9 > num10;
    const flag3 = num9 > num10 - 2;
    if (flag2) {
      let ddx = this.anchorX - this.cx, ddy = this.anchorY - this.cy;
      const dl = Math.hypot(ddx, ddy) || 1;
      ddx /= dl; ddy /= dl;
      const num11 = num9 - num10;
      this.vx += ddx * num11;                               // CanReelThroughBlocks=false → 加速度档
      this.vy += ddy * num11;
      let flag4 = ddy < 0.8 || num7 > 0;                    // Dot(dir, UnitY) = dir.Y
      if (num7 === 0 && Math.abs(this.vx) < 0.05) flag4 = false;
      this.vy += ddy * 0.05;
      if (flag4) this.vy -= 0.15;
      this.vx += ddx * 0.2;
      // :45938-45944 收到最短(4)即 Kill——仅 owner==myPlayer，锚桩风筝不触发
    }
    // timeLeft = 2（:45946）——无消亡语义，从略
    // :45947-45952：横向占比过半 → 借位 Player 转向
    const v4x = this.cx - this.anchorX, v4y = this.cy - this.anchorY;
    const dir = v4x > 0 ? 1 : -1;
    if (Math.abs(v4x) > Math.abs(v4y) / 2) this.dummyDirection = dir;
    // :45953-45967：朝向（下垂衰减 vs 锚点反方向 + π/4 偏置）
    let d5x = this.anchorX - this.cx, d5y = this.anchorY - this.cy;
    const d5l = Math.hypot(d5x, d5y);
    if (d5l > 0) { d5x /= d5l; d5y /= d5l; } else { d5x = 0; d5y = 0; }
    const flag5 = num7 === 0 && this.vy >= 0.02 && !flag3; // 下垂态
    if (flag5) {
      this.rotation *= 0.95;
    } else {
      let num12 = Math.atan2(-d5y, -d5x) + Math.PI / 4;    // (-vector5).ToRotation()
      if (this.spriteDirection === -1) num12 -= Math.PI / 2 * this.dummyDirection;
      this.rotation = num12 + this.vx * 0.05;
    }
    this.projectileLocalAI1 = clampF(this.projectileLocalAI1 + (flag5 ? 1 : -1) * 0.005, 0, 1);
    // :45969-46034 帧表 + :46035 spriteDirection = player.direction
    this.selectFrame(num7);
    this.spriteDirection = this.dummyDirection;
  }

  /** KiteLogic 帧选择（Projectile.cs:45969-46034） */
  private selectFrame(num7: number): void {
    const speed = Math.hypot(this.vx, this.vy);
    switch (this.projType) {
      case 771: case 822: case 823: case 827: case 830: case 838:
      case 843: case 844: case 845: case 846: case 850: case 852:
        this.frame = 0;
        break;
      case 828: case 829:
        this.frame = speed < 6 ? 1 : 0;
        break;
      case 826:
        this.frame = 0;      // frame = (int)ai[1]——CopyToDummy 不写 ai[1] 恒 0
        break;
      case 824: case 839: case 840: case 853:
        if (num7 < 0.15) { this.frame = 0; break; }
        this.frameCounter++;
        if (this.frameCounter > (1 - num7) * 10) {
          this.frameCounter = 0;
          this.frame = Math.floor(Math.random() * 4);      // Main.rand.Next(4)
        }
        break;
      default:               // 766-770 五色风筝：速度四档
        this.frame = speed < 3 ? 0 : speed < 5 ? 1 : speed < 7 ? 2 : 3;
        break;
    }
  }

  /**
   * Projectile.HandleMovement 子集（:16132-16520，aiStyle 160 / wet=false / 4×4 盒）：
   *  GetCollisionParams（:18459-18480）resizeAnchor=(0.5,0.5) colW/H=width/height →
   *  盒心=Center；|velocity| ≤ min(w,h)（=4）走 :16488-16513 直移档：
   *  TileCollision（分量阻挡清零，fallThrough=true 平台不阻）+ SlopeCollision（位移积分）。
   *  坡面贴合段从略（本仓生成期坡面罕见，登记备案）
   */
  private handleMovement(st: TileStore): void {
    let nvx = this.vx;
    let nvy = this.vy;
    const px = this.cx - this.w / 2, py = this.cy - this.h / 2;
    if (nvx !== 0 && boxHitsSolid(st, px + nvx, py, this.w, this.h)) nvx = 0;
    if (nvy !== 0 && boxHitsSolid(st, px + nvx, py + nvy, this.w, this.h)) nvy = 0;
    this.vx = nvx;
    this.vy = nvy;
    this.cx += this.vx;
    this.cy += this.vy;
  }
}

/** MinimumWindStrengthToFlyKite（Projectile.cs:302） */
const KITE_WIND_GATE = 0.2;

/** Collision.TileCollision 阻挡格（nactive && tileSolid && !tileSolidTop；平台不阻） */
function boxHitsSolid(st: TileStore, px: number, py: number, w: number, h: number): boolean {
  const x0 = Math.floor(px / T), y0 = Math.floor(py / T);
  const x1 = Math.floor((px + w - 0.0001) / T), y1 = Math.floor((py + h - 0.0001) / T);
  for (let i = x0; i <= x1; i++) {
    for (let j = y0; j <= y1; j++) {
      if (!st.inBounds(i, j)) continue;
      const k = st.idx(i, j);
      if (st.type[k] === 0) continue;
      if (st.wire[k] & 32) continue;                       // !nactive
      const d = TILE_DEFS[st.type[k]];
      if (d && d.solid && !d.platform) return true;
    }
  }
  return false;
}

/** Collision.SolidFullTiles（Collision.cs:3553-3574）：整实心格（无坡/半砖/平台） */
function solidFullTiles(st: TileStore, px: number, py: number, w: number, h: number): boolean {
  const x0 = Math.max(0, Math.floor(px / T));
  const y0 = Math.max(0, Math.floor(py / T));
  const x1 = Math.min(st.w - 1, Math.ceil((px + w) / T) - 1);
  const y1 = Math.min(st.h - 1, Math.ceil((py + h) / T) - 1);
  for (let i = x0; i <= x1; i++) {
    for (let j = y0; j <= y1; j++) {
      const k = st.idx(i, j);
      if (st.type[k] === 0) continue;
      if (st.wire[k] & 32) continue;                       // !nactive
      if (st.half[k]) continue;                            // blockType != 0
      if (st.slope[k] !== 0) continue;                     // blockType != 0
      const d = TILE_DEFS[st.type[k]];
      if (d && d.solid && !d.platform) return true;
    }
  }
  return false;
}

/** Utils.GetLerpValue(a, b, v, clamped)（Utils.cs:283-310；本仓两处调用均为 a<b） */
function getLerpValue(a: number, b: number, v: number, clamped: boolean): number {
  if (clamped && b > a) return clampF((v - a) / (b - a), 0, 1);
  return (v - a) / (b - a);
}

function clampF(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ============================================================================
// Manager（LeashedEntity 静态层等价：ByWhoAmI/BySection → 单列表 + 距离门）
// ============================================================================

export interface LeashedSpawnOpts {
  /** LCG32Random 种子（缺省 = 主随机） */
  seed?: number;
  /** item.placeStyle（NormalButterfly variant） */
  placeStyle?: number;
}

export class LeashedEntityManager {
  critters: LeashedCritterEntity[] = [];
  kites: LeashedKiteEntity[] = [];
  /** 本帧点光（update 期收集；Game 侧消费后清空） */
  lights: LeashedLight[] = [];
  /** 地形查询 store（Game.afterWorldLoad / 换图 attach；spawn 期即需） */
  store: TileStore | null = null;
  /** 主随机（Spawn 的 rand = new LCG32Random(Main.rand.Next())，LeashedCritter.cs:107） */
  private mainRand = new LCG32Random((Math.random() * 0xffffffff) >>> 0);
  /** 联机 netId 序（房主权威分配；原版 whoAmI = ByWhoAmI 空槽复用（:343-355），本仓
   *  取单调递增——Remove 后 id 不复用，访客端迟到 PartialSync 不会误中重生实体） */
  private netSeq = 0;
  /** section 尺寸（LeashedEntity.cs:310：maxTilesX/200 × maxTilesY/150 栅格） */
  static readonly SECTION_W = 200;
  static readonly SECTION_H = 150;
  /** CheckSection 的 fluff（Player.cs:27996 恒 1 → 玩家 section 周围 3×3 激活） */
  private static readonly SECTION_FLUFF = 1;
  /** 实体所在 section 是否在上一帧激活集内（再激活时触发 Spawn(false) 快进，见 update） */
  private activeSections = new Set<number>();
  private activeKey(sx: number, sy: number): number { return sx * 4096 + sy; }

  /** 换图/读档时注入 world store（spawn 期的 Flyer 悬空门 / Jumper 首选点要用） */
  attach(world: { store: TileStore }): void {
    this.store = world.store;
    this.activeSections.clear();
  }

  /** TECritterAnchor.CreateLeashedEntity（:53-62）：itemType → makeNPC → 原型实例 */
  spawnCritter(ax: number, ay: number, itemVid: number, opts?: LeashedSpawnOpts): LeashedCritterEntity | null {
    const npcType = ITEM_MAKE_NPC[itemVid];
    if (npcType === undefined) return null;
    const proto = prototypeOfNpc(npcType);
    const e = new LeashedCritterEntity(ax, ay, npcType, proto,
      opts?.seed ?? this.mainRand.next(0xffffffff));
    e.netId = ++this.netSeq;
    e.whoAmI = this.critters.length;
    e.store = this.store;
    e.setDefaults(opts?.placeStyle ?? placeStyleOfVid(itemVid));
    // AddNewEntity → Spawn(newlyAdded: true)（LeashedEntity.cs:357-373）
    e.spawn();
    this.critters.push(e);
    return e;
  }

  /** TEKiteAnchor.CreateLeashedEntity（:54-62）：itemType → shoot → LeashedKite */
  spawnKite(ax: number, ay: number, projType: number, env: LeashedEnv, projSize = 4): LeashedKiteEntity {
    const st = this.store;
    const e = new LeashedKiteEntity(ax, ay, projType, projSize, projSize);
    e.netId = ++this.netSeq;
    if (st) e.spawn(st, env, true);                         // AddNewEntity → Spawn(true)
    this.kites.push(e);
    return e;
  }

  /** 锚桩消散（TELeashedEntityAnchor.OnRemoved → DespawnLeashedEntity，:16-21） */
  removeAt(x: number, y: number): boolean {
    let removed = false;
    for (const e of this.critters) {
      if (e.ax === x && e.ay === y && e.active) { e.active = false; removed = true; }
    }
    for (const e of this.kites) {
      if (e.ax === x && e.ay === y && e.active) { e.active = false; removed = true; }
    }
    if (removed) this.compact();
    return removed;
  }

  /** OnWorldLoaded → RespawnLeashedEntity（TELeashedEntityAnchor.cs:35-40）：全量重生 */
  respawnAll(
    records: ReadonlyArray<{ x: number; y: number; kind: string; slots: ReadonlyArray<{ id: number } | null | undefined> }>,
    resolveVid: (internalItemId: number) => number,
    env: LeashedEnv,
  ): void {
    this.clear();
    for (const rec of records) {
      const slot = rec.slots[0];
      if (!slot) continue;
      const vid = resolveVid(slot.id);
      if (vid <= 0) continue;
      if (rec.kind === 'critter_anchor') this.spawnCritter(rec.x, rec.y, vid);
      else if (rec.kind === 'kite_anchor') {
        const proj = KITE_ITEM_PROJ[vid];
        if (proj !== undefined) this.spawnKite(rec.x, rec.y, proj, env);
      }
    }
  }

  /**
   * LeashedEntity.UpdateEntities（Main.cs:17895 = RecheckActiveSections :417-434 +
   * _UpdateEntities :436-459）——section 流式 1:1：
   *  - 玩家每 tick ActiveSections.CheckSection(position, fluff=1)（Player.cs:27996）→
   *    恒定激活玩家 section 周围 3×3；60t 不刷新的 section 失活（ActiveSections.cs:8-33）。
   *    稳态下即「实体 section 落在玩家 3×3 内 ⇔ 更新」（半径下限 200 格 = 3200px，
   *    中心对齐时 400 格；此前 3000px 距离门偏紧，已换真判定）。
   *  - section 由失活转激活 → SectionEntityList.Activate → Spawn(newlyAdded: false)
   *    （:213-225，风筝走 fastForward 快进升空）；持续激活则正常 Update。
   *  - SectionCoordinates 以 **AnchorPosition** 取（LeashedEntity.cs:281），非实时位置。
   *  - 入参 playerCx/Cy 为玩家中心（Game 注入）；原版取 position 左上——同一 200 格
   *    section 栅格内偏差 <1 格，等价。
   */
  update(world: { store: TileStore }, env: LeashedEnv, playerCx: number, playerCy: number): void {
    this.lights.length = 0;
    const st = world.store;
    // ---- CheckSection：3×3 激活集（Netplay.GetSectionX/Y = tile/200、tile/150）----
    const psx = Math.floor(playerCx / T / LeashedEntityManager.SECTION_W);
    const psy = Math.floor(playerCy / T / LeashedEntityManager.SECTION_H);
    const next = new Set<number>();
    const f = LeashedEntityManager.SECTION_FLUFF;
    for (let i = psx - f; i <= psx + f; i++) {
      for (let j = psy - f; j <= psy + f; j++) next.add(this.activeKey(i, j));
    }
    // ---- RecheckActiveSections + _UpdateEntities ----
    for (const e of this.critters) {
      const key = this.activeKey(
        Math.floor(e.ax / LeashedEntityManager.SECTION_W),
        Math.floor(e.ay / LeashedEntityManager.SECTION_H));
      if (!next.has(key)) continue;                         // section 未激活：不更新不绘制
      // Activate → Spawn(false)（:213-225）——原版仅 server/单机调（:216 netMode!=1 门）；
      // 访客端傀儡跳过：状态以 PartialSync 为准，归位锚桩会丢权威位置
      if (!this.activeSections.has(key) && !e.netPuppet) e.spawn();
      e.update(st, env);
      e.visualEffects(env, this.lights);
    }
    for (const e of this.kites) {
      const key = this.activeKey(
        Math.floor(e.ax / LeashedEntityManager.SECTION_W),
        Math.floor(e.ay / LeashedEntityManager.SECTION_H));
      if (!next.has(key)) continue;
      if (!this.activeSections.has(key) && !e.netPuppet) {
        // SectionEntityList.Activate → Spawn(false) → Update(fastForward)（风筝回锚快进）
        e.spawn(st, env, false);
      }
      e.update(st, env, false);
    }
    this.activeSections = next;
    for (const l of this.lights) env.addLight(l.tx, l.ty, l.r, l.g, l.b);
  }

  /**
   * DrawEntities 的激活集查询（LeashedEntity.cs:479 只遍历 ActiveSectionList）：
   *  renderer 消费——锚桩 section 非激活的实体不绘制（冻结在 section 外）
   */
  isSectionActive(ax: number, ay: number): boolean {
    return this.activeSections.has(this.activeKey(
      Math.floor(ax / LeashedEntityManager.SECTION_W),
      Math.floor(ay / LeashedEntityManager.SECTION_H)));
  }

  clear(): void {
    this.critters.length = 0;
    this.kites.length = 0;
    this.lights.length = 0;
    this.activeSections.clear();
  }

  private compact(): void {
    this.critters = this.critters.filter((e) => e.active);
    this.kites = this.kites.filter((e) => e.active);
    this.critters.forEach((e, i) => { e.whoAmI = i; });
  }

  at(x: number, y: number): { critter: LeashedCritterEntity | null; kite: LeashedKiteEntity | null } {
    return {
      critter: this.critters.find((e) => e.ax === x && e.ay === y) ?? null,
      kite: this.kites.find((e) => e.ax === x && e.ay === y) ?? null,
    };
  }

  // ==================================================================
  // 联机（msg82 module13；原版 LeashedEntity.NetModule 三消息的 manager 落点）
  // ==================================================================

  /** 锚点 (x,y) 上的实体 netId 集（破坏路径在 removeAt 前捕获，供 Remove 广播） */
  netIdsAt(x: number, y: number): number[] {
    const ids: number[] = [];
    for (const e of this.critters) if (e.ax === x && e.ay === y && e.active) ids.push(e.netId);
    for (const e of this.kites) if (e.ax === x && e.ay === y && e.active) ids.push(e.netId);
    return ids;
  }

  /**
   * HandleFullSync（LeashedEntity.cs:79-96）：
   *  - 身份头（critter: npcType/w/h；kite: projType/w/h）→ 未知 netId 建实体
   *    （= Registry.Get(type).NewInstance + AddNewEntity :86-90）
   *  - 已知 netId → NetReceive(full) 状态刷新；npcType/锚点不符 → 整体替换
   *    （原版 :91-94 throw——本仓自愈替换，重连/服务器补发窗口内陈旧条目不炸连接）
   *  - 同锚点异源实体先清场（防双实体——访客乐观放置与权威包竞争的兜底）
   *  - 尾段 1:1：critter 跑一帧 Update()（:99）；kite 跑 Update() + FixFirstTimeAppearance（:95-96）
   */
  netApplyFull(msg: LeashedNetMsg, env: LeashedEnv): void {
    const r = msg.r;
    if (msg.kind === LEASHED_KIND_CRITTER) {
      const npcType = r.u16();
      const w = r.u16(), h = r.u16();
      let e = this.critters.find((c) => c.netId === msg.netId);
      if (e && (e.npcType !== npcType || e.ax !== msg.ax || e.ay !== msg.ay)) {
        this.critters = this.critters.filter((c) => c !== e);
        e = undefined;
      }
      if (!e) {
        // 同锚点异源实体清场（FullSync 是唯一权威源）
        this.critters = this.critters.filter((c) => !(c.ax === msg.ax && c.ay === msg.ay));
        const proto = prototypeOfNpc(npcType);
        e = new LeashedCritterEntity(msg.ax, msg.ay, npcType, proto, 0);
        if (w > 0) e.w = w;
        if (h > 0) e.h = h;
        e.netId = msg.netId;
        e.netPuppet = true;
        e.whoAmI = this.critters.length;
        e.store = this.store;
        this.critters.push(e);
      }
      e.fromNet(r, true);
      if (this.store) e.update(this.store, env);            // NetReceive(full) 尾段 Update()
      return;
    }
    if (msg.kind === LEASHED_KIND_KITE) {
      const projType = r.u16();
      const w = r.u16(), h = r.u16();
      let e = this.kites.find((k) => k.netId === msg.netId);
      if (e && (e.projType !== projType || e.ax !== msg.ax || e.ay !== msg.ay)) {
        this.kites = this.kites.filter((k) => k !== e);
        e = undefined;
      }
      if (!e) {
        this.kites = this.kites.filter((k) => !(k.ax === msg.ax && k.ay === msg.ay));
        e = new LeashedKiteEntity(msg.ax, msg.ay, projType, w || 4, h || w || 4);
        e.netId = msg.netId;
        e.netPuppet = true;
        e.store = this.store;
        this.kites.push(e);
      }
      e.fromNet(r, true);
      if (this.store) {
        e.update(this.store, env);                          // :95 Update()
        e.fixFirstTimeAppearance(env);                      // :96
      }
      return;
    }
  }

  /** HandlePartialSync（:98-106）：未知 netId 丢弃（等服务器按条带补发的 FullSync 兜底） */
  netApplyPartial(msg: LeashedNetMsg): void {
    const list = msg.kind === LEASHED_KIND_KITE ? this.kites : this.critters;
    const e = list.find((c) => c.netId === msg.netId);
    if (!e) return;
    e.fromNet(msg.r, false);
  }

  /** HandleRemove（:71-77）+ LeashedEntity.Remove（:385-398 列表收缩） */
  netRemove(netId: number): void {
    if (netId <= 0) return;
    this.critters = this.critters.filter((e) => (e.netId === netId ? (e.active = false, false) : true));
    this.kites = this.kites.filter((e) => (e.netId === netId ? (e.active = false, false) : true));
    this.critters.forEach((e, i) => { e.whoAmI = i; });
  }
}

// ============================================================================
// 数学小工具（XNA/Utils 对应物）
// ============================================================================

/** Vector2.MoveTowards（Utils.cs:1830-1849） */
function moveTowards(e: LeashedCritterEntity, tx: number, ty: number, maxDelta: number): void {
  const dx = tx - e.cx, dy = ty - e.cy;
  const sq = dx * dx + dy * dy;
  if (sq === 0 || maxDelta * maxDelta >= sq) {
    e.cx = tx;
    e.cy = ty;
    return;
  }
  const dist = Math.sqrt(sq);
  e.cx += (dx / dist) * maxDelta;
  e.cy += (dy / dist) * maxDelta;
}

/** 标量 MoveTowards（netOffset 每帧收敛用，Utils.cs:1830-1849 的单轴等价） */
function moveTowardsF(v: number, target: number, maxDelta: number): number {
  const d = target - v;
  if (Math.abs(d) <= maxDelta) return target;
  return v + Math.sign(d) * maxDelta;
}

/** 联机序列化钳位（net 写出防脏值） */
function clampU16(v: number): number { return Math.max(0, Math.min(65535, Math.round(v))); }
function clampSByte(v: number): number { return Math.max(-127, Math.min(127, Math.round(v))); }

/** Utils.Remap（Utils.cs:815-821）：[iMin,iMax] → [oMin,oMax] 线性 */
function remap(x: number, iMin: number, iMax: number, oMin: number, oMax: number): number {
  const t = Math.max(0, Math.min(1, (x - iMin) / (iMax - iMin)));
  return oMin + (oMax - oMin) * t;
}

/** Main.hslToRgb（Main.cs:4540 起标准 HSL→RGB）→ [r,g,b] 0-1 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

function hue2rgb(p: number, q: number, tIn: number): number {
  let t = tIn;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

// ============================================================================
// GAP 处置台账（2026-08-13 尾项清零批）
//   ① KiteLogic/DrawKite —— 已对齐：KiteLogic（Projectile.cs:45809-46036）全量
//     入 LeashedKiteEntity.kiteLogic；DrawKite（Main.cs:36614-37069）全量入
//     Renderer.drawLeashedKite（24 型绳索参数表 KITE_ROPE_PARAMS + FishingLine
//     锚绳分段 + Extra 尾条 + oldPos 拖尾）。收放线（:45816-45837 channel −5 /
//     controlUseItem +5）经源码证实 owner==Main.myPlayer 才走——LeashedKite 恒
//     owner=255（MoveKite :168）→ 锚桩风筝原版即无收放输入，等价（不移植）。
//     残留：HandleMovement 的 SlopeCollision 坡面贴合段从略（生成期坡面罕见）；
//     风筝无碰撞音效（kiteSoundPitch 计算无消费端，:45845-45854 owner!=myPlayer
//     不播）。
//   ② DrawBubble —— 已对齐：Renderer.drawLeashedBubble（Gore_413 +
//     (isAquatic&&liquid<255)||(!isAquatic&&liquid>0) 判定，LeashedCritter.cs:200-205）。
//   ③ FindFrame —— 已对齐：拴绳全集 31 组 case（兔/金鱼/鸟/鹦鹉/鸮/鸭+泳姿/
//     海鸥/鼠/蛙/龟/海马/蝎/松鼠/企鹅/蚱蜢/松露虫/萤火虫/微光之灵/蜻蜓/蝶/蠕虫/
//     夜爬虫/蜗牛/妖精/水黾/瓢虫+椿象/河豚）逐条件入 findFrame；spriteDirection
//     覆写持久、rotation 覆写证实被 Draw 期 CopyToDummy 重置（:176）→ 绘制只取
//     rotationScalar 档（蝶族 vx*0.3 已据此移除）。
//   ④ ShimmerFly 拖尾 + Dust —— 已对齐：oldPositions（TrailCacheLength[677]=60）
//     每帧右移入 shiftShimmerTrail，绘制走 DrawNPCDirect_Faeling（Main.cs:26306-
//     26362）四列表 17 段环绕渐隐；尘改走原版 Dust 池（金系 43 带照度门 / Recall
//     15×10 / 地狱蝶 6 / 帝皇蝶 267+CloneDust / 妖精 278）。netOffset 经源码证实
//     仅 NetReceive 半包路径注入（LeashedCritter.cs:90-96 / LeashedKite.cs:90-92）
//     且每帧 MoveTowards(0,2) 收敛——单机恒 0，等价（ShimmerFly 拖尾处已注）。
//     残留：VanillaDust 引擎对 43/15/267/278 的逐型 Update 分支（Dust.cs:1472/
//     :1519/:1660/:2240）未精植，走通用老化档（引擎按消费方扩表的既定模式，
//     见 fx/VanillaDust.ts 头注）。
//   ⑤ section 流式 + NetModule —— 已对齐：流式（ActiveSections.CheckSection(fluff=1)
//     3×3 激活，Player.cs:27996 + ActiveSections.cs:14-33）入 manager.update；失活→
//     再激活走 Spawn(false)（风筝 fastForward 快进；**访客端傀儡跳过**——原版
//     client 端 Activate 不调 Spawn（LeashedEntity.cs:216 netMode!=1 门），状态以
//     PartialSync 为准）。联机同步已落地（msg82 module13 = 原版注册序
//     NetworkInitializer.cs:25）：FullSync（放置/重生广播 + 服务器按条带补发 =
//     SyncEntitiesInSection :469-472 等价）/ PartialSync（每 1024t 逐实体，相位 =
//     出生时刻，原版 whoAmI 错相同效）/ Remove（破坏广播）+ 本仓新增 sub3
//     PlaceRequest（访客放置请求→房主三重校验落账）。先前的两大阻塞均已绕开：
//     ①「furnitureItems 不上网→访客拿不到 makeNPC/shoot」→ FullSync 实体段自带
//     npcType/projType+变体+种子（访客重建不依赖 TE 记录同步）；②「无 section
//     激活协议→定向广播无数据源」→ 服务器登记 FullSync 帧、sendStrips 尾段按条带
//     补发（见 server/src/room.ts handleLeashedModule）。遗留：风筝 netOffset 的
//     渲染消费（drawLeashedKite 需叠画，Renderer 侧一行改动，未在本批所有权内）；
//     Fairy/HellButterfly 尘位置的 netOffset 包裹（LeashedCritter.cs:142/:162，
//     纯粒子位置差异）。
//   ⑥ solidTile2 平台特例 —— 已对齐：WorldGen.cs:70503 全条件入（平台+上半坡
//     算实心；平台平放走 slope==0 也算；下半坡 3/4 不算）。
// ============================================================================
