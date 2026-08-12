// 原版城镇房屋判定（WorldGen.StartRoomCheck / RoomNeeds / ScoreRoom 1:1，
// Terarria1456 WorldGen.cs:4600-5350 + 5747-5940）：
//   房间 = 门内侧非实心区域泛洪填充，60 ≤ 格数 ≤ 750（maxRoomTiles），包围盒 < 100
//   （maxRoomSize，WorldGen.cs:4210/4214）；纯空气格必须有"房墙"（Main.wallHouse 表），
//   家具格（实标记非实心 tile）豁免墙判定；门/平台算边界不穿透；
//   需求（CountsAsDoor/Table/Chair/Light，WorldGen.RoomNeeds）：
//   ≥1 门（扫描锚即门）+ ≥1 桌（含工作台）+ ≥1 椅 + ≥1 光源。
//   站位评分 = ScoreRoom 1:1（WorldGen.cs:5804-5940）：
//   ① 占用：他人 home 与 home-1 同在房内 → 整房作废（hiScore=-1）；
//   ② 邪恶度：房间包围盒向外扩 46 格（Housing_GetTestedRoomBounds ±40+6）扫 tile 计数，
//     神圣 +、腐化/猩红 −、向日葵 +5/株，净值 ≥50 才计分（roomEvil），base 50 − 邪恶值；
//   ③ 候选地板：nactive+实心+CanBeHomeSpot(非 379 boulder)+上方 3 格无实心+左右实心；
//   ④ 头顶 5×4 杂物扫描：非实心 +5 / 实心 −5 / 门(10/388 与开锚 389) −20 /
//     基础箱每只 −30 / 正上列每格 −15（均floor到 1）；
//   ⑤ 落位校验：地板格与上方 1-3 格都在房内（Housing_CheckIfInRoom）；
//   ⑥ 取严格大于的最高分（同分先扫者胜：j 从房顶向下、i 从左向右）。
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

/** Main.tileSolid 代理：平台族在原版 tileSolid=true（仅 tileSolidTop 另计），
 *  本仓库 defs 把平台记为 platform 而非 solid——ScoreRoom 杂物扫描按原版语义并入 */
const tileSolidLike = (t: number): boolean => {
  const d = t ? TILE_DEFS[t] : undefined;
  return !!d && (d.solid || d.platform);
};

export interface Room {
  /** NPC 站立/安家 tile（门内地面） */
  standX: number;
  standY: number;
  /** 房间全部 tile idx（占用判定用）。含一圈实心边界格——原版 roomTiles 在
   *  CheckRoom 拒绝前先 Add（WorldGen.cs:6076-6080），ScoreRoom 的
   *  Housing_CheckIfInRoom 因此对地板格成立 */
  tiles: Set<number>;
}

/** WorldGen.maxRoomTiles / maxRoomSize（WorldGen.cs:4210/4214） */
const MAX_TILES = 750;
const MAX_ROOM_SPAN = 100;
const MIN_TILES = 60;
/** TileID.Sets.HousingWalls（TileID.cs:377）：栅栏 11 / 高门 386 / 389 */
const HOUSING_WALL_TILES = new Set([11, 386, 389]);

// ================= ScoreRoom 静态表（WorldGen.cs:5773-5788 GetTileTypeCountByCategory） =================

const sheetOf = (t: number): number => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
/** 邪恶度计数表（GetTileTypeCountByCategory TileScanGroup；sheet 即原版 tile id） */
const EVIL_CORRUPT = new Set([23, 24, 25, 32, 112, 163, 400, 398]);
const EVIL_CRIMSON = new Set([199, 203, 200, 401, 399, 234, 352]);
const EVIL_HALLOW = new Set([109, 110, 113, 117, 116, 164, 403, 402]);
const SUNFLOWER_SHEET = 27;
/** TileID.Sets.IgnoredInHouseScore（TileID.cs:411）：头顶扫描忽略项 */
const IGNORED_IN_HOUSE_SCORE = new Set([4, 3, 73, 82, 83, 84, 386]);
/** TileID.Sets.BasicChest（TileID.cs:315） */
const BASIC_CHEST = new Set([21, 467]);
/** ScoreRoom_CanBeHomeSpot（WorldGen.cs:5967-5978）：boulder 379 不可作家 */
const BOULDER_SHEET = 379;

