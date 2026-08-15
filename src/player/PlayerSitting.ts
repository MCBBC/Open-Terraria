// 玩家坐椅系统（Terraria.GameContent/PlayerSittingHelper.cs 1:1，2026-08-15）：
// 右键可坐家具（Player.cs:31842-31860：tile 15/497 一档、89/102/487 一档，均
// IsWithinSnappngRangeToTile 40px 门）→ SitDown 搬锚点；坐中：任意移动输入/滑轮/
// 坐骑/朝向变化/椅失效 → SitUp（UpdateSitting :69-99）；同位重坐=起身。
// 可坐表 = TileID.Sets.CanBeSatOnForPlayers（TileID.cs:213）：15 椅/497 王座/
// 89 梳妆台长凳族/102 梳妆台/487 女王摇篮（本仓 sheet 判定）。
// 坐下效果：isLockedToATile（Player.cs:3858-3868）——重力/常规移动锁死（velocity
// 恒 0，Player.fixedUpdate 矿车同款早退前段）；自然回血 ×1.3+lifeRegenTime +3/tick
// （:19053-19056，与睡眠同档）；马桶（15 的 frameY/40 ∈ {1,20} 或 497）坐 10t+
// 且 wellFed → TryToPoop（:18714-18745：1/600（醉 1/200）剥 207→206→26 递降一档
// 屎堆 5395——本仓物品未注册，粒子近似+登记）。红帽骷髅触发（:84-90：夜间坐
// 长凳 89 的 frameX∈[2322,2358]）依赖 killClothier 旗标未持久化，登记。
// 渲染偏移（GetSittingOffsetInfo :22-37）：sittingIndex（叠坐索引，单人恒 0）×
// direction×8 / ×gravDir×−4 + offsetForSeat——Renderer 侧以 posOffset 应用。
import { TILE } from '../core/constants';
import type { TileStore } from '../world/TileStore';
import { sheetOf } from './SmartCursor';

/** 可坐 tile sheet 全集（CanBeSatOnForPlayers：15/497/89/102/487） */
export const SITTABLE_SHEETS = new Set([15, 497, 89, 102, 487]);

/** ExtraSeatInfo.IsAToilet（Helper case 15/497：马桶帧档） */
export interface SittingTarget {
  targetDirection: number;
  /** 玩家 Bottom 目标（世界 px） */
  sittingX: number; sittingY: number;
  /** seatDownOffset（渲染细节位） */
  offsetX: number; offsetY: number;
  isToilet: boolean;
}

/** GetSittingTargetInfo（Helper.cs:107-262）：逐型帧偏移 1:1（含朝向/座位下沉）。
 *  playerDir：梳妆台 102/长凳 89 的 targetDirection 随玩家朝向（源码同字段） */
export function getSittingTargetInfo(
  st: TileStore, x: number, y: number, playerDir = 1,
): SittingTarget | null {
  const i = st.inBounds(x, y) ? st.idx(x, y) : -1;
  if (i < 0) return null;
  const sheet = sheetOf(st.type[i]);
  if (!SITTABLE_SHEETS.has(sheet)) return null;
  if (!(st.flags[i] & 1)) return null;   // !active
  const fx = st.frameX[i], fy = st.frameY[i];
  let num = x, num2 = y;
  let targetDirection = 1;
  let offX = 0, offY = 0;
  let num3 = 6;
  let zeroX = 0;
  let isToilet = false;
  switch (sheet) {
    case 15:
    case 497: {
      // 椅/王座（2 格高：frameY%40!=0 → 点的是上半，锚点抬 1 格）
      const toilet = (sheet === 15 && (Math.floor(fy / 40) === 1 || Math.floor(fy / 40) === 20))
        || sheet === 497;
      const throne = sheet === 15 && Math.floor(fy / 40) === 27;
      offY = throne ? 4 : 0;
      if (fy % 40 !== 0) num2--;
      targetDirection = fx !== 0 ? 1 : -1;
      isToilet = toilet;
      break;
    }
    case 102: {
      // 梳妆台（3×3 部件，frameX/18=列 frameY/18=行）：左右件让位 ±1、行让位 ±2/+1/−1
      const col = Math.floor(fx / 18);
      if (col === 0) num++;
      if (col === 2) num--;
      const row = Math.floor(fy / 18);
      if (row === 0) num2 += 2;
      if (row === 1) num2++;
      if (row === 3) num2--;
      targetDirection = playerDir;
      num3 = 0;
      break;
    }
    case 487: {
      // 女王摇篮（3 宽部件，frameX%72/18=局部列）
      const col = Math.floor(fx % 72 / 18);
      if (col === 1) num--;
      if (col === 2) num++;
      if (Math.floor(fy / 18) !== 0) num2--;
      targetDirection = col <= 1 ? 1 : -1;   // (num7 <= 1).ToDirectionInt()
      num3 = 0;
      offY -= 1;
      break;
    }
    case 89: {
      // 长凳（3 格宽，frameX/54=款式档）：款式决定三座位下沉；左右端座位偏移 ±4
      targetDirection = playerDir;
      num3 = 0;
      let v1y = 2, v2y = 2, v3y = 2;          // 左/右/中三座位基础下沉
      let v1x = -4, v2x = 4;
      const style = Math.floor(fx / 54);
      switch (style) {
        case 0: case 2: case 14: case 15: case 17: case 20: case 21: case 22:
        case 23: case 25: case 26: case 27: case 28: case 35: case 37: case 38:
        case 39: case 40: case 41: case 42:
          v1y = v2y = v3y = 1; break;
        case 1: v3y = 1; break;
        case 3: case 4: case 5: case 7: case 8: case 9: case 10: case 11:
        case 12: case 13: case 16: case 18: case 19: case 36:
          v1y = v2y = v3y = 0; break;
        case 6: v1y = v2y = v3y = -1; break;
        case 24: v3y = 0; v1y = -4; v1x = 0; v2x = 0; v2y = -4; break;
      }
      if (fy % 40 !== 0) num2--;
      // 座位选择按玩家朝向与端座位（frameX%54 ∈ {0,36}）
      if ((fx % 54 === 0 && targetDirection === -1) || (fx % 54 === 36 && targetDirection === 1)) {
        offX = v1x; offY = v1y;
      } else if ((fx % 54 === 0 && targetDirection === 1) || (fx % 54 === 36 && targetDirection === -1)) {
        offX = v2x; offY = v2y;
      } else {
        offX = 0; offY = v3y;
      }
      offX += 1;   // zero2.X=1
      break;
    }
  }
  // playerSittingPosition = (num, num2+1).ToWorldCoordinates(8,16)
  let sx = num * TILE + 8, sy = (num2 + 1) * TILE + 16;
  sx += targetDirection * num3;
  sx += zeroX;
  return { targetDirection, sittingX: sx, sittingY: sy, offsetX: offX, offsetY: offY, isToilet };
}
