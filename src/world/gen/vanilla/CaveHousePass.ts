// 原版 CaveHouseBiome 全量 1:1 移植(HouseUtils.cs + HouseBuilder.cs + 七主题 Builder)。
// 数量 = CaveHouseCount 35-40 × WorldArea/5040000(Configuration.json)。
// HouseBuilder.Place 原序:EmptyRooms → Stairs(对角平台+斜坡) → Doors(AreaOr 出口)
//   → Platforms(垂直出口) → SupportBeams(主题梁) → 沙漠 Bast 优先件 → FillRooms
//   (画/烛台交替 + 小堆/骨堆/雕像[含陷阱]/家具七选) → AgeRoom(七主题蚀变) →
//   Chests(四级联) → 丛林磨刀站/沙漠提炼机。
// 主题参数取各 *HouseBuilder.cs 构造;画表 = RandHousePicture/Desert(cs:35286/35336);
// 蚀变 = 各主题 AgeRoom override——原版 WorldUtils.Gen 链逐条解释执行(见下方
//   applyChain:Dither 参数是失败率 + Blotches 随机矩形扇出)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { placeBuriedChest, type ChestSink } from './BuriedChestsPass';
import { placeDoorClosed } from '../../Door';
import { STATUE_LIST, STATUES_WITH_TRAPS, placeStatueTrap } from './StatuesPass';
import { addProtectedStructure, canPlaceStructure } from './GenState';
import { flipGenSolid, genSolidType, vanGenSolidType } from './GenSolid';

type Rect = { x: number; y: number; w: number; h: number };

// ---------- 七主题参数表(各 *HouseBuilder.cs 构造) ----------
type Theme = 'wood' | 'ice' | 'jungle' | 'desert' | 'granite' | 'marble' | 'mushroom';
interface ThemeDef {
  tile: number; wall: number; beam: number; door: number; platformStyle: number;
  chestStyle: number; chestTile2?: boolean; tables2?: boolean;
  table: number; workbench: number; piano: number; bookcase: number;
}
function sheetTile(sheet: number): number {
  for (let id = 0; id < TILE_DEFS.length; id++) {
    const d = TILE_DEFS[id];
    if (d && d.vanilla?.sheet === sheet && d.key.startsWith('v_')) return id;
  }
  return -1;
}
const THEMES: Record<Theme, ThemeDef> = {
  wood:     { tile: T.WOOD, wall: 27, beam: TILE_BY_KEY['v_124_wooden_beam']!, door: 0, platformStyle: 0, chestStyle: 1, table: 0, workbench: 0, piano: 0, bookcase: 0 },
  ice:      { tile: TILE_BY_KEY['v_321_boreal_wood']!, wall: 149, beam: TILE_BY_KEY['v_574_boreal_beam']!, door: 30, platformStyle: 19, chestStyle: 11, table: 28, workbench: 23, piano: 23, bookcase: 25 },
  jungle:   { tile: TILE_BY_KEY['v_158_rich_mahogany']!, wall: 42, beam: TILE_BY_KEY['v_575_rich_mahogany_beam']!, door: 2, platformStyle: 2, chestStyle: 8, table: 2, workbench: 2, piano: 2, bookcase: 12 },
  desert:   { tile: TILE_BY_KEY['sandstone']!, wall: 187, beam: TILE_BY_KEY['v_577_sandstone_column']!, door: 43, platformStyle: 42, chestStyle: 10, chestTile2: true, tables2: true, table: 7, workbench: 39, piano: 38, bookcase: 39 },
  granite:  { tile: TILE_BY_KEY['v_369_smooth_granite_block']!, wall: 181, beam: TILE_BY_KEY['v_576_granite_column']!, door: 34, platformStyle: 28, chestStyle: 50, table: 33, workbench: 29, piano: 28, bookcase: 30 },
  marble:   { tile: TILE_BY_KEY['v_357_smooth_marble_block']!, wall: 179, beam: TILE_BY_KEY['v_561_marble_column']!, door: 35, platformStyle: 29, chestStyle: 51, table: 34, workbench: 30, piano: 29, bookcase: 31 },
  mushroom: { tile: TILE_BY_KEY['v_190_glowing_mushroom_block']!, wall: 74, beam: TILE_BY_KEY['v_578_mushroom_beam']!, door: 6, platformStyle: 18, chestStyle: 32, table: 27, workbench: 7, piano: 22, bookcase: 24 },
};

const PLATFORM = TILE_BY_KEY['platform']!;
const CANDELABRA = TILE_BY_KEY['candelabra']!;
const SMALL_PILE = TILE_BY_KEY['v_185_small_decos']!;
const COBWEB = TILE_BY_KEY['v_51_cobweb']!;
const STALACTITE = TILE_BY_KEY['v_165_cave_decos']!;
const VINE62 = TILE_BY_KEY['v_62_jungle_vines']!;
const SHROOM71 = TILE_BY_KEY['v_71_mushroom_plant']!;
const ICE161 = TILE_BY_KEY['ice']!;
const SNOW147 = TILE_BY_KEY['snow']!;
const MUD59 = TILE_BY_KEY['mud']!;
const JUNGLE60 = TILE_BY_KEY['v_60_jungle_grass_block']!;
const MUSH70 = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const GRANITE368 = TILE_BY_KEY['v_368_granite_block']!;
const MARBLE367 = TILE_BY_KEY['v_367_marble_block']!;
const HARDSAND397 = TILE_BY_KEY['hardened_sand']!;
const CHEST2 = TILE_BY_KEY['v_467_chests_group_2']!;
const STATUE_105 = sheetTile(105);
const STATUE_349 = sheetTile(349);
// BasicChest 族(TileID.cs:315 = {21,467})——CaveHouseBiome 前置拒绝扫描用
const CHEST21 = TILE_BY_KEY['chest']!;
// PlaceTight 短路件:231 幼虫(WorldGen.cs:38343)
const LARVA231 = TILE_BY_KEY['v_231_larva']!;
// SkipTilesDuringWallAging(HouseBuilder.cs:22 = {245,246,240,241,242} 画/挂件族)
const SKIP_AGING_TILES = [sheetTile(245), sheetTile(246), sheetTile(240), sheetTile(241), sheetTile(242)];
// 评分用
const SC0 = TILE_BY_KEY['stone']!;
const SC1 = T.DIRT;
const SC59 = TILE_BY_KEY['mud']!;
const SC147 = TILE_BY_KEY['snow']!;
const SC161 = TILE_BY_KEY['ice']!;
const SC53 = TILE_BY_KEY['sand']!;
const SC396 = TILE_BY_KEY['sandstone']!;
const SC397 = TILE_BY_KEY['hardened_sand']!;
const SC368 = TILE_BY_KEY['v_368_granite_block']!;
const SC367 = TILE_BY_KEY['v_367_marble_block']!;

const solidAt = (st: TileStore, x: number, y: number) =>
  st.inBounds(x, y) && !!st.flags[st.idx(x, y)] && genSolidType(st.type[st.idx(x, y)]);
const activeAt = (st: TileStore, x: number, y: number) => st.inBounds(x, y) && !!st.flags[st.idx(x, y)];

// ---------- 房间生成(HouseUtils) ----------
function findRoom(st: TileStore, ox: number, oy: number): Rect {
  let lx = ox;
  for (let i = 0; i < 25 && !solidAt(st, lx, oy); i++) lx--;
  let rx = ox;
  for (let i = 0; i < 25 && !solidAt(st, rx, oy); i++) rx++;
  const rect: Rect = { x: ox, y: oy, w: 0, h: 0 };
  if (ox - lx > rx - ox) {
    rect.x = lx;
    rect.w = Math.max(15, Math.min(30, rx - lx));
  } else {
    rect.w = Math.max(15, Math.min(30, rx - lx));
    rect.x = rx - rect.w;
  }
  let upL = oy;
  for (let i = 0; i < 10 && !solidAt(st, lx, upL); i++) upL--;
  let upR = oy;
  for (let i = 0; i < 10 && !solidAt(st, rx, upR); i++) upR--;
  rect.h = Math.max(8, Math.min(12, Math.max(oy - upL, oy - upR)));
  rect.y = oy - rect.h;
  return rect;
}

function solidPct(st: TileStore, r: Rect): number {
  let n = 0;
  for (let x = r.x; x < r.x + r.w; x++) {
    for (let y = r.y; y < r.y + r.h; y++) if (solidAt(st, x, y)) n++;
  }
  return n / (r.w * r.h);
}

function createRooms(st: TileStore, rng: RNG, ox: number, oy: number): Rect[] {
  let py = oy;
  for (let i = 0; i < 200 && !solidAt(st, ox, py); i++) py++;
  if (!solidAt(st, ox, py) || py === oy) return [];
  const main = findRoom(st, ox, py);
  const above = findRoom(st, main.x + (main.w >> 1), main.y + 1);
  const below = findRoom(st, main.x + (main.w >> 1), main.y + main.h + 10);
  below.y = main.y + main.h - 1;
  const pctAbove = solidPct(st, above);
  const pctBelow = solidPct(st, below);
  main.y += 3; above.y += 3; below.y += 3;
  const rooms: Rect[] = [];
  if (rng.next() > pctAbove + 0.2) rooms.push(above);
  rooms.push(main);
  if (rng.next() > pctBelow + 0.2) rooms.push(below);
  rooms.sort((a, b) => a.y - b.y);
  return rooms;
}

function getHouseType(st: TileStore, rooms: Rect[]): Theme {
  const count = (t: number) => {
    let n = 0;
    for (const r of rooms) {
      for (let x = r.x - 10; x < r.x + r.w + 10; x++) {
        for (let y = r.y - 10; y < r.y + r.h + 10; y++) {
          if (activeAt(st, x, y) && st.type[st.idx(x, y)] === t) n++;
        }
      }
    }
    return n;
  };
  const scores: Array<[Theme, number]> = [
    ['wood', count(SC0) + count(SC1)],
    ['jungle', count(SC59) + count(JUNGLE60) * 10],
    ['mushroom', count(SC59) + count(MUSH70) * 10],
    ['ice', count(SC147) + count(SC161)],
    ['desert', count(SC397) + count(SC396) + count(SC53)],
    ['granite', count(SC368)],
    ['marble', count(SC367)],
  ];
  let best: [Theme, number] = scores[0];
  for (let i = 1; i < scores.length; i++) if (best[1] < scores[i][1]) best = scores[i];
  return best[0];
}

