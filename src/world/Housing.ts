// 原版城镇房屋判定（WorldGen.StartRoomCheck / RoomNeeds / ScoreRoom 1:1，
// 1457 实测：MoveTownNPC/SpawnTownNPC 面 WorldGen.cs:4602/:5332-5536、ScoreRoom
// 面约 ：5736-5978,B6 注释考古批⑤B 已校）：
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

// ★★对抗修复批②2026-09-01（C-F3 泛洪封边帧规则）——原版 CheckRoom 的门件分支
// （WorldGen.cs:6113-6127）是逐 sheet 语义，此前 isDoorType 十门件【无帧】全当硬
// 边界有两处偏差：开门(11)中段把应连通的两侧室切开；高门开启态 389/翻板 386 等
// 非实心 COUNTS_AS_DOOR 件被误当边界。精确规则：
//   · 实心（tileSolidLike 代理 tileSolid）一律封房（主规则 :6108-6112，平台/金属条同）；
//   · 开门 11 仅锚帧 frameX∈{0,54,72,126} 封——原始相等比较不用模制（对照 CloseDoor
//     编码 cs:32094-32145：两叶四列 frameX%72∈{0,18,36,54}、+72 进第二叶,首末列贴
//     墙为界,中列 18/36/90/108 是门洞穿透继续泛洪 → 开着的门两室合并为一间 =
//     原版语义;另 IsOpenDoorAnchorFrame cs:69697-69709 的 %72 制仅消费于 ScoreRoom
//     头顶扫描豁免面,两者不等价勿混用）；
//   · 高门开启态 389 无条件封（:6118-6121）；关闭态 388 走实心主规则；
//   · 翻板门 386 条件封 (frameX<36&&frameY==18)||(frameX>=36&&frameY==0)（:6123-6127）。
// isDoorType 十门件语义只在 COUNTS_AS_DOOR 登记面（markHouseTile/floodRoom 家具旗）
// 与 findFreeHouse 入口探针枚举面保留。
/** 开门硬边界锚帧（cs:6115：frameX==0||==54||==72||==126 原始相等） */
function isOpenDoorHardFrame(fx: number): boolean {
  return fx === 0 || fx === 54 || fx === 72 || fx === 126;
}
/** 泛洪边界的非实心门件判定（邻格 nactive 时调；sheet=vanilla sheet、fx/fy=邻格帧） */
function doorFrameBoundary(sheet: number, fx: number, fy: number): boolean {
  switch (sheet) {
    case 11: return isOpenDoorHardFrame(fx);
    case 389: return true;
    case 386: return (fx < 36 && fy === 18) || (fx >= 36 && fy === 0);
    default: return false;
  }
}

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

/**
 * 原版 homeTile → 本仓站立格归一（2026-08-31 wld 导入入住丢失定谳）：
 *   原版存档的 homeTileX/Y 是「住房领取锚点」——住房菜单点击格（MoveTownNPC:
 *   WorldGen.cs:4602 由 UI 传入 x,y）/ QuickFindHome 扫描点，房间校验自任意
 *   非实心点泛洪均可成立，故常落在家具/平台/地板等【房界格】上；本仓 home
 *   约定=房间内站立空格（floodRoom 站立尾程 ：535-540 会拒绝实心种子）。
 *   归一策略：自原值向上找首个「非实心且其泛出房间同时包含原锚点与自身」的
 *   候选列内格——地板/平台锚点上抬 1 格即标准站位；家具行上方同室空气亦天然
 *   通过。同室约束（room.tiles.has(原锚点)）防上抬钻进楼上邻室误认领；
 *   实心原锚点也是房界格（roomTiles 含界格 WorldGen.cs:6076-6080），可命中。
 *   查不到合格候选返回 null（调用方转 homeless 走原有幽灵告警路径）。
 */
