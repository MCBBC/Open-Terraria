// 原版 "Smooth World" + "Waterfalls" 两个生成 pass 的移植 +
// PoundTile/SlopeTile/CanPoundTile（1456 WorldGen.cs:81434-81560）。
// 半砖是原版"水浸润到方块贴图透明区"与瀑布触发（WaterfallManager 靠 halfBrick 唇缘）
// 的核心：Smooth World 把地表凸起砸成半砖/坡面，Waterfalls pass 专门在水边唇缘砸半砖。
// 坡面渲染见 VanillaTiler.drawSlopedFrame（TileDrawing.cs:1328-1360 切条 1:1）。
// 仍近似原版处（逐条对照 1456 源码后保留）：
//  - CanPoundTile 的 CanKillTile 结构检查（cs:62249）近似为 !framed
//    （黑名单/Boulders/生成期 190,30/ForbidsSloping 上方表均已 1:1，见 canPoundTile）
//  - SolidTile 的 tileSolidTop 近似为 !platform；PlaceTile 的 495 特判未移植
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS } from '../../../data/tiles';
import { idsByVanillaSheet, NOT_CLEARABLE } from './TileRunner';

/** 各排除表按原版 vanilla tile id 构建（经 idsByVanillaSheet 转内部 id） */
const T = { // 排除表用的原版 id 集
  SWITCH: idsByVanillaSheet(136),
  STATUE: idsByVanillaSheet(137),
  /** Loop B 主排除（16661）：137 雕像/48 尖刺/232 木刺/191 活木/151 沙岩砖/274 地牢砖? /75/76 黑曜石狱石砖 */
  LOOP_B_SKIP: idsByVanillaSheet(137, 48, 232, 191, 151, 274, 75, 76),
  /** 空位补角分支排除（16600/16602/16621）：151/274（不做补角材料）与 190/48/232（旁格排除） */
  NO_FILL: idsByVanillaSheet(151, 274),
  NO_FILL_SIDE: idsByVanillaSheet(190, 48, 232),
  /** Conversion.Sand（TileID.cs:30）：沙族 → Loop B 走 Tile.SmoothSlope */
  SAND: idsByVanillaSheet(53, 112, 116, 234),
  /** TileID.Sets.PreventsSlopesDuringGeneration（1456 TileID.cs:323）：48/137/232/191/151/274/135/442/428 */
  PREVENTS_SLOPES: idsByVanillaSheet(48, 137, 232, 191, 151, 274, 135, 442, 428),
};

/** blockType()==0 判定（悬顶分支旁格检查用）：非活性格或整砖格（half/slope 均为 0） */
function fullOrEmpty(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  return !st.flags[i] || (!st.half[i] && st.slope[i] === 0);
}

/** WorldGen.SolidTile(i, j, false) 等价（WorldGen.cs:42370）：
 *  active && tileSolid && !tileSolidTop && !halfBrick && slope==0 —— 半砖/坡面格不算实心。
 *  这对 PoundTile（toggle 语义）至关重要：已砸的半砖不会被后续 pass 再"砸回"整砖 */
export function solidTile(st: TileStore, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
  const i = st.idx(x, y);
  // 原版 SolidTile 检查 active()（=flags）：TileRunner 幽灵 tile（有 type 无 flags）
  // 不得当实心——曾致补角分支实体化天空幽灵块成浮空半砖（2583 个）
  if (!st.flags[i]) return false;
  const t = st.type[i];
  if (t === 0) return false;
  const d = TILE_DEFS[t];
  return !!d && d.solid && !d.platform && !st.half[i] && st.slope[i] === 0;
}

/** 可砸判定（1456 WorldGen.cs:81434 CanPoundTile 1:1 表）：
 *  ① type 黑名单（cs:81448）：10 门/48 尖刺/137 陷阱/232 木刺/380 花盆箱/387 陷阱门/
 *    388 高闸/476 高尔夫洞/484 滚动仙人掌
 *  ② TileID.Sets.Boulders（TileID.cs:195）：138/484/664/665/711-716
 *  ③ 生成期追加：190 荧光菇块 / 30 木平台（cs:81462-81471）
 *  ④ 上格 ForbidsSloping（cs:81494）：21 箱/26 祭坛/77 熔炉/88/235 传送器/237 蜥蜴祭坛/
 *    441 假箱/467 箱2/468/470 模型/475 帽架/488 倒木/597 传送塔
 *  ⑤ CanKillTile 结构检查（cs:62249）——仍为近似（生成期主要拦截宝箱/巨石邻接，
 *    ①②④已覆盖生成期实际命中面）
 *  另要求 active 且 tileSolid 非 tileSolidTop（原版隐含：非实心块砸不出半砖） */