// ---------- 家具/陈设放置（2026-08-17 重写：PlaceTile 派发 1:1）----------
// FillRooms/cascadePlace 全部经 WorldGen.PlaceTile → 逐型专属放置器（锚点/前置
// 各异）。旧 placeFurniture 是"左对齐+底锚"通用几何——画作 240 偏 1 行、骨头/织机
// 3×2 偏 1 列、织机该 Fail 却放置（少查占用列）、小堆 1 格非 2 格——家具态错位
// 反噬 ① 蛛网 IsEmpty 与 ② 墙链 OnlyWalls 的掷位（house0 ② 238 vs vanilla 215
// 之外的剩余残差来源）。本层按 vanilla 放置器逐型转录（几何+门 1:1；帧公式尽量
// 对齐,渲染期量,不参与掷位）。

/** SolidTile2（WorldGen.cs:70178）：active && tileSolid && slope==0 && !half。
 *  ★tileSolid 须走 vanGenSolidType——Main.tileSolid[19]=true（Main.cs:7842，
 *  平台在原版生成期是实心），裸 genSolidType 会把平台当地板拒掉骨堆/雕像
 *  （house0 骨堆 (762..764,870) 下方 872 行是楼梯顶平台，实锤） */
function solid2(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  return st.flags[i] !== 0 && vanGenSolidType(st.type[i]) && st.slope[i] === 0 && st.half[i] === 0;
}

/** Main.tileSolidTop（sheet 空间，与 BuriedChestsPass.PC_SOLID_TOP 同表） */
const HOUSE_SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
const sheetOf = (st: TileStore, x: number, y: number): number => {
  const t = st.type[st.idx(x, y)];
  return TILE_DEFS[t]?.vanilla?.sheet ?? -1;
};

/** Place*Wall 族画作公共体：全格 !active && wall≠0 才放（画作真前置） */
function placeWallArt(st: TileStore, x0: number, y0: number, w: number, h: number, tile: number,
  fx: (dx: number) => number, fy: (dy: number) => number): boolean {
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      if (!st.inBounds(x0 + dx, y0 + dy)) return false;
      const i = st.idx(x0 + dx, y0 + dy);
      if (st.flags[i] !== 0 || st.wall[i] === 0) return false;
    }
  }
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) st.setTileSilent(x0 + dx, y0 + dy, tile, fx(dx), fy(dy));
  }
  return true;
}

/** 底承族公共体：每列下方 SolidTile2（186/187 族再拒 Boulders 垫）+ 全格 !active */
const BOULDERS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
function placeFloorObject(st: TileStore, x0: number, y0: number, w: number, h: number, tile: number,
  fx: (dx: number) => number, fy: (dy: number) => number, rejectBoulderFloor = false): boolean {
  for (let dx = 0; dx < w; dx++) {
    if (!solid2(st, x0 + dx, y0 + h)) return false;
    if (rejectBoulderFloor && st.inBounds(x0 + dx, y0 + h) && BOULDERS.has(sheetOf(st, x0 + dx, y0 + h))) return false;
  }
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      const i = st.idx(x0 + dx, y0 + dy);
      if (!st.inBounds(x0 + dx, y0 + dy) || st.flags[i] !== 0) return false;
    }
  }
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) st.setTileSilent(x0 + dx, y0 + dy, tile, fx(dx), fy(dy));
  }
  regHouseObj(st, x0, y0, w, h, 'floor');
  return true;
}

// ---------- 房内家具登记表（③ 清格击杀重验用）----------
interface HouseObj { x0: number; y0: number; w: number; h: number; kind: 'floor' | 'chand' }
/** 对象每格 → 对象元数据；placeHouse 头清空（对象生命周期=本屋） */
const houseObjCells = new Map<number, HouseObj>();
function regHouseObj(st: TileStore, x0: number, y0: number, w: number, h: number, kind: 'floor' | 'chand'): void {
  const obj: HouseObj = { x0, y0, w, h, kind };
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      if (st.inBounds(x0 + dx, y0 + dy)) houseObjCells.set(st.idx(x0 + dx, y0 + dy), obj);
    }
  }
}

/** SolidTileAllowBottomSlope（WorldGen.cs）：active && (tileSolid||tileSolidTop) && !half && 非顶坡 */
function supportOk(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;              // 界外恒 true（原版 InWorld 早退）
  const i = st.idx(x, y);
  if (st.flags[i] === 0) return false;
  if (!vanGenSolidType(st.type[i]) && !HOUSE_SOLID_TOP.has(TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1)) return false;
  if (st.half[i] !== 0) return false;
  if (st.slope[i] === 1 || st.slope[i] === 2) return false;  // 顶坡（平台正规顶帧例外略——房内地板无此形态）
  return true;
}

/**
 * ③ ClearTile(frameNeighbors:true) 四邻重验（Check3x2/Check2xX/CheckChand/CheckPile 的
 * KillTile 段）：支承行任一格失实（floor 族）/顶锚失实（吊灯）→ 整件清除。worldgen 期
 * KillTile 零掷（house1 ③ 掷数精确含击杀实证）。级联 KillTile 的再邻接重验不建模
 * （vanilla Check 链在 destroyObject 门内同样短路）。
 */
function killUnsupportedFurniture(st: TileStore, cx: number, cy: number): void {
  if (!st.inBounds(cx, cy)) return;
  const i = st.idx(cx, cy);
  if (st.flags[i] === 0) return;
  const obj = houseObjCells.get(i);
  if (!obj) return;                                  // 非登记家具（画作/蛛网/主题块）各有别的 Check，不在本路径
  let dead = false;
  if (obj.kind === 'chand') {
    const ai = st.idx(obj.x0 + 1, obj.y0 - 1);       // CheckChand：顶锚 nactive && tileSolid && !solidTop
    dead = st.flags[ai] === 0 || !vanGenSolidType(st.type[ai]) || HOUSE_SOLID_TOP.has(TILE_DEFS[st.type[ai]]?.vanilla?.sheet ?? -1);
  } else {
    for (let k = obj.x0; k < obj.x0 + obj.w; k++) {
      if (!supportOk(st, k, obj.y0 + obj.h)) { dead = true; break; }
    }
  }
  if (!dead) return;
  for (let dx = 0; dx < obj.w; dx++) {
    for (let dy = 0; dy < obj.h; dy++) {
      const ci = st.idx(obj.x0 + dx, obj.y0 + dy);
      houseObjCells.delete(ci);
      st.setTileSilent(obj.x0 + dx, obj.y0 + dy, 0);
    }
  }
}

/** WorldGen.PlaceTile 派发到各型放置器（FillRooms/cascadePlace 用到的型别全收） */
function placeFurniture(st: TileStore, key: string, x: number, y: number, style = 0, _anchor?: string): boolean {
  const t = TILE_BY_KEY[key];
  if (t === undefined) return false;
  const sheet = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  switch (sheet) {
    case 240: case 440: {           // Place3x3Wall(cs:44281)：(x-1,y-1) 3×3，style>35 行卷绕
      let s = style, row = 0;
      while (s > 35) { row++; s -= 36; }
      return placeWallArt(st, x - 1, y - 1, 3, 3, t, (dx) => s * 54 + dx * 18, (dy) => row * 54 + dy * 18);
    }
    case 245:                       // Place2x3Wall(cs:44595)：(x,y-1) 2×3
      return placeWallArt(st, x, y - 1, 2, 3, t, (dx) => style * 36 + dx * 18, (dy) => dy * 18);
    case 246:                       // Place3x2Wall(cs:44752)：(x-1,y) 3×2
      return placeWallArt(st, x - 1, y, 3, 2, t, (dx) => dx * 18, (dy) => style * 36 + dy * 18);
    case 241:                       // Place4x3Wall(cs:44874)：(x-1,y-1) 4×3
      return placeWallArt(st, x - 1, y - 1, 4, 3, t, (dx) => style * 54 + dx * 18, (dy) => dy * 18);
    case 242:                       // Place6x4Wall(cs:44959)：(x-2,y-2) 6×4
      return placeWallArt(st, x - 2, y - 2, 6, 4, t, (dx) => (style % 27) * 72 + dx * 18, (dy) => Math.floor(style / 27) * 108 + dy * 18);
    case 34: {                      // PlaceChand(cs:52753)：(x-1,y) 3×3 吊挂；门=九格 !active
      //   + (x,y-1) nactive && tileSolid && !tileSolidTop——【无下方承地门】(吊灯
      //   悬顶),曾误走 placeFloorObject 的 below 检查 → 房内吊灯全灭(room1 实锤)
      if (!st.inBounds(x, y - 1) || !solid2(st, x, y - 1) || HOUSE_SOLID_TOP.has(sheetOf(st, x, y - 1))) return false;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = 0; dy < 3; dy++) {
          if (!st.inBounds(x + dx, y + dy) || st.flags[st.idx(x + dx, y + dy)] !== 0) return false;
        }
      }
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = 0; dy < 3; dy++) {
          st.setTileSilent(x + dx, y + dy, t, Math.floor(style / 36) * 108 + (dx + 1) * 18, style * 54 + dy * 18);
        }
      }
      regHouseObj(st, x - 1, y, 3, 3, 'chand');
      return true;
    }
    case 14: case 26: case 86: case 87: case 88: case 89: case 114: case 187: case 215: case 217: case 218:
    case 377: case 469:             // Place3x2(cs:52097)：(x-1,y-1) 3×2，下方逐列 SolidTile2
      return placeFloorObject(st, x - 1, y - 1, 3, 2, t, (dx) => style * 54 + dx * 18, (dy) => dy * 18);
    case 186:                       // Place3x2 + InvalidTileForPilesOrSpeleothems（拒 Boulders 垫）
      return placeFloorObject(st, x - 1, y - 1, 3, 2, t, (dx) => style * 54 + dx * 18, (dy) => dy * 18, true);
    case 16: case 18: case 29: case 103: case 134: case 462:   // Place2x1(cs:47371)：(x,y) 2×1
      return placeFloorObject(st, x, y, 2, 1, t, (dx) => style * 36 + dx * 18, () => 0);
    case 94: case 95: case 97: case 98: case 99: case 100: case 125: case 126: case 172: case 173:
    case 287: case 751: case 752:   // Place2x2(cs:51352)：(x-1,y-1) 2×2（94 keg 在此）
      return placeFloorObject(st, x - 1, y - 1, 2, 2, t, (dx) => style * 36 + dx * 18, (dy) => dy * 18);
    case 101:                       // Place3x4(cs:51943)：(x-1,y-3) 3×4 + SquareTileFrame（零掷）
      return placeFloorObject(st, x - 1, y - 3, 3, 4, t, (dx) => style * 54 + dx * 18, (dy) => dy * 18);
    case 219:                       // case106 族 Place3x3(cs:53549 num=-2 段)：(x-1,y-2) 3×3
      return placeFloorObject(st, x - 1, y - 2, 3, 3, t, (dx) => style * 54 + dx * 18, (dy) => dy * 18);
    case 506:                       // Place2xX(case 104 族)：(x,y-2) 2×3
      return placeFloorObject(st, x, y - 2, 2, 3, t, (dx) => style * 36 + dx * 18, (dy) => dy * 18);
    default:
      return false;                 // 未收录型别保守拒绝（勿静默错位）
  }
}

