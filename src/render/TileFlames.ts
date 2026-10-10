// 放置态火苗叠画（原版 TileDrawing.DrawSingleTile_Flames，TileDrawing.cs:2710-3517）。
// 火把/蜡烛/烛台/吊灯/壁灯/南瓜灯/骷髅灯/水蜡烛/和平蜡烛/暗影蜡烛/篝火族
// 放置后在本体之上叠画 Flame_N 贴图（TextureAssets.Flames，AssetInitializer.cs:680-683
// = Images/Flame_N；我们的素材 = vanilla/Flame_0..17.png 共 18 张全量）。
// 火苗表与 tile 表【同布局平行表】：火把 Flame_0 132×528 = Torch_0 逐格镜像，
// 源矩形直接取本体帧 (frameX, frameY, gridW, gridH)——未点燃火把的 66/88/110 列
// 在火苗表里是全透明单元（像素实测），画上去自然为零，无需额外门（与原版同机制）。
//
// 动画 = 每格 7 份种子化抖动副本（TileDrawing.cs:3459-3488 default 分支）：
//   dx = Utils.RandomInt(seed, -10, 11) * 0.15
//   dy = Utils.RandomInt(seed, -10, 1)  * 0.35
//   颜色 Color(100,100,100,0) —— XNA 预乘 AlphaBlend 下 A=0 即纯加色累积，
//   Canvas 用 'lighter' + multiply 预染色（rgb=100,100,100 → ×0.39）等价。
//   种子 = Main.TileFrameSeed ^ (x<<32 | y)（:2852-2853）；TileFrameSeed 每 5 个
//   绘制周期推进一次（Main.cs:62666-62670,DoDraw）→ 火苗约 12Hz 闪烁（原版默认
//   Subtle+improved 帧跳闸把绘制率钳回 60Hz ⇒ 绘制周期≡逻辑 tick;本仓重钉
//   Game.fixedUpdate tick,见 SEED_BASE 块注释）。
//
// 【简化登记】
//  S1 ✅已核销（2026-08-13）：蜡烛(33/174)/烛台(100/173)/吊灯(34)/壁灯(93)/
//     吊挂灯笼(42)/南瓜灯(35) 的逐 style 抖动参数分支（DrawSingleTile_Flames
//     :2895-3488 的 num9 switch + GetTileFlameData :1949-2707 双层）全量入
//     FLAME_STYLE 表——份数 1-8、倍率 0.01-0.35、颜色乘子 25/50/75/100/200 五档、
//     家具动态焰色（Get*FurnitureFlameColor 六族）与"不画"档（flameCount=0）齐备。
//  S2 颜色乘子接 torch style 14(Disco)/22/23 与篝火 style 5/14/15 的差异
//     （:3464-3477 / :2736-2745）；Color.A 的背景衰减（预乘混合的 dst×(1-A/255)）
//     按仓内 additive 惯例（drawNpcGlow 同款）忽略。
//  S3 ✅已核销（2026-08-13）：手持火苗（PlayerDrawLayers.cs:3519-3561 的
//     TextureAssets.ItemFlame，素材 ItemFlame_{itemId}.png 单帧、与物品贴图同尺寸
//     【非动画横条】——动画 = itemFlamePos 7 槽每 5 绘制帧重掷抖动）在本文件
//     drawHeldItemFlame，Renderer 纸娃娃持握/useItem 持位叠画。
//  火盆族补充（:2835-2850）：300 骨焊机/302 玻璃窑/303 丛林蜥蜴熔炉/306 制冰机
//     走 Flame_9-12 单份无抖动 + addFrY 动画帧行（BRAZIER_FLAME_TILE）。
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';
import { TILE } from '../core/constants';
import { TILE_DEFS } from '../data/tiles';
import { flameTileTop } from './VanillaTiler';
import { swayBakeSkip } from './WindSway';
import { campfireYOffset, animYOffset, tileAnim } from './TileAnim';
import type { FlickerClock } from '../lighting/SkyColor';
import { applyStealthToColor, type HeldStealthDim } from './heldItemStealthDim';   // ★BJ599 火苗 color5 潜行减色
import { gameTickCount } from '../core/GameTime';

/** 火苗族 tile → Flame_{n} 贴图索引（TileDrawing.cs:2857-2893 的 num9 switch 1:1；
 *  成员集 = Main.tileFlame 置位表 Main.cs:9210-9222：
 *  4 火把/33+174 蜡烛/100+173 烛台/34 吊灯/93 壁灯/49 水蜡烛/372 和平蜡烛/
 *  646 暗影蜡烛/98 骷髅灯/35 南瓜灯/42 吊挂灯笼）。键 = 原版 tile type
 *  （本仓 TileDef.vanilla.sheet 同值）。 */
export const TORCH_FLAME_TILE: Record<number, number> = {
  4: 0,      // Torches
  33: 1, 174: 1,    // Candles / Platinum Candle
  100: 2, 173: 2,   // Candelabras / Platinum Candelabra
  34: 3,    // Chandeliers
  93: 4,    // Lamps
  49: 5,    // Water Candle
  372: 16,  // Peace Candle
  646: 17,  // Shadow Candle
  98: 6,    // Skull Lantern
  35: 7,    // Jack 'O Lantern
  42: 13,   // Hanging Lanterns
};

/** 火盆族（TileDrawing.cs:2835-2850 独立 if 链，【非】 Main.tileFlame 成员）：
 *  制作台火盆 Flame_9-12，单份无抖动、颜色乘子 (200,200,200,0)，源矩形
 *  frameY+addFrY 参与动画帧行（GetTileDrawData :5376-5385 该组 addFrY =
 *  Main.tileFrame[type]*54 且 tileTop=2——与 TileAnim 的 54 pitch 组同步）。 */
export const BRAZIER_FLAME_TILE: Record<number, number> = {
  300: 9,   // Bone Welder 骨焊机（7 帧，Flame_9 54×378）
  302: 10,  // Glass Kiln 玻璃窑（4 帧）
  303: 11,  // Lihzahrd Furnace 丛林蜥蜴熔炉（5 帧）
  306: 12,  // Ice Machine 制冰机（12 帧）
};
const BRAZIER_TINT: readonly [number, number, number] = [200, 200, 200];




/** 火焰族的【绘制尺寸】(GetTileDrawData 各 case 的 tileWidth/tileHeight,非图集格):
 *  火把 20×20(:4724-4730) | 蜡烛族 33/49/174/372/646 = 16×20(:4887-4893) |
 *  烛台 100/173/壁灯 93/吊灯 34/灯笼 42/骷髅灯 98/南瓜灯 35 无 override = 16×16。
 *  ★此前按图集格(蜡烛 18×18/火把 22×22)绘制 → 蜡烛族火焰外溢邻格 1px×7 份叠加
 *  = 相邻火把/蜡烛的暖焰盖进水蜡烛格(用户报"蓝+红火焰叠加",2026-08-17);
 *  原版蜡烛族 16px 恰好零外溢,火把 20px 外溢 2px。 */
const FLAME_DRAW_SIZE: Record<number, [number, number]> = {
  4: [20, 20],
  33: [16, 20], 49: [16, 20], 174: [16, 20], 372: [16, 20], 646: [16, 20],
};

/** 篝火 215 走独占分支（TileDrawing.cs:2729-2747）：单份无抖动、frameY<36 门、
 *  颜色按 frameX/54（5=Disco / 14=(50,50,100,20) / 15=白），addFrY 参与取帧。 */