// ================= 同房判定（TownRoomManager.CanNPCsLiveWithEachOther） =================

/** NPC.housingCategory=1 全表（NPC.cs SetDefaults 仅四处赋值 ：17159/:17243/:17429/:17542）：
 *  城镇宠物——637 城镇猫 / 638 城镇狗 / 656 城镇兔 / 670 蓝史莱姆 / 678-684 史莱姆
 *  变体（绿/紫/老/黄/铜/彩虹/粉）；其余全部 = 0（含所有城镇 NPC） */
const HOUSING_CATEGORY_PET = new Set([637, 638, 656, 670, 678, 679, 680, 681, 682, 683, 684]);

/** NPC.housingCategory（NPC.cs:8450 重置 0；上表四块赋 1） */
export function npcHousingCategory(npcId: number): 0 | 1 {
  return HOUSING_CATEGORY_PET.has(npcId) ? 1 : 0;
}

/** TownRoomManager.CanNPCsLiveWithEachOther（TownRoomManager.cs:153-155）：
 *  `npc1.housingCategory != npc2.housingCategory`——**同类别不可同房**：
 *  城镇 NPC 之间互斥、宠物之间互斥；一名城镇 NPC + 一只宠物可同房。
 *  （ScoreRoom/QuickFindHome 的占用豁免消费位，WorldGen.cs:5587/5737/5754） */
export function canNPCsLiveWithEachOther(npc1ByType: number, npc2ByType: number): boolean {
  return npcHousingCategory(npc1ByType) !== npcHousingCategory(npc2ByType);
}
/** 原版门/闸 tile id（ScoreRoom 杂物扫描 5873 行） */
const DOOR_CLOSED_SHEET = 10;
const DOOR_OPEN_SHEET = 11;
const TALL_GATE_CLOSED_SHEET = 388;
const TALL_GATE_OPEN_SHEET = 389;

/** IsOpenDoorAnchorFrame（WorldGen.cs:69228-69240）：开门的顶/底锚帧（frameX%72
 *  落在 [0,18)∪[54,72)），中段是门洞不算门体 */
function isOpenDoorAnchorFrame(st: TileStore, x: number, y: number): boolean {
  const i = st.idx(x, y);
  if (!st.flags[i] || sheetOf(st.type[i]) !== DOOR_OPEN_SHEET) return false;
  const m = st.frameX[i] % 72;
  return m < 18 || m >= 54;
}

/** Collision.SolidTiles（矩形内任一实心即 true）——ScoreRoom 头顶净空判定用 */
function solidTilesIn(st: TileStore, x0: number, x1: number, y0: number, y1: number): boolean {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      if (st.flags[i] && tileSolidLike(st.type[i])) return true;
    }
  }
  return false;
}

export interface RoomScore {
  /** hiScore（WorldGen.hiScore）；-1=被占用，0=无合格站位/过于邪恶 */
  score: number;
  /** bestX/bestY（地板格；站位 = y-1） */
  x: number;
  y: number;
  roomEvil: boolean;
  hasStandingSpace: boolean;
}

export interface Occupant { x: number; y: number; /** 入住者原版 NPC id（CanNPCsLiveWithEachOther 判定；缺省按 cat 0 城镇 NPC） */ npcId?: number }

/**
 * ScoreRoom 1:1（WorldGen.cs:5804-5940）：对已判合格的房间打分并选家位点。
 * occupied = 已入住 NPC 的 home tile（home 与 home-1 同在房内视为占用者）；
 * askingNpcId = 申请入住的 NPC id（占用豁免用：同 housingCategory 才判占用，
 * WorldGen.cs:5754 CanNPCsLiveWithEachOther——城镇 NPC 与城镇宠物可同房）。
 */
