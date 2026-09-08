// 生成期世界预览（GenWorldPreview / worker previewBitmap 共用）的 tile→RGB 逻辑。
// 返回 0xRRGGBB（字符串 hex 在热循环里太慢）。
// 注意：游戏内小地图（Renderer.colorFor/redrawAll LUT）是独立实现，未走本函数——
// 两份语义需保持一致（活性 tile > 液体 >32 > 墙 > 天空, MapHelper.cs GetWallType）。
// ★IIIII218（2026-09-08）预览↔游戏内地图色差定谳：天顶（tenthAnniversary→
// FinishTenthAnniversaryWorld）给地牢 41/43/44/677-679/48/487、神庙 226/61+墙87、
// 金字塔 151+墙34、云/沙/活树全图上漆（FinalCleanupPass paintThe*Tenth），游戏内
// 小地图走 mapPaintColor 而预览漏漆 ⇒ 地牢/金字塔/神庙双路径颜色不一致——本表补漆
// （MapHelper.cs:1812-1863 MapColor 单源 mapPaintColor，豁免面与 colorFor 同构）。
import { TILE_DEFS, WALL_DEFS , TILE_BY_KEY } from '../data/tiles';
import {
  vanillaTileMapColor, vanillaWallMapColor, vanillaLiquidColor,
  vanillaSkyColor, VANILLA_DIRT_BG, VANILLA_ROCK_BG,
} from '../data/vanillaMapColors';
import { mapPaintColor } from '../world/Paint';
import type { TileStore } from '../world/TileStore';

function hexToRgb24(hex: string | undefined, fallback: number): number {
  if (!hex || hex[0] !== '#') return fallback;
  const v = parseInt(hex.slice(1, 7), 16);
  return Number.isFinite(v) ? v : fallback;
}

// 预解析颜色表（id → 0xRRGGBB）
const TILE_COLORS = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  if (TILE_DEFS[i]) TILE_COLORS.set(i, hexToRgb24(TILE_DEFS[i].mapColor, 0x808080));
}
const WALL_COLORS = new Map<number, number>();
for (let i = 0; i < WALL_DEFS.length; i++) {
  if (WALL_DEFS[i]) WALL_COLORS.set(i, hexToRgb24(WALL_DEFS[i].mapColor, 0x2e2e2e));
}

const UNKNOWN = 0x808080;
const UNKNOWN_WALL = 0x2e2e2e;

// 原版地图色（MapHelper.cs 全表，tools/extract-mapcolors.mjs）：
// tile 按 vanilla.sheet / 墙按原版 id 直查；液体四色；背景天空渐变/土层/石层
const pack = (c: readonly number[]): number => (c[0] << 16) | (c[1] << 8) | c[2];
const liqColor = (lt: number): number => pack(vanillaLiquidColor(lt >= 1 && lt <= 4 ? lt - 1 : 0));

/** 漆豁免面（Renderer.colorFor 同构；MapHelper.cs:1963-2005）：
 *  tile sheet 160=RainbowBrick 恒忽略漆（GetTileType `if (num == 160) newColor = 0`）；
 *  墙 21/88-93/168/241（GetWallType newColor=0 表） */
const MAP_TILE_NO_PAINT_SHEET = 160;
const MAP_WALL_NO_PAINT = new Set([21, 88, 89, 90, 91, 92, 93, 168, 241]);

/** tile → 0xRRGGBB。优先级：活性 tile > 液体 > 墙 > 背景（MapHelper 模型）。
 *  必须判 flags（=原版 tile.active()）：生成期 TileRunner 会在空气格写"幽灵 type"
 *  （原版 1:1 语义，数据层保留、finalize 净化）——不判 flags 会把幽灵画成实体，
 *  生成预览的天空就是被它们显形成"杂块"（游戏内渲染 ChunkCache 已判 flags）。
 *  bg：世界面上下文（tile 单位）——与游戏内小地图 Renderer.colorFor 尾段同式
 *  （MapHelper.cs GetBackgroundType :2020-2077）：
 *    y<groundLevel → remix ? mapType100(73,120,17) : 天空渐变（remix 分支
 *      cs:2025-2028 `if (Main.remixWorld) { newLight=5; return 100; }`——mapType100
 *      = colorLookup[100] = tile 80 仙人掌 option0 色，原版硬编码怪癖）；
 *    y<lavaLine(地狱顶) → 土层底/石层底；其余 → 地狱底 (50,44,38)（color11）。
 *    缺省 = 浅蓝兜底（无世界面早期）。
 *  ★漆（IIIII218）：tile paint / wall paint 经 mapPaintColor 换色（MapHelper.MapColor
 *  :1812-1863 逐行 1:1，与游戏内 colorFor/fillBand 同一单源）——豁免面见上。 */