const CAMPFIRE_FLAME = { sheet: 215, flame: 15, frameYPitch: 54 };

// ---- Utils.RandomNext/RandomInt（Utils.cs:2386-2418）1:1 ----
const MASK48 = (1n << 48n) - 1n;
/** RandomNextSeed :2388-2391：Java LCG (×25214903917 +11) & 2^48-1 */
export function randomNextSeed(seed: bigint): bigint {
  return (seed * 25214903917n + 11n) & MASK48;
}
/** RandomNext(seed, 31)（:2384-2387）：推进后取高 31 位，(int) 有符号语义 */
function randomNext31(seedBox: { s: bigint }): number {
  seedBox.s = randomNextSeed(seedBox.s);
  return Number(BigInt.asIntN(31, seedBox.s >> 17n));
}
/** RandomInt(ref seed, min, max)（Utils.cs:2399-2418）：2 的幂走移位快速路径，
 *  否则拒绝采样（`num - num2 + (max-1) < 0` 的 Java int 溢出门）。 */
export function randomInt(seedBox: { s: bigint }, min: number, max: number): number {
  const range = max - min;
  if ((range & -range) === range) {
    return Number((BigInt(range) * BigInt(randomNext31(seedBox))) >> 31n) + min;
  }
  let bits: number, val: number;
  do {
    bits = randomNext31(seedBox);
    val = bits % range;
  } while (bits - val + (range - 1) < 0);
  return val + min;
}

/** 每格火苗的 7 份抖动偏移（TileDrawing.cs:3479-3484 的 default 循环 1:1）。
 *  纯函数（种子显式传入）供测试锁定确定性。 */
export function flameWobble(seed: bigint): Array<[number, number]> {
  const box = { s: seed };
  const out: Array<[number, number]> = [];
  for (let k = 0; k < 7; k++) {
    out.push([randomInt(box, -10, 11) * 0.15, randomInt(box, -10, 1) * 0.35]);
  }
  return out;
}

// ============================================================================
// 逐 style 火苗参数表（原 S1 简化登记核销）。
// 双层数据源：DrawSingleTile_Flames 的 num9 switch（TileDrawing.cs:2895-3488，
// 低 style 段）+ GetTileFlameData（:1949-2707，Draw default 分支对 style≥阈值
// （蜡烛 44/烛台 45/吊灯 51/壁灯 45/灯笼 51）委托的第二张表，覆盖 1.4.4+ 家具
// 套装 style）。两层落在同一 (num9, style) 键上，未命中均回 default 7 份
// (0.15, 0.35)——仅灯笼族的 default 是 0 份（不画）。
// ============================================================================

/** 家具动态焰色（TileDrawing.cs:1833-1871 的六个 Get*FurnitureFlameColor，
 *  随 GlobalTimeWrappedHourly 以 2s 周期呼吸）：
 *   fallenStar (150,150n,150n,50)  n=WrappedLerp(0.5,1)
 *   hallowed   (170,170n,170n,75)  n=WrappedLerp(0.5,1)
 *   cloud      白×n                n=WrappedLerp(0.75,1)
 *   librarian/forbidden/boulder 白×n  n=WrappedLerp(0.25,1) */
export type FurnitureFlameColor =
  | 'fallenStar' | 'hallowed' | 'cloud' | 'librarian' | 'forbidden' | 'boulder'
  /** 壁灯 style 12（:3311-3313）：单份微抖 ×0.01 + 每份三通道各 RandomInt(90,111)
   *  的随机灰乘子（绘制端在两笔偏移掷骰后消耗三笔） */
  | 'randGray';

/** 单格火苗绘制参数（纯数据，测试锁定）。 */
export interface FlameStyleSpec {
  /** 抖动副本份数；0 = 该 style 不画火苗（原版 flameCount=0） */
  count: number;
  /** Utils.RandomInt(min,max) 取值域（含头不含尾，与原版同） */
  xRange: readonly [number, number];
  yRange: readonly [number, number];
  /** 掷骰结果 × 倍率 = 像素抖动（0 = 无抖动原位叠画） */
  multX: number;
  multY: number;
  /** 颜色乘子 rgb(0-255)；null = (255,255,255) 直用原贴图 */
  tint: readonly [number, number, number] | null;
  dynTint?: FurnitureFlameColor;
}

/** default 7 份 (0.15, 0.35) × (100,100,100,0)（:3481-3485 / 各族 default） */
export const FLAME_STD: FlameStyleSpec = {
  count: 7, xRange: [-10, 11], yRange: [-10, 1], multX: 0.15, multY: 0.35, tint: [100, 100, 100],
};
/** count 0（GetTileFlameData 各族 flameCount=0 的"不画"档） */
const FLAME_ZERO: FlameStyleSpec = {
  count: 0, xRange: [-10, 11], yRange: [-10, 1], multX: 0.15, multY: 0.35, tint: [100, 100, 100],
};
/** 单份原位（原版把掷出的偏移清零或 mult=0 的静止焰） */
const still = (tint: readonly [number, number, number]): FlameStyleSpec =>
  ({ count: 1, xRange: [0, 0], yRange: [0, 0], multX: 0, multY: 0, tint });
/** 单份原位 + 家具动态焰色 */
const stillDyn = (dynTint: FurnitureFlameColor): FlameStyleSpec =>
  ({ count: 1, xRange: [0, 0], yRange: [0, 0], multX: 0, multY: 0, tint: null, dynTint });
/** 3 份 (200,200,200,150)（各族"史莱姆王座/星璇"类 1.4.4 style 的共用档） */
const TRIPLE_200: FlameStyleSpec = {
  count: 3, xRange: [-10, 11], yRange: [-10, 1], multX: 0.15, multY: 0.35, tint: [200, 200, 200],
};
const S = (
  count: number, xRange: readonly [number, number], yRange: readonly [number, number],
  multX: number, multY: number, tint: readonly [number, number, number] | null,
  dynTint?: FurnitureFlameColor,
): FlameStyleSpec => ({ count, xRange, yRange, multX, multY, tint, dynTint });

/** [style 组, 参数] → 展开的 style→参数 表 */
function styleTable(entries: ReadonlyArray<readonly [number | readonly number[], FlameStyleSpec]>)
  : Record<number, FlameStyleSpec> {
  const out: Record<number, FlameStyleSpec> = {};
  for (const [styles, spec] of entries) {
    for (const st of Array.isArray(styles) ? styles : [styles as number]) out[st] = spec;
  }
  return out;
}

/** 蜡烛族 num9=1（33/174），style = frameY/22（:2911-3013 + 数据表 :1962-2098） */
export const CANDLE_FLAME_STYLES: Record<number, FlameStyleSpec> = styleTable([
  [[5, 6, 7, 10], S(7, [-10, 11], [-10, 11], 0.075, 0.075, [50, 50, 50])],   // :2922-2923
  [8, S(7, [-10, 11], [-10, 11], 0.3, 0.3, [50, 50, 50])],                   // :2932-2933
  [12, S(7, [-10, 11], [-10, 1], 0.1, 0.15, [50, 50, 50])],                  // :2942-2943
  [14, S(8, [-10, 11], [-10, 11], 0.1, 0.1, [75, 75, 75])],                  // :2952-2953
  [16, S(4, [-10, 11], [-10, 11], 0.15, 0.15, [75, 75, 75])],                // :2962-2963
  [[27, 28], still([75, 75, 75])],                                           // :2968-2971
  [43, stillDyn('fallenStar')],                                              // :2972-2986
  [44, TRIPLE_200],                                                          // 数据表 :2034-2043
  [45, stillDyn('hallowed')],                                                // :2044-2049
  [[47, 48, 49, 51, 52, 54], FLAME_ZERO],                                    // :2081-2088
  [56, stillDyn('cloud')],                                                   // :2050-2055
  [[57, 60], still([200, 200, 200])],                                        // :2056-2062
  [58, stillDyn('librarian')],                                               // :2063-2068
  [61, stillDyn('forbidden')],                                               // :2069-2074
  [63, stillDyn('boulder')],                                                 // :2075-2080
]);

