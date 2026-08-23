// 光照常数与数据表(Terarria1456 Terraria.Graphics.Light/ 一比一提取)。
// 行号注释指向原版源码;所有颜色为 0-1 浮点 RGB。

// ---- 传播衰减(LightMap.cs:47-58 默认值 / LightingEngine.cs:137-202 每帧覆盖) ----
// let + setter:LightingEngine.UpdateLightDecay 每帧按 waterStyle/夜枭覆盖(ESM live binding,
// LightMap 读到的即最新值)。基线:air 0.91 / solid 0.56 / honey (0.75,0.7,0.6)×0.91。
const NIGHT_VISION_MUL = 1.03;   // 夜枭 buff(UpdateLightDecay :184-187)
let nightVision = false;
export let DECAY_AIR = 0.91;
export let DECAY_SOLID = 0.56;
export const DECAY_CRACKED = 0.80;
/** 水衰减(按群系水色分 13 种,LightingEngine.cs:143-180;默认 0/1/7/8 基准) */
export let DECAY_WATER: [number, number, number] = [0.88 * 0.91, 0.96 * 0.91, 1.015 * 0.91];
/** 蜂蜜衰减 */
export const DECAY_HONEY: [number, number, number] = [0.75 * 0.91, 0.70 * 0.91, 0.60 * 0.91];

/** LightingEngine.UpdateLightDecay :143-180 全表(每 waterStyle 的 RGB 水下衰减) */
const WATER_DECAY_BY_STYLE: Array<[number, number, number]> = [
  [0.88, 0.96, 1.015],  // 0 纯净(1 岩浆/7 地下/8 洞穴同)
  [0.88, 0.96, 1.015],  // 1 岩浆水域(原版同 case)
  [0.94, 0.85, 1.01],   // 2 腐化
  [0.84, 0.95, 1.015],  // 3 丛林
  [0.9, 0.86, 1.01],    // 4 神圣
  [0.84, 0.99, 1.01],   // 5 雪原
  [0.83, 0.93, 0.98],   // 6 沙漠
  [0.88, 0.96, 1.015],  // 7 地下
  [0.88, 0.96, 1.015],  // 8 洞穴
  [1.0, 0.88, 0.84],    // 9 血月
  [0.83, 1.0, 1.0],     // 10 猩红
  [0.88, 0.96, 1.015],  // 11 蜂蜜(原版 switch 无 11 → 保持基准)
  [0.95, 0.98, 0.85],   // 12 地下沙漠
  [0.9, 1.0, 1.02],     // 13 地狱
];
/** Game 每帧调用:按当前群系水色 + 夜枭更新衰减表(:137-187 主干) */
export function updateLightDecay(
  waterStyle: number, nightVisionOn: boolean, blackoutOn = false, blindOn = false,
  opts: { headcovered?: boolean; inShimmer?: boolean;
          /** getGoodWorld 专属档(SceneState.cs:311-326):'queen'=史莱姆女王 2000 内 /
           *  'temple'=蜥蜴神庙 / 'dungeon'=地牢;非 FTW 世界不传 */
          ftwDecay?: 'queen' | 'temple' | 'dungeon' } = {},
): void {
  // ---- SceneState 每帧推进(Main.SceneState;SceneState.cs:303-360) ----
  updateShimmerState(opts.inShimmer === true);
  const targetAir = 1;  // SceneState.cs:305/308:num ×= (1 - shimmerAlpha×0) = 恒 1(原版笔误级系数)
  const targetSolid = 1 - shimmerAlpha * 0.3;  // :306/:309
  let fa = targetAir, fs = targetSolid;
  if (opts.ftwDecay === 'queen') { fa *= 0.6; fs *= 0.6; }
  else if (opts.ftwDecay === 'temple') { fa *= 0.88; fs *= 0.88; }
  else if (opts.ftwDecay === 'dungeon') { fa *= 0.94; fs *= 0.94; }
  sceneAirDecay = moveTowards(sceneAirDecay, fa, 0.005);   // :328-329
  sceneSolidDecay = moveTowards(sceneSolidDecay, fs, 0.005);
  // 微光水体 alpha(Main.cs:58353-58357 liquidAlpha ±0.2/帧;只跟踪 13 档供深水天光支路)
  shimmerWaterAlpha = Math.max(0, Math.min(1,
    shimmerWaterAlpha + (waterStyle === 13 ? 0.2 : -0.2)));

  nightVision = nightVisionOn;
  const base = WATER_DECAY_BY_STYLE[Math.max(0, Math.min(13, waterStyle))];
  DECAY_WATER = [base[0] * 0.91, base[1] * 0.91, base[2] * 0.91];
  // blackout（buff 80，Torch God/敌弹双源）×0.85（LightingEngine.cs:190-194）；
  // blind（buff 22 黑暗）×0.95（:185-189）；headcovered 头埋方块 ×0.85（:199-203）
  const blk = blackoutOn ? 0.85 : 1;
  const bld = blindOn ? 0.95 : 1;
  const hc = opts.headcovered ? 0.85 : 1;
  // 尾乘 SceneState.airLightDecay/solidLightDecay（LightingEngine.cs:204-206）
  DECAY_AIR = 0.91 * (nightVision ? NIGHT_VISION_MUL : 1) * blk * bld * hc * sceneAirDecay;
  DECAY_SOLID = 0.56 * (nightVision ? NIGHT_VISION_MUL : 1) * blk * bld * hc * sceneSolidDecay;
  // GlobalBrightness（Lighting.cs:109-116：base 1.2，blind → 1.0）
  globalBrightness = blindOn ? 1.0 : 1.2;
}

