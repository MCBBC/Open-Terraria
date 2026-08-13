// 原版 #32 Dungeon pass 1:1（1456）：cs:14816 注册段 + DungeonCrawler.MakeDungeon +
// Legacy* 全家（LegacyDungeonLayoutProvider / LegacyDungeonHall / LegacyEntranceDungeonHall /
// LegacyDungeonRoom / LegacyDungeonEntrance）+ DungeonGlobal* 特征管线。与
// tools/golden/caves-oracle.cs 逐段同构对账（caves-checkpoint.test.ts 逐哈希裁决）。
// ★头部掷骰位移：SetupDungeonGenVarVariables 的入口类型 2 掷 + entrance RandomSeed 原版
// 在 **Dunes pass 头**消耗（cs:11542）；本仓库与 oracle 同步**延后到本 pass 头**
// （相对序 A→B→Seed→shelf→lantern→skewed）——pre-dungeon 检查点哈希保持现状。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import { UnifiedRandom } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../../../data/items';
import { tileRunner } from './TileRunner';
import { placeDoorClosed } from '../../Door';
import { furnitureStyleBase } from '../../FurnitureStyle';

const BLUE = TILE_BY_KEY['v_41_blue_brick']!;
const GREEN = TILE_BY_KEY['v_43_green_brick']!;
const PINK = TILE_BY_KEY['v_44_pink_brick']!;
const CRACKED_FOR_BRICK: Record<number, number> = {
  [BLUE]: TILE_BY_KEY['v_481_cracked_blue_brick'] ?? BLUE,
  [GREEN]: TILE_BY_KEY['v_482_cracked_green_brick'] ?? GREEN,
  [PINK]: TILE_BY_KEY['v_483_cracked_pink_brick'] ?? PINK,
};
const DOOR = TILE_BY_KEY['door_closed']!;
const SPIKE = TILE_BY_KEY['v_48_spike']!;
const PLATFORM = TILE_BY_KEY['platform']!;
const LANTERN = TILE_BY_KEY['lantern']!;
const CHANDELIER = TILE_BY_KEY['chandelier']!;
const DSWITCH = TILE_BY_KEY['v_136_switch']!;
const HANGING = TILE_BY_KEY['v_240_wall_hangings_3x3']!;
const CATACOMB = TILE_BY_KEY['v_241_catacombs']!;
const PAINTING = TILE_BY_KEY['v_242_paintings_6x4']!;
const BOOKCASE = TILE_BY_KEY['bookcase']!;
const BENCH = TILE_BY_KEY['bench']!;
const BATHTUB = TILE_BY_KEY['bathtub']!;
const BED = TILE_BY_KEY['bed']!;
const PIANO = TILE_BY_KEY['piano']!;
const DRESSER = TILE_BY_KEY['dresser']!;
const CANDELABRA = TILE_BY_KEY['candelabra']!;
const LAMP = TILE_BY_KEY['v_93_lamps']!;
const CLOCK = TILE_BY_KEY['grandfather_clock']!;
const STATUE = TILE_BY_KEY['v_105_statue']!;
const CANDLE = TILE_BY_KEY['candle']!;
const WATER_CANDLE = TILE_BY_KEY['water_candle']!;
const BOOKS = TILE_BY_KEY['v_50_books']!;
const TABLE = TILE_BY_KEY['table']!;
const CHAIR = TILE_BY_KEY['chair']!;
const WORKBENCH = TILE_BY_KEY['workbench']!;
const CHEST = TILE_BY_KEY['chest']!;
const CHEST2 = TILE_BY_KEY['v_467_chests_group_2']!;
const ALCHEMY = TILE_BY_KEY['v_355_alchemy_table']!;
const BEWITCH = TILE_BY_KEY['v_354_bewitching_table']!;

type ChestSink = Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null>; locked?: boolean }>;
type SnapFn = (name: string) => void;

// Main.tileSolidTop（Main.cs:6764-7841 全表 78 项）——SolidTile 判定的第二道门。
// 与 TILE_DEFS[].platform 近似集不同：桌14/工作台18/箱87/书架101/旗339 等皆 solidTop。
const DG_SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
const DG_DUNGEON_TILES = new Set([41, 43, 44, 677, 678, 679]);
const DG_DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
const DG_FRAMED_NOT_CUT = new Set<number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i];
  if (d?.vanilla?.sheet == null) continue;
  if (d.framed && !d.decor) DG_FRAMED_NOT_CUT.add(d.vanilla.sheet);
}
// PrefixLegacy.Prefixes 前缀池（PrefixLegacy.cs:9-64）+ ReducedNaturalChance（PrefixID.cs:9）
const DG_PRE: Record<string, number[]> = {
  swords: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 36, 37, 38, 53, 54, 55, 39, 40, 56, 41, 57, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 59, 60, 61, 81],
  spears: [36, 37, 38, 53, 54, 55, 39, 40, 56, 41, 57, 59, 60, 61],
  guns: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 58, 36, 37, 38, 53, 54, 55, 39, 40, 56, 41, 57, 42, 44, 45, 46, 47, 48, 49, 50, 51, 59, 60, 61, 82],
  magic: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 52, 36, 37, 38, 53, 54, 55, 39, 40, 56, 41, 57, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 59, 60, 61, 83],
  summon: [85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 55, 38, 54, 53, 57, 40, 56, 41, 39],
  boom: [36, 37, 38, 53, 54, 55, 39, 40, 56, 41, 57, 59, 60, 61],
  acc: [62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80],
};
const DG_PRE_REDUCED = new Set([7, 8, 9, 10, 11, 22, 23, 24, 29, 30, 31, 39, 40, 56, 41, 47, 48, 49]);
const DG_PRE_CLASS: Record<number, string> = {
  155: 'swords', 156: 'acc', 157: 'magic', 163: 'spears', 113: 'magic', 3317: 'boom',
  164: 'guns', 1156: 'guns', 1571: 'boom', 1569: 'boom', 1260: 'magic', 1572: 'summon',
  4607: 'summon', 5465: 'acc',
};
// 家具 item → tile（Item.cs createTile）
const DG_ITEM_TILE: Record<number, number> = {
  1396: 15, 1399: 15, 1402: 15, 1509: 15,
  1397: 14, 1400: 14, 1403: 14, 1510: 14,
  1398: 18, 1401: 18, 1404: 18, 1511: 18,
  1405: 33, 1406: 33, 1407: 33, 5743: 33,
  1408: 105, 1409: 105, 1410: 105,
  1414: 101, 1415: 101, 1416: 101, 1512: 101,
  1470: 79, 1471: 79, 1472: 79, 5740: 79,
  2376: 87, 2377: 87, 2378: 87, 5750: 87,
  2386: 88, 2387: 88, 2388: 88, 5741: 88,
  2402: 89, 2403: 89, 2404: 89, 5753: 89,
  2658: 90, 2659: 90, 2660: 90, 5739: 90,
  2664: 100, 2665: 100, 2666: 100, 5742: 100,
  2645: 93, 2646: 93, 2647: 93, 5748: 93,
  3900: 104, 3901: 104, 3902: 104, 5746: 104,
};

// DungeonBounds（DungeonBounds.cs）：Left/Right 钳 [10,w-10]、Top/Bottom 钳 [10,h-10]；
// CalculateHitbox 保证 R>L、B>T；Contains=Rectangle.Contains 半开区间。
class DBnd {
  L = 10; R = 10; T = 10; B = 10;
  has = false;
  constructor(public w: number, public h: number) {}
  private cx(v: number): number { return Math.max(10, Math.min(this.w - 10, v)); }
  private cy(v: number): number { return Math.max(10, Math.min(this.h - 10, v)); }
  set(l: number, t: number, r: number, b: number): void {
    this.L = this.cx(l); this.R = this.cx(r); this.T = this.cy(t); this.B = this.cy(b);
    this.calc();
  }
  calc(): void {
    if (this.R <= this.L) this.R = this.L + 1;
    if (this.B <= this.T) this.B = this.T + 1;
    this.has = true;
  }
  upd(x: number, y: number): void;
  upd(minX: number, minY: number, maxX: number, maxY: number): void;
  upd(a: number, b: number, c?: number, d?: number): void {
    if (c === undefined || d === undefined) {
      if (a < this.L) this.L = this.cx(a);
      if (a > this.R) this.R = this.cx(a);
      if (b < this.T) this.T = this.cy(b);
      if (b > this.B) this.B = this.cy(b);
    } else {
      if (a < this.L) this.L = this.cx(a);
      if (c > this.R) this.R = this.cx(c);
      if (b < this.T) this.T = this.cy(b);
      if (d > this.B) this.B = this.cy(d);
    }
    this.has = true;
  }
  topSet(t: number): void { this.T = this.cy(t); this.has = true; }
  inflate(a: number): void { this.set(this.L - a, this.T - a, this.R + a, this.B + a); }
  contains(x: number, y: number): boolean {
    return this.has && x >= this.L && x < this.R && y >= this.T && y < this.B;
  }
  containsF(x: number, y: number, fluff: number): boolean {
    if (fluff === 0) return this.contains(x, y);
    return this.has && x >= this.L - fluff && x < this.R + fluff && y >= this.T - fluff && y < this.B + fluff;
  }
}