/** 烛台族 num9=2（100/173），style = frameY/36（:3017-3120 + 数据表 :2101-2236） */
export const CANDELABRA_FLAME_STYLES: Record<number, FlameStyleSpec> = styleTable([
  [3, S(3, [-10, 11], [-10, 11], 0.05, 0.15, [50, 50, 50])],                 // :3027-3028
  [6, S(5, [-10, 11], [-10, 11], 0.15, 0.15, [75, 75, 75])],                 // :3037-3038
  [9, S(7, [-10, 11], [-10, 11], 0.3, 0.3, [100, 100, 100])],                // :3047-3048
  [11, S(7, [-10, 11], [-10, 1], 0.1, 0.15, [50, 50, 50])],                  // :3057-3058
  [13, S(8, [-10, 11], [-10, 11], 0.1, 0.1, [75, 75, 75])],                  // :3067-3068
  [[28, 29], still([75, 75, 75])],                                           // :3073-3076
  [44, stillDyn('fallenStar')],                                              // :3077-3092
  [45, TRIPLE_200],                                                          // 数据表 :2171-2180
  [46, stillDyn('hallowed')],                                                // :2181-2186
  [[48, 49, 50, 52, 53, 55], FLAME_ZERO],                                    // :2218-2225
  [57, stillDyn('cloud')],                                                   // :2187-2192
  [[58, 61], still([200, 200, 200])],                                        // :2193-2199
  [59, stillDyn('librarian')],                                               // :2200-2205
  [62, stillDyn('forbidden')],                                               // :2206-2211
  [64, stillDyn('boulder')],                                                 // :2212-2217
]);

/** 吊灯族 num9=3（34），style = frameY/54 + frameX≥108 时 +37*(frameX/108)
 *  （:3122-3240 + 数据表 :2238-2391）。
 *  ★style 9 两版分歧以 Draw 内联为权威：Draw :3146-3147 = (-10,11)×0.05/0.15，
 *  数据表 :2257-2265 = (-1,1)×2.0——数据表仅 style≥51 段可达，9 < 51 恒不可达 */
export const CHANDELIER_FLAME_STYLES: Record<number, FlameStyleSpec> = styleTable([
  [8, S(7, [-10, 11], [-10, 11], 0.075, 0.075, [50, 50, 50])],               // :3136-3137
  [9, S(3, [-10, 11], [-10, 11], 0.05, 0.15, [50, 50, 50])],                 // :3146-3147
  [11, S(7, [-10, 11], [-10, 11], 0.3, 0.3, [50, 50, 50])],                  // :3156-3157
  [15, S(7, [-10, 11], [-10, 1], 0.1, 0.15, [50, 50, 50])],                  // :3166-3167
  [[17, 20], S(7, [-10, 11], [-10, 11], 0.075, 0.075, [50, 50, 50])],        // :3177-3178
  [18, S(8, [-10, 11], [-10, 11], 0.1, 0.1, [75, 75, 75])],                  // :3187-3188
  [[34, 35], still([75, 75, 75])],                                           // :3193-3196
  [50, stillDyn('fallenStar')],                                              // :3197-3212
  [51, TRIPLE_200],                                                          // 数据表 :2325-2334
  [52, stillDyn('hallowed')],                                                // :2335-2340
  [[54, 55, 56, 58, 59, 61], FLAME_ZERO],                                    // :2372-2379
  [63, stillDyn('cloud')],                                                   // :2341-2346
  [[64, 67], still([200, 200, 200])],                                        // :2347-2353
  [65, stillDyn('librarian')],                                               // :2354-2359
  [68, stillDyn('forbidden')],                                               // :2360-2365
  [70, stillDyn('boulder')],                                                 // :2366-2371
]);

/** 壁灯族 num9=4（93），style = frameY/54（:3242-3363 + 数据表 :2393-2550）。
 *  ★style 13 两版分歧以 Draw 内联为权威：Draw :3303-3304 = (75,75,75,0)，
 *  数据表 :2447-2455 = (50,50,50,0)——数据表仅 style≥45 段可达，13 < 45 恒不可达 */
export const LAMP_FLAME_STYLES: Record<number, FlameStyleSpec> = styleTable([
  [1, S(3, [-10, 11], [-10, 11], 0.15, 0.15, [50, 50, 50])],                 // :3252-3253
  [[2, 4], S(7, [-10, 11], [-10, 11], 0.075, 0.075, [50, 50, 50])],          // :3263-3264
  [3, S(7, [-10, 11], [-20, 1], 0.2, 0.35, [100, 100, 100])],                // :3273-3274
  [5, S(7, [-10, 11], [-10, 11], 0.3, 0.3, [50, 50, 50])],                   // :3283-3284
  [9, S(7, [-10, 11], [-10, 1], 0.1, 0.15, [50, 50, 50])],                   // :3293-3294
  [13, S(8, [-10, 11], [-10, 11], 0.1, 0.1, [75, 75, 75])],                  // :3303-3304
  [12, S(1, [-10, 11], [-10, 11], 0.01, 0.01, null, 'randGray')],            // :3311-3313
  [[28, 29], still([75, 75, 75])],                                           // :3316-3319
  [44, stillDyn('fallenStar')],                                              // :3320-3335
  [45, TRIPLE_200],                                                          // 数据表 :2484-2493
  [46, stillDyn('hallowed')],                                                // :2494-2499
  [[48, 49, 50, 52, 53, 55], FLAME_ZERO],                                    // :2531-2538
  [57, stillDyn('cloud')],                                                   // :2500-2505
  [[58, 61], still([200, 200, 200])],                                        // :2506-2512
  [59, stillDyn('librarian')],                                               // :2513-2518
  [62, stillDyn('forbidden')],                                               // :2519-2524
  [64, stillDyn('boulder')],                                                 // :2525-2530
]);

/** 吊挂灯笼族 num9=13（42），style = frameY/36（:3365-3457 + 数据表 :2551-2688）。
 *  未命中 = 不画（两层 default 都是 0 份——与蜡烛族回 default 7 份不同！）。
 *  ★:3407-3415 的嵌套 case 29（7 份 ×0.15/0.15 (25)）是死代码——29 已在外层第一组
 *  （:3378）命中先 break，C# switch 首匹配语义下永不执行（数据表亦无 29） */