/** 雕像(2×3,style*36 步长);STATUES_WITH_TRAPS 命中 → 邻近飞镖陷阱+接线 */
function placeStatue(st: TileStore, x: number, y: number, idx: number): boolean {
  const [sheet, style] = STATUE_LIST[idx];
  const tile = sheet === 349 ? STATUE_349 : STATUE_105;
  if (!tile || !st.inBounds(x + 1, y - 2)) return false;
  // Place2xX 前置(cs:39755)：下方双格 SolidTile2（旧缺此门）
  if (!solid2(st, x, y + 1) || !solid2(st, x + 1, y + 1)) return false;
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = -2; dy <= 0; dy++) {
      if (st.flags[st.idx(x + dx, y + dy)]) return false;
    }
  }
  // 雕像帧换行（Place2xX case 105，cs:39716-39720）：每行 55 列——
  // frameX=(style%55)*36、frameY=floor(style/55)*54（与 StatuesPass 同实现；
  // 此前单轴 style*36，style≥55 越界错位）
  const row = Math.floor(style / 55);
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      st.setTileSilent(x + dx, y - 2 + dy, tile, (style - row * 55) * 36 + dx * 18, row * 54 + dy * 18);
    }
  }
  regHouseObj(st, x, y - 2, 2, 3, 'floor');
  if (STATUES_WITH_TRAPS.has(idx)) placeStatueTrap(st, x, y);
  return true;
}

// ---------- 画(RandHousePicture cs:35336 / Desert cs:35286) ----------
const PIC_240 = [26, 28, 20, 21, 22, 24, 25, 33, 34, 35, 76, 77, 78, 79, 82, 96, 98, 100];
const PIC_245 = [0, 3, 5, 6, 14, -1, 19, 20, 21]; // -1 → 15+rng(4)
const PIC_246 = [1, 30, 31, 32, 33, 34, 35, 36];
function randHousePicture(rng: RNG): [string, number] {
  let n = rng.int(0, 3);
  if (n >= 3 && rng.int(0, 1) !== 0) n = rng.int(0, 2);
  if (n <= 1) return ['v_240_wall_hangings_3x3', PIC_240[rng.int(0, 17)]];
  if (n === 2) {
    let s = rng.int(0, 8);
    if (s === 0 && rng.int(0, 2) !== 0) s = rng.int(0, 8);
    const style = s === 5 ? 15 + rng.int(0, 3) : PIC_245[s];
    return ['v_245_paintings_2x3', style];
  }
  return ['v_246_paintings_3x2', PIC_246[rng.int(0, 7)]];
}
function randHousePictureDesert(rng: RNG): [string, number] {
  const n = rng.int(0, 3);
  if (n <= 1) return ['v_240_wall_hangings_3x3', [63, 64, 65, 66, 67, 68][rng.int(0, 5)]];
  if (n === 2) return ['v_245_paintings_2x3', 7 + rng.int(0, 1)];
  return ['v_242_paintings_6x4', 37 + rng.int(0, 5)];
}

// ---------- 原版 GenAction 链 1:1 解释器(Modifiers.cs / Actions.cs 逐条核实) ----------
// 三条权威语义(旧实现全部踩错,修复根因):
//  · Dither(p)(Modifiers.cs:621-635):p 是【失败率】——NextDouble() >= p 才放行,
//    即 Dither(0.85) 通过率仅 15%。旧实现把 0.85 当通过率(< 0.85 即过),七主题
//    蚀变量级整体取反(C1)。
//  · Blotches(Modifiers.cs:92-152,Apply :131-152):每点【先丢 1 掷】,再
//    NextDouble() < chance 决定是否成斑;成斑再掷 4 次(Next(1-minX,1)/Next(0,maxX)/
//    Next(1-minY,1)/Next(0,maxY))并把后续链应用到随机矩形(会外溢房外);未成斑
//    则原点继续。旧实现用自制哈希值噪声替斑,分布与掷骰数都不对(C2)。
//  · 链序 = 掷骰序:Dither/Blotches 永远排在 OnlyTiles/OnlyWalls 之前
//    (各 *HouseBuilder.cs AgeRoom),对房间矩形内每格都掷,失败短路后不耗 RNG(C3);
//    墙动作的 worldSurface 二选一按【房间】room.Y 判定(WoodHouseBuilder.cs:36 /
//    IceHouseBuilder.cs:32),非逐格。
type ChainStep =
  | { k: 'dither'; p: number }                                            // Modifiers.Dither
  | { k: 'blotches'; minX: number; maxX: number; minY: number; maxY: number; chance: number } // Modifiers.Blotches
  | { k: 'onlyTiles'; types: number[] }                                   // Modifiers.OnlyTiles(Modifiers.cs:238)
  | { k: 'onlyWalls'; types: number[] }                                   // Modifiers.OnlyWalls(Modifiers.cs:216)
  | { k: 'skipTiles'; types: number[] }                                   // Modifiers.SkipTiles(Modifiers.cs:392)
  | { k: 'isEmpty' }                                                      // Modifiers.IsEmpty(Modifiers.cs:539)
  | { k: 'offset'; dx: number; dy: number }                               // Modifiers.Offset(Modifiers.cs:603)
  | { k: 'setTileKeepWall'; tile: number }                                // Actions.SetTileKeepWall(Actions.cs:272)
  | { k: 'setTile'; tile: number }                                        // Actions.SetTile(Actions.cs:203)
  | { k: 'clearTile' }                                                    // Actions.ClearTile(Actions.cs:155)
  | { k: 'clearWall'; frame?: boolean }                                   // Actions.ClearWall(Actions.cs:171；frame=true → 四邻 SquareWallFrame 掷)
  | { k: 'placeWall'; wall: number }                                      // Actions.PlaceWall(Actions.cs:516)
  | { k: 'stalagtite' }                                                   // ActionStalagtite → WorldGen.PlaceTight
  | { k: 'vines'; min: number; max: number; vine: number };               // ActionVines

// ---------- 墙重帧掷（尾批 2-C ★房屋链欠掷 5 万主根因）----------
// Actions.PlaceWall/ClearWall(frameNeighbors:true) → WorldGen.SquareWallFrame(x,y)
// 【resetFrame:true 默认】→ Framing.WallFrame 中心格掷 Next(0,3)（Framing.cs:388-397，
// wallFrameNumber 重置）；墙 21 命中再掷 Next(2)。SquareWallFrame 本体对 8 邻格用
// resetFrame:false（零掷）。豁免：wall==0（早退）/wallLargeFrames∈{1,2}（查表分支
// 零掷——Main.cs:9652+ 全表 {224,323-330,179,146,147,167,185,274,354,355,358,359,
// 362,363,366}）。PlaceWall.Apply 序（Actions.cs:528-538）：置墙 → SquareWallFrame(x,y)
// → (x+1,y)/(x-1,y)/(x,y-1)/(x,y+1) 四邻（各中心格按彼时墙值判定掷否）。
// ClearWall(true) 同四邻序、无自格（WorldUtils.cs:67-76）。
const WALL_LARGE_FRAMES = new Set([224, 323, 324, 325, 326, 327, 328, 329, 330, 179, 146, 147, 167, 185, 274, 354, 355, 358, 359, 362, 363, 366]);
/** SquareWallFrame(x,y,resetFrame=true) 的中心格掷骰语义（结果不入墙帧——仅保流） */
function wallFrameResetRoll(st: TileStore, rng: RNG, x: number, y: number): void {
  if (x <= 0 || y <= 0 || x >= st.w - 1 || y >= st.h - 1) return;  // Framing.WallFrame 边界早退
  const w = st.wall[st.idx(x, y)];
  if (w === 0) return;                    // 墙 0 → 无掷
  if (WALL_LARGE_FRAMES.has(w)) return;   // 大帧墙查表分支 → 无掷
  rng.int(0, 2);                          // num2 = Next(0,3)
  if (w === 21) rng.int(0, 1);            // 墙 21 花墙 → Next(2)
}
/** Actions.PlaceWall（neighbors=true 恒真）逐格掷序 */
function placeWallRolled(st: TileStore, rng: RNG, x: number, y: number, wall: number): void {
  st.setWallSilent(x, y, wall);
  wallFrameResetRoll(st, rng, x, y);
  wallFrameResetRoll(st, rng, x + 1, y);
  wallFrameResetRoll(st, rng, x - 1, y);
  wallFrameResetRoll(st, rng, x, y - 1);
  wallFrameResetRoll(st, rng, x, y + 1);
}

