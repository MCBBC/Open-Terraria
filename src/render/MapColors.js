// 地图 tile→RGB 公共逻辑（Minimap 与生成期世界预览 GenWorldPreview 共用）。
// 提取自 Renderer.Minimap.colorFor；返回 0xRRGGBB（字符串 hex 在热循环里太慢）。
import { TILE_DEFS, WALL_DEFS } from '../data/tiles';
function hexToRgb24(hex, fallback) {
    if (!hex || hex[0] !== '#')
        return fallback;
    const v = parseInt(hex.slice(1, 7), 16);
    return Number.isFinite(v) ? v : fallback;
}
// 预解析颜色表（id → 0xRRGGBB）
const TILE_COLORS = new Map();
for (let i = 0; i < TILE_DEFS.length; i++) {
    if (TILE_DEFS[i])
        TILE_COLORS.set(i, hexToRgb24(TILE_DEFS[i].mapColor, 0x808080));
}
const WALL_COLORS = new Map();
for (let i = 0; i < WALL_DEFS.length; i++) {
    if (WALL_DEFS[i])
        WALL_COLORS.set(i, hexToRgb24(WALL_DEFS[i].mapColor, 0x2e2e2e));
}
const SKY = 0x7eb6e8;
const WATER = 0x3d6fd1;
const LAVA = 0xe8622c;
const UNKNOWN = 0x808080;
const UNKNOWN_WALL = 0x2e2e2e;
/** tile → 0xRRGGBB。优先级：实体 tile > 液体 > 墙 > 天空 */
export function mapColor24(st, x, y) {
    const i = st.idx(x, y);
    const t = st.type[i];
    if (t !== 0) {
        const c = TILE_COLORS.get(t);
        return c !== undefined ? c : UNKNOWN;
    }
    if (st.liquid[i] > 40)
        return st.liquidType[i] === 2 ? LAVA : WATER;
    const w = st.wall[i];
    if (w !== 0) {
        const c = WALL_COLORS.get(w);
        return c !== undefined ? c : UNKNOWN_WALL;
    }
    return SKY;
}
