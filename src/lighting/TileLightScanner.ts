// 播种扫描器(Terrarria1456 Terraria.Graphics.Light/TileLightScanner.cs 一比一主干)。
// GetTileMask(:68-87):遮挡分类;GetTileLight(:89-108):逐格 max-raise 播种
// (天空 ApplySurfaceLight:3152 → 地狱 ApplyHellLight:3261 → 墙 :167 → tile :344 → 液体 :110)。
// 洞穴(worldSurface..UnderworldLayer)零环境光。
import { TILE_DEFS } from '../data/tiles';
import { lightIsOn } from '../world/wiring/devices';
import { TileStore } from '../world/TileStore';
import { FastRandom } from './FastRandom';
import { CRACKED_SHEETS, FLICKER_SHEETS, MUSHROOM_GLOW_SHEETS, TORCH_COLORS, WALL_EMISSIVE, WALL_LIGHT } from './lightTables';
import { FlickerClock, skySeed } from './SkyColor';
import { LightMap, Mask } from './LightMap';

/** 扫描器依赖的最小世界结构(引擎注入;World 满足该接口) */
export interface ScannerWorld {
  store: TileStore;
  groundLevel: number;  // 原版 worldSurface
  lavaLine: number;     // 原版 UnderworldLayer
  clock: { timeOfDay: number; dayCount: number; eclipse?: boolean };
}

/** 动态点光(原版 Lighting.AddLight;0-1 RGB) */
export interface PerFrameLight { x: number; y: number; r: number; g: number; b: number }

/** 动态发光特例上下文（ApplyTileLight 部分 case 需要格坐标/局部随机/世界旗标） */
export interface SpecialLightCtx {
  x: number; y: number;
  st?: TileStore;
  /** WithModifier(x,y) 局部随机（原版 ref localRandom） */
  localRand?: () => FastRandom;
  sundialCooldown?: number;
  moondialCooldown?: number;
  isDay?: boolean;
  raining?: boolean;
  /** timeOfDay（83 药草黄昏档 Main.time>40500 ⟺ >0.65625） */
  timeOfDay?: number;
}