// ---- SceneState 微光域光暗化(SceneState.cs:338-360 + Main.shimmerAlpha/shimmerDarken) ----
function moveTowards(value: number, target: number, step: number): number {
  if (value < target) return Math.min(value + step, target);
  if (value > target) return Math.max(value - step, target);
  return value;
}
let sceneAirDecay = 1;
let sceneSolidDecay = 1;
/** 微光域浓度(SceneState.shimmerAlpha;入域 0.025/帧升,出域延迟 4 帧后 0.05/帧降) */
export let shimmerAlpha = 0;
/** 微光域天光渐灭系数(SceneState.shimmerDarken;ApplySurfaceLight :3243-3246 全输出乘 1-darken) */
export let shimmerDarken = 0;
/** 微光水体 alpha(Main.liquidAlpha[13];深水微光天光支路 :3181-3188 用) */
export let shimmerWaterAlpha = 0;
let shimmerBrightenDelay = 0;
/** SceneState.UpdateShimmer(:338-360):入域 alpha→1 @0.025,alpha≥0.5 后 darken→1 @0.025;
 *  出域 darken→0 @0.05,归零且 4 帧延迟耗尽后 alpha→0 @0.05 */
export function updateShimmerState(inShimmer: boolean): void {
  if (inShimmer) {
    shimmerAlpha = moveTowards(shimmerAlpha, 1, 0.025);
    if (shimmerAlpha >= 0.5) {
      shimmerDarken = moveTowards(shimmerDarken, 1, 0.025);
      shimmerBrightenDelay = 4;
    }
    return;
  }
  shimmerDarken = moveTowards(shimmerDarken, 0, 0.05);
  if (shimmerDarken === 0) {
    shimmerBrightenDelay = moveTowards(shimmerBrightenDelay, 0, 1);
  }
  if (shimmerBrightenDelay === 0) {
    shimmerAlpha = moveTowards(shimmerAlpha, 0, 0.05);
  }
}
/** 通道熄灭阈值(LightMap.cs:132/148/164) */
export const DEAD_THRESHOLD = 0.0185;
/** 全局亮度(Lighting.cs:109-116：base 1.2，blind→1.0；updateLightDecay 每帧刷新) */
export let globalBrightness = 1.2;
/** 区域外扩(LightingEngine.cs:28)与不可见边距(:30) */
export const AREA_PADDING = 28;
export const NON_VISIBLE_PADDING = 18;

// ---- 遮挡(LightMaskMode.cs / TileLightScanner.GetTileMask:68-87) ----
/** 裂砖 → 0.80 衰减档(TileID.cs:183: CrackedBricks = {481,482,483}) */
export const CRACKED_SHEETS = new Set([481, 482, 483]);

/** ★挡光布尔表(Main.tileBlockLight,1457 Main.cs Initialize_TileAndNPCData2 全量机械提取,
 *  278 项;TileLightScanner.LightIsBlocked :154-165 读表判定,与 tileSolid/opacity 无关)。
 *  关门 10/蛛网 51/藤蔓 52/62/205/382/海草 549/装饰蛛网 697/荆棘 32 等挡光,
 *  回声块 546/541、云 189/196、尖刺 48、泡泡 379、彩纸 328、气球 446-451 不挡。
 *  按 vanilla sheet 索引;718(昼云)为昼夜动态(Main.cs:66134-66141 UpdateTime:昼 false/夜 true,
 *  静态表无该项)由扫描器每帧覆写 */
