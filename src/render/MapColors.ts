// 地图 tile→RGB 公共逻辑（Minimap 与生成期世界预览 GenWorldPreview 共用）。
// 提取自 Renderer.Minimap.colorFor；返回 0xRRGGBB（字符串 hex 在热循环里太慢）。
import { TILE_DEFS, WALL_DEFS } from '../data/tiles';
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

const SKY = 0x7eb6e8;
const WATER = 0x3d6fd1;
const LAVA = 0xe8622c;
const UNKNOWN = 0x808080;
const UNKNOWN_WALL = 0x2e2e2e;

/** tile → 0xRRGGBB。优先级：活性 tile > 液体 > 墙 > 天空。
 *  必须判 flags（=原版 tile.active()）：生成期 TileRunner 会在空气格写"幽灵 type"
 *  （原版 1:1 语义，数据层保留、finalize 净化）——不判 flags 会把幽灵画成实体，
 *  生成预览的天空就是被它们显形成"杂块"（游戏内渲染 ChunkCache 已判 flags） */
export function mapColor24(st: TileStore, x: number, y: number): number {
  const i = st.idx(x, y);
  const t = st.flags[i] ? st.type[i] : 0;
  if (t !== 0) {
    const c = TILE_COLORS.get(t);
    return c !== undefined ? c : UNKNOWN;
  }
  if (st.liquid[i] > 40) return st.liquidType[i] === 2 ? LAVA : WATER;
  const w = st.wall[i];
  if (w !== 0) {
    const c = WALL_COLORS.get(w);
    return c !== undefined ? c : UNKNOWN_WALL;
  }
  return SKY;
}