export function snapSavedHome(st: TileStore, x: number, y: number): [number, number] | null {
  if (x < 10 || x >= st.w - 10 || y < 10 || y >= st.h - 10) return null;
  const origIdx = st.idx(x, y);
  for (let dy = 0; dy <= 6; dy++) {
    const cy = y - dy;
    if (cy < 10 || cy >= st.h - 10) break;
    // ★对抗修复批⑤B 2026-09-01（B3a）：种子帧自检（B3）落地后,'solid/门件边界帧'
    // 候选必被 floodRoom 拒——此处显式跳过并继续上探一格再验（dy≤6 有界,无死锁
    // 空转面）。容错契约：legacy 存档把 home 锚在开门铰链列时,列内室内格仍可命中
    // （泛出房间同含原锚点与自身,开门锚帧格属房间界集合）;全候选失败则返 null,
    // 调用方按既有路径优雅转 homeless。
    const ii = st.idx(x, cy);
    // ★G1谓词批(2026-09-04)：跳过集必须镜像 floodRoom 种子拒门（:542 已改
    //  isActive）——已致动种子现在可入泛洪,不再预跳（位读 flags 同漏致动半边）
    if (st.isActive(x, cy)) {
      const cT = st.type[ii];
      if (tileSolidLike(cT)) continue;
      const cDef = TILE_DEFS[cT];
      if (cDef && doorFrameBoundary(cDef.vanilla?.sheet ?? -1, st.frameX[ii], st.frameY[ii])) continue;
    }
    const q = queryRoom(st, x, cy, { ignoreNeeds: true });
    if (q.room && q.room.tiles.has(origIdx) && q.room.tiles.has(ii)) return [x, cy];
  }
  return null;
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

/** WorldGen.maxRoomTiles / maxRoomSize（1457 实测 WorldGen.cs:4181/4185） */
const MAX_TILES = 750;
const MAX_ROOM_SPAN = 100;
const MIN_TILES = 60;
/** TileID.Sets.HousingWalls（TileID.cs:377）：栅栏 11 / 高门 386 / 389 */
const HOUSING_WALL_TILES = new Set([11, 386, 389]);

// ================= 臭虫否决件（★★对抗修复批④2026-09-01 C-F5） =================
/** CheckRoom 命中置位面（WorldGen.cs:6128-6137）：630 臭虫封锁块 / 631 幽灵臭虫
 *  封锁块（1×1 非实心陈设,tileSolid=false——房内可泛洪格,实心/门界分支在
 *  :6113-6127 提前 return 故只有【房内】命中可达置位行）。vanilla 消费面恰两处：
 *  MoveTownNPC 门（cs:4696-4718,宠物豁免=IsTownPet[type]）/ SpawnTownNPC 门
 *  （cs:5348-5355,豁免须再持 TownManager 登记房位）;QuickFindHome（:5654-5716）与
 *  房况复核环不查此二旗——本仓同构只挂两受理门（housingCheckAt/acceptTownNPCAtHouse），
 *  findFreeHouse（QuickFindHome 语义）刻意不拒。 */
const STINKBUG_SHEET = 630;
const ECHO_STINKBUG_SHEET = 631;

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
/** 主链共享 extraSolid（★★对抗修复批②2026-09-01 C-F4）：boulder/泡沫块 379。
 *  原版 SpawnTownNPC 家族各入口均临时翻转 Main.tileSolid[379]=true 后还原
 *  （CheckForHousesNearAPlayer cs:72199-72201 / SpawnHomelessNPC cs:4979-4994 /
 *  床 CheckSpawn 先例 Game.checkBedSpawn 的 checkRoomEnclosure extraSolid 同构）；
 *  本仓不改全局静态表，以「视作实心的 vanilla sheet 集」注入泛洪与种子预检
 *  （scoreRoom_CanBeHomeSpot 对 379 落位格的排除 cs:5953-5962 单列早存,互补不冲突）。
 *  泛洪默认取该集=域内统一视角,等价于原版逐调用点翻转的合成效果。 */
const MAIN_EXTRA_SOLID: ReadonlySet<number> = new Set([BOULDER_SHEET]);

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

/** IsOpenDoorAnchorFrame（1457 实测 WorldGen.cs:69697-69709）：开门的顶/底锚帧（frameX%72
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
      // ★G1谓词批(2026-09-04)：原版 Collision.SolidTiles（Collision.cs:3494）=
      // `active() && !inActive() && tileSolid && !tileSolidTop`——补致动位半边
      if (st.isActive(x, y) && tileSolidLike(st.type[i])) return true;
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
 * ScoreRoom 1:1（1457 实测 WorldGen.cs:5793-5978）：对已判合格的房间打分并选家位点。
 * occupied = 已入住 NPC 的 home tile（home 与 home-1 同在房内视为占用者；
 * ★批②2026-09-01 放宽为 ReadonlyArray——acceptTownNPCAtHouse 只读传参）；
 * askingNpcId = 申请入住的 NPC id（占用豁免用：同 housingCategory 才判占用，
 * ScoreRoom_IsThisRoomOccupiedBySomeone :5736 起,CanNPCsLiveWithEachOther 消费——
 * 城镇 NPC 与城镇宠物可同房）。
 */
export function scoreRoom(
  st: TileStore, room: Room,
  occupied: ReadonlyArray<Occupant>,
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
  // ② 邪恶度：包围盒外扩（Housing_GetTestedRoomBounds cs:5929-5951，testedRoomBounds
  //    同构源；邪恶度扫 CountTileTypesInArea startX+1..endX-1 / startY+2..endY+1
  //    cs:5812-5820——与松露外扩计数共用同一盒形,勿再开平行副本）
  const rb = testedRoomBounds(st, rx1, rx2, ry1, ry2);
  const bx1 = rb.x0, bx2 = rb.x1, by1 = rb.y0, by2 = rb.y1;
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
      // ★G1谓词批(2026-09-04)：地板候选首门=原版 nactive（WorldGen.cs:5881
      //  `!Main.tile[i,j].nactive() || …`）——已致动格不作家点,flags 位读漏 !inActive 半边
      if (!st.isActive(i, j) || sheetOf(st.type[ii]) === BOULDER_SHEET) continue;
      if (!tileSolidLike(st.type[ii])) continue;
      if (solidTilesIn(st, i - 1, i + 1, j - 3, j - 1)) continue; // 头顶 3 格净空
      const li = st.idx(i - 1, j), ri = st.idx(i + 1, j);
      // ★G1谓词批(2026-09-04)：左右支撑同门 nactive（WorldGen.cs:5881 尾两支
      //  `!Main.tile[i∓1,j].nactive() || !tileSolid[...]`）
      if (!st.isActive(i - 1, j) || !tileSolidLike(st.type[li])) continue; // 左右须实心
      if (!st.isActive(i + 1, j) || !tileSolidLike(st.type[ri])) continue;
      let num = base;
      let centerCol = 0, chests = 0;
      for (let k = i - 2; k <= i + 2; k++) {
        for (let l = j - 4; l < j; l++) {
          if (!st.inBounds(k, l)) continue;
          const ci = st.idx(k, l);
          if (!st.isActive(k, l)) continue; // ★G1谓词批(2026-09-04)：原版 tile.nactive()（WorldGen.cs:5890）
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
    || (extraSolid !== undefined && st.isActive(x, y)
      && extraSolid.has(sheetOf(st.type[st.idx(x, y)])))) { // ★G1谓词批(2026-09-04)：extraSolid 支=CheckSpawn 期 tileSolid[379] 翻转+nactive 门（WorldGen.cs:6108）
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

/** CheckRoom 宽松墙证据（1457 实测 WorldGen.cs:6139-6159）：横竖各 ±2 的 5×1 窗口内
 *  出现房墙（Main.wallHouse）或 nactive 且 tileSolid/HousingWalls 的 tile。
 *  flag=横向证据、flag2=纵向证据——两向都须命中,否则按漏墙处理（判决 ：6160-6174,
 *  wall>0=TooManyUnsafeWalls/无墙=HoleInWallIsTooBig,B2 起逐格执行） */
function hasLooseWallEvidence(st: TileStore, x: number, y: number): boolean {
  // TileID.Sets.HousingWalls（TileID.cs:377）：11 栅栏 / 386 高门 / 389
  const wallLike = (wx: number, wy: number): boolean => {
    const ii = st.idx(wx, wy);
    if (WALL_HOUSE.has(st.wall[ii])) return true;
    // ★G1谓词批(2026-09-04)：tile 支=原版 nactive 门（WorldGen.cs:6143/:6151
    //  `tile.nactive() && (tileSolid || HousingWalls)`）——flags 位读漏 !inActive 半边
    if (!st.isActive(wx, wy)) return false;
    return tileSolidLike(st.type[ii]) || HOUSING_WALL_TILES.has(sheetOf(st.type[ii]));
  };
  let horiz = false, vert = false;
  for (let k = -2; k <= 2; k++) {
    if (st.inBounds(x + k, y) && wallLike(x + k, y)) horiz = true;
    if (st.inBounds(x, y + k) && wallLike(x, y + k)) vert = true;
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
  // extraSolid 缺省=主链共享集 {379}（C-F4：原版 SpawnTownNPC 家族对 tileSolid[379]
  // 的临时翻转合成视角;显式传参仅 checkRoomEnclosure 床路径——同值）
  const extraSolid: ReadonlySet<number> | undefined = opts.extraSolid ?? MAIN_EXTRA_SOLID;
  const ignoreNeeds = opts.ignoreNeeds === true;
  // ★对抗修复批⑤B 2026-09-01（B3|R1-F3 种子帧自检）：vanilla 种子格与普通格走同一条
  // 处理管线——StartRoomCheck 把 (x,y) 直接入栈（cs:6016-6023）,首弹 CheckRoom 全量过
  // 邻居侧同款分支：nactive→实心 BlockingWall（:6108-6112）/开门 11 锚帧（:6113-6117）/
  // 高门开启态 389（:6118-6122）/翻板 386 边界帧（:6123-6127）/extraSolid 翻转窗。本仓
  // 这组谓词只在「邻格审视」时消费,种子自身从不过检 → 锚帧开门列/泡沫块当种子会把
  // 本应隔断的两室粘连泛起。入栈前补一次同一谓词任一命中即拒（查询入口 queryRoom/
  // checkRoomEnclosure 已各自预检实心+379,此处是泛洪内核级兜底,增量面=doorFrameBoundary）。
  const si = st.idx(sx, sy);
  const sT = st.type[si];
  const sDef = sT ? TILE_DEFS[sT] : undefined;
  const sSheet = sDef ? (sDef.vanilla?.sheet ?? -1) : -1;
  // ★幽灵保域（2026-09-03）：BlockingWall/BlockingOpenGate/extraSolid 三支全在
  //  nactive 门内（原版 WorldGen.cs:6108-6127 `Main.tile[x,y].nactive() → …`）
  //  ——幽灵格（flags=0,type≠0）不封房不作门界,种子帧自检同域放行
  //  ★G1谓词批(2026-09-04)：nactive=active&&!inActive——位读 (flags&1) 漏致动半边,
  //  已致动实心格会被误判房界（原版致动格可穿）→ 改读 isActive()
  if (st.isActive(sx, sy)
    && (tileSolidLike(sT)
      || (sT !== 0 && doorFrameBoundary(sSheet, st.frameX[si], st.frameY[si]))
      || (sT !== 0 && extraSolid.has(sSheet)))) {
    lastRoomCheckFail = 'notValid';   // BlockingWall/BlockingOpenGate 族同域（未设 failureReason,归 notValid 档）
    return null;
  }
  const tiles = new Set<number>();
  let hasTable = false, hasChair = false, hasLight = false, hasDoor = false;
  // ★对抗修复批④2026-09-01（C-F5）：roomHasStinkbug/roomHasEchoStinkbug 的泛洪局部等价物
  // （StartRoomCheck 头复位 cs:5986-5987 ↔ 本函数每次调用清零;CheckRoom 置位 :6128-6137）
  let hasStinkbug = false, hasEchoStinkbug = false;
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
    // ★对抗修复批④（C-F5）：臭虫旗与四件套同生命周期出参（并列新字段,四件套语义不动）
    if (needsOut) needsOut.stinkbug = needsOut.stinkbug || hasStinkbug;
    if (needsOut) needsOut.echoStinkbug = needsOut.echoStinkbug || hasEchoStinkbug;
  };

  while (head < queue.length) {
    const i = queue[head++];
    const x = i % st.w, y = (i / st.w) | 0;
    const t = st.type[i];
    const def = t ? TILE_DEFS[t] : undefined;
    // ★对抗修复批⑤B 2026-09-01（B2|R1-F2 宽松墙证据窗逐格执行）：vanilla CheckRoom
    // 对【每个被处理格】无条件跑五格横竖双向窗（WorldGen.cs:6139-6159 两向循环）,
    // 任一向证据缺失即整房判负（:6160-6174）。此前仅纯空气格跑窗、active 家具格整段
    // 跳过 = 单向偏松（蓝队 CONFIRMED：梁下悬空火把等无背墙家具被误放行）。「家具格
    // 豁免墙判定」的原语义仅指『自身算不算房墙』的首半判定,宽松证据窗是其上的独立
    // 复核闸,两者并列——本改动只拆 `!st.flags[i]` 门槛,窗口本体（wallLike:房墙 |
    // nactive&&(tileSolidLike|HousingWalls),含 k=0 自身）与两向全过要求零变化;
    // 自带房墙格两轴自证恒真,行为不变。
    if (!hasLooseWallEvidence(st, x, y)) {
      // WorldGen.CheckRoom 判决尾 ：6162-6171：有墙但非房墙 = TooManyUnsafeWalls（天然
      // 墙不安全）;无墙 = HoleInWallIsTooBig（漏墙）
      lastRoomCheckFail = st.wall[i] > 0 ? 'unsafeWalls' : 'hole';
      return null;
    }
    // ★G1谓词批(2026-09-04)：houseTile/臭虫置位同在 nactive 门内（WorldGen.cs:6108
    //  `if nactive → houseTile[type]=true` + :6128-6137 630/631）——已致动格不登记
    if (st.isActive(x, y) && def) {
      const sh = def.vanilla?.sheet ?? -1;
      markHouseTile(sh);
      // ★对抗修复批④（C-F5）：臭虫旗置位（CheckRoom cs:6128-6137 同构）。本仓
      // 泛洪队列格 = 原版 CheckRoom 处理过 solid/门界早退后的【房内非实心】格,
      // 边界邻格支（下方 markHouseTile 第二调用位）不入——630/631 非实心,原版
      // BlockingWall 早退(:6113-6117)同样先于置位行,口径一致
      if (sh === STINKBUG_SHEET) hasStinkbug = true;
      else if (sh === ECHO_STINKBUG_SHEET) hasEchoStinkbug = true;
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
      // 边界（CheckRoom cs:6108-6127 精确规则，见 doorFrameBoundary 注记）：
      // 实心主规则 + 开门锚帧/389/386 逐帧门件分支。原版实心支 :6108-6111 =
      // nactive && tileSolid → 平台地板封房、桌/砧/笼等家具（tileSolid=false）
      // 为房内格可穿透。
      // 原版先 roomTiles.Add 再拒绝（6076-6080）——边界格也入集合，
      // ScoreRoom 的 Housing_CheckIfInRoom(地板格) 依赖这一点
      const nsheet = ndef ? (ndef.vanilla?.sheet ?? -1) : -1;
      // ★幽灵保域（2026-09-03）：边界三支全在 nactive 门内（WorldGen.cs:6108-6127）
      //  ——幽灵格可穿透,泛洪继续（houseTile 登记同门,原版 :6109 在 nactive 内）
      //  ★G1谓词批(2026-09-04)：nactive=active&&!inActive——位读 (flags&1) 漏致动
      //  半边,已致动实心格会被误判房界阻断泛洪 → 改读 isActive()
      if (st.isActive(nx, ny)
        && (tileSolidLike(nt)
          || (nt !== 0 && doorFrameBoundary(nsheet, st.frameX[ni], st.frameY[ni]))
          || (nt !== 0 && extraSolid.has(nsheet)))) {
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
  // ★幽灵保域（2026-09-03）：房界只认活跃格（泛洪侧同口径——幽灵格非 BlockingWall,
  //  WorldGen.cs:6108 nactive 门）,幽灵残型继续下探
  //  ★G1谓词批(2026-09-04)：同口径 nactive=active&&!inActive（IsActive 门）,位读改
  //  isActive——已致动实心格非房界,下探/种子自检与泛洪边界三分支保持同一谓词
  while (fy < st.h - 2
    && !(st.isActive(sx, fy) && tileSolidLike(st.type[st.idx(sx, fy)]))) fy++;
  const startSolidLike = st.isActive(sx, sy) && tileSolidLike(st.type[st.idx(sx, sy)]);
  const standIdx = st.idx(sx, Math.max(sy, fy - 1));
  if (startSolidLike || fy >= st.h - 2 || !tiles.has(standIdx)) {
    lastRoomCheckFail = 'notValid';
    return null;
  }
  return { standX: sx, standY: fy - 1, tiles };
}

/**
 * 锚点 ±10 窗口内找一间无人入住的合格房屋。原版 QuickFindHome（1457 实测
 * WorldGen.cs:5654-5716）只对锚点校验：锚点自身（homeTile-1）→ home±1 九宫 → home±10
 * 螺旋，窗外不搜索——锚点 ±1 精查已由全格窗口覆盖（±10 窗含 ±1），
 * 螺旋的步长 2 粗采样不重刻（打分制需全格门锚，最小实现对齐）。
 * 房间枚举/多房打分为本仓库自有——原版 StartRoomCheck 自单点泛洪（SpawnTownNPC
 * :5345-5358 锚点须正好落在房内才成功），无多房择优；泛洪填充本身不受窗限制，
 * 与原版 CheckRoom 一致。多房择优：取 ScoreRoom 分最高者，同分取离锚点近。
 * 锚点来源（调用方负责，SpawnHomelessNPC :5014-5033 语义）：已安家 NPC 的 home
 * 随机取一；冷启无安家者回退出生点。
 * occupied = 已入住 NPC 的 home tile 列表（npcId 供同房豁免判定）。
 * askingNpcId = 申请入住者（ScoreRoom 占用豁免 + 共用房避让）。
 * ★SW-BO1 2026-09-07 退役注记：生产链最后两处消费（入驻环 ① homeless 自动安置/
 * ③ 新住户锚扫）已按原版 homeless 找家语义改走 quickFindHome（选址=自锚点泛洪
 * 首间房,非多房择优）——本函数降为 tests/sw-bj2-npc-housing 的「旧路径指纹」
 * 判例仪（宽房假阴性/窗内多房搬家两偏差的对照面），零生产消费,勿再接线。
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
        // ★幽灵保域（2026-09-03）：上方格"非实心"判定补 flags bit0（幽灵格=非实心,
        //  泛洪可自其上方格起探——与 floodRoom 边界 nactive 门同口径）
        //  ★G1谓词批(2026-09-04)：同口径升级 isActive（nactive=active&&!inActive,
        //  已致动实心格可穿）——探针谓词与泛洪边界分支对齐
        const ai = st.idx(x, y - 1);
        if (!leftSame && st.inBounds(x, y - 1)
          && !(st.isActive(x, y - 1) && tileSolidLike(st.type[ai]))) {
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

// ================= QuickFindHome（WorldGen.cs:5654-5716,1457=1458 同文；SW-BJ2 2026-09-06） =================

export interface QuickFindHomeOutcome {
  /** true = 原版守卫未过（homeTile 出界,cs:5661）→ 整个 QuickFindHome 无操作：
   *  调用方必须保持原状（已安家者不重扫、无家者不转有家——vanilla 字面） */
  noop: boolean;
  /** 受理成功时的新家站立格（vanilla 写 homeTileX/Y=bestX/bestY 地板行,本仓换算
   *  站立行 y-1）；null = 转无家（homeless=true,cs:5706-5713） */
  home: { x: number; y: number } | null;
}

/**
 * WorldGen.QuickFindHome 1:1（1457 实测 WorldGen.cs:5654-5716;1458 :5654 同文零改动）。
 * ★SW-BJ2 2026-09-06 用户实报「NPC 入住跟着玩家走」根因修复：原版复核锚 = NPC 的
 * homeTile（房位）,与玩家位置【零】耦合;三步扫描全部「自扫描点泛洪出所在房间」,
 * 不存在「±10 窗内枚举门锚再多房择优」的语义——旧 findFreeHouse 路径在「门/入口
 * 距 home 站格 >10 格」的宽房/远门房每 7200t 复核必判无房 → NPC 被误转无家 →
 * 每 tick 近玩家回收链（CheckForHousesNearAPlayer）把它迁进玩家视野内的空房
 * =「家跟着玩家搬」。
 *
 * 逐式对照（行号 1457）：
 *  · 守卫 :5661 `homeTileX>10 && homeTileY>10 && homeTileX<maxTilesX-10 && homeTileY<maxTilesY`
 *    ——未过 = 整函数无操作（ homeless 态保持不变;入参按 vanilla homeTile 口径=地板行）。
 *  · step1 :5662-5664 `StartRoomCheck(homeTileX, homeTileY - 1)`——自 homeTile 上一行
 *    （=本仓 home 站格）直锚泛洪所在房间;成功即跳过 2/3 步。
 *  · step2 :5665-5673 3×3：i∈[hx-1,hx+1] × j∈[hy-1,hy+1]（vanilla homeTileY 口径）。
 *  · step3 :5674-5682 ±10 步长 2 网格：k∈[hx-10,hx+10] / l∈[hy-10,hy+10] 均 step2。
 *    ★原版字面 quirk：内层 `j<…+2 && !StartRoomCheck(i,j)` 只在【同列】首成功处停,
 *    外层无 break——后续列的探测会覆写 canSpawn（终值=最后一列的探测结果,后列成功
 *    即以该列房间受理;前列成功被冲掉）。本移植逐字保留该 quirk,勿"修好"它。
 *  · 泛洪语义 = StartRoomCheck（:5996-6046）：纯围合+尺寸+漏墙,【无】RoomNeeds/站立
 *    尾程（ignoreNeeds+requireStand:false 同构）,tileSolid[379] 翻转窗 = 本仓
 *    MAIN_EXTRA_SOLID 缺省（floodRoom :537）。
 *  · RoomNeeds :5686-5690：对【最后泛出的房间】四旗判（本仓 flags 由 flush 出参携带）。
 *  · ScoreRoom(npc,type) :5690-5692 + IsRoomConsideredOccupiedForNPCIndex :5694-5696
 *    → 本仓 scoreRoom（占用返回 -1 一体覆盖两支）。
 *  · 成功 :5698-5705 写 homeTileX/Y=bestX/bestY + homeless=false（本仓站立格换算）;
 *    任一失败 :5706-5713 homeless=true。
 *  · CheckSpecialTownNPCSpawningConditions（:5684-5686,松露居所门）留在调用方
 *    （Game 层持 world flags）,对【找到的房】复核——vanilla 门位在 RoomNeeds 之前,
 *    结果等价（该门失败同样只是转无家）。
 *  入参 (homeTileX, homeTileY) = vanilla homeTile 口径【地板行】;本仓 home.y 为站立
 *  行,调用方传 home.y+1（helper 内部换算 step1 种子=站立行）。
 */
export function quickFindHome(
  st: TileStore,
  occupied: ReadonlyArray<{ x: number; y: number; npcId?: number }>,
  homeTileX: number, homeTileY: number,
  askingNpcId = -1,
): QuickFindHomeOutcome {
  // vanilla 守卫（cs:5661）——注意 homeTileY < maxTilesY 无 -10 截断,逐字
  if (!(homeTileX > 10 && homeTileY > 10 && homeTileX < st.w - 10 && homeTileY < st.h)) {
    return { noop: true, home: null };
  }
  const probe = (x: number, y: number): { ok: boolean; q: HousingQueryResult } => {
    const q = queryRoom(st, x, y, { ignoreNeeds: true, requireStand: false });
    return { ok: q.room != null, q };
  };
  const fy = homeTileY - 1;   // vanilla step1 种子行（=本仓 home 站立行）
  // step1 :5662-5664
  let cur = probe(homeTileX, fy);
  let ok = cur.ok;
  // step2 :5665-5673（仅 step1 失败;★quirk:外层无 break,终值=末列结果）
  if (!ok) {
    for (let i = homeTileX - 1; i < homeTileX + 2; i++) {
      for (let j = fy; j < fy + 3; j++) {
        const r = probe(i, j);
        cur = r;
        if (r.ok) break;
      }
      ok = cur.ok;
    }
  }
  // step3 :5674-5682（仅 1/2 步全失败;同 quirk——终值=k=hx+10 列的探测结果）
  if (!ok) {
    for (let k = homeTileX - 10; k <= homeTileX + 10; k += 2) {
      for (let l = homeTileY - 10; l <= homeTileY + 10; l += 2) {
        const r = probe(k, l);
        cur = r;
        if (r.ok) break;
      }
      ok = cur.ok;
    }
  }
  const room = cur.q.room;
  if (!ok || !room) return { noop: false, home: null };
  // RoomNeeds :5686-5690（四旗齐备;flags 随 flush 出参,见 floodRoom :580-588）
  const f = cur.q.flags;
  if (!(f.door && f.table && f.chair && f.light)) return { noop: false, home: null };
  // ScoreRoom + IsRoomConsideredOccupiedForNPCIndex :5690-5696（占用 → hiScore=-1）
  const s = scoreRoom(st, room, occupied, askingNpcId);
  if (s.score <= 0) return { noop: false, home: null };
  // 成功支 :5698-5705（bestX/bestY=地板行 → 本仓站立行 y-1）
  return { noop: false, home: { x: s.x, y: s.y - 1 } };
}

// ================= 住房查询/分配（原版住房界面 MoveTownNPC + moveRoom，2026-08-15 B 方案） =================

/** 房屋需求旗标（1457 实测 RoomNeeds def :5601 起,四布尔；填充由 floodRoom 完成，失败时也保留已见项）
 *  ★对抗修复批④2026-09-01（C-F5）：并列新增臭虫否决旗二枚——非四件套成员（RoomNeeds
 *  语义不动），置位=CheckRoom cs:6128-6137、复位=StartRoomCheck 头/每次泛洪局部
 *  （cs:5986-5987），随 flush 与四件套同生命周期出参；queryRoom/housingCheckAt 返回
 *  形状向后兼容（仅增键,消费面皆按名读取）。 */
export interface RoomNeedsFlags {
  table: boolean; chair: boolean; light: boolean; door: boolean;
  /** 房内含臭虫封锁块（roomHasStinkbug，cs:6128-6133；置位→受理门否决档 'stinkbug'） */
  stinkbug: boolean;
  /** 房内含幽灵臭虫封锁块（roomHasEchoStinkbug，cs:6135-6137；'echoStinkbug' 档） */
  echoStinkbug: boolean;
}

/** 查询失败原因（TownNPCRoomCheckFailureReason 对齐 + 我们的合成档；
 *  'standing'=★C-F8/F-13 数据位（四件套齐全但 ScoreRoom 无正分站位,hasStandingSpace=
 *  false）——UI 文案已接专项键 TownNPCHousingFailureReasons.RoomHasNoStandingSpace,
 *  ★对抗修复批④2026-09-01 C-F8 收尾）;
 *  'stinkbug'/'echoStinkbug'=★C-F5 新增档：MoveTownNPC 臭虫否决门命中（cs:4696-4718，
 *  宠物申请者豁免在 housingCheckAt 门内判；原文案键 RoomHasAStinkbug/
 *  RoomHasAnEchoStinkbug,两档按 vanilla 报文序先常规臭虫后幽灵臭虫）。 */
export type HousingFailReason =
  | 'ok' | 'edge' | 'solid' | 'tooBig' | 'tooSmall' | 'hole' | 'occupied' | 'evil'
  | 'needs' | 'standing' | 'stinkbug' | 'echoStinkbug';

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
  opts: Pick<FloodOpts, 'ignoreNeeds' | 'extraSolid' | 'requireStand'> = {}): HousingQueryResult {
  const flags: RoomNeedsFlags = {
    table: false, chair: false, light: false, door: false,
    stinkbug: false, echoStinkbug: false,
  };
  if (x < 10 || y < 10 || x >= st.w - 10 || y >= st.h - 10) {
    return { room: null, flags, reason: 'edge' };
  }
  // 起点实心（StartedInASolidTile :6025-6032）——原版仅置 canSpawn=false 后继续
  // 泛洪（同轮后续检查会失败）；此处直接判失败等价（实心种子的泛洪无意义）。
  // ★C-F4：Main.tileSolid[379] 翻转窗内种子格同判实心（同构 checkRoomEnclosure 预检）
  // ★G1谓词批(2026-09-04)：原版门= nactive && tileSolid（WorldGen.cs:6025）——位读
  //  改 isActive（漏致动半边,已致动实心格不是 StartedInASolidTile）
  if (st.isActive(x, y)
    && (tileSolidLike(st.type[st.idx(x, y)])
      || MAIN_EXTRA_SOLID.has(sheetOf(st.type[st.idx(x, y)])))) {
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
 * ★★对抗修复批④2026-09-01（C-F5 臭虫否决链落地）：门序对齐 MoveTownNPC 原序——
 * RoomNeeds（queryRoom 内 requireFurniture 档）→ 臭虫否决（cs:4696-4718）→
 * ScoreRoom 占用/邪恶/站位。宠物豁免面：`IsTownPet[type]`（NPCID.cs:4446 全集
 * 与本仓 housingCategory 宠物集逐一相等,复用 npcHousingCategory 判——原版两表
 * 独立定义但成员相同,勿混同其语义来源）;申请者 -1（查询器"?"问号档）=非宠物,
 * 否决生效即报臭虫文案（vanilla 同）。findFreeHouse（QuickFindHome 语义）不过此门，
 * 与原版一致（QuickFindHome :5633-5716 全程不查 roomHasStinkbug 二旗）。
 */
export function housingCheckAt(
  st: TileStore, occupied: Array<{ x: number; y: number; npcId?: number }>,
  x: number, y: number, askingNpcId = -1,
): HousingQueryResult & { score: number } {
  // 主链 extraSolid 缺省（C-F4）：queryRoom/floodRoom 默认带 MAIN_EXTRA_SOLID{379}
  const q = queryRoom(st, x, y);
  if (!q.room) return { ...q, score: 0 };
  // ★对抗修复批④（C-F5）：臭虫否决先于占用/邪恶评分位判定（cs:4694-4718 位于
  // ScoreRoom 调用之前）。score 保持 0（不反映 ScoreRoom——原版此处尚未打分）；
  // 双旗齐备时报常规臭虫档（vanilla stopOnFail 首支即断，:4697 先于 :4706）
  if ((q.flags.stinkbug || q.flags.echoStinkbug) && npcHousingCategory(askingNpcId) !== 1) {
    return { ...q, room: q.room, reason: q.flags.stinkbug ? 'stinkbug' : 'echoStinkbug', score: 0 };
  }
  const s = scoreRoom(st, q.room, occupied, askingNpcId);
  if (s.score < 0) return { ...q, room: q.room, reason: 'occupied', score: -1 };
  if (s.roomEvil) return { ...q, room: q.room, reason: 'evil', score: s.score };
  // ★C-F8：走到这里四件套必齐（floodRoom requireFurniture 已过）——score≤0 且
  // hasStandingSpace=false = 无可用站位（杂务挤占/头顶压分全负），单列数据位
  if (s.score <= 0) {
    return { ...q, room: q.room, reason: s.hasStandingSpace ? 'needs' : 'standing', score: 0 };
  }
  return { ...q, reason: 'ok', score: s.score };
}

// ================= 外扩测试盒 + 松露人居所条件（Housing_GetTestedRoomBounds cs:5929-5951 /
//  CheckSpecialTownNPCSpawningConditions(160) cs:4890-4918，★★对抗修复批②2026-09-01 C-F6/E） =================

export interface TileRect { x0: number; x1: number; y0: number; y1: number }

/** 房间包围盒外扩盒（GetTestedRoomBounds：膨胀 40 + 缘距 X±6/Y±4 →
 *  startX=rx1-46 / endX=rx2+46 / startY=ry1-44 / endY=ry2+44，[5,max-6] 钳制；
 *  hoisted function——scoreRoom 邪恶度块与松露计数共用同一盒形勿再开副本） */
export function testedRoomBounds(
  st: TileStore, rx1: number, rx2: number, ry1: number, ry2: number,
): TileRect {
  return {
    x0: Math.max(5, rx1 - 46),
    x1: Math.min(st.w - 6, rx2 + 46),
    y0: Math.max(5, ry1 - 44),
    y1: Math.min(st.h - 6, ry2 + 44),
  };
}

/** 外扩盒蘑菇族计数（cs:4898-4911：i∈startX+1..endX-1 × j∈startY+2..endY+1 扫
 *  tile∈{70 草/71 植/72 树/528 藤}）。SceneMetrics.MushroomTileThreshold=100。 */
const MUSHROOM_SHEET = new Set([70, 71, 72, 528]);
export const MUSHROOM_TILE_THRESHOLD = 100;

/** room.tiles → 包围盒 → 外扩盒蘑菇计数（Game 入驻轮③/①''' 复核/UI 手动分配三路共用） */
export function expandedMushroomCount(st: TileStore, room: Room): number {
  let rx1 = st.w, rx2 = 0, ry1 = st.h, ry2 = 0;
  for (const i of room.tiles) {
    const x = i % st.w, y = (i / st.w) | 0;
    if (x < rx1) rx1 = x;
    if (x > rx2) rx2 = x;
    if (y < ry1) ry1 = y;
    if (y > ry2) ry2 = y;
  }
  const b = testedRoomBounds(st, rx1, rx2, ry1, ry2);
  let count = 0;
  for (let y = b.y0 + 2; y <= b.y1 + 1; y++) {
    for (let x = b.x0 + 1; x <= b.x1 - 1; x++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      if (st.flags[i] && MUSHROOM_SHEET.has(sheetOf(st.type[i]))) count++;
    }
  }
  return count;
}

/**
 * ★对抗修复批⑤B 2026-09-01（B4|R1-F5 松露地表门单源）：roomBottom（房内最深格 y）
 * ≤ floor(worldSurface)——本仓 groundLevel 同一标量口径;特小世界旁路
 * Main.NoFunctionalSurface（判据 worldSurface<=30.0,Main.cs:2721）免除该硬约束。
 * unlockedTruffleSpawn 置位 = 整门免检（vanilla 条件首查语义,CheckSpecialTownNPC
 * SpawningConditions cs:4890-4896 一带）。消费位统一收编本函数（★勿再开内联副本）：
 * Game 入驻轮 ①'' 房况复核 / ③ 新住户安置 / housingAssign 手动分配。
 */
export function truffleSurfaceOk(
  unlockedTruffleSpawn: boolean, roomBottom: number, surfaceLevel: number,
): boolean {
  if (unlockedTruffleSpawn) return true;
  if (surfaceLevel <= 30.0) return true;   // NoFunctionalSurface：特小世界（Main.cs:2721）
  return roomBottom <= Math.floor(surfaceLevel);
}

/** 松露现任房条件复核（①'' 复核环用）：自 home 站位点泛出所在房间后按外扩盒
 *  计数 ≥100 判定；泛不出房间=已失效=false。opts.surfaceLevel 提供时并行执行地表门
 *  （truffleSurfaceOk 单源）;未提供保持旧契约（仅蘑菇计数）。unlockedTruffleSpawn
 *  免检由调用方随 opts 附带（vanilla 条件首查 :4893-4895）。 */
export function truffleHomeConditionOk(
  st: TileStore, hx: number, hy: number,
  opts?: { unlockedTruffleSpawn?: boolean; surfaceLevel?: number },
): boolean {
  const q = queryRoom(st, hx, hy, { ignoreNeeds: true });
  if (!q.room) return false;
  if (opts?.surfaceLevel !== undefined) {
    let roomBottom = 0;
    for (const ti of q.room.tiles) {
      const ty = (ti / st.w) | 0;
      if (ty > roomBottom) roomBottom = ty;
    }
    if (!truffleSurfaceOk(opts.unlockedTruffleSpawn ?? false, roomBottom, opts.surfaceLevel)) return false;
  }
  return expandedMushroomCount(st, q.room) >= MUSHROOM_TILE_THRESHOLD;
}

// ================= 近玩家实时回收链（CheckForHousesNearAPlayer cs:72184-72215，
// ★★对抗修复批②2026-09-01 C-F1） =================

/**
 * 视野采样矩形（cs:72188-72190）：玩家中心 tile 坐标零尺寸矩形 Inflate(
 * MaxWorldViewSize.X/32, Y/32) 后 ClampToWorld(margin 10)。换算标定：
 * Main.MaxWorldViewSize=(1920,1200)（Main.cs:754-758 静态常量）÷32 =
 * X±60 / Y±37（int 除截断）。
 * ★任务蓝本曾按 2048×1200 推导 64×37.5——按反编译基准更正为 1920×1200
 * （CLAUDE.md「反编译源码是唯一标杆」）。
 */
export function nearHouseViewRect(st: TileStore, ptx: number, pty: number): TileRect {
  return {
    x0: Math.max(10, ptx - 60),
    x1: Math.min(st.w - 11, ptx + 60),
    y0: Math.max(10, pty - 37),
    y1: Math.min(st.h - 11, pty + 37),
  };
}

/**
 * 单玩家 300 点随机采样（cs:72193-72203 NextFromRectangle 均匀取点）：
 * 首个 wallHouse 背墙命中即返回该格坐标。rand 注入面=受控 rng 或 Math.random——
 * 近链采样天然非确定性判定（原版 Main.rand），非掷流锚（登记，与确定性掷流对拍无关）。
 */
export function sampleHouseSeed(
  st: TileStore, rect: TileRect, rand: () => number,
): [number, number] | null {
  for (let j = 0; j < 300; j++) {
    const x = rect.x0 + Math.floor(rand() * (rect.x1 - rect.x0 + 1));
    const y = rect.y0 + Math.floor(rand() * (rect.y1 - rect.y0 + 1));
    if (!st.inBounds(x, y)) continue;
    if (WALL_HOUSE.has(st.wall[st.idx(x, y)])) return [x, y];
  }
  return null;
}

/**
 * SpawnTownNPC 受理核（cs:5332-5536 的房屋面顺序重建）：StartRoomCheck（种子预检 +
 * 单点直锚泛洪,queryRoom 承担,:5340）→ ★对抗修复批⑤B 2026-09-01（B1|R1-F1）补回
 * RoomNeeds 门（默认 requireFurniture 家具档,早退先于臭虫门与 ScoreRoom——vanilla
 * cs:5344-47,floodRoom 四旗 flush 后直接判 !(door&&table&&chair&&light) → 'notValid'
 * → q.room=null）→ 臭虫否决门（★对抗修复批④ C-F5,cs:5348-5355）→ ScoreRoom(-1,n)
 * hiScore>0（:5356）。bestX/bestY = score 位地板格,vanilla homeTile 写 bestX/bestY,
 * 本仓 home 约定=站立格（地板上一行 s.y-1,同 updateTownNpcArrival ① 口径）;迁入
 * （RelocatedHomeless :5367-5383）与新住户（Successful）共用同一 home 位。ok=false 时
 * Blocked/FoundHouseNoSpawn 分支由调用方依 mover 有无落账（受理通过但无可迁者才缓存
 * LastFoundHouse :5535,早退支【全部】不缓存——B1 后家具缺失房在 RoomNeeds 支即出,
 * vanilla 到不了缓存支）。★C-F5 门位：原版豁免 = `IsTownPet[num] &&
 * TownManager.HasRoom(num)`（宠物持登记房位者;cs:5351 与 MoveTownNPC 面的无条件宠物
 * 豁免不同）——本仓无 TownManager 房位面,故此处对全部申请者一律否决（含近链流浪
 * 宠物——vanilla 该情形 flag=false 同样 Blocked）；种子房含臭虫时 ok=false ⇒
 * checkHousesNearAPlayer 走 Blocked 早退支【不】缓存 LastFoundHouse。
 */
export interface HousingAcceptanceResult {
  ok: boolean;
  /** 新家站位（ok=true 才有值） */
  home: { x: number; y: number } | null;
  /** 受理现场房间（失败也带——松露外扩复评/占用校验复评用） */
  room: Room | null;
}
export function acceptTownNPCAtHouse(
  st: TileStore,
  occupied: ReadonlyArray<{ x: number; y: number; npcId?: number }>,
  x: number, y: number, askingNpcId = -1,
): HousingAcceptanceResult {
  // ★对抗修复批⑤B 2026-09-01（B1|R1-F1）：去掉 {ignoreNeeds:true} 短路,改走默认
  // requireFurniture 家具档——RoomNeeds 门由 floodRoom 终检直接判四旗（flush 已先行,
  // 判据 !(flags.door&&flags.table&&flags.chair&&flags.light)）,缺件房 q.room=null,
  // 在此与几何失败同形返回 Blocked（vanilla cs:5344-47 RoomNeeds 早退先于臭虫门
  // :5348-52 与 ScoreRoom :5356）。近链（checkHousesNearAPlayer 迁入支）与 Game 快
  // 路径（LastFoundHouse 生人安置支）两条消费路因此天然拒绝无家具房,不必各加门;
  // vanilla 此处 Blocked 即到不了缓存支（LastFoundHouse :5535 位于全过之后）。
  const q = queryRoom(st, x, y);
  if (!q.room) return { ok: false, home: null, room: null };
  // ★对抗修复批④（C-F5）：臭虫否决先于 ScoreRoom（原版 :5348-5355 在 ScoreRoom 前、
  // FindNPCLookingForHomeThatCanMoveIn 后——mover 先选出不影响结果,mover 只在受理
  // 通过后才有意义）。SpawnTownNPC 面无无条件宠物豁免（见上注 TownManager 差异）
  if (q.flags.stinkbug || q.flags.echoStinkbug) {
    return { ok: false, home: null, room: q.room };
  }
  const s = scoreRoom(st, q.room, occupied, askingNpcId);
  if (s.score <= 0) return { ok: false, home: null, room: q.room };
  return { ok: true, home: { x: s.x, y: s.y - 1 }, room: q.room };
}

/** 迁入候选视图（Housing 层不解实体依赖：ref 由调用方携带实体指针回投） */
export interface NearChainNpcView<K = unknown> {
  key: string;                 // townnpc key（'old_man' 排除）
  npcId: number;               // 原版 NPC id
  bound?: boolean;             // 被绑态不迁（AI_007 bound 原地语义）
  home?: { x: number; y: number } | null;
  ref: K;
}

/**
 * 近链流浪者迁入资格（FindNPCLookingForHomeThatCanMoveIn WorldGen.cs:5539-5547）：
 * ★SW-BO1 2026-09-07 补齐优先型配型——vanilla 门序 = `active && homeless &&
 * type == prioritizedTownNPCType && lookForHomeTimeout == 0 &&
 * CheckSpecialTownNPCSpawningConditions(type)`，mover 必须【同优先型】（锁由
 * Game 层 UpdatePrioritizedTownNPC 每 tick 刷新后传入;此前"任一 homeless 者"
 * 是锁未移植期的泛化,已按原文收回）。lookForHomeTimeout 本仓无 kickOut 链
 * （唯一置位面 WorldGen.kickOut :4797 未建模）恒 0,免检登记。
 * 160 松露人维持排除：vanilla 对它走 CheckSpecialTownNPCSpawningConditions(160)
 * = 对【采样房】的蘑菇居所复核——本函数无房间上下文,泛化迁入会把松露塞进无蘑菇房;
 * 37 老人（地牢驻点恒有 home 非 homeless）/453 骷髅商（vanilla 非 townNPC）/
 * 368 旅商（ homeless 恒真不可迁）为防御性保留（锁面结构性不可达这三型）。
 */
export function pickHomelessMover<K>(
  npcs: readonly NearChainNpcView<K>[], priorityType: number,
): NearChainNpcView<K> | null {
  for (const v of npcs) {
    if (!v.home && !v.bound && v.key !== 'old_man'
      && v.npcId !== 37 && v.npcId !== 453 && v.npcId !== 368 && v.npcId !== 160
      && v.npcId === priorityType) return v;
  }
  return null;
}

// ================= 优先型锁（UpdatePrioritizedTownNPC WorldGen.cs:72168-72183,SW-BO1） =================

/** 优先型锁扫描入参视图（Game 层实体桶的最小投影;纯函数无实体依赖） */
export interface PrioritizedLockNpcView {
  npcId: number;
  /** homeless（本仓 home=null 承接;bound 被缚型 vanilla 为独立非 townNPC 型,归入排除面） */
  homeless: boolean;
  /** 被缚待救态（vanilla 无此型=非 townNPC;等价排除） */
  bound: boolean;
  dead: boolean;
}

/**
 * UpdatePrioritizedTownNPC 扫描面 1:1（WorldGen.cs:72171-72182）：跳过 37 入口门
 * （Game 层持锁判）后，取 NPC 数组序第一个 `homeless && townNPC &&
 * lookForHomeTimeout == 0 && type != 368 && type != 160` 者的类型；无人合格返回
 * -1 = 【不写锁】（vanilla 循环无人命中即保持旧值——锁不因空扫而清零,死亡/昼夜/
 * 轮首清零是独立面）。本仓排除面：368/160 逐字 + 453（vanilla 非 townNPC,本仓
 * 以 TownNPC 建模须显式排）+ bound（vanilla 被缚型非 townNPC）。453 者注：37 老人
 * 本仓恒有 home（地牢口锚）不入 homeless 面,vanilla 同（NPC.cs:53899 homeless:false）。
 */
export function pickPrioritizedTownNPCType(
  npcs: readonly PrioritizedLockNpcView[],
): number {
  for (const v of npcs) {
    if (v.dead || v.homeless !== true || v.bound) continue;
    if (v.npcId === 368 || v.npcId === 160 || v.npcId === 453) continue;
    return v.npcId;
  }
  return -1;
}

// ================= 夜扫清场（UnspawnHomelessNPC WorldGen.cs:5127-5155,SW-BO1） =================

/** 夜扫入参 NPC 视图（Game 层实体桶最小投影） */
export interface HomelessSweepNpcView<K = unknown> {
  key: string;
  npcId: number;
  /** homeless（null=无家）——vanilla homeless 位 */
  home: { x: number; y: number } | null;
  /** homelessDespawn 标（SpawnHomelessNPC 生成位 :5110 专设;其余 homeless 者无此标） */
  homelessDespawn: boolean;
  bound: boolean;
  dead: boolean;
  /** 中心像素 + 尺寸（玩家邻域盒求交用） */
  cx: number; cy: number; w: number; h: number;
  ref: K;
}

export interface HomelessSweepOutcome<K> {
  /** 判离场者（active=false;vanilla 发 LegacyMisc.35 "{0} has departed!"） */
  despawned: NearChainNpcView<K> | null;
  /** 仅清标者（:5138-5142 !homeless||!active||!townNPC → homelessDespawn=false 不离场） */
  flagCleared: NearChainNpcView<K> | null;
  /** 玩家在安全邻域内 → 本 tick 跳过（:5146-5154 盒求交命中,标与实体均不动） */
  skippedByPlayer: boolean;
}

/** NPC.sWidth/sHeight（NPC.cs:6791/6793 静态 1920/1200）与 safeRangeX/Y
 *  （NPC.cs:6172/6174 = (sWidth/16)*0.52 取整 = 62/39）——安全邻域盒常量 */
export const NPC_SAFE_RANGE_X = 62;
export const NPC_SAFE_RANGE_Y = 39;
export const NPC_S_WIDTH = 1920;
export const NPC_S_HEIGHT = 1200;

/**
 * UnspawnHomelessNPC 单 tick 步 1:1（WorldGen.cs:5127-5155；调用门 = 主循环
 * `!dayTime || time > 48600.0`（Main.cs:66022-66028）→ Game 层昼夜判后每 tick 调）：
 * 取【数组序第一个】带 homelessDespawn 标的 NPC——
 *  · 已非 homeless / 已死 / 非城镇体（bound 等价）→ 只清标（:5138-5142）;
 *  · 任一 active 玩家盒与 NPC 中心安全邻域盒（sWidth/2+safeRange 外扩）相交
 *    → 本 tick 跳过（:5146-5154,标与实体均不动,下一 tick 重试）;
 *  · 否则离场（active=false;vanilla 先广播 LegacyMisc.35 + SendData(23)）。
 * 玩家域：本仓单机=本地玩家（MP 远端不入世界实体桶,同 checkForHousesNearAPlayer 登记）。
 */
export function unspawnHomelessSweep<K>(
  npcs: readonly HomelessSweepNpcView<K>[],
  players: ReadonlyArray<{ x: number; y: number; w: number; h: number }>,
): HomelessSweepOutcome<K> {
  const none: HomelessSweepOutcome<K> = { despawned: null, flagCleared: null, skippedByPlayer: false };
  let target: HomelessSweepNpcView<K> | null = null;
  for (const v of npcs) {
    if (!v.dead && v.homelessDespawn) { target = v; break; }
  }
  if (!target) return none;
  if (target.home != null || target.dead || target.bound) {
    return { ...none, flagCleared: { ...target } };
  }
  // :5145-5146 中心 tile → 中心像素盒外扩（Rectangle(num2*16+8-sWidth/2-safeRangeX, …,
  //   sWidth+safeRangeX*2, …) verbatim）
  const tx = Math.floor(target.cx / 16), ty = Math.floor(target.cy / 16);
  const rx = tx * 16 + 8 - NPC_S_WIDTH / 2 - NPC_SAFE_RANGE_X;
  const ry = ty * 16 + 8 - NPC_S_HEIGHT / 2 - NPC_SAFE_RANGE_Y;
  const rw = NPC_S_WIDTH + NPC_SAFE_RANGE_X * 2;
  const rh = NPC_S_HEIGHT + NPC_SAFE_RANGE_Y * 2;
  for (const p of players) {
    if (p.x < rx + rw && p.x + p.w > rx && p.y < ry + rh && p.y + p.h > ry) {
      return { ...none, skippedByPlayer: true };
    }
  }
  return { despawned: { ...target }, flagCleared: null, skippedByPlayer: false };
}

export interface NearChainOutcome<K> {
  /** wallHouse 命中采样点（null=本步未命中） */
  seedHit: [number, number] | null;
  /** 被迁入者（RelocatedHomeless 支：静默,不发公告） */
  relocated: NearChainNpcView<K> | null;
  /** 新家站位（迁入成功才有值；home={s.x,s.y-1}） */
  home: { x: number; y: number } | null;
  /** 合格但无可迁者 → LastFoundHouse 缓存位（FoundHouseNoSpawn 支 :5535） */
  foundHouseNoSpawn: [number, number] | null;
}

/**
 * CheckForHousesNearAPlayer 单玩家步（cs:72184-72215 纯算法面）：turnIndex = 主轮转序号
 * （Main.GameUpdateCount%ActivePlayersCount 对应,调用方每 tick 自增计数传入）；
 * players = active 玩家中心 tile 坐标表（active 全量,死亡幽灵仍计入——vanilla active 口径）。
 * priorityType = WorldGen.prioritizedTownNPCType 跨帧优先型锁当前值（Game 层每 tick
 * UpdatePrioritizedTownNPC 刷新后传入,SW-BO1）——mover 配型门见 pickHomelessMover。
 * 命中 wallHouse 即走受理：存在合格流浪者 → RelocatedHomeless【静默】;受理通过但无可迁
 * 者（canSpawnNewTownNPC=false 直落缓存支）→ LastFoundHouse 缓存;Blocked 各早退支与
 * vanilla 一致不缓存。此通路独立于入驻环锚池（vanilla 近链也不查锚池）。
 */
export function checkHousesNearAPlayer<K>(
  st: TileStore,
  players: ReadonlyArray<{ x: number; y: number }>,
  turnIndex: number,
  npcs: readonly NearChainNpcView<K>[],
  occupied: ReadonlyArray<{ x: number; y: number; npcId?: number }>,
  priorityType: number,
  rand: () => number = Math.random,
): NearChainOutcome<K> {
  const none: NearChainOutcome<K> = { seedHit: null, relocated: null, home: null, foundHouseNoSpawn: null };
  if (players.length === 0) return none;
  const pt = players[((turnIndex % players.length) + players.length) % players.length];
  const hit = sampleHouseSeed(st, nearHouseViewRect(st, pt.x, pt.y), rand);
  if (!hit) return none;
  const mover = pickHomelessMover(npcs, priorityType);
  // vanilla 顺序：FindNPCLookingForHomeThatCanMoveIn 先于 RoomNeeds/ScoreRoom 打分
  const acc = acceptTownNPCAtHouse(st, occupied, hit[0], hit[1], mover?.npcId ?? -1);
  if (!acc.ok) return { ...none, seedHit: hit };                       // Blocked：不缓存
  if (mover && acc.home) {
    return { seedHit: hit, relocated: mover, home: acc.home, foundHouseNoSpawn: null };   // 静默迁入
  }
  return { seedHit: hit, relocated: null, home: null, foundHouseNoSpawn: [hit[0], hit[1]] }; // FoundHouseNoSpawn
}
