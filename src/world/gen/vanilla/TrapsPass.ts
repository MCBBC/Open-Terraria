// 原版 pass 76 "Traps" 1:1（1456 WorldGen.cs:18769-18898 主体 + placeTrap cs:8875-9460
// + PlaceSandTrap cs:35505-35781；EEEE 批 2026-08-18 对照 1456 全量重写——旧实现系
// 1405 行号混编，缺 CanGeneratePressurePlateAt/巨石变体掷/沙陷阱整尾段）。
// 全类型 placeTrap：0 飞镖 / 1 巨石陷阱 / 2 炸药桶 / 3 热喷泉，type=-1 随机
// （1/20 炸药桶；lavaLine+30 以下 5/6 热喷泉；否则 50/50 飞镖|巨石）。
// 地下沙漠 PlaceSandTrap（w*0.003）：蜂窝墙内砂岩顶掏沙穴 + 致动沙栅 + 中心红线。
// RNG 映射：Next(a,b) → rng.int(a, b-1)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS } from '../../../data/tiles';
import { flipGenSolid, vanGenSolidType } from './GenSolid';

// ---- 内部 id / sheet 解析（表均为原版 sheet id 空间，消费端经 sheetOf 换算） ----
const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[i] = s;
}
const sheetOf = (t: number): number => (t >= 0 && t < SHEET_OF.length ? SHEET_OF[t] : -1);

/** TileID.Sets.Boulders（TileID.cs:195）= {138,484,664,665,711-716}（sheet 空间） */
const BOULDER_SHEETS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
const isBoulderType = (t: number): boolean => BOULDER_SHEETS.has(sheetOf(t));
/** Main.tileDungeon（Main.cs:7941-7946）= {41,43,44,677,678,679}（sheet 空间） */
const TILE_DUNGEON = new Set([41, 43, 44, 677, 678, 679]);
/** Main.wallDungeon（Main.cs:10507-10515）= {7,8,9,94-99}（wall id 空间，免换算） */
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
/** Main.tileSolidTop（Main.cs:6764+ 全 86 项，U/DDDD 批同表副本——不 import 防耦合） */
const SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
/** TileID.Sets.Platforms（TileID.cs:243） */
const PLATFORM_SHEETS = new Set([19, 427, 435, 436, 437, 438, 439]);
/** TileID.Sets.Ore（TileID.cs:399） */
const ORE_SHEETS = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);
/** PlaceSandTrap ±25 禁置族：BasicChest{21,467}+Paintings{240,241,242,245,246}+{10,19,15,219,314} */
const SAND_FORBID = new Set([21, 467, 240, 241, 242, 245, 246, 10, 19, 15, 219, 314]);

const SHEET_ID_MAP = new Map<number, number>();
const sheetId = (s: number): number => {
  let v = SHEET_ID_MAP.get(s);
  if (v === undefined) {
    v = -1;
    for (let i = 0; i < TILE_DEFS.length; i++) if (SHEET_OF[i] === s) { v = i; break; }
    SHEET_ID_MAP.set(s, v);
  }
  return v;
};
const PLATE = sheetId(135);
const TRAP137 = sheetId(137);
const EXPLOSIVES = sheetId(141);
const GEYSER = sheetId(443);
const STONE1 = sheetId(1);          // 原版石头（巨石壳/致动石栅）
const SAND = sheetId(53);
const SANDSTONE = sheetId(396);
const HARDSAND = sheetId(397);
const MUSH_GRASS70 = sheetId(70);
const GLOW190 = sheetId(190);
const SPIKE48 = sheetId(48);
const WSPIKE232 = sheetId(232);
const SNOW147 = sheetId(147);
const ICE161 = sheetId(161);
const DOOR10 = sheetId(10);
const CHEST21 = sheetId(21);
const CHEST467 = sheetId(467);
const BOULDER138 = sheetId(138);
const BOULDER711 = sheetId(711);
const BOULDER713 = sheetId(713);
const BOULDER714 = sheetId(714);
const BOULDER715 = sheetId(715);
const BOULDER664 = sheetId(664);
const BOULDER716 = sheetId(716);
const SHEET379 = sheetId(379);

const WIRE_RED = TileStore.WIRE_RED;
const WIRE_ACTUATOR = TileStore.WIRE_ACTUATOR;

/** GenVars.boulderPetsPlaced（cs:9302 宠物巨石计数，每局生成清零） */
let boulderPetsPlaced = 0;

/** 多格 framed 物体表（KillTile 整块语义：破坏任一格=整块移除，见
 *  MultitileFragmentSweep 注释；Traps 的井杀/镖锚杀会波及陶罐/雕像/滚地仙人掌
 *  等邻接物体——golden (3787..3788,412..413) 陶罐被镖锚 KillTile 整块带走实证）。 */