export const LANTERN_FLAME_STYLES: Record<number, FlameStyleSpec> = styleTable([
  // :3371-3390（外层第一组，default 7 份 (100,100,100)）+ 数据表补 :2566-2571 的
  // 53/57/60/62/66/69（≥51 段经数据表 default 前的显式组到达，同为 7 份）
  [[1, 3, 6, 8, 19, 27, 29, 30, 31, 32, 36, 39], FLAME_STD],
  [[2, 16, 25], S(7, [-10, 11], [-10, 1], 0.15, 0.1, [50, 50, 50])],         // :3392-3402（数据表 :2578-2588 同）
  [11, S(7, [-10, 11], [-10, 11], 0.075, 0.075, [50, 50, 50])],              // 数据表显式键 :2589-2599——仅数据表有（内联表无 11），摆动路径恒经数据表；旧表漏键致该档不画
  [44, FLAME_STD],                                                           // 数据表显式键 :2611-2620（7 份 (0.15,0.35)×(100)）——1.4.4+ 家具套装灯笼段（frameY/36=44, fy=1584..1601）；旧表漏键致该档不画
  [[34, 35], still([75, 75, 75])],                                           // :3417-3420
  [50, stillDyn('fallenStar')],                                              // :3421-3436
  [51, TRIPLE_200],                                                          // 数据表 :2630-2639
  [52, stillDyn('hallowed')],                                                // :2640-2645
  [[53, 57, 60, 62, 66, 69], FLAME_STD],                                     // :2554-2579
  [[54, 55, 56, 58, 59, 61], FLAME_ZERO],                                    // :2677-2684
  [63, stillDyn('cloud')],                                                   // :2646-2651
  [[64, 67], still([200, 200, 200])],                                        // :2652-2658
  [65, stillDyn('librarian')],                                               // :2659-2664
  [68, stillDyn('forbidden')],                                               // :2665-2670
  [70, stillDyn('boulder')],                                                 // :2671-2676
]);

/** num9 → 该族的 style 取值（原版取帧式 1:1；default 族无 style 维度返回 -1）。 */
export function flameStyleIndex(flameIdx: number, frameX: number, frameY: number): number {
  switch (flameIdx) {
    case 1: return Math.floor(frameY / 22);                    // :2911
    case 2: return Math.floor(frameY / 36);                    // :3019
    case 3: {                                                   // :3124-3128
      let s = Math.floor(frameY / 54);
      if (frameX >= 108) s += 37 * Math.floor(frameX / 108);
      return s;
    }
    case 4: return Math.floor(frameY / 54);                    // :3244
    case 13: return Math.floor(frameY / 36);                   // :3367
    default: return -1;                                         // 火把/水蜡烛/骷髅灯/南瓜灯等
  }
}

/** num9 + style → 绘制参数（纯函数）。default 族恒 FLAME_STD（颜色乘子差异在
 *  火把 disco/恶魔档，见 flameTint——不进本表）。
 *
 *  ★2026-08-31 全量复核后的权威结构：各主族内联 switch 的 default 是双分支
 *  `{ if(阈值门) delegate→GetTileFlameData; else → 7 份 (0.15,0.35)×(100) }`
 *  （蜡烛 :3011-3026 / 烛台 :3108-3117 / 壁灯 :3348-3358 / 吊灯 :3225-3234）——
 *  即【阈值门只决定参数出处（内联硬编码 vs 数据表），任何未列 style 都画
 *  default 7 份】，不存在"死区不画"。本表未命中 ⇒ 无条件回退 FLAME_STD。
 *  ★例外 = 灯笼族(13)：数据表与内联双层 default 都是 0 份（不画），仅显式键
 *  有火；且吊灯 34 / 灯笼 42 属摆动路径，恒走数据表（GetTileFlameData），
 *  内联层对其不可达。 */
export function flameStyleSpec(flameIdx: number, style: number): FlameStyleSpec {
  switch (flameIdx) {
    case 1: return CANDLE_FLAME_STYLES[style] ?? FLAME_STD;
    case 2: return CANDELABRA_FLAME_STYLES[style] ?? FLAME_STD;
    case 3: return CHANDELIER_FLAME_STYLES[style] ?? FLAME_STD;
    case 4: return LAMP_FLAME_STYLES[style] ?? FLAME_STD;
    case 7: return { count: 4, xRange: [0, 0], yRange: [0, 0], multX: 0, multY: 0, tint: [50, 50, 50] }; // :2897-2907（掷后清零=4 份原位）
    case 13: return LANTERN_FLAME_STYLES[style] ?? FLAME_ZERO;
    default: return FLAME_STD;
  }
}

/** Utils.WrappedLerp（Utils.cs:273-283）：pct*2>1 时折返（三角波）后线性插值。 */
export function wrappedLerp(v1: number, v2: number, pct: number): number {
  let n = pct * 2;
  if (n > 1) n = 2 - n;
  return v1 + (v2 - v1) * n;
}

/** 家具动态焰色 → 颜色乘子（Get*FurnitureFlameColor :1833-1871 1:1；t 秒 =
 *  GlobalTimeWrappedHourly%3600）。呼吸值量化到 1/16 档进染色缓存（同 disco
 *  惯例）；cloud 高段 ≥0.99 返回 null（≈白直用）。randGray 的随机灰不在此
 *  （绘制端逐份掷骰）。 */
export function furnitureFlameTint(
  kind: FurnitureFlameColor, t: number,
): readonly [number, number, number] | null {
  const q = (v: number) => Math.round(v * 16) / 16;
  switch (kind) {
    case 'fallenStar': { const n = q(wrappedLerp(0.5, 1, (t % 2) / 2)); return [150, 150 * n, 150 * n]; }
    case 'hallowed': { const n = q(wrappedLerp(0.5, 1, (t % 2) / 2)); return [170, 170 * n, 170 * n]; }
    case 'cloud': {
      const n = q(wrappedLerp(0.75, 1, (t % 2) / 2));
      return n >= 0.99 ? null : [255 * n, 255 * n, 255 * n];
    }
    case 'librarian':
    case 'forbidden':
    case 'boulder': {
      const n = q(wrappedLerp(0.25, 1, (t % 2) / 2));
      return n >= 0.99 ? null : [255 * n, 255 * n, 255 * n];
    }
    case 'randGray':
    default:
      return null;
  }
}


// ---- Main.TileFrameSeed（Main.cs:421 初值 + DoDraw :62666-62670 每 5 绘制周期推进）----
// ★2026-09-27 重钉逻辑 tick（fps 依赖定谳,用户实报 120fps 火苗快一倍）：原版推进点
//  在【绘制】路径（Main.DoDraw 的 _drawCycleCounter%5——旧注释引 61156 为旧行号）,
//  但原版默认 FrameSkipMode.Subtle+improvedSubtleFrameSkip（Main.cs:67615-67616）
//  把 present 率钳回 ~60Hz（EndDraw :62624-62634 忙等 TARGET_FRAME_TIME·599/600）
//  ⇒ 绘制周期 ≡ 60Hz 逻辑 tick,火苗恒 12Hz、任何刷新率同速。本仓 rAF 与逻辑解耦
//  （frameCap 60/120/∞）,按绘制周期推进 = 120fps 下 24Hz。修 = 节拍重钉
//  Game.fixedUpdate 60Hz tick 累计（BJ330 GTW 同款判例,advanceGameTimeTick 同拍
//  同门）：seed = LCG^(⌊tick/5⌋+1) 纯函数化——读侧惰性同步（幂等,多窗/多调用
//  每帧零推进）,60fps 帧序逐位不变,暂停期随 tick 冻结（原版暂停期照闪 =
//  BJ330 同款明令分歧;探针 freezeClock 期确定性收益,B1 对拍仪具保留同语义）。
const SEED_BASE = 0x2545f4914f6cdd1dn & MASK48; // 初值任意（原版 = Guid 哈希，仅要"每局不同"）
let _frameSeed = SEED_BASE;
let _seedStep = 0;
/** ★B1 对拍仪具（2026-09-24）:火苗种子冻结——页内 A/B 像素对拍须钉死
 *  （scripts/_b1-world-ab.mjs 动态 import 消费;生产路径零触碰）。
 *  ★重钉后语义：冻结 = tick→seed 同步停摆（seed 恒持当前值）。 */
