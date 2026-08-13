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

/** paint id → RGB 预展开表（paintColor 的数组直查版，热循环用；下标 0-31） */
export const PAINT_RGB: ReadonlyArray<readonly [number, number, number]> = (() => {
  const t: Array<readonly [number, number, number]> = [];
  for (let i = 0; i <= PAINT_MAX; i++) {
    const [r, g, b] = paintColor(i);
    t.push([r, g, b]);
  }
  return t;
})();

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

// ===================== 渲染消费（Canvas 2D 消费原版 paintColor 表） =====================

/**
 * 油漆乘色：把 tile 原色 (r,g,b) 按 paint id 调制，返回新的 [r,g,b]。
 *
 * 原版 tile 绘制走 GPU shader（TilePaintSystemV2.cs:69-82 PrepareShader →
 * Main.tileShader 按 ConvertPaintIdToTileShaderIndex（Main.cs:58064-58083）选 pass）。
 * pass 内混合系数在编译 effect（游戏资源 TileShader.cso，DXBC）里，反编译 C# 不可见；
 * Canvas 2D 无 shader，此处按通行的乘色模型逐通道调制：
 *   - 普通漆 1-12 / 黑 25 / 灰 27 / 棕 28 / 暗影 29：c' = c * p / 255（逐通道乘色）
 *   - 白漆 26：不调制（乘 255 ≡ 原色）
 *   - 负相 30：负片 c' = 255 - c（半透明 alpha 只参与尘/地图，不参与 tile 乘色）
 *
 * ★ 等价边界（登记）：深层漆 13-24 与浅层 1-12 在 WorldGen.paintColor（:43948-44061）
 *   同 RGB——原版差异只在 shader pass 序号（Main.cs:58064-58077 直接映射 1-27）。
 *   pass 内系数不可得 → 本仓深层漆渲染等价于浅层（数据 1:1，渲染强度未差异化）。
 *   涂层（paintCoating 1/2 → fullbright/invisible 位）系统未建，另行登记。
 */
export function applyPaintTint(
  r: number, g: number, b: number, paint: number,
): readonly [number, number, number] {
  if (paint <= 0) return [r, g, b];
  if (paint === 26) return [r, g, b];                   // 白漆：乘 255 ≡ 原色
  if (paint === 30) return [255 - r, 255 - g, 255 - b]; // 负相：反转
  const [pr, pg, pb] = paintColor(paint);
  // 逐通道乘色（除 26/30 外全部走此式：1-24 浅/深层 + 25/27/28/29 黑灰棕暗影）
  return [(r * pr) >> 8, (g * pg) >> 8, (b * pb) >> 8];
}

/**
 * 小地图油漆换色（Terraria.Map/MapHelper.cs:1812-1863 MapColor 逐行 1:1）。
 * isWall = 该 map 条目是墙（原版以 type ∈ [wallRangeStart, wallRangeEnd] 判定，:1841）。
 * 注意 num3 经两次交换后是【中间通道】而非最小（:1818-1829 交换序）。
 */
export function mapPaintColor(
  isWall: boolean, rgb: readonly [number, number, number], colorType: number,
): readonly [number, number, number] {
  const color = paintColor(colorType); // :1814
  let num = rgb[0] / 255, num2 = rgb[1] / 255, num3 = rgb[2] / 255; // :1815-1817
  if (num2 > num) { const t = num; num = num2; num2 = t; } // :1818-1823
  if (num3 > num) { const t = num; num = num3; num3 = t; } // :1824-1829
  let or_ = rgb[0], og = rgb[1], ob = rgb[2];
  switch (colorType) {
    case 29: { // ShadowPaint :1832-1839
      const num7 = num3 * 0.3;
      or_ = (color[0] * num7) | 0; og = (color[1] * num7) | 0; ob = (color[2] * num7) | 0;
      break;
    }
    case 30: // NegativePaint :1840-1853
      if (isWall) {
        or_ = ((255 - rgb[0]) * 0.5) | 0; og = ((255 - rgb[1]) * 0.5) | 0; ob = ((255 - rgb[2]) * 0.5) | 0;
      } else {
        or_ = 255 - rgb[0]; og = 255 - rgb[1]; ob = 255 - rgb[2];
      }
      break;
    default: { // 普通漆/深层/黑白灰棕 :1854-1861——按最大通道缩放油漆色
      const num6 = num;
      or_ = (color[0] * num6) | 0; og = (color[1] * num6) | 0; ob = (color[2] * num6) | 0;
      break;
    }
  }
  return [or_, og, ob];
}

/** paint id → css 颜色（小地图 LUT / 调试用） */
export function paintCss(paint: number): string {
  const [r, g, b] = paintColor(paint);
  return `rgb(${r},${g},${b})`;
}

// ===================== 涂刷原语（WorldGen.cs 1:1） =====================

/** paintEffect（WorldGen.cs:44091-44112）的尘效钩子：newPaint==0 时用 oldColor 取色。
 *  实现：10 颗尘（DustID 143），一半 noGravity scale*1.2、一半 scale*0.5。
 *  Game 侧接 spawnParticles；null = 无尘（测试/生成期） */
export type PaintDustHook = (x: number, y: number, newPaint: number, oldPaint: number) => void;

export interface PaintableStore {
  paint: Uint8Array;
  paintWall: Uint8Array;
  wall: Uint16Array;
  flags: Uint8Array;
  setPaint(x: number, y: number, v: number): void;
  setPaintWall(x: number, y: number, v: number): void;
  inBounds(x: number, y: number): boolean;
  idx(x: number, y: number): number;
}

/**
 * WorldGen.paintTile（WorldGen.cs:44137-44159）逐行 1:1：
 * 非活性格 / 已同色 → false（不消耗油漆，Player.ApplyPaint :41357 同守卫）；
 * 尘效先于写入（:44149-44152），写 color 后广播（单机无 netMode）。
 */
export function paintTile(
  st: PaintableStore, x: number, y: number, color: number, dust: PaintDustHook | null = null,
): boolean {
  if (!st.inBounds(x, y)) return false; // Main.tile[x,y] 越界等价（C# null 检查）
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;                 // :44140 !tile.active()
  const b = st.paint[i];                          // :44144 tile.color()
  if (b === color) return false;                  // :44145-44148
  if (dust) dust(x, y, color, b);                 // :44149-44152 paintEffect
  st.setPaint(x, y, color);                       // :44153 tile.color(color)
  return true;
}

/** WorldGen.paintWall（WorldGen.cs:44257-44279）逐行 1:1（写入先于尘效，与 paintTile 反序） */
export function paintWall(
  st: PaintableStore, x: number, y: number, color: number, dust: PaintDustHook | null = null,
): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (st.wall[i] === 0) return false;             // :44260 tile.wall == 0
  const b = st.paintWall[i];                      // :44264 tile.wallColor()
  if (b === color) return false;                  // :44265-44268
  st.setPaintWall(x, y, color);                   // :44269 tile.wallColor(color)
  if (dust) dust(x, y, color, b);                 // :44274-44277 paintEffect
  return true;
}

/** paintEffect（WorldGen.cs:44091-44112）：色 0 时回退旧色取 dust 色 */
export function paintDustColor(newPaint: number, oldPaint: number): readonly [number, number, number, number] {
  return paintColor(newPaint === 0 ? oldPaint : newPaint); // :44093-44097
}