const MULTI_DEFS = new Map<number, { w: number; h: number }>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i]!;
  if (d.framed && ((d.w ?? 1) > 1 || (d.h ?? 1) > 1)) MULTI_DEFS.set(i, { w: d.w!, h: d.h! });
}
function killTileWhole(st: TileStore, x: number, y: number): void {
  // ★支撑塌连锁：KillTile 尾部 SquareTileFrame(i,j)（cs:63983）→ TileFrame(x±1,y-1)
  //   重帧——**底行**骑在被杀格**正上方**（同列）的多格物体（陶罐/雕像/装饰）
  //   整块碎裂。golden 实证：镖锚 (3788,414) 杀木块 → 正上 2×2 陶罐(3787..3788,
  //   412..413) 整塌；对照①(401,389) 杀泥——旁侧陶罐底行不骑该列，不塌；对照②
  //   (493,450) 杀泥——邻列 (494,449) 陶罐底行不塌（±1 列不级联）。
  {
    const ux = x, uy = y - 1;
    if (st.inBounds(ux, uy)) {
      const ui = st.idx(ux, uy);
      const ut = st.type[ui];
      if (MULTI_DEFS.has(ut) && st.flags[ui]) {
        const m = MULTI_DEFS.get(ut)!;
        // 找含 (ux,uy) 的完整块，且 (ux,uy) 须在块底行
        let done = false;
        for (let ay = uy; ay > uy - m.h && !done; ay--) {
          for (let ax = ux; ax > ux - m.w; ax--) {
            let full = true;
            for (let dy = 0; dy < m.h && full; dy++) {
              for (let dx2 = 0; dx2 < m.w; dx2++) {
                if (!st.inBounds(ax + dx2, ay + dy) || st.type[st.idx(ax + dx2, ay + dy)] !== ut) { full = false; break; }
              }
            }
            if (full && ay + m.h - 1 === uy) {
              for (let dy = 0; dy < m.h; dy++) {
                for (let dx2 = 0; dx2 < m.w; dx2++) st.setTileSilent(ax + dx2, ay + dy, 0);
              }
              done = true;
              break;
            }
          }
        }
      }
    }
  }
  killObjectAt(st, x, y);
}
function killObjectAt(st: TileStore, x: number, y: number): void {
  const t = st.type[st.idx(x, y)];
  const m = MULTI_DEFS.get(t);
  if (m) {
    for (let ay = y; ay > y - m.h; ay--) {
      for (let ax = x; ax > x - m.w; ax--) {
        let full = true;
        for (let dy = 0; dy < m.h && full; dy++) {
          for (let dx = 0; dx < m.w; dx++) {
            if (!st.inBounds(ax + dx, ay + dy) || st.type[st.idx(ax + dx, ay + dy)] !== t) { full = false; break; }
          }
        }
        if (full) {
          for (let dy = 0; dy < m.h; dy++) {
            for (let dx = 0; dx < m.w; dx++) st.setTileSilent(ax + dx, ay + dy, 0);
          }
          return;
        }
      }
    }
  }
  st.setTileSilent(x, y, 0);
}

/** EEEE 探针钩子（SW_EEEE_DBG=1 时登记每次接受的陷阱） */
export const EEEE_DBG = typeof process !== 'undefined' && process.env.SW_EEEE_DBG === '1';   // 浏览器侧 typeof 守卫(同族 LT_TRACE/PYR_TRACE 模式;裸 process 炸 boot)
export const eeeeLog: Array<Record<string, number>> = [];

// ---- 原版实心谓词族（cs:70155/70178/70211；生成期 Main.tileSolid = vanGenSolidType） ----
/** SolidTile（cs:70155）：active && tileSolid && !tileSolidTop && !half && slope==0 && !inActive */
function solidTileV(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) { SAND_REJ.g1 = (SAND_REJ.g1 ?? 0) + 1; return false; }
  const i = st.idx(x, y);
  const t = st.type[i]!;
  return st.flags[i] !== 0 && vanGenSolidType(t) && !SOLID_TOP.has(sheetOf(t))
    && !st.half[i] && st.slope[i] === 0 && ((st.wire[i] >>> 5) & 1) === 0;
}
/** SolidTile2（cs:70178）：active && tileSolid && slope==0 && !half && !inActive（无 solidTop 位） */
function solidTile2V(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) { SAND_REJ.g2 = (SAND_REJ.g2 ?? 0) + 1; return false; }
  const i = st.idx(x, y);
  const t = st.type[i]!;
  return st.flags[i] !== 0 && vanGenSolidType(t) && !st.half[i] && st.slope[i] === 0
    && ((st.wire[i] >>> 5) & 1) === 0;
}
/** PlatformProperTopFrame（cs:70197）：帧列号 ∈[0,7]∪[12,16]∪[25,26] */
function platformProperTopFrame(fx: number): boolean {
  const num = Math.floor(fx / 18);
  if ((num < 0 || num > 7) && (num < 12 || num > 16)) {
    if (num >= 25) return num <= 26;
    { SAND_REJ.g3 = (SAND_REJ.g3 ?? 0) + 1; return false; }
  }
  return true;
}
/** SolidTileAllowBottomSlope（cs:70211）：底坡可作地基；越界返回 true（InWorld 门内语义） */
function solidTileAllowBottomSlope(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  const t = st.type[i]!;
  if (st.flags[i] === 0) { SAND_REJ.g4 = (SAND_REJ.g4 ?? 0) + 1; return false; }
  const sheet = sheetOf(t);
  const topSlope = st.slope[i] === 1 || st.slope[i] === 2;
  return (vanGenSolidType(t) || SOLID_TOP.has(sheet))
    && (!topSlope || (PLATFORM_SHEETS.has(sheet) && platformProperTopFrame(st.frameX[i]!)))
    && !st.half[i] && ((st.wire[i] >>> 5) & 1) === 0;
}