let _seedFrozen = false;
export function tileFrameSeedFreezeForTest(v: boolean): void { _seedFrozen = v; }

/** 逻辑 tick → 种子 LCG 步数（+1 = 原版首绘即推进的同相偏移,60fps 1:1 帧序逐位等价;
 *  pin 回拨（测试）时从 SEED_BASE 重放,保持 tick 的纯函数性） */
function syncTileFrameSeed(): void {
  if (_seedFrozen) return;
  const target = Math.floor(gameTickCount() / 5) + 1;
  if (_seedStep === target) return;
  if (target < _seedStep) { _frameSeed = SEED_BASE; _seedStep = 0; }
  while (_seedStep < target) { _frameSeed = randomNextSeed(_frameSeed); _seedStep++; }
}

/** Main.TileFrameSeed 只读访问：全局唯一种子（tile 火苗与 FlameParticle.Draw :57
 *  的抖动种子同源——`TileFrameSeed ^ (x<<32|y)`，两族共用同一推进节拍） */
export function currentTileFrameSeed(): bigint {
  syncTileFrameSeed();
  return _frameSeed;
}

// ============================================================================
// 摆动路径火焰（DrawMultiTileVinesInWind 尾部循环，TileDrawing.cs:9782-9794）。
// 吊灯 34 / 吊挂灯笼 42 在主循环被 AddSpecialPoint(MultiTileVine) 摘出普通路径
// （:543-561），但特殊绘制路径的每格循环【末尾仍画火焰】——参数唯一来源 =
// GetTileFlameData 数据表（内联 switch 对这两族不可达）。由 WindSway.drawMultiVine
// 在与本体完全相同的 ctx 变换（pivot 平移+旋转+行偏移）内逐格调用来复现原版
// vector6/vector5/num8 同源几何；本函数只负责查表 + 抖动 + 加色合成。
// 首批接入 = 标注排查定谳（2026-08-31 Starter World：灯笼×6 / 吊灯×3 全漏火案）。
//
// ★ VineSeedBox 结转语义（:9783-9791 num6）：C# TileFlameData 是 struct，每格
//   虽然重算 flameSeed 但随即被 num6 覆盖——首格种子结转给同组全部格，且每组
//   每格都从该种子重启同一序列（复制品不回写）。等价实现：每格从 box.s 重启。
// ============================================================================

/** 摆动组共享火苗种子结转盒（drawMultiVine 每组建一个，box.s=0n 表示未初始化）。 */
export interface VineSeedBox { s: bigint }

/** 每格调用：若组种子尚未初始化则用本格 tile 种子初始化（:9784-9792 的 num6 惰性初值 1:1）。 */
export function vineAdvanceSeed(box: VineSeedBox, cx: number, cy: number): void {
  const cell = currentTileFrameSeed() ^ ((BigInt(cx) << 32n) | BigInt(cy >>> 0));
  if (box.s === 0n) box.s = cell;
}

/** 摆动路径单格火焰叠画。调用点 = WindSway.drawCell 内、与本体同一变换/裁剪态；
 *  (dpx,dpy) = 本格世界像素原点（含 offX/offY 行偏移与平台 -8 等，同本体 dest 口径）。
 *  与 drawTileFlames 的差异：① 种子 = 组结转盒（num6）；② 无 FLAME_DRAW_SIZE 覆盖
 *  （vine 家族 tileWidth/tileHeight 未被 GetTileDrawData override，画满图集格）；
 *  ③ 不推进 _frameSeed 节拍（种子为逻辑 tick 的纯函数,两路读侧幂等同步即可对齐
 *  Main.cs:62666 每 5 绘制周期全域推进）。 */
export function drawVineTileFlame(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas,
  dpx: number, dpy: number,
  sheet: number, fx: number, fy: number,
  seedBox: VineSeedBox, flicker: FlickerClock | null,
): void {
  const flameIdx = TORCH_FLAME_TILE[sheet];
  if (flameIdx === undefined) return;
  // MultiVine 成员里带火的只有 34(num9=3)/42(num9=13)；270/271/581 的
  // FireflyJar/LightningbugJar/GlowMask[291] 特例（GetTileFlameData :1874-1894）暂未
  // 接入（TORCH_FLAME_TILE 无其键 → 此处零开销跳过）——非本次标注排查面，
  // 备忘账本：萤火虫罐/闪电虫罐/发光蜗牛罐的罐体自亮脉冲层。
  const img = atlas.ensureVImage(`vanilla/Flame_${flameIdx}.png`);
  if (!img || typeof img.width !== 'number' || img.width === 0) return;
  const spec = flameStyleSpec(flameIdx, flameStyleIndex(flameIdx, fx, fy));
  if (spec.count <= 0) return;
  const r = atlas.vframeAt(sheet, fx, fy);
  if (!r) return;
  let tint: readonly [number, number, number] | null;
  if (spec.dynTint && spec.dynTint !== 'randGray') {
    tint = furnitureFlameTint(spec.dynTint, flicker ? flicker.globalTimeWrappedHourly : 0);
  } else {
    tint = spec.tint;   // randGray 仅壁灯 style12（普通路径特有），不会到达这里
  }
  const cell = tint ? tintedFlameCell(img, r.sx, r.sy, r.sw, r.sh, tint[0], tint[1], tint[2]) : null;
  const src = cell ?? img;
  const sxC = cell ? 0 : r.sx, syC = cell ? 0 : r.sy;
  // 抖动序列每格从组种子重启（struct 复制语义，见块注释）
  const box = { s: seedBox.s };
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'lighter';   // A=0 预乘加色语义（文件头注同款）
  for (let k = 0; k < spec.count; k++) {
    const ox = randomInt(box, spec.xRange[0], spec.xRange[1]) * spec.multX;
    const oy = randomInt(box, spec.yRange[0], spec.yRange[1]) * spec.multY;
    ctx.drawImage(src, sxC, syC, r.sw, r.sh, dpx + ox, dpy + oy, r.sw, r.sh);
  }
  ctx.restore();
}

// ---- 颜色乘子预染缓存（multiply×fill 逐像素染 Flame 单元；静态色缓存命中、
//      Disco 按 32 档量化限幅，超 512 条逐条淘汰防无界增长）----
const _tintCache = new Map<string, HTMLCanvasElement>();

/** GPU contextlost 后全部预染缓存内容归零且不会自动重画——失效清理
 *  (Renderer.onLost 统一扫;画布 width=0 先还回表面) */
export function clearTileFlamesCache(): void {
  for (const c of _tintCache.values()) { c.width = 0; c.height = 0; }
  _tintCache.clear();
}
/** 贴图实例 id:★ImageBitmap 无 .src(旧键裸读恒 undefined → imgId 退化为宽度,
 *  同宽 Flame_N 跨表串色;bitmap 迁移时代 WeakMap 方案同款) */