// ---- 蜡烛/吊灯/烛台样式光表（ApplyTileLight 33/93/100(173)/34 内层 switch 逐 case 提取；
//      动态样式【不在此表】，由 candleFamilyLight 分发：demon=demonTorch、hsl=demonTorch 彩虹、
//      shimmer=GetShimmerBaseColor×1.5、paint 档=固定 (0.37,0.8,1)——涂装覆盖本仓未实装恒走该色）
/** 33 蜡烛族——style=frameY/22（cs 样式行）; 动态: 19 paint、25 demon、30 hsl、42 shimmer×1.5 */
const CANDLE_LIGHT_33: Record<number, [number, number, number]> = {
  0: [1.0, 0.95, 0.65], 1: [0.55, 0.85, 0.35], 2: [0.65, 0.95, 0.5], 3: [0.2, 0.75, 1.0],
  5: [0.85, 0.6, 1.0], 7: [0.75, 0.85, 1.0], 8: [0.75, 0.85, 1.0], 9: [1.0, 0.95, 0.65],
  10: [1.0, 0.97, 0.85], 14: [1.0, 1.0, 0.6], 15: [1.0, 0.95, 0.65], 18: [1.0, 0.95, 0.65],
  20: [0.0, 0.9, 1.0], 21: [0.25, 0.7, 1.0], 23: [1.0, 0.95, 0.65], 24: [1.0, 0.95, 0.65],
  28: [0.9, 0.75, 1.0], 29: [1.0, 0.95, 0.65], 31: [1.0, 0.97, 0.85], 32: [0.55, 0.45, 0.95],
  33: [1.0, 0.6, 0.1], 34: [0.3, 0.75, 0.55], 35: [0.9, 0.55, 0.7], 36: [0.55, 0.85, 1.0],
  37: [1.0, 0.95, 0.65], 38: [1.0, 0.95, 0.65], 39: [0.4, 0.8, 0.9], 40: [1.0, 1.0, 1.0],
  41: [0.95, 0.5, 0.4], 43: [1.0, 0.95, 0.65], 44: [1.0, 0.666667, 0.776471], 45: [1.0, 0.95, 0.65],
  46: [0.952941, 0.905882, 0.36078432], 47: [0.635294, 0.5019608, 1.0], 48: [1.0, 0.392157, 0.392157], 49: [0.745098, 0.745098, 1.0],
  50: [0.666667, 0.7058824, 1.0], 51: [1.0, 0.95, 0.65], 52: [1.0, 0.95, 0.75], 53: [1.0, 0.85499996, 0.585],
  54: [0.5, 0.9, 1.0], 55: [1.0, 0.9, 0.9], 56: [0.7058824, 0.901961, 1.0], 57: [0.5882353, 0.921569, 0.960784],
  58: [0.666667, 0.960784, 1.0], 59: [1.0, 0.95, 0.65], 60: [1.0, 0.95, 0.65], 61: [0.921569, 0.4117647, 1.0],
  62: [0.745098, 0.745098, 1.0], 63: [0.843137, 0.686275, 0.960784],
};
/** 93 吊灯——style=frameY/54; 动态: 19 paint、23 demon、31 hsl、43 shimmer×1.5 */
const LAMP_LIGHT_93: Record<number, [number, number, number]> = {
  1: [0.95, 0.95, 0.5], 2: [0.85, 0.6, 1.0], 3: [0.75, 1.0, 0.6], 4: [0.75, 0.85, 1.0],
  5: [0.75, 0.85, 1.0], 6: [1.0, 0.95, 0.65], 7: [1.0, 0.97, 0.85], 9: [1.0, 1.0, 0.7],
  10: [1.0, 0.95, 0.65], 12: [1.0, 0.95, 0.65], 13: [1.0, 1.0, 0.6], 14: [1.0, 0.95, 0.65],
  18: [1.0, 0.95, 0.65], 20: [0.0, 0.9, 1.0], 21: [0.25, 0.7, 1.0], 24: [0.35, 0.5, 0.3],
  25: [0.34, 0.4, 0.31], 26: [0.25, 0.32, 0.5], 29: [0.9, 0.75, 1.0], 30: [1.0, 0.95, 0.65],
  32: [1.0, 0.97, 0.85], 33: [0.55, 0.45, 0.95], 34: [1.0, 0.6, 0.1], 35: [0.3, 0.75, 0.55],
  36: [0.9, 0.55, 0.7], 37: [0.55, 0.85, 1.0], 38: [1.0, 0.95, 0.65], 39: [1.0, 0.95, 0.65],
  40: [0.4, 0.8, 0.9], 41: [1.0, 1.0, 1.0], 42: [0.95, 0.5, 0.4], 44: [1.0, 0.95, 0.65],
  45: [1.0, 0.666667, 0.776471], 46: [1.0, 0.95, 0.65], 47: [0.952941, 0.905882, 0.36078432], 48: [0.635294, 0.5019608, 1.0],
  49: [1.0, 0.392157, 0.392157], 50: [0.745098, 0.745098, 1.0], 51: [0.666667, 0.7058824, 1.0], 52: [1.0, 0.95, 0.65],
  53: [1.0, 0.95, 0.75], 54: [1.0, 0.85499996, 0.585], 55: [0.5, 0.9, 1.0], 56: [1.0, 0.9, 0.9],
  57: [0.7058824, 0.901961, 1.0], 58: [0.5882353, 0.921569, 0.960784], 59: [0.666667, 0.960784, 1.0], 60: [1.0, 0.95, 0.65],
  61: [1.0, 0.95, 0.65], 62: [0.921569, 0.4117647, 1.0], 63: [0.745098, 0.745098, 1.0], 64: [0.843137, 0.686275, 0.960784],
};
/** 100 挂灯（100/173 共体）——style=frameY/36; 动态: 19 paint、25 demon、31 hsl、43 shimmer×1.5 */
const LAMP_LIGHT_100: Record<number, [number, number, number]> = {
  1: [0.95, 0.95, 0.5], 2: [0.85, 0.6, 1.0], 3: [1.0, 0.6, 0.6], 5: [1.0, 0.95, 0.65],
  6: [1.0, 0.95, 0.65], 7: [1.0, 0.95, 0.65], 8: [1.0, 0.97, 0.85], 9: [0.75, 0.85, 1.0],
  11: [1.0, 1.0, 0.7], 12: [1.0, 0.95, 0.65], 13: [1.0, 1.0, 0.6], 14: [1.0, 0.95, 0.65],
  18: [1.0, 0.95, 0.65], 20: [0.0, 0.9, 1.0], 21: [0.25, 0.7, 1.0], 22: [0.35, 0.5, 0.3],
  23: [0.34, 0.4, 0.31], 24: [0.25, 0.32, 0.5], 29: [0.9, 0.75, 1.0], 30: [1.0, 0.95, 0.65],
  32: [1.0, 0.97, 0.85], 33: [0.55, 0.45, 0.95], 34: [1.0, 0.6, 0.1], 35: [0.3, 0.75, 0.55],
  36: [0.9, 0.55, 0.7], 37: [0.55, 0.85, 1.0], 38: [1.0, 0.95, 0.65], 39: [1.0, 0.95, 0.65],
  40: [0.4, 0.8, 0.9], 41: [1.0, 1.0, 1.0], 42: [0.95, 0.5, 0.4], 44: [1.0, 0.95, 0.65],
  45: [1.0, 0.666667, 0.776471], 46: [1.0, 0.95, 0.65], 47: [0.952941, 0.905882, 0.36078432], 48: [0.635294, 0.5019608, 1.0],
  49: [1.0, 0.392157, 0.392157], 50: [0.745098, 0.745098, 1.0], 51: [0.666667, 0.7058824, 1.0], 52: [1.0, 0.95, 0.65],
  53: [1.0, 0.95, 0.75], 54: [1.0, 0.85499996, 0.585], 55: [0.5, 0.9, 1.0], 56: [1.0, 0.9, 0.9],
  57: [0.7058824, 0.901961, 1.0], 58: [0.5882353, 0.921569, 0.960784], 59: [0.666667, 0.960784, 1.0], 60: [1.0, 0.95, 0.65],
  61: [1.0, 0.95, 0.65], 62: [0.921569, 0.4117647, 1.0], 63: [0.745098, 0.745098, 1.0], 64: [0.843137, 0.686275, 0.960784],
};
/** 34 烛台——style=frameY/54 + 37*(frameX/108); 动态: 24 paint、32 demon、37 hsl、49 shimmer×1.5 */
const CANDELABRA_LIGHT_34: Record<number, [number, number, number]> = {
  7: [0.95, 0.95, 0.5], 8: [0.85, 0.6, 1], 9: [1, 0.6, 0.6], 11: [0.75, 0.85, 1],
  12: [1, 0.95, 0.65], 13: [1, 0.97, 0.85], 15: [1, 1, 0.7], 16: [1, 0.95, 0.65],
  17: [0.75, 0.85, 1], 18: [1, 1, 0.6], 19: [1, 0.95, 0.65], 23: [1, 0.95, 0.65],
  25: [0, 0.9, 1], 26: [0.25, 0.7, 1], 27: [0.55, 0.85, 0.35], 28: [0.65, 0.95, 0.5],
  29: [0.2, 0.75, 1], 30: [1, 0.95, 0.65], 35: [0.9, 0.75, 1], 36: [1, 0.95, 0.65],
  38: [1, 0.97, 0.85], 39: [0.55, 0.45, 0.95], 40: [1, 0.6, 0.1], 41: [0.3, 0.75, 0.55],
  42: [0.9, 0.55, 0.7], 43: [0.55, 0.85, 1], 44: [1, 0.95, 0.65], 45: [1, 0.95, 0.65],
  46: [0.4, 0.8, 0.9], 47: [1, 1, 1], 48: [0.95, 0.5, 0.4], 50: [1, 0.95, 0.65],
  51: [1, 0.666667, 0.776471], 52: [1, 0.95, 0.65], 53: [0.952941, 0.905882, 0.360784],
  54: [0.635294, 0.5019608, 1], 55: [1, 0.392157, 0.392157], 56: [0.745098, 0.745098, 1],
  57: [0.666667, 0.7058824, 1], 58: [1, 0.95, 0.65], 59: [1, 0.95, 0.75],
  60: [1, 0.855, 0.585], 61: [0.5, 0.9, 1], 62: [1, 0.9, 0.9], 63: [0.7058824, 0.901961, 1],
  64: [0.5882353, 0.921569, 0.960784], 65: [0.666667, 0.960784, 1], 66: [1, 0.95, 0.65],
  67: [1, 0.95, 0.65], 68: [0.921569, 0.4117647, 1], 69: [0.745098, 0.745098, 1],
  70: [0.843137, 0.686275, 0.960784],
};