/** IsTileNearby（cs:8828）：±distance 盒内找 active 同型格（type≠235 时步长 1） */
function isTileNearby(st: TileStore, x: number, y: number, sheet: number, distance: number): boolean {
  const target = sheetId(sheet);
  for (let i = x - distance; i <= x + distance; i++) {
    for (let j = y - distance; j <= y + distance; j++) {
      if (!st.inBounds(i, j)) continue;
      const ii = st.idx(i, j);
      if (st.flags[ii] && st.type[ii] === target) return true;
    }
  }
  { SAND_REJ.g5 = (SAND_REJ.g5 ?? 0) + 1; return false; }
}
/** AreAnyTilesInSetNearby（cs:8753）：±distance 盒内找集合内 active 格 */
function anyBoulderNearby(st: TileStore, x: number, y: number, distance: number): boolean {
  for (let i = x - distance; i <= x + distance; i++) {
    for (let j = y - distance; j <= y + distance; j++) {
      if (!st.inBounds(i, j)) continue;
      const ii = st.idx(i, j);
      if (st.flags[ii] && isBoulderType(st.type[ii])) return true;
    }
  }
  { SAND_REJ.g6 = (SAND_REJ.g6 ?? 0) + 1; return false; }
}
/** closeEnoughToSpidersToSpawnSpiderBoulder（cs:8796）：±80 步 3 扫墙 62 */
function closeSpiders(st: TileStore, x: number, y: number): boolean {
  for (let i = x - 80; i <= x + 80; i += 3) {
    for (let j = y - 80; j <= y + 80; j += 3) {
      if (st.inBounds(i, j) && st.wall[st.idx(i, j)] === 62) return true;
    }
  }
  { SAND_REJ.g7 = (SAND_REJ.g7 ?? 0) + 1; return false; }
}
/** closeEnoughToDungeonToSpawnGhoulder（cs:8772）：地牢侧门 + ±1000 步 10 扫地牢墙 */
function closeDungeon(st: TileStore, x: number, y: number, side: number): boolean {
  if (side <= -1 && x > st.w / 2) { SAND_REJ.g8 = (SAND_REJ.g8 ?? 0) + 1; return false; }
  if (side >= 1 && x < st.w / 2) { SAND_REJ.g9 = (SAND_REJ.g9 ?? 0) + 1; return false; }
  for (let i = x - 1000; i <= x + 1000; i += 10) {
    for (let j = y - 1000; j <= y + 1000; j += 10) {
      if (st.inBounds(i, j) && WALL_DUNGEON.has(st.wall[st.idx(i, j)])) return true;
    }
  }
  { SAND_REJ.g10 = (SAND_REJ.g10 ?? 0) + 1; return false; }
}
/** closeEnoughToLavaToSpawnLavaBoulder（cs:8812）：±60 步 3 扫岩浆 */
function closeLava(st: TileStore, x: number, y: number): boolean {
  for (let i = x - 60; i <= x + 60; i += 3) {
    for (let j = y - 60; j <= y + 60; j += 3) {
      if (!st.inBounds(i, j)) continue;
      const ii = st.idx(i, j);
      if (st.liquid[ii] > 0 && st.liquidType[ii] === 2) return true;
    }
  }
  { SAND_REJ.g11 = (SAND_REJ.g11 ?? 0) + 1; return false; }
}

/** L 形布线（先 x 后 y；cs:9124-9147 同构） */
function lWire(st: TileStore, x0: number, y0: number, x1: number, y1: number): void {
  let wx = x0, wy = y0;
  while (wx !== x1 || wy !== y1) {
    st.wire[st.idx(wx, wy)] |= WIRE_RED;
    if (wx > x1) wx--; else if (wx < x1) wx++;
    st.wire[st.idx(wx, wy)] |= WIRE_RED;
    if (wy > y1) wy--; else if (wy < y1) wy++;
    st.wire[st.idx(wx, wy)] |= WIRE_RED;
  }
}

/** PlaceTile(i,j,135,style)（Place1x1 cs:45194：InWorld2 + 地基 SolidTile2 + 本格须空；
 *  135 非 IsAMechanism，机构门恒过）。门不过=无板（无掷骰副作用——style 已由调用方掷）。 */
function placePlate(st: TileStore, x: number, y: number, style: number): boolean {
  if (x < 2 || y < 2 || x > st.w - 3 || y > st.h - 3) { SAND_REJ.g12 = (SAND_REJ.g12 ?? 0) + 1; return false; }   // InWorld(x,y,2)
  if (st.flags[st.idx(x, y)] !== 0) { SAND_REJ.g13 = (SAND_REJ.g13 ?? 0) + 1; return false; }                     // Place1x1 !tile.active()
  if (!solidTile2V(st, x, y + 1)) { SAND_REJ.g14 = (SAND_REJ.g14 ?? 0) + 1; return false; }
  st.setTileSilent(x, y, PLATE, 0, style * 18);
  const i = st.idx(x, y);
  st.half[i] = 0; st.slope[i] = 0;                                    // PlaceTile 前奏 Clear（cs:59497）
  return true;
}