export function scoreRoom(
  st: TileStore, room: Room,
  occupied: Array<{ x: number; y: number; npcId?: number }>,
  askingNpcId = -1,
): RoomScore {
  const fail: RoomScore = { score: 0, x: room.standX, y: room.standY, roomEvil: false, hasStandingSpace: false };
  // ① 占用检查（ScoreRoom_IsThisRoomOccupiedBySomeone WorldGen.cs:5750-5763）：home 与
  //    home-1 都在房内者视为占用者——CanNPCsLiveWithEachOther 不同类别（城镇+宠物）可
  //    同房：兼容者不入占用、记入 sharedX（:5758），其 home 列 ±3 格内站位评分压至 1
  //    （:5882-5886 避让）；同类别则整房作废（hiScore=-1）
  let sharedX = -1;
  for (const h of occupied) {
    if (h.x < 1 || h.y < 1 || h.x >= st.w || h.y >= st.h) continue;
    if (room.tiles.has(st.idx(h.x, h.y)) && room.tiles.has(st.idx(h.x, h.y - 1))) {
      if (!canNPCsLiveWithEachOther(askingNpcId, h.npcId ?? -1)) {
        return { score: -1, x: room.standX, y: room.standY, roomEvil: false, hasStandingSpace: false };
      }
      sharedX = h.x;
    }
  }
  // 房间包围盒（原版 roomX1..roomY2 随泛洪扩张，含边界格）
  let rx1 = st.w, rx2 = 0, ry1 = st.h, ry2 = 0;
  for (const i of room.tiles) {
    const x = i % st.w, y = (i / st.w) | 0;
    if (x < rx1) rx1 = x;
    if (x > rx2) rx2 = x;
    if (y < ry1) ry1 = y;
    if (y > ry2) ry2 = y;
  }
  // ② 邪恶度：包围盒外扩 46（Housing_GetTestedRoomBounds ±(40+5+1)）扫 tile 计数
  //    （CountTileTypesInArea startX+1..endX-1 / startY+2..endY+1）
  let bx1 = Math.max(5, rx1 - 46), bx2 = Math.min(st.w - 6, rx2 + 46);
  let by1 = Math.max(5, ry1 - 44), by2 = Math.min(st.h - 6, ry2 + 44);
  let corrupt = 0, crimson = 0, hallow = 0, sunflower = 0;
  for (let y = by1 + 2; y <= by2 + 1; y++) {
    for (let x = bx1 + 1; x <= bx2 - 1; x++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const sh = sheetOf(st.type[i]);
      if (EVIL_CORRUPT.has(sh)) corrupt++;
      else if (EVIL_CRIMSON.has(sh)) crimson++;
      else if (EVIL_HALLOW.has(sh)) hallow++;
      else if (sh === SUNFLOWER_SHEET) sunflower++;
    }
  }
  const evilNet = -(hallow - (corrupt + crimson + 5 * sunflower)); // -TotalGoodEvil
  let base = 50;
  let roomEvil = false;
  const evil = evilNet < 50 ? 0 : evilNet;
  base -= evil;
  if (evil > 0) roomEvil = true;
  if (base <= -250) return { ...fail, roomEvil }; // 过于邪恶整房作废（5831-5835）
  // ③-⑥ 逐候选地板打分
  let hiScore = 0, bestX = room.standX, bestY = room.standY, hasStandingSpace = false;
  for (let j = ry1 + 2; j <= ry2 + 1; j++) {
    for (let i = rx1 + 1; i < rx2; i++) {
      if (!st.inBounds(i, j)) continue;
      const ii = st.idx(i, j);
      if (!st.flags[ii] || sheetOf(st.type[ii]) === BOULDER_SHEET) continue;
      if (!tileSolidLike(st.type[ii])) continue;
      if (solidTilesIn(st, i - 1, i + 1, j - 3, j - 1)) continue; // 头顶 3 格净空
      const li = st.idx(i - 1, j), ri = st.idx(i + 1, j);
      if (!st.flags[li] || !tileSolidLike(st.type[li])) continue; // 左右须实心
      if (!st.flags[ri] || !tileSolidLike(st.type[ri])) continue;
      let num = base;
      let centerCol = 0, chests = 0;
      for (let k = i - 2; k <= i + 2; k++) {
        for (let l = j - 4; l < j; l++) {
          if (!st.inBounds(k, l)) continue;
          const ci = st.idx(k, l);
          if (!st.flags[ci]) continue;
          const sh = sheetOf(st.type[ci]);
          if (IGNORED_IN_HOUSE_SCORE.has(sh)) continue;
          if (sh === DOOR_OPEN_SHEET && !isOpenDoorAnchorFrame(st, k, l)) continue;
          if (k === i) { centerCol++; continue; }
          if (BASIC_CHEST.has(sh)) { chests++; continue; }
          if (sh === DOOR_CLOSED_SHEET || sh === TALL_GATE_CLOSED_SHEET) num -= 20;
          else if (!isOpenDoorAnchorFrame(st, k, l) && sh !== TALL_GATE_OPEN_SHEET) num += tileSolidLike(st.type[ci]) ? -5 : 5;
          else num -= 20;
        }
      }
      if (num > 0) hasStandingSpace = true;
      // 共用房避让（WorldGen.cs:5882-5886）：与同居者 home 列距离 <3 的站位评分压至 1
      if (sharedX >= 0 && num >= 1 && Math.abs(sharedX - i) < 3) num = 1;
      if (num > 0 && chests > 0) { num -= 30 * chests; if (num < 1) num = 1; }
      if (num > 0 && centerCol > 0) { num -= 15 * centerCol; if (num < 1) num = 1; }
      if (num <= hiScore) continue;
      // ⑤ 落位校验：地板与上方 1-3 格都在房内且上方无实心（5908-5926）
      let ok = room.tiles.has(ii);
      for (let m = 1; m <= 3; m++) {
        const ai = st.idx(i, j - m);
        if (!st.inBounds(i, j - m) || !room.tiles.has(ai)) { ok = false; break; }
        if (st.flags[ai] && tileSolidLike(st.type[ai])) { ok = false; break; }
      }
      if (ok && room.tiles.has(st.idx(i, j - 1))) {
        hiScore = num;
        bestX = i;
        bestY = j;
      }
    }
  }
  return { score: hiScore, x: bestX, y: bestY, roomEvil, hasStandingSpace };
}

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