/** 蜡烛族样式光公共分发（33/93/100/173/34）：表查 + 动态样式（demon/hsl/shimmer/paint） */
function candleFamilyLight(
  style: number, table: Record<number, [number, number, number]>,
  dyn: { paint: number; demon: number; hsl: number; shimmer: number },
  def: [number, number, number], flicker: FlickerClock, ctx: SpecialLightCtx,
): [number, number, number] | null {
  if (style === dyn.paint) return [0.37, 0.8, 1];
  if (style === dyn.demon) return flicker.demonTorchColor();
  if (style === dyn.hsl) {
    // Main.hslToRgb(demonTorch*0.12+0.69, 1, 0.75).ToVector3() * 1.2
    const c = flicker.hslToRgb(flicker.demonTorch * 0.12 + 0.69, 1, 0.75);
    return [c[0] * 1.2, c[1] * 1.2, c[2] * 1.2];
  }
  if (style === dyn.shimmer) {
    // GetShimmerBaseColor(x,y)*1.5 钳 0-1
    const s = flicker.shimmerBaseColor(ctx.x, ctx.y);
    return [Math.min(1, s[0] * 1.5), Math.min(1, s[1] * 1.5), Math.min(1, s[2] * 1.5)];
  }
  return table[style] ?? def;
}

/**
 * 动态发光特例（原版 ApplyTileLight 帧条件/动态色 case 1:1）：
 * - 126 迪斯科球：frameX<36 → Disco RGB（TileLightScanner.cs:3057）
 * - 429 导线灯泡：frameX/18 位段 → 各线色 +0.5、致动器 +0.2R/G（cs:881-905）
 * - 209 传送门炮：frameX 234/252（紫）306/324（橙）×0.65（cs:432，PortalHelper 色近似）
 * - 84 开花药草：style2 死亡草随闪烁暗红 / style5 火焰草橙 / style6 颤骨草淡蓝（cs:3009）
 * - 其余 33/93/100/173/34/26/31/695/696/83/215/405/171/316-318/719 等 = 全量对账批
 *   （ApplyTileLight :344-3151 逐 case 移植；缺 ctx 的调用（单测）只走纯帧分支）
 */