/** placeTrap 主体（cs:8875-9460，普通种子路径）。type: 0 飞镖 / 1 巨石 / 2 炸药桶 / 3 热喷泉 */
export function placeTrap(st: TileStore, rng: RNG, gs: GenState, x2: number, y2: number, type = -1): boolean {
  // 微光回避（cs:8884，用原始 y2 掷点）：距 shimmerPosition <100 拒（未生成时 (0,0)）
  const shx = gs.shimmerX >= 0 ? gs.shimmerX : 0, shy = gs.shimmerY >= 0 ? gs.shimmerY : 0;
  if (Math.hypot(x2 - shx, y2 - shy) < 100) { SAND_REJ.g15 = (SAND_REJ.g15 ?? 0) + 1; return false; }
  // 下扫实心地面（cs:8894-8905）
  let py = y2;
  let deep = false;
  while (!solidTileV(st, x2, py)) {
    py++;
    if (py > st.h - 10) { SAND_REJ.g16 = (SAND_REJ.g16 ?? 0) + 1; return false; }
    if (py >= st.h - 300) deep = true;
  }
  py--;                                                               // cs:8910 num--
  // 邻蘑菇草 70 回避（cs:8911 IsTileNearby ±20）/ 蜥蜴墙 87（cs:8915）/ 微光墙 350（cs:8919）
  if (isTileNearby(st, x2, py, 70, 20)) { SAND_REJ.g17 = (SAND_REJ.g17 ?? 0) + 1; return false; }
  const wi = st.idx(x2, py);
  if (st.wall[wi] === 87) { SAND_REJ.g18 = (SAND_REJ.g18 ?? 0) + 1; return false; }
  if (st.wall[wi] === 350) { SAND_REJ.g19 = (SAND_REJ.g19 ?? 0) + 1; return false; }
  const lava = st.liquid[wi] > 0 && st.liquidType[wi] === 2;          // cs:8923
  // type 随机（cs:8942-8955 普通（非 remix）分支）
  if (type === -1 && rng.int(0, 19) === 0) type = 2;
  else if (type === -1 && py > gs.lavaLine + 30 && rng.int(0, 5) !== 0) type = 3;
  else if (type === -1) type = rng.int(0, 1);
  // 共同守卫（cs:8961-8985）
  if (x2 < 3 || py < 3 || x2 > st.w - 4 || py > st.h - 4) { SAND_REJ.g20 = (SAND_REJ.g20 ?? 0) + 1; return false; }   // InWorld(x2,num,3)
  if (lava && type !== 3) { SAND_REJ.g21 = (SAND_REJ.g21 ?? 0) + 1; return false; }
  if (deep && type !== 3) { SAND_REJ.g22 = (SAND_REJ.g22 ?? 0) + 1; return false; }
  for (const [ax, ay] of [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, -2], [-1, -2], [1, -2]] as const) {
    if (st.flags[st.idx(x2 + ax, py + ay)]) { SAND_REJ.g23 = (SAND_REJ.g23 ?? 0) + 1; return false; }             // cs:8973 nactive 九格
  }
  {
    const below = st.idx(x2, py + 1);
    if (st.flags[below] && (st.type[below] === SPIKE48 || st.type[below] === WSPIKE232)) { SAND_REJ.g24 = (SAND_REJ.g24 ?? 0) + 1; return false; }  // cs:8977
  }
  // CanGeneratePressurePlateAt（cs:11044-11064）
  {
    const gi = st.idx(x2, py + 1);
    if (!solidTileAllowBottomSlope(st, x2, py + 1)) { SAND_REJ.g25 = (SAND_REJ.g25 ?? 0) + 1; return false; }
    if (st.type[gi] >= 0 && isBoulderType(st.type[gi])) { SAND_REJ.g26 = (SAND_REJ.g26 ?? 0) + 1; return false; }
    if (st.wall[gi] === 350) { SAND_REJ.g27 = (SAND_REJ.g27 ?? 0) + 1; return false; }
  }
  // 冰雪退化（cs:8986-8998）：type1 压板 ±3 内有雪 147/冰 161 → 降级飞镖
  if (type === 1) {
    for (let i = x2 - 3; i <= x2 + 3; i++) {
      for (let j = py - 3; j <= py + 3; j++) {
        if (!st.inBounds(i, j)) continue;
        const ii = st.idx(i, j);
        if (st.flags[ii] && (st.type[ii] === SNOW147 || st.type[ii] === ICE161)) { type = 0; }
      }
    }
  }

  if (type === 1) {
    // ---- 巨石陷阱（cs:9151-9345）----
    const petCap = st.w >= 8400 ? 6 : st.w >= 6400 ? 4 : 2;           // GetWorldSize 三档（cs:9153）
    let colX = x2 + rng.int(-1, 1);                                   // num4（cs:9166 Next(-1,2)）
    let top = py - 8;                                                 // num5（cs:9165）
    if (anyBoulderNearby(st, colX, top, 10)) { SAND_REJ.g28 = (SAND_REJ.g28 ?? 0) + 1; return false; }            // cs:9174
    for (;;) {
      let allSolid = true, n2 = 0;
      for (let m = colX - 2; m <= colX + 3; m++) {
        for (let n = top; n <= top + 3; n++) {
          if (!solidTileV(st, m, n)) allSolid = false;
          const ii = st.idx(m, n);
          if (st.flags[ii]) {
            const sh = sheetOf(st.type[ii]!);
            if (sh === 226 || TILE_DUNGEON.has(sh)) { SAND_REJ.g29 = (SAND_REJ.g29 ?? 0) + 1; return false; }     // cs:9194 神庙砖/地牢砖
            if (st.wall[ii] === 350) { SAND_REJ.g30 = (SAND_REJ.g30 ?? 0) + 1; return false; }                    // cs:9199
            if (sh === 0 || sh === 1 || sh === 59) n2++;              // cs:9204 泥/石/泥块
          }
        }
      }
      top--;
      if (top < gs.worldSurface) { SAND_REJ.g31 = (SAND_REJ.g31 ?? 0) + 1; return false; }                        // cs:9212
      if (allSolid && n2 > 2) break;
    }
    if (py - top <= 5 || py - top >= 40) { SAND_REJ.g32 = (SAND_REJ.g32 ?? 0) + 1; return false; }                // cs:9222
    if (isTileNearby(st, colX, top, 21, 4) || isTileNearby(st, colX, top, 467, 4)) { SAND_REJ.g33 = (SAND_REJ.g33 ?? 0) + 1; return false; }  // cs:9227
    // 掏 2 宽竖井 top..py（cs:9232-9240；379 免杀）。★巨石族免杀：golden site
    //   (2022..2024,581) A 先置巨石后 B 井穿 (2023,581-582)——A 石以 714 存活至
    //   终态（若井可杀则该两格必为气）。反编译印 type!=379 门，按金标扩为巨石族。
    for (let xx = colX; xx <= colX + 1; xx++) {
      for (let yy = top; yy <= py; yy++) {
        const ii = st.idx(xx, yy);
        if (st.type[ii] !== SHEET379 && !isBoulderType(st.type[ii])) killTileWhole(st, xx, yy);
      }
    }
    // 6×6 实心转石头（cs:9242-9250 直写 .type=1：保半砖/坡/帧）。★巨石族免转：
    //   同上 site——B 壳(2021-2026×579-584) 罩住 A 石右列，终态仍 714。
    for (let xx = colX - 2; xx <= colX + 3; xx++) {
      for (let yy = top - 2; yy <= top + 3; yy++) {
        if (solidTileV(st, xx, yy) && !isBoulderType(st.type[st.idx(xx, yy)])) {
          const ii = st.idx(xx, yy);
          st.type[ii] = STONE1; st.flags[ii] = 1;
        }
      }
    }
    placePlate(st, x2, py, 7);                                        // cs:9252 style7
    // cs:9253-9254 两块石头（PlaceTile forced=false：EmptyTile 门，非空格不写）
    if (!st.flags[st.idx(colX, top + 2)]) st.setTileSilent(colX, top + 2, STONE1);
    if (!st.flags[st.idx(colX + 1, top + 2)]) st.setTileSilent(colX + 1, top + 2, STONE1);
    // 巨石变体掷（cs:9255-9306；普通种子分支——notTheBees/tenth/registry 段恒假跳过）
    let boulderId = BOULDER138;
    if (rng.int(0, 1) === 0 && closeSpiders(st, colX, top)) boulderId = BOULDER714;
    else if (rng.int(0, 5) === 0 && closeDungeon(st, colX, top, gs.dungeonSide)) boulderId = BOULDER715;
    else if (rng.int(0, 2) === 0 && closeLava(st, colX, top)) boulderId = BOULDER713;
    else if (rng.int(0, 24) === 0) boulderId = BOULDER711;
    else if (rng.int(0, 19) === 0) boulderId = BOULDER664;
    if (boulderId === BOULDER138 && boulderPetsPlaced < petCap) { boulderPetsPlaced++; boulderId = BOULDER716; }
    {
      // ★cs:9307 反编译印 PlaceTile(num4+1, num5+1)，x86 金标实证锚=(num4, num5)
      //   （site 对账：(533,603) 板/num4=532/num5=579 → 巨石 532-533×579-580；
      //   井/壳/栅行界全按 num5 直读对齐，仅此锚差 (-1,-1)）。
      //   ★空置门：巨石 2×2 目标格任一 active 即整写放弃（保留井/栅/板/线，仍
      //   return true）——golden 双站点实证：site(878..882,729..734) A/B 双陷阱各自
      //   落石（无重叠）；site(2022..2024,581) B 陷阱 2×2 与先置 A 石重叠 → 只留
      //   板(2024,613)+井杀列。反编译 Place2x2 的 (x-1..x)×(y-1..y) 门与两站均
      //   矛盾（门格恒活却仍落石），以金标为准取目标格判定。
      const bx = colX, by = top;
      let blocked = false;
      for (let gx = bx; gx <= bx + 1; gx++) {
        for (let gy = by; gy <= by + 1; gy++) {
          if (st.inBounds(gx, gy) && st.flags[st.idx(gx, gy)]) blocked = true;
        }
      }
      if (!blocked) {
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) st.setTileSilent(bx + dx, by + dy, boulderId, dx * 18, dy * 18);
        }
      }
    }
    // 2×3 致动石栅（cs:9308-9319：石头+红线+致动器）
    top += 2;
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        const gx = colX + dx, gy = top + dy;
        // PlaceTile(1, forced=false) EmptyTile 门：巨石占格不覆盖石头（线/致动仍写）
        if (!st.flags[st.idx(gx, gy)]) st.setTileSilent(gx, gy, STONE1);
        st.wire[st.idx(gx, gy)] |= WIRE_RED | WIRE_ACTUATOR;
      }
    }
    lWire(st, x2, py, colX, top);                                     // cs:9320-9343
    if (EEEE_DBG) eeeeLog.push({ k: 1, x2, py, ax: colX, ay: top, b: boulderId });
    return true;
  }

  if (type === 2) {
    // ---- 炸药桶（cs:9347-9413）——★原版 case2 落穿 switch 尾 return false（放置成功
    //   也返回 false→内层 1150 循环不 break，bug-for-bug 保留）----
    const drop = rng.int(4, 6);
    const bx = x2 + rng.int(-1, 1);
    let by = py;
    for (let k = 0; k < drop; k++) {
      by++;
      if (!solidTileV(st, bx, by)) { SAND_REJ.g34 = (SAND_REJ.g34 ?? 0) + 1; return false; }
    }
    for (let xx = bx - 2; xx <= bx + 2; xx++) {
      for (let yy = by - 2; yy <= by + 2; yy++) {
        if (st.inBounds(xx, yy)) {
          const ii = st.idx(xx, yy);
          if (st.wall[ii] === 350) { SAND_REJ.g35 = (SAND_REJ.g35 ?? 0) + 1; return false; }                      // cs:9369
          if (!solidTileV(st, xx, yy)) { SAND_REJ.g36 = (SAND_REJ.g36 ?? 0) + 1; return false; }
        }
      }
    }
    killTileWhole(st, bx, by);                                        // KillTile（cs:9382，清半砖/坡）
    st.setTileSilent(bx, by, EXPLOSIVES, 0, rng.int(0, 1) * 18);      // cs:9383-9386
    placePlate(st, x2, py, rng.int(2, 3));                            // cs:9387
    lWire(st, x2, py, bx, by);
    if (EEEE_DBG) eeeeLog.push({ k: 2, x2, py, ax: bx, ay: by });
    { SAND_REJ.g37 = (SAND_REJ.g37 ?? 0) + 1; return false; }                                                     // cs:9413 break → 9459 return false
  }

  if (type === 3) {
    // ---- 热喷泉（cs:9415-9452）：2×1，frameX = 18*k + 36*Next(2)；直写保半砖/坡 ----
    if (st.flags[st.idx(x2 + 1, py)]) { SAND_REJ.g38 = (SAND_REJ.g38 ?? 0) + 1; return false; }
    if (st.liquid[st.idx(x2, py)] > 0 && st.liquidType[st.idx(x2, py)] !== 2) { SAND_REJ.g39 = (SAND_REJ.g39 ?? 0) + 1; return false; }   // cs:9421 非岩浆液体拒
    for (let xx = x2; xx <= x2 + 1; xx++) {
      if (!solidTileV(st, xx, py + 1)) { SAND_REJ.g40 = (SAND_REJ.g40 ?? 0) + 1; return false; }
    }
    const fx = rng.int(0, 1);
    for (let k = 0; k < 2; k++) {
      st.setTileSilent(x2 + k, py, GEYSER, 18 * k + 36 * fx, 0);
    }
    if (EEEE_DBG) eeeeLog.push({ k: 3, x2, py, ax: x2, ay: py });
    return true;
  }

  // ---- type 0 飞镖（cs:9009-9150）----
  const j2 = py - rng.int(0, 2);                                      // num27（cs:9013）
  const solidFor = (x: number, y: number) => solidTileV(st, x, y)
    || (st.inBounds(x, y) && st.flags[st.idx(x, y)] && isCracked(st.type[st.idx(x, y)]));
  let i1 = x2;
  while (!solidFor(i1, j2)) { i1--; if (i1 < 0) { SAND_REJ.g41 = (SAND_REJ.g41 ?? 0) + 1; return false; } }
  const i2 = i1;
  let i3 = x2;
  while (!solidFor(i3, j2)) { i3++; if (i3 > st.w) { SAND_REJ.g42 = (SAND_REJ.g42 ?? 0) + 1; return false; } }
  const i4 = i3;
  let f3 = x2 - i2 > 5 && x2 - i2 < 50;
  let f4 = i4 - x2 > 5 && i4 - x2 < 50;
  if (f3 && !solidTileV(st, i2, j2 + 1)) f3 = false;
  if (f4 && !solidTileV(st, i4, j2 + 1)) f4 = false;
  const badAnchor = (t: number) => t === DOOR10 || t === SPIKE48;
  if (f3 && (badAnchor(st.type[st.idx(i2, j2)]) || badAnchor(st.type[st.idx(i2, j2 + 1)]))) f3 = false;
  if (f4 && (badAnchor(st.type[st.idx(i4, j2)]) || badAnchor(st.type[st.idx(i4, j2 + 1)]))) f4 = false;
  let i5: number, dir: number;
  if (f3 && f4) {
    dir = 1; i5 = i2;
    if (rng.int(0, 1) === 0) { i5 = i4; dir = -1; }
  } else if (f4) { i5 = i4; dir = -1; }
  else if (f3) { i5 = i2; dir = 1; }
  else { SAND_REJ.g43 = (SAND_REJ.g43 ?? 0) + 1; return false; }
  if (st.type[st.idx(i5, j2)] === GLOW190) { SAND_REJ.g44 = (SAND_REJ.g44 ?? 0) + 1; return false; }              // cs:9087
  if (st.wall[st.idx(i5, j2)] === 350) { SAND_REJ.g45 = (SAND_REJ.g45 ?? 0) + 1; return false; }                  // cs:9092
  placePlate(st, x2, py, st.wall[st.idx(x2, py)] > 0 ? 2 : rng.int(2, 3));   // cs:9097-9104
  killTileWhole(st, i5, j2);                                          // KillTile（cs:9105，整块语义）
  st.setTileSilent(i5, j2, TRAP137, dir === 1 ? 18 : 0, 0);           // cs:9115（style0）
  lWire(st, x2, py, i5, j2);
  if (EEEE_DBG) eeeeLog.push({ k: 0, x2, py, ax: i5, ay: j2, dir });
  return true;
}

