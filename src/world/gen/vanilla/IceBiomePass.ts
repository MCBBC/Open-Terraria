// 原版 pass 15 "Generate Ice Biome"(WorldGen.cs:5372)移植。
// 以 Reset 掷的 snowOriginLeft/Right(=地牢 X ± 扩展)为起点,逐行随机走左右边界;
// num2 行以上整体转换(土/草/腐草/粘土/沙→雪 147,石→冰 161,土墙→雪墙 40),
// num2 行以下按随机走厚度 num5(0-50)向下转换。记录 snowMinX/snowMaxX/snowBottom。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';

export function runIceBiomePass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  gs.snowTop = gs.worldSurface;
  const num2 = gs.lavaLine - rng.int(160, 199); // 完整转换深度线
  let left = gs.snowOriginLeft, right = gs.snowOriginRight;
  let thickness = 10;
  // C# 是 int[]：边界与厚度全程整数、`/2` 为整除截断（cs L5408-5411）。
  // 曾用 Float32Array 浮点累积 → 边界逐行漂移、雪原范围与原版不符
  gs.snowMinX = new Int32Array(h);
  gs.snowMaxX = new Int32Array(h);

  const CORRUPT_GRASS = TILE_BY_KEY['v_23_corrupt_grass_block']!;
  const CLAY = TILE_BY_KEY['clay']!;
  const ICE = TILE_BY_KEY['ice']!;

  for (let y = 0; y <= gs.lavaLine - 140; y++) {
    left += rng.int(-4, 3);
    right += rng.int(-3, 4);
    if (y > 0) {
      // C# int[] 整除截断（非负 → Math.floor 等价）
      left = Math.floor((left + gs.snowMinX[y - 1]) / 2);
      right = Math.floor((right + gs.snowMaxX[y - 1]) / 2);
    }
    // 雪原整体向地牢侧缓慢漂移
    if (gs.dungeonSide > 0) {
      if (rng.next() * 4 < 1) { left++; right++; }
    } else if (rng.next() * 4 < 1) { left--; right--; }
    gs.snowMinX[y] = left;
    gs.snowMaxX[y] = right;
    const x0 = Math.max(0, Math.ceil(left)), x1 = Math.min(w, Math.ceil(right));
    for (let x = x0; x < x1; x++) {
      if (y < num2) {
        const i = st.idx(x, y);
        // 原版 cs:12394-12413 直接 switch(tile.type) 写 147/161 + 墙 2→40，
        // **不判 active()**——幽灵格(挖空残留)同样被转化，跳过会让幽灵
        // 泥/石保持原类型 → 后续 pass 读到错类型（幽灵一致性分叉）
        if (st.wall[i] === 2) st.wall[i] = 40;
        const t = st.type[i];
        if (t === 0 || t === T.DIRT || t === T.GRASS || t === CORRUPT_GRASS || t === CLAY || t === T.SAND) st.type[i] = T.SNOW;
        else if (t === T.STONE) st.type[i] = ICE;
      } else {
        thickness += rng.int(-3, 3);
        if (rng.next() * 3 < 1) {
          thickness += rng.int(-4, 4);
          if (rng.next() * 3 < 1) thickness += rng.int(-6, 6);
        }
        if (thickness < 0) thickness = rng.int(0, 2);
        else if (thickness > 50) thickness = 50 - rng.int(0, 2);
        for (let y2 = y; y2 < y + thickness && y2 < h; y2++) {
          const i = st.idx(x, y2);
          // 同上：不判 active（幽灵格一并转化）
          if (st.wall[i] === 2) st.wall[i] = 40;
          const t = st.type[i];
          if (t === 0 || t === T.DIRT || t === T.GRASS || t === CORRUPT_GRASS || t === CLAY || t === T.SAND) st.type[i] = T.SNOW;
          else if (t === T.STONE) st.type[i] = ICE;
        }
      }
    }
    if (gs.snowBottom < y) gs.snowBottom = y;
  }
}

/** 原版 pass 33 "Slush"（cs:6591-6624）：雪原带内 石→冰、泥/沙泥→雪泥(224)。
 *  泥转雪泥前查 ±3 无丛林草/蘑菇草族（60/70/71/72）。无 RNG 消耗（与原版一致）。 */
export function runSlushPass(st: TileStore, gs: GenState): void {
  if (!gs.snowMinX || !gs.snowMaxX) return; // 雪原未生成（守卫）
  const ICE = TILE_BY_KEY['ice']!;
  const MUD = TILE_BY_KEY['mud']!;
  const SILT = TILE_BY_KEY['silt']!;
  const SLUSH = TILE_BY_KEY['v_224_slush_block']!;
  const STONE = TILE_BY_KEY['stone']!;
  for (let y = gs.snowTop; y <= gs.snowBottom && y < st.h; y++) {
    for (let x = gs.snowMinX[y]; x < gs.snowMaxX[y]; x++) {
      const i = st.idx(x, y);
      const t = st.type[i];                       // ★原版 switch 不判 active（幽灵格一并转化）
      if (t === STONE) {
        st.type[i] = ICE;                         // 只写 type，保 active 态（原版语义）
      } else if (t === MUD || t === SILT) {
        let nearGrass = false;
        for (let dy = -3; dy <= 3 && !nearGrass; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            if (!st.inBounds(x + dx, y + dy)) continue;
            const j = st.idx(x + dx, y + dy);
            if (!st.flags[j]) continue;
            const sh = TILE_DEFS[st.type[j]]?.vanilla?.sheet;
            if (sh === 60 || sh === 70 || sh === 71 || sh === 72) { nearGrass = true; break; }
          }
        }
        if (!nearGrass) st.type[i] = SLUSH;
      }
    }
  }
}