/** GenAction.Apply 第 i 步 @ (x,y),失败短路返回 false(不执行后续步骤、不耗 RNG) */
function applyChain(st: TileStore, rng: RNG, steps: ChainStep[], i: number, x: number, y: number): boolean {
  if (i >= steps.length) return true;
  const s = steps[i];
  switch (s.k) {
    case 'dither':
      // Modifiers.cs:630-635:NextDouble() >= _failureChance 才 UnitApply
      return rng.next() >= s.p && applyChain(st, rng, steps, i + 1, x, y);
    case 'blotches': {
      rng.next();                                                    // 丢 1 掷(Modifiers.cs:132)
      if (rng.next() < s.chance) {                                   // 成斑判定(:133)
        const x0 = rng.int(1 - s.minX, 0);                           // Next(1-minX, 1)(:136)
        const x1 = rng.int(0, s.maxX - 1);                           // Next(0, maxX)(:137)
        const y0 = rng.int(1 - s.minY, 0);                           // Next(1-minY, 1)(:138)
        const y1 = rng.int(0, s.maxY - 1);                           // Next(0, maxY)(:139)
        let ok = true;                                               // flag |= !UnitApply(:140-145)
        for (let dx = x0; dx <= x1; dx++) {
          for (let dy = y0; dy <= y1; dy++) {
            if (!applyChain(st, rng, steps, i + 1, x + dx, y + dy)) ok = false;
          }
        }
        return ok;
      }
      return applyChain(st, rng, steps, i + 1, x, y);                // 未成斑原点继续(:148)
    }
    case 'onlyTiles': {
      if (!activeAt(st, x, y)) return false;                         // !active → Fail(:245)
      const t = st.type[st.idx(x, y)];
      return s.types.includes(t) && applyChain(st, rng, steps, i + 1, x, y);
    }
    case 'onlyWalls':
      // Blotches 扇出可外溢房外 1 格,读前兜底(房间本体 InWorld 10 边距本已安全)
      return st.inBounds(x, y) && s.types.includes(st.wall[st.idx(x, y)])
        && applyChain(st, rng, steps, i + 1, x, y);
    case 'skipTiles': {
      if (!activeAt(st, x, y)) return applyChain(st, rng, steps, i + 1, x, y); // !active 放行(:399)
      return !s.types.includes(st.type[st.idx(x, y)]) && applyChain(st, rng, steps, i + 1, x, y);
    }
    case 'isEmpty':
      return !activeAt(st, x, y) && applyChain(st, rng, steps, i + 1, x, y);
    case 'offset':
      return applyChain(st, rng, steps, i + 1, x + s.dx, y + s.dy);
    case 'setTileKeepWall':
      // Actions.cs:272-301:存墙→Clear(~(Wiring|Actuator))【液体/坡度/块漆全清】→
      //   写 type+active→还原墙(+墙帧)。setTileSilent 不清液体——液体清位补齐。
      if (st.inBounds(x, y)) {
        const ci = st.idx(x, y);
        st.liquid[ci] = 0;
        st.liquidType[ci] = 0;
      }
      st.setTileSilent(x, y, s.tile);
      return applyChain(st, rng, steps, i + 1, x, y);
    case 'setTile':
      // Actions.cs:203-218:setSelfFrames 之外的默认 clearTile=true →
      //   tile.Clear(~(Wiring|Actuator)) —— Tile.cs Clear 掩码含 Wall/WallPaint/
      //   Liquid(含 liquidType)/Slope：置块同时【把墙清 0】。木屋①蛛网 SetTile(51)/
      //   蘑菇② SetTile(71) 因此把内腔墙抹掉 → 后续②墙链 OnlyWalls(WallType) 在
      //   这些格 Fail 不掷——曾漏此语义（setTileSilent 不动墙）致 ② 过掷
      //   （house0 ② vanilla 215 vs JS 238，AB#558 段实测）。
      if (st.inBounds(x, y)) {
        const ci = st.idx(x, y);
        st.wall[ci] = 0;
        st.liquid[ci] = 0;
        st.liquidType[ci] = 0;
      }
      st.setTileSilent(x, y, s.tile);
      return applyChain(st, rng, steps, i + 1, x, y);
    case 'clearTile':
      st.setTileSilent(x, y, 0);
      // ★ClearTile(frameNeighbors:true)（木屋③专属路径）→ 四邻 WorldGen.TileFrame →
      //   TileFrameImportant → Check3x2/Check2xX/CheckChand… 重验支承：支承行任一格
      //   （或吊灯顶锚）已失实 → destroyObject+KillTile 整件（Check3x2 cs KillTile 段）
      //   ——worldgen 期 KillTile 零掷（house1 ③ 120 掷精确含四件击杀实锤）。不建模则
      //   家具滞留 → 箱级联占位失败流漂（house1 钢琴占 (2037..2039,353) 挡 vanilla 箱
      //   (2038,355) 的 AB#560 首异实锤）。
      killUnsupportedFurniture(st, x + 1, y);
      killUnsupportedFurniture(st, x - 1, y);
      killUnsupportedFurniture(st, x, y - 1);
      killUnsupportedFurniture(st, x, y + 1);
      return applyChain(st, rng, steps, i + 1, x, y);
    case 'clearWall':
      // WorldUtils.ClearWall(x,y,frame)：清墙后 frame=true 时四邻 SquareWallFrame
      // （中心格掷——尾批 2-C 墙重帧掷模型）；frame 缺省 false（蘑菇 ③）零掷
      st.setWallSilent(x, y, 0);
      if (s.frame) {
        wallFrameResetRoll(st, rng, x + 1, y);
        wallFrameResetRoll(st, rng, x - 1, y);
        wallFrameResetRoll(st, rng, x, y - 1);
        wallFrameResetRoll(st, rng, x, y + 1);
      }
      return applyChain(st, rng, steps, i + 1, x, y);
    case 'placeWall':
      placeWallRolled(st, rng, x, y, s.wall);
      return applyChain(st, rng, steps, i + 1, x, y);
    case 'stalagtite':
      placeTight(st, rng, x, y);                                     // ActionStalagtite 恒 UnitApply
      return applyChain(st, rng, steps, i + 1, x, y);
    case 'vines': {
      // ActionVines.cs:21-35:len=Next(min,max+1);逐格向下铺到实心;i>0 才算成功
      const len = rng.int(s.min, s.max);
      let placed = 0;
      for (let k = 0; k < len && st.inBounds(x, y + k) && !activeAt(st, x, y + k); k++) {
        st.setTileSilent(x, y + k, s.vine, 0, 0);
        placed++;
      }
      return placed > 0 && applyChain(st, rng, steps, i + 1, x, y);
    }
  }
}

/** WorldUtils.Gen + Shapes.Rectangle(Shapes.cs Rectangle.Perform):x 外层 / y 内层 */
function genRect(st: TileStore, rng: RNG, steps: ChainStep[], ox: number, oy: number, w: number, h: number): void {
  const __g = (globalThis as { __swAgeGen?: (o: number, x: number, y: number, w: number, h: number, k: number) => void }).__swAgeGen;
  const __rn = () => (globalThis as { __swRollN?: number }).__swRollN ?? -1;
  __g?.(__rn(), ox, oy, w, h, steps[0]?.k === 'dither' && steps[1]?.k === 'blotches' ? 1 : 0);
  for (let x = ox; x < ox + w; x++) {
    for (let y = oy; oy + h > y; y++) applyChain(st, rng, steps, 0, x, y);
  }
  __g?.(__rn(), ox, oy, w, h, -1);
}

// ---------- 钟乳石(WorldGen.PlaceTight 1:1) ----------
/** PlaceUncheckedStalactite 的冰分支(cs:38377-38405):上方 ∈{147,161,163,164,200}
 *  才放置;其余名单(石/苔/沙等)在地下屋场景上方是主题块,恒静默返回 */
function placeUncheckedStalactite(st: TileStore, x: number, y: number, preferSmall: boolean, variation: number): void {
  if (!solidAt(st, x, y - 1) || activeAt(st, x, y) || activeAt(st, x, y + 1)) return;
  const above = st.type[st.idx(x, y - 1)];
  if (above !== SNOW147 && above !== ICE161
    && above !== TILE_BY_KEY['v_163_corrupt_ice_block']! && above !== sheetTile(164)
    && above !== TILE_BY_KEY['v_200_crimson_ice_block']!) return;
  // 冰族专属列（GetDesiredStalagtiteStyle :38800-38808 重定型）：147/161→0、
  // 163→594、164→540、200→648——曾全写 fx0 冰柱列（163/164/200 错列）
  const base = above === SNOW147 || above === ICE161 ? 0
    : above === TILE_BY_KEY['v_163_corrupt_ice_block']! ? 594
    : above === sheetTile(164) ? 540 : 648;
  if (preferSmall) {
    st.setTileSilent(x, y, STALACTITE, base + variation * 18, 72);
  } else {
    st.setTileSilent(x, y, STALACTITE, base + variation * 18, 0);
    st.setTileSilent(x, y + 1, STALACTITE, base + variation * 18, 18);
  }
}

/** WorldGen.PlaceTight(cs:38329-38351):231 幼虫(及 shimmer,生成期无来源)短路,
 *  其余【恒先掷 2 次】Next(2)/Next(3) 再走 PlaceUncheckedStalactite——名单外静默
 *  返回但掷骰照耗(沙漠/花岗岩/大理石的 ActionStalagtite 行因此也要走这里) */
function placeTight(st: TileStore, rng: RNG, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (st.flags[i] !== 0 && st.type[i] === LARVA231) return;
  const preferSmall = rng.int(0, 1) === 0;
  const variation = rng.int(0, 2);
  placeUncheckedStalactite(st, x, y, preferSmall, variation);
}

/** AgeRoom 七主题蚀变:逐主题把原版 WorldUtils.Gen 链逐条转录(行号 = 各
 *  *HouseBuilder.cs AgeRoom)。Dither/Blotches 语义见 applyChain 头注(C1/C2/C3) */