function isCracked(t: number): boolean {
  const s = sheetOf(t);
  return s === 481 || s === 482 || s === 483;                          // Main.tileCracked（Main.cs:7139）
}

/** PlaceSandTrap（cs:35505-35781）：地下沙漠蜂窝墙内的塌沙陷阱（1456 全尾段） */
/** PlaceSandTrap（cs:35505-35781）——导出仅供探针对账 */
export const SAND_REJ: Record<string, number> = {};
export function placeSandTrap(st: TileStore, rng: RNG, i: number, j: number): boolean {
  const num2 = 4, num3 = 25;
  let k = j;
  while (k < st.h - 200 && !st.flags[st.idx(i, k)]) k++;              // cs:35515 UnderworldLayer
  if (k >= st.h - 200) { SAND_REJ.g46 = (SAND_REJ.g46 ?? 0) + 1; return false; }
  {
    const gi = st.idx(i, k);
    const t = st.type[gi]!;
    if (!vanGenSolidType(t) || st.half[gi] || st.slope[gi] === 1 || st.slope[gi] === 2) { SAND_REJ.g47 = (SAND_REJ.g47 ?? 0) + 1; return false; }  // cs:35522
    const s = sheetOf(t);
    if ((s !== 53 && s !== 397 && s !== 396) || (st.wall[gi] !== 216 && st.wall[gi] !== 187)) { SAND_REJ.g48 = (SAND_REJ.g48 ?? 0) + 1; return false; }  // cs:35526
  }
  k--;                                                                // cs:35530
  const pocketW = rng.int(6, 11);                                     // num5（cs:35532 ★掷在 ±25 扫前）
  const pocketH = rng.int(6, 13);                                     // num6（cs:35533）
  // ±25 无线/箱/画/门/平台/牌/提取机/矿轨（cs:35534-35571）
  for (let dx = -num3; dx <= num3; dx++) {
    for (let dy = -num3; dy < num3; dy++) {
      const xx = i + dx, yy = k + dy;
      if (!st.inBounds(xx, yy)) continue;
      const ii = st.idx(xx, yy);
      if (st.wire[ii]) { SAND_REJ.g49 = (SAND_REJ.g49 ?? 0) + 1; return false; }
      if (SAND_FORBID.has(sheetOf(st.type[ii]!))) { SAND_REJ.g50 = (SAND_REJ.g50 ?? 0) + 1; return false; }       // 无 active 门（cs:35542 原样读 type）
    }
  }
  // ±2 下 3 格实心（cs:35572-35581：active && tileSolid）
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = 1; dy <= 3; dy++) {
      const ii = st.idx(i + dx, k + dy);
      if (!st.flags[ii] || !vanGenSolidType(st.type[ii]!)) { SAND_REJ.g51 = (SAND_REJ.g51 ?? 0) + 1; return false; }
    }
  }
  if (sheetOf(st.type[st.idx(i, k + 1)]!) === 162) { SAND_REJ.g52 = (SAND_REJ.g52 ?? 0) + 1; return false; }      // cs:35582 BreakableIce
  // 上扫砂岩顶（cs:35586-35605）
  let sandTop = -1;
  for (let yy = k; yy > k - 30; yy--) {
    const ii = st.idx(i, yy);
    if (st.flags[ii]) {
      if (sheetOf(st.type[ii]!) !== 396) { SAND_REJ.g53 = (SAND_REJ.g53 ?? 0) + 1; return false; }
      sandTop = yy;
      break;
    }
  }
  if (sandTop <= -1) { SAND_REJ.g54 = (SAND_REJ.g54 ?? 0) + 1; return false; }
  if (k - sandTop < pocketH + num2) { SAND_REJ.g55 = (SAND_REJ.g55 ?? 0) + 1; return false; }
  // 腰线全空 + 下方实心率 75%（cs:35606-35633：ore 检查对任意 active 格）
  const mid = Math.floor((k + sandTop) / 2);
  let solidN = 0;
  for (let dx = -pocketW; dx <= pocketW; dx++) {
    const ii = st.idx(i + dx, mid);
    if (st.flags[ii] && vanGenSolidType(st.type[ii]!)) { SAND_REJ.g56 = (SAND_REJ.g56 ?? 0) + 1; return false; }
    for (let dy = sandTop - pocketH; dy <= sandTop; dy++) {
      const jj = st.idx(i + dx, dy);
      if (st.flags[jj]) {
        const s = sheetOf(st.type[jj]!);
        if (ORE_SHEETS.has(s) || s === 404) { SAND_REJ.g57 = (SAND_REJ.g57 ?? 0) + 1; return false; }             // cs:35618 Ore ∪ DesertFossil 404
        if (vanGenSolidType(st.type[jj]!)) solidN++;
      }
    }
  }
  if (solidN < (pocketW * 2 + 1) * (pocketH + 1) * 0.75) { SAND_REJ.g58 = (SAND_REJ.g58 ?? 0) + 1; return false; }
  // 掏沙穴 + 壳（cs:35634-35687）
  for (let dx = -pocketW - 1; dx <= pocketW + 1; dx++) {
    for (let dy = sandTop - pocketH; dy <= sandTop; dy++) {
      const xx = i + dx, yy = dy;
      if (!st.inBounds(xx, yy)) continue;
      const ii = st.idx(xx, yy);
      const flag = st.flags[ii] !== 0 && vanGenSolidType(st.type[ii]!);
      if (yy === sandTop) {                                           // 顶行：清坡/半砖；空则砂岩（保帧）
        st.slope[ii] = 0; st.half[ii] = 0;
        if (!flag) { st.type[ii] = SANDSTONE; st.flags[ii] = 1; }
      } else if (yy === sandTop - pocketH) {                          // 底行：ClearTile 后 397/396
        const above = st.idx(xx, yy - 1);
        const hard = flag && st.flags[above] !== 0 && vanGenSolidType(st.type[above]!);
        st.setTileSilent(xx, yy, hard ? HARDSAND : SANDSTONE);
        st.half[ii] = 0; st.slope[ii] = 0;
      } else if (dx === -pocketW - 1 || dx === pocketW + 1) {         // 侧列：空补砂岩；实心清坡/半砖
        if (!flag) {
          st.setTileSilent(xx, yy, SANDSTONE);
          st.half[ii] = 0; st.slope[ii] = 0;
        } else { st.slope[ii] = 0; st.half[ii] = 0; }
      } else {                                                        // 内部：纯沙
        st.setTileSilent(xx, yy, SAND);
        st.half[ii] = 0; st.slope[ii] = 0;
      }
    }
  }
  // 阶梯缘修整（cs:35688-35720：i±(pocketW+2) 支撑列非实心补砂岩）
  for (let y16 = Math.floor(sandTop - pocketH * 0.666); y16 <= sandTop - pocketH * 0.333; y16++) {
    const lx = i - pocketW - 2, rx = i + pocketW + 2;
    if (y16 < sandTop - pocketH * 0.4) {
      const li = st.idx(lx, y16);
      if (st.slope[li] === 3 || st.slope[li] === 4) st.slope[li] = 0; // bottomSlope
    } else if (y16 > sandTop - pocketH * 0.6) {
      const li = st.idx(lx, y16);
      if (st.slope[li] === 1 || st.slope[li] === 2) st.slope[li] = 0; // topSlope
      st.half[li] = 0;
    } else {
      const li = st.idx(lx, y16);
      st.half[li] = 0; st.slope[li] = 0;
    }
    for (const cx of [lx, rx]) {
      const ci = st.idx(cx, y16);
      if (!st.flags[ci] || !vanGenSolidType(st.type[ci]!)) { st.type[ci] = SANDSTONE; st.flags[ci] = 1; }
    }
  }
  // 壳侧四列清坡/半砖（cs:35721-35731：i-num5-2/-1/+1/+2）
  for (let y17 = sandTop - pocketH; y17 <= sandTop; y17++) {
    for (const dx of [-pocketW - 2, -pocketW - 1, pocketW + 1, pocketW + 2]) {
      const ii = st.idx(i + dx, y17);
      st.slope[ii] = 0; st.half[ii] = 0;
    }
  }
  // 穴底上一行清坡/半砖（cs:35732-35740）
  {
    const y19 = k - pocketH - 1;
    for (let x18 = i - pocketW - 1; x18 < i + pocketW + 1; x18++) {
      const ii = st.idx(x18, y19);
      if (st.slope[ii] === 3 || st.slope[ii] === 4) st.slope[ii] = 0;
      st.half[ii] = 0;
    }
  }
  // 压板两侧清空 + 压板 style7（cs:35741-35745）
  for (const dx of [-2, -1, 1, 2]) killTileWhole(st, i + dx, k);
  placePlate(st, i, k, 7);
  // 致动沙栅 + 阶梯掏空 + 中心红线（cs:35746-35780）
  for (let x20 = i - pocketW; x20 <= i + pocketW; x20++) {
    let y21 = k;
    if (x20 < i - pocketW * 0.8 || x20 > i + pocketW * 0.8) y21 = k - 3;
    else if (x20 < i - pocketW * 0.6 || x20 > i + pocketW * 0.6) y21 = k - 2;
    else if (x20 < i - pocketW * 0.4 || x20 > i + pocketW * 0.4) y21 = k - 1;
    for (let y22 = sandTop; y22 <= k; y22++) {
      if (x20 === i) st.wire[st.idx(i, y22)] |= WIRE_RED;             // 中心列全线
      const ii = st.idx(x20, y22);
      if (st.flags[ii] && vanGenSolidType(st.type[ii]!)) {
        if (y22 < sandTop + 2) st.wire[ii] |= WIRE_ACTUATOR | WIRE_RED;
        else if (y22 < y21) killTileWhole(st, x20, y22);
      }
    }
  }
  if (EEEE_DBG) eeeeLog.push({ k: 4, x2: i, py: k, ax: pocketW, ay: pocketH });
  return true;
}

