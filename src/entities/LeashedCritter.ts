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
 * WorldGen.SolidTile2(i, j)（WorldGen.cs:70500-70509）：
 *  active && tileSolid && slope==0 && !halfBrick && !inActive。
 *  （平台 topSlope 特例 :70503 的 `Sets.Platforms && (halfBrick||topSlope)` 与后半
 *  !halfBrick 互斥后仅剩"平台+上半坡"一档，本仓平台坡面罕见且渲染未支持坡面，
 *  从略——备案偏差，见文末 GAP）
 */
export function solidTile2(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false; // 原版越界 Main.tile[i,j]==null → true；本仓越界恒空（防边缘卡死）
  const i = st.idx(x, y);
  if (st.type[i] === 0) return false;                       // !active
  if (st.wire[i] & 32) return false;                        // inActive（致动缩入）
  if (st.half[i]) return false;                             // halfBrick
  if (st.slope[i] !== 0) return false;                      // slope
  const d = TILE_DEFS[st.type[i]];
  return d ? !!d.solid : false;
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

export interface LeashedEnv {
  /** Main.timeForVisualEffects（悬停相位/妖精尘节奏） */
  timeForVisualEffects: number;
  /** Main.dayTime（萤火虫昼地表门，FireflyLeashedCritter.cs:51-54） */
  dayTime: boolean;
  /** Main.worldSurface（萤火虫地表门：position.Y/16 < worldSurface+10） */
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
  /** Dust 近似（金系闪光；缺省不生成） */
  spawnDust?(x: number, y: number, w: number, h: number, color: string): void;
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

  /** Spawn(bool newlyAdded)（Walker 无覆写；Flyer :41-51；Jumper :38-42） */
  spawn(): void {
    const st = this.store;
    if (this.proto.move === 'flyer') {
      // FlyerLeashedCritter.Spawn :43-50：锚桩下非实心 → vy=0.0001（走悬停分支）
      if (st && !solidTile2(st, this.ax, this.ay + 1)) this.vy = HOVER_Y_VELOCITY;
      this.pickFlyTarget();
    } else if (this.proto.move === 'jumper') {
      this.pickJumpTarget(); // JumperLeashedCritter.Spawn :40-42 → PickNewTarget
    }
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

  /** Recall（LeashedCritter.cs:115-134）：拉回锚桩上方一格（尘近似走 env.spawnDust） */
  private recall(): void {
    this.cx = this.ax * T + 8;
    this.cy = this.ay * T + 8 - T;
    this.vx = 0;
    this.vy = 0;
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
   * HellButterfly :14-25 / Firefly :24-58 / EmpressButterfly :25-59 / Fairy :25-47）
   * @param outLight 本帧点光（Game 侧推 LightingEngine）
   */
  visualEffects(env: LeashedEnv, outLight?: LeashedLight[]): void {
    const p = this.proto;
    const ti = Math.floor(this.cx / T), tj = Math.floor(this.cy / T);
    // 金系闪光（NPCID.Sets.IsGoldCritter NPCID.cs:4456）
    if (IS_GOLD_CRITTER.has(this.npcType) && env.spawnDust) {
      if (Math.random() < 0.03) env.spawnDust(this.cx, this.cy, this.w, this.h, '#FFFF00');
    }
    if (p.snailFx) {
      if (this.npcType === 360) outLight?.push({ tx: ti, ty: tj, r: 0.1, g: 0.2, b: 0.7 });
      else if (this.npcType === 655) outLight?.push({ tx: ti, ty: tj, r: 0.6, g: 0.3, b: 0.1 });
    }
    if (p.hellGlow) {
      outLight?.push({ tx: ti, ty: tj, r: 0.6, g: 0.3, b: 0.1 });
    }
    if (p.fireflyGlow) this.updateFirefly(env, outLight);
    if (p.empressFade) this.updateEmpress(env, outLight);
    if (p.fairyGlow) this.updateFairy(env, outLight);
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

  /** EmpressButterfly 渐隐 + HSL 环绕光（EmpressButterflyLeashedCritter.cs:25-59） */
  private updateEmpress(env: LeashedEnv, outLight?: LeashedLight[]): void {
    const far = Math.hypot(env.playerCx - this.cx, env.playerCy - this.cy) > 300;
    this.fadeAmount = Math.max(0, Math.min(50, this.fadeAmount + (far ? 1 : -1)));
    const hue = (env.timeForVisualEffects * 0.33) % 1;
    const c = hslToRgb(hue, 1, 0.5);
    outLight?.push({
      tx: Math.floor(this.cx / T), ty: Math.floor(this.cy / T),
      r: c[0] * 0.3 + 0.1, g: c[1] * 0.3 + 0.1, b: c[2] * 0.3 + 0.1,
    });
  }

  /** Fairy 点光（FairyLeashedCritter.cs:25-47：583 粉 / 584 绿 / 585 蓝 ×0.7） */
  private updateFairy(env: LeashedEnv, outLight?: LeashedLight[]): void {
    void env;
    const c = this.npcType === 584 ? [0.196, 0.804, 0.478]   // LimeGreen
      : this.npcType === 585 ? [0.255, 0.412, 0.882]          // RoyalBlue
        : [1.0, 0.412, 0.706];                                // HotPink
    outLight?.push({
      tx: Math.floor(this.cx / T), ty: Math.floor(this.cy / T),
      r: c[0] * 0.7, g: c[1] * 0.7, b: c[2] * 0.7,
    });
  }

  /** _dummy.FindFrame 最小等价（移动循环 / 静止首帧；蝴蝶 4 相 + 物种窗口） */
  private findFrame(): void {
    const meta = vanillaNpc(this.npcType);
    const count = meta?.frames ?? 1;
    const moving = Math.abs(this.vx) + Math.abs(this.vy) > 0.1;
    if (this.proto.butterflyVariant && this.npcType === 356) {
      // NPC.cs:73420-73456：frameCounter += 1+(|vx|+|vy|)/2；0/1/2/1 四相，7t/相
      this.frameCounter += 1 + (Math.abs(this.vx) + Math.abs(this.vy)) / 2;
      const fc = Math.floor(this.frameCounter);
      const phase = fc < 7 ? 0 : fc < 14 ? 1 : fc < 21 ? 2 : 1;
      if (fc >= 27) this.frameCounter = 0;
      const window = Math.max(0, (this.variant - 1) * 3); // ai[2]-1 → 物种窗口（每物种 3 帧）
      this.frame = Math.min(count - 1, window + phase);
      return;
    }
    this.frame = moving ? Math.floor(this.animT / 8) % count : 0;
    if (this.proto.isAquatic) this.frame = Math.floor(this.animT / 8) % count; // 鱼恒游
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

  /** 旋转（FlyerLeashedCritter.CopyToDummy :69-74：vy!=0 → rotation = vx*scalar） */
  get rotation(): number {
    if (this.proto.move === 'flyer' && this.vy !== 0) {
      return this.vx * (this.proto.rotationScalar ?? 0);
    }
    if (this.proto.butterflyVariant || this.npcType === 444
      || this.npcType === 653 || this.npcType === 661) {
      return this.vx * 0.3; // NPC.cs:73423（蝶族 FindFrame rotation）
    }
    return 0;
  }

  /** 绘制用贴图 NPC（WaterfowlLeashedCritter.cs:16-21：vy!=0 → type+1 泳姿表） */
  get drawNpcType(): number {
    return this.proto.waterfowlSwimSheet && this.vy !== 0 ? this.npcType + 1 : this.npcType;
  }

  /**
   * GetDrawOffset（Walker :182-189 / Flyer :153-170 / Jumper :251-258 /
   * WaterStrider :27-38）——halfBrick 贴地 / 悬停 bobbing / 水面贴合
   */
  getDrawOffset(env: LeashedEnv): { dx: number; dy: number } {
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
// LeashedKiteEntity —— 风筝本体（LeashedKite.cs；KiteLogic/DrawKite 为备案近似，
//   见文末 GAP ①）
// ============================================================================

export class LeashedKiteEntity {
  readonly ax: number;
  readonly ay: number;
  readonly projType: number;

  w: number;
  h: number;
  cx: number;
  cy: number;
  vx = 0;
  vy = 0;
  rotation = 0;
  spriteDirection = 1;
  /** kiteDistance（LeashedKite.cs:20——随风衰减 250→48） */
  kiteDistance = 250;
  windTarget = 0;
  windCurrent = 0;
  timeCounter = 0;
  timeWithoutWind = 0;
  /** 拖尾（oldPos/oldRot/oldSpriteDirection，LeashedKite.cs:26-28） */
  oldPos: Array<{ x: number; y: number }> = [];
  active = true;
  animT = 0;

  constructor(ax: number, ay: number, projType: number, w: number, h: number) {
    this.ax = ax; this.ay = ay;
    this.projType = projType;
    this.w = w; this.h = h;
    this.cx = ax * T + 8;
    this.cy = ay * T + 8;
  }

  /** Spawn（LeashedKite.cs:225-232）：锚点出发上抛 + 快进收敛 */
  spawn(env: LeashedEnv): void {
    this.vx = 0;
    this.vy = -5;
    this.windCurrent = this.windTarget = env.windForVisuals;
    // Update(fastForward) 的目标位直达（:182-187）
    const t = this.targetPoint(env);
    this.cx = t.x;
    this.cy = t.y;
    this.timeCounter = 6;
  }

  /** 风向目标位：anchor + normalize(wind, ±2)*kiteDistance（LeashedKite.cs:182-184） */
  private targetPoint(env: LeashedEnv): { x: number; y: number } {
    const wind = this.windCurrent;
    const len = Math.hypot(wind, 2);
    const nx = len > 0 ? wind / len : 0;
    const ny = len > 0 ? (wind > 0 ? -2 : 2) / len : -1;
    return { x: this.ax * T + 8 + nx * this.kiteDistance, y: this.ay * T + 8 + ny * this.kiteDistance };
  }

  /** Update（LeashedKite.cs:97-127 + MoveKite 近似） */
  update(env: LeashedEnv): void {
    this.animT++;
    this.windTarget = env.windForVisuals;
    // windCurrent = Lerp(windCurrent, windTarget, 0.05)（:105）
    this.windCurrent += (this.windTarget - this.windCurrent) * 0.05;
    // :112-115：无风计时 → kiteDistance 250→48（Utils.Remap(120,420)）
    const hasWind = Math.abs(this.windCurrent) >= 0.2;
    this.timeWithoutWind = hasWind ? 0 : this.timeWithoutWind + 1;
    this.kiteDistance = remap(this.timeWithoutWind, 120, 420, 250, 48);
    this.timeCounter += 1 / 60;
    // 目标位 + 摆动（KiteFlyingInfo.BobOffset = (anchorX+anchorY*0.92)*0.0025，:171-178）
    const bob = Math.sin(this.timeCounter + (this.ax + this.ay * 0.92) * 0.0025)
      + env.cloudAlpha * 5;
    const t = this.targetPoint(env);
    const targetY = t.y + bob * 4;
    // 收敛（KiteLogic 的 velocity lerp + rise 段近似为定点收敛）
    this.cx += (t.x - this.cx) * 0.03 + this.windCurrent * 0.25;
    this.cy += (targetY - this.cy) * 0.03;
    this.vx = this.windCurrent * 0.25;
    this.vy = (targetY - this.cy) * 0.03;
    if (Math.abs(this.windCurrent) > 0.05) this.spriteDirection = this.windCurrent > 0 ? 1 : -1;
    this.rotation = this.windCurrent * 0.5;
    // 拖尾（LeashedKite.cs:157-163：位移超 16px 才推进整条）
    this.oldPos.unshift({ x: this.cx, y: this.cy });
    if (this.oldPos.length > 5) this.oldPos.pop();
  }

  frameCount(total: number): number {
    return total > 1 ? Math.floor(this.animT / 6) % total : 0;
  }
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
  /** 距离门：玩家 3000px（≈ vanilla section 200×150 格流式外的近似）外的实体不更新 */
  streamRadius = 3000;

  /** 换图/读档时注入 world store（spawn 期的 Flyer 悬空门 / Jumper 首选点要用） */
  attach(world: { store: TileStore }): void {
    this.store = world.store;
  }

  /** TECritterAnchor.CreateLeashedEntity（:53-62）：itemType → makeNPC → 原型实例 */
  spawnCritter(ax: number, ay: number, itemVid: number, opts?: LeashedSpawnOpts): LeashedCritterEntity | null {
    const npcType = ITEM_MAKE_NPC[itemVid];
    if (npcType === undefined) return null;
    const proto = prototypeOfNpc(npcType);
    const e = new LeashedCritterEntity(ax, ay, npcType, proto,
      opts?.seed ?? this.mainRand.next(0xffffffff));
    e.whoAmI = this.critters.length;
    e.store = this.store;
    e.setDefaults(opts?.placeStyle ?? placeStyleOfVid(itemVid));
    // AddNewEntity → Spawn(newlyAdded: true)（LeashedEntity.cs:357-373）
    e.spawn();
    this.critters.push(e);
    return e;
  }

  /** TEKiteAnchor.CreateLeashedEntity（:54-62）：itemType → shoot → LeashedKite */
  spawnKite(ax: number, ay: number, projType: number, env: LeashedEnv, projSize = 14): LeashedKiteEntity {
    const e = new LeashedKiteEntity(ax, ay, projType, projSize, projSize);
    e.spawn(env);
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
   * LeashedEntity.UpdateEntities（Main.cs:17895）：逐实体 Update + 点光收集。
   * 距离门 ≈ section 流式（vanilla 按玩家 section 激活；本仓以玩家中心半径近似）。
   */
  update(world: { store: TileStore }, env: LeashedEnv, playerCx: number, playerCy: number): void {
    this.lights.length = 0;
    const st = world.store;
    for (const e of this.critters) {
      if (Math.abs(e.cx - playerCx) > this.streamRadius || Math.abs(e.cy - playerCy) > this.streamRadius) {
        continue;
      }
      e.update(st, env);
      e.visualEffects(env, this.lights);
    }
    for (const e of this.kites) {
      if (Math.abs(e.cx - playerCx) > this.streamRadius || Math.abs(e.cy - playerCy) > this.streamRadius) {
        continue;
      }
      e.update(env);
    }
    for (const l of this.lights) env.addLight(l.tx, l.ty, l.r, l.g, l.b);
  }

  clear(): void {
    this.critters.length = 0;
    this.kites.length = 0;
    this.lights.length = 0;
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
// GAP 登记（未 1:1 项，后续立项）
//   ① LeashedKite 的 KiteLogic（Projectile.cs:45809-45960）与 DrawKite
//     （Main.cs:36614-36830，逐风筝型 Extra_103/104/132/147… 绳索参数表 24 组）
//     为近似：定点收敛 + 简单摆动 + 直线绳；未移植 Player 收放线（channel ±5/t）、
//     拉绳碰撞回拉（SolidFullTiles → Bottom.MoveTowards）、逐型绳索贴图、
//     oldPos/oldRot 拖尾绘制（TrailCacheLength）。
//   ② LeashedCritter.Draw 的 DrawBubble（LeashedCritter.cs:213-223，Gore 413
//     气泡）未实装（水生出水面/陆生入水提示）。
//   ③ NPC.FindFrame 逐型状态机未全量（本仓通用 8t 循环 + 蝶族 4 相；原版 50+ 型
//     各自的 frameCounter 推进表）。
//   ④ VisualEffects 的 Dust（妖精 278 / 帝皇蝶 267 / 地狱蝶 6 / 金系 43）以
//     spawnDust 近似或从略；ShimmerFlyLeashedCritter 的 oldPos 拖尾（:44-63）
//     未实装；netOffset（联机插值平滑）无对等物（单机恒 0）。
//   ⑤ section 流式（LeashedEntity.BySection 200×150 格激活/休眠）以玩家中心
//     3000px 距离门近似；联机 NetModule（FullSync/PartialSync/Remove）未接。
//   ⑥ solidTile2 的平台 topSlope 特例（WorldGen.cs:70503）从略（见函数注）。
// ============================================================================