const POUND_BLACKLIST = idsByVanillaSheet(10, 48, 137, 232, 380, 387, 388, 476, 484);
const BOULDERS = idsByVanillaSheet(138, 484, 664, 665, 711, 712, 713, 714, 715, 716);
const POUND_GEN_SKIP = idsByVanillaSheet(190, 30);
const FORBIDS_SLOPING = idsByVanillaSheet(21, 26, 77, 88, 235, 237, 441, 467, 468, 470, 475, 488, 597);

export function canPoundTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false; // 同 solidTile：幽灵 tile 不可砸
  const t = st.type[i];
  if (t === 0) return false;
  if (POUND_BLACKLIST.has(t)) return false;
  if (BOULDERS.has(t)) return false;
  if (POUND_GEN_SKIP.has(t)) return false;
  // ④ 上格 ForbidsSloping（cs:81475-81478：上格 active 且禁坡物 → 不可砸）
  if (st.inBounds(x, y - 1)) {
    const up = st.idx(x, y - 1);
    if (st.flags[up] && FORBIDS_SLOPING.has(st.type[up])) return false;
  }
  const d = TILE_DEFS[t];
  // !framed ≈ CanKillTile 的框架物拦截（箱/罐/雕像等不可砸半砖）——CanKillTile 整体仍近似
  return !!d && d.solid && !d.platform && !d.framed;
}

/** 坡面(WorldGen.cs:81507 SlopeTile 的生成期路径):清 half、写 slope(0-4)。
 *  slope1=左高右低 / 2=右高左低 / 3=左低右高 / 4=右低左高 */
function slopeTile(st: TileStore, x: number, y: number, dir: number): boolean {
  if (!canPoundTile(st, x, y)) return false;
  const i = st.idx(x, y);
  st.half[i] = 0;
  st.slope[i] = dir;
  return true;
}

/** WorldGen.TileEmpty（70037）：无活性格即空（生成期无 inActive 致动） */
function tileEmpty(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  return !st.flags[st.idx(x, y)];
}

/** WorldGen.SolidOrSlopedTile（70046）：active && tileSolid && !tileSolidTop（坡面算实心） */
function solidOrSlopedTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[st.type[i]];
  return !!d && d.solid && !d.platform;
}

/** Tile.SmoothSlope（1456 Tile.cs:822-880, applyToNeighbors=false 生成期路径,sync 段为联机略）：
 *  按四邻实心位形自整砖/半砖/坡面 1-4 推导。num 位序:上<<3 下<<2 左<<1 右。
 *  case10(上左)→slope3;case9(上右)→slope4;case6(下左)→slope1;case5(下右)→slope2;
 *  case4(仅下)→半砖;其余→整砖 */
function smoothSlope(st: TileStore, x: number, y: number): void {
  const i = st.idx(x, y);
  if (!canPoundTile(st, x, y) || !solidOrSlopedTile(st, x, y)) return;
  const flag = !tileEmpty(st, x, y - 1);                                  // 上方有物
  const flag2 = !solidOrSlopedTile(st, x, y - 1) && flag;                 // 上方非实心
  const flag3 = solidOrSlopedTile(st, x, y + 1);                          // 下方实心
  const flag4 = solidOrSlopedTile(st, x - 1, y);                          // 左实心
  const flag5 = solidOrSlopedTile(st, x + 1, y);                          // 右实心
  const num = ((flag ? 1 : 0) << 3) | ((flag3 ? 1 : 0) << 2) | ((flag4 ? 1 : 0) << 1) | (flag5 ? 1 : 0);
  switch (num) {
    case 10: if (!flag2) { st.half[i] = 0; st.slope[i] = 3; } break;
    case 9:  if (!flag2) { st.half[i] = 0; st.slope[i] = 4; } break;
    case 6:  st.half[i] = 0; st.slope[i] = 1; break;
    case 5:  st.half[i] = 0; st.slope[i] = 2; break;
    case 4:  st.slope[i] = 0; st.half[i] = 1; break;
    default: st.half[i] = 0; st.slope[i] = 0; break;
  }
}

/** 砸半砖（1456 WorldGen.cs:81544 PoundTile 生成期路径）：切换 halfBrick 位。
 *  导出供蜂巢蜂蜜坠落凹槽（HiveBiome.CreateDentForHoneyFall）等 pass 复用 */
export function poundTile(st: TileStore, x: number, y: number): boolean {
  if (!canPoundTile(st, x, y)) return false;
  const i = st.idx(x, y);
  st.half[i] = st.half[i] ? 0 : 1;
  if (st.half[i]) st.slope[i] = 0;
  return true;
}