const _flameImgIds = new WeakMap<object, number>();
let _flameImgIdSeq = 0;
function tintedFlameCell(
  img: CanvasImageSource & { width: number; height: number },
  sx: number, sy: number, sw: number, sh: number,
  r: number, g: number, b: number,
  a?: number,
): HTMLCanvasElement | null {
  // ★键必须含贴图身份(Flame_N)：各族源矩形同格同 tint 时会跨表命中——
  //   例如同为 (0,0,18,18)+(100,100,100) 的 default 族,后画的会拿到先画族的
  //   颜色(水蜡烛拿到暖色焰=蓝+红叠加观感)。
  // ★tint 量化步进 8 进键(2026-08-18 canvas 哨兵实抓:火光 tint 随光照连续
  //   漂移 → 每档新键 → 用户真机 37-63 张/秒 createElement 持续 30 窗;
  //   量化后键只在跨桶时换。烘焙用桶内首个精确色,火焰本身闪烁,3% 内无感)
  // ★BJ599：A 面（color5.A）进键【不量化】——A 值离散且携带精确 alpha 衰减
  //   语义（5293=20/5322=150/5353=200 及其潜行减色档）,量化 = 每像素 α 偏差。
  let imgId = _flameImgIds.get(img);
  if (imgId === undefined) { imgId = ++_flameImgIdSeq; _flameImgIds.set(img, imgId); }
  const key = `${imgId},${sx},${sy},${sw},${sh},${r & ~7},${g & ~7},${b & ~7},${a && a > 0 ? a : 0}`;
  let c = _tintCache.get(key);
  if (c) return c;
  if (typeof document === 'undefined') return null;
  c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const cc = c.getContext('2d');
  if (!cc) return null;
  cc.imageSmoothingEnabled = false;
  cc.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  cc.globalCompositeOperation = 'multiply';
  cc.fillStyle = `rgb(${r},${g},${b})`;
  cc.fillRect(0, 0, sw, sh);
  // multiply 会把透明像素染成实色——按原 alpha 裁回
  cc.globalCompositeOperation = 'destination-in';
  cc.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  // ★BJ599 A 面（a>0 时）：dest-in 白×α 系数 = 预乘面（rgb 与 alpha）×a/255——
  //   cell ≙ 原版 DrawData tex_p×color5（rgb×tint×a/255、alpha×a/255）,
  //   消费端 source-over ≙ XNA AlphaBlend（src_p + dst×(1−src_a)）逐式。
  //   a=0/undefined：cell alpha 不动（canvas 预乘存不下 α=0 的 rgb 面）,
  //   消费端 'lighter' = A=0 纯加性（RGB 面逐式）。
  if (a && a > 0 && a < 255) {
    cc.globalAlpha = a / 255;
    cc.fillStyle = '#fff';
    cc.fillRect(0, 0, sw, sh);
    cc.globalAlpha = 1;
  }
  if (_tintCache.size > 512) {
    // 逐条淘汰最旧(Map 插入序;旧版整表 clear() = 下帧全量重烘焙雪崩)
    const first = _tintCache.keys().next().value;
    if (first !== undefined) _tintCache.delete(first);
  }
  _tintCache.set(key, c);
  return c;
}

/** torch style → 火苗颜色乘子 rgb(0-255)。缺省 (100,100,100)（:3482 default）；
 *  style = frameY/22（Torch 表 22px 纵向步长，同 TileLightScanner 的取 style 法）。
 *  白色乘子 (255,255,255) 返回 null = 直用原贴图。 */
function flameTint(
  sheet: number, frameX: number, frameY: number, flicker: FlickerClock | null,
): [number, number, number] | null {
  // Disco 动态色按 16 档量化进染色缓存（FlickerClock.discoColor 每帧 7/255 步进，
  // 量化后全周期仅 ~40 档命中——缓存不随帧数膨胀）
  const discoTint = (): [number, number, number] => {
    const [r, g, b] = flicker!.discoColor();                            // :2738-2740 / :3466-3468
    const q = (v: number) => Math.round(v * 255 / 16) * 16;
    return [q(r), q(g), q(b)];
  };
  if (sheet === CAMPFIRE_FLAME.sheet) {
    const style = Math.floor(frameX / CAMPFIRE_FLAME.frameYPitch);   // :2736
    if (style === 5 && flicker) return discoTint();
    if (style === 14) return [50, 50, 100];                            // :2741-2743
    if (style === 15) return null;                                     // (255,255,255,200)
    return null;                                                       // (255,255,255,0)
  }
  if (sheet === 4) {
    const style = Math.floor(frameY / 22);                             // :3464
    if (style === 14 && flicker) return discoTint();
    if (style === 22) return [50, 50, 100];                            // :3469-3471
    if (style === 23) return null;                                     // (255,255,255,200)
    return [100, 100, 100];                                            // :3482 default
  }
  return [100, 100, 100];                                              // 其各族 default 同
}

/** 火苗叠画主入口。调用点 = Renderer tile 层之后（原版 DrawSingleTile 内
 *  DrawSingleTile_Flames 在本体绘制之后调用，TileDrawing.cs:1746）。
 *  坐标 = 世界像素（调用方已在世界变换内）。 */