function ageRoom(st: TileStore, rng: RNG, gs: GenState, r: Rect, theme: Theme, def: ThemeDef): void {
  // Blotches(scale=2)→ minX=maxX=minY=maxY=2(Modifiers.cs:95-100)
  const B2 = (chance: number): ChainStep => ({ k: 'blotches', minX: 2, maxX: 2, minY: 2, maxY: 2, chance });
  // 墙段收尾:room.Y > worldSurface 时清墙、否则铺墙——按【房间】整体二选一
  // (WoodHouseBuilder.cs:36 / IceHouseBuilder.cs:32 的三元表达式在链构造时求值)
  const wallTail = (surfaceWall: number): ChainStep[] => [
    { k: 'skipTiles', types: SKIP_AGING_TILES },
    r.y > gs.worldSurface ? { k: 'clearWall', frame: true } : { k: 'placeWall', wall: surfaceWall },
  ];

  if (theme === 'wood') {
    // ① 蛛网(WoodHouseBuilder.cs:30-35):W*H/16 次,每处 2×2 矩形跑
    //   Dither(0.5)+Blotches(2,2,chance 0.3)+IsEmpty+SetTile(51)
    const count = Math.floor(r.w * r.h / 16);
    for (let c = 0; c < count; c++) {
      const x = rng.int(1, r.w - 2) + r.x;
      const y = rng.int(1, r.h - 2) + r.y;
      genRect(st, rng, [{ k: 'dither', p: 0.5 }, B2(0.3), { k: 'isEmpty' }, { k: 'setTile', tile: COBWEB }], x, y, 2, 2);
    }
    // ② 墙侵蚀(WoodHouseBuilder.cs:36):Dither(0.85)+Blotches()+OnlyWalls(27)+
    //   SkipTiles(画族)+清墙/铺土墙 2
    genRect(st, rng, [
      { k: 'dither', p: 0.85 }, B2(0.3), { k: 'onlyWalls', types: [def.wall] }, ...wallTail(2),
    ], r.x, r.y, r.w, r.h);
    // ③ 第三段(WoodHouseBuilder.cs:37,曾整体缺失 C4):Dither(0.95)+
    //    OnlyTiles(30,321,158)+ClearTile——剥掉木/针叶/红木主题块
    genRect(st, rng, [
      { k: 'dither', p: 0.95 },
      { k: 'onlyTiles', types: [T.WOOD, TILE_BY_KEY['v_321_boreal_wood']!, TILE_BY_KEY['v_158_rich_mahogany']!] },
      { k: 'clearTile' },
    ], r.x, r.y, r.w, r.h);
    return;
  }
  if (theme === 'ice') {
    // ① 321→161→147(IceHouseBuilder.cs:29):Dither(0.6)+Blotches(2,0.6)+
    //   OnlyTiles(321)+SetTileKeepWall(161)+Dither(0.8)+SetTileKeepWall(147)
    genRect(st, rng, [
      { k: 'dither', p: 0.6 }, B2(0.6), { k: 'onlyTiles', types: [def.tile] },
      { k: 'setTileKeepWall', tile: ICE161 },
      { k: 'dither', p: 0.8 }, { k: 'setTileKeepWall', tile: SNOW147 },
    ], r.x, r.y, r.w, r.h);
    // ② 顶/底行钟乳石(IceHouseBuilder.cs:30-31):Dither(0.5)+OnlyTiles(161)+
    //   Offset(0,1)+ActionStalagtite,矩形 (X+1, 行, W-2, 1)
    for (const rowY of [r.y, r.y + r.h - 1]) {
      genRect(st, rng, [
        { k: 'dither', p: 0.5 }, { k: 'onlyTiles', types: [ICE161] }, { k: 'offset', dx: 0, dy: 1 }, { k: 'stalagtite' },
      ], r.x + 1, rowY, r.w - 2, 1);
    }
    // ③ 墙(IceHouseBuilder.cs:32,无 OnlyWalls):Dither(0.85)+Blotches(2,0.8)+
    //   SkipTiles(画族)+清墙/铺墙 40
    genRect(st, rng, [{ k: 'dither', p: 0.85 }, B2(0.8), ...wallTail(40)], r.x, r.y, r.w, r.h);
    return;
  }
  if (theme === 'jungle') {
    // ① 158→60→59(JungleHouseBuilder.cs:29):Dither(0.6)+Blotches(2,0.6)+
    //   OnlyTiles(158)+SetTileKeepWall(60)+Dither(0.8)+SetTileKeepWall(59)
    genRect(st, rng, [
      { k: 'dither', p: 0.6 }, B2(0.6), { k: 'onlyTiles', types: [def.tile] },
      { k: 'setTileKeepWall', tile: JUNGLE60 },
      { k: 'dither', p: 0.8 }, { k: 'setTileKeepWall', tile: MUD59 },
    ], r.x, r.y, r.w, r.h);
    // ② 藤(JungleHouseBuilder.cs:30-31):Dither(0.5)+OnlyTiles(60)+Offset(0,1)+
    //   IsEmpty+ActionVines(3, H, 62)
    for (const rowY of [r.y, r.y + r.h - 1]) {
      genRect(st, rng, [
        { k: 'dither', p: 0.5 }, { k: 'onlyTiles', types: [JUNGLE60] }, { k: 'offset', dx: 0, dy: 1 },
        { k: 'isEmpty' }, { k: 'vines', min: 3, max: r.h, vine: VINE62 },
      ], r.x + 1, rowY, r.w - 2, 1);
    }
    // ③ 墙 64(JungleHouseBuilder.cs:32,无 OnlyWalls/SkipTiles)
    genRect(st, rng, [{ k: 'dither', p: 0.85 }, B2(0.3), { k: 'placeWall', wall: 64 }], r.x, r.y, r.w, r.h);
    return;
  }
  if (theme === 'mushroom') {
    // ① 190→70(MushroomHouseBuilder.cs:27):Dither(0.7)+Blotches(2,0.5)+OnlyTiles(190)
    genRect(st, rng, [
      { k: 'dither', p: 0.7 }, B2(0.5), { k: 'onlyTiles', types: [def.tile] },
      { k: 'setTileKeepWall', tile: MUSH70 },
    ], r.x, r.y, r.w, r.h);
    // ② 顶/底行(MushroomHouseBuilder.cs:28-29):Dither(0.6)+OnlyTiles(70)+
    //   Offset(0,-1)+IsEmpty+SetTile(71)
    for (const rowY of [r.y, r.y + r.h - 1]) {
      genRect(st, rng, [
        { k: 'dither', p: 0.6 }, { k: 'onlyTiles', types: [MUSH70] }, { k: 'offset', dx: 0, dy: -1 },
        { k: 'isEmpty' }, { k: 'setTile', tile: SHROOM71 },
      ], r.x + 1, rowY, r.w - 2, 1);
    }
    // ③ 墙清空(MushroomHouseBuilder.cs:30)
    genRect(st, rng, [{ k: 'dither', p: 0.85 }, B2(0.3), { k: 'clearWall' }], r.x, r.y, r.w, r.h);
    return;
  }
  if (theme === 'granite' || theme === 'marble') {
    // ① 369→368 / 357→367(GraniteHouseBuilder.cs:28 / MarbleHouseBuilder.cs:28):
    //   Dither(0.6)+Blotches(2,0.6)+OnlyTiles(主题块)+SetTileKeepWall(368/367)
    const to = theme === 'granite' ? GRANITE368 : MARBLE367;
    genRect(st, rng, [
      { k: 'dither', p: 0.6 }, B2(0.6), { k: 'onlyTiles', types: [def.tile] },
      { k: 'setTileKeepWall', tile: to },
    ], r.x, r.y, r.w, r.h);
    // ② 顶/底行(GraniteHouseBuilder.cs:29-30):Dither(0.8)+OnlyTiles(368/367)+
    //   Offset(0,1)+ActionStalagtite(名单外 no-op,但 Dither/PlaceTight 掷骰照耗)
    for (const rowY of [r.y, r.y + r.h - 1]) {
      genRect(st, rng, [
        { k: 'dither', p: 0.8 }, { k: 'onlyTiles', types: [to] }, { k: 'offset', dx: 0, dy: 1 }, { k: 'stalagtite' },
      ], r.x + 1, rowY, r.w - 2, 1);
    }
    // ③ 墙 180/178(GraniteHouseBuilder.cs:31 / MarbleHouseBuilder.cs:31)
    genRect(st, rng, [
      { k: 'dither', p: 0.85 }, B2(0.3), { k: 'placeWall', wall: theme === 'granite' ? 180 : 178 },
    ], r.x, r.y, r.w, r.h);
    return;
  }
  // desert
  // ① 396→396→397(DesertHouseBuilder.cs:31):Dither(0.8)+Blotches(2,0.2)+
  //   OnlyTiles(396)+SetTileKeepWall(396)+Dither(0.5)+SetTileKeepWall(397)
  //   ——第一段写 396 是原版字面(视觉 no-op),但第二道 Dither 的掷骰位置在此
  genRect(st, rng, [
    { k: 'dither', p: 0.8 }, B2(0.2), { k: 'onlyTiles', types: [def.tile] },
    { k: 'setTileKeepWall', tile: def.tile },
    { k: 'dither', p: 0.5 }, { k: 'setTileKeepWall', tile: HARDSAND397 },
  ], r.x, r.y, r.w, r.h);
  // ② 顶/底行钟乳石(DesertHouseBuilder.cs:32-33,曾整体缺失 C5):
  //   Dither(0.5)+OnlyTiles(397,396)+Offset(0,1)+ActionStalagtite
  for (const rowY of [r.y, r.y + r.h - 1]) {
    genRect(st, rng, [
      { k: 'dither', p: 0.5 }, { k: 'onlyTiles', types: [HARDSAND397, def.tile] },
      { k: 'offset', dx: 0, dy: 1 }, { k: 'stalagtite' },
    ], r.x + 1, rowY, r.w - 2, 1);
  }
  // ③ 墙 216(DesertHouseBuilder.cs:34):Dither(0.8)+Blotches()+OnlyWalls(187)
  genRect(st, rng, [
    { k: 'dither', p: 0.8 }, B2(0.3), { k: 'onlyWalls', types: [def.wall] }, { k: 'placeWall', wall: 216 },
  ], r.x, r.y, r.w, r.h);
}

// ---------- FillRooms(画/烛台交替 + 装饰循环) ----------
function fillRooms(st: TileStore, rng: RNG, r: Rect, def: ThemeDef, theme: Theme): void {
  // 家具七选(HouseBuilder.FillRooms choices;沙漠 Tables2 → tile 469)
  const choices: Array<[string, number]> = [
    [def.tables2 ? 'v_469_tables_group_2' : 'table', def.table],
    ['anvil', 0],
    ['workbench', def.workbench],
    ['v_86_loom', 0],
    ['piano', def.piano],
    ['keg', 0],
    ['bookcase', def.bookcase],
  ];
  // 画/烛台交替:switch(i + parity%2) 仅 0/1 两档有内容(i≥2 落空,原版同款)
  const n = Math.floor(r.w / 8);
  const step = Math.floor(r.w / (n + 1));
  const parity = rng.int(0, 1);
  for (let i = 0; i < n; i++) {
    const x = (i + 1) * step + r.x;
    if ((i + (parity % 2)) % 2 === 0) {
      // 画:Y + min(H/2, H-5)
      const y = r.y + Math.min(Math.floor(r.h / 2), r.h - 5);
      const [key, style] = theme === 'desert' ? randHousePictureDesert(rng) : randHousePicture(rng);
      // 画放置零掷【勘误 2026-08-17】：PlaceTile(240/241/242/245/246) 走专属 Place*Wall
      // 分支（WorldGen.cs:59962-59990），Place2x3Wall(245)/Place3x3Wall(240) 等纯放置
      // 全零 genRand（:44595/:44281 实读）；TileObject.Place 的 Main.rand.Next(4)
      // （TileObject.cs:792）永不达——且 genRand=>Main.rand（WorldGen.cs:4391）单流下
      // houseprobe4 PT(240) 事件 Δ0 掷实锤。旧「245 补 Next(4)」系误判 PlaceTile→
      // PlaceObject 派发，已撤。
      placeFurniture(st, key, x, y, style);
    } else {
      // 烛台:PlaceChand(34)吊灯——key=chandelier(sheet 34;旧误用 'candelabra'
      // =sheet 100 的独立件,case 34 永不命中 → 吊灯从未放置,room1 实锤)
      const y = r.y + 1;
      placeFurniture(st, 'chandelier', x, y, rng.int(0, 5));
    }
  }
  // 装饰循环:W/8+3 件
  const decoCount = Math.floor(r.w / 8) + 3;
  for (let k = 0; k < decoCount; k++) {
    const x = rng.int(0, r.w - 4) + 1 + r.x;
    const y = r.y + r.h - 2;
    switch (rng.int(0, 3)) {
      case 0: {
        // 小堆 185(HouseBuilder.cs:479)：style=Next(31,34) 在【调用点】恒掷
        // （_random.Next(31,34) 先求值再进 PlaceSmallPile，占用与否是体内判定）——
        // 旧实现把掷骰关进 !activeAt 门 → 占用格漏掷（houseprobe4 实锤：house0
        // roomA it3 (765,871) 掷位 3079 处 vanilla 已掷 style、JS 直落下一迭代）。
        // PlaceSmallPile size1(cs:46831)：2 宽 (x..x+1,y)，门=!anyLava+下方双格
        // SolidTile2+双格 !active+type185 拒 Boulders 垫；帧 frameX=style*36(+18)/frameY=18
        const style = rng.int(31, 33);
        const lava = st.inBounds(x, y) && st.liquid[st.idx(x, y)] > 0 && st.liquidType[st.idx(x, y)] === 2;
        if (!lava && solid2(st, x, y + 1) && solid2(st, x + 1, y + 1)
          && !BOULDERS.has(sheetOf(st, x, y + 1)) && !BOULDERS.has(sheetOf(st, x + 1, y + 1))
          && st.inBounds(x + 1, y) && !activeAt(st, x, y) && !activeAt(st, x + 1, y)) {
          st.setTileSilent(x, y, SMALL_PILE, style * 36, 18);
          st.setTileSilent(x + 1, y, SMALL_PILE, style * 36 + 18, 18);
          regHouseObj(st, x, y, 2, 1, 'floor');
        }
        break;
      }
      case 1: // 骨堆 186
        placeFurniture(st, 'v_186_decos_3x2', x, y, rng.int(22, 25));
        break;
      case 2: // 雕像(statueList[Next(2, len)],陷阱雕像照接)
        placeStatue(st, x, y, rng.int(2, STATUE_LIST.length - 1));
        break;
      case 3: {
        const [key, style] = choices[rng.int(0, choices.length - 1)];
        placeFurniture(st, key, x, y, style);
        break;
      }
    }
  }
}

