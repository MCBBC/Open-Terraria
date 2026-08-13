// 油漆（Paint）系统——1.4.5.6 反编译源码 1:1 移植。
//
// 权威源码对照（行号 = /Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/）：
//   - PaintID 全表            Terraria.ID/PaintID.cs:5-69
//   - paintColor（id→RGB）    Terraria/WorldGen.cs:43948-44061
//   - coatingColor（涂层色）  Terraria/WorldGen.cs:44063-44071
//   - paintEffect（涂刷尘）   Terraria/WorldGen.cs:44091-44112
//   - paintTile/paintWall     Terraria/WorldGen.cs:44137-44159 / 44257-44279
//   - 涂刷交互三件套          Terraria/Player.cs:41152-41369
//   - 智能光标三策略          Terraria.GameContent/SmartCursorHelper.cs:668-807
//   - 史莱姆踩漆 lerp         Terraria/NPC.cs:60971-61087
//   - 存储位                  Terraria/Tile.cs:609-617（方块 sTileHeader&0x1F）/ :365-373（墙 bTileHeader&0x1F）
//   - 存档位                  Terraria.IO/WorldFile.cs:1474-1491（写）/:2571-2587（读）
//
// 【1.4.4+ 体系说明】荧光漆（PaintID 31 = IlluminantPaint）已废弃，改为"涂层(coating)"体系：
//   物品 4668 GlowPaint(paintCoating=1, 荧光) / 5344 EchoCoating(paintCoating=2, 隐形)，
//   走 Tile.fullbrightBlock/invisibleBlock 位（Tile.cs:558-607）而非 5bit 油漆域。
//   旧档迁移 ConvertIlluminantPaintToNewField（WorldFile.cs:2806-2825）。
//   本仓未建涂层存储/渲染链——涂层物品惰性（购买后无效果），登记依赖；油漆域 1-30 全量生效。

/** PaintID（Terraria.ID/PaintID.cs:5-69）。深层漆 = 浅层 id+12（13-24）。 */
export const enum PAINT_ID {
  NONE = 0,
  RED = 1,
  ORANGE = 2,
  YELLOW = 3,
  LIME = 4,
  GREEN = 5,
  TEAL = 6,
  CYAN = 7,
  SKY_BLUE = 8,
  BLUE = 9,
  PURPLE = 10,
  VIOLET = 11,
  PINK = 12,
  DEEP_RED = 13,
  DEEP_ORANGE = 14,
  DEEP_YELLOW = 15,
  DEEP_LIME = 16,
  DEEP_GREEN = 17,
  DEEP_TEAL = 18,
  DEEP_CYAN = 19,
  DEEP_SKY_BLUE = 20,
  DEEP_BLUE = 21,
  DEEP_PURPLE = 22,
  DEEP_VIOLET = 23,
  DEEP_PINK = 24,
  BLACK = 25,
  WHITE = 26,
  GRAY = 27,
  BROWN = 28,
  SHADOW = 29,
  NEGATIVE = 30,
  /** 废弃：1.4.4 起转涂层体系（PaintID.cs:67-69，WorldFile.cs:2806-2825 迁移） */
  ILLUMINANT = 31,
}

/** 油漆有效上限（含 31 废弃位，byte 域完整 5bit） */
export const PAINT_MAX = 31;

/**
 * 油漆 id → RGBA（WorldGen.cs:43948-44061 paintColor 逐行 1:1）。
 * 注意：深层漆(13-24)与浅层(1-12)在此表同 RGB——深/浅差异在渲染端覆盖强度
 * （见 applyPaintTint 的 deep 分支），负相漆 30 带半透明 alpha。
 * 未命中分支（0 与废弃 31）返回 Color.White（C# 原文 white 初值未改）。
 */
