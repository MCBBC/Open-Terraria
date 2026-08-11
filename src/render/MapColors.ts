// 生成期世界预览（GenWorldPreview / worker previewBitmap 共用）的 tile→RGB 逻辑。
// 返回 0xRRGGBB（字符串 hex 在热循环里太慢）。
// 注意：游戏内小地图（Renderer.colorFor/redrawAll LUT）是独立实现，未走本函数——
// 两份语义需保持一致（活性 tile > 液体 >32 > 墙 > 天空, MapHelper.cs GetWallType）。
import { TILE_DEFS, WALL_DEFS } from '../data/tiles';
import { vanillaTileMapColor, vanillaWallMapColor, vanillaLiquidColor } from '../data/vanillaMapColors';
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
const pack = (c: number[]): number => (c[0] << 16) | (c[1] << 8) | c[2];
const liqColor = (lt: number): number => pack(vanillaLiquidColor(lt >= 1 && lt <= 4 ? lt - 1 : 0));

/** tile → 0xRRGGBB。优先级：活性 tile > 液体 > 墙 > 背景（MapHelper 模型）。
 *  必须判 flags（=原版 tile.active()）：生成期 TileRunner 会在空气格写"幽灵 type"
 *  （原版 1:1 语义，数据层保留、finalize 净化）——不判 flags 会把幽灵画成实体，
 *  生成预览的天空就是被它们显形成"杂块"（游戏内渲染 ChunkCache 已判 flags） */
export function mapColor24(st: TileStore, x: number, y: number): number {
  const i = st.idx(x, y);
  const t = st.flags[i] ? st.type[i] : 0;
  if (t !== 0) {
    // 原版色优先（sheet 直查）；legacy def 回落 mapColor
    const sheet = TILE_DEFS[t]?.vanilla?.sheet;
    if (sheet !== undefined) {
      const vc = vanillaTileMapColor(sheet);
      if (vc) return pack(vc);
    }
    const c = TILE_COLORS.get(t);
    return c !== undefined ? c : UNKNOWN;
  }
  if (st.liquid[i] > 32) return liqColor(st.liquidType[i]);
  const w = st.wall[i];
  if (w !== 0) {
    const vc = vanillaWallMapColor(w);
    if (vc) return pack(vc);
    const c = WALL_COLORS.get(w);
    return c !== undefined ? c : UNKNOWN_WALL;
  }
  // 背景：天空渐变（需 worldSurface，预览期 world.groundLevel 传入前用浅蓝兜底）
  return SKY_FALLBACK;
}
const SKY_FALLBACK = 0x91b9ff; // vanillaSkyColor(浅 y) 近似（生成预览无世界面时的兜底）