// ---------- 楼梯 / 门 / 平台 / 梁 ----------
/** CreateStairsList + PlaceStairs:相邻房间对角平台链 + 顶步 4×1 平台 + 斜坡 */
function placeStairs(st: TileStore, rng: RNG, rooms: Rect[], def: ThemeDef): void {
  for (let i = 1; i < rooms.length; i++) {
    const cur = rooms[i], prev = rooms[i - 1];
    const leftGap = prev.x - cur.x;
    const rightGap = cur.x + cur.w - (prev.x + prev.w);
    let from: { x: number; y: number };
    if (leftGap > rightGap) from = { x: cur.x + cur.w - 1, y: cur.y + 1 };
    else from = { x: cur.x, y: cur.y + 1 };
    const steps = (cur.y + cur.h - 1) - from.y;
    const dir = leftGap > rightGap ? -1 : 1;
    for (let s = 0; s < steps; s++) {
      const sx = from.x + dir * (s + 1), sy = from.y + s;
      if (!st.inBounds(sx, sy)) continue;
      // 平台帧 = PlaceTile(19, PlatformStyle)(HouseBuilder.cs:518)——case 19 走
      // frameY = 18*style(WorldGen.cs:60245-60249),非 frameX;曾恒写 (0,0)(C6)
      st.setTileSilent(sx, sy, PLATFORM, 0, def.platformStyle * 18);
      st.slope[st.idx(sx, sy)] = dir === 1 ? 1 : 2;
    }
    // 顶步上方 4×1 平台(HouseBuilder.cs:519)：Gen(Chain(Clear(), PlaceWall(WallType),
    //   PlaceTile(19)))——★PlaceWall 逐格走墙重帧掷（Actions.Clear 清 tile+wall+liquid
    //   后置墙 → 自格+四邻 SquareWallFrame 判定掷，尾批 2-C 墙掷模型）
    const px = from.x + (dir === 1 ? 1 : -4);
    for (let dx = 0; dx < 4; dx++) {
      const cx = px + dx, cy = from.y - 1;
      if (!st.inBounds(cx, cy)) continue;
      st.setTileSilent(cx, cy, 0);
      st.liquid[st.idx(cx, cy)] = 0;
      st.liquidType[st.idx(cx, cy)] = 0;
      placeWallRolled(st, rng, cx, cy, def.wall);
      st.setTileSilent(cx, cy, PLATFORM, 0, def.platformStyle * 18);
    }
  }
}

/** FindSideExit(Up 搜索 + AreaOr(4,3) 任一非实心) */
function findSideExit(st: TileStore, wallX: number, wallY: number, wallH: number, isLeft: boolean): number | null {
  // FindSideExit（HouseBuilder.cs:554）：Up 搜索 + IsSolid().Not().AreaOr(4,3)。
  //   ★GenCondition.IsValid Or 分支（GenCondition.cs:52-61）+InvertResults：任一格
  //   CheckValidity(=实心)成立→返回 !Invert=false；全空才 true——即 4×3 窗口必须
  //   【整体无实心】才命中。曾误读成 any-非实心 → 门/平台滥发（house0 右窗外
  //   (769,869) 一格泥土即否决,旧 any 语义误命中实锤）
  const startX = wallX + (isLeft ? -4 : 0);
  for (let k = 0; k < wallH - 3; k++) {
    const y = wallY + wallH - 3 - k;
    let allAir = true;
    for (let dx = 0; dx < 4 && allAir; dx++) {
      for (let dy = 0; dy < 3 && allAir; dy++) {
        if (solidAt(st, startX + dx, y + dy)) allAir = false;
      }
    }
    if (allAir) return y;
  }
  return null;
}

function placeDoors(st: TileStore, rng: RNG, rooms: Rect[], def: ThemeDef): void {
  for (const r of rooms) {
    // 墙列矩形 (X, Y+1, 1, H-2)
    // 门禁（原版 PlaceTile(x, exitY)→PlaceDoor(j+1)，WorldGen.cs:31946）：mount
    // （exitY-1 实心）+ 地板（exitY+3 实心）缺一即不放门只留门洞——HouseBuilder
    // 的 forced=true 仅绕过首道空格门，门分支的锚点条件仍生效
    const tryDoor = (x: number, exitY: number) => {
      for (let dy = 0; dy < 3; dy++) st.setTileSilent(x, exitY + dy, 0);
      // PlaceTile case10（cs:59867-59906，forced=true 仅过首道空格门）：分支 A
      // （exitY-1/-2 空 + exitY-3 实心）→ PlaceDoor(i,j-1) 门落 (exitY-2..exitY)；
      // 分支 B（exitY+1/+2 空 + exitY+3 实心）→ 门落 (exitY..exitY+2)；双败→无门零掷
      const solidAtV = (yy: number) => st.inBounds(x, yy) && !!st.flags[st.idx(x, yy)] && vanGenSolidType(st.type[st.idx(x, yy)]);
      const inactiveAt = (yy: number) => st.inBounds(x, yy) && st.flags[st.idx(x, yy)] === 0;
      if (inactiveAt(exitY - 1) && inactiveAt(exitY - 2) && solidAtV(exitY - 3)) {
        // PlaceDoor（cs:31938-31960）：三格门框 frameX 各独立掷 Next(3)——每门 3 掷
        // （N 批 HellFort 同源；house3 vanilla DO→PL=6 掷=双门×3 实锤）
        rng.int(0, 2); rng.int(0, 2); rng.int(0, 2);
        placeDoorClosed(st, x, exitY - 2, def.door);
      } else if (inactiveAt(exitY + 1) && inactiveAt(exitY + 2) && solidAtV(exitY + 3)) {
        rng.int(0, 2); rng.int(0, 2); rng.int(0, 2);
        placeDoorClosed(st, x, exitY, def.door);
      }
    };
    // 右侧扫描起点 = room.X+W（墙体列外一格,HouseBuilder.cs:562 wall=(X+W,Y+1,1,H-2)）
    // ——曾误用墙体列 X+W-1 → 扫描窗含恒实心墙列,门外洞穴 4×3 极易命中 → 门滥发
    // （house1 vanilla 无门 vs JS 误门 (2045,352) 实锤）
    const exitR = findSideExit(st, r.x + r.w, r.y + 1, r.h - 2, false);
    if (exitR !== null) tryDoor(r.x + r.w - 1, exitR);
    const exitL = findSideExit(st, r.x, r.y + 1, r.h - 2, true);
    if (exitL !== null) tryDoor(r.x, exitL);
  }
}

/** FindVerticalExit(Left 搜索 + AreaOr(3,5) 任一非实心) */
function findVerticalExit(st: TileStore, rectX: number, rectY: number, rectW: number, isUp: boolean): number | null {
  const startX = rectX + rectW - 3;
  const startY = rectY + (isUp ? -5 : 0);
  for (let k = 0; k < rectW - 3; k++) {
    const x = startX - k;
    // 同 findSideExit：AreaOr(3,5)+Not = 3×5 窗口整体无实心才命中（曾误 any 语义）
    let allAir = true;
    for (let dx = 0; dx < 3 && allAir; dx++) {
      for (let dy = 0; dy < 5 && allAir; dy++) {
        if (solidAt(st, x + dx, startY + dy)) allAir = false;
      }
    }
    if (allAir) return x;
  }
  return null;
}

function placePlatforms(st: TileStore, rooms: Rect[], def: ThemeDef): void {
  const top = rooms[0], bot = rooms[rooms.length - 1];
  // 顶层顶壁(isUp:候选自壁上 5 格起);帧同楼梯(C6):HouseBuilder.cs:574
  //   PlaceTile(19, PlatformStyle) → frameY = 18*style
  const exitT = findVerticalExit(st, top.x + 2, top.y, top.w - 4, true);
  if (exitT !== null) {
    for (let dx = 0; dx < 3; dx++) st.setTileSilent(exitT + dx, top.y, PLATFORM, 0, def.platformStyle * 18);
  }
  if (rooms.length > 1) {
    const exitB = findVerticalExit(st, bot.x + 2, bot.y + bot.h - 1, bot.w - 4, false);
    if (exitB !== null) {
      for (let dx = 0; dx < 3; dx++) st.setTileSilent(exitB + dx, bot.y + bot.h - 1, PLATFORM, 0, def.platformStyle * 18);
    }
  }
}

