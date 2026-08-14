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
import { TILE_BY_KEY, TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../../../data/tiles';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../../../data/items';
import { tileRunner } from './TileRunner';
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
// 家具 item → 原版 tile id（Item.cs createTile；sheet 空间）
// ★2026-08-13 id 空间碰撞修复：曾直存 sheet id 给 placeSimple 裸写 st.type——
// 落地钟 sheet104 命中内部 #104=活木（"地牢诡异装饰物"真身！）、蜡烛 33=猩红矿、
// 灯 93=氙苔、椅 15=铁砧、烛台 100=石板、书架 101=熔岩苔、床 79=中式灯笼、
// 工作台 18=开门图块…（陶罐案同款）。现统一换算成内部 id（placeSimple/place4x2/
// :2101 比较三消费点同源）。
const DG_ITEM_SHEET: Record<number, number> = {
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
const DG_ITEM_TILE: Record<number, number> = {};
for (const k of Object.keys(DG_ITEM_SHEET)) {
  DG_ITEM_TILE[Number(k)] = TILE_INTERNAL_BY_SHEET.get(DG_ITEM_SHEET[+k]) ?? -1;
}

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
  const platformStyle = theme === 0 ? 6 : theme === 1 ? 8 : 7; // Item 1384-1386 placeStyle(蓝6/绿8/粉7)
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

  // GetHighestProtectionTypeFromPoint（DungeonUtils.cs:1704-1724）。
  // ★2026-08-13 逐源核实：Legacy 管线（LegacyDungeonLayoutProvider）只调 GenerateRoom/
  //   GenerateHall、从不调 CalculateRoom/CalculateHall → LegacyDungeonRoom.calculated 恒 false
  //   且 _outerShapeData/_innerShapeData 恒空（LegacyDungeonRoom.cs:252-259 仅 !generating 时
  //   填充）→ GetProtectionTypeFromPoint（:56-67）走 `!_outerShapeData.Contains(...)` 恒返
  //   ProtectionType.None。即原版 Legacy 地牢对走廊/挖空 **无任何房间保护**（TilesAndWalls
  //   分支在 Legacy 房型上不可达——覆写至多返 Walls）。本仓 prot() 返 Walls（外框内）是
  //   "同值重刷跳过"级近似：下游三循环仅用它跳过 chWall(chWall 写的就是同一 wall 值)，
  //   与原版 None 的最终方块态零差；保持现状不改（按审计要求补内框保护反而会偏离原版）。
  function prot(x: number, y: number, list: DRoom[]): number {
    let p = 0;
    for (const rm of list) {
      const q: number = rm.outer.contains(x, y) ? 2 : 0;
      if (q === 1) p = p === 2 ? 3 : 1;
      else if (q === 2) p = p === 1 ? 3 : 2;
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
    // ★LegacyDungeonLayoutProvider.cs:37/:42——起始房之前先耗两颗 settings.RandomSeed
    //  (hall-settings 与 room-settings 对象的种子;本仓 settings 复用单流,掷而不用。
    //  曾缺失→起始房种子前移 2 颗,全地牢分叉;oracle 对账时揪出)
    raw(); raw();
    dgRoom({ seed: raw(), x: posX, y: posY, start: true, generated: true, inner: new DBnd(w, h), outer: new DBnd(w, h), ex: 0, ey: 0, strength: 0 });
    let roomDelay = 5;
    let s = steps;
    while (s > 0) {
      bounds.upd(posX, posY);
      s--;
      if (roomDelay > 0) roomDelay--;
      // ★LegacyDungeonLayoutProvider.cs:61 `(roomDelay == 0) & (Next(3) == 0)` 是
      //  非短路 &——roomDelay>0 时也**照耗**一颗 Next(3)(曾 && 短路少耗;oracle
      //  同款偏差已在 caves-oracle.cs 同步修正)。TS 禁 bool &,先掷后判语义等价。
      //  入口循环(DungeonCrawler.cs:426)才是 && 短路,勿混
      const roomRoll = rn(3);
      if (roomDelay === 0 && roomRoll === 0) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function dgRoom(s: any): void {
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
    // ★D2 残留偏差（2026-08-13 复核）：原版该 else-if 链只写 zero=(num2,0)/zero=(0,num2)
    //   （LegacyDungeonHall.cs:524-673，zero2 不重算），下游 startDirection/lastDungeonHall/
    //   走廊截停判定全部取 zero（正向）。本仓 sd=-z2 约定下水平四支必须写 z2x=-num2；
    //   旧代码写 z2x=num2 使 sdX 反号→"贴边强制反向"走廊被 sdX>0&&px>w-100 当帧截停成
    //   1 步残段，且 lastDungeonHall 存反号破坏下条走廊防回头（:501 比对）。
    if (!s.forceX) {
      if (px > w - 200) {
        num2 = -1; z2x = -num2; z2y = 0; vx = num2; vy = 0;
        if (hrn(3) === 0) vy = hrn(2) === 0 ? -0.20000000298023224 : 0.20000000298023224;
      } else if (px < 200.0) {
        num2 = 1; z2x = -num2; z2y = 0; vx = num2; vy = 0;
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
        num2 = -1; z2y = 0; z2x = -num2; vy = 0; vx = num2;
        if (hrn(3) === 0) vy = hrn(2) === 0 ? -0.20000000298023224 : 0.20000000298023224;
      } else if (f15) {
        num2 = 1; z2y = 0; z2x = -num2; vy = 0; vx = num2;
        if (hrn(3) === 0) vy = hrn(2) === 0 ? -0.20000000298023224 : 0.20000000298023224;
      }
    }
    const sdX = -z2x, sdY = -z2y;
    lastHallX = sdX; lastHallY = sdY;
    if (Math.abs(vx) > Math.abs(vy) && hrn(3) !== 0) {
      // ★原版是**逐运算 float32** 算术(LegacyDungeonHall.cs:680 `(float)num4 *
      //  (((float)Next(110,150))*0.01f)`)——C# 每个 float*float 各自舍入到 float,
      //  非"double 乘完再舍一次"。曾单层 fround 致 trunc 边界偶发翻 1(轨迹对账
      //  H#30 num 6↔7 实锤);现逐二元运算 fround 复刻(oracle :4551 同款)
      nnum = Math.trunc(Math.fround(Math.fround(num4) * Math.fround(Math.fround(hri(110, 149)) * Math.fround(0.01))));
    }
    const hb = new DBnd(w, h);
    hb.set(Math.trunc(px), Math.trunc(py), Math.trunc(px), Math.trunc(py));
    const hall: DHall = { seed: s.seed, generated: true, forceX: s.forceX, isEntrance: false, bounds: hb, sx: sx, sy: sy, ex: 0, ey: 0, sdx: sdX, sdy: sdY, edx: sdX, edy: sdY };
    halls.push(hall);
    const roomsArea = roomsInSpots(px, py, px + vx * num3, py + vy * num3, Math.trunc(num3 / 2 + nnum));
    // 对账插桩(dormant):globalThis.__dgHallTrace 存在时逐步记录,与 caves-oracle.cs 的
    // DG_TRACE 输出逐行 diff(dungeonL 微差定位用,零开销常驻)
    const TRACE = (globalThis as { __dgHallTrace?: Array<Record<string, number>> }).__dgHallTrace;
    const hIdx = TRACE ? TRACE.length : -1;
    if (TRACE) TRACE.push({ h: 1, idx: hIdx, seed: s.seed, sx, sy, num2, vx, vy, num: nnum, steps: num3, zig: flag2 ? 1 : 0, sdX, sdY });
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
      if (TRACE) TRACE.push({ s: 1, idx: hIdx, cnt, px: +px.toFixed(3), py: +py.toFixed(3), num: nnum, n21, x0, x1, y0, y1, left: num3 });
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
      // 入口门零掷骰：LegacyDungeonEntrance.cs:616 硬编码 PlaceTile(...,10,...,13)。
      // 勿在此掷 rn(3)——1/3 主题门掷骰属 dungeonD 门特征段（DungeonGlobalDoors.cs:47-50，见下方 doorData 落放处）。
      dgPlaceDoor(Math.trunc(cx), Math.trunc(cy) + 1, 13);
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
          const oy = y;                                   // num13：原始采样点（第二段起点基准）
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
            // ★D8（2026-08-13 复核）：首段起点 = 命中格本身。原版 num8/num12 在命中判定后
            //   不预偏移（DungeonGlobalSpikes.cs:66-72/:163-170），while 条件查"步进方向下一格"
            //   支撑、放置"当前格"（:73-96/:170-193）→ 首刺落在命中格，再向两侧延伸。旧代码
            //   先 -1 使整段尖刺列（含 2-3 层带）整体错位一格、丢命中格尖刺。
            const c1x = wx, c1y = wy;
            spikeRun(round, c1x, c1y, wx, wy, d, n11, -1);
            n11 = ri(5, 12);
            const c2x = round === 0 ? x + 1 : wx, c2y = round === 0 ? wy : oy + 1;
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
    // PlaceDoor 1:1(:31938-31958):style→帧映射 frameX=54*(style/36)、
    // frameY=54*(style%36);三格 frameY 递增 18,每格独立 frameX=base+Next(3)*18。
    // ★此前 style 参数被完全忽略(帧不写)= 全部退化木门(style 0)——
    // 用户报告"地牢门是木门"根因(2026-08-13)
    const fx0 = 54 * Math.floor(style / 36);
    const fy0 = 54 * (style % 36);
    for (let k = -1; k <= 1; k++) {
      const ti = st.idx(i2, j2 + k);
      st.flags[ti] = 1; st.type[ti] = DOOR;
      st.frameX[ti] = fx0 + rn(3) * 18;
      st.frameY[ti] = fy0 + (k + 1) * 18;
    }
  }

  // ============ DungeonGlobalWallVariants（:1149-1252）============
  function dgWallVariants(): void {
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 3; j++) {
        const n2 = ri(40, 239);
        const n3 = ri(bounds.L, bounds.R - 1);
        const n4 = ri(bounds.T, bounds.B - 1);
        for (let x = n3 - n2; x < n3 + n2; x++) {
          for (let y = n4 - n2; y < n4 + n2; y++) {
            if (y <= ws || !inW(x, y, 2)) continue;
            const dx = Math.abs(n3 - x), dy = Math.abs(n4 - y);
            if (Math.sqrt(dx * dx + dy * dy) >= n2 * 0.4) continue;
            if (isDW(wallAt(x, y))) dgSpreadWall(x, y, wallVariants[j]);
          }
        }
      }
    }
  }
  function dgSpreadWall(x: number, y: number, wallType: number): void {
    if (!inW(x, y, 0)) return;
    let list2: Array<[number, number]> = [[x, y]];
    const seen = new Set<string>();
    const key = (a: number, b: number): string => a + ',' + b;
    while (list2.length > 0) {
      const list = list2;
      list2 = [];
      while (list.length > 0) {
        const p = list.shift()!;
        if (!inW(p[0], p[1], 1)) continue;
        seen.add(key(p[0], p[1]));
        const ti = st.idx(p[0], p[1]);
        if (st.wall[ti] === 0 || st.wall[ti] === wallType || st.wall[ti] === 244 || st.wall[ti] === 62
          || !featOK(p[0], p[1], 2)) continue;
        if (entExists && entBounds.contains(p[0], p[1])) {
          if (st.wall[ti] !== wall) continue;
        } else if (st.wall[ti] !== wall) continue;
        if (!dgSolid(p[0], p[1])) {
          st.wall[ti] = wallType;
          for (const q of [[p[0] - 1, p[1]], [p[0] + 1, p[1]], [p[0], p[1] - 1], [p[0], p[1] + 1]] as Array<[number, number]>) {
            if (!seen.has(key(q[0], q[1]))) list2.push(q);
          }
        } else if (st.flags[ti] !== 0) st.wall[ti] = wallType;
      }
    }
  }
  // ============ DungeonGlobalPlatforms（:24-214）============
  function dgPlatforms(): void {
    for (const d of platData) {
      if (!inW(d.x, d.y, 30)) continue;
      const x = d.x, y = d.y;
      let row = -1;
      const n3 = 5;
      let n4 = y < ws + 50.0 ? 20 : 10;
      n4 = Math.trunc(n4 * 1.0);
      for (let j = y - n3; j <= y + n3; j++) {
        let n6 = x, n7 = x;
        let bad = false;
        if (actAt(x, j) !== 0) bad = true;
        else {
          while (inW(n6, j, 0) && actAt(n6, j) === 0) {
            n6--;
            if (!inW(n6, j, 0)) break;
            if (actAt(n6, j) !== 0 && !isDT(typAt(n6, j))) { bad = true; break; }
            if (n6 <= 10) break;
          }
          while (inW(n7, j, 0) && actAt(n7, j) === 0) {
            n7++;
            if (!inW(n7, j, 0)) break;
            if (actAt(n7, j) !== 0 && !isDT(typAt(n7, j))) { bad = true; break; }
            if (n7 >= w - 10) break;
          }
        }
        if (bad || n7 - n6 > n4) continue;
        let ok = true;
        const a0 = Math.max(0, x - Math.trunc(n4 / 2) - 2), a1 = Math.min(w - 1, x + Math.trunc(n4 / 2) + 2);
        const b0 = j - n3, b1 = j + n3;
        outer3:
        for (let a = a0; a <= a1; a++) {
          for (let b = b0; b <= b1; b++) {
            if (inW(a, b, 0) && actAt(a, b) !== 0 && typAt(a, b) === PLATFORM) { ok = false; break outer3; }
          }
        }
        if (ok) {
          for (let b = j + 3; b >= j - 5; b--) {
            if (inW(x, b, 0) && actAt(x, b) !== 0) { ok = false; break; }
          }
        }
        if (ok) { row = j; break; }
      }
      if (row <= y - n3 - 5 || row >= y + n3 + 5) continue;
      let px = x;
      const py = row;
      let qx = x + 1;
      while (inW(px, py, 0) && actAt(px, py) === 0) {
        chTile(st.idx(px, py), PLATFORM, false);
        st.frameY[st.idx(px, py)] = 18 * platformStyle; // DungeonGlobalPlatforms:158
        px--;
        if (px <= 10) break;
      }
      while (inW(qx, py, 0) && actAt(qx, py) === 0) {
        chTile(st.idx(qx, py), PLATFORM, false);
        st.frameY[st.idx(qx, py)] = 18 * platformStyle;
        qx++;
        if (qx >= w - 10) break;
      }
      // 书架平台（PlaceBooksChance 等）Default 无 → IsAShelf=false
    }
  }
  // ============ 宝箱：BiomeChests/BasicChests + AddBuriedChest（战利品掷骰流对齐）============
  function prefixRolls(item: number): void {
    const cls = DG_PRE_CLASS[item];
    if (!cls) return;
    if (rn(4) !== 0) {
      const arr = DG_PRE[cls];
      const rolled = arr[rn(arr.length)];
      if (DG_PRE_REDUCED.has(rolled)) rn(3);
    }
  }
  function dgAddBuriedChest(ix: number, jy: number, mainItem: number, style: number, chestTile: number): boolean {
    for (let k = jy; k < h - 10; k++) {
      if (actAt(ix, k) !== 0 && typAt(ix, k) === TILE_BY_KEY['v_231_larva']) return false;
      let boulder = false;
      for (let a = ix - 2; a <= ix + 2 && !boulder; a++) {
        for (let b = k - 2; b <= k + 2; b++) {
          if (!inW(a, b, 100)) continue;
          const sheet = TILE_DEFS[typAt(a, b)]?.vanilla?.sheet ?? -1;
          if (actAt(a, b) !== 0 && (sheet === 138 || sheet === 484 || sheet === 664 || sheet === 665
            || (sheet >= 711 && sheet <= 716) || typAt(a, b) === TILE_BY_KEY['v_26_altars'] || typAt(a, b) === TILE_BY_KEY['v_237_lihzahrd_altar'])) {
            boulder = true; break;
          }
        }
      }
      if (boulder) return false;
      if (!dgSolid(ix, k)) continue;
      const num7 = k;
      const num9 = style, num10 = mainItem;
      let flag9 = false, flag10 = false;
      if (chestTile === TILE_BY_KEY['chest'] && num9 !== 0 && num7 >= ws && isDW(wallAt(ix, num7))) flag9 = true;
      if ((chestTile === TILE_BY_KEY['chest'] && num9 >= 23 && num9 <= 27) || (chestTile === CHEST2 && num9 === 13)) {
        flag9 = true; flag10 = true;
      }
      // PlaceChest（:57828）：±2 无滚石 + 2×2 净空（Origin=(0,1)：首实心行上一格起）
      const px = ix - 1, py = num7 - 1;
      if (!inW(px, py - 1, 0) || !inW(px + 1, py, 0)) continue;
      const sheetB = TILE_DEFS[typAt(px, k)]?.vanilla?.sheet ?? -1;
      const sheetB2 = TILE_DEFS[typAt(px + 1, k)]?.vanilla?.sheet ?? -1;
      if (sheetB === 138 || sheetB2 === 138) continue;
      let free = true;
      for (let a = 0; a < 2 && free; a++) {
        for (let b = -1; b <= 0; b++) {
          if (actAt(px + a, py + b) !== 0) { free = false; break; }
        }
      }
      if (!free) continue;
      for (let a = 0; a < 2; a++) {
        for (let b = -1; b <= 0; b++) {
          const ti = st.idx(px + a, py + b);
          chTile(ti, chestTile, false);
          // PlaceChestDirect 帧式（:57864-57903）：顶行 fy=0 / 底行 fy=18；
          // 列 fx=36*style / 18+36*style。★此前不写帧=残留旧帧,宝箱单格贴图错乱
          st.frameX[ti] = 36 * style + a * 18;
          st.frameY[ti] = b === -1 ? 0 : 18;
        }
      }
      dgChestLoot(num7, num10, flag9, flag10);
      chests.push({ x: px, y: py - 1, locked: flag10, items: dgLootItems(num10) });
      return true;
    }
    return false;
  }
  // 战利品掷骰流（AddBuriedChest 深三分支 + 尾段；与 oracle DgAddBuriedChest 同构）
  function dgChestLoot(num7: number, num10: number, flag9: boolean, flag10: boolean): void {
    dgLoot.length = 0;
    if (num10 > 0) dgLoot.push(num10);
    const surf = num7 < ws + 25 && false;
    const gold = num7 < rock;
    if (surf) {
      if (num10 > 0) prefixRolls(num10);
      else rn(10);
      if (rn(6) === 0) rn(1);                        // 282 荧光棒（弃值掷）
      if (rn(6) === 0) rn(1);                        // 279 飞刀
      if (rn(6) === 0) { if (rn(5) === 0) rn(2); if (rn(10) === 0) rn(3); }
      if (rn(6) === 0) { if (rn(5) === 0) rn(2); if (rn(10) === 0) rn(3); }
      if (rn(3) === 0) rn(6);
      if (rn(2) === 0) { rn(2); rn(8); }
      if (rn(2) === 0) rn(51);
      if (rn(3) !== 0) { rn(2); rn(26); }
      if (rn(2) === 0) rn(3);
      if (rn(3) !== 0) rn(6);
      if (rn(3) > 0) { rn(6); rn(3); }
      if (rn(2) === 0) { rn(2); rn(11); }
      if (rn(2) === 0) rn(30);
      if (rn(2) === 0) rn(100);
    } else if (gold) {
      if (num10 > 0) {
        prefixRolls(num10);
        if (flag9 && !flag10) {
          if (!shadowKey || rn(3) === 0) shadowKey = true;
          if (!ramRune || rn(8) === 0) { ramRune = true; prefixRolls(5465); dgLoot.push(5465); }
        }
      } else {
        rn(6);
        if (rn(20) === 0) { /* 997 类 */ }
        else if (rn(20) === 0) rn(26);
      }
      if (rn(3) === 0) rn(20);
      if (rn(5) === 0) { /* 52 */ }
      if (rn(3) === 0) rn(51);
      if (rn(2) === 0) { rn(2); rn(10); }
      if (rn(2) === 0) { rn(2); rn(25); }
      if (rn(2) === 0) rn(3);
      if (rn(3) > 0) { rn(9); rn(3); }
      if (rn(3) !== 0) rn(5);
      if (rn(2) === 0) rn(11);
      if (rn(2) === 0) rn(40);
    } else if (num7 < h - 250) {
      if (num10 > 0) {
        prefixRolls(num10);
        // flag2（冰）/flag3（沙）地牢箱恒 false → 两段掷骰不触发（cs:36846-36858）
        if (flag9 && !flag10) {
          if (!shadowKey || rn(3) === 0) { shadowKey = true; dgLoot.push(329); }
          if (!ramRune || rn(8) === 0) { ramRune = true; prefixRolls(5465); dgLoot.push(5465); }
        }
      } else {
        rn(7);
        if (rn(20) === 0 && num7 > gs.lavaLine) { /* 906 */ }
        else if (rn(15) === 0) { /* 997 */ }
        else if (false) rn(26);
      }
      if (rn(5) === 0) { /* 43 */ }
      if (rn(3) === 0) { /* 167 */ }
      if (rn(4) === 0) rn(26);
      if (rn(2) === 0) { rn(2); rn(8); }
      if (rn(2) === 0) { rn(2); rn(26); }
      if (rn(2) === 0) rn(3);
      if (rn(3) > 0) { rn(6); rn(3); }
      if (rn(3) > 1) { rn(6); rn(3); }
      if (rn(2) === 0) rn(3);
      if (rn(2) === 0) { rn(2); rn(16); }
      if (rn(2) === 0) rn(3);
    } else {
      if (num10 > 0) prefixRolls(num10);
      else rn(4);
      if (rn(3) === 0) { /* 167 */ }
      if (rn(2) === 0) { rn(2); rn(15); }
      if (rn(2) === 0) { rn(2); rn(25); }
      if (rn(2) === 0) rn(6);
      if (rn(3) > 0) { rn(8); rn(3); }
      if (rn(3) > 1) { rn(8); rn(3); }
      rn(3); rn(2);
      if (rn(2) === 0) { rn(2); rn(15); }
      if (rn(2) === 0) rn(3);
    }
    // 尾段（cs:37361-37560）
    if (flag9 && !flag10) { if (rn(8) === 0) { /* 2192 */ } }
    if (flag10) { if (rn(2) === 0) { /* 5234 */ } }
    rn(12);
  }
  const dgLoot: number[] = [];
  const dgLootItems = (mainVid: number): Array<{ id: number; stack: number } | null> => {
    const out: Array<{ id: number; stack: number } | null> = [];
    for (const vid of dgLoot) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      const id = key !== undefined ? ITEM_BY_KEY[key] : undefined;
      if (id !== undefined) out.push({ id, stack: 1 });
    }
    void mainVid;
    return out;
  };
  function dgBiomeChests(): void {
    for (let i = 0; i < 5; i++) {
      let flag = false;
      let n3 = 1000;
      while (!flag) {
        n3--;
        if (n3 <= 0) break;
        const x = ri(bounds.L, bounds.R - 1);
        const y = ri(Math.trunc(ws), bounds.B - 1);
        if ((entExists && entBounds.contains(x, y)) || !isDW(wallAt(x, y)) || actAt(x, y) !== 0) continue;
        let chestTile = CHEST, mainItem = 0, chestStyle = 0;
        switch (i) {
          case 0: chestStyle = 23; mainItem = 1156; break;
          case 1:
            if (!gs.crimson) { chestStyle = 24; mainItem = 1571; } else { chestStyle = 25; mainItem = 1569; }
            break;
          case 2: chestStyle = 26; mainItem = 1260; break;
          case 3: chestStyle = 27; mainItem = 1572; break;
          case 4: chestTile = CHEST2; chestStyle = 13; mainItem = 4607; break;
        }
        flag = dgAddBuriedChest(x, y, mainItem, chestStyle, chestTile);
      }
    }
  }
  function dgBasicChests(): void {
    for (const rm of rooms) {
      const half = Math.trunc(rm.strength * 0.4);
      for (let j = 0; j < 1000; j++) {
        const lo = rm.ex - half, hi = rm.ex + half;
        const num = Math.trunc(lo + (hi - lo) * rd());
        const num2 = Math.trunc((rm.ey - half) + ((rm.ey + half) - (rm.ey - half)) * rd());
        if (!featAreaOK(num, num2, 1)) continue;
        let itemType = 0, chestStyle = 2;
        if (lootStyle >= 8) lootStyle = 0;
        switch (lootStyle) {
          case 0: itemType = 155; break;
          case 1: itemType = 156; break;
          case 2: itemType = 157; break;
          case 3: itemType = 163; break;
          case 4: itemType = 113; break;
          case 5: itemType = 3317; break;
          case 6: itemType = 327; chestStyle = 0; break;
          default: itemType = 164; break;
        }
        if (num2 < ws + 50) { itemType = 327; chestStyle = 0; }
        if (dgAddBuriedChest(num, num2, itemType, chestStyle, CHEST)) { lootStyle++; break; }
      }
    }
  }

  // ============ DungeonGlobalBookshelves（:23-208）============
  function dgBookshelves(): void {
    let ncount = 0, num3 = 0;
    while (num3 < Math.trunc(w / 20)) {
      ncount++;
      let x = ri(bounds.L, bounds.R - 1);
      let y = ri(bounds.T, bounds.B - 1);
      let flag = true;
      if (isDW(wallAt(x, y)) && actAt(x, y) === 0) {
        const n7 = rn(2) === 0 ? -1 : 1;
        while (flag && inW(x, y, 0) && actAt(x, y) === 0) {
          x -= n7;
          if (x < 5 || x > w - 5) flag = false;
          else if (actAt(x, y) !== 0 && !isDT(typAt(x, y))) flag = false;
        }
        if (flag && inW(x, y, 0) && actAt(x, y) !== 0 && isDT(typAt(x, y))
          && actAt(x, y - 1) !== 0 && isDT(typAt(x, y - 1))
          && actAt(x, y + 1) !== 0 && isDT(typAt(x, y + 1))) {
          x += n7;
          outer4:
          for (let a = x - 3; a <= x + 3; a++) {
            for (let b = y - 3; b <= y + 3; b++) {
              if (inW(a, b, 0) && actAt(a, b) !== 0 && typAt(a, b) === PLATFORM) { flag = false; break outer4; }
            }
          }
          if (flag && inW(x, y - 1, 0) && actAt(x, y - 1) === 0
            && inW(x, y - 2, 0) && actAt(x, y - 2) === 0
            && inW(x, y - 3, 0) && actAt(x, y - 3) === 0) {
            if (!featOK(x, y, 0)) { flag = false; continue; }
            let k = x;
            const num8 = x;
            while (k > bounds.L && k < bounds.R && actAt(k, y) === 0 && actAt(k, y - 1) === 0 && actAt(k, y + 1) === 0) k += n7;
            k = Math.abs(x - k);
            const flag3 = rn(2) === 0;
            if (k > 5) {
              let n10 = ri(1, 3);
              while (n10 > 0) {
                chTile(st.idx(x, y), PLATFORM, false);
                st.frameY[st.idx(x, y)] = 18 * platformStyle; // frameY=18*tileStyle(DungeonGlobalPlatforms:158)
                if (flag3) {
                  placeSimple(x, y - 1, BOOKS);
                  if (rn(50) === 0 && y > (ws + rock) / 2.0) { /* waterbolt 帧 */ }
                }
                x += n7;
                n10--;
              }
              ncount = 0; num3++;
              if (!flag3 && rn(2) === 0) {
                x = num8; y--;
                const n12v = rn(4) === 0 ? 49 : 13;
                // v_13_placed_bottles（sheet 13）——曾误写 'v_13_bottles'（不存在的键）：
                // undefined 被 Uint16Array 吞成 type 0，且下行 frameX 掷骰恒不触发（流欠耗）。
                placeSimple(x, y, n12v === 49 ? WATER_CANDLE : TILE_BY_KEY['v_13_placed_bottles']!);
                if (inW(x, y, 0) && typAt(x, y) === TILE_BY_KEY['v_13_placed_bottles']) rn(2);
              }
            }
          }
        }
      }
      if (ncount > 1000) { ncount = 0; num3++; }
    }
  }
  // PlaceTile 近似：目标格净空 + 有墙/侧邻/底邻锚 → 单格放置（帧不入哈希）
  function placeSimple(x: number, y: number, tile: number): boolean {
    if (!st.inBounds(x, y) || tile < 0) return false;
    const ti = st.idx(x, y);
    if (st.flags[ti] !== 0) return false;
    const solidNb = (xx: number, yy: number): boolean => {
      if (!st.inBounds(xx, yy) || st.flags[st.idx(xx, yy)] === 0) return false;
      const d = TILE_DEFS[st.type[st.idx(xx, yy)]];
      return !!d?.solid && !DG_SOLID_TOP.has(d.vanilla?.sheet ?? -1);
    };
    const anchor = st.wall[ti] > 0 || solidNb(x - 1, y) || solidNb(x + 1, y) || solidNb(x, y + 1);
    if (!anchor) return false;
    st.flags[ti] = 1; st.type[ti] = tile;
    return true;
  }
  // ============ DungeonGlobalLights（:24-141）+ Lights_GenerateSwitch（:144-193）============
  function dgLights(): void {
    const num5 = Math.trunc(28 * (w / 4200) * 1.0);
    let ncount = 0, num4 = 0;
    while (num4 < num5) {
      ncount++;
      const x = ri(bounds.L, bounds.R - 1);
      const y = ri(bounds.T, bounds.B - 1);
      if (isDW(wallAt(x, y))) {
        for (let cy = y; cy > bounds.T; cy--) {
          if (!(inW(x, cy - 1, 0) && actAt(x, cy - 1) !== 0 && isDT(typAt(x, cy - 1))
            && featOK(x, cy, 0)
            && ((entExists && entBounds.contains(x, cy)) || isDW(wallAt(x, cy))))) continue;
          let near = false;
          outer5:
          for (let a = x - 15; a < x + 15; a++) {
            for (let b = cy - 15; b < cy + 15; b++) {
              if (inW(a, b, 0) && actAt(a, b) !== 0 && (typAt(a, b) === LANTERN || typAt(a, b) === CHANDELIER)) {
                near = true; break outer5;
              }
            }
          }
          if ((inW(x - 1, cy, 0) && actAt(x - 1, cy) !== 0)
            || (inW(x + 1, cy, 0) && actAt(x + 1, cy) !== 0)
            || (inW(x - 1, cy + 1, 0) && actAt(x - 1, cy + 1) !== 0)
            || (inW(x + 1, cy + 1, 0) && actAt(x + 1, cy + 1) !== 0)
            || (inW(x, cy + 2, 0) && actAt(x, cy + 2) !== 0)) near = true;
          if (near) break;
          let placed = false;
          if (rn(7) === 0) {
            let blocked = false;
            for (let k = 0; k < 15; k++) {
              if (inW(x, cy + k, 0) && dgSolid(x, cy + k)) { blocked = true; break; }
            }
            if (!blocked && placeChand(x, cy)) {
              placed = true; ncount = 0; num4++;
              dgSwitch(x, cy);
            }
          }
          if (placed) break;
          // 灯笼（Place1x2Top :46694：上方实心且下方净空 → 42 两格）
          const aboveSheet = TILE_DEFS[typAt(x, cy - 1)]?.vanilla?.sheet ?? -1;
          const aboveSolid = TILE_DEFS[typAt(x, cy - 1)]?.solid ?? false;
          if (inW(x, cy - 1, 0) && actAt(x, cy - 1) !== 0 && aboveSolid && !DG_SOLID_TOP.has(aboveSheet)
            && inW(x, cy + 1, 0) && actAt(x, cy + 1) === 0) {
            // 灯笼样式按墙变体三档（Lights :109-118）：wall==variants[1]/[2] 换档,余用 [0]
            const wl = wallAt(x, cy);
            const lStyle = wl === wallVariants[1] ? lantern[1] : wl === wallVariants[2] ? lantern[2] : lantern[0];
            chTile(st.idx(x, cy), LANTERN, false);
            chTile(st.idx(x, cy + 1), LANTERN, false);
            // Place1x2Top 帧式（:46711-46717）：frameY=style*36（下格 +18）、frameX=0（亮档；
            // 灭档 frameX=18 由 dgSwitch 2/3 掷写）。★此前不写帧=残留砖帧,样式全丢
            st.frameY[st.idx(x, cy)] = lStyle * 36;
            st.frameY[st.idx(x, cy + 1)] = lStyle * 36 + 18;
            st.frameX[st.idx(x, cy)] = 0;
            st.frameX[st.idx(x, cy + 1)] = 0;
            placed = true; ncount = 0; num4++;
            dgSwitch(x, cy);
          }
          break;                                              // 灯笼尝试后必 break（:131）
        }
      }
      if (ncount > 1000) { num4++; ncount = 0; }
    }
  }
  function placeChand(x: number, y: number): boolean {
    for (let a = x - 1; a < x + 2; a++) {
      for (let b = y; b < y + 3; b++) {
        if (!inW(a, b, 0) || actAt(a, b) !== 0) return false;
      }
    }
    const sheet = TILE_DEFS[typAt(x, y - 1)]?.vanilla?.sheet ?? -1;
    if (!(inW(x, y - 1, 0) && actAt(x, y - 1) !== 0 && TILE_DEFS[typAt(x, y - 1)]?.solid && !DG_SOLID_TOP.has(sheet))) return false;
    // PlaceChand 帧式（:52753-52824）：样式=蓝/绿/粉地牢吊灯 placeStyle 27/28/29
    //（Item.cs:25748-25757 `27 + type - 2652`，chandelierItemType 2652+theme）。
    // 页列 num2=108*(style/36)（27-29 无分页=0）、行基 num3=style*54（分页修正同式）；
    // 三列 fx=num2+{0,18,36}、三行 fy=num3+{0,18,36}。★此前不写帧=残留砖帧
    const style = 27 + theme;
    const n2 = Math.floor(style / 36) * 108;
    let n3 = style * 54;
    if (n2 >= 108) n3 -= 54 * Math.floor(n2 / 108) * 37;
    for (let a = x - 1; a < x + 2; a++) {
      for (let b = y; b < y + 3; b++) {
        const ti = st.idx(a, b);
        chTile(ti, CHANDELIER, false);
        st.frameX[ti] = n2 + (a - (x - 1)) * 18;
        st.frameY[ti] = n3 + (b - y) * 18;
      }
    }
    return true;
  }
  function dgSwitch(x: number, y: number): void {
    for (let i = 0; i < 1000; i++) {
      const a = x + ri(-12, 12);
      const b = y + ri(3, 20);
      if (!inW(a, b, 0) || !inW(a, b + 1, 0)) continue;
      if (actAt(a, b) !== 0 || actAt(a, b + 1) !== 0) continue;
      if (!inW(a - 1, b, 0) || !isDT(typAt(a - 1, b))) continue;
      if (!inW(a + 1, b, 0) || !isDT(typAt(a + 1, b))) continue;
      if (!canHitLocal(a, b, x, y)) continue;
      const anchor = (dgSolid(a - 1, b) && typAt(a - 1, b) !== DOOR)
        || (dgSolid(a + 1, b) && typAt(a + 1, b) !== DOOR) || dgSolid(a, b + 1);
      if (anchor && isDW(wallAt(a, b)) && (isDT(typAt(a - 1, b)) || isDT(typAt(a + 1, b)))) {
        if (actAt(a, b) === 0) { st.flags[st.idx(a, b)] = 1; st.type[st.idx(a, b)] = DSWITCH; }
      }
      if (actAt(a, b) === 0) continue;
      // L 形红线逐格铺（Lights_GenerateSwitch :173-185）：横一步铺线、纵一步铺线，
      // 三连 wire 写直到灯位（含开关格、不含灯格）——原版 Main.tile.wire(true)=红线。
      // ★此前只放开关不铺线：开关无信号源=死件（用户报告"灯和开关配套但没连线"）
      let wa = a, wb = b;
      while (wa !== x || wb !== y) {
        if (inW(wa, wb, 0)) st.wire[st.idx(wa, wb)] |= TileStore.WIRE_RED;
        if (wa > x) wa--;
        if (wa < x) wa++;
        if (inW(wa, wb, 0)) st.wire[st.idx(wa, wb)] |= TileStore.WIRE_RED;
        if (wb > y) wb--;
        if (wb < y) wb++;
        if (inW(wa, wb, 0)) st.wire[st.idx(wa, wb)] |= TileStore.WIRE_RED;
      }
      // 2/3 灯初始灭档（:186-190）：frameX=18 绝对写——灯笼 1×2 全格=亮灭档在 X；
      // 吊灯中心列本就 num2+18=18（27-29 无分页）→ 原版同款无操作,照抄不"修"
      if (rn(3) > 0) {
        st.frameX[st.idx(x, y)] = 18;
        st.frameX[st.idx(x, y + 1)] = 18;
      }
      break;
    }
  }
  // Collision.CanHit（Collision.cs:388-460）——两点视线（实心非 solidTop 成对拦截）
  function canHitLocal(x1: number, y1: number, x2: number, y2: number): boolean {
    let cx = Math.max(1, Math.min(w - 1, x1)), cy = Math.max(1, Math.min(h - 41, y1));
    const tx = Math.max(1, Math.min(w - 1, x2)), ty = Math.max(1, Math.min(h - 41, y2));
    const blk = (x: number, y: number): boolean => {
      if (!inW(x, y, 0) || actAt(x, y) === 0) return false;
      const d = TILE_DEFS[typAt(x, y)];
      return !!d?.solid && !DG_SOLID_TOP.has(d.vanilla?.sheet ?? -1);
    };
    for (;;) {
      const dx = Math.abs(cx - tx), dy = Math.abs(cy - ty);
      if (cx === tx && cy === ty) return true;
      if (dx > dy) {
        cx += cx >= tx ? -1 : 1;
        if (!inW(cx, cy - 1, 0) || !inW(cx, cy + 1, 0)) return false;
        if (blk(cx, cy - 1) && blk(cx, cy + 1)) return false;
      } else {
        cy += cy >= ty ? -1 : 1;
        if (!inW(cx - 1, cy, 0) || !inW(cx + 1, cy, 0)) return false;
        if (blk(cx - 1, cy) && blk(cx + 1, cy)) return false;
      }
    }
  }

  // ============ DungeonGlobalTraps（:23-152，Default：placeTrap(x,y,0) 飞镖）============
  function dgTraps(): void {
    const num5 = Math.trunc(8.4 * (w / 4200) * 1.0);
    let ncount = 0, num4 = 0;
    while (num4 < num5) {
      ncount++;
      const x = ri(bounds.L, bounds.R - 1);
      const y = ri(Math.trunc(ws), bounds.B - 1);
      if (isDW(wallAt(x, y)) && placeTrap0(x, y)) ncount = 1000;
      if (ncount > 1000) { num4++; ncount = 0; }
    }
  }
  // placeTrap type=0（WorldGen.cs:8875-9150 飞镖分支）
  function placeTrap0(x2: number, y2: number): boolean {
    let num = y2;
    while (!dgSolid(x2, num)) {
      num++;
      if (num > h - 10) return false;
    }
    num--;
    if (!inW(x2, num, 3)) return false;
    for (let a = x2 - 20; a <= x2 + 20; a++) {
      for (let b = num - 20; b <= num + 20; b++) {
        if (inW(a, b, 0) && actAt(a, b) !== 0 && typAt(a, b) === TILE_BY_KEY['v_70_mushroom_grass_block']) return false;
      }
    }
    if (wallAt(x2, num) === 87 || wallAt(x2, num) === 350) return false;
    const lava = st.liquid[st.idx(x2, num)] > 0 && st.liquidType[st.idx(x2, num)] === 2;
    if (lava) return false;
    const offs: Array<[number, number]> = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, -2], [-1, -2], [1, -2]];
    for (const [ax, ay] of offs) {
      if (inW(x2 + ax, num + ay, 0) && actAt(x2 + ax, num + ay) !== 0) return false;
    }
    if (inW(x2, num + 1, 0) && (typAt(x2, num + 1) === SPIKE || typAt(x2, num + 1) === TILE_BY_KEY['v_232_wooden_spike'])) return false;
    if (!inW(x2, num + 1, 0) || !dgSolid(x2, num + 1)) return false;   // CanGeneratePressurePlateAt
    {
      const bt = typAt(x2, num + 1);
      const sheet = TILE_DEFS[bt]?.vanilla?.sheet ?? -1;
      if (sheet === 138 || sheet === 484 || sheet === 664 || sheet === 665 || (sheet >= 711 && sheet <= 716)) return false;
      if (wallAt(x2, num + 1) === 350) return false;
    }
    const num27 = num - ri(0, 2);
    const anchorOK = (xx: number, yy: number): boolean =>
      dgSolid(xx, yy) || (inW(xx, yy, 0) && actAt(xx, yy) !== 0 && (typAt(xx, yy) === TILE_BY_KEY['v_481_cracked_blue_brick']
        || typAt(xx, yy) === TILE_BY_KEY['v_482_cracked_green_brick'] || typAt(xx, yy) === TILE_BY_KEY['v_483_cracked_pink_brick']));
    let num28 = x2;
    while (!anchorOK(num28, num27)) {
      num28--;
      if (num28 < 0) return false;
    }
    let num29 = x2;
    while (!anchorOK(num29, num27)) {
      num29++;
      if (num29 > w) return false;
    }
    const n30 = x2 - num28, n31 = num29 - x2;
    let f5 = n30 > 5 && n30 < 50, f6 = n31 > 5 && n31 < 50;
    if (f5 && !dgSolid(num28, num27 + 1)) f5 = false;
    if (f6 && !dgSolid(num29, num27 + 1)) f6 = false;
    const badAnchor = (xx: number, yy: number): boolean => typAt(xx, yy) === DOOR || typAt(xx, yy) === SPIKE;
    if (f5 && ((inW(num28, num27, 0) && actAt(num28, num27) !== 0 && badAnchor(num28, num27))
      || (inW(num28, num27 + 1, 0) && actAt(num28, num27 + 1) !== 0 && badAnchor(num28, num27 + 1)))) f5 = false;
    if (f6 && ((inW(num29, num27, 0) && actAt(num29, num27) !== 0 && badAnchor(num29, num27))
      || (inW(num29, num27 + 1, 0) && actAt(num29, num27 + 1) !== 0 && badAnchor(num29, num27 + 1)))) f6 = false;
    let num26: number;
    if (f5 && f6) {
      num26 = num28;
      if (rn(2) === 0) num26 = num29;
    } else if (f6) num26 = num29;
    else {
      if (!f5) return false;
      num26 = num28;
    }
    if (typAt(num26, num27) === TILE_BY_KEY['v_190_glowing_mushroom_block']) return false;
    if (wallAt(num26, num27) === 350) return false;
    chTile(st.idx(x2, num), TILE_BY_KEY['v_135_pressure_plates'], false);
    st.flags[st.idx(num26, num27)] = 0;                         // KillTile（生成期 noItem）
    chTile(st.idx(num26, num27), TILE_BY_KEY['v_137_traps'], false);
    return true;
  }
  // ============ DungeonGlobalGroundFurniture（Default，:187-253 + :255-861）============
  function dgFurniture(): void {
    const num2 = Math.trunc(2000 * (w / 4200) * 1.0);
    let alch = 1 + Math.trunc(w / 4200), bew = 1 + Math.trunc(w / 4200);
    let num3 = 2000;
    for (let j = 0; j < num2; j++) {
      if (alch > 0 || bew > 0) {
        j--;
        num3--;
        if (num3 <= 0) break;
      }
      let x = ri(bounds.L, bounds.R - 1);
      let y = ri(Math.max(bounds.T, Math.trunc(ws) + 10), bounds.B - 1);
      let n5 = 1000;
      while (!isDW(wallAt(x, y)) || actAt(x, y) !== 0) {
        n5--;
        if (n5 <= 0) break;
        x = ri(bounds.L, bounds.R - 1);
        y = ri(Math.max(bounds.T, Math.trunc(ws) + 10), bounds.B - 1);
      }
      if (isDW(wallAt(x, y)) && actAt(x, y) === 0) {
        while (!dgSolid(x, y) && y < h - 200) y++;
        y--;
        dgFurnAt(x, y, alch, bew, j < num2 / 2);
        const res = dgFurnResult as string;
        if (res === 'alch') alch--;
        else if (res === 'bew') bew--;
      }
    }
  }
  let dgFurnResult: '' | 'alch' | 'bew' | 'ok' = '';
  function dgFurnAt(i: number, j: number, alch: number, bew: number, stricter: boolean): void {
    dgFurnResult = '';
    let num = i, k = i;
    while (inW(num, j, 0) && actAt(num, j) === 0 && dgSolid(num, j + 1)) num--;
    num++;
    while (inW(k, j, 0) && actAt(k, j) === 0 && dgSolid(k, j + 1)) k++;
    k--;
    const num2 = k - num, num3 = Math.trunc((k + num) / 2);
    if (!featOK(num3, j, 0)) return;
    if (inW(num3, j, 0) && actAt(num3, j) === 0 && isDW(wallAt(num3, j)) && dgSolid(num3, j + 1) && typAt(num3, j + 1) !== SPIKE) {
      const base = theme === 0
        ? [1396, 1397, 1398, 1405, 1408, 1414, 1470, 2376, 2386, 2402, 2658, 2664, 2645, 3900]
        : theme === 1
          ? [1399, 1400, 1401, 1406, 1409, 1415, 1471, 2377, 2387, 2403, 2659, 2665, 2646, 3901]
          : [1402, 1403, 1404, 1407, 1410, 1416, 1472, 2378, 2388, 2404, 2660, 2666, 2647, 3902];
      let iChair = base[0], iTable = base[1], iWork = base[2], iCandle = base[3], iVase = base[4];
      let iBook = base[5], iBed = base[6], iPiano = base[7], iDress = base[8], iSofa = base[9];
      let iTub = base[10], iCand = base[11], iLamp = base[12], iClock = base[13];
      const wv = wallAt(num3, j);
      if (wv >= 94 && wv <= 105) {
        iChair = 1509; iTable = 1510; iWork = 1511; iCandle = 5743; iVase = -1; iBook = 1512; iBed = 5740;
        iPiano = 5750; iDress = 5741; iSofa = 5753; iTub = 5739; iCand = 5742; iLamp = 5748; iClock = 5746;
      }
      let num18 = rn(13);
      if ((num18 === 10 || num18 === 11 || num18 === 12) && rn(4) !== 0) num18 = rn(13);
      while ((num18 === 2 && iVase === -1) || (num18 === 5 && iBed === -1) || (num18 === 6 && iPiano === -1)
        || (num18 === 7 && iDress === -1) || (num18 === 8 && iSofa === -1) || (num18 === 9 && iTub === -1)
        || (num18 === 10 && iCand === -1) || (num18 === 11 && iLamp === -1) || (num18 === 12 && iClock === -1)) {
        num18 = rn(13);
      }
      const num19 = [5, 4, 3, 4, 3, 5, 5, 5, 5, 5, 2, 3, 2][num18];
      const num20 = [4, 3, 5, 6, 3, 3, 4, 4, 4, 3, 4, 3, 5][num18];
      let flag3 = false, flag4 = false;
      const num21 = (alch > 0 || bew > 0) ? 15 : 0;
      outer6:
      for (let a = num3 - num19 - num21; a <= num3 + num19 + num21; a++) {
        for (let b = j - num20 - num21; b <= j + num21; b++) {
          if (!inW(a, b, 0)) continue;
          if (a >= num3 - num19 && a <= num3 + num19 && b >= j - num20 && b <= j) {
            if (!featOK(a, b, 0)) { flag3 = true; break outer6; }
            if (actAt(a, b) !== 0) { num18 = -1; break outer6; }
          }
          if (stricter && (alch > 0 || bew > 0) && actAt(a, b) !== 0 && (typAt(a, b) === ALCHEMY || typAt(a, b) === BEWITCH)) flag4 = true;
        }
      }
      if (flag3) return;
      if (num2 < num19 * 1.75) num18 = -1;
      if (!flag4 && (alch > 0 || bew > 0)) {
        if (alch > 0) {
          if (placeSimple(num3, j, ALCHEMY)) { dgFurnResult = 'alch'; return; }
        } else if (placeSimple(num3, j, BEWITCH)) { dgFurnResult = 'bew'; return; }
      } else if (num18 === 0) {
        if (placeSimple(num3, j, DG_ITEM_TILE[iTable])) {
          if (iChair > -1) {
            if (inW(num3 - 2, j, 0) && actAt(num3 - 2, j) === 0) placeSimple(num3 - 2, j, DG_ITEM_TILE[iChair]);
            if (inW(num3 + 2, j, 0) && actAt(num3 + 2, j) === 0) placeSimple(num3 + 2, j, DG_ITEM_TILE[iChair]);
          }
          for (let n = num3 - 1; n <= num3 + 1; n++) {
            if (rn(2) !== 0 || !inW(n, j - 2, 0) || actAt(n, j - 2) !== 0) continue;
            const n23 = rn(5);
            if (iCandle > -1 && n23 <= 1) placeSimple(n, j - 2, DG_ITEM_TILE[iCandle]);
            else if (n23 === 2) placeSimple(n, j - 2, WATER_CANDLE);
            else if (n23 === 3) placeSimple(n, j - 2, BOOKS);
            else if (n23 === 4) placeSimple(n, j - 2, TILE_BY_KEY['v_103_bowls']);
          }
          dgFurnResult = 'ok';
          return;
        }
      } else if (num18 === 1) {
        if (placeSimple(num3, j, DG_ITEM_TILE[iWork])) {
          if (iChair > -1) {
            if (rn(2) === 0) {
              if (inW(num3 - 1, j, 0) && actAt(num3 - 1, j) === 0) placeSimple(num3 - 1, j, DG_ITEM_TILE[iChair]);
            } else if (inW(num3 + 2, j, 0) && actAt(num3 + 2, j) === 0) placeSimple(num3 + 2, j, DG_ITEM_TILE[iChair]);
          }
          for (let n = num3; n <= num3 + 1; n++) {
            if (rn(2) !== 0 || !inW(n, j - 1, 0) || actAt(n, j - 1) !== 0) continue;
            const n26 = rn(5);
            if (iCandle > -1 && n26 <= 1) placeSimple(n, j - 1, DG_ITEM_TILE[iCandle]);
            else if (n26 === 2) placeSimple(n, j - 1, WATER_CANDLE);
            else if (n26 === 3) placeSimple(n, j - 1, BOOKS);
            else if (n26 === 4) placeSimple(n, j - 1, TILE_BY_KEY['v_103_bowls']);
          }
          dgFurnResult = 'ok';
          return;
        }
      } else if (num18 === 2) {
        if (iVase > -1 && placeSimple(num3, j, DG_ITEM_TILE[iVase])) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 3) {
        if (iBook > -1) placeSimple(num3, j, DG_ITEM_TILE[iBook]);
      } else if (num18 === 4) {
        if (iChair > -1) {
          placeSimple(num3, j, DG_ITEM_TILE[iChair]);
          if (inW(num3, j, 0) && actAt(num3, j) !== 0 && st.type[st.idx(num3, j)] === DG_ITEM_TILE[iChair]) {
            dgFurnResult = 'ok'; return;
          }
        }
      } else if (num18 === 5) {
        if (iBed > -1 && place4x2(num3, j, DG_ITEM_TILE[iBed])) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 6) {
        if (iPiano > -1 && placeSimple(num3, j, DG_ITEM_TILE[iPiano])) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 7) {
        if (iDress > -1 && placeSimple(num3, j, DG_ITEM_TILE[iDress])) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 8) {
        if (iSofa > -1 && placeSimple(num3, j, DG_ITEM_TILE[iSofa])) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 9) {
        if (iTub > -1 && place4x2(num3, j, DG_ITEM_TILE[iTub])) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 10) {
        if (iLamp > -1 && placeSimple(num3, j, DG_ITEM_TILE[iLamp])) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 11) {
        if (iCand > -1 && placeSimple(num3, j, DG_ITEM_TILE[iCand])) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 12) {
        if (iClock > -1 && placeSimple(num3, j, DG_ITEM_TILE[iClock])) { dgFurnResult = 'ok'; return; }
      }
    }
  }
  const dgTileOfSheet = (sheet: number): number => TILE_INTERNAL_BY_SHEET.get(sheet) ?? -1;  // （DG_ITEM_TILE 已源头换算后无内部消费者,留作家具重构期过渡）
  // Place4x2（WorldGen.cs:50534）：4×2 净空 + 下方实心
  function place4x2(x: number, y: number, type: number): boolean {
    if (type === undefined || type < 0 || x < 5 || x > w - 5 || y < 5 || y > h - 5) return false;
    const solid2 = (xx: number, yy: number): boolean => {
      if (!inW(xx, yy, 0) || actAt(xx, yy) === 0) return false;
      return !!TILE_DEFS[typAt(xx, yy)]?.solid;
    };
    for (let a = x - 1; a < x + 3; a++) {
      for (let b = y - 1; b < y + 1; b++) {
        if (!inW(a, b, 0) || actAt(a, b) !== 0) return false;
      }
      if (!solid2(a, y + 1)) return false;
    }
    for (let a = x - 1; a < x + 3; a++) {
      for (let b = y - 1; b < y + 1; b++) chTile(st.idx(a, b), type, false);  // DG_ITEM_TILE 已是内部 id（2026-08-13 碰撞修复）
    }
    return true;
  }

  // ============ DungeonGlobalPaintings（:28-321）============
  function dgPaintings(): void {
    // lihzahrdPaintingsMax（DungeonGlobalPaintings.cs:36-42）：Large(4200) → case 2 →
    // 2 + Next(2)。默认地牢无风格表/wall87 → 计数器永不消费，但此掷骰必须耗流。
    rn(2);
    const num2v = wallVariants[0];
    const num4 = Math.trunc(100 * (w / 4200) * Math.max(1, 0.75));
    let num5 = num4 * 3;
    for (let i = 0; i < num4; i++) {
      num5--;
      if (num5 <= 0) break;
      let x = ri(bounds.L, bounds.R - 1);
      let y = ri(Math.trunc(ws), bounds.B - 1);
      let n8 = 1000;
      while (!isDW(wallAt(x, y)) || actAt(x, y) !== 0) {
        n8--;
        if (n8 <= 0) break;
        x = ri(bounds.L, bounds.R - 1);
        y = ri(Math.trunc(ws), bounds.B - 1);
      }
      for (let t = 0; t < 2; t++) {
        let n9 = x, n10 = x;
        while (n9 > 20 && actAt(n9, y) === 0 && isDW(wallAt(n9, y))) n9--;
        n9++;
        while (n10 < w - 20 && actAt(n10, y) === 0 && isDW(wallAt(n10, y))) n10++;
        n10--;
        x = Math.trunc((n9 + n10) / 2);
        let n11 = y, n12 = y;
        while (n11 > 20 && actAt(n11, x) === 0 && isDW(wallAt(x, n11))) n11--;
        n11++;
        while (n12 < h - 20 && actAt(n12, x) === 0 && isDW(wallAt(x, n12))) n12++;
        n12--;
        y = Math.trunc((n11 + n12) / 2);
      }
      let n9 = x, n10 = x;
      while (n9 > 20 && actAt(n9, y) === 0 && actAt(n9, y - 1) === 0 && actAt(n9, y + 1) === 0) n9--;
      n9++;
      while (n10 < w - 20 && actAt(n10, y) === 0 && actAt(n10, y - 1) === 0 && actAt(n10, y + 1) === 0) n10++;
      n10--;
      let n11 = y, n12 = y;
      while (n11 > 20 && actAt(n11, x) === 0 && actAt(n11, x - 1) === 0 && actAt(n11, x + 1) === 0) n11--;
      n11++;
      while (n12 < h - 20 && actAt(n12, x) === 0 && actAt(n12, x - 1) === 0 && actAt(n12, x + 1) === 0) n12++;
      n12--;
      x = Math.trunc((n9 + n10) / 2);
      y = Math.trunc((n11 + n12) / 2);
      const n13 = n10 - n9, n14 = n12 - n11;
      if (n13 <= 7 || n14 <= 5) continue;
      const arr = [true, false, false];
      if (n13 > n14 * 3 && n13 > 21) arr[1] = true;
      if (n14 > n13 * 3 && n14 > 21) arr[2] = true;
      let n15 = rn(3);
      if (wallAt(x, y) === num2v) n15 = 0;
      while (!arr[n15]) n15 = rn(3);
      if (nearPicture2(st, x, y, wall)) n15 = -1;
      // ★D10（2026-08-14）：Paintings 段对齐原版调用序——GetPaintingEntry 的选型掷骰在
      // 门槛判定**之前**消耗（cs:167-168/:183-184/:281-283/:296-298），即使最终不放画也耗；
      // CanGenerateFeatureInArea 的 fluff=3（cs:169/186/281/297 等，7×7 区）非 2。
      if (n15 === 0) {
        const e = paintingEntry(x, y);
        if (featArea3(x, y, 3) && !nearPicture(st, x, y)) placeSimple(x, y, e);
      } else if (n15 === 1) {
        let e = paintingEntry(x, y);
        if (!featArea3(x, y, 3)) continue;
        if (actAt(x, y) === 0) placeSimple(x, y, e);
        if (actAt(x, y) !== 0) continue;
        const baseY = y;
        for (let m = 0; m < 2; m++) {
          x += 7;
          let a1 = baseY, a2 = baseY;
          while (a1 > 0 && actAt(x, a1) === 0 && actAt(x - 1, a1) === 0 && actAt(x + 1, a1) === 0) a1--;
          a1++;
          while (a2 < h - 1 && actAt(x, a2) === 0 && actAt(x - 1, a2) === 0 && actAt(x + 1, a2) === 0) a2++;
          a2--;
          const ny = Math.trunc((a1 + a2) / 2);
          if (featArea3(x, ny, 3)) {
            e = paintingEntry(x, ny);
            if (Math.abs(baseY - ny) >= 4 || nearPicture(st, x, ny)) break;
            placeSimple(x, ny, e);
          }
        }
        for (let m = 0; m < 2; m++) {
          x -= 7;
          let a1 = baseY, a2 = baseY;
          while (a1 > 0 && actAt(x, a1) === 0 && actAt(x - 1, a1) === 0 && actAt(x + 1, a1) === 0) a1--;
          a1++;
          while (a2 < h - 1 && actAt(x, a2) === 0 && actAt(x - 1, a2) === 0 && actAt(x + 1, a2) === 0) a2++;
          a2--;
          const ny = Math.trunc((a1 + a2) / 2);
          if (featArea3(x, ny, 3)) {
            e = paintingEntry(x, ny);
            if (Math.abs(baseY - ny) >= 4 || nearPicture(st, x, ny)) break;
            placeSimple(x, ny, e);
          }
        }
      } else if (n15 === 2) {
        let e = paintingEntry(x, y);
        if (!featArea3(x, y, 3)) continue;
        if (actAt(x, y) === 0) placeSimple(x, y, e);
        if (actAt(x, y) !== 0) continue;
        const baseX = x;
        for (let m = 0; m < 3; m++) {
          y += 7;
          let a1 = baseX, a2 = baseX;
          while (a1 > 0 && actAt(y, a1) === 0 && actAt(y - 1, a1) === 0 && actAt(y + 1, a1) === 0) a1--;
          a1++;
          while (a2 < w - 1 && actAt(y, a2) === 0 && actAt(y - 1, a2) === 0 && actAt(y + 1, a2) === 0) a2++;
          a2--;
          const nx = Math.trunc((a1 + a2) / 2);
          if (featArea3(nx, y, 3)) {
            e = paintingEntry(nx, y);
            if (Math.abs(baseX - nx) >= 4 || nearPicture(st, nx, y)) break;
            placeSimple(nx, y, e);
          }
        }
        for (let m = 0; m < 3; m++) {
          y -= 7;
          let a1 = baseX, a2 = baseX;
          while (a1 > 0 && actAt(y, a1) === 0 && actAt(y - 1, a1) === 0 && actAt(y + 1, a1) === 0) a1--;
          a1++;
          while (a2 < w - 1 && actAt(y, a2) === 0 && actAt(y - 1, a2) === 0 && actAt(y + 1, a2) === 0) a2++;
          a2--;
          const nx = Math.trunc((a1 + a2) / 2);
          if (featArea3(nx, y, 3)) {
            e = paintingEntry(nx, y);
            if (Math.abs(baseX - nx) >= 4 || nearPicture(st, nx, y)) break;
            placeSimple(nx, y, e);
          }
        }
      }
    }
  }
  const featArea3 = (x: number, y: number, fluff: number): boolean => {
    for (let a = x - fluff; a <= x + fluff; a++) {
      for (let b = y - fluff; b <= y + fluff; b++) {
        if (!featOK(a, b, 2)) return false;
      }
    }
    return true;
  };
  /** Paintings_GetPaintingEntry（DungeonGlobalPaintings.cs:327-360）：只取 tile 型
   * （style 走帧不入哈希，placeSimple 不落帧）——但选型掷骰必须照原版序全部消耗。 */
  function paintingEntry(x: number, y: number): number {
    let tile = HANGING;
    if (wallAt(x, y) === wall) {
      // RandomDungeonPainting（:364-385）：Next(3)≤1→240 Next(7)(==6 重掷)style{12,13,14,15,18,19,23}；
      // 否则 242 Next(17) style(14→15/15→16/16→30)
      const n = rn(3);
      if (n <= 1) {
        let n2 = rn(7);
        if (n2 === 6) n2 = rn(7);
      } else {
        tile = PAINTING;
        rn(17);
      }
    } else {
      // RandomBonePainting（:387-410）：Next(2)→0:240 style Next(2)(16/17)；1:241 style Next(9)
      const n = rn(2);
      if (n === 0) { tile = HANGING; rn(2); }
      else { tile = CATACOMB; rn(9); }
    }
    return tile;
  }
  // ============ DungeonGlobalBanners（:24-104）============
  function dgBanners(): void {
    const num3 = Math.trunc(200 * (w / 4200) * Math.max(1, 0.75));
    for (let i = 0; i < num3; i++) {
      let x = ri(bounds.L, bounds.R - 1);
      let y = ri(bounds.T, bounds.B - 1);
      let n6 = 1000;
      while (!isDW(wallAt(x, y)) || actAt(x, y) !== 0) {
        n6--;
        if (n6 <= 0) break;
        x = ri(bounds.L, bounds.R - 1);
        y = ri(bounds.T, bounds.B - 1);
      }
      n6 = 1000;
      while (!dgSolid(x, y) && y > 10) {
        n6--;
        if (n6 <= 0) break;
        y--;
      }
      y++;
      if (!featOK(x, y, 0) || !isDW(wallAt(x, y))
        || typAt(x, y - 1) === SPIKE
        || actAt(x, y) !== 0
        || actAt(x, y + 1) !== 0
        || actAt(x, y + 2) !== 0
        || actAt(x, y + 3) !== 0) continue;
      let near = false;
      for (let a = x - 1; a <= x + 1; a++) {
        for (let b = y; b <= y + 3; b++) {
          if (inW(a, b, 0) && actAt(a, b) !== 0
            && (typAt(a, b) === DOOR || typAt(a, b) === TILE_BY_KEY['door_open'] || typAt(a, b) === TILE_BY_KEY['banner'])) near = true;
        }
      }
      if (near) continue;
      let num8 = 0;
      if (wallAt(x, y) === wallVariants[1]) num8 = 1;
      if (wallAt(x, y) === wallVariants[2]) num8 = 2;
      num8 = num8 * 2 + rn(2);
      placeSimple(x, y, TILE_BY_KEY['banner']);
    }
  }
  posX = x0; posY = y0;
  bounds.set(x0, y0, x0, y0);
  const isDW = (v: number): boolean => v > 0 && DG_DUNGEON_WALLS.has(v);   // 墙 id 即原版 id
  const isDT = (t: number): boolean => {
    const sh = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
    return sh > 0 && DG_DUNGEON_TILES.has(sh);
  };
  const inW = (x: number, y: number, fluff: number): boolean =>
    x >= fluff && x < w - fluff && y >= fluff && y < h - fluff;
  const wallAt = (x: number, y: number): number => (st.inBounds(x, y) ? st.wall[st.idx(x, y)] : 0);
  const actAt = (x: number, y: number): number => (st.inBounds(x, y) ? st.flags[st.idx(x, y)] : 0);
  const typAt = (x: number, y: number): number => (st.inBounds(x, y) ? st.type[st.idx(x, y)] : 0);
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
}
export function placeFurn(st: TileStore, cx: number, anchorY: number, tile: number, style: number, anchor: 'bottom' | 'top' = 'bottom', flip = 1, support = true, styleRowH?: number, styleColW?: number): boolean {
  const def = TILE_DEFS[tile];
  if (!def) return false;
  const fw = def.vanilla?.fw ?? def.w ?? 1;
  const fh = def.vanilla?.fh ?? def.h ?? 1;
  const x0 = cx - Math.floor(fw / 2);
  const yTop = anchor === 'bottom' ? anchorY - fh + 1 : anchorY;
  for (let dx = 0; dx < fw; dx++) {
    for (let dy = 0; dy < fh; dy++) {
      if (!st.inBounds(x0 + dx, yTop + dy) || st.flags[st.idx(x0 + dx, yTop + dy)]) return false;
    }
  }
  if (anchor === 'bottom' && support) {
    for (let dx = 0; dx < fw; dx++) {
      if (!st.inBounds(x0 + dx, yTop + fh) || !st.flags[st.idx(x0 + dx, yTop + fh)]
        || !TILE_DEFS[st.type[st.idx(x0 + dx, yTop + fh)]]?.solid) return false;
    }
  }
  const sheet = TILE_DEFS[tile]?.vanilla?.sheet ?? -1;
  // 权威布局表(FurnitureStyle.ts,TileObjectData+贴图实测):表内 sheet 直接用,
  // 表外尊重调用参数(竖排 styleRowH / 横排列步 styleColW),最终回退通用横排。
  // 15/139/187 曾漏登记→椅子全落通用横排回退而实为竖排(神庙木椅 2026-08-12),
  // 已补全与 FurnitureStyle.ts 覆盖面同步
  const inTable = [42, 33, 49, 34, 100, 93, 91, 240, 241, 242, 245, 246, 15, 139, 187, 79, 90].includes(sheet);
  let bx: number, by: number;
  if (inTable) [bx, by] = furnitureStyleBase(sheet, style, fw);
  else if (styleRowH !== undefined) { bx = 0; by = style * styleRowH; }
  else { bx = style * (styleColW ?? fw * 18); by = 0; }
  for (let dx = 0; dx < fw; dx++) {
    for (let dy = 0; dy < fh; dy++) {
      const fx = flip < 0 ? fw - 1 - dx : dx;
      st.setTileSilent(x0 + dx, yTop + dy, tile, bx + fx * 18, by + dy * 18);
    }
  }
  return true;
}