/** CheckRoom 宽松墙证据（WorldGen.cs:6150-6169）：横竖各 ±2 的 5×1 窗口内出现
 *  房墙（Main.wallHouse）或 nactive 且 tileSolid/HousingWalls 的 tile。
 *  flag=横向证据、flag2=纵向证据——两向都须命中，否则按漏墙处理（:6171-6184） */
function hasLooseWallEvidence(st: TileStore, x: number, y: number): boolean {
  // TileID.Sets.HousingWalls（TileID.cs:377）：11 栅栏 / 386 高门 / 389
  const wallLike = (ii: number): boolean => {
    if (WALL_HOUSE.has(st.wall[ii])) return true;
    if (!st.flags[ii]) return false;
    return tileSolidLike(st.type[ii]) || HOUSING_WALL_TILES.has(sheetOf(st.type[ii]));
  };
  let horiz = false, vert = false;
  for (let k = -2; k <= 2; k++) {
    if (st.inBounds(x + k, y) && wallLike(st.idx(x + k, y))) horiz = true;
    if (st.inBounds(x, y + k) && wallLike(st.idx(x, y + k))) vert = true;
  }
  return horiz && vert;
}

/** 泛洪填充一个房间（8 向 = 原版 StartRoomCheck 邻居压栈 j,k∈-1..1，:6037-6043；
 *  对角穿墙连通是原版语义；门/平台/实心为边界） */