/** CreateSupportBeamList + PlaceSupportBeams:6→4 步长梁列,落下一房顶/实心 */
function placeSupportBeams(st: TileStore, rooms: Rect[], def: ThemeDef): void {
  const minX = Math.min(...rooms.map((r) => r.x));
  const maxX = Math.max(...rooms.map((r) => r.x + r.w)) - 1;
  let step = 6;
  while (step > 4 && (maxX - minX) % step !== 0) step--;
  for (let x = minX; x <= maxX; x += step) {
    for (let ri = 0; ri < rooms.length; ri++) {
      const r = rooms[ri];
      if (x < r.x || x >= r.x + r.w) continue;
      const bottom = r.y + r.h;
      let limit = 50;
      for (let rj = ri + 1; rj < rooms.length; rj++) {
        const r2 = rooms[rj];
        if (x >= r2.x && x < r2.x + r2.w) limit = Math.min(limit, r2.y - bottom);
      }
      if (limit <= 0) continue;
      let found = -1;
      if (limit < 50) found = bottom + limit; // 原版:num7<50 视为命中下一房顶
      else {
        for (let y = bottom; y < bottom + limit; y++) {
          if (solidAt(st, x, y)) { found = y; break; }
        }
      }
      if (found < 0) continue;
      const height = found - bottom;
      if (height > 1 && st.type[st.idx(x, bottom - 1)] !== PLATFORM) {
        for (let y = bottom; y < found; y++) st.setTileSilent(x, y, def.beam, 0, 0);
      }
    }
  }
}

// ---------- 主题专属件级联(PlaceBiomeSpecificPriorityTool / PlaceBiomeSpecificTool) ----------
/** HouseBuilder.cs:764-826/838-865/881-907 共形级联:逐房【底行 Y+H-2】先 10 次
 *  随机(Next(2,W-2)+X)再整行扫描;仅 Bast 有顶行 Y-1 兜底级联(:798-825)。
 *  任一命中即停(true = 放置成功,调用方据此递增计数)。
 *  旧实现是"rooms[0] 单发随机公式"——三级级联与逐房推进全部缺失(C7) */
function cascadePlace(st: TileStore, rng: RNG, rooms: Rect[], key: string, ceilingFallback: boolean): boolean {
  const tryRow = (r: Rect, y: number): boolean => {
    for (let t = 0; t < 10; t++) {
      if (placeFurniture(st, key, rng.int(2, r.w - 3) + r.x, y)) return true;
    }
    for (let x = r.x + 2; x <= r.x + r.w - 2; x++) {
      if (placeFurniture(st, key, x, y)) return true;
    }
    return false;
  };
  for (const r of rooms) if (tryRow(r, r.y + r.h - 2)) return true;
  if (ceilingFallback) {
    for (const r of rooms) if (tryRow(r, r.y - 1)) return true;
  }
  return false;
}

// ---------- 宝箱四级联(PlaceChests) ----------
function placeChests(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink, rooms: Rect[], def: ThemeDef, theme: Theme): void {
  // 头掷（HouseBuilder.cs:672）：`NextDouble() > ChestChance` —— ChestChance=1.0
  // 恒过门但【掷骰照耗】。旧实现缺此掷 → 箱段流漂 -1（house0 AB#558 dk=-1 实锤）
  rng.next();
  const tryAt = (x: number, y: number): boolean => {
    const underground = y > gs.worldSurface;
    // 冰屋：显式 style 11 直入冰箱门（cs:36107 第一析取）→ 主件池 + 1/20 提炼机 +
    // 1/50 鱼覆盖块自动生效（旧实现显式 loot 绕过覆盖——审计三.4 修复）
    return placeBuriedChest(st, rng, gs, chests, x, y, {
      style: underground ? def.chestStyle : 0,
      tile: underground && def.chestTile2 ? CHEST2 : undefined,
      flags: theme === 'ice' ? { ice: true } : (!underground ? { wooden: true } : {}),
    });
  };
  // 级联 1:各房底行随机 10 次
  for (const r of rooms) {
    const floorY = r.y + r.h - 1;
    let ok = false;
    for (let t = 0; t < 10 && !ok; t++) ok = tryAt(rng.int(2, r.w - 3) + r.x, floorY);
    if (ok) return;
    for (let x = r.x + 2; x <= r.x + r.w - 2 && !ok; x++) ok = tryAt(x, floorY);
    if (ok) return;
  }
  // 级联 2:各房顶行(Y-1)
  for (const r of rooms) {
    const ceilY = r.y - 1;
    let ok = false;
    for (let t = 0; t < 10 && !ok; t++) ok = tryAt(rng.int(2, r.w - 3) + r.x, ceilY);
    if (ok) return;
    for (let x = r.x + 2; x <= r.x + r.w - 2 && !ok; x++) ok = tryAt(x, ceilY);
    if (ok) return;
  }
  // 级联 3:房外 ±30 随机 1000 次
  for (let t = 0; t < 1000; t++) {
    if (tryAt(rng.int(rooms[0].x - 30, rooms[0].x + 29), rng.int(rooms[0].y - 30, rooms[0].y + 29))) return;
  }
}

// ---------- pass 主体 ----------
/** 地下小屋 pass(UndergroundHousesAndBuriedChests 的 CaveHouse 段,cs:17153-17192
 *  + 沙漠追加段 cs:17193-17219) */
/** pass 59 头四计数连掷(cs:17081-17084,序=CaveHouse→Underworld→CaveChest→
 *  AdditionalDesert)——本仓 pass 拆分后各消费 pass 流位分散,由本函数在管线中
 *  第一个消费 pass 之前统一预掷暂存 gs(WorldGen.ts 接线)。四枚均为
 *  WorldGenRange.GetRandom(WorldGenRange.cs:34-57:先缩放边界再截断):
 *  CaveHouse/CaveChest=35-40×WorldArea、Underworld=10-15×WorldWidth/4200、
 *  AdditionalDesert=2-2×WorldArea(恒掷一骰)。幂等:已预掷(≥0)直接返回。 */
export function rollHouseChestCounts(st: TileStore, rng: RNG, gs: GenState): void {
  if (gs.caveHouseCount >= 0) return;
  const area = (st.w * st.h) / 5040000;
  const wsc = st.w / 4200;
  gs.caveHouseCount = rng.int(Math.trunc(35 * area), Math.trunc(40 * area));
  gs.underworldChestCount = rng.int(Math.trunc(10 * wsc), Math.trunc(15 * wsc));
  gs.caveChestCount = rng.int(Math.trunc(35 * area), Math.trunc(40 * area));
  gs.desertHouseCount = rng.int(Math.trunc(2 * area), Math.trunc(2 * area));
}