export const TILE_BLOCK_LIGHT_SHEETS: ReadonlySet<number> = new Set([
  0, 1, 2, 6, 7, 8, 9, 10, 22, 23, 25, 30, 32, 37, 38, 39, 40, 41, 43, 44, 45, 46, 47, 51, 52,
  53, 56, 57, 58, 59, 60, 62, 63, 64, 65, 66, 67, 68, 70, 75, 76, 107, 108, 109, 111, 112, 115, 
  116, 117, 118, 119, 120, 121, 122, 123, 130, 131, 137, 140, 145, 146, 147, 148, 150, 151, 152, 
  153, 154, 155, 156, 157, 158, 159, 160, 161, 163, 164, 165, 166, 167, 168, 169, 170, 175, 176, 
  177, 179, 180, 181, 182, 183, 188, 190, 191, 192, 193, 194, 195, 197, 198, 199, 200, 202, 203, 
  204, 205, 206, 208, 211, 221, 222, 223, 224, 225, 226, 229, 230, 234, 235, 248, 249, 250, 251, 
  252, 253, 272, 273, 274, 284, 311, 312, 313, 315, 321, 322, 325, 326, 327, 329, 345, 346, 347, 
  348, 350, 352, 357, 367, 368, 369, 370, 371, 381, 382, 383, 384, 385, 387, 388, 396, 397, 398, 
  399, 400, 401, 402, 403, 404, 407, 408, 409, 415, 416, 417, 418, 421, 422, 426, 430, 431, 432, 
  433, 434, 458, 472, 473, 474, 477, 478, 479, 481, 482, 483, 492, 495, 496, 498, 500, 501, 502, 
  503, 507, 508, 512, 513, 514, 515, 516, 517, 534, 535, 536, 537, 539, 540, 549, 557, 562, 563, 
  566, 618, 625, 626, 627, 628, 633, 635, 641, 659, 661, 662, 666, 667, 668, 669, 670, 671, 672, 
  673, 674, 675, 676, 677, 678, 679, 680, 681, 682, 683, 684, 685, 686, 687, 688, 689, 690, 691, 
  692, 697, 708, 722, 726, 734, 735, 736, 737, 738, 739, 740, 741, 742, 743, 744, 745, 746,
  747, 749, 750
]);

/** ★挡阳表(Main.tileNoSunLight,1457 Main.cs:8528-8545:全 tileSolid 置 true 后豁免
 *  16 条;ApplySurfaceLight :3170/ApplyHellLight :3270 天空/地狱光放行判定用,
 *  与 tileBlockLight 是两张独立表——挡光≠挡阳) */
export const TILE_NO_SUN_LIGHT_SHEETS: ReadonlySet<number> = new Set([
    0, 1, 2, 6, 7, 8, 9, 10, 11, 22, 23, 25, 30, 37, 38, 39, 40, 41, 43, 44, 45, 46, 47, 53, 56, 
  57, 58, 59, 60, 63, 64, 65, 66, 67, 68, 70, 75, 76, 107, 108, 109, 111, 112, 116, 117, 118, 
  119, 120, 121, 122, 123, 127, 130, 137, 138, 140, 145, 146, 147, 148, 150, 151, 152, 153, 154, 
  155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 166, 167, 168, 169, 175, 176, 177, 179, 180, 
  181, 182, 183, 188, 197, 199, 202, 234, 381, 384, 386, 387, 389, 477, 481, 482, 483, 484, 492, 
  512, 513, 514, 515, 516, 517, 534, 535, 536, 537, 539, 540, 566, 625, 626, 627, 628, 630, 631, 
  633, 661, 662, 664, 687, 688, 689, 690, 691, 692, 711, 712, 713, 714, 715, 716
]);

/** 水中也透天光的方块(TileID.Sets.AllowLightInWater,TileID.cs:363) */
export const ALLOW_LIGHT_IN_WATER_SHEETS = new Set([54, 541, 328, 459, 748, 750]);
/** 透光墙(Main.cs:10487-10503 wallLight 全表)——天空光可穿过的墙(0=无墙含在内由调用方处理) */
export const WALL_LIGHT = new Set([21, 318, 106, 317, 107, 138, 140, 141, 139, 145, 150, 152, 245, 315, 168, 73, 227]); // +73 云墙/227 降雪墙特例