export function mapColor24(st: TileStore, x: number, y: number,
  bg?: { groundLevel: number; rockLevel: number; underworld?: number; remix?: boolean }): number {
  const i = st.idx(x, y);
  const t = st.flags[i] ? st.type[i] : 0;
  if (t !== 0) {
    // 自研像素方块（F2 图片导入）：RGB 编码在 frameX/Y（r<<8|g, b）——按原像素色显示
    const PIX = TILE_BY_KEY['pixel_block'];
    if (PIX !== undefined && t === PIX) {
      const fx = st.frameX[i], fy = st.frameY[i];
      return ((fx >> 8) << 16) | ((fx & 255) << 8) | fy;
    }
    // 原版色优先（sheet 直查）；legacy def 回落 mapColor
    const sheet = TILE_DEFS[t]?.vanilla?.sheet;
    const p = st.paint[i];
    if (sheet !== undefined) {
      const vc = vanillaTileMapColor(sheet);
      if (vc) {
        if (p > 0 && sheet !== MAP_TILE_NO_PAINT_SHEET) return pack(mapPaintColor(false, [vc[0], vc[1], vc[2]], p));
        return pack(vc);
      }
    }
    const c0 = TILE_COLORS.get(t);
    const c = c0 !== undefined ? c0 : UNKNOWN;
    if (p > 0 && sheet !== MAP_TILE_NO_PAINT_SHEET) {
      return pack(mapPaintColor(false, [(c >> 16) & 255, (c >> 8) & 255, c & 255], p));
    }
    return c;
  }
  if (st.liquid[i] > 32) return liqColor(st.liquidType[i]);
  const w = st.wall[i];
  if (w !== 0) {
    const pw = st.paintWall[i];
    const vc = vanillaWallMapColor(w);
    if (vc) {
      if (pw > 0 && !MAP_WALL_NO_PAINT.has(w)) return pack(mapPaintColor(true, [vc[0], vc[1], vc[2]], pw));
      return pack(vc);
    }
    const c0 = WALL_COLORS.get(w);
    if (c0 !== undefined) {
      if (pw > 0 && !MAP_WALL_NO_PAINT.has(w)) {
        return pack(mapPaintColor(true, [(c0 >> 16) & 255, (c0 >> 8) & 255, c0 & 255], pw));
      }
      return c0;
    }
    return UNKNOWN_WALL;
  }
  // 背景：remix 上表 / 天空渐变 / 土层底 / 石层底 / 地狱底（MapHelper GetBackgroundType；
  // 无世界面时浅蓝兜底）。地狱底：原版 hellPosition 单色 (50,44,38)，不是石层底
  if (bg && bg.groundLevel > 0) {
    if (y < bg.groundLevel) {
      if (bg.remix) return REMIX_MAP_BG;
      return pack(vanillaSkyColor(y, bg.groundLevel));
    }
    const underworld = bg.underworld ?? 0;
    if (underworld > 0 && y >= underworld) return VANILLA_HELL_BG_PACKED;
    if (y < bg.rockLevel) return pack(VANILLA_DIRT_BG);
    return pack(VANILLA_ROCK_BG);
  }
  return SKY_FALLBACK;
}
const SKY_FALLBACK = 0x91b9ff; // vanillaSkyColor(浅 y) 近似（生成预览无世界面时的兜底）
/** remix 上表 mapType100（GetBackgroundType cs:2025-2028 `return 100` →
 *  colorLookup[100] = tileLookup[80]（仙人掌）option0 = (73,120,17)；原版怪癖硬编码） */
const REMIX_MAP_BG = (73 << 16) | (120 << 8) | 17;
/** 地狱背景底色（MapHelper.cs:1689 color11=(50,44,38)，GetBackgroundType 尾支 hellPosition） */
const VANILLA_HELL_BG_PACKED = (50 << 16) | (44 << 8) | 38;