export function specialTileLight(
  sheet: number, frameX: number, frameY: number, flicker: FlickerClock,
  ctx?: SpecialLightCtx,
): [number, number, number] | null {
  switch (sheet) {
    case 42: {
      // 灯笼(TileLightScanner 主 switch case 42):frameX!=0(灭档 18)不发光;
      // 光色按样式行 frameY/36 —— def.light 静态单色由 lantern def 移除,全走此表
      if (frameX !== 0) return null;
      const LANTERN_LIGHT: Record<number, [number, number, number]> = {
        0: [0.7, 0.65, 0.55], 1: [0.9, 0.75, 0.6], 2: [0.8, 0.6, 0.6],
        3: [0.65, 0.5, 0.2], 4: [0.5, 0.7, 0.4], 5: [0.9, 0.4, 0.2],
        6: [0.7, 0.75, 0.3], 8: [0.75, 0.6, 0.3],
        // 7/9 = demonTorch 调制档，见下方动态分支
        11: [0.85, 0.6, 1], 14: [1, 0.95, 0.65],
      };
      // 样式 7/9 原版叠加 Main.demonTorch 调制——并非火把计数，而是全局三角波
      // （Main.cs:1286 初值 1、DoUpdate_AnimateTileGlows :18089-18100 ±0.01/t 钳 0..1，
      // 周期 200t）：style7 cs:2638-2645 R=G=0.9-d*0.2、B=0.7+d*0.2；
      // style9 cs:2646-2652 R=1-d*0.1、G=0.3-d*0.2、B=0.5+d*0.2（FlickerClock.demonTorch
      // 已同构维护该波形，旧"取中值 0.5 近似"已退役）
      const st = Math.floor(frameY / 36);
      if (st === 7) {
        const n14 = flicker.demonTorch * 0.2;
        return [0.9 - n14, 0.9 - n14, 0.7 + n14];
      }
      if (st === 9) {
        const d = flicker.demonTorch;
        return [1 - d * 0.1, 0.3 - d * 0.2, 0.5 + d * 0.2];
      }
      return LANTERN_LIGHT[st] ?? [1, 1, 1]; // ★default (1,1,1)（CS:2903-2907——曾 0.7/0.65/0.55）
    }
    case 126:
      if (frameX < 36) {
        const [r, g, b] = flicker.discoColor();
        return [r, g, b];
      }
      return null;
    case 429: {
      const n = Math.floor(frameX / 18);
      let r = 0, g = 0, b = 0;
      if (n % 2 >= 1) r += 0.5;
      if (n % 4 >= 2) g += 0.5;
      if (n % 8 >= 4) b += 0.5;
      if (n % 16 >= 8) { r += 0.2; g += 0.2; }
      return [r, g, b];
    }
    case 209:
      // ★GetPortalColor(p,0)×0.65（CS:432-447）：portal0=橙 (0.650,0.306,0)、
      // portal1=青 (0.130,0.588,0.650)——曾两档色写反
      if (frameX === 234 || frameX === 252) return [0.65, 0.306, 0];
      if (frameX === 306 || frameX === 324) return [0.13, 0.588, 0.65];
      return null;
    case 84: {
      const style = Math.floor(frameX / 18);
      if (style === 2) {
        const n = Math.max(0, Math.min(1, (270 - flicker.mouseTextColor) / 400));
        return [n * 1.4, n * 1.2, n / 2];
      }
      if (style === 5) return [0.9, 0.72, 0.18];
      if (style === 6) return [0, 0.08 * 0.8, 0.08];
      return null;
    }
    // ---- 蜡烛/吊灯/烛台/挂灯四族（frameX/frameY 门 + 样式表，cs:1215/2240/1517/1822） ----
    case 33:
      if (frameX !== 0 || !ctx) return null;
      return candleFamilyLight(Math.floor(frameY / 22), CANDLE_LIGHT_33,
        { paint: 19, demon: 25, hsl: 30, shimmer: 42 }, [1, 0.95, 0.65], flicker, ctx);
    case 93:
      if (frameX !== 0 || !ctx) return null;
      return candleFamilyLight(Math.floor(frameY / 54), LAMP_LIGHT_93,
        { paint: 19, demon: 23, hsl: 31, shimmer: 43 }, [1, 0.97, 0.85], flicker, ctx);
    case 100:
    case 173:
      if (frameX >= 36 || !ctx) return null;
      return candleFamilyLight(Math.floor(frameY / 36), LAMP_LIGHT_100,
        { paint: 19, demon: 25, hsl: 31, shimmer: 43 }, [1, 0.95, 0.65], flicker, ctx);
    case 34: {
      // frameX%108<54 门（右半熄灭）；style = frameY/54 + 37*(frameX/108)（cs:1822-2128）
      if (frameX % 108 >= 54 || !ctx) return null;
      return candleFamilyLight(Math.floor(frameY / 54) + 37 * Math.floor(frameX / 108),
        CANDELABRA_LIGHT_34,
        { paint: 24, demon: 32, hsl: 37, shimmer: 49 }, [1, 0.95, 0.8], flicker, ctx);
    }
    case 171: {
      // 圣诞树吊灯（cs:2174-2232）：frameX<10 的格子回溯原点格，style=(原点 frameY & 0x3C00)>>10；
      // 表 1-11 ×0.5，default 全零（不发光）
      if (!ctx?.st) return null;
      const ox = frameX < 10 ? ctx.x - frameX : ctx.x;
      const oy = frameX < 10 ? ctx.y - frameY : ctx.y;
      if (!ctx.st.inBounds(ox, oy)) return null;
      const bits = (ctx.st.frameY[ctx.st.idx(ox, oy)] & 0x3c00) >> 10;
      const T: Record<number, [number, number, number]> = {
        1: [0.1, 0.1, 0.1], 2: [0.2, 0, 0], 3: [0, 0.2, 0], 4: [0, 0, 0.2],
        5: [0.125, 0.125, 0], 6: [0.2, 0.1, 0], 7: [0.125, 0.125, 0], 8: [0.08, 0.175, 0],
        9: [0, 0.125, 0.125], 10: [0.125, 0, 0.125], 11: [0.1, 0.1, 0.2],
      };
      const c = T[bits];
      return c ? [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5] : null;
    }
    case 174:
      return frameX === 0 ? [1, 0.95, 0.65] : null;   // 白金蜡烛（cs:1509-1516）
    // ---- 祭坛双色态（26 魔金/31 猩红/695/696 复制品，cs:2642-2659）：
    //      26/695 余烬档 frameX>=54、31/696 >=36 → (0.5,0.2,0.1)；否则暗紫 (0.31,0.1,0.44) ----
    case 26:
    case 31:
    case 695:
    case 696: {
      const rnd = ctx?.localRand?.();
      if (!rnd) return null;
      if ((sheet === 31 || sheet === 696 ? frameX >= 36 : frameX >= 54)) {
        const n4 = rnd.next(-5, 6) * 0.0025;
        return [0.5 + n4 * 2, 0.2 + n4, 0.1];
      }
      const n5 = rnd.next(-5, 6) * 0.0025;
      return [0.31 + n5, 0.1, 0.44 + n5 * 2];
    }
    case 20: {
      // 树苗熔渣变体 fx/18 ∈ 30-32（cs:60-65）
      const c = Math.floor(frameX / 18);
      return c >= 30 && c <= 32 ? [0.325, 0.15, 0.05] : null;
    }
    case 27:
      return frameY < 36 ? [0.3, 0.27, 0] : null;   // 向日葵（cs）
    case 35:
      return frameX < 36 ? [0.75, 0.6, 0.3] : null; // 南瓜灯亮档
    case 37: {
      // 陨石 Next(95,106)×0.01 抖动（cs:2157-2163）
      const rnd = ctx?.localRand?.();
      if (!rnd) return null;
      const n = rnd.next(95, 106) * 0.01;
      return [0.56 * n, 0.43 * n, 0.15 * n];
    }
    case 61:
    case 703: {
      // 丛林植物/绽放绽放光 frameX==144（:2632-2640）
      if (frameX !== 144) return null;
      const n6 = 1 + (270 - flicker.mouseTextColor) / 400;
      const n7 = 0.8 - (270 - flicker.mouseTextColor) / 400;
      return [0.42 * n7, 0.81 * n6, 0.52 * n7];
    }
    case 83: {
      // 成熟药草双帧态（:2700-2712）：18=夜绽月光草（仅夜）；90=绽放日耀花（非雨+黄昏后）
      if (frameX === 18 && ctx?.isDay === false) return [0.1, 0.4, 0.6];
      if (frameX === 90 && !ctx?.raining && (ctx?.timeOfDay ?? 0) > 0.65625) return [0.9, 0.72, 0.18];
      return null;
    }
    case 92:
      // 路灯顶行亮（frameY<=18 && frameX==0）
      return frameY <= 18 && frameX === 0 ? [1, 1, 1] : null;
    case 125: {
      // 水晶球 G/B 闪烁（:2722-2728）——R 恒 0
      const rnd = ctx?.localRand?.();
      if (!rnd) return null;
      const n = rnd.next(28, 42) * 0.01 + (270 - flicker.mouseTextColor) / 800;
      return [0, 0.3 * n, 0.6 * n];
    }
    case 129: {
      // 水晶碎晶 fx/18%3 三色（:2729-2746）
      const c = Math.floor(frameX / 18) % 3;
      if (c === 0) return [0, 0.05, 0.25];
      if (c === 1) return [0.2, 0, 0.15];
      return [0.1, 0, 0.2];
    }
    case 149: {
      // 节日灯 fx<=36 三色 × Next(970,1031)*0.001 逐通道抖动（:2752+）
      if (frameX > 36) return null;
      const rnd = ctx?.localRand?.();
      if (!rnd) return null;
      const c = Math.floor(frameX / 18);
      const base = c === 0 ? [0.1, 0.2, 0.5] : c === 1 ? [0.5, 0.1, 0.1] : [0.2, 0.5, 0.1];
      return [
        base[0] * rnd.next(970, 1031) * 0.001,
        base[1] * rnd.next(970, 1031) * 0.001,
        base[2] * rnd.next(970, 1031) * 0.001,
      ];
    }
    case 184: {
      // 苔藓植物六帧彩（cs）——110 熔岩/132 氪/154 氙/176 氩/198 氖/220 disco
      const T: Record<number, [number, number, number]> = {
        110: [0.25, 0.1, 0], 132: [0, 0.25, 0], 154: [0, 0.16, 0.34],
        176: [0.3, 0, 0.17], 198: [0.3, 0, 0.35],
      };
      if (T[frameX]) return T[frameX];
      if (frameX === 220) {
        const d = flicker.discoColor();
        return [d[0] * 0.25, d[1] * 0.25, d[2] * 0.25];
      }
      return null;
    }
    case 215: {
      // 篝火（frameY<36 门；style=frameX/54；flicker 三通道叠加，cs:689-720 附近）
      if (frameY >= 36) return null;
      const rnd = ctx?.localRand?.();
      if (!rnd) return null;
      const st = Math.floor(frameX / 54);
      let c: [number, number, number];
      if (st === 2) c = flicker.demonTorchColor();
      else if (st === 5) c = flicker.discoColor();
      else if (st === 15) c = flicker.shimmerTorchColor();
      else {
        const T: Record<number, [number, number, number]> = {
          1: [0.7, 1, 0.5], 3: [0.45, 0.75, 1], 4: [1.15, 1.15, 0.5],
          6: [0.75, 1.2824999, 1.2], 7: [0.95, 0.65, 1.3], 8: [1.4, 0.85, 0.55],
          9: [0.25, 1.3, 0.8], 10: [0.95, 0.4, 1.4], 11: [1.4, 0.7, 0.5],
          12: [1.25, 0.6, 1.2], 13: [0.75, 1.45, 0.9], 14: [0.25, 0.65, 1],
        };
        c = T[st] ?? [0.9, 0.3, 0.1];
      }
      const f = rnd.next(28, 42) * 0.005 + (270 - flicker.mouseTextColor) / 700;
      return [c[0] + f, c[1] + f, c[2] + f];
    }
    case 405: {
      // 壁炉（frameX<54 门；style=frameX/54；flicker 叠加）
      if (frameX >= 54) return null;
      const rnd = ctx?.localRand?.();
      if (!rnd) return null;
      const st = Math.floor(frameX / 54);
      let c: [number, number, number];
      if (st === 2) c = flicker.demonTorchColor();
      else if (st === 5) c = flicker.discoColor();
      else {
        const T: Record<number, [number, number, number]> = {
          1: [0.7, 1, 0.5], 3: [0.45, 0.75, 1], 4: [1.15, 1.15, 0.5],
        };
        c = T[st] ?? [0.9, 0.3, 0.1];
      }
      const f = rnd.next(28, 42) * 0.005 + (270 - flicker.mouseTextColor) / 700;
      return [c[0] + f, c[1] + f, c[2] + f];
    }
    case 316:
    case 317:
    case 318: {
      // 水母笼三色（:378-433）：笼位 = ((x-fx/18)/3)*((y-fy/18)/3) % cageFrames(25)，
      // mode==2 高亮档（FlickerClock.jellyfishCageMode 态机）
      if (!ctx) return null;
      const n19 = ctx.x - Math.floor(frameX / 18);
      const n20 = ctx.y - Math.floor(frameY / 18);
      let n21 = Math.trunc(n19 / 3) * Math.trunc(n20 / 3);
      n21 = ((n21 % 25) + 25) % 25;
      const bright = flicker.jellyfishCageMode((sheet - 316) as 0 | 1 | 2, n21) === 2;
      if (sheet === 316) return bright ? [0.2, 0.3, 0.8] : [0.1, 0.2, 0.5];
      if (sheet === 317) return bright ? [0.2, 0.7, 0.3] : [0.05, 0.45, 0.1];
      return bright ? [0.7, 0.2, 0.5] : [0.4, 0.1, 0.25];
    }
    case 350: {
      // 火星导管板呼吸（cs）：num10=tFVE*0.08；((int)(num10/6.283)%3==1) 才摆
      const n10 = flicker.timeForVisualEffects * 0.08;
      const gated = Math.floor(n10 / 6.283) % 3 === 1 ? n10 : 0;
      const v = -Math.cos(gated) * 0.1 + 0.1;
      return [v, v, v];
    }
    case 356:
      return (ctx?.sundialCooldown ?? 0) === 0 ? [0.45, 0.25, 0] : null;  // 日晷冷却门（:35-38）
    case 372:
      return frameX === 0 ? [0.9, 0.1, 0.75] : null;   // 和平蜡烛
    case 519: {
      // 香蒲 frameY==90（:519 段）：R=0.1、G=0.2+n/2、B=0.7+n
      if (frameY !== 90) return null;
      const rnd = ctx?.localRand?.();
      if (!rnd) return null;
      const n = rnd.next(28, 42) * 0.005 + (270 - flicker.mouseTextColor) / 1000;
      return [0.1, 0.2 + n / 2, 0.7 + n];
    }
    case 548: {
      // 盆栽树熔渣变体 style>=7
      return Math.floor(frameX / 54) >= 7 ? [0.7, 0.3, 0.2] : null;
    }
    case 564:
      return frameX < 36 ? [0.05, 0.3, 0.55] : null;  // 等离子灯
    case 592: {
      // 吊火盆（frameY>0 门）：基色 1.35/0.45/0.15 + flicker（cs）
      if (frameY <= 0) return null;
      const rnd = ctx?.localRand?.();
      if (!rnd) return null;
      const n = rnd.next(28, 42) * 0.005 + (270 - flicker.mouseTextColor) / 700;
      return [1.35 + n, 0.45 + n, 0.15 + n];
    }
    case 593:
      return frameX < 18 ? [0.8, 0.3, 0.1] : null;   // 小火山
    case 594:
      return frameX < 36 ? [0.8, 0.3, 0.1] : null;   // 大火山
    case 597: {
      // 村庄传送塔八样式 ×0.75（style=frameX/54，cs:597 段）
      const T: Record<number, [number, number, number]> = {
        0: [0.05, 0.8, 0.3], 1: [0.7, 0.8, 0.05], 2: [0.7, 0.5, 0.9], 3: [0.6, 0.6, 0.8],
        4: [0.4, 0.4, 1.15], 5: [0.85, 0.45, 0.1], 6: [0.8, 0.8, 1], 7: [0.5, 0.8, 1.2],
      };
      const c = T[Math.floor(frameX / 54)];
      return c ? [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75] : null;
    }
    case 620: {
      // 彩虹纱翼罐（cs:570-577）：Color(230,230,230)×hslToRgb(hourly*0.5%1,1,0.5)×0.4
      const c = flicker.hslToRgb((flicker.globalTimeWrappedHourly * 0.5) % 1, 1, 0.5);
      return [0.901961 * c[0] * 0.4, 0.901961 * c[1] * 0.4, 0.901961 * c[2] * 0.4];
    }
    case 646:
      return frameX === 0 ? [0.2, 0.3, 0.32] : null;  // 暗影蜡烛
    case 658: {
      // 微光蜡烛（:11-33）：TorchColor(23) × frameY/54 档（default 0.2 / 1→0.3 / 2→0.1）
      const t = flicker.shimmerTorchColor();
      const tier = Math.floor(frameY / 54);
      const m = tier === 1 ? 0.3 : tier === 2 ? 0.1 : 0.2;
      return [t[0] * m, t[1] * m, t[2] * m];
    }
    case 660:
      return flicker.shimmerTorchColor();             // 微光火把块
    case 659:
    case 667:
    case 708:
      // 以太块/砖/瀑布块 = GetShimmerBaseColor(x,y)（:316-318）
      return ctx ? flicker.shimmerBaseColor(ctx.x, ctx.y) : null;
    case 663:
      return (ctx?.moondialCooldown ?? 0) === 0 ? [0, 0.25, 0.45] : null;  // 月晷冷却门（:43-47）
    case 160:
    case 627:
    case 628:
    case 692: {
      // 迪斯科石/氖苔块族：Disco ×0.25
      const d = flicker.discoColor();
      return [d[0] * 0.25, d[1] * 0.25, d[2] * 0.25];
    }
    case 341: {
      // 蜥蜴能量门（cs）：demonTorch 调制
      const d = flicker.demonTorch;
      return [0.4 * d + 0.6 * (1 - d), 0.35, 1 * d + 0.6 * (1 - d)];
    }
    case 327: {
      // 熔岩装饰/火把柱族（:368-377）：n13=0.5+(270-mt)/1500+Next(0,50)*0.0005
      const rnd = ctx?.localRand?.();
      if (!rnd) return null;
      const n = 0.5 + (270 - flicker.mouseTextColor) / 1500 + rnd.next(0, 50) * 0.0005;
      return [1 * n, 0.5 * n, 0.1 * n];
    }
    case 49:
      return frameX === 0 ? [0, 0.35, 0.8] : null;   // 魔法书架
    case 95:
      return frameX < 36 ? [1, 0.95, 0.8] : null;    // 梳妆台
    case 96:
      return frameX >= 36 ? [0.5, 0.35, 0.1] : null; // 梳妆台暖档
    case 98:
      return frameY === 0 ? [1, 0.97, 0.85] : null;  // 烟囱顶
    case 235:
      return [0.6, 0.6, 0];   // 传送塔台（光地板 X/Y 抬 0.6，cs:678-686）
    case 238:
      return [0.5, 0, 0.5];   // 世纪之花球茎（光地板 X/Z 抬 0.5，cs:668-676）
    case 572: {
      // 瓶中魂六色（style=frameY/36，:603-636）
      const T: Record<number, [number, number, number]> = {
        0: [0.9, 0.5, 0.7], 1: [0.7, 0.55, 0.96], 2: [0.45, 0.96, 0.95],
        3: [0.5, 0.96, 0.62], 4: [0.47, 0.69, 0.95], 5: [0.92, 0.57, 0.51],
      };
      return T[Math.floor(frameY / 36)] ?? null;
    }
    case 717: {
      // 熔岩云（cs:527-536）：n13=(0.55+(270-mt)/800+randFloat*0.03)*0.5 → ×(1.1,0.4,0.1)
      const rnd = ctx?.localRand?.();
      if (!rnd) return null;
      const n = (0.55 + (270 - flicker.mouseTextColor) / 800 + rnd.nextFloat() * 0.03) * 0.5;
      return [n * 1.1, n * 0.4, n * 0.1];
    }
    case 718: {
      // 星云（cs:519-525）：夜且上方非实心 → 0.1+disco/800+randFloat*0.04
      if (ctx?.isDay !== false || !ctx.st) return null;
      const d = flicker.discoColor();
      const rnd = ctx.localRand?.();
      if (!rnd) return null;
      const above = ctx.y - 1;
      if (!ctx.st.inBounds(ctx.x, above)) return null;
      const ai = ctx.st.idx(ctx.x, above);
      const ad = TILE_DEFS[ctx.st.type[ai]];
      const solid3 = ctx.st.type[ai] !== 0 && (ad?.solid ?? false) && !ad?.platform;
      if (solid3) return null;   // WorldGen.SolidTile3
      return [
        rnd.nextFloat() * 0.04 + 0.1 + (d[0] * 255) / 800,
        rnd.nextFloat() * 0.04 + 0.1 + (d[1] * 255) / 800,
        rnd.nextFloat() * 0.04 + 0.1 + (d[2] * 255) / 800,
      ];
    }
    case 719: {
      // 传送塔彩虹云（:435-517）：(x+y+floor(hourly*15))%14 十四色轮转
      if (!ctx) return null;
      const n15 = (ctx.x + ctx.y + Math.floor(flicker.globalTimeWrappedHourly * 15)) % 14;
      const T: Array<[number, number, number]> = [
        [255, 171, 183], [255, 170, 220], [252, 171, 255], [224, 171, 255],
        [192, 171, 255], [174, 178, 255], [168, 195, 255], [167, 224, 255],
        [168, 255, 252], [162, 255, 233], [158, 255, 198], [207, 255, 173],
        [255, 213, 186], [255, 192, 182],
      ];
      const c = T[n15];
      return [c[0] / 255, c[1] / 255, c[2] / 255];
    }
    default:
      return null;
  }
}