/** 家具水平镜像(帧 X 翻转:桌椅等 1-3 宽物件整体 +18*fw) */
export function flipFurn(st: TileStore, cx: number, floorY: number, tile: number): void {
  const def = TILE_DEFS[tile];
  if (!def) return;
  const fw = def.vanilla?.fw ?? def.w ?? 1;
  const fh = def.vanilla?.fh ?? def.h ?? 1;
  const x0 = cx - Math.floor(fw / 2);
  const yTop = floorY - fh + 1;
  for (let dx = 0; dx < fw; dx++) {
    for (let dy = 0; dy < fh; dy++) {
      if (!st.inBounds(x0 + dx, yTop + dy)) continue;
      const i = st.idx(x0 + dx, yTop + dy);
      if (st.type[i] === tile) st.frameX[i] += fw * 18;
    }
  }
}

/** 墙饰(画/骨/挂毯):顶行=topY,锚点左上;须净空 */
function placeWallArt(st: TileStore, x: number, y: number, tile: number, style: number): void {
  const def = TILE_DEFS[tile];
  if (!def) return;
  const fw = def.vanilla?.fw ?? def.w ?? 1;
  const fh = def.vanilla?.fh ?? def.h ?? 1;
  const sheet = def.vanilla?.sheet ?? -1;
  const x0 = x - Math.floor(fw / 2);
  for (let dx = 0; dx < fw; dx++) {
    for (let dy = 0; dy < fh; dy++) {
      if (!st.inBounds(x0 + dx, y + dy) || st.flags[st.idx(x0 + dx, y + dy)]) return;
    }
  }
  // 样式基偏移(TileObjectData + Tiles_N.png 尺寸实测):
  //  240(1944×162):横排 36 列×54,wrap36 → 超 36 换下行 54
  //  241(4×3):竖排行 54(wrap0 单列)
  //  242(324×1944):竖排 27 行×72,wrap27 → 超 27 换右列 108
  let bx: number, by: number;
  if (sheet === 240) { bx = (style % 36) * 54; by = Math.floor(style / 36) * 54; }
  else if (sheet === 241) { bx = 0; by = style * 54; }
  else if (sheet === 242) { bx = Math.floor(style / 27) * 108; by = (style % 27) * 72; }
  else { bx = style * fw * 18; by = 0; }
  for (let dx = 0; dx < fw; dx++) {
    for (let dy = 0; dy < fh; dy++) {
      st.setTileSilent(x0 + dx, y + dy, tile, bx + dx * 18, by + dy * 18);
    }
  }
}