function floodRoom(st: TileStore, sx: number, sy: number): Room | null {
  const tiles = new Set<number>();
  let hasTable = false, hasChair = false, hasLight = false, hasDoor = false;
  let minX = sx, maxX = sx, minY = sy, maxY = sy;
  let head = 0;
  const queue: number[] = [st.idx(sx, sy)];
  tiles.add(queue[0]);

  while (head < queue.length) {
    const i = queue[head++];
    const x = i % st.w, y = (i / st.w) | 0;
    const t = st.type[i];
    const def = t ? TILE_DEFS[t] : undefined;
    // 纯空气格必须背靠房墙（原版 CheckRoom 墙判定；家具格豁免）。宽松分支
    // （WorldGen.cs:6150-6185）：自身无房墙时，横/竖各 ±2 的 5×1 窗口内出现
    // 房墙或实心/HousingWalls tile（nactive）即算有墙——横竖两向须都有证据
    if (!st.flags[i] && !WALL_HOUSE.has(st.wall[i]) && !hasLooseWallEvidence(st, x, y)) return null;
    if (st.flags[i] && def) {
      if (isDoorType(t)) { hasDoor = true; }
      else if (def.light) hasLight = true;
      else if (countsAsTable(def.key, def.vanilla?.sheet)) hasTable = true;
      else if (countsAsChair(def.key, def.vanilla?.sheet)) hasChair = true;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= st.w - 1 || ny >= st.h - 1) return null; // 漏到世界边
      const ni = st.idx(nx, ny);
      if (tiles.has(ni)) continue;
      const nt = st.type[ni];
      const ndef = nt ? TILE_DEFS[nt] : undefined;
      // 边界：实心 / 平台 / 门（门计入需求但不穿透到室外）。
      // 原版 CheckRoom 先 roomTiles.Add 再拒绝（6076-6080）——边界格也入集合，
      // ScoreRoom 的 Housing_CheckIfInRoom(地板格) 依赖这一点
      if (st.isSolid(nx, ny) || ndef?.platform || isDoorType(nt)) {
        if (isDoorType(nt)) hasDoor = true;
        tiles.add(ni);
        if (nx < minX) minX = nx;
        if (nx > maxX) maxX = nx;
        if (ny < minY) minY = ny;
        if (ny > maxY) maxY = ny;
        continue;
      }
      if (tiles.size >= MAX_TILES) return null; // ≥maxRoomTiles = 没封好（WorldGen.cs:4210）
      if (maxX - minX >= MAX_ROOM_SPAN || maxY - minY >= MAX_ROOM_SPAN) return null;
      tiles.add(ni);
      queue.push(ni);
      if (nx < minX) minX = nx;
      if (nx > maxX) maxX = nx;
      if (ny < minY) minY = ny;
      if (ny > maxY) maxY = ny;
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
 * 全图找一间无人入住的合格房屋（房间枚举为本仓库自有——原版无"全图找房"，
 * QuickFindHome 是对既有 home 的单房校验；房内站位选择 = ScoreRoom 1:1）。
 * 多房择优：取 ScoreRoom 分最高者，同分取离锚点近（原版单房无此维度）。
 * occupied = 已入住 NPC 的 home tile 列表（npcId 供同房豁免判定）。
 * askingNpcId = 申请入住者（ScoreRoom 占用豁免 + 共用房避让）。
 */
export function findFreeHouse(
  st: TileStore, occupied: Array<{ x: number; y: number; npcId?: number }>,
  nearX?: number, nearY?: number, askingNpcId = -1,
): Room | null {
  const anchorX = nearX ?? Math.floor(st.w / 2);
  const anchorY = nearY ?? 0;
  let best: Room | null = null;
  let bestScore = 0;
  let bestD = Infinity;
  for (let y = 3; y < st.h - 4; y++) {
    const row = y * st.w;
    for (let x = 3; x < st.w - 3; x++) {
      const t = st.type[row + x];
      if (!isDoorType(t)) continue;
      const room = checkRoom(st, x, y);
      if (!room) continue;
      // ScoreRoom：占用/邪恶度/站位打分一体（占用返回 -1）
      const s = scoreRoom(st, room, occupied, askingNpcId);
      if (s.score <= 0) continue;
      const d = Math.abs(s.x - anchorX) + Math.abs((s.y - 1) - anchorY);
      if (s.score > bestScore || (s.score === bestScore && d < bestD)) {
        bestScore = s.score;
        bestD = d;
        room.standX = s.x;
        room.standY = s.y - 1;
        best = room;
      }
    }
  }
  return best;
}
