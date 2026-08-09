// 原版 "Smooth World"(L7568) + "Waterfalls"(L7697) 两个生成 pass 的半砖移植 +
// PoundTile/SlopeTile/CanPoundTile（L49122-49232）。
// 半砖是原版"水浸润到方块贴图透明区"与瀑布触发（WaterfallManager 靠 halfBrick 唇缘）
// 的核心：Smooth World 把地表凸起砸成半砖/坡面，Waterfalls pass 专门在水边唇缘砸半砖。
// 偏离原版处（坡面渲染未实现前）：
//  - 原版随机二选一的 SlopeTile 分支统一改为 PoundTile（视觉安全，唇缘效果等价）
//  - slope 3/4 的坡面分支暂不生成；Tile Cleanup 的 slope→halfBrick 转换随之无需
//  - CanPoundTile 的原版类型黑名单（10/48/137/...）近似为"非 solid 的 framed/decor 不砸"
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS } from '../../../data/tiles';

/** WorldGen.SolidTile(i, j, false) 等价（WorldGen.cs:42370）：
 *  active && tileSolid && !tileSolidTop && !halfBrick && slope==0 —— 半砖/坡面格不算实心。
 *  这对 PoundTile（toggle 语义）至关重要：已砸的半砖不会被后续 pass 再"砸回"整砖 */
export function solidTile(st: TileStore, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
  const i = st.idx(x, y);
  const t = st.type[i];
  if (t === 0) return false;
  const d = TILE_DEFS[t];
  return !!d && d.solid && !d.platform && !st.half[i] && st.slope[i] === 0;
}

/** 可砸判定（WorldGen.cs:49122 CanPoundTile 简化）：实心非平台非框架物 */
function canPoundTile(st: TileStore, x: number, y: number): boolean {
  const t = st.type[st.idx(x, y)];
  if (t === 0) return false;
  const d = TILE_DEFS[t];
  return !!d && d.solid && !d.platform && !d.framed;
}

/** 砸半砖（WorldGen.cs:49198 PoundTile 的生成期路径）：切换 halfBrick 位 */
function poundTile(st: TileStore, x: number, y: number): boolean {
  if (!canPoundTile(st, x, y)) return false;
  const i = st.idx(x, y);
  st.half[i] = st.half[i] ? 0 : 1;
  if (st.half[i]) st.slope[i] = 0;
  return true;
}