/** nearPicture(cs L17966):±4×±3 有任意实心 */
function nearPicture(st: TileStore, x: number, y: number): boolean {
  for (let dx = -4; dx <= 3; dx++) {
    for (let dy = -3; dy <= 2; dy++) {
      if (st.inBounds(x + dx, y + dy) && st.flags[st.idx(x + dx, y + dy)]) return true;
    }
  }
  return false;
}

/** nearPicture2(cs L17979):±15/±10(主墙)或 ±8/±5(变体墙)内已有墙饰 */
function nearPicture2(st: TileStore, x: number, y: number, mainWall: number): boolean {
  const wall = st.inBounds(x, y) ? st.wall[st.idx(x, y)] : 0;
  const rx = wall === mainWall ? 15 : 8;
  const ry = wall === mainWall ? 10 : 5;
  for (let dx = -rx; dx <= rx; dx++) {
    for (let dy = -ry; dy <= ry; dy++) {
      if (!st.inBounds(x + dx, y + dy) || !st.flags[st.idx(x + dx, y + dy)]) continue;
      const t = st.type[st.idx(x + dx, y + dy)];
      if (t === HANGING || t === CATACOMB || t === PAINTING) return true;
    }
  }
  return false;
}

/**
 * 灯具→墙上开关 + 红线布线(cs L18942-18975/18990-19023):
 * 在灯具 ±12/+3..20 内找两侧皆砖的嵌墙位放开关(136),沿曼哈顿路径铺红线。
 * chandelier=true 时开关位禁邻尖刺(原版两分支条件差异)。
function canHit(st: TileStore, x1: number, y1: number, x2: number, y2: number): boolean {
  const w = st.w, h = st.h;
  let num = x1, num2 = y1;
  const num3 = Math.max(1, Math.min(w - 1, x2));
  const num4 = Math.max(1, Math.min(h - 40, y2));
  num = Math.max(1, Math.min(w - 1, num));
  num2 = Math.max(1, Math.min(h - 40, num2));
  const fullBrick = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const k = st.idx(x, y);
    if (!st.flags[k]) return false;
    const d = TILE_DEFS[st.type[k]];
    return !!d?.solid && !d.platform && st.slope[k] === 0 && !st.half[k];
  };
  for (;;) {
    if (num === num3 && num2 === num4) return true;
    const dAbs = Math.abs(num - num3), dOrd = Math.abs(num2 - num4);
    if (dAbs > dOrd) {
      num += num >= num3 ? -1 : 1;
      if (fullBrick(num, num2 - 1) && fullBrick(num, num2 + 1)) return false;
    } else {
      num2 += num2 >= num4 ? -1 : 1;
      if (fullBrick(num - 1, num2) && fullBrick(num + 1, num2)) return false;
    }
    // do-while 条件：落点格"非活性 / 非实心 / 平台"才继续步进；实心非平台 → 穿墙阻挡
    const k = st.idx(num, num2);
    const d = TILE_DEFS[st.type[k]];
    const passable = !st.flags[k] || !d?.solid || !!d.platform;
    if (!passable) return false;
    if (num < 1 || num >= w - 1 || num2 < 1 || num2 >= h - 40) return false;
  }
}

/** AddBuriedChest（1456 cs:35920）下落段 1:1：自 y 向下扫至 h-10，
 *  首个 SolidTile（半砖/坡面不算）落定；±2 邻域有 Boulders/26/237 → 失败。
 *  样式/主件由调用方显式给定（地牢战利品序），2×2 箱落其上后推入 chests */
/** 内部物品 id → 原版 id（ITEM_DEFS 反查 vid 字段；非 vi_ 返回 0） */
function vidOfInternal(internalId: number): number {
  const d = ITEM_DEFS[internalId];
  if (!d) return 0;
  if (d.vid != null) return d.vid;
  const m = /^vi_(\d+)_/.exec(d.key);
  return m ? parseInt(m[1], 10) : 0;
}

