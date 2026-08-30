// 原版城镇房屋判定（WorldGen.StartRoomCheck / RoomNeeds / ScoreRoom 1:1，
// Terarria1456 WorldGen.cs:4600-5350 + 5747-5940）：
//   房间 = 门内侧非实心区域泛洪填充，60 ≤ 格数 ≤ 750（maxRoomTiles），包围盒 < 100
//   （maxRoomSize，WorldGen.cs:4210/4214）；纯空气格必须有"房墙"（Main.wallHouse 表），
//   家具格（实标记非实心 tile）豁免墙判定；门/平台算边界不穿透；
//   需求（CountsAsDoor/Table/Chair/Light 四表,TileID.cs:88-127——R21 起逐表 1:1）：
//   ≥1 门（含平台 19——houseTile 在 tileSolid 短路前登记,平台地板即门）+
//   ≥1 桌（含工作台）+ ≥1 椅 + ≥1 光源（CountsAsTorch 26 项表）。
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

// ================= TileID.Sets.RoomNeeds 四表（TileID.cs:88-127,1458 实读） =================
// R21：曾用「渲染发光 def.light 当住房光源」+ 键名近似桌椅 + 门只认 10/11——
// 光源漏 15 项（南瓜灯 35/吊挂灯笼 42/路灯 92/灯 93/彩灯 149/白金烛台蜡 173·174/
// 水母笼 316-318/和平蜡烛 372/壁炉 405/灵魂瓶 572/吊火盆 592/暗影蜡烛 646/飞灵瓶 660）、
// 反向发光矿石（魔矿 22 等）白得光源；王座实为 102（旧 sheet===21 把宝箱当椅）；
// 平台 19 是合法"门"（CheckRoom :6090 houseTile 在 tileSolid 短路【前】登记——
// 平台地板格即满足 door 需求,平台入口房原版合格）。
/** CountsAsTorchTypes（TileID.cs:112-119,26 项=住房光源权威表） */
const COUNTS_AS_TORCH = new Set<number>([
  4, 33, 34, 35, 42, 49, 93, 95, 98, 100,
  149, 173, 174, 270, 271, 316, 317, 318, 92, 372,
  646, 405, 592, 572, 581, 660,
]);
/** CountsAsDoorTypes（TileID.cs:121-127,13 项：木门/开门/平台/翻板/高门/队伍平台） */
const COUNTS_AS_DOOR = new Set<number>([10, 11, 19, 387, 386, 388, 389, 436, 435, 438, 427, 439, 437]);
/** CountsAsTableTypes（TileID.cs:101-108,12 项） */
const COUNTS_AS_TABLE = new Set<number>([14, 18, 87, 88, 90, 101, 354, 355, 464, 469, 487, 699]);
/** CountsAsChairTypes（TileID.cs:94-97,6 项：15 椅/79 床/89 浴缸/102 王座/487/497 马桶） */
const COUNTS_AS_CHAIR = new Set<number>([15, 79, 89, 102, 487, 497]);

const isDoorType = (t: number) => t === T.DOOR_CLOSED || t === T.DOOR_OPEN;

/** Main.tileSolid 代理（CheckRoom 填充门 :6121 = 纯 tileSolid，无 !tileSolidTop 豁免）：
 *  平台/金属条/种植箱在原版 tileSolid=true → 封房（平台地板可做房间边界）；
 *  桌/砧/笼等家具 tileSolid=false（仅 solidTop）→ 不封（房内家具合法）。
 *  本仓库 platform 旗两族混装 → 以 vanilla-tilecollision.json 的 solid&&solidTop
 *  集（提取自 Main.cs）区分 */
import tileCollisionJson from '../data/vanilla-tilecollision.json';
const ROOM_BLOCK_SOLIDTOP = new Set<number>(
  ((tileCollisionJson as unknown as { tiles: Array<{ id: number; solid: boolean; solidTop: boolean }> }).tiles)
    .filter((t) => t.solid && t.solidTop).map((t) => t.id));