/** 原版 pass "Smooth World"（WorldGen.cs:7568-7696）：地表凸起 → 半砖/削除 */
export function runSmoothWorldPass(st: TileStore, rng: RNG, _gs: GenState): void {
  const { w, h } = st;
  // —— 第一遍：主凸起模式（L7580-7668）——
  for (let i = 20; i < w - 20; i++) {
    for (let j = 20; j < h - 20; j++) {
      const ti = st.idx(i, j);
      const t = st.type[ti];
      const d = TILE_DEFS[t];
      // 原版跳过 48/137/232/191/151/274（雕像/树木/蜂巢类）≈ framed 物体跳过
      if (d && d.framed) continue;
      if (st.type[st.idx(i, j - 1)] === 0) {
        // 上方无块：对凸起顶端做半砖/削除
        if (solidTile(st, i, j)) {
          const li = st.idx(i - 1, j), ri = st.idx(i + 1, j);
          if (!st.half[li] && !st.half[ri] && st.slope[li] === 0 && st.slope[ri] === 0) {
            if (solidTile(st, i, j + 1)) {
              // 模式 A（L7598-7605）：左凸 → 右坡/半砖；模式 B（L7606-7616）：右凸 → 左坡/半砖
              if (!solidTile(st, i - 1, j) && !st.half[st.idx(i - 1, j + 1)]
                && solidTile(st, i - 1, j + 1) && solidTile(st, i + 1, j)
                && st.type[st.idx(i + 1, j - 1)] === 0) {
                poundTile(st, i, j); // 原版另一半走 SlopeTile(2)（坡面未实现，统一半砖）
              } else if (!solidTile(st, i + 1, j) && !st.half[st.idx(i + 1, j + 1)]
                && solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j)
                && st.type[st.idx(i - 1, j - 1)] === 0) {
                poundTile(st, i, j); // 原版另一半走 SlopeTile(1)
              } else if (solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j + 1)
                && st.type[st.idx(i + 1, j)] === 0 && st.type[st.idx(i - 1, j)] === 0) {
                // 孤立凸起（L7629）：直接半砖
                poundTile(st, i, j);
              }
              // 悬空支脚削除（L7634-7668）：两侧下方空 + 对角支撑 → 删
              if (solidTile(st, i, j)) {
                if (solidTile(st, i - 1, j) && solidTile(st, i + 1, j + 2)
                  && st.type[st.idx(i + 1, j)] === 0 && st.type[st.idx(i + 1, j + 1)] === 0
                  && st.type[st.idx(i - 1, j - 1)] === 0) {
                  st.setTileSilent(i, j, 0);
                } else if (solidTile(st, i + 1, j) && solidTile(st, i - 1, j + 2)
                  && st.type[st.idx(i - 1, j)] === 0 && st.type[st.idx(i - 1, j + 1)] === 0
                  && st.type[st.idx(i + 1, j - 1)] === 0) {
                  st.setTileSilent(i, j, 0);
                } else if (st.type[st.idx(i - 1, j + 1)] === 0 && st.type[st.idx(i - 1, j)] === 0
                  && solidTile(st, i + 1, j) && solidTile(st, i, j + 2)) {
                  if (rng.chance(0.2)) st.setTileSilent(i, j, 0);
                  else if (rng.chance(0.25)) poundTile(st, i, j);
                } else if (st.type[st.idx(i + 1, j + 1)] === 0 && st.type[st.idx(i + 1, j)] === 0
                  && solidTile(st, i - 1, j) && solidTile(st, i, j + 2)) {
                  if (rng.chance(0.2)) st.setTileSilent(i, j, 0);
                  else if (rng.chance(0.25)) poundTile(st, i, j);
                }
              }
            }
            // 顶部单格立柱（L7662）：两侧皆空 → 删
            if (solidTile(st, i, j) && st.type[st.idx(i - 1, j)] === 0 && st.type[st.idx(i + 1, j)] === 0) {
              st.setTileSilent(i, j, 0);
            }
          }
        } else if (st.type[ti] === 0) {
          // 空位补角（L7669-7695）：下方实心 + 单侧实心 → 补一块并半砖（原版另一半 SlopeTile）
          const belowType = st.type[st.idx(i, j + 1)];
          if (belowType !== 0 && !TILE_DEFS[belowType]?.framed) {
            if (solidTile(st, i - 1, j + 1) && solidTile(st, i + 1, j)
              && st.type[st.idx(i - 1, j)] === 0 && st.type[st.idx(i + 1, j - 1)] === 0) {
              st.setTileSilent(i, j, belowType);
              poundTile(st, i, j);
            } else if (solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j)
              && st.type[st.idx(i + 1, j)] === 0 && st.type[st.idx(i - 1, j - 1)] === 0) {
              st.setTileSilent(i, j, belowType);
              poundTile(st, i, j);
            }
          }
        }
      }
    }
  }
  // —— 第二遍（L7677-7694）：斜坡补坡（原版 SlopeTile 1/2）+ 悬坡回落半砖 ——
  for (let i = 20; i < w - 20; i++) {
    for (let j = 20; j < h - 20; j++) {
      const ti = st.idx(i, j);
      const d = TILE_DEFS[st.type[ti]];
      if (d && d.framed) continue;
      if (rng.chance(0.5) && st.type[st.idx(i, j - 1)] === 0 && solidTile(st, i, j)) {
        if (solidTile(st, i, j + 1) && solidTile(st, i + 1, j) && st.type[st.idx(i - 1, j)] === 0) {
          poundTile(st, i, j); // 原版 SlopeTile(2)
        } else if (solidTile(st, i, j + 1) && solidTile(st, i - 1, j) && st.type[st.idx(i + 1, j)] === 0) {
          poundTile(st, i, j); // 原版 SlopeTile(1)
        }
      }
    }
  }
}

/** 原版 pass "Waterfalls"（WorldGen.cs:7697-7743）：水边唇缘砸半砖（瀑布触发的来源） */
export function runWaterfallLipPass(st: TileStore, _rng: RNG, _gs: GenState): void {
  const { w, h } = st;
  // —— 第一遍（L7701-7723）：实心顶格、左右空、侧旁有水 → 砸半砖 ——
  for (let i = 20; i < w - 20; i++) {
    for (let j = 20; j < h - 20; j++) {
      if (!solidTile(st, i, j)) continue;
      const li = st.idx(i - 1, j), ri = st.idx(i + 1, j);
      if (st.type[li] !== 0 || st.type[ri] !== 0) continue;
      if (!solidTile(st, i, j + 1)) continue;
      if (st.liquid[li] === 0 && st.liquid[ri] === 0) continue;
      // 上方 8-20 格内已有半砖则跳过（原版防连续砸穿）
      let flag = true;
      const num3 = 8 + Math.floor(_rng.next() * 12), num4 = 8 + Math.floor(_rng.next() * 12);
      for (let k = j - num3; k <= j + num4; k++) {
        if (k >= 0 && k < h && st.half[st.idx(i, k)]) flag = false;
      }
      if (flag) poundTile(st, i, j);
    }
  }
  // —— 第二遍（L7725-7741）：唇缘向相邻实心格扩展半砖 ——
  for (let i = 20; i < w - 20; i++) {
    for (let j = 20; j < h - 20; j++) {
      const ti = st.idx(i, j);
      if (!solidTile(st, i, j) || !solidTile(st, i, j + 1)) continue;
      if (!solidTile(st, i + 1, j) && st.half[st.idx(i - 1, j)] && st.liquid[st.idx(i - 2, j)] > 0) {
        poundTile(st, i, j);
      }
      if (!solidTile(st, i - 1, j) && st.half[st.idx(i + 1, j)] && st.liquid[st.idx(i + 2, j)] > 0) {
        poundTile(st, i, j);
      }
    }
  }
}