export function drawTileFlames(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  tx0: number, ty0: number, tx1: number, ty1: number,
  flicker: FlickerClock | null,
): void {
  // 颜色/抖动只依赖 TileFrameSeed 与 FlickerClock（同原版，无时钟项）。
  // ★2026-09-27：本函数不再自带推进（旧 _drawCycle 按调用次数推进 = 渲染帧驱动
  //   = 120fps 火苗双倍速病灶）——种子改由 currentTileFrameSeed() 读侧同步到
  //   逻辑 tick（见 SEED_BASE 块注释）,同 tick 多次绘制零推进。

  const flameImg = new Map<number, ImageBitmap | HTMLImageElement | null>();
  const imgFor = (idx: number) => {
    let im = flameImg.get(idx);
    if (im === undefined) {
      im = atlas.ensureVImage(`vanilla/Flame_${idx}.png`) ?? null;
      flameImg.set(idx, im);
    }
    return im;
  };

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'lighter';   // A=0 预乘加色语义（见文件头注）
  ctx.globalAlpha = 1;
  for (let x = Math.max(1, tx0); x <= Math.min(st.w - 2, tx1); x++) {
    for (let y = Math.max(1, ty0); y <= Math.min(st.h - 2, ty1); y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const def = TILE_DEFS[st.type[i]];
      const sheet = def?.vanilla?.sheet ?? -1;
      // 摆动族（草/藤/吊挂灯笼 42/吊灯 34 等 MultiTileVine/Basic/Vine 全家）：原版主循环
      // AddSpecialPoint 后 continue——普通绘制路径（含 DrawSingleTile_Flames :1746）整体
      // 跳过。【★2026-08-31 定谳修正】"摆动 tile 没有火焰叠画层"系误判：原版特殊路径
      // DrawMultiTileVinesInWind 的每格循环末尾【同样跑 GetTileFlameData + 抖动循环】
      // （TileDrawing.cs:9782-9794），吊灯 34/吊挂灯笼 42 全 style 都有火。本层的
      // swayBakeSkip continue 只负责防双影（曾照画进本静态层 = 火焰钉死位 + 摆动层
      // 本体摆动 = 双影，2026-08-23 地牢灯笼案）；正确的火焰由 WindSway.drawMultiVine
      // 在与本体完全相同的 ctx 变换内逐格调 drawVineTileFlame 补画——迁移而非删除。
      if (def?.vanilla && swayBakeSkip(st.type[i], st.frameX[i])) continue;
      const isCampfire = sheet === CAMPFIRE_FLAME.sheet;
      const isBrazier = !isCampfire && BRAZIER_FLAME_TILE[sheet] !== undefined;
      const flameIdx = isCampfire ? CAMPFIRE_FLAME.flame
        : isBrazier ? BRAZIER_FLAME_TILE[sheet] : TORCH_FLAME_TILE[sheet];
      if (flameIdx === undefined) continue;
      const frameX = st.frameX[i];
      let frameY = st.frameY[i];
      if (isCampfire) {
        if (frameY >= 36) continue;                     // :2731 门（上半 36px 才有火）
        frameY = campfireYOffset(frameY);               // addFrY（:2737）——返回完整绘制 y
      } else if (isBrazier) {
        // 火盆族 addFrY = Main.tileFrame[type]*54（GetTileDrawData :5376-5385）——
        // 与本体烘焙同源（TileAnim），火焰帧行与制作台动画同步
        frameY += animYOffset(sheet, (atlas.vmeta(sheet)?.rows ?? 0) * 18);
      }
      const img = imgFor(flameIdx);
      if (!img) continue;
      // ★壁灯(93)折列【取格专用】（GetTileDrawData case93 :6518-6522 的 addFr：
      // addFrY-=1998n / addFrX+=36n；火焰矩形与本体同式含 addFr——default-else
      // 分支 :3339-3348 与 ≥45 delegate 分支的源矩形均 `+drawData.addFr`）。
      // style 判定仍读原始帧（原版内联 switch 直接 Main.tile[x,y].frameY）。
      // 曾缺此折：fy≥1998 的新家具台灯（Sandstone Lamp 等）源矩形越界 → vframeAt
      // null → 整族漏焰（2026-08-31 Starter World 三连标注案定谳反转后补）。
      let rFx = frameX, rFy = frameY, extraTop = 0;
      if (!isCampfire && !isBrazier && sheet === 93) {
        const n = Math.floor(frameY / 1998);
        rFy -= 1998 * n;
        rFx += 36 * n;
        extraTop = 2;   // case93 tileTop+=2（:6523）
      }
      const r0 = atlas.vframeAt(sheet, rFx, rFy);
      if (!r0) continue;
      // 原版绘制尺寸覆盖（FLAME_DRAW_SIZE 表注）：源矩形同格左上取 w×h，
      // dx = x*16-(w-16)/2(:2718)——蜡烛族 16px 零外溢(治邻焰盖格)
      const size = FLAME_DRAW_SIZE[sheet];
      const r = size
        ? { ...r0, sw: size[0], sh: size[1] }
        : r0;
      const top = flameTileTop(sheet, st, x, y, frameX, st.frameY[i]) + extraTop;
      const dx = x * TILE - (r.sw - TILE) / 2;          // :2718 X = x*16-(w-16)/2
      const dy = y * TILE + top;
      if (isCampfire || isBrazier) {
        // 篝火/火盆：单份无抖动（:2734-2747 / :2850）
        const tint = isCampfire ? flameTint(sheet, frameX, st.frameY[i], flicker) : BRAZIER_TINT;
        const cell = tint ? tintedFlameCell(img, r.sx, r.sy, r.sw, r.sh, tint[0], tint[1], tint[2]) : null;
        ctx.drawImage(cell ?? img, cell ? 0 : r.sx, cell ? 0 : r.sy, r.sw, r.sh, dx, dy, r.sw, r.sh);
        continue;
      }
      // ---- 逐 style 参数（num9 switch 1:1；default 族无 style 维度）----
      const style = flameStyleIndex(flameIdx, frameX, frameY);
      const spec = flameStyleSpec(flameIdx, style);
      if (spec.count <= 0) continue;                    // GetTileFlameData flameCount=0 档
      const isFamily = flameIdx === 1 || flameIdx === 2 || flameIdx === 3
        || flameIdx === 4 || flameIdx === 13;
      let tint: readonly [number, number, number] | null;
      if (!isFamily) {
        // default 族（火把/水蜡烛/骷髅灯/和平蜡烛/暗影蜡烛）：颜色乘子走原
        // flameTint（火把 style 14 Disco / 22 恶魔 / 23 白；其余 (100,100,100)）
        tint = flameTint(sheet, frameX, st.frameY[i], flicker);
      } else if (spec.dynTint && spec.dynTint !== 'randGray') {
        tint = furnitureFlameTint(spec.dynTint, flicker ? flicker.globalTimeWrappedHourly : 0);
      } else {
        tint = spec.tint;
      }
      let cell = tint ? tintedFlameCell(img, r.sx, r.sy, r.sw, r.sh, tint[0], tint[1], tint[2]) : null;
      const seed = currentTileFrameSeed() ^ ((BigInt(x) << 32n) | BigInt(y >>> 0));  // :2852-2853
      const box = { s: seed };
      for (let k = 0; k < spec.count; k++) {
        const ox = randomInt(box, spec.xRange[0], spec.xRange[1]) * spec.multX;
        const oy = randomInt(box, spec.yRange[0], spec.yRange[1]) * spec.multY;
        if (spec.dynTint === 'randGray') {
          // 壁灯 style 12（:3311-3313）：两笔偏移掷骰后颜色三通道各 RandomInt(90,111)；
          // 量化到 8 档防染色缓存抖动（≤8% 视觉差）
          const qv = (v: number) => Math.round(v / 8) * 8;
          const g: [number, number, number] = [
            qv(randomInt(box, 90, 111)), qv(randomInt(box, 90, 111)), qv(randomInt(box, 90, 111)),
          ];
          cell = tintedFlameCell(img, r.sx, r.sy, r.sw, r.sh, g[0], g[1], g[2]);
        }
        const src = cell ?? img;
        const sxC = cell ? 0 : r.sx, syC = cell ? 0 : r.sy;
        ctx.drawImage(src, sxC, syC, r.sw, r.sh, dx + ox, dy + oy, r.sw, r.sh);
      }
    }
  }
  ctx.restore();
}

// ============================================================================
// 手持火苗（原 S3 简化登记核销；PlayerDrawLayers.cs:3519-3561）。
// 素材 = Images/ItemFlame_{itemId}.png【单帧、与物品贴图同尺寸】（火把 8 → 14×16），
// 非动画横条——"动画"来自 itemFlamePos 7 槽抖动偏移（LegacyPlayerRenderer.cs
// :493-502 每 5 绘制帧重掷 Main.rand.Next(-10,11)*0.15 / Next(-10,1)*0.35）。
// 绘制 = 与手持物同源矩形/旋转/origin/scale，位置 = 持位 + (int)(抖动)（世界空间）。
// ============================================================================

/** 手持火苗物品集（Item.cs SetDefaults flame=true 实证 31 件 = 盘上 ItemFlame_*.png
 *  全量 32 张 − 1866〔Sparky 翅膀专用叠画，PlayerDrawLayers.cs:677-697，非手持〕）：
 *  显式 flame=true 23 件 + DefaultToTorch(:48083 设 flame/holdStyle) 8 件。
 *  原版 LoadItemFlames 的 IsLoaded 门 = 贴图存在才画 → 集合与素材一一对应。 */
export const FLAME_ITEMS: ReadonlySet<number> = new Set<number>([
  // 显式 flame=true（Item.cs 逐 case）：8 火把 / 105 蓝蜡烛(放置 33) / 148 水蜡烛(49) /
  // 427-433 彩色火把 / 523 丛林火把 / 713 铂金蜡烛(174) / 974 神圣火把 / 1245 猩红火把 /
  // 1333 腐化火把 / 2274 冰火把(样式 12) / 3004 沙漠火把 / 3045 迪斯科火把 / 3114 骨火把 /
  // 3117 和平蜡烛(372) / 3823 篝火相关 / 4952 夜光(头侧持) / 5322 暗影火把
  8, 105, 148, 427, 428, 429, 430, 431, 432, 433, 523, 713, 974, 1245, 1333,
  2274, 3004, 3045, 3114, 3117, 3823, 4952, 5322,
  // DefaultToTorch(16..23)（Item.cs:37274/41995/42452）：4383-4388 超亮火把族 /
  // 5293 恶魔火把 / 5353 神圣超亮火把
  4383, 4384, 4385, 4386, 4387, 4388, 5293, 5353,
]);