export function runCaveHousesPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  // ★pass 头 tileSolid 翻转（cs:17076-17079）：226 蜥蜴砖/162 薄冰/225 蜂巢块/
  //   190 荧光菇块短暂回**实心**——本 pass 的房间寻找/锚定（findRoom 的 solidAt /
  //   HouseUtils.AreRoomsValid）把它们当可建地面。pass 尾（cs:17220-23）翻回 false。
  flipGenSolid([226, 162, 225, 190], true);
  const { w, h } = st;
  // CaveHouseCount 35-40 × WorldArea/5040000(Configuration.json)。WorldGenRange.
  // GetRandom(WorldGenRange.cs:34-40)= Next(ScaledMinimum, ScaledMaximum+1),
  // ScaleValue(:42-57)先按面积缩放边界再 (int) 截断——即
  // Next((int)(35*s), (int)(40*s)+1)。旧实现"先掷后乘 + Math.round",分布不同(C10)。
  // 另:原版 pass 头连掷四枚(cs:17081-17084:CaveHouseCount→UnderworldChestCount→
  // CaveChestCount→AdditionalDesertHouseCount);由 rollHouseChestCounts 在管线里
  // **先于**本 pass 统一预掷(WorldGen.ts 接线),本 pass 只消费 gs 暂存值
  // (探针直调未预掷时回退自掷)。
  const s = (w * h) / 5040000;
  const count = gs.caveHouseCount >= 0 ? gs.caveHouseCount : rng.int(Math.trunc(35 * s), Math.trunc(40 * s));
  // 第 4 个 WorldGenRange：AdditionalDesertHouseCount（2-2 × WorldArea，
  // Configuration.json）——GetRandom 恒消费一次 Next（cs:17084）
  const desertHouses = gs.desertHouseCount >= 0 ? gs.desertHouseCount : rng.int(2, 2);
  let bastCount = 0;        // GenVars.extraBastStatueCount
  // extraBastStatueCountMax(WorldGen.cs:11490-11499)= 2+尺寸档:大(≥8400)+2、
  // 中(≥6400)+1、小 +0——旧实现硬编码 2,仅小世界正确(C7)
  const bastMax = 2 + (w >= 8400 ? 2 : w >= 6400 ? 1 : 0);
  let extractCount = 0;     // HouseBuilderContext.ExtractinatorCount
  let sharpCount = 0;       // context.SharpenerCount

  /** 单座小屋放置（HouseBuilder.Place 原序），返回是否成功 */
  // 阶段探针（对拍 vanilla stage hook；tag 对应 HouseBuilder 私有方法边界）
  const __st = (globalThis as { __swHouseStage?: (tag: string, a: number, b: number, c: number, d: number) => void }).__swHouseStage;
  const __rn = () => (globalThis as { __swRollN?: number }).__swRollN ?? -1;
  const placeHouse = (ox: number, oy: number, oceanGate: boolean): boolean => {
    // oceanDepths 1:1(cs:10978-10988):【先 y 门】y > oceanLevel((Main.worldSurface
    //   + Main.rockLayer)/2+40,双 double)即非海洋直接 false——地下小屋 oy 取自
    //   worldSurfaceHigh+20 起的深域,恒 > oceanLevel,原版此门从不触发;曾只抄
    //   x 半边 → 海滩 x 带内深埋尝试被误拒 → createRooms 的 above/below 2 掷被吞
    //   → 流漂(house5 前尝试 (3901,718) vanilla 2 掷 vs JS 0 掷,AB#565 (579,445)
    //   vs (885,736) 首异实锤)
    if (oceanGate && !(oy > (gs.worldSurface + gs.rockLevel) / 2 + 40)
      && (ox < gs.beachDistance || ox > w - gs.beachDistance)) return false;
    // CaveHouseBiome.Place 前置拒绝(CaveHouseBiome.cs:36-54,C9 曾整体缺失):
    //   InWorld(origin,30) + 原点 ±25 内有红线或 BasicChest(21/467,TileID.cs:315)
    //   → 整屋放弃。须在 createRooms 之前(不耗 RNG)。
    if (ox < 30 || oy < 30 || ox >= w - 30 || oy >= h - 30) return false;
    for (let i = ox - 25; i <= ox + 25; i++) {
      for (let j = oy - 25; j <= oy + 25; j++) {
        const k = st.idx(i, j);
        if ((st.wire[k] & TileStore.WIRE_RED) !== 0) return false; // tile.wire()(红线位)
        const t = st.type[k];
        if (t === CHEST21 || t === CHEST2) return false;           // TileID.Sets.BasicChest
      }
    }
    const rooms = createRooms(st, rng, ox, oy);
    if (!rooms.length) return false;
    // 位置合法(InWorld 10 边距 / 底部 < h-220)。★无房间互斥检查——原版 above/below
    //   房与主房天然重叠（HouseUtils.AreRoomLocationsValid 只查 InWorld+底界；x86
    //   house0 实测 (753,865,15×8)+(749,872,17×8) 重叠共存）。曾加互斥门 → 42/42
    //   只剩 15×8 单房（vanilla 21 单/17 双/4 三房）——房屋链欠掷另一半根因（2-C）
    let ok = true;
    for (const r of rooms) {
      if (r.x < 10 || r.y < 10 || r.x + r.w > w - 10 || r.y + r.h > h - 220) ok = false;
    }
    if (!ok) return false;
    const theme = getHouseType(st, rooms);
    const def = THEMES[theme];
    if (def.tile < 0 || def.beam < 0) return false;
    // 岩浆回避(granite 主题豁免,HouseUtils.AreRoomsValid)
    if (theme !== 'granite') {
      for (const r of rooms) {
        for (let x = r.x - 2; x < r.x + r.w + 2; x++) {
          for (let y = r.y - 2; y < r.y + r.h + 2; y++) {
            if (st.inBounds(x, y) && st.liquid[st.idx(x, y)] > 0 && st.liquidType[st.idx(x, y)] === 2) ok = false;
          }
        }
      }
      if (!ok) return false;
    }
    // ★HouseUtils.AreRoomsValid 的结构图半边（HouseUtils.cs:280/285
    //   `structures.CanPlace(room, BlacklistedTiles, 5)`——notTheBees 用 BeelistedTiles）：
    //   每个房间 pad5 与既有保护结构（蜂巢主巢/蜂蜜斑/神龛/微光/剑冢等）互斥
    //   + BlacklistedTiles 内容扫描（HouseUtils.cs:11 CreateBoolSet(true, 225,41,43,
    //   44,226,203,112,25,151,21,467)——比 GeneralPlacementTiles 窄的 11 id 自有表,
    //   非 StructureMap 默认表,故传显式 forbid 集）。本地主题/岩浆/红线/宝箱判定
    //   仍是 HouseBuilder 自身的额外门,两者原版并存。
    const houseForbid = new Set<number>();
    const houseSheets = new Set([225, 41, 43, 44, 226, 203, 112, 25, 151, 21, 467]);
    for (let id = 0; id < TILE_DEFS.length; id++) {
      const sh = TILE_DEFS[id]?.vanilla?.sheet;
      if (sh !== undefined && houseSheets.has(sh)) houseForbid.add(id);
    }
    for (const r of rooms) {
      if (!canPlaceStructure(gs, { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }, 5, st, houseForbid)) return false;
    }

    houseObjCells.clear();   // 家具登记表生命周期=本屋
    // ---- ★builder 构造掷（Wood/Ice/Jungle/DesertHouseBuilder ctor →
    //   PotentiallyConvertToSeedHouse,HouseBuilder.cs:224）：普通种子恒耗
    //   **1 颗 NextFloat**（>0.4f 早退；≤0.4f 走特殊种子转换表，普通种子
    //   list 恒空 → 无后续掷）。Granite/Marble/Mushroom 三构造器不调用本方法
    //   → 不耗。曾整段漏掷：每成功一屋流漂 1 颗，后续所有小屋/宝箱位置级联
    //   （#58 窗 typ≈15k 自因主根因，2026-08-17 隔离重放实锤）
    if (theme === 'wood' || theme === 'ice' || theme === 'jungle' || theme === 'desert') {
      rng.next(); // NextFloat() > 0.4f —— 普通种子无转化分支，仅保流
    }
    __st?.('bld', ox, oy, theme === 'wood' ? 1 : theme === 'ice' ? 2 : theme === 'jungle' ? 3 : theme === 'desert' ? 4 : theme === 'granite' ? 5 : theme === 'marble' ? 6 : 7, __rn());

    // ---- HouseBuilder.Place 原序 ----
    // 1) PlaceEmptyRooms:外壳 + 内腔墙
    for (const r of rooms) {
      for (let x = r.x; x < r.x + r.w; x++) {
        for (let y = r.y; y < r.y + r.h; y++) {
          st.setTileSilent(x, y, def.tile);
          st.liquid[st.idx(x, y)] = 0;
          st.liquidType[st.idx(x, y)] = 0;
        }
      }
      for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
          st.setTileSilent(x, y, 0);
          // Gen(Chain(ClearTile(true), PlaceWall(WallType)))——PlaceWall 逐格墙重帧掷
          // （尾批 2-C：PlaceEmptyRooms 每房 ~3 掷/内腔格，房屋链欠掷主根因）
          placeWallRolled(st, rng, x, y, def.wall);
        }
      }
    }
    // ★HouseBuilder.cs:393-397 `foreach room: structures.AddProtectedStructure(room, 8)`：
    //   PlaceEmptyRooms 之后、楼梯/门/平台之前逐房登记（pad 8）——后续神龛常春藤箱/
    //   剑冢/野营地/矿爆点等结构与整屋互斥。
    for (const r of rooms) {
      addProtectedStructure(gs, { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }, 8);
    }
    __st?.('er', ox, oy, 0, __rn());
    // 2-4) 楼梯 / 门 / 平台
    placeStairs(st, rng, rooms, def);
    __st?.('st', ox, oy, 0, __rn());
    placeDoors(st, rng, rooms, def);
    __st?.('do', ox, oy, 0, __rn());
    placePlatforms(st, rooms, def);
    __st?.('pl', ox, oy, 0, __rn());
    // 5) 支撑梁
    placeSupportBeams(st, rooms, def);
    __st?.('sb', ox, oy, 0, __rn());
    // 6) 沙漠 Bast 石碑(HouseBuilder.cs:757-831):三级级联(底行→顶行兜底),
    //    上限 bastMax = 2+尺寸档——旧实现单发公式 + 硬编码 2(C7)
    if (theme === 'desert' && bastCount < bastMax) {
      if (cascadePlace(st, rng, rooms, 'v_506_bast_statue', true)) bastCount++;
    }
    __st?.('bp', ox, oy, 0, __rn());
    // 7) FillRooms:画/烛台 + 装饰(每房)
    for (const r of rooms) fillRooms(st, rng, r, def, theme);
    __st?.('fr', ox, oy, 0, __rn());
    // 8) AgeRoom:七主题蚀变(原版无噪声种子掷骰——旧实现自掷 1<<30 非原版消耗,已删)
    for (const r of rooms) {
      ageRoom(st, rng, gs, r, theme, def);
      __st?.('ar', ox, oy, r.w * 100 + r.h, __rn());
    }
    // 9) 宝箱(ChestChance=1.0,四级联)
    placeChests(st, rng, gs, chests, rooms, def, theme);
    __st?.('ch', ox, oy, 0, __rn());
    // 10) 主题专属件(HouseBuilder.cs:833-913):丛林磨刀站/沙漠提炼机,均只有底行
    //     级联;上限 _random.Next(2,5) 是【每屋重掷】(:835/:871,条件短路保证仅
    //     对应主题掷)——旧实现 pass 级掷一次全程复用(C7)
    if (theme === 'jungle' && sharpCount < rng.int(2, 4)) {
      if (cascadePlace(st, rng, rooms, 'v_377_sharpening_station', false)) sharpCount++;
    }
    if (theme === 'desert' && extractCount < rng.int(2, 4)) {
      if (cascadePlace(st, rng, rooms, 'v_219_extractinator', false)) extractCount++;
    }
    __st?.('bt', ox, oy, 0, __rn());
    return true;
  };

  // 主循环(cs:17152-17192):失败(oceanDepths/放置失败)消耗共享预算 10000 并
  // 重掷同名额(k--)——旧实现失败即弃、名额白丢(C8)
  const __hc = (globalThis as { __swHouseEv?: (phase: string, x: number, y: number) => void }).__swHouseEv;
  let fail = 10000;
  for (let n = 0; n < count; ) {
    if (fail <= 0) break;
    const ox = rng.int(80, w - 81);
    const oy = rng.int(Math.ceil(gs.worldSurfaceHigh + 20), h - 231);
    __hc?.('try', ox, oy);
    if (!placeHouse(ox, oy, true)) { fail--; __hc?.('no', ox, oy); continue; }
    __hc?.('ok', ox, oy);
    n++;
  }

  // ---- 沙漠追加小屋（cs:17193-17219）：UndergroundDesertHiveLocation 内追加
  //  AdditionalDesertHouseCount 座（RandomRectanglePoint），失败预算 10000 重试同下标
  const ud = gs.undergroundDesert;
  if (ud && ud.x1 > ud.x0 && ud.y1 > ud.y0) {
    let ry = ud.y0;
    let rh = ud.y1 - ud.y0;
    if (ry < gs.worldSurface + 26) {          // cs:17200-17205：上缘压到 worldSurface+26 下
      const cut = Math.floor(gs.worldSurface) + 26 - ry;
      ry += cut;
      rh -= cut;
    }
    if (rh > 0) {
      let budget = 10000;
      for (let l = 0; l < desertHouses;) {
        if (budget <= 0) break;
        const hx = rng.int(ud.x0, ud.x1);      // RandomRectanglePoint: Next(X, X+Width)
        const hy = rng.int(ry, ry + rh);
        __hc?.('dtry', hx, hy);
        if (!placeHouse(hx, hy, false)) { budget--; __hc?.('dno', hx, hy); continue; }
        __hc?.('dok', hx, hy);
        l++;
      }
    }
  }
  // ★pass 尾 tileSolid 翻转（cs:17220-17223）：226 蜥蜴砖/162 薄冰/225 蜂巢块/
  //   190 荧光菇块翻回非实心（pass 头 cs:17076-79 曾强制实心）。
  //   ★注意：原版此四格在 pass 前本就非实心（FragileIce cs:16782-83 / LifeCrystals
  //   尾 cs:16944 / SmoothWorld 尾 cs:16693 翻的）,此处是"还原"；本仓 pass 序偏差
  //   （小屋先于平滑/薄冰/生命水晶执行）,故本句实际把四格从数据初值 true 翻为 false,
  //   与原版在本 pass 之后的态一致（226 由 CaveWalls 头 cs:17822 回 true,162 由
  //   BeeLarva 尾 cs:21048 回 true,225/190 由 Piles 尾 cs:19599/19591 回 true）。
  flipGenSolid([226, 162, 225, 190], false);
}
