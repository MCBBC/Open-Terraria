// 原版城镇房屋判定（WorldGen.StartRoomCheck / RoomNeeds / ScoreRoom 近似 1:1，
// Terarria1456 WorldGen.cs:4600-5350）：
//   房间 = 门内侧非实心区域泛洪填充，≤1200 格（原版上限约 750 格 + 余量）；
//   纯空气格必须有"房墙"（Main.wallHouse 表 = 玩家可放置墙；泥土/石等自然墙不合格），
//   家具格（实标记非实心 tile）豁免墙判定；门/平台算边界不穿透；
//   需求（CountsAsDoor/Table/Chair/Light，WorldGen.RoomNeeds）：
//   ≥1 门（扫描锚即门）+ ≥1 桌（含工作台）+ ≥1 椅 + ≥1 光源。
import { T, TILE_DEFS } from '../data/tiles';
import type { TileStore } from './TileStore';

/** Main.wallHouse 全表（Main.cs `wallHouse[n] = true` 逐条提取；自然墙全部不在内） */
export const WALL_HOUSE = new Set([
  224, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339,
  340, 341, 342, 343, 344, 345, 346, 60, 225, 226, 227, 231, 232, 233, 235, 234, 312, 313,
  237, 238, 239, 240, 173, 183, 179, 184, 181, 186, 168, 169, 142, 143, 144, 149, 151, 150,
  152, 145, 148, 175, 176, 182, 146, 147, 167, 133, 134, 135, 136, 137, 75, 76, 78, 82, 77,
  1, 4, 5, 6, 10, 11, 12, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29, 30, 31, 32,
  33, 34, 35, 36, 37, 38, 39, 41, 42, 43, 44, 45, 46, 47, 66, 67, 68, 72, 73, 107, 106, 245,
  315, 316, 317, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123,
  124, 125, 108, 100, 101, 102, 103, 104, 105, 84, 74, 241, 85, 88, 89, 90, 91, 92, 93, 126,
  127, 128, 129, 130, 131, 132, 138, 139, 140, 141, 177, 172, 242, 243, 174, 230, 228, 229,
  236, 319, 318, 321, 322, 320, 347, 348, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360,
  361, 362, 363, 364, 365, 366, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 314, 256,
  257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274,
  275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292,
  293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310,
  311,
]);

/** 桌家族（CountsAsTable 近似：键名 + 原版 sheet 双保险；工作台计入） */
function countsAsTable(key: string, sheet: number | undefined): boolean {
  return key.includes('table') || key === 'workbench' || sheet === 14 || sheet === 18;
}
/** 椅家族（CountsAsChair 近似：椅子/王座；sheet 15=椅 21=王座） */
function countsAsChair(key: string, sheet: number | undefined): boolean {
  return key.includes('chair') || key.includes('throne') || sheet === 15 || sheet === 21;
}

const isDoorType = (t: number) => t === T.DOOR_CLOSED || t === T.DOOR_OPEN;

export interface Room {
  /** NPC 站立/安家 tile（门内地面） */
  standX: number;
  standY: number;
  /** 房间全部 tile idx（占用判定用） */
  tiles: Set<number>;
}

const MAX_TILES = 1200;
const MIN_TILES = 60;

/**
 * 从一扇门向内检查房间。doorX/doorY = 门顶格；门两侧/三行逐一尝试作填充起点。
 * 返回 null = 不构成合格房屋（漏墙 / 太大太小 / 缺桌椅灯）。
 */
export function checkRoom(st: TileStore, doorX: number, doorY: number): Room | null {
  for (const side of [-1, 1]) {
    for (let dy = 0; dy <= 2; dy++) {
      const sx = doorX + side, sy = doorY + dy;
      if (!st.inBounds(sx, sy) || st.isSolid(sx, sy)) continue;
      const room = floodRoom(st, sx, sy);
      if (room) return room;
    }
  }
  return null;
}

/** 泛洪填充一个房间（4 向；门/平台/实心为边界） */
function floodRoom(st: TileStore, sx: number, sy: number): Room | null {
  const tiles = new Set<number>();
  let hasTable = false, hasChair = false, hasLight = false, hasDoor = false;
  let head = 0;
  const queue: number[] = [st.idx(sx, sy)];
  tiles.add(queue[0]);

  while (head < queue.length) {
    const i = queue[head++];
    const x = i % st.w, y = (i / st.w) | 0;
    const t = st.type[i];
    const def = t ? TILE_DEFS[t] : undefined;
    // 纯空气格必须背靠房墙（原版 wallHouse 判定；家具格豁免）
    if (!st.flags[i] && !WALL_HOUSE.has(st.wall[i])) return null;
    if (st.flags[i] && def) {
      if (isDoorType(t)) { hasDoor = true; }
      else if (def.light) hasLight = true;
      else if (countsAsTable(def.key, def.vanilla?.sheet)) hasTable = true;
      else if (countsAsChair(def.key, def.vanilla?.sheet)) hasChair = true;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= st.w - 1 || ny >= st.h - 1) return null; // 漏到世界边
      const ni = st.idx(nx, ny);
      if (tiles.has(ni)) continue;
      const nt = st.type[ni];
      const ndef = nt ? TILE_DEFS[nt] : undefined;
      // 边界：实心 / 平台 / 门（门计入需求但不穿透到室外）
      if (st.isSolid(nx, ny) || ndef?.platform || isDoorType(nt)) {
        if (isDoorType(nt)) hasDoor = true;
        continue;
      }
      if (tiles.size >= MAX_TILES) return null; // 超限 = 没封好
      tiles.add(ni);
      queue.push(ni);
    }
  }
  if (tiles.size < MIN_TILES || !hasDoor || !hasTable || !hasChair || !hasLight) return null;
  // 站立点：起点列向下找地板
  let fy = sy;
  while (fy < st.h - 2 && !st.isSolid(sx, fy)) fy++;
  if (st.isSolid(sx, sy) || fy >= st.h - 2) return null;
  return { standX: sx, standY: fy - 1, tiles };
}

/**
 * 全图找一间无人入住的合格房屋（原版 ScoreRoom 近似：按到出生点距离取最近）。
 * occupied = 已入住 NPC 的 home tile 列表；房间 tile 集与任一 home 相交即视为已占用。
 */
export function findFreeHouse(
  st: TileStore, occupied: Array<{ x: number; y: number }>,
  nearX?: number, nearY?: number,
): Room | null {
  const anchorX = nearX ?? Math.floor(st.w / 2);
  const anchorY = nearY ?? 0;
  let best: Room | null = null;
  let bestD = Infinity;
  for (let y = 3; y < st.h - 4; y++) {
    const row = y * st.w;
    for (let x = 3; x < st.w - 3; x++) {
      const t = st.type[row + x];
      if (!isDoorType(t)) continue;
      const room = checkRoom(st, x, y);
      if (!room) continue;
      // 占用判定：任一已入住 home 落在房间内
      let taken = false;
      for (const h of occupied) {
        if (h.x < 1 || h.y < 1 || h.x >= st.w || h.y >= st.h) continue;
        if (room.tiles.has(st.idx(h.x, h.y))) { taken = true; break; }
      }
      if (taken) continue;
      const d = Math.abs(room.standX - anchorX) + Math.abs(room.standY - anchorY);
      if (d < bestD) { bestD = d; best = room; }
    }
  }
  return best;
}