/** 手持火苗逐物品参数（PlayerDrawLayers.cs:3528-3552 的 color5/num19/num20/num21）。 */
export interface HeldFlameSpec {
  /** 抖动份数（num19，默认 7 = itemFlamePos 槽位数） */
  count: number;
  /** 抖动幅度缩放（num20 × adjustedItemScale；4952 = 0.6） */
  scale: number;
  /** 附加 X 偏移系数（num21 = dxDir × direction，世界空间；仅 5322 = -2） */
  dxDir: number;
  /** 颜色乘子 rgb(0-255)；null = 白直用 */
  tint: readonly [number, number, number] | null;
  /** color5.A 面（PlayerDrawLayers.cs:3528-3551 逐件表）：0=加性族（default/
   *  3045/4952）；5293=20、5322=150、5353=200——AlphaBlend 背景衰减+alpha 面真值 */
  a: number;
  /** 迪斯科动态色（3045） */
  disco?: boolean;
}

export function heldFlameSpec(itemId: number): HeldFlameSpec {
  switch (itemId) {
    case 3045: return { count: 7, scale: 1, dxDir: 0, tint: null, a: 0, disco: true };  // :3534-3536
    case 5293: return { count: 7, scale: 1, dxDir: 0, tint: [50, 50, 100], a: 20 };     // :3537-3539
    case 5353: return { count: 7, scale: 1, dxDir: 0, tint: null, a: 200 };             // :3540-3542（白,A=200）
    case 4952: return { count: 3, scale: 0.6, dxDir: 0, tint: [50, 50, 50], a: 0 };     // :3543-3547
    case 5322: return { count: 7, scale: 1, dxDir: -2, tint: [100, 100, 100], a: 150 }; // :3548-3551
    default: return { count: 7, scale: 1, dxDir: 0, tint: [100, 100, 100], a: 0 };      // :3528-3531
  }
}

// itemFlamePos（LegacyPlayerRenderer.PrepareDrawForFrame :493-502）：7 槽共享一组
// 偏移，每 5 绘制帧重掷（Main.rand = 非种子随机——视觉专用，Math.random 等价）。
// ★2026-09-27 重钉：重掷节拍 = ⌊tick/5⌋ 滚档（与 TileFrameSeed 同判例）——旧
// --_itemFlameCount 按调用次数推进 = 渲染帧驱动,120fps 下重掷双倍速（同病灶）。
const _itemFlamePos: Array<[number, number]> = Array.from({ length: 7 }, () => [0, 0]);
let _itemFlameRoll = -1;
function refreshItemFlamePos(): void {
  const roll = Math.floor(gameTickCount() / 5);
  if (roll === _itemFlameRoll) return;
  _itemFlameRoll = roll;
  for (let i = 0; i < 7; i++) {
    _itemFlamePos[i][0] = (Math.floor(Math.random() * 21) - 10) * 0.15;  // Next(-10,11)
    _itemFlamePos[i][1] = (Math.floor(Math.random() * 11) - 10) * 0.35;  // Next(-10,1)
  }
}

/** 手持火苗叠画。调用点 = Renderer 纸娃娃持握位（drawPlayer 静持）与 useItem
 *  持位（drawUseItem）——两处的 ctx 变换已与手持物同源（translate/scale(direction)/
 *  rotate），本函数只负责在【局部空间】按世界偏移镜像后叠画 dest 矩形。
 *  dest = 手持物的目标矩形（与本体 drawImage 同参）；direction = 玩家朝向（±1）。
 *  dim = ★BJ599 火苗 color5 潜行减色（PlayerDrawLayers.cs:3574 消费点之一）：
 *  color5 基色（100,100,100 族/spec.tint/disco）按原分支精确重放（shroomite raw
 *  直乘/vortex 字节乘——applyStealthToColor）后烘进 tintedFlameCell 染色缓存键,
 *  运行时零新绘制面（BJ348b-3 同判例,零 ctx.filter 面）。 */
export function drawHeldItemFlame(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, itemId: number, direction: number,
  dest: { x: number; y: number; w: number; h: number },
  flicker: FlickerClock | null,
  dim?: HeldStealthDim | null,
): void {
  if (!FLAME_ITEMS.has(itemId)) return;
  const img = atlas.ensureVImage(`vanilla/ItemFlame_${itemId}.png`);
  if (!img || typeof img.width !== 'number' || img.width === 0) return;
  const spec = heldFlameSpec(itemId);
  refreshItemFlamePos();
  // 颜色乘子：disco 走 FlickerClock（16 档量化进染色缓存，同放置态 disco 惯例）
  let tint: readonly [number, number, number] | null = spec.tint;
  if (spec.disco) {
    if (flicker) {
      const [r, g, b] = flicker.discoColor();
      const q = (v: number) => Math.round(v * 255 / 16) * 16;
      tint = [q(r), q(g), q(b)];
    } else {
      tint = [128, 128, 128];
    }
  }
  // ★BJ599：color5 = (RGB,A) 全式（RGB=spec.tint/disco/白,A=spec.a 逐件表）——
  //  原版序 :3574 = 色5 赋值后 ApplyStealthToColor 全 RGBA 面减色（A 面 shroomite
  //  ×s 渐隐/星旋恒 255）。减色后整面烘进染色缓存键（A 面随键）。
  const c5: [number, number, number, number] = [
    tint?.[0] ?? 255, tint?.[1] ?? 255, tint?.[2] ?? 255, spec.a,
  ];
  const dimmed = dim ? applyStealthToColor(c5, dim) : c5;
  const cell = tintedFlameCell(img, 0, 0, img.width, img.height,
    dimmed[0], dimmed[1], dimmed[2], dimmed[3]);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // A=0 加性族（default/3045/4952）：'lighter' = RGB 面纯加算（canvas 预乘存储
  // 存不下 α=0 的 rgb 面——XNA shader 端 ×color 后 blend 的等价实现）。
  // A>0（5293/5322/5353）：source-over ≙ XNA AlphaBlend 预乘（src_p + dst×(1−src_a)）
  // ——背景衰减 + alpha 面 1:1（cell 已带 a/255 alpha 面,见 tintedFlameCell）。
  // 显式置面（防调用点环境 composite 污染——两站现均 source-over,守恒式写法）
  ctx.globalCompositeOperation = (dimmed[3] > 0) ? 'source-over' : 'lighter';
  // 原版 :3558 位置 = (int)(vector + num22*scale + num21)、(int)(vector.Y + num23*scale)
  // ——num21/num22 均为【世界空间】偏移，局部空间（含 scale(direction) 镜像）除以
  // direction（=乘 direction，direction=±1）
  for (let i = 0; i < spec.count; i++) {
    const worldX = _itemFlamePos[i][0] * spec.scale + spec.dxDir * direction;
    const worldY = _itemFlamePos[i][1] * spec.scale;
    ctx.drawImage(cell ?? img, 0, 0, img.width, img.height,
      dest.x + Math.trunc(worldX) * direction, dest.y + Math.trunc(worldY), dest.w, dest.h);
  }
  ctx.restore();
}