/** 原版 pass "Smooth World"（1456 WorldGen.cs:16507-16687）：地表凸起 → 坡面/半砖/削除 */
export function runSmoothWorldPass(st: TileStore, rng: RNG, _gs: GenState): void {
  const { w, h } = st;
  // —— 第一遍：主凸起模式（16511-16652）——
  for (let i = 20; i < w - 20; i++) {
    for (let j = 20; j < h - 20; j++) {
      const ti = st.idx(i, j);
      const t = st.type[ti];
      // 主门禁（1456 cs:16516）：本格与上格均"非活性 或 不在 PreventsSlopesDuringGeneration"
      // ——此前近似为 framed 物体跳过（漏 135 压板/442/428 压力垫，且不查上格）
      const okSlope = (yy: number): boolean => {
        if (!st.inBounds(i, yy)) return true;
        const k = st.idx(i, yy);
        return !st.flags[k] || !T.PREVENTS_SLOPES.has(st.type[k]);
      };
      if (!okSlope(j) || !okSlope(j - 1)) continue;
      if (!st.flags[st.idx(i, j - 1)]) {
        // 上方无块（16518）：旁格非开关 136 才处理（136=Switch，旧注释误标蘑菇树）
        if (!T.SWITCH.has(st.type[st.idx(i - 1, j)]) || !st.flags[st.idx(i - 1, j)]) {
          if (!T.SWITCH.has(st.type[st.idx(i + 1, j)]) || !st.flags[st.idx(i + 1, j)]) {
            // 上方无块：对凸起顶端做半砖/削除（16520 还要求 CanBeClearedDuringGeneration）
            if (solidTile(st, i, j) && !NOT_CLEARABLE.has(t)) {
              const li = st.idx(i - 1, j), ri = st.idx(i + 1, j);
              if (!st.half[li] && !st.half[ri] && st.slope[li] === 0 && st.slope[ri] === 0) {
                if (solidTile(st, i, j + 1)) {
                  // 模式 A（16526-16535）：左凸 → slope2/半砖；模式 B（16537-16546）：右凸 → slope1/半砖
                  if (!solidTile(st, i - 1, j) && !st.half[st.idx(i - 1, j + 1)]
                    && solidTile(st, i - 1, j + 1) && solidTile(st, i + 1, j)
                    && !st.flags[st.idx(i + 1, j - 1)]) {
                    if (rng.int(0, 1) === 0) slopeTile(st, i, j, 2); else poundTile(st, i, j); // Next(2)==0
                  } else if (!solidTile(st, i + 1, j) && !st.half[st.idx(i + 1, j + 1)]
                    && solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j)
                    && !st.flags[st.idx(i - 1, j - 1)]) {
                    if (rng.int(0, 1) === 0) slopeTile(st, i, j, 1); else poundTile(st, i, j); // Next(2)==0
                  } else if (solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j + 1)
                    && !st.flags[st.idx(i + 1, j)] && !st.flags[st.idx(i - 1, j)]) {
                    // 孤立凸起（16548）：直接半砖
                    poundTile(st, i, j);
                  }
                  // 悬空支脚削除 + 补坡（16552-16592）：先复检（可能已被 slope/pound 改形）
                  if (solidTile(st, i, j)) {
                    if (solidTile(st, i - 1, j) && solidTile(st, i + 1, j + 2)
                      && !st.flags[st.idx(i + 1, j)] && !st.flags[st.idx(i + 1, j + 1)]
                      && !st.flags[st.idx(i - 1, j - 1)]) {
                      st.setTileSilent(i, j, 0); // KillTile
                    } else if (solidTile(st, i + 1, j) && solidTile(st, i - 1, j + 2)
                      && !st.flags[st.idx(i - 1, j)] && !st.flags[st.idx(i - 1, j + 1)]
                      && !st.flags[st.idx(i + 1, j - 1)]) {
                      st.setTileSilent(i, j, 0); // KillTile
                    } else if (!st.flags[st.idx(i - 1, j + 1)] && !st.flags[st.idx(i - 1, j)]
                      && solidTile(st, i + 1, j) && solidTile(st, i, j + 2)) {
                      // 三路（16562-16576）：Next(5)==0 删 → Next(5)==0 半砖 → 否则 slope2
                      if (rng.int(0, 4) === 0) st.setTileSilent(i, j, 0);
                      else if (rng.int(0, 4) === 0) poundTile(st, i, j);
                      else slopeTile(st, i, j, 2);
                    } else if (!st.flags[st.idx(i + 1, j + 1)] && !st.flags[st.idx(i + 1, j)]
                      && solidTile(st, i - 1, j) && solidTile(st, i, j + 2)) {
                      // 镜像三路（16577-16591）：否则 slope1
                      if (rng.int(0, 4) === 0) st.setTileSilent(i, j, 0);
                      else if (rng.int(0, 4) === 0) poundTile(st, i, j);
                      else slopeTile(st, i, j, 1);
                    }
                  }
                }
                // 顶部单格立柱（16594）：两侧皆空 → 删
                if (solidTile(st, i, j) && !st.flags[st.idx(i - 1, j)] && !st.flags[st.idx(i + 1, j)]) {
                  st.setTileSilent(i, j, 0);
                }
              }
            } else if (!st.flags[ti]) {
              // 空位补角（16600-16639）：下方实心（151/274 不做材料）+ 单侧实心 → 补块 + slope/半砖
              const bi = st.idx(i, j + 1);
              const belowType = solidTile(st, i, j + 1) ? st.type[bi] : 0;
              if (belowType !== 0 && !T.NO_FILL.has(belowType) && !TILE_DEFS[belowType]?.framed) {
                if (!T.NO_FILL_SIDE.has(st.type[st.idx(i + 1, j)])
                  && solidTile(st, i - 1, j + 1) && solidTile(st, i + 1, j)
                  && !st.flags[st.idx(i - 1, j)] && !st.flags[st.idx(i + 1, j - 1)]) {
                  st.setTileSilent(i, j, belowType);
                  if (rng.int(0, 1) === 0) slopeTile(st, i, j, 2); else poundTile(st, i, j);
                }
                if (!T.NO_FILL_SIDE.has(st.type[st.idx(i - 1, j)])
                  && solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j)
                  && !st.flags[st.idx(i + 1, j)] && !st.flags[st.idx(i - 1, j - 1)]) {
                  st.setTileSilent(i, j, belowType);
                  if (rng.int(0, 1) === 0) slopeTile(st, i, j, 1); else poundTile(st, i, j);
                }
              }
            }
          }
        }
      } else if (!st.flags[st.idx(i, j + 1)] && rng.int(0, 1) === 0
        && solidTile(st, i, j) && solidTile(st, i, j - 1)
        // 旁格 blockType()==0（16642：整砖或非活性;half/slope 均须为 0）
        && fullOrEmpty(st, i - 1, j) && fullOrEmpty(st, i + 1, j)) {
        // 悬顶坡面（16642-16652）：下方空 + 上方实心 → 依左右实心出 slope3/4
        if (solidTile(st, i - 1, j) && !solidTile(st, i + 1, j) && solidTile(st, i - 1, j - 1)) {
          slopeTile(st, i, j, 3);
        } else if (solidTile(st, i + 1, j) && !solidTile(st, i - 1, j) && solidTile(st, i + 1, j - 1)) {
          slopeTile(st, i, j, 4);
        }
      }
    }
  }
  // —— 第二遍（16656-16687）：斜坡补坡 + 沙族 SmoothSlope + 无支撑坡面回落 ——
  for (let i = 20; i < w - 20; i++) {
    for (let j = 20; j < h - 20; j++) {
      const ti = st.idx(i, j);
      const t = st.type[ti];
      // 主门禁（16661）：Next(2)==0 + 上方空 + 排除 137/48/232/191/151/274/75/76
      if (rng.int(0, 1) === 0 && !st.flags[st.idx(i, j - 1)] && !T.LOOP_B_SKIP.has(t)
        && solidTile(st, i, j)
        // 两侧检查仅针对 137 雕像（16661 原文只列 137;右侧是 (active || type!=137) 原版怪式）
        && (!T.STATUE.has(st.type[st.idx(i - 1, j)]) || !st.flags[st.idx(i - 1, j)])
        && (st.flags[st.idx(i + 1, j)] || !T.STATUE.has(st.type[st.idx(i + 1, j)]))) {
        if (solidTile(st, i, j + 1) && solidTile(st, i + 1, j) && !st.flags[st.idx(i - 1, j)]) {
          slopeTile(st, i, j, 2);
        }
        if (solidTile(st, i, j + 1) && solidTile(st, i - 1, j) && !st.flags[st.idx(i + 1, j)]) {
          slopeTile(st, i, j, 1);
        }
      }
      // 沙族平滑（16672-16675）：Conversion.Sand → Tile.SmoothSlope(applyToNeighbors=false)
      if (st.flags[ti] && T.SAND.has(t)) smoothSlope(st, i, j);
      // 无支撑坡面回落（16676-16685）：slope1 左侧悬空 / slope2 右侧悬空 → 复位再砸半砖
      if (st.slope[ti] === 1 && !solidTile(st, i - 1, j)) {
        slopeTile(st, i, j, 0);
        poundTile(st, i, j);
      }
      if (st.slope[ti] === 2 && !solidTile(st, i + 1, j)) {
        slopeTile(st, i, j, 0);
        poundTile(st, i, j);
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