export class TileLightScanner {
  private blocksLight: Uint8Array;
  private random = new FastRandom(0x9e3779b9);
  /** 每格局部随机(WithModifier(x,y);蜡烛闪烁) */
  private localRandom(x: number, y: number): FastRandom {
    return this.random.withModifier((y * 2654435761 + x) | 0);
  }

  constructor(private flicker: FlickerClock) {
    // 从 TILE_DEFS 派生 tileBlockLight 近似(原版 Main.tileBlockLight[]):
    // 实心且近乎不透明才挡光——门(0.05)/平台(0.15)/树(0.1)/装饰(0.05)均不挡
    this.blocksLight = new Uint8Array(TILE_DEFS.length);
    TILE_DEFS.forEach((d, i) => {
      if (d && d.solid && !d.platform && d.opacity >= 0.9) this.blocksLight[i] = 1;
    });
  }

  /** GetTileMask(:68-87) */
  getMask(st: TileStore, i: number): Mask {
    const type = st.type[i];
    const actuated = (st.wire[i] & TileStore.WIRE_ACTUATED) !== 0;
    if (type !== 0 && !actuated && this.blocksLight[type] && st.slope[i] === 0) {
      // 注意 actuated 已在上条件排除(原版 !tile.inActive())
      const sheet = TILE_DEFS[type]?.vanilla?.sheet ?? -1;
      return CRACKED_SHEETS.has(sheet) ? Mask.CrackedBricks : Mask.Solid;
    }
    if (st.liquidType[i] !== 2 && st.liquid[i] > 128) { // 岩浆 mask=None 只发光
      return st.liquidType[i] === 3 ? Mask.Honey : Mask.Water;
    }
    return Mask.None;
  }