/** pass 76 Traps 主体（cs:18769-18898）：w*0.05 次 placeTrap + w*0.003 次 PlaceSandTrap。
 *  两段计数均为裸 double 比较（cs:18800/18866 `for i < num`，不取整） */
export function runTrapsPass(st: TileStore, rng: RNG, gs: GenState): void {
  // ★pass 头 tileSolid 翻转（cs:18773 `Main.tileSolid[379] = false`）：
  //   本仓生成期不放置 379,行为无差,存档时间线。pass 尾 cs:18897 还原 true。
  flipGenSolid([379], false);
  boulderPetsPlaced = 0;   // GenVars.boulderPetsPlaced 每局清零
  eeeeLog.length = 0;
  const trapTries = st.w * 0.05;
  for (let n = 0; n < trapTries; n++) {
    for (let k = 0; k < 1150; k++) {
      let x = rng.int(200, st.w - 201);                               // Next(200, w-200)
      let y = rng.int(gs.worldSurface, st.h - 211);                   // Next(surface, h-210)
      // oceanDepths（cs:10978：y≤(surface+rock)/2+40 且海滩带）重掷
      const oceanTop = (gs.worldSurface + gs.rockLevel) / 2 + 40;
      while (y <= oceanTop && (x < gs.beachDistance || x > st.w - gs.beachDistance)) {
        x = rng.int(200, st.w - 201);
        y = rng.int(gs.worldSurface, st.h - 211);
      }
      if (st.wall[st.idx(x, y)] === 0 && placeTrap(st, rng, gs, x, y, -1)) break;
    }
  }
  const sandTries = st.w * 0.003;
  for (let n = 0; n < sandTries; n++) {
    for (let k = 0; k < 20000; k++) {
      const x = rng.int(Math.floor(st.w * 0.15), Math.floor(st.w * 0.85) - 1);
      const y = rng.int(gs.worldSurface + 20, st.h - 211);
      if (st.wall[st.idx(x, y)] === 187 && placeSandTrap(st, rng, x, y)) break;
    }
  }
  // ★pass 尾还原（cs:18897 `Main.tileSolid[379] = true`）
  flipGenSolid([379], true);
}