// ---- 火把色(TorchID.cs:134-161 _lights 全表;0-1 RGB) ----
export const TORCH_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0.95, 0.8],      // 0 火把
  [0, 0.1, 1.3],       // 1 蓝
  [1, 0.1, 0.1],       // 2 红
  [0, 1, 0.1],         // 3 绿
  [0.9, 0, 0.9],       // 4 紫
  [1.4, 1.4, 1.4],     // 5 白
  [0.9, 0.9, 0],       // 6 黄
  [1, 0.3, 0.5],       // 7 恶魔(动态,见 SkyColor.demonTorch 插值)
  [1, 1.6, 0.5],       // 8 诅咒
  [0.75, 0.85, 1.4],   // 9 冰
  [1, 0.5, 0],         // 10 橙
  [1.4, 1.4, 0.7],     // 11 圣液
  [0.75, 1.35, 1.5],   // 12 超亮
  [0.95, 0.75, 1.3],   // 13 骨头
  [1, 1, 1],           // 14 彩虹(动态,见 SkyColor.disco)
  [1, 0, 1],           // 15 粉
  [1.4, 0.85, 0.55],   // 16 沙漠
  [0.25, 1.3, 0.8],    // 17 珊瑚
  [0.95, 0.4, 1.4],    // 18 腐化
  [1.4, 0.7, 0.5],     // 19 猩红
  [1.25, 0.6, 1.2],    // 20 神圣
  [0.75, 1.45, 0.9],   // 21 丛林
  [0.3, 0.78, 1.2],    // 22 蘑菇
  [1, 1, 1],           // 23 微光(动态,见 SkyColor)
];
/** ★闪烁族收敛（TileLightScanner 原版仅三 case 用 Next(28,42)*0.005+(270-mt)/700 系：
 *  405(:1033-1067)/215(:1073-1162)/592(:1171-1181)——曾把火把(4)/蜡烛(33)/灯(34)/49/
 *  92/93/95/100/126/149/173/174/564 全部误抬 +0.16~0.32 常量（照明半径 +3 格） */
export const FLICKER_SHEETS = new Set([405, 215, 592]);
/** 蘑菇组发光 sheet(TileLightScanner.cs:2938 case 70/71/72/190/348/349/528/578；
 *  R=0 B=1 G=0.2+num11/2 的呼吸蓝光,与 FLICKER_SHEETS 三通道叠加不同) */
export const MUSHROOM_GLOW_SHEETS = new Set([70, 71, 72, 190, 348, 349, 528, 578]);

// ---- 发光墙(ApplyWallLight:167-342 精选;[wallId] → RGB) ----
// ★门语义(1457 TileLightScanner.cs:169-322):宝石灯墙七条(153/154/155/156/164/165/166)
//   **无任何 LightIsBlocked 门**——实心块后面的宝石墙照样发光;其余各墙都要求
//   `!LightIsBlocked(tile)`(当前格非挡光块)。44/346 为 Disco 动态、137 为闪烁动态,
//   三者不在静态表(扫描器动态分支处理);175/357 有涂装覆写分支(扫描器处理)。
export const WALL_EMISSIVE: Record<number, readonly [number, number, number]> = {
  33: [0.09, 0.0525, 0.24],     // 恶魔砖墙
  174: [0.2975, 0, 0],          // 猩红砖墙(仅 R)
  // ★宝石灯墙七条 1:1（TileLightScanner.cs:248-273：Amethyst=0.6/0/0.6、Topaz=0.6/0.6/0、
  //   Amber=0.6/0.3/0、Ruby=0.6/0/0、Diamond=0.6/0.6/0.6、Emerald=0/0.6/0、
  //   Sapphire=0/0/0.6——原表 id 与宝石名错位一档连锁错）
  153: [0.6, 0.3, 0],            // Amber 琥珀（CS:270-273）
  154: [0.6, 0, 0.6],            // Amethyst 紫水晶（CS:248-251）
  155: [0.6, 0.6, 0.6],          // Diamond 钻石（CS:265-268）
  156: [0, 0.6, 0],              // Emerald 祖母绿（CS:259-261）
  164: [0.6, 0, 0],              // Ruby 红宝石（CS:262-264）
  165: [0, 0, 0.6],              // Sapphire 蓝宝石（CS:256-258）
  166: [0.6, 0.6, 0],            // Topaz 黄玉（CS:252-255）
  175: [0.075, 0.15, 0.4],      // 蘑菇护板(未涂装档;涂装覆写见扫描器)
  176: [0.1, 0.1, 0.1],         // 火星导管
  182: [0.24, 0.12, 0.09],      // 陨石砖墙
  341: [0.25, 0.1, 0],          // 熔岩苔墙
  342: [0.3, 0, 0.17],
  343: [0, 0.25, 0],
  344: [0, 0.16, 0.34],
  345: [0.3, 0, 0.35],
  357: [0.15, 0.27, 0.3],       // 水母墙(涂装覆写见扫描器)
};
/** 需 !LightIsBlocked 门的发光墙(其余=宝石七条,无门) */
export const WALL_EMISSIVE_GATED = new Set([33, 174, 175, 176, 182, 341, 342, 343, 344, 345, 357]);

// ---- 月相地板(Main.cs:63230-63242;索引 = MoonPhase 枚举 Full=0…Empty=4,
//      序列 19,17,15,13,11,13,15,17——曾整体倒置致满月夜拿最暗地板) ----
export const MOON_FLOOR = [19, 17, 15, 13, 11, 13, 15, 17];
