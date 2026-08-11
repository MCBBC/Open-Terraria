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
export function updateLightDecay(waterStyle: number, nightVisionOn: boolean): void {
  nightVision = nightVisionOn;
  const base = WATER_DECAY_BY_STYLE[Math.max(0, Math.min(13, waterStyle))];
  DECAY_WATER = [base[0] * 0.91, base[1] * 0.91, base[2] * 0.91];
  DECAY_AIR = 0.91 * (nightVision ? NIGHT_VISION_MUL : 1);
  DECAY_SOLID = 0.56 * (nightVision ? NIGHT_VISION_MUL : 1);
  // 原版另有 blind ×0.95 / blackout ×0.85 / headcovered ×0.85 与
  // SceneState.airLightDecay/solidLightDecay 调制——对应系统未实装,跳过
}
/** 通道熄灭阈值(LightMap.cs:132/148/164) */
export const DEAD_THRESHOLD = 0.0185;
/** 全局亮度(Lighting.cs:12-14) */
export const GLOBAL_BRIGHTNESS = 1.2;
/** 区域外扩(LightingEngine.cs:28)与不可见边距(:30) */
export const AREA_PADDING = 28;
export const NON_VISIBLE_PADDING = 18;

// ---- 遮挡(LightMaskMode.cs / TileLightScanner.GetTileMask:68-87) ----
/** 裂砖 → 0.80 衰减档(TileID.cs:183: CrackedBricks = {481,482,483}) */
export const CRACKED_SHEETS = new Set([481, 482, 483]);
/** 透光墙(Main.cs:10487-10503 wallLight 全表)——天空光可穿过的墙(0=无墙含在内由调用方处理) */
export const WALL_LIGHT = new Set([21, 318, 106, 317, 107, 138, 140, 141, 139, 145, 150, 152, 245, 315, 168]);

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
/** 蜡烛/吊灯/篝火等闪烁幅度来源的 sheet 集(燃烧类光源) */
export const FLICKER_SHEETS = new Set([33, 49, 92, 93, 174, 34, 149, 95, 100, 126, 173, 564, 215, 405, 4]);
/** 蘑菇组发光 sheet(TileLightScanner.cs:2938 case 70/71/72/190/348/349/528/578；
 *  R=0 B=1 G=0.2+num11/2 的呼吸蓝光,与 FLICKER_SHEETS 三通道叠加不同) */
export const MUSHROOM_GLOW_SHEETS = new Set([70, 71, 72, 190, 348, 349, 528, 578]);

// ---- 发光墙(ApplyWallLight:167-342 精选;[wallId] → RGB) ----
export const WALL_EMISSIVE: Record<number, readonly [number, number, number]> = {
  33: [0.09, 0.0525, 0.24],     // 恶魔砖墙
  44: [0.15, 0.15, 0.15],       // 彩虹砖(静态近似;动态 disco 见 phase2)
  137: [0.5, 0.25, 0.05],       // 岩浆瀑布墙
  153: [0.6, 0.12, 0.6],        // 紫水晶宝石灯墙
  154: [0.6, 0.12, 0.6],
  155: [0.6, 0.42, 0.06],       // 琥珀
  156: [0.09, 0.6, 0.24],       // 祖母绿
  164: [0.09, 0.24, 0.6],       // 蓝宝石
  165: [0.6, 0.06, 0.09],       // 红宝石
  166: [0.42, 0.42, 0.6],       // 钻石
  174: [0.2975, 0, 0],          // 猩红砖墙(仅 R)
  175: [0.075, 0.15, 0.4],      // 蘑菇护板
  176: [0.1, 0.1, 0.1],         // 火星导管
  182: [0.24, 0.12, 0.09],      // 陨石砖墙
  341: [0.25, 0.1, 0],          // 熔岩苔墙
  342: [0, 0.25, 0],
  343: [0.3, 0, 0.17],
  344: [0, 0.16, 0.34],
  345: [0.3, 0, 0.35],
  346: [0.25, 0.25, 0.25],      // 彩虹苔砖墙(静态近似)
  357: [0.15, 0.27, 0.3],       // 水母墙
};

// ---- 月相地板(Main.cs:63230-63266;索引 = dayCount%8,相位序 Empty→Full→Empty) ----
export const MOON_FLOOR = [11, 13, 15, 17, 19, 17, 15, 13];