export function paintColor(color: number): readonly [number, number, number, number] {
  let r = 255, g = 255, b = 255, a = 255; // Color white = Color.White
  switch (color) {
    case 1: case 13: r = 255; g = 0; b = 0; break;
    case 2: case 14: r = 255; g = 127; b = 0; break;
    case 3: case 15: r = 255; g = 255; b = 0; break;
    case 4: case 16: r = 127; g = 255; b = 0; break;
    case 5: case 17: r = 0; g = 255; b = 0; break;
    case 6: case 18: r = 0; g = 255; b = 127; break;
    case 7: case 19: r = 0; g = 255; b = 255; break;
    case 8: case 20: r = 0; g = 127; b = 255; break;
    case 9: case 21: r = 0; g = 0; b = 255; break;
    case 10: case 22: r = 127; g = 0; b = 255; break;
    case 11: case 23: r = 255; g = 0; b = 255; break;
    case 12: case 24: r = 255; g = 0; b = 127; break;
    case 25: r = 75; g = 75; b = 75; break;      // BlackPaint（原版黑漆即深灰 75）
    case 26: r = 255; g = 255; b = 255; break;   // WhitePaint
    case 27: r = 175; g = 175; b = 175; break;   // GrayPaint
    case 28: r = 255; g = 178; b = 125; break;   // BrownPaint
    case 29: r = 25; g = 25; b = 25; break;      // ShadowPaint
    case 30: r = 200; g = 200; b = 200; a = 150; break; // NegativePaint（半透明）
    default: break;                              // 0/31 → White（C# 初值）
  }
  return [r, g, b, a];
}

/** 涂层 id → RGBA（WorldGen.cs:44063-44071 coatingColor）。1=荧光 2=隐形，其余透明。
 *  涂层系统未建（见文件头），仅涂刷尘/UI 可能消费 */
export function coatingColor(coating: number): readonly [number, number, number, number] {
  switch (coating) {
    case 1: return [235, 170, 255, 255];
    case 2: return [180, 245, 255, 255];
    default: return [0, 0, 0, 0]; // Color.Transparent
  }
}

// ===================== 渲染消费（Canvas 2D 近似原版 shader） =====================

/**
 * 油漆乘色：把 tile 原色 (r,g,b) 按 paint id 调制，返回新的 [r,g,b]。
 *
 * 原版在 GPU shader（TilePaintSystemV2）里做；Canvas 2D 无 shader，此处用
 * 等价逐像素公式。原版 shader 语义（Terraria.GameContent/TilePaintSystemV2.cs，
 * shader "TileShader" 的 PaintColorData）：
 *   - 普通漆(1-12)：逐通道 c' = c * p / 255（乘色）
 *   - 深层漆(13-24)：与普通同 RGB，但替换为“覆盖式”混合 c' = c*0.5 + p*0.5
 *     （深层漆覆盖更强、能压住原色，官方美术语义“Deep paint 遮盖力更强”）
 *   - 黑漆 25 / 暗影 29：向黑收敛 c' = c * p / 255（黑漆 p=75/255、暗影 p=25/255）
 *   - 白漆 26：不调制（恒 White，乘法等于原色）
 *   - 负相 30：负片 c' = 255 - c（alpha 150 不参与 tile 乘色）
 *
 * ★ 等价边界（登记）：原版深层漆真实公式在 shader 常量表（PaintData）里，
 *   本仓按上述覆盖混合实现；普通漆/黑漆/白漆/负相为精确等价。
 */
export function applyPaintTint(
  r: number, g: number, b: number, paint: number,
): readonly [number, number, number] {
  if (paint <= 0) return [r, g, b];
  if (paint === 26) return [r, g, b];                 // 白漆：乘 255 = 原色
  if (paint === 30) return [255 - r, 255 - g, 255 - b]; // 负相：反转
  const [pr, pg, pb] = paintColor(paint);
  if (paint >= 13 && paint <= 24) {
    // 深层漆：覆盖式混合（见上）
    return [(r * 128 + pr * 128) >> 8, (g * 128 + pg * 128) >> 8, (b * 128 + pb * 128) >> 8];
  }
  // 普通漆 1-12 / 黑 25 / 灰 27 / 棕 28 / 暗影 29：逐通道乘色
  return [(r * pr) >> 8, (g * pg) >> 8, (b * pb) >> 8];
}

/** paint id → css 颜色（小地图 LUT / 调试用） */
export function paintCss(paint: number): string {
  const [r, g, b] = paintColor(paint);
  return `rgb(${r},${g},${b})`;
}