  /** 该格是否暴露于"天空/地狱光"(ApplySurfaceLight :3170 / ApplyHellLight :3270
   *  同构判定)。放行 = 满足下列任一 + 墙透光：
   *    ① 非活动(空气/水) 或 非挡阳类型；② 坡面/半砖 且【四邻液量全为 0】
   *  ——挡阳实心格（海底泥沙等）恒不放行：深水下海底不播天光，亮度只经水层
   *  传播衰减而来。此前误植为"自身 liquid>=200 才挡"= 海底方块自身无液被放行
   *  → 水底地面满天光自发光 */
  private exposed(st: TileStore, x: number, y: number): boolean {
    const i = st.idx(x, y);
    const type = st.type[i];
    if (type !== 0) {
      const actuated = (st.wire[i] & TileStore.WIRE_ACTUATED) !== 0;
      // AllowLightInWater（TileID.cs:359：玻璃 54/回声 541/彩纸 328/降雪 459/
      // 水族馆 748/尖刺 750）——水中也透天光（:3161 独立分支）
      const sheet = TILE_DEFS[type]?.vanilla?.sheet ?? -1;
      if (sheet === 54 || sheet === 541 || sheet === 328 || sheet === 459 || sheet === 748 || sheet === 750) {
        // 落到墙透光判定（原版此分支同样要求 wallLight）
      } else if (!actuated && this.blocksLight[type]) {
        if (st.slope[i] === 0 && st.half[i] === 0) return false;
        // 坡面/半砖例外：四邻必须全干（:3170 第三析取支的邻格 liquid==0）
        if (st.liquid[st.idx(x, y - 1)] !== 0 || st.liquid[st.idx(x, y + 1)] !== 0
          || st.liquid[st.idx(x - 1, y)] !== 0 || st.liquid[st.idx(x + 1, y)] !== 0) return false;
      }
    }
    const wall = st.wall[i];
    return wall === 0 || WALL_LIGHT.has(wall);
  }