export const tileSolidLike = (t: number): boolean => {
  const d = t ? TILE_DEFS[t] : undefined;
  if (!d) return false;
  if (d.solid) return true;
  if (!d.platform) return false;
  const sheet = (d as unknown as { vanilla?: { sheet?: number } }).vanilla?.sheet ?? -1;
  return ROOM_BLOCK_SOLIDTOP.has(sheet);
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

/** 房旗锚行(Main.cs:40212 DrawNPCHousesInWorld):自 fromY-1 向上找第一格房界。
 *  用 tileSolidLike 而非 isSolid —— 本仓平台 solid=false,若按纯实心判定扫描会
 *  穿透 loft 楼板把下层房旗挂进上层同一行(2026-08-30 用户实报「两旗重叠」主因A)。 */
export function findBannerAnchorY(st: TileStore, x: number, fromY: number): number | null {
  let cy = fromY - 1;
  while (cy >= 10) {
    if (st.flags[st.idx(x, cy)] && tileSolidLike(st.type[st.idx(x, cy)])) return cy;
    cy--;
  }
  return null;
}

/** 读档 home 幽灵校验(副因B):home 格必须落在某真实房间的 tiles 集内。
 *  legacy 存档(站位直扫穿层时代)可能带房间外坐标,读档时逐 NPC 过滤。 */
export function validateSavedHome(st: TileStore, x: number, y: number): boolean {
  const q = queryRoom(st, x, y, { ignoreNeeds: true });
  return !!(q.room && q.room.tiles.has(st.idx(x, y)));
}

// ================= home 共室去重（2026-08-30 报告 §3-3 加固·增量小批，
//  Game 读档 pass / 入驻轮分配收尾 / 写盘前三路共用的纯函数） =================

/** dedupeHomes 入参记录：npcKey（「同 key 豁免」）/ 格坐标 / 原版 NPC id
 * （可缺省；缺省按 housingCategory 0=城镇 NPC 参与互斥判定） */
export interface HomeClaim { key: string; x: number; y: number; npcId?: number }

/**
 * 「home 相互重复」清理（纯函数）：
 *   ① 每个 home 自身坐标泛出所在房间（queryRoom ignoreNeeds——只关心围合与 tiles
 *     归属，家具缺失不判负）。泛不出房间/越界的幽灵 home 一律原样进 kept：
 *     per-NPC 幽灵过滤是 validateSavedHome 的职责，这里只裁「同室双认领」；
 *   ② 同一物理围合自任一内点泛洪必得唯一 BFS 闭包集 ⇒ 组指纹 = min(tile idx)+格数；
 *   ③ 组内按「距房间包围盒中心」升序（同距按 npcKey/x/y 定序，纯确定性）逐个收编：
 *     与先收者同 housingCategory（canNPCsLiveWithEachOther=false ⇒ 同类别互斥——
 *     城镇 NPC+城镇宠物异类别可合法共室，TownRoomManager.cs:153-155，勿误杀共住宠物）、
 *     npcKey 不同、且两 home 点【双向】落在彼此房间 tiles 集内（防指纹巧合误伤异室者）
 *     三者同时成立才判双占，后到者（离房间中心更远）进 dropped，由调用方置 homeless。
 * 返回把入参逐一分桶：kept ∪ dropped = 输入全量（引用不变，稳定复现）。
 */
export function dedupeHomes<C extends HomeClaim>(
  st: TileStore, homes: readonly C[],
): { kept: C[]; dropped: C[] } {
  const kept: C[] = [];
  const dropped: C[] = [];
  interface Cand { h: C; room: Room; idx: number; d2: number }
  const groups = new Map<string, Cand[]>();
  for (const h of homes) {
    const x = Math.round(h.x), y = Math.round(h.y);
    if (!(x >= 10 && y >= 10 && x < st.w - 10 && y < st.h - 10)) { kept.push(h); continue; }
    const room = queryRoom(st, x, y, { ignoreNeeds: true }).room;
    if (!room || !room.tiles.has(st.idx(x, y))) { kept.push(h); continue; }
    let rx1 = st.w, rx2 = 0, ry1 = st.h, ry2 = 0, minI = Infinity;
    for (const ti of room.tiles) {
      if (ti < minI) minI = ti;
      const tx = ti % st.w, ty = (ti / st.w) | 0;
      if (tx < rx1) rx1 = tx;
      if (tx > rx2) rx2 = tx;
      if (ty < ry1) ry1 = ty;
      if (ty > ry2) ry2 = ty;
    }
    const dx = x - (rx1 + rx2) / 2, dy = y - (ry1 + ry2) / 2;
    const fp = `${minI}:${room.tiles.size}`;
    const cand: Cand = { h, room, idx: st.idx(x, y), d2: dx * dx + dy * dy };
    const arr = groups.get(fp);
    if (arr) arr.push(cand);
    else groups.set(fp, [cand]);
  }
  const keyLess = (p: string, q: string): number => (p < q ? -1 : p > q ? 1 : 0);
  for (const cands of groups.values()) {
    cands.sort((a, b) => a.d2 - b.d2 || keyLess(a.h.key, b.h.key)
      || a.h.x - b.h.x || a.h.y - b.h.y);
    const winners: Array<{ key: string; cat: 0 | 1; room: Room; idx: number }> = [];
    for (const c of cands) {
      const cat = npcHousingCategory(c.h.npcId ?? -1);
      const clash = winners.some((w) => w.cat === cat && w.key !== c.h.key
        && w.room.tiles.has(c.idx) && c.room.tiles.has(w.idx));
      if (clash) dropped.push(c.h);   // 双占冲突 → 后到者弃置(调用方置 homeless)
      else {
        winners.push({ key: c.h.key, cat, room: c.room, idx: c.idx });
        kept.push(c.h);               // 收编入胜者桶(kept∪dropped 必须覆盖输入全量)
      }
    }
  }
  return { kept, dropped };
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
  const evilNet = corrupt + crimson - 5 * sunflower - hallow; // WorldGen.cs:5774-5794 TotalGoodEvil=腐+猩−圣−5×向日葵格(每株−40);旧符号反致种向日葵反把好房推向 corrupted
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
/** 纯围合房间判定（WorldGen.StartRoomCheck 1:1 语义——床 CheckSpawn 专用:
 *  只查边界/漏墙/墙型/尺寸,无家具(RoomNeeds)/站位要求）。extraSolid = 视为
 *  实心的 sheet 集（CheckSpawn 期 tileSolid[379] 泡沫块翻转同构） */
export function checkRoomEnclosure(st: TileStore, x: number, y: number, extraSolid?: Set<number>): Room | null {
  // ★原版 StartRoomCheck(x,y) 单点直锚入栈（:6031-6034 roomCheckStack.Push）——
  //   无 checkRoom 的 ±1/dy 探测（那是房门锚定用的;床锚=床底格,天然可泛洪）。
  //   锚格实心 → RoomCheckStartedInASolidTile（:6020-6024,床 CheckSpawn 文案走
  //   default 档 → notValid）
  if (!st.inBounds(x, y)) return null;
  if (st.isSolid(x, y)
    || (extraSolid !== undefined && st.flags[st.idx(x, y)] !== 0
      && extraSolid.has(sheetOf(st.type[st.idx(x, y)])))) {
    lastRoomCheckFail = 'notValid';
    return null;
  }
  return floodRoom(st, x, y, undefined, { requireFurniture: false, requireStand: false, extraSolid });
}

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
/** floodRoom 选项：requireFurniture/requireStand 关掉 = 原版 StartRoomCheck 的
 *  纯围合语义（床 CheckSpawn 用——原版床设点只查围合,家具是 TownNPC RoomNeeds
 *  的独立步骤）;extraSolid = 临时视为实心的 sheet 集（原版 CheckSpawn 期间翻转
 *  tileSolid[379] 泡沫块的同构）。 */
interface FloodOpts {
  requireFurniture?: boolean;
  requireStand?: boolean;
  extraSolid?: Set<number>;
  /** 校验旁路(RoomNeeds 不满足不判负——幽灵 home 校验只关心围合+tiles 归属) */
  ignoreNeeds?: boolean;
}

function floodRoom(st: TileStore, sx: number, sy: number, needsOut?: RoomNeedsFlags, opts: FloodOpts = {}): Room | null {
  const requireFurniture = opts.requireFurniture !== false;
  const requireStand = opts.requireStand !== false;
  const extraSolid = opts.extraSolid;
  const ignoreNeeds = opts.ignoreNeeds === true;
  const tiles = new Set<number>();
  let hasTable = false, hasChair = false, hasLight = false, hasDoor = false;
  // houseTile 登记（CheckRoom :6089-6090 `if nactive → houseTile[type]=true` 在
  // tileSolid 短路前执行——房内家具格与【边界实心/平台格】都入表,RoomNeeds 四表按
  // sheet 查（vanilla 用独立 if 非互斥链:487 同在桌/椅两表）
  const markHouseTile = (sheet: number): void => {
    if (COUNTS_AS_DOOR.has(sheet)) hasDoor = true;
    if (COUNTS_AS_TORCH.has(sheet)) hasLight = true;
    if (COUNTS_AS_TABLE.has(sheet)) hasTable = true;
    if (COUNTS_AS_CHAIR.has(sheet)) hasChair = true;
  };
  let minX = sx, maxX = sx, minY = sy, maxY = sy;
  let head = 0;
  const queue: number[] = [st.idx(sx, sy)];
  tiles.add(queue[0]);
  const flush = (): void => {
    if (needsOut) needsOut.table = needsOut.table || hasTable;
    if (needsOut) needsOut.chair = needsOut.chair || hasChair;
    if (needsOut) needsOut.light = needsOut.light || hasLight;
    if (needsOut) needsOut.door = needsOut.door || hasDoor;
  };

  while (head < queue.length) {
    const i = queue[head++];
    const x = i % st.w, y = (i / st.w) | 0;
    const t = st.type[i];
    const def = t ? TILE_DEFS[t] : undefined;
    // 纯空气格必须背靠房墙（原版 CheckRoom 墙判定；家具格豁免）。宽松分支
    // （WorldGen.cs:6150-6185）：自身无房墙时，横/竖各 ±2 的 5×1 窗口内出现
    // 房墙或实心/HousingWalls tile（nactive）即算有墙——横竖两向须都有证据
    if (!st.flags[i] && !WALL_HOUSE.has(st.wall[i]) && !hasLooseWallEvidence(st, x, y)) {
      // WorldGen.CheckRoom :6171-6181 尾：有墙但非房墙 = TooManyUnsafeWalls（天然
      // 墙不安全）;无墙 = HoleInWallIsTooBig（漏墙）
      lastRoomCheckFail = st.wall[i] > 0 ? 'unsafeWalls' : 'hole';
      return null;
    }
    if (st.flags[i] && def) {
      markHouseTile(def.vanilla?.sheet ?? -1);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= st.w - 1 || ny >= st.h - 1) {
        lastRoomCheckFail = 'edge';   // 原版 CheckRoom 越界 = TooCloseToWorldEdge
        return null;
      }
      const ni = st.idx(nx, ny);
      if (tiles.has(ni)) continue;
      const nt = st.type[ni];
      const ndef = nt ? TILE_DEFS[nt] : undefined;
      // 边界：纯 tileSolid（tileSolidLike = 实心 + 平台/金属条/种植箱）+ 门。
      // 原版 CheckRoom 填充门 :6121 = nactive && tileSolid（无 !tileSolidTop 豁免）
      // → 平台地板封房、桌/砧/笼等家具（tileSolid=false）为房内格可穿透。
      // 原版先 roomTiles.Add 再拒绝（6076-6080）——边界格也入集合，
      // ScoreRoom 的 Housing_CheckIfInRoom(地板格) 依赖这一点
      if (tileSolidLike(nt) || isDoorType(nt) || (extraSolid !== undefined && nt !== 0
        && extraSolid.has(sheetOf(nt)))) {
        // 边界格同样登记 houseTile（原版在 tileSolid 短路前 :6090）——平台 19
        // 地板即"门"（R21:平台入口房不再一律 notValid）
        if (ndef) markHouseTile(ndef.vanilla?.sheet ?? -1);
        tiles.add(ni);
        if (nx < minX) minX = nx;
        if (nx > maxX) maxX = nx;
        if (ny < minY) minY = ny;
        if (ny > maxY) maxY = ny;
        continue;
      }
      if (tiles.size >= MAX_TILES) {
        lastRoomCheckFail = 'tooBig';   // RoomIsTooBig（WorldGen.cs:4210）
        return null;
      }
      if (maxX - minX >= MAX_ROOM_SPAN || maxY - minY >= MAX_ROOM_SPAN) {
        lastRoomCheckFail = 'tooBig';
        return null;
      }
      tiles.add(ni);
      queue.push(ni);
      if (nx < minX) minX = nx;
      if (nx > maxX) maxX = nx;
      if (ny < minY) minY = ny;
      if (ny > maxY) maxY = ny;
    }
  }
  flush();
  if (tiles.size < MIN_TILES) {
    lastRoomCheckFail = 'tooSmall';
    return null;
  }
  if (requireFurniture && !ignoreNeeds && (!hasDoor || !hasTable || !hasChair || !hasLight)) {
    lastRoomCheckFail = 'notValid';   // RoomNeeds 家具档（TownNPC 住房用;床围合档跳过）
    return null;
  }
  if (!requireStand) return { standX: sx, standY: sy, tiles };
  // 站立点：起点列向下找【房间边界】(tileSolidLike——平台楼板算房界)。★此前用
  // isSolid 直扫会穿透平台地板落到下层他室的空气里,产出跨室幽灵 home
  // (2026-08-30 housing 旗重叠·副因B);且落点必须仍在本次泛洪的 tiles 集内。
  let fy = sy;
  while (fy < st.h - 2 && !tileSolidLike(st.type[st.idx(sx, fy)])) fy++;
  const startSolidLike = st.flags[st.idx(sx, sy)] && tileSolidLike(st.type[st.idx(sx, sy)]);
  const standIdx = st.idx(sx, Math.max(sy, fy - 1));
  if (startSolidLike || fy >= st.h - 2 || !tiles.has(standIdx)) {
    lastRoomCheckFail = 'notValid';
    return null;
  }
  return { standX: sx, standY: fy - 1, tiles };
}

/**
 * 锚点 ±10 窗口内找一间无人入住的合格房屋。原版 QuickFindHome（WorldGen.cs:5665-
 * 5727）只对锚点校验：锚点自身（:5674 home-1）→ home±1（:5677-5682）→ home±10
 * 螺旋（:5684-5691），窗外不搜索——锚点 ±1 精查已由全格窗口覆盖（±10 窗含 ±1），
 * 螺旋的步长 2 粗采样不重刻（打分制需全格门锚，最小实现对齐）。
 * 房间枚举/多房打分为本仓库自有——原版 StartRoomCheck 自单点泛洪（SpawnTownNPC
 * :5345-5358 锚点须正好落在房内才成功），无多房择优；泛洪填充本身不受窗限制，
 * 与原版 CheckRoom 一致。多房择优：取 ScoreRoom 分最高者，同分取离锚点近。
 * 锚点来源（调用方负责，SpawnHomelessNPC :5014-5033 语义）：已安家 NPC 的 home
 * 随机取一；冷启无安家者回退出生点。
 * occupied = 已入住 NPC 的 home tile 列表（npcId 供同房豁免判定）。
 * askingNpcId = 申请入住者（ScoreRoom 占用豁免 + 共用房避让）。
 */
export function findFreeHouse(
  st: TileStore, occupied: Array<{ x: number; y: number; npcId?: number }>,
  anchorX: number, anchorY: number, askingNpcId = -1,
): Room | null {
  let best: Room | null = null;
  let bestScore = 0;
  let bestD = Infinity;
  // QuickFindHome :5684-5691 ±10 螺旋窗：候选门锚必须落在窗内；世界边缘按原
  // 扫描边界（x∈[3,w-4)、y∈[3,h-4)）裁剪
  const x0 = Math.max(3, anchorX - 10), x1 = Math.min(st.w - 4, anchorX + 10);
  const y0 = Math.max(3, anchorY - 10), y1 = Math.min(st.h - 5, anchorY + 10);
  for (let y = y0; y <= y1; y++) {
    const row = y * st.w;
    for (let x = x0; x <= x1; x++) {
      const t = st.type[row + x];
      // 候选入口：竖向门（10/11，左右探腔）+ 平台族"门"（CountsAsDoorTypes 的
      //   19/386/387/427/435-439——水平入口,房内在平台格上方,R21 补:原版
      //   CheckRoom 自任意非实心点泛洪,平台入口房合格,枚举侧须给等价入口探针）
      let room: Room | null = null;
      if (isDoorType(t)) {
        room = checkRoom(st, x, y);
      } else if (COUNTS_AS_DOOR.has(sheetOf(t))) {
        // 水平长平台只从【左端】探针一次（左邻同 sheet = 长条中段），
        // 且上方格须非实心（房内侧）才值得泛洪
        const leftSame = st.inBounds(x - 1, y) && sheetOf(st.type[st.idx(x - 1, y)]) === sheetOf(t);
        if (!leftSame && st.inBounds(x, y - 1) && !tileSolidLike(st.type[st.idx(x, y - 1)])) {
          room = floodRoom(st, x, y - 1);
        }
      }
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

// ================= 住房查询/分配（原版住房界面 MoveTownNPC + moveRoom，2026-08-15 B 方案） =================

/** 房屋需求旗标（RoomNeeds :5616-5660 四布尔；填充由 floodRoom 完成，失败时也保留已见项） */
export interface RoomNeedsFlags { table: boolean; chair: boolean; light: boolean; door: boolean }

/** 查询失败原因（TownNPCRoomCheckFailureReason 对齐 + 我们两个合成档） */
export type HousingFailReason =
  | 'ok' | 'edge' | 'solid' | 'tooBig' | 'tooSmall' | 'hole' | 'occupied' | 'evil' | 'needs';

export interface HousingQueryResult {
  room: Room | null;
  flags: RoomNeedsFlags;
  reason: HousingFailReason;
}

/**
 * 住房查询（原版 StartRoomCheck 自任意点泛洪——UI 的"?"查询器点世界任意格调用，
 * MoveTownNPC(x, y, -1, feedback) :4629 语义）。失败原因按原版序：世界缘/实心起点
 * （TooCloseToWorldEdge/StartedInASolidTile）→ 泛洪漏墙/超界（floodRoom null 统称
 * hole；≥MAX_TILES = tooBig）→ 太小（<60）→ 缺家具（needs, 旗标明细在 flags）→
 * 占用/腐化由调用方配 scoreRoom 判（本函数不判——查询 UI 两次调用里的第一次
 * Rich feedback 也要打分,交给 assign/query 合并入口 housingCheckAt）。
 */
/** 最近一次 floodRoom/checkRoom 失败原因（WorldGen.roomCheckFailureReason 对齐；
 *  床 CheckSpawn 的失败文案映射消费：tooBig=格数/跨度上限、tooSmall=格数下限、
 *  hole=漏墙/泛洪越界、notValid=缺家具/站位失败；'edge' 为调用方边界预检保留） */
export type RoomCheckFailReason = 'edge' | 'tooBig' | 'tooSmall' | 'hole' | 'unsafeWalls' | 'notValid';
export let lastRoomCheckFail: RoomCheckFailReason = 'notValid';

export function queryRoom(st: TileStore, x: number, y: number,
  opts: Pick<FloodOpts, 'ignoreNeeds'> = {}): HousingQueryResult {
  const flags: RoomNeedsFlags = { table: false, chair: false, light: false, door: false };
  if (x < 10 || y < 10 || x >= st.w - 10 || y >= st.h - 10) {
    return { room: null, flags, reason: 'edge' };
  }
  // 起点实心（StartedInASolidTile :6025-6032）——原版仅置 canSpawn=false 后继续
  // 泛洪（同轮后续检查会失败）；此处直接判失败等价（实心种子的泛洪无意义）
  if (st.flags[st.idx(x, y)] && tileSolidLike(st.type[st.idx(x, y)])) {
    return { room: null, flags, reason: 'solid' };
  }
  const room = floodRoom(st, x, y, flags, opts);
  if (!room) {
    // floodRoom null 的两种来源：漏墙/世界边（途中 return null）与终检失败。
    // 太小/缺家具可由 flags/无终检区分——终检失败时 flags 已 flush（见 floodRoom 尾），
    // 而 hole 的 flags 是部分填充：以 needs 四项是否有命中来分辨太不完整=hole
    const seen = (flags.table ? 1 : 0) + (flags.chair ? 1 : 0) + (flags.light ? 1 : 0) + (flags.door ? 1 : 0);
    return { room: null, flags, reason: seen === 0 ? 'hole' : 'needs' };
  }
  return { room, flags, reason: 'ok' };
}

/**
 * 住房查询 + 打分合并入口（PerformHousingCheck 两次 MoveTownNPC 的合并语义）：
 * 合格且未被占用且未腐化 → reason='ok'；占用/腐化取自 scoreRoom（RoomScore
 * score=-1=occupied、roomEvil=evil）。供查询 UI 与分配共用。
 */
export function housingCheckAt(
  st: TileStore, occupied: Array<{ x: number; y: number; npcId?: number }>,
  x: number, y: number, askingNpcId = -1,
): HousingQueryResult & { score: number } {
  const q = queryRoom(st, x, y);
  if (!q.room) return { ...q, score: 0 };
  const s = scoreRoom(st, q.room, occupied, askingNpcId);
  if (s.score < 0) return { ...q, room: q.room, reason: 'occupied', score: -1 };
  if (s.roomEvil) return { ...q, room: q.room, reason: 'evil', score: s.score };
  if (s.score <= 0) return { ...q, room: q.room, reason: 'needs', score: 0 };
  return { ...q, reason: 'ok', score: s.score };
}