interface DRoom {
  seed: number; x: number; y: number; start: boolean; generated: boolean;
  inner: DBnd; outer: DBnd; ex: number; ey: number; strength: number;
}
interface DHall {
  seed: number; generated: boolean; forceX: boolean; isEntrance: boolean;
  bounds: DBnd; sx: number; sy: number; ex: number; ey: number;
  sdx: number; sdy: number; edx: number; edy: number;
}
interface DDoor { x: number; y: number; dir: number; hall: boolean; skipOther: boolean; skipSpace: boolean; clear: boolean; fluff: number; }
interface DPlat { x: number; y: number; hall: boolean; }

/** #32 Dungeon pass（1456 1:1，与 caves-oracle.cs 同构）。snap 回调用于逐段检查点。 */
export function runDungeonPass(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink, snap: SnapFn = () => {},
): void {
  const { w, h } = st;
  const ws = gs.worldSurface, rock = gs.rockLevel;
  const dgUR = (seed: number): UnifiedRandom => new UnifiedRandom(seed);
  // 掷骰适配：ri(a,b)=Next(a,b+1)；rn(n)=Next(n)；rd()=NextDouble()；raw()=Next()
  const ri = (a: number, b: number): number => rng.int(a, b);
  const rn = (n: number): number => rng.nextInt(n);
  const rd = (): number => rng.next();
  const raw = (): number => rng.vanilla.next();
  const theme = gs.dungeonTheme >= 0 ? gs.dungeonTheme : ri(0, 2);
  const brick = theme === 0 ? BLUE : theme === 1 ? GREEN : PINK;
  const wall = theme === 0 ? 7 : theme === 1 ? 8 : 9;
  const crack = CRACKED_FOR_BRICK[brick] ?? brick;
  const wallVariants: number[] = wall === 8 ? [8, 98, 99] : wall === 9 ? [9, 96, 97] : [7, 94, 95];
  // outerPotentialDungeonBounds（CreatePotentialDungeonBounds，DungeonUtils.cs:2058）
  const potTp = (ws + 10.0) / h, potBt = ((h - 200) - 10.0) / h;
  const potL = gs.dungeonSide > 0 ? Math.trunc(w * 0.525) : Math.trunc(w * 0.05);
  const potR = gs.dungeonSide > 0 ? w - Math.trunc(w * 0.05) : Math.trunc(w * 0.45);
  const potT = Math.max(10, Math.min(h - 10, Math.trunc(h * potTp)));
  const potB = Math.max(10, Math.min(h - 10, Math.trunc(h * potBt)));
  const potContains = (x: number, y: number): boolean =>
    x >= Math.max(10, Math.min(w - 10, potL)) && x < Math.max(10, Math.min(w - 10, potR)) && y >= potT && y < potB;
  rn(3);                              // 入口类型掷①（普通世界 flag 即真一轮；结果不消费照掷）
  rn(3);                              // 入口类型掷②
  const entSeed = raw();              // preGenDungeonEntranceSettings.RandomSeed
  const shelf = [ri(9, 12), 0, 0];    // SetupDungeonDataVariables（cs:243-254）
  do { shelf[1] = ri(9, 12); } while (shelf[1] === shelf[0]);
  shelf[2] = ri(9, 12);
  while (shelf[2] === shelf[0] || shelf[2] === shelf[1]) shelf[2] = ri(9, 12);
  const lantern = [rn(7), 0, 0];      // cs:255-266
  do { lantern[1] = rn(7); } while (lantern[1] === lantern[0]);
  lantern[2] = rn(7);
  while (lantern[2] === lantern[0] || lantern[2] === lantern[1]) lantern[2] = rn(7);
  const bannerStyles = [10, 11, 12, 13, 14, 15];
  const skewed = rn(4) === 0;         // cs:274 useSkewedDungeonEntranceHalls
  const doorStyle = theme === 0 ? 16 : theme === 1 ? 17 : 18;  // Item 1411-1413 placeStyle
  // —— 状态（DungeonData/GenVars）——
  const rooms: DRoom[] = [];
  const halls: DHall[] = [];
  const doorData: DDoor[] = [];
  const platData: DPlat[] = [];
  const pits: DBnd[] = [];
  const bounds = new DBnd(w, h);
  const entBounds = new DBnd(w, h);
  let entExists = false;
  let entOnSurface = false;
  let lastHallX = 0, lastHallY = 0;
  let pitFlood = true;
  let lootStyle = 0;
  let posX = 0, posY = 0, topX = 0;
  let dungeonX = 0, dungeonY = 0;
  let shadowKey = false, ramRune = false;
  // —— 深度锚点（cs:14828-14870）——
  const x0 = gs.dungeonLocation;
  let y0 = Math.trunc((ws + rock) / 2) + ri(-200, 199);
  {
    const cap = Math.trunc((ws + rock) / 2) + 200;
    let solid = false;
    for (let k = 0; k < 10; k++) if (dgSolid(x0, y0 + k)) { solid = true; break; }
    if (!solid) { while (y0 < cap && !dgSolid(x0, y0 + 10)) y0++; }
    if (solid) {
      let n4 = 0;
      while (dgSolid(x0, y0 - n4)) { n4++; if (n4 === 60) break; }
      if (n4 < 60) y0 += 60 - n4;
    }
  }
  // —— MakeDungeon（cs:327-505）——
  const s1x = ri(25, 29) + 0.0, s1y = ri(20, 24) + 0.0;
  const s2x = ri(35, 49) + 0.0, s2y = ri(10, 14) + 0.0;
  let num = Math.trunc(w / 60); num += rn(Math.trunc(num / 3));          // cs:353-355 num += Next(0, num/3)
  posX = x0; posY = y0;
  bounds.set(x0, y0, x0, y0);
  dgLayout(num);
  // cs:374-396：最高已生成房 InnerBounds 顶部中心回写
  {
    const ib = rooms[0].inner;
    let bx = (ib.L + ib.R) / 2, by = ib.T;
    for (let i = 1; i < rooms.length; i++) {
      if (!rooms[i].generated) continue;
      const b2 = rooms[i].inner;
      const cx = (b2.L + b2.R) / 2, cy = b2.T;
      if (cy < by) { bx = cx; by = cy; }
    }
    posX = Math.trunc(bx); posY = Math.trunc(by); topX = Math.trunc(bx);
  }
  snap('dungeonL');
  // —— 爬升入口大厅（cs:398-449）——
  entOnSurface = false;
  {
    let roomDelay = 5, guard = 100;
    while (!entOnSurface) {
      guard--;
      if (guard <= 0) break;
      if (roomDelay > 0) roomDelay--;
      if (roomDelay === 0 && rn(5) === 0 && posY > ws + 100) {
        roomDelay = 10;
        const sx = posX, sy = posY;
        dgHall({ seed: raw(), generated: true, forceX: false, isEntrance: false, bounds: new DBnd(w, h), sx: 0, sy: 0, ex: 0, ey: 0, sdx: 0, sdy: 0, edx: 0, edy: 0 });
        dgRoom({ seed: raw(), x: posX, y: posY, start: false, generated: true, inner: new DBnd(w, h), outer: new DBnd(w, h), ex: 0, ey: 0, strength: 0 });
        posX = sx; posY = sy;
      }
      dgEntHall(raw());
    }
  }
  dgEntrance(raw(), entSeed);
  snap('dungeonE');
  for (const rm of rooms) if (rm.generated) roomPlatformsDoors(rm);
  for (const hl of halls) if (hl.generated) hallPlatformsDoors(hl);
  snap('dungeonPD');
  dgEarly(); snap('dungeonPi');
  dgSpikes(); snap('dungeonS');
  dgDoorsF(); snap('dungeonD');
  dgWallVariants(); snap('dungeonW');
  dgPlatforms(); snap('dungeonP');
  dgBiomeChests(); snap('dungeonC');
  dgBookshelves(); snap('dungeonB');
  dgBasicChests(); snap('dungeonG');
  bounds.inflate(25);
  dgLights(); snap('dungeonI');
  dgTraps(); snap('dungeonT');
  dgFurniture(); snap('dungeonF');
  dgPaintings(); snap('dungeonPa');
  dgBanners(); snap('dungeonBa');
  snap('dungeon');
  // —— GenState 回填（消费端：Pyramids 回避带 / 刷怪门槛 / 老头锚）——
  gs.generatingDungeonPositionX = topX;
  gs.dungeonY = dungeonY;
  gs.dungeonEntX = dungeonX; gs.dungeonEntY = dungeonY;

  // ================= 基础谓词（DungeonUtils / WorldGen 门禁同构）=================
  function dgSolid(x: number, y: number): boolean {
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.flags[i]) return false;
    const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
    if (!TILE_DEFS[st.type[i]]?.solid || DG_SOLID_TOP.has(sheet)) return false;
    if (sheet === 481 || sheet === 482 || sheet === 483) return false;   // SetCrackedBrickSolidity(false)
    return true;
  }
  const isDW = (v: number): boolean => v > 0 && DG_DUNGEON_WALLS.has(v);
  const isDT = (t: number): boolean => t > 0 && DG_DUNGEON_TILES.has(t);
  const inW = (x: number, y: number, fluff: number): boolean =>
    x >= fluff && x < w - fluff && y >= fluff && y < h - fluff;
  const wallAt = (x: number, y: number): number => (st.inBounds(x, y) ? st.wall[st.idx(x, y)] : 0);
  const actAt = (x: number, y: number): number => (st.inBounds(x, y) ? st.flags[st.idx(x, y)] : 0);
  const typAt = (x: number, y: number): number => (st.inBounds(x, y) ? st.type[st.idx(x, y)] : 0);
  // GetHighestProtectionTypeFromPoint（:1704）——Legacy 房形状数据恒空 → 基类 Walls/None
  function prot(x: number, y: number, list: DRoom[]): number {
    let p = 0;
    for (const rm of list) {
      const q = rm.outer.contains(x, y) ? 2 : 0;
      if (q === 1) p = p === 2 ? 3 : 1;
      else if (q === 2) p = p === 1 ? 3 : 2;
      else if (q === 3) p = 3;
      if (p === 3) break;
    }
    return p;
  }
  // GetAllRoomsInSpots（:1773）：起/中/终三取样
  function roomsInSpots(sx: number, sy: number, ex: number, ey: number, fluff: number): DRoom[] {
    const mx = sx + (ex - sx) / 2, my = sy + (ey - sy) / 2;
    return rooms.filter((rm) =>
      rm.outer.containsF(Math.trunc(sx), Math.trunc(sy), fluff)
      || rm.outer.containsF(Math.trunc(mx), Math.trunc(my), fluff)
      || rm.outer.containsF(Math.trunc(ex), Math.trunc(ey), fluff));
  }
  function chTile(i: number, t: number, reset: boolean): void {
    if (reset) {
      st.type[i] = 0; st.wall[i] = 0; st.liquid[i] = 0; st.liquidType[i] = 0; st.flags[i] = 0;
    }
    st.flags[i] = 1; st.type[i] = t;
  }
  function chWall(i: number, wl: number, reset: boolean): void {
    if (reset) {
      st.type[i] = 0; st.wall[i] = 0; st.liquid[i] = 0; st.liquidType[i] = 0; st.flags[i] = 0;
    }
    st.wall[i] = wl;
  }
  // DungeonHall.CanPlaceTileAt（DungeonHall.cs:161）——普通世界：仅非地牢墙置砖
  function canPlaceTileAt(i: number): boolean {
    if (isDW(st.wall[i])) {
      if (st.flags[i]) {
        if (isDT(st.type[i])) return false;
        return st.type[i] !== crack;
      }
      return false;
    }
    return true;
  }
  // ================= LegacyDungeonLayoutProvider.LegacyDungeonLayout（:25-98）=================
  function dgLayout(steps: number): void {
    bounds.set(posX, posY, posX, posY);
    dgRoom({ seed: raw(), x: posX, y: posY, start: true, generated: true, inner: new DBnd(w, h), outer: new DBnd(w, h), ex: 0, ey: 0, strength: 0 });
    let roomDelay = 5;
    let s = steps;
    while (s > 0) {
      bounds.upd(posX, posY);
      s--;
      if (roomDelay > 0) roomDelay--;
      if (roomDelay === 0 && rn(3) === 0) {
        roomDelay = 5;
        if (rn(2) === 0) {
          const sx = posX, sy = posY;
          dgHall({ seed: raw(), generated: true, forceX: false, isEntrance: false, bounds: new DBnd(w, h), sx: 0, sy: 0, ex: 0, ey: 0, sdx: 0, sdy: 0, edx: 0, edy: 0 });
          if (rn(2) === 0) dgHall({ seed: raw(), generated: true, forceX: false, isEntrance: false, bounds: new DBnd(w, h), sx: 0, sy: 0, ex: 0, ey: 0, sdx: 0, sdy: 0, edx: 0, edy: 0 });
          dgRoom({ seed: raw(), x: posX, y: posY, start: false, generated: true, inner: new DBnd(w, h), outer: new DBnd(w, h), ex: 0, ey: 0, strength: 0 });
          posX = sx; posY = sy;
        } else {
          dgRoom({ seed: raw(), x: posX, y: posY, start: false, generated: true, inner: new DBnd(w, h), outer: new DBnd(w, h), ex: 0, ey: 0, strength: 0 });
        }
      } else {
        dgHall({ seed: raw(), generated: true, forceX: false, isEntrance: false, bounds: new DBnd(w, h), sx: 0, sy: 0, ex: 0, ey: 0, sdx: 0, sdy: 0, edx: 0, edy: 0 });
      }
    }
    dgRoom({ seed: raw(), x: posX, y: posY, start: false, generated: true, inner: new DBnd(w, h), outer: new DBnd(w, h), ex: 0, ey: 0, strength: 0 });
  }
  // ================= LegacyDungeonRoom.LegacyRoom（:104-304）=================
  function dgRoom(s: { seed: number; x: number; y: number; start: boolean }): void {
    const hr = dgUR(s.seed);
    const hri = (a: number, b: number): number => hr.nextIntRange(a, b + 1);
    const hrn = (n: number): number => hr.nextInt(n);
    const hrd = (): number => hr.nextDouble();
    const num2 = Math.trunc(15.0) + hri(0, 14);                 // 15 + Next(15)
    let vx = hri(-10, 10) * 0.1, vy = hri(-10, 10) * 0.1;
    if (vx === 0 && vy === 0) {
      if (hrn(2) === 0) vx = hrn(2) !== 0 ? 1 : -1;
      else vy = hrn(2) !== 0 ? 1 : -1;
    }
    let px = s.x + 0.0, py = s.y - num2 / 2.0;
    let num4 = Math.trunc(10.0) + hri(0, 9);                    // 10 + Next(10)
    const num5 = num2, num6 = 0.5;
    const rm: DRoom = { seed: s.seed, x: s.x, y: s.y, start: s.start, generated: true, inner: new DBnd(w, h), outer: new DBnd(w, h), ex: 0, ey: 0, strength: 0 };
    rm.inner.set(Math.trunc(px), Math.trunc(py), Math.trunc(px), Math.trunc(py));
    rm.outer.set(Math.trunc(px), Math.trunc(py), Math.trunc(px), Math.trunc(py));
    rooms.push(rm);
    while (num4 > 0) {
      num4--;
      const x0 = Math.max(0, Math.min(w - 1, Math.trunc(px - num2 * 0.800000011920929 - 5.0)));
      const x1 = Math.max(0, Math.min(w - 1, Math.trunc(px + num2 * 0.800000011920929 + 5.0)));
      const y0 = Math.max(0, Math.min(h - 1, Math.trunc(py - num2 * 0.800000011920929 - 5.0)));
      const y1 = Math.max(0, Math.min(h - 1, Math.trunc(py + num2 * 0.800000011920929 + 5.0)));
      bounds.upd(x0, y0, x1 - 1, y1 - 1);
      rm.outer.upd(x0, y0, x1 - 1, y1 - 1);
      const ix0 = Math.max(0, Math.min(w - 1, Math.trunc(px - num2 * num6)));
      const ix1 = Math.max(0, Math.min(w - 1, Math.trunc(px + num2 * num6)));
      const iy0 = Math.max(0, Math.min(h - 1, Math.trunc(py - num2 * num6)));
      const iy1 = Math.max(0, Math.min(h - 1, Math.trunc(py + num2 * num6)));
      rm.inner.upd(ix0, iy0, ix1 - 1, iy1 - 1);
      for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          const i = st.idx(x, y);
          st.liquid[i] = 0;
          if (!isDW(st.wall[i])) chTile(i, brick, true);
        }
      }
      for (let x = x0 + 1; x < x1 - 1; x++) {
        for (let y = y0 + 1; y < y1 - 1; y++) chWall(st.idx(x, y), wall, false);
      }
      for (let x = ix0; x < ix1; x++) {
        for (let y = iy0; y < iy1; y++) chWall(st.idx(x, y), wall, true);
      }
      px += vx; py += vy;
      vx = Math.max(-1, Math.min(1, vx + hri(-10, 10) * 0.05));
      vy = Math.max(-1, Math.min(1, vy + hri(-10, 10) * 0.05));
    }
    rm.ex = px; rm.ey = py; rm.strength = Math.trunc(num5);
    posX = Math.trunc(px); posY = Math.trunc(py);
  }

  // ================= LegacyDungeonHall.LegacyHall（Halls/LegacyDungeonHall.cs:65-876）=================
  function dgHall(s: DHall): void {
    const hr = dgUR(s.seed);
    const hri = (a: number, b: number): number => hr.nextIntRange(a, b + 1);
    const hrn = (n: number): number => hr.nextInt(n);
    const hrd = (): number => hr.nextDouble();
    let vx = 0, vy = 0;
    let nnum = 4 + hrn(2);                                      // (int)(4*hallStrengthScalar)+Next(2)
    let px = posX + 0.0, py = posY + 0.0;
    const sx = px, sy = py;
    let num2 = 1;
    let num3 = 35 + hrn(45);                                    // (int)(35*hallStepScalar)+Next(45)
    const dangerous = hrd() <= 0.166;                            // CrackedBrickChance（DungeonHallSettings.cs:15）
    if (s.forceX) { num3 += 20; lastHallX = 0; lastHallY = 0; }
    else if (hrn(5) === 0) { nnum *= 2; num3 = Math.trunc(num3 / 2); }
    const steps0 = num3;
    const num4 = nnum;
    const num5 = 0.5;                                           // hallInteriorToExteriorRatio
    let flag2 = false;                                          // Zigzag
    const num6 = (h - 200) - 100;                               // UnderworldLayer-100*max(scalars)
    let first = true, done = false;
    let z2x = 0, z2y = 0;
    while (!done) {
      let horiz = false;
      if (first && !s.forceX) {
        let f7 = true, f8 = true, f9 = true, f10 = true, f11 = false;
        const n7 = num3;
        let f12 = false;
        for (let y = Math.trunc(py); y > Math.trunc(py) - n7; y--) {
          if (!inW(Math.trunc(px), y, 50)) { f7 = false; break; }
          if (isDW(wallAt(Math.trunc(px), y))) { if (f12) { f7 = false; break; } } else f12 = true;
        }
        f12 = false;
        for (let y = Math.trunc(py); y < Math.trunc(py) + n7; y++) {
          if (!inW(Math.trunc(px), y, 50)) { f8 = false; break; }
          if (y >= num6) { f11 = true; f8 = false; break; }
          if (isDW(wallAt(Math.trunc(px), y))) { if (f12) { f8 = false; break; } } else f12 = true;
        }
        f12 = false;
        for (let x = Math.trunc(px); x > Math.trunc(px) - n7; x--) {
          if (!inW(x, Math.trunc(py), 50)) { f9 = false; break; }
          if (isDW(wallAt(x, Math.trunc(py)))) { if (f12) { f9 = false; break; } } else f12 = true;
        }
        f12 = false;
        for (let x = Math.trunc(px); x < Math.trunc(px) + n7; x++) {
          if (!inW(x, Math.trunc(py), 50)) { f10 = false; break; }
          if (isDW(wallAt(x, Math.trunc(py)))) { if (f12) { f10 = false; break; } } else f12 = true;
        }
        if (!f9 && !f10 && !f7 && !f8) {
          num2 = hrn(2) !== 0 ? 1 : -1;
          if (hrn(2) === 0) horiz = true;
          if (num2 === 1 && !horiz && f11) {
            num2 = hrn(2) === 0 ? 1 : -1;
            horiz = true;
          }
        } else {
          let n10 = 0, n11 = 100;
          do {
            n11--;
            if (n11 <= 0) { n10 = 0; break; }
            n10 = hrn(4);
            if (n10 === 1 && f11) n10 = hrn(2) === 0 ? 2 : 3;
          } while (!((n10 === 0 && f7) || (n10 === 1 && f8) || (n10 === 2 && f9) || (n10 === 3 && f10)));
          if (n10 === 0) num2 = -1;
          else if (n10 === 1) num2 = 1;
          else { horiz = true; num2 = n10 !== 2 ? 1 : -1; }
        }
      } else {
        num2 = hrn(2) !== 0 ? 1 : -1;
        if (hrn(2) === 0) horiz = true;
        if (num2 === 1 && py + num3 >= num6) {
          num2 = hrn(2) !== 0 ? 1 : -1;
          horiz = true;
        }
      }
      first = false;
      if (s.forceX) horiz = true;
      if (horiz) {
        z2x = -num2; z2y = 0;
        vy = 0; vx = num2;
        if (hrn(3) === 0) vy = hrn(2) === 0 ? -0.20000000298023224 : 0.20000000298023224;
      } else {
        nnum++;
        vy = num2; vx = 0;
        z2x = 0; z2y = -num2;
        if (hrd() <= 0.66) {                                    // ZigzagChance=0.66
          flag2 = true;
          vx = hrn(2) === 0 ? hri(10, 19) * 0.1 : -hri(10, 19) * 0.1;
        } else if (hrn(2) === 0) {
          vx = hrn(2) === 0 ? hri(20, 39) * 0.01 : -hri(20, 39) * 0.01;
        } else num3 = Math.trunc(num3 / 2);
      }
      if (lastHallX !== z2x || lastHallY !== z2y) done = true;
    }
    const n13 = w * 0.25, n14 = w * 0.75;
    const f13 = py < rock + 100.0;
    const f14 = px < w / 2 && px > n13;
    const f15 = px > w / 2 && px < n14;
    if (!s.forceX) {
      if (px > w - 200) {
        num2 = -1; z2x = num2; z2y = 0; vx = num2; vy = 0;
        if (hrn(3) === 0) vy = hrn(2) === 0 ? -0.20000000298023224 : 0.20000000298023224;
      } else if (px < 200.0) {
        num2 = 1; z2x = num2; z2y = 0; vx = num2; vy = 0;
        if (hrn(3) === 0) vy = hrn(2) === 0 ? -0.20000000298023224 : 0.20000000298023224;
      } else if (py >= num6) {
        num2 = -1; nnum++; z2x = 0; z2y = -num2; vx = 0; vy = num2;
        if (hrn(2) === 0) vx = hrn(2) === 0 ? hri(20, 49) * 0.01 : -hri(20, 49) * 0.01;
      } else if (py < 200.0) {
        num2 = 1; nnum++; z2x = 0; z2y = -num2; vx = 0; vy = num2;
        if (hrn(2) === 0) vx = hrn(2) === 0 ? hri(20, 49) * 0.01 : -hri(20, 49) * 0.01;
      } else if (f13) {
        num2 = 1; nnum++; z2x = 0; z2y = -num2; vx = 0; vy = num2;
        if (hrd() <= 0.66) {
          flag2 = true;
          vx = hrn(2) === 0 ? hri(10, 19) * 0.1 : -hri(10, 19) * 0.1;
        } else if (hrn(2) === 0) {
          vx = hrn(2) === 0 ? hri(20, 49) * 0.01 : hri(20, 49) * 0.01;   // ★反编译原样：else 同号（:628-633）
        }
      } else if (f14) {
        num2 = -1; z2y = 0; z2x = num2; vy = 0; vx = num2;
        if (hrn(3) === 0) vy = hrn(2) === 0 ? -0.20000000298023224 : 0.20000000298023224;
      } else if (f15) {
        num2 = 1; z2y = 0; z2x = num2; vy = 0; vx = num2;
        if (hrn(3) === 0) vy = hrn(2) === 0 ? -0.20000000298023224 : 0.20000000298023224;
      }
    }
    const sdX = -z2x, sdY = -z2y;
    lastHallX = sdX; lastHallY = sdY;
    if (Math.abs(vx) > Math.abs(vy) && hrn(3) !== 0) {
      nnum = Math.trunc(num4 * (hri(110, 149) * 0.01));
    }
    const hb = new DBnd(w, h);
    hb.set(Math.trunc(px), Math.trunc(py), Math.trunc(px), Math.trunc(py));
    const hall: DHall = { seed: s.seed, generated: true, forceX: s.forceX, isEntrance: false, bounds: hb, sx: sx, sy: sy, ex: 0, ey: 0, sdx: sdX, sdy: sdY, edx: sdX, edy: sdY };
    halls.push(hall);
    const roomsArea = roomsInSpots(px, py, px + vx * num3, py + vy * num3, Math.trunc(num3 / 2 + nnum));
    let cnt = 0;
    while (num3 > 0) {
      cnt++;
      if (sdX > 0 && px > w - 100) num3 = 0;
      else if (sdX < 0 && px < 100) num3 = 0;
      else if (sdY > 0 && py >= num6) num3 = 0;
      else if (sdY < 0 && py < 100) num3 = 0;
      else if (sdY < 0 && py < rock + 50.0) num3 = 0;
      num3--;
      const x0 = Math.max(0, Math.min(w - 1, Math.trunc(px - nnum - 4.0 - hrn(6))));
      const x1 = Math.max(0, Math.min(w - 1, Math.trunc(px + nnum + 4.0 + hrn(6))));
      const y0 = Math.max(0, Math.min(h - 1, Math.trunc(py - nnum - 4.0 - hrn(6))));
      const y1 = Math.max(0, Math.min(h - 1, Math.trunc(py + nnum + 4.0 + hrn(6))));
      bounds.upd(x0, y0, x1, y1);
      hb.upd(x0, y0, x1, y1);
      for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          const i = st.idx(x, y);
          const p = prot(x, y, roomsArea);
          if (p === 3) continue;
          const f16 = p !== 1;
          st.liquid[i] = 0;
          if (f16 && y <= h - 200 + 7 && canPlaceTileAt(i)) chTile(i, brick, true);
        }
      }
      for (let x = x0 + 1; x < x1 - 1; x++) {
        for (let y = y0 + 1; y < y1 - 1; y++) {
          if (y >= h - 200 + 7) continue;
          const i = st.idx(x, y);
          const p = prot(x, y, roomsArea);
          if (p === 3) continue;
          let f17 = true;
          if (p === 2 && isDW(st.wall[i])) f17 = false;
          if (f17) chWall(i, wall, false);
        }
      }
      let n21 = 0;
      if (vy === 0 && hrn(nnum + 1) === 0) n21 = hri(1, 2);
      else if (vx === 0 && hrn(nnum - 1) === 0) n21 = hri(1, 2);
      else if (hrn(nnum * 3) === 0) n21 = hri(1, 2);
      const kx0 = Math.max(0, Math.min(w - 1, Math.trunc(px - nnum * num5 - n21)));
      const kx1 = Math.max(0, Math.min(w - 1, Math.trunc(px + nnum * num5 + n21)));
      const ky0 = Math.max(0, Math.min(h - 1, Math.trunc(py - nnum * num5 - n21)));
      const ky1 = Math.max(0, Math.min(h - 1, Math.trunc(py + nnum * num5 + n21)));
      for (let x = kx0; x < kx1; x++) {
        for (let y = ky0; y < ky1; y++) {
          const i = st.idx(x, y);
          const p = prot(x, y, roomsArea);
          if (p === 3) continue;
          const f18 = p !== 1;
          let f19 = true;
          if (p === 2 && isDW(st.wall[i])) f19 = false;
          if (dangerous) {
            if ((st.flags[i] || !isDW(st.wall[i])) && y < h - 200) {
              st.flags[i] = 0;
              if (f18) chTile(i, crack, false);
            }
          } else st.flags[i] = 0;
          if (f19 && y < h - 200) chWall(i, wall, false);
        }
      }
      px += vx; py += vy;
      if (flag2 && cnt > hri(10, 19)) { cnt = 0; vx = -vx; }
    }
    posX = Math.trunc(px); posY = Math.trunc(py);
    hall.ex = px; hall.ey = py;
  }

  // ============ LegacyEntranceDungeonHall.LegacyHall（:23-380，UsePrecalculatedEntrance=false）============
  function dgEntHall(seed: number): void {
    const hr = dgUR(seed);
    const hri = (a: number, b: number): number => hr.nextIntRange(a, b + 1);
    const hrn = (n: number): number => hr.nextInt(n);
    let px = posX + 0.0, py = posY + 0.0;
    const num = hri(5, 8);
    let dir = px <= topX ? 1 : -1;
    if (px > w - 400) dir = -1;
    else if (px < 400) dir = 1;
    let vx = dir + 0.0, vy = -1.0;
    if (hrn(3) !== 0) vx *= 1 + hri(0, 199) * 0.01;
    else if (hrn(3) === 0) vx *= hri(50, 75) * 0.01;
    else if (hrn(6) === 0) vy *= 2.0;
    if (skewed) {
      if (posX < w / 2 && vx < 0 && vx < -0.5) vx = 0.5;
      if (posX > w / 2 && vx > 0 && vx > 0.5) vx = -0.5;
    } else {
      if (posX < w / 2 && vx < -0.5) vx = -0.5;
      if (posX > w / 2 && vx > 0.5) vx = 0.5;
    }
    const steps = hri(10, 29);
    const num5 = 0.5;
    const n6 = 30;
    const hb = new DBnd(w, h);
    hb.set(Math.trunc(px), Math.trunc(py), Math.trunc(px), Math.trunc(py));
    const hall: DHall = { seed, generated: true, forceX: false, isEntrance: true, bounds: hb, sx: px, sy: py, ex: 0, ey: 0, sdx: vx, sdy: vy, edx: vx, edy: vy };
    halls.push(hall);
    const roomsArea = roomsInSpots(px, py, px + vx * steps, py + vy * steps, Math.trunc(steps / 2 + num));
    let num4 = steps;
    while (num4 > 0) {
      num4--;
      if (!inW(Math.trunc(px), Math.trunc(py), n6 + 5)) break;
      const x0 = Math.max(n6, Math.min(w - n6 - 1, Math.trunc(px - num - 4.0 - hrn(6))));
      const x1 = Math.max(n6, Math.min(w - n6 - 1, Math.trunc(px + num + 4.0 + hrn(6))));
      const y0 = Math.max(n6, Math.min(h - n6 - 1, Math.trunc(py - num - 4.0)));
      const y1 = Math.max(n6, Math.min(h - n6 - 1, Math.trunc(py + num + 4.0 + hrn(6))));
      bounds.upd(x0, y0, x1, y1);
      hb.upd(x0, y0, x1, y1);
      const n13 = px > w / 2 ? -1 : 1;
      const n14 = Math.trunc(px + s1x * 0.6 * n13 + s2x * n13);
      const n15 = Math.trunc(s2y * 0.5);
      if (py < ws - 5.0) {
        const wy = Math.trunc(py - num - 6.0 + n15);
        const open = inW(n14, wy, 0) && wallAt(n14, wy) === 0
          && inW(n14, wy - 1, 0) && wallAt(n14, wy - 1) === 0
          && inW(n14, wy - 2, 0) && wallAt(n14, wy - 2) === 0;
        if (open) {
          entOnSurface = true;
          tileRunner(st, rng, gs, n14, wy, { strength: hri(25, 34), steps: hri(10, 19), type: -1, speedX: 0, speedY: -1 });
        }
      }
      for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          const i = st.idx(x, y);
          const p = prot(x, y, roomsArea);
          if (p === 3) continue;
          const f2 = p !== 1;
          st.liquid[i] = 0;
          if (f2 && canPlaceTileAt(i)) chTile(i, brick, true);
        }
      }
      for (let x = x0 + 1; x < x1 - 1; x++) {
        for (let y = y0 + 1; y < y1 - 1; y++) {
          const i = st.idx(x, y);
          const p = prot(x, y, roomsArea);
          if (p === 3) continue;
          let f3 = true;
          if (p === 2 && isDW(st.wall[i])) f3 = false;
          if (f3) chWall(i, wall, false);
        }
      }
      let n16 = 0;
      if (hrn(num) === 0) n16 = hri(1, 2);
      const kx0 = Math.max(n6, Math.min(w - n6 - 1, Math.trunc(px - num * num5 - n16)));
      const kx1 = Math.max(n6, Math.min(w - n6 - 1, Math.trunc(px + num * num5 + n16)));
      const ky0 = Math.max(n6, Math.min(h - n6 - 1, Math.trunc(py - num * num5 - n16)));
      const ky1 = Math.max(n6, Math.min(h - n6 - 1, Math.trunc(py + num * num5 + n16)));
      for (let x = kx0; x < kx1; x++) {
        for (let y = ky0; y < ky1; y++) {
          const i = st.idx(x, y);
          const p = prot(x, y, roomsArea);
          if (p === 3) continue;
          let f4 = true;
          if (p === 2 && isDW(st.wall[i])) f4 = false;
          st.flags[i] = 0;
          if (f4) chWall(i, wall, false);
        }
      }
      if (entOnSurface) num4 = 0;
      px += vx; py += vy;
      if (py < ws) vy *= 0.9800000190734863;
    }
    posX = Math.trunc(px); posY = Math.trunc(py);
    hall.ex = px; hall.ey = py;
  }

  // ============ LegacyDungeonEntrance.LegacyEntrance（Entrances/LegacyDungeonEntrance.cs:31-619）============
  function dgEntrance(seed: number, preSeed: number): void {
    const hr = dgUR(preSeed);
    const hri = (a: number, b: number): number => hr.nextIntRange(a, b + 1);
    const hrn = (n: number): number => hr.nextInt(n);
    const i = posX, j = posY;
    for (let x = i - 60; x < i + 60; x++) {
      for (let y = j - 60; y < j + 60; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        st.liquid[ti] = 0; st.liquidType[ti] = 0;
      }
    }
    let cx = i + 0.0, cy = j - s1y / 2.0;
    bounds.topSet(Math.trunc(cy));
    const num2 = i > w / 2 ? -1 : 1;
    entBounds.set(Math.trunc(cx), Math.trunc(cy), Math.trunc(cx), Math.trunc(cy));
    entExists = true;
    const solidBox = (x0: number, y0: number, x1: number, y1: number, inner: boolean): void => {
      for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0;
          if (st.wall[ti] !== wall) {
            st.wall[ti] = 0;
            if (inner && x > x0 + 1 && x < x1 - 2 && y > y0 + 1 && y < y1 - 2) st.wall[ti] = wall;
            chTile(ti, brick, false);
          }
        }
      }
    };
    const fillIfNotDW = (x0: number, y0: number, x1: number, y1: number): void => {
      for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0;
          if (!isDW(st.wall[ti])) chTile(ti, brick, false);
        }
      }
    };
    const clampX = (v: number): number => Math.max(0, Math.min(w - 1, v));
    const clampY = (v: number): number => Math.max(0, Math.min(h - 1, v));
    let n3 = clampX(Math.trunc(cx - s1x * 0.6000000238418579 - hri(2, 4)));
    let n4 = clampX(Math.trunc(cx + s1x * 0.6000000238418579 + hri(2, 4)));
    let n5 = clampY(Math.trunc(cy - s1y * 0.6000000238418579 - hri(2, 4)));
    let n6 = clampY(Math.trunc(cy + s1y * 0.6000000238418579 + hri(8, 15)));
    entBounds.upd(n3, n5, n4, n6);
    solidBox(n3, n5, n4, n6, true);
    // 垛口（左/右）
    {
      const a0 = clampX(n3);
      const a1 = clampX(n3 + 5 + hrn(4));
      const b0 = clampY(n5 - 3 - hrn(3));
      entBounds.upd(a0, b0, a1, n5);
      fillIfNotDW(a0, b0, a1, n5);
      const c0 = clampX(n4 - 5 - hrn(4));
      const c1 = clampX(n4);
      const d0 = clampY(n5 - 3 - hrn(3));
      entBounds.upd(c0, d0, c1, n5);
      fillIfNotDW(c0, d0, c1, n5);
    }
    // 顶齿（周期 num15 刷 num15 跳）
    {
      const n15 = 2 + hrn(4);
      const n16 = 1 + hrn(2);
      let n17 = 0;
      const n18 = clampY(n5 - n16);
      bounds.upd(n3, n18, n4, n5);
      for (let x = n3; x < n4; x++) {
        for (let y = n18; y < n5; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0;
          if (!isDW(st.wall[ti])) chTile(ti, brick, false);
        }
        n17++;
        if (n17 >= n15) { x += n15; n17 = 0; }
      }
    }
    // 下延到 worldSurface（cs:215-251：TileIsInStyle 判定 + 潜在带跳过）
    for (let x = n3; x < n4; x++) {
      for (let y = n5; y < ws; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        st.liquid[ti] = 0;
        if (potContains(x, y - 5)) continue;
        const f1 = st.flags[ti] !== 0 && typAt(x, y) !== brick && typAt(x, y) !== crack;
        const f2 = st.wall[ti] !== wall;
        const f3 = isDW(st.wall[ti]);
        if ((st.flags[ti] !== 0 && f1) || !f3) {
          chTile(ti, brick, false);
          if (x > n3 && x < n4 - 1) st.wall[ti] = wall;
        } else if (f2 && x > n3 && x < n4 - 1) st.wall[ti] = wall;
      }
    }
    // 0.5 框塔内厅
    {
      const a0 = clampX(Math.trunc(cx - s1x * 0.5));
      const a1 = clampX(Math.trunc(cx + s1x * 0.5));
      const b0 = clampY(Math.trunc(cy - s1y * 0.5));
      const b1 = clampY(Math.trunc(cy + s1y * 0.5));
      entBounds.upd(a0, b0, a1, b1);
      for (let x = a0; x < a1; x++) {
        for (let y = b0; y < b1; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0; st.flags[ti] = 0; st.wall[ti] = wall;
        }
      }
    }
    // 门厅平台候选（:269-303）
    {
      let n26 = Math.trunc(cx);
      const n27 = n6;
      for (let k = 0; k < 20; k++) {
        n26 = Math.trunc(cx) - k;
        if (n26 <= 0) break;
        if (actAt(n26, n27) === 0 && isDW(wallAt(n26, n27))) { platData.push({ x: n26, y: n27, hall: false }); break; }
        n26 = Math.trunc(cx) + k;
        if (n26 >= w) break;
        if (actAt(n26, n27) === 0 && isDW(wallAt(n26, n27))) { platData.push({ x: n26, y: n27, hall: false }); break; }
      }
    }
    // —— 第二段（外门厅）——
    cx += s1x * 0.6000000238418579 * num2;
    cy += s1y * 0.5;
    const sx2 = s2x, sy2 = s2y;
    cx += sx2 * 0.550000011920929 * num2;
    cy -= sy2 * 0.5;
    n3 = clampX(Math.trunc(cx - sx2 * 0.6000000238418579 - hri(1, 2)));
    n4 = clampX(Math.trunc(cx + sx2 * 0.6000000238418579 + hri(1, 2)));
    n5 = clampY(Math.trunc(cy - sy2 * 0.6000000238418579 - hri(1, 2)));
    n6 = clampY(Math.trunc(cy + sy2 * 0.6000000238418579 + hri(6, 15)));
    entBounds.upd(n3, n5, n4, n6);
    for (let x = n3; x < n4; x++) {
      for (let y = n5; y < n6; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        if (st.flags[ti] !== 0 && st.type[ti] === brick) continue;
        st.liquid[ti] = 0;
        let f4 = true;
        if (num2 < 0) { if (x < cx - sx2 * 0.5) f4 = false; }
        else if (x > cx + sx2 * 0.5 - 1.0) f4 = false;
        if (f4) { st.wall[ti] = 0; chTile(ti, brick, false); }
      }
    }
    entBounds.upd(n3, n5, n4, Math.trunc(ws));
    for (let x = n3; x < n4; x++) {
      for (let y = n6; y < ws; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        st.liquid[ti] = 0;
        if (potContains(x, y - 5)) continue;
        const f5 = st.flags[ti] !== 0 && st.type[ti] !== brick && st.type[ti] !== crack;
        const f6 = st.wall[ti] !== wall;
        const f7 = isDW(st.wall[ti]);
        if ((st.flags[ti] !== 0 && f5) || !f7) {
          chTile(ti, brick, false);
          if (x > n3 && x < n4 - 1) st.wall[ti] = wall;
        } else if (f6 && x > n3 && x < n4 - 1) st.wall[ti] = wall;
      }
    }
    // 第二段垛口+顶齿
    const m7 = clampX(Math.trunc(cx - sx2 * 0.5));
    let m8 = m7;
    if (num2 < 0) m8 = clampX(m8 + 1);
    const e1 = clampX(m8 + 5 + hrn(4));
    const f1v = clampY(n5 - 3 - hrn(3));
    entBounds.upd(m8, f1v, e1, n5);
    fillIfNotDW(m8, f1v, e1, n5);
    const g0 = clampX(clampX(Math.trunc(cx + sx2 * 0.5)) - 5 - hrn(4));
    const g1 = clampX(Math.trunc(cx + sx2 * 0.5));
    const h0 = clampY(n5 - 3 - hrn(3));
    entBounds.upd(g0, h0, g1, n5);
    fillIfNotDW(g0, h0, g1, n5);
    const n4b = num2 < 0 ? g1 + 1 : g1;
    {
      const n16b = 1 + hrn(2);
      const n15b = 2 + hrn(4);
      let n17 = 0;
      for (let x = m7 + 1; x < n4b - 1; x++) {
        for (let y = clampY(n5 - n16b); y < n5; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0;
          if (st.wall[ti] !== wall) chTile(ti, brick, false);
        }
        n17++;
        if (n17 >= n15b) { x += n15b; n17 = 0; }
      }
    }
    // 0.6 框清墙（cs:465-483：normal 世界必跑）
    {
      const a0 = clampX(Math.trunc(cx - sx2 * 0.6000000238418579));
      const a1 = clampX(Math.trunc(cx + sx2 * 0.6000000238418579));
      const b0 = clampY(Math.trunc(cy - sy2 * 0.6000000238418579));
      const b1 = clampY(Math.trunc(cy + sy2 * 0.6000000238418579));
      entBounds.upd(a0, b0, a1, b1);
      for (let x = a0; x < a1; x++) {
        for (let y = b0; y < b1; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0; st.wall[ti] = 0;
        }
      }
    }
    // 0.5 框开放门厅 + 老头锚
    {
      const a0 = clampX(Math.trunc(cx - sx2 * 0.5));
      const a1 = clampX(Math.trunc(cx + sx2 * 0.5));
      const b0 = clampY(Math.trunc(cy - sy2 * 0.5));
      const b1 = clampY(Math.trunc(cy + sy2 * 0.5));
      entBounds.upd(a0, b0, a1, b1);
      for (let x = a0; x < a1; x++) {
        for (let y = b0; y < b1; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0; st.flags[ti] = 0; st.wall[ti] = 0;
        }
      }
      dungeonX = Math.trunc(cx); dungeonY = b1;
    }
    // 条纹窗墙（PlaceWall：墙==0 才写）
    {
      const n16c = 1 + hrn(2);
      const n15c = 2 + hrn(4);
      let n17 = 0;
      const b0 = clampY(Math.trunc(cy - sy2 * 0.5));
      const b1 = clampY(Math.trunc(cy + sy2 * 0.5));
      let a0 = clampX(Math.trunc(cx - sx2 * 0.5) + 2);
      let a1 = clampX(Math.trunc(cx + sx2 * 0.5) - 2);
      for (let x = a0; x < a1; x++) {
        for (let y = b0; y < b1 + 1; y++) {
          if (x > 1 && y > 1 && x < w - 2 && y < h - 2 && wallAt(x, y) === 0) st.wall[st.idx(x, y)] = wall;
        }
        n17++;
        if (n17 >= n15c) { x += n15c * 2; n17 = 0; }
      }
    }
    // 门洞 15×3 清空 + PlaceTile(10, style13)
    cx -= sx2 * 0.6000000238418579 * num2;
    cy += sy2 * 0.5;
    cy -= 1.5;
    {
      const dL = Math.trunc(cx - 7.5), dR = Math.trunc(cx + 7.5);
      const dT = Math.trunc(cy - 1.5), dB = Math.trunc(cy + 1.5);
      for (let x = dL; x < dR; x++) {
        for (let y = dT; y < dB; y++) {
          if (st.inBounds(x, y)) st.flags[st.idx(x, y)] = 0;
        }
      }
      if (num2 < 0) cx -= 1.0;
      placeDoorClosed(st, Math.trunc(cx), Math.trunc(cy) + 1, 13);
    }
  }

  // ============ 门/平台候选 ============
  // CalculatePlatformsAndDoorsOnEdgesOfRoom（DungeonUtils.cs:91-224，fluff=3）
  function roomPlatformsDoors(rm: DRoom): void {
    const num = Math.max(5, rm.inner.L), num2 = Math.min(w - 5, rm.inner.R);
    const num3 = Math.max(5, rm.inner.T), num4 = Math.min(h - 5, rm.inner.B);
    let f2 = false, f3 = false;
    for (let x = num; x <= num2; x++) {
      if (!f2 && inW(x, num3 - 1, 0) && actAt(x, num3 - 1) === 0) {
        platData.push({ x, y: num3 - 1, hall: false }); f2 = true;
      }
      if (!f3 && inW(x, num4 + 1, 0) && actAt(x, num4 + 1) === 0) {
        platData.push({ x, y: num4 + 1, hall: false }); f3 = true;
      }
      if (f2 && f3) break;
    }
    let f4 = false, f5 = false;
    for (let y = num3; y <= num4; y++) {
      if (!f4 && inW(num - 1, y, 0) && actAt(num - 1, y) === 0) {
        doorData.push({ x: num - 1, y, dir: -1, hall: false, skipOther: false, skipSpace: false, clear: true, fluff: 3 }); f4 = true;
      }
      if (!f5 && inW(num2 + 1, y, 0) && actAt(num2 + 1, y) === 0) {
        doorData.push({ x: num2 + 1, y, dir: 1, hall: false, skipOther: false, skipSpace: false, clear: true, fluff: 3 }); f5 = true;
      }
      if (f4 && f5) break;
    }
  }
  // LegacyDungeonHall.CalculatePlatformsAndDoors（:26-34；LegacyEntrance 覆写为空）
  function hallPlatformsDoors(hl: DHall): void {
    if (hl.isEntrance) return;
    if (Math.abs(hl.sdy) <= 0.1) doorData.push({ x: Math.trunc(hl.sx), y: Math.trunc(hl.sy), dir: 0, hall: true, skipOther: false, skipSpace: false, clear: true, fluff: 0 });
    else platData.push({ x: Math.trunc(hl.sx), y: Math.trunc(hl.sy), hall: true });
    if (Math.abs(hl.edy) <= 0.1) doorData.push({ x: Math.trunc(hl.ex), y: Math.trunc(hl.ey), dir: 0, hall: true, skipOther: false, skipSpace: false, clear: true, fluff: 0 });
    else platData.push({ x: Math.trunc(hl.ex), y: Math.trunc(hl.ey), hall: true });
  }
  // DungeonData.CanGenerateFeatureAt（:132-166）。feat: 0=常规 1=BiomeChests 2=Paintings/WallVariants
  function featOK(x: number, y: number, feat: number): boolean {
    if (!inW(x, y, 5)) return false;
    if (wallAt(x, y) === 350) return false;
    if (feat === 1 && entExists && entBounds.contains(x, y)) return false;
    if (feat !== 2) {
      for (const pb of pits) if (pb.contains(x, y)) return false;
    }
    return true;
  }
  const featAreaOK = (x: number, y: number, fluff: number): boolean => {
    for (let a = x - fluff; a <= x + fluff; a++) {
      for (let b = y - fluff; b <= y + fluff; b++) {
        if (!featOK(a, b, 0)) return false;
      }
    }
    return true;
  };
  // ============ Early（Default：仅 pit 陷阱循环，cs:662-700）+ DungeonPitTrap（:42-390）============
  function dgEarly(): void {
    const cnt = Math.trunc(w * 2.0);
    for (let n = 0; n < cnt; n++) {
      const x3 = ri(bounds.L, bounds.R - 1);
      let n44 = bounds.T;
      if (n44 < dungeonY + 25) n44 = dungeonY + 25;
      if (n44 < ws) n44 = Math.trunc(ws);
      const y2 = ri(n44, bounds.B - 1);
      const flooded = pitFlood || rn(8) === 0;
      const n45 = ri(6, 9);
      const wid = ri(8, 18), hgt = ri(19, 45), ew = ri(6, 9);
      if (dgPitTrap(x3, y2, wid, hgt, ew, n45, flooded)) {
        if (flooded) pitFlood = false;
        n += 1500;
      } else n++;
    }
  }
  function dgPitTrap(ix: number, jy: number, width: number, height: number, edgeW: number, topD: number, flooded: boolean): boolean {
    let num = jy, num2 = jy;
    if (width < 1 || height < 1) return false;
    const n6 = width + edgeW, n7 = height + topD;
    if (!inW(ix, num, Math.max(n6, n7))) return false;
    if (!isDW(wallAt(ix, num))) return false;
    if (actAt(ix, num) !== 0) return false;
    for (let k = num; k < h; k++) {
      if (k > h - 200) return false;
      if (actAt(ix, k) !== 0 && dgSolid(ix, k)) {
        if (typAt(ix, k) === SPIKE) return false;
        num = k; num2 = k;
        break;
      }
    }
    if (!isDW(wallAt(ix - width, num)) || !isDW(wallAt(ix + width, num))) return false;
    const n8 = 30;
    for (let n = num; n < num + n8; n++) {
      let ok = true;
      for (let x = ix - width; x <= ix + width; x++) {
        if (actAt(x, n) !== 0 && isDT(typAt(x, n))) { ok = false; break; }
      }
      if (ok) { num = n; break; }
    }
    if (num + n7 >= h - 200) return false;
    for (let x = ix - width; x <= ix + width; x++) {
      for (let y = num; y <= num + height; y++) {
        if (actAt(x, y) !== 0 && (isDT(typAt(x, y)) || typAt(x, y) === crack)) return false;
      }
    }
    for (let x = ix - width; x <= ix + width; x++) {
      for (let y = num2; y <= num + height; y++) {
        const ti = st.idx(x, y);
        if (st.flags[ti] !== 0 && isDT(st.type[ti])) {
          chTile(ti, crack, true);
          chWall(ti, wall, false);
        }
      }
    }
    for (let x = ix - n6; x <= ix + n6; x++) {
      for (let y = num2; y <= num + n7; y++) {
        const ti = st.idx(x, y);
        st.liquidType[ti] = 0; st.liquid[ti] = 0;
        if (isDW(st.wall[ti])) continue;
        if (x > ix - n6 && x < ix + n6 && y < num + n7) {
          const ow = st.wall[ti];
          chTile(ti, brick, true);
          if (!isDW(ow)) chWall(ti, wall, false);
        } else chTile(ti, brick, false);
      }
    }
    for (let x = ix - width; x <= ix + width; x++) {
      for (let y = num2; y <= num + height; y++) {
        const ti = st.idx(x, y);
        const f6 = st.type[ti] !== crack;
        if (!f6) continue;
        if (flooded) { st.liquidType[ti] = 0; st.liquid[ti] = 255; }
        else { st.liquidType[ti] = 0; st.liquid[ti] = 0; }
        const a = x === ix - width && actAt(x - 1, y) !== 0;
        const b = x === ix + width && actAt(x + 1, y) !== 0;
        const c = y === num + height && actAt(x, y + 1) !== 0;
        const d = x === ix - width + 1 && y % 2 === 0 && actAt(x - 1, y) !== 0;
        const e = x === ix + width - 1 && y % 2 === 0 && actAt(x + 1, y) !== 0;
        const f = y === num + height - 1 && x % 2 === 0 && actAt(x, y + 1) !== 0;
        if (a || b || c || d || e || f) chTile(ti, SPIKE, false);
        else st.flags[ti] = 0;
      }
    }
    const pb = new DBnd(w, h);
    pb.set(ix - n6, num2, ix + n6, num + n7);
    pits.push(pb);
    return true;
  }

  // ============ DungeonGlobalSpikes（:900-1105）============
  const canSupportSpike = (x: number, y: number): boolean => {
    if (actAt(x, y) === 0) return false;
    const t = typAt(x, y);
    const sheet = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
    if (DG_FRAMED_NOT_CUT.has(sheet)) return false;
    if (sheet === 481 || sheet === 482 || sheet === 483) return false;
    return true;
  };
  function spikeRun(round: number, cx: number, cy: number, wx: number, wy: number, d: number, n11: number, step: number): number {
    while (n11 > 0) {
      let cond: boolean;
      if (round === 0) {
        const nb = cx + step;
        cond = inW(nb, wy, 0) && actAt(nb, wy) !== 0 && canSupportSpike(nb, wy)
          && inW(cx, wy + d, 0) && actAt(cx, wy + d) !== 0
          && inW(cx, wy, 0) && actAt(cx, wy) !== 0
          && inW(cx, wy - d, 0) && actAt(cx, wy - d) === 0;
      } else {
        const nb = cy + step;
        cond = inW(wx, nb, 0) && actAt(wx, nb) !== 0 && canSupportSpike(wx, nb)
          && inW(wx + d, cy, 0) && actAt(wx + d, cy) !== 0
          && inW(wx, cy, 0) && actAt(wx, cy) !== 0
          && inW(wx - d, cy, 0) && actAt(wx - d, cy) === 0;
      }
      if (!cond) break;
      const fx = round === 0 ? cx : wx, fy = round === 0 ? wy : cy;
      if (!featOK(fx, fy, 0) || !featOK(fx, round === 0 ? wy - d : cy - d, 0)) {
        if (round === 0) cx += step; else cy += step;
        n11 = 0;
        continue;
      }
      st.type[st.idx(fx, fy)] = SPIKE;
      if (round === 0) {
        if (inW(cx - 1, wy - d, 0) && actAt(cx - 1, wy - d) === 0
          && inW(cx + 1, wy - d, 0) && actAt(cx + 1, wy - d) === 0) {
          let ti = st.idx(cx, wy - d);
          st.type[ti] = SPIKE; st.flags[ti] = 1;
          ti = st.idx(cx, wy - d * 2);
          st.type[ti] = SPIKE; st.flags[ti] = 1;
        }
        cx += step;
      } else {
        if (inW(wx - d, cy - 1, 0) && actAt(wx - d, cy - 1) === 0
          && inW(wx - d, cy + 1, 0) && actAt(wx - d, cy + 1) === 0) {
          let ti = st.idx(wx - d, cy);
          st.type[ti] = SPIKE; st.flags[ti] = 1;
          ti = st.idx(wx - d * 2, cy);
          st.type[ti] = SPIKE; st.flags[ti] = 1;
        }
        cy += step;
      }
      n11--;
    }
    return n11;
  }
  function dgSpikes(): void {
    const num = wallVariants[0];
    const num7 = Math.trunc(42 * (w / 4200) * Math.max(1, 0.25));
    for (let round = 0; round < 2; round++) {
      let n3 = 0;
      const n4 = 1000;
      let n5 = 0;
      while (n5 < num7) {
        n3++;
        const x = ri(bounds.L, bounds.R - 1);
        const y = ri(ws + 25, bounds.B - 1);
        if (wallAt(x, y) === num && actAt(x, y) === 0) {
          const d = rn(2) === 0 ? -1 : 1;
          let wx = x, wy = y;
          while (inW(wx, wy, 0) && actAt(wx, wy) === 0) {
            if (round === 0) wy += d; else wx += d;
          }
          const hit = inW(wx, wy, 0);
          let okA: boolean, okB: boolean, okC: boolean, okD2: boolean, okE: boolean;
          if (round === 0) {
            okA = hit && inW(wx - 1, wy, 0) && actAt(wx - 1, wy) !== 0;
            okB = hit && inW(wx + 1, wy, 0) && actAt(wx + 1, wy) !== 0;
            okC = hit && inW(wx - 1, wy, 0) && canSupportSpike(wx - 1, wy);
            okD2 = hit && inW(wx - 1, wy - d, 0) && actAt(wx - 1, wy - d) === 0;
            okE = hit && inW(wx + 1, wy - d, 0) && actAt(wx + 1, wy - d) === 0;
          } else {
            okA = hit && inW(wx, wy - 1, 0) && actAt(wx, wy - 1) !== 0;
            okB = hit && inW(wx, wy + 1, 0) && actAt(wx, wy + 1) !== 0;
            okC = hit && inW(wx, wy - 1, 0) && canSupportSpike(wx, wy - 1);
            okD2 = hit && inW(wx - d, wy - 1, 0) && actAt(wx - d, wy - 1) === 0;
            okE = hit && inW(wx - d, wy + 1, 0) && actAt(wx - d, wy + 1) === 0;
          }
          if (okA && okB && okC && okD2 && okE) {
            n5++;
            let n11 = ri(5, 12);
            const c1x = round === 0 ? wx - 1 : wx, c1y = round === 0 ? wy : wy - 1;
            spikeRun(round, c1x, c1y, wx, wy, d, n11, round === 0 ? -1 : -1);
            n11 = ri(5, 12);
            const c2x = round === 0 ? x + 1 : wx, c2y = round === 0 ? wy : wy + 1;
            spikeRun(round, c2x, c2y, wx, wy, d, n11, 1);
          }
        }
        if (n3 > n4) { n3 = 0; n5++; }
      }
    }
  }
  // ============ DungeonGlobalDoors（:24-294）============
  const canKill = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const ti = st.idx(x, y);
    if (st.flags[ti] === 0) return false;
    if (st.wall[ti] === 350) return false;
    const t = st.type[ti];
    if (t === DOOR) return false;                       // IsLockedDoor(style13)
    if (t === CHEST || t === CHEST2) return false;      // CanDestroyChest：生成期有物
    return true;
  };
  function dgDoorsF(): void {
    for (const d of doorData) {
      if (!inW(d.x, d.y, 30)) continue;
      const style = rn(3) === 0 ? doorStyle : 13;
      const num4 = d.fluff;
      const n5 = Math.max(25, Math.min(w - 25, d.x - num4));
      const n6 = Math.max(25, Math.min(w - 25, Math.max(n5, d.x + num4 - 1)));
      let n7 = 100, n8 = 0, n9 = 0, n10 = 0;
      for (let x = n5; x <= n6; x++) {
        let flag = true;
        let y = d.y;
        while (y > 10 && actAt(x, y) === 0) y--;
        if (!isDT(typAt(x, y))) flag = false;
        n9 = y;
        for (y = d.y; actAt(x, y) === 0; y++) { if (!st.inBounds(x, y + 1)) break; }
        if (!isDT(typAt(x, y))) flag = false;
        n10 = y;
        if (n10 - n9 < 3) continue;
        if (!d.skipOther) {
          outer1:
          for (let a = x - 20; a < x + 20; a++) {
            for (let b = n10 - 10; b < n10 + 10; b++) {
              if (inW(a, b, 0) && actAt(a, b) !== 0 && typAt(a, b) === DOOR) { flag = false; break outer1; }
            }
          }
        }
        if (flag && !d.skipSpace) {
          outer2:
          for (let m = n10 - 3; m < n10; m++) {
            for (let n = x - 3; n <= x + 3; n++) {
              if (inW(n, m, 0) && actAt(n, m) !== 0) { flag = false; break outer2; }
            }
          }
        }
        if (flag && n10 - n9 < 20) {
          let f2 = false;
          if (d.dir === 0 && n10 - n9 < n7) f2 = true;
          if (d.dir === -1 && x > n8) f2 = true;
          if (d.dir === 1 && (x < n8 || n8 === 0)) f2 = true;
          if (f2) { n8 = x; n7 = n10 - n9; }
        }
      }
      if (n7 >= 20) continue;
      let n16 = n8;
      let n17 = d.y, n18 = d.y;
      while (inW(n16, n17, 0) && actAt(n16, n17) === 0) n17++;
      while (n18 > 0 && actAt(n16, n18) === 0) n18--;
      n17--; n18++;
      for (let y = n18; y < n17 - 2; y++) {
        chTile(st.idx(n16, y), brick, false);
        for (const off of [-1, -2, 1, 2]) {
          if (inW(n16 + off, y, 0) && actAt(n16 + off, y) !== 0 && canKill(n16 + off, y)) {
            const k = st.idx(n16 + off, y);
            st.flags[k] = 0; st.wall[k] = wall;
          }
        }
      }
      dgPlaceDoor(n16, n17, style);
      n16--;
      let n20 = n17 - 3;
      while (n20 > 0 && actAt(n16, n20) === 0) n20--;
      let f3 = n17 - n20 < n17 - n18 + 5 && isDT(typAt(n16, n20));
      if (d.clear || f3) {
        for (let y = n17 - 4 - ri(0, 2); y > n20; y--) {
          if (f3) chTile(st.idx(n16, y), brick, false);
          for (const off of [-1, -2]) {
            if (d.clear || typAt(n16 + off, y) === brick) {
              const k = st.idx(n16 + off, y);
              st.flags[k] = 0; st.wall[k] = wall;
            }
          }
        }
      }
      n16 += 2;
      n20 = n17 - 3;
      while (n20 > 0 && actAt(n16, n20) === 0) n20--;
      f3 = n17 - n20 < n17 - n18 + 5 && isDT(typAt(n16, n20));
      if (d.clear || f3) {
        for (let y = n17 - 4 - ri(0, 2); y > n20; y--) {
          if (f3) chTile(st.idx(n16, y), brick, false);
          for (const off of [1, 2]) {
            if (d.clear || typAt(n16 + off, y) === brick) {
              const k = st.idx(n16 + off, y);
              st.flags[k] = 0; st.wall[k] = wall;
            }
          }
        }
      }
      n17++;
      n16--;
      for (let y = n17 - 8; y < n17; y++) {
        for (const off of [2, 3, -2, -3]) {
          if (d.clear || typAt(n16 + off, y) === brick) {
            const k = st.idx(n16 + off, y);
            st.flags[k] = 0; st.wall[k] = wall;
          }
        }
      }
      chTile(st.idx(n16 - 1, n17), brick, false);
      chTile(st.idx(n16 + 1, n17), brick, false);
    }
  }
  // PlaceTile(10)（WorldGen.cs:59868 门分支）+ PlaceDoor（:31938：成功 3×Next(3)）
  function dgPlaceDoor(x: number, y: number, style: number): void {
    if (!inW(x, y, 1)) return;
    const solidAt = (yy: number): boolean => {
      const d = TILE_DEFS[typAt(x, yy)];
      return actAt(x, yy) !== 0 && !!d?.solid;
    };
    if (actAt(x, y - 1) === 0 && actAt(x, y - 2) === 0 && actAt(x, y - 3) !== 0 && solidAt(y - 3)) {
      dgPlaceDoorAt(x, y - 1, style);
    } else if (actAt(x, y + 1) === 0 && actAt(x, y + 2) === 0 && actAt(x, y + 3) !== 0 && solidAt(y + 3)) {
      dgPlaceDoorAt(x, y + 1, style);
    }
  }
  function dgPlaceDoorAt(i2: number, j2: number, style: number): void {
    if (!inW(i2, j2 - 2, 0) || !inW(i2, j2 + 2, 0)) return;
    const above = TILE_DEFS[typAt(i2, j2 - 2)];
    if (!(actAt(i2, j2 - 2) !== 0 && above?.solid)) return;
    if (!dgSolid(i2, j2 + 2)) return;
    for (let k = -1; k <= 1; k++) {
      const ti = st.idx(i2, j2 + k);
      st.flags[ti] = 1; st.type[ti] = DOOR;
      rn(3);                                    // frameX = Next(3)*18
    }
  }