  /** ExportTo(:17-43)+ GetTileLight(:89-108):向工作图播种 mask 与颜色 */
  exportTo(w: ScannerWorld, map: LightMap, rx: number, ry: number, perFrame: PerFrameLight[]): void {
        this.random.reseed(); // Update() :58-61 每周期换种子（恢复真闪烁）
    const st = w.store;
    map.clear();
    const [skyR, skyG, skyB] = skySeed(w.clock.timeOfDay, w.clock.dayCount, !!w.clock.eclipse,
      !!(w.clock as { bloodMoon?: boolean }).bloodMoon,
      (w.clock as { moonPhase?: number }).moonPhase);
    // 地狱脉动(ApplyHellLight:3266-3271)
    const hellV = 0.55 + Math.sin(performance.now() * 0.002) * 0.08; // GlobalTimeWrappedHourly 近似
    const hellR = hellV, hellG = hellV * 0.6, hellB = hellV * 0.2;
    // 岩浆闪烁基础(ApplyLiquidLight:118-131)
    const lavaV = 0.55 + (270 - this.flicker.mouseTextColor) / 900;
    const osc = this.flicker.mouseTextColor;

    for (let ly = 0; ly < map.h; ly++) {
      const ty = ry + ly;
      for (let lx = 0; lx < map.w; lx++) {
        const tx = rx + lx;
        if (tx < 1 || ty < 1 || tx >= st.w - 1 || ty >= st.h - 1) continue; // InWorld(x,y,1)
        const i = st.idx(tx, ty);
        const li = ly * map.w + lx;
        map.mask[li] = this.getMask(st, i);

        let lr = 0, lg = 0, lb = 0;
        // ★ 深度门 liquid<200（ApplySurfaceLight :3172 / ApplyHellLight :3270）：
        //   仅液量 <200（表面 ~4/5 格）播满天空/地狱光；深层液体不播——亮度靠
        //   表层向深水传播（水衰减逐格 0.88×0.91 系）→ 水体越深越暗。此前漏此门
        //   整个水柱每层播满 = 深水自发光
        const shallowLiquid = st.liquid[i] < 200;
        // ① 天空 / 地狱(:94-101)
        if (ty <= w.groundLevel) {
          if (shallowLiquid && this.exposed(st, tx, ty)) { lr = skyR; lg = skyG; lb = skyB; }
        } else if (ty > w.lavaLine) {
          if (shallowLiquid && this.exposed(st, tx, ty)) { lr = Math.max(lr, hellR); lg = Math.max(lg, hellG); lb = Math.max(lb, hellB); }
        }
        // ② 发光墙(:102;大多要求 !LightIsBlocked——此处墙在实心块后不可见,实心格直接跳过)
        const wall = st.wall[i];
        if (wall !== 0 && st.type[i] === 0) {
          const we = WALL_EMISSIVE[wall];
          if (we) { lr = Math.max(lr, we[0]); lg = Math.max(lg, we[1]); lb = Math.max(lb, we[2]); }
        }
        // 彩色玻璃墙（ApplySurfaceLight :3190-3242）——★乘区语义 1:1：原版先
        // `num=num4`（回到天空分量）再逐通道乘染色系数；门 = (!active||半砖||!挡阳)
        // && liquid<255——半砖/平台后的玻璃墙同样染色（故独立于上方 type==0 门）。
        // 彩虹档（wall-88==5）= (0.7-0.2) + Disco/255×0.2 动态乘区。
        // 非暴露格天空分量恒 0 → 乘后仍 0（与原版一致），后续发光 max-raise 照常叠加
        if (((wall >= 88 && wall <= 93) || wall === 241) && st.liquid[i] < 255) {
          const t = st.type[i];
          const td = TILE_DEFS[t];
          const tileOk = t === 0 || st.half[i] !== 0 || !(td && td.solid && !td.platform && td.opacity >= 0.9);
          if (tileOk) {
            const k = wall === 241 ? 6 : wall - 88;
            const TINT: Array<[number, number, number]> = [
              [0.9, 0.15, 0.9], [0.9, 0.9, 0.15], [0.15, 0.15, 0.9], [0.15, 0.9, 0.15],
              [0.9, 0.15, 0.15], [0, 0, 0], [0.9, 0.5, 0],
            ];
            // 原版 switch：0 紫(0.9,0.15,0.9) 1 黄(0.9,0.9,0.15) 2 蓝(0.15,0.15,0.9)
            // 3 绿(0.15,0.9,0.15) 4 红(0.9,0.15,0.15) 5 彩虹(动态) 6 橙(0.9,0.5,0)
            let tint: [number, number, number];
            if (k === 5) {
              const dc = this.flicker.discoColor();  // Main.Disco 轮转（:3229-3233）
              tint = [0.5 + dc[0] * 0.2, 0.5 + dc[1] * 0.2, 0.5 + dc[2] * 0.2];
            } else tint = TINT[k];
            lr *= tint[0]; lg *= tint[1]; lb *= tint[2];
          }
        }
        // ③ 发光 tile(:103-106)
        const type = st.type[i];
        // ★原版门是 tile.active()（:103）——致动只置 inActive 不清 type → 致动火把/
        // 蜡烛仍发光；曾加 !actuated 门致致动即熄灭
        if (type !== 0) {
          const d = TILE_DEFS[type];
          const sheet = d?.vanilla?.sheet ?? -1;
          // 蘑菇雕像 349 门控(:2940):frameX<36 的 style 完全不发光——
          // 同时压制组公式与 def.light 静态兜底,故提到入口处判
          const shroomGateOk = !(sheet === 349 && st.frameX[i] < 36);
          if (d && (d.light || MUSHROOM_GLOW_SHEETS.has(sheet)) && shroomGateOk) {
            // 接线灯门控:关帧不发光(LIGHT_TOGGLE)
            const on = sheet < 0 || lightIsOn(sheet, st.frameX[i], st.frameY[i]);
            if (on) {
              let er: number, eg: number, eb: number;
              if (sheet === 4) {
                // 火把:24 色动态(TorchID;frameY/22 = style)
                const style = Math.floor(st.frameY[i] / 22) % 24;
                if (style === 7) [er, eg, eb] = this.flicker.demonTorchColor();
                else if (style === 14) [er, eg, eb] = this.flicker.discoColor();
                else if (style === 23) [er, eg, eb] = this.flicker.shimmerTorchColor();
                else {
                  const c = TORCH_COLORS[style] ?? TORCH_COLORS[0];
                  [er, eg, eb] = c;
                }
                // ★火把原版无闪烁（:1536-1542 纯 TorchColor）——曾误加 /700 系
                // 抬亮 0.16~0.32（照明半径 +3 格）
              } else if (MUSHROOM_GLOW_SHEETS.has(sheet)) {
                // 蘑菇组发光（TileLightScanner.cs:2938-2960 case 70/71/72/190/348/349/528/578）：
                //   R=0、B=1，G=0.2+num11/2；num11=Next(28,42)*0.005+(270-mouseTextColor)/1000
                //   ——只抬 G（与 FLICKER_SHEETS 的三通道叠加不同）
                const num11 = this.localRandom(tx, ty).next(28, 42) * 0.005 + (270 - osc) / 1000;
                er = 0; eg = 0.2 + num11 / 2; eb = 1;
              } else {
                er = d.light![0] / 255; eg = d.light![1] / 255; eb = d.light![2] / 255;
                if (FLICKER_SHEETS.has(sheet)) {
                  const f = this.localRandom(tx, ty).next(28, 42) * 0.005 + (270 - osc) / 700;
                  er += f; eg += f; eb += f;
                }
              }
              lr = Math.max(lr, er); lg = Math.max(lg, eg); lb = Math.max(lb, eb);
            }
          }
          // ③b 动态发光特例（原版 ApplyTileLight 帧条件/动态色 case，def.light 静态表无法表达）
          const spSheet = d?.vanilla?.sheet ?? -1;
          const sp = specialTileLight(spSheet, st.frameX[i], st.frameY[i], this.flicker, {
            x: tx, y: ty,
            st,
            localRand: () => this.localRandom(tx, ty),
            sundialCooldown: (w as { sundialCooldown?: number }).sundialCooldown,
            moondialCooldown: (w as { moondialCooldown?: number }).moondialCooldown,
            isDay: (w.clock as { isDay?: boolean }).isDay,
            raining: !!(w as { weather?: { raining?: boolean } }).weather?.raining,
            timeOfDay: w.clock.timeOfDay,
          });
          if (sp) {
            lr = Math.max(lr, sp[0]); lg = Math.max(lg, sp[1]); lb = Math.max(lb, sp[2]);
          }
        }
        // ④ 液体光(:107-151)：岩浆（:116-131 num=0.55+(270-mt)/900）与
        //    微光（:133-151 num2/num3 双通道）发光，水/蜂蜜不发光
        if (st.liquid[i] > 0 && st.liquidType[i] === 4) {
          // 微光液体（ApplyLiquidLight:133-151）：R=0.6num2、G=0.25num3、B=0.9num2
          const n2 = 0.7 + (270 - osc) / 900;
          const n3 = 0.7 + (270 - osc) / 125;
          lr = Math.max(lr, n2 * 0.6); lg = Math.max(lg, n3 * 0.25); lb = Math.max(lb, n2 * 0.9);
        } else if (st.liquid[i] > 0 && st.liquidType[i] === 2) {
          lr = Math.max(lr, lavaV); lg = Math.max(lg, lavaV * 0.6); lb = Math.max(lb, lavaV * 0.2);
        }
        map.r[li] = lr; map.g[li] = lg; map.b[li] = lb;
      }
    }
    // ⑤ 动态点光(ApplyPerFrameLights:204-227;区域内 max 合并)
    for (const l of perFrame) {
      const lx = l.x - rx, ly = l.y - ry;
      if (lx < 0 || ly < 0 || lx >= map.w || ly >= map.h) continue;
      const li = ly * map.w + lx;
      if (l.r > map.r[li]) map.r[li] = l.r;
      if (l.g > map.g[li]) map.g[li] = l.g;
      if (l.b > map.b[li]) map.b[li] = l.b;
    }
  }
}
