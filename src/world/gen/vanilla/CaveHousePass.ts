// 原版 CaveHouseBiome 全量 1:1 移植(HouseUtils.cs + HouseBuilder.cs + 七主题 Builder)。
// 数量 = CaveHouseCount 35-40 × WorldArea/5040000(Configuration.json)。
// HouseBuilder.Place 原序:EmptyRooms → Stairs(对角平台+斜坡) → Doors(AreaOr 出口)
//   → Platforms(垂直出口) → SupportBeams(主题梁) → 沙漠 Bast 优先件 → FillRooms
//   (画/烛台交替 + 小堆/骨堆/雕像[含陷阱]/家具七选) → AgeRoom(七主题蚀变) →
//   Chests(四级联) → 丛林磨刀站/沙漠提炼机。
// 主题参数取各 *HouseBuilder.cs 构造;画表 = RandHousePicture/Desert(cs:35286/35336);
// 蚀变 = 各主题 AgeRoom override(Dither+Blotches 噪声门禁)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { placeBuriedChest, type ChestSink } from './BuriedChestsPass';
import { placeDoorClosed } from '../../Door';
import { STATUE_LIST, STATUES_WITH_TRAPS, placeStatueTrap } from './StatuesPass';
import { furnitureStyleBase } from '../../FurnitureStyle';

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
  st.inBounds(x, y) && !!st.flags[st.idx(x, y)] && !!(TILE_DEFS[st.type[st.idx(x, y)]]?.solid);
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

// ---------- 家具/陈设放置 ----------
/** 底锚(bottom)/顶锚(top)放置 framed 物件;帧 = style*fw*18 步长 */
function placeFurniture(st: TileStore, key: string, x: number, y: number, style = 0, anchor: 'bottom' | 'top' = 'bottom'): boolean {
  const t = TILE_BY_KEY[key];
  if (t === undefined) return false;
  const d = TILE_DEFS[t];
  const fw = d.vanilla?.fw ?? 1;
  const w = d.w ?? fw, h = d.h ?? (d.vanilla?.fh ?? 1);
  const topY = anchor === 'bottom' ? y - (h - 1) : y;
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      if (!st.inBounds(x + dx, topY + dy) || st.flags[st.idx(x + dx, topY + dy)]) return false;
    }
  }
  // 样式基偏移:权威布局表(FurnitureStyle.ts,竖排/换行族与通用横排统一)
  const sheet = d.vanilla?.sheet ?? -1;
  const [bx, by] = furnitureStyleBase(sheet, style, fw);
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      st.setTileSilent(x + dx, topY + dy, t, bx + dx * 18, by + dy * 18);
    }
  }
  return true;
}

/** 雕像(2×3,style*36 步长);STATUES_WITH_TRAPS 命中 → 邻近飞镖陷阱+接线 */
function placeStatue(st: TileStore, x: number, y: number, idx: number): boolean {
  const [sheet, style] = STATUE_LIST[idx];
  const tile = sheet === 349 ? STATUE_349 : STATUE_105;
  if (!tile || !st.inBounds(x + 1, y - 2)) return false;
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = -2; dy <= 0; dy++) {
      if (st.flags[st.idx(x + dx, y + dy)]) return false;
    }
  }
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      st.setTileSilent(x + dx, y - 2 + dy, tile, style * 36 + dx * 18, dy * 18);
    }
  }
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

// ---------- Blotches 相干噪声(Modifiers.Blotches 近似:2 格团簇值噪声) ----------
function makeBlotch(seed: number): (x: number, y: number) => number {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  return (x: number, y: number) => {
    const gx = Math.floor(x / 2), gy = Math.floor(y / 2);
    const fx = x / 2 - gx, fy = y / 2 - gy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(gx, gy), b = hash(gx + 1, gy), c = hash(gx, gy + 1), d = hash(gx + 1, gy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

// ---------- AgeRoom 七主题蚀变 ----------
/** PlaceTight 冰系钟乳石(PlaceUncheckedStalactite 冰分支:上方∈{147,161,163,164,200}) */
function placeStalactiteIce(st: TileStore, rng: RNG, x: number, y: number): void {
  if (!solidAt(st, x, y - 1) || activeAt(st, x, y) || activeAt(st, x, y + 1)) return;
  const above = st.type[st.idx(x, y - 1)];
  if (above !== SNOW147 && above !== ICE161
    && above !== TILE_BY_KEY['v_163_corrupt_ice_block']! && above !== sheetTile(164)
    && above !== TILE_BY_KEY['v_200_crimson_ice_block']!) return;
  const preferSmall = rng.int(0, 1) === 0;
  const variation = rng.int(0, 2);
  if (preferSmall) {
    st.setTileSilent(x, y, STALACTITE, variation * 18, 72);
  } else {
    st.setTileSilent(x, y, STALACTITE, variation * 18, 0);
    st.setTileSilent(x, y + 1, STALACTITE, variation * 18, 18);
  }
}
/** 花岗岩/大理石/沙漠钟乳石:原版 PlaceUncheckedStalactite 的冰/石双名单不含
 *  368/367/397 → 恒 no-op(原版语义,cs:38378 名单外静默返回) */
function placeStalactiteNoop(): void { /* 原版名单外无操作 */ }

function ageRoom(st: TileStore, rng: RNG, gs: GenState, r: Rect, theme: Theme, def: ThemeDef, seed: number): void {
  const blob = makeBlotch(seed);
  const wallGate = (x: number, y: number, dither: number, blobP: number) =>
    rng.next() < dither && blob(x, y) < blobP;
  const PAINTINGS = new Set([sheetTile(240), sheetTile(241), sheetTile(242),
    TILE_BY_KEY['v_245_paintings_2x3']!, TILE_BY_KEY['v_246_paintings_3x2']!]);

  if (theme === 'wood') {
    // 蛛网(WoodHouseBuilder.AgeRoom):W*H/16 次 2×2 斑点;Blotches(2,2) 恒过
    const count = Math.floor(r.w * r.h / 16);
    for (let c = 0; c < count; c++) {
      const x = rng.int(1, r.w - 2) + r.x;
      const y = rng.int(1, r.h - 2) + r.y;
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 2; dy++) {
          if (activeAt(st, x + dx, y + dy)) continue;
          if (rng.next() < 0.5) st.setTileSilent(x + dx, y + dy, COBWEB, 0, 0);
        }
      }
    }
    // 墙侵蚀:OnlyWalls(27);地下清墙/地表换土墙 2
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y; y < r.y + r.h; y++) {
        if (st.wall[st.idx(x, y)] !== def.wall) continue;
        if (PAINTINGS.has(st.type[st.idx(x, y)])) continue;
        if (rng.next() < 0.85 && blob(x, y) < 0.5) {
          st.setWallSilent(x, y, y > gs.worldSurface ? 0 : 2);
        }
      }
    }
    return;
  }
  if (theme === 'ice') {
    // 321 →(0.6+团簇)→ 161 →(0.8)→ 147
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y; y < r.y + r.h; y++) {
        if (st.type[st.idx(x, y)] !== def.tile || !activeAt(st, x, y)) continue;
        if (rng.next() < 0.6 && blob(x, y) < 0.6) {
          st.setTileSilent(x, y, ICE161);
          if (rng.next() < 0.8) st.setTileSilent(x, y, SNOW147);
        }
      }
    }
    // 161 行垂冰钟乳石(顶行向内/底行向下)
    for (const rowY of [r.y, r.y + r.h - 1]) {
      for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        if (activeAt(st, x, rowY) && st.type[st.idx(x, rowY)] === ICE161 && rng.next() < 0.5) {
          placeStalactiteIce(st, rng, x, rowY + 1);
        }
      }
    }
    // 墙侵蚀(无 OnlyWalls):地下清墙/地表换墙 40;跳过画
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y; y < r.y + r.h; y++) {
        if (PAINTINGS.has(st.type[st.idx(x, y)])) continue;
        if (rng.next() < 0.85 && blob(x, y) < 0.8) {
          st.setWallSilent(x, y, y > gs.worldSurface ? 0 : 40);
        }
      }
    }
    return;
  }
  if (theme === 'jungle') {
    // 158 →(0.6+团簇)→ 60 →(0.8)→ 59
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y; y < r.y + r.h; y++) {
        if (st.type[st.idx(x, y)] !== def.tile || !activeAt(st, x, y)) continue;
        if (rng.next() < 0.6 && blob(x, y) < 0.6) {
          st.setTileSilent(x, y, JUNGLE60);
          if (rng.next() < 0.8) st.setTileSilent(x, y, MUD59);
        }
      }
    }
    // 60 行垂藤(ActionVines(3, room.Height, 62):长 3..H,遇实心止)
    for (const rowY of [r.y, r.y + r.h - 1]) {
      for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        if (activeAt(st, x, rowY) && st.type[st.idx(x, rowY)] === JUNGLE60 && rng.next() < 0.5) {
          const len = rng.int(3, r.h);
          for (let i = 0; i < len && !activeAt(st, x, rowY + 1 + i); i++) {
            st.setTileSilent(x, rowY + 1 + i, VINE62, 0, 0);
          }
        }
      }
    }
    // 墙 → 64(无 OnlyWalls)
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y; y < r.y + r.h; y++) {
        if (rng.next() < 0.85 && blob(x, y) < 0.5) st.setWallSilent(x, y, 64);
      }
    }
    return;
  }
  if (theme === 'mushroom') {
    // 190 →(0.7+团簇0.5)→ 70
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y; y < r.y + r.h; y++) {
        if (st.type[st.idx(x, y)] !== def.tile || !activeAt(st, x, y)) continue;
        if (rng.next() < 0.7 && blob(x, y) < 0.5) st.setTileSilent(x, y, MUSH70);
      }
    }
    // 70 行上方发光菇 71(Offset(0,-1),IsEmpty)
    for (const rowY of [r.y, r.y + r.h - 1]) {
      for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        if (activeAt(st, x, rowY) && st.type[st.idx(x, rowY)] === MUSH70 && rng.next() < 0.6) {
          if (!activeAt(st, x, rowY - 1)) st.setTileSilent(x, rowY - 1, SHROOM71, 0, 0);
        }
      }
    }
    // 墙清空(无 OnlyWalls)
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y; y < r.y + r.h; y++) {
        if (rng.next() < 0.85 && blob(x, y) < 0.5) st.setWallSilent(x, y, 0);
      }
    }
    return;
  }
  if (theme === 'granite' || theme === 'marble') {
    // 369→368 / 357→367(0.6+团簇);钟乳石 = 原版名单外 no-op;墙 → 180/178
    const to = theme === 'granite' ? GRANITE368 : MARBLE367;
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y; y < r.y + r.h; y++) {
        if (st.type[st.idx(x, y)] !== def.tile || !activeAt(st, x, y)) continue;
        if (rng.next() < 0.6 && blob(x, y) < 0.6) st.setTileSilent(x, y, to);
      }
    }
    for (const rowY of [r.y, r.y + r.h - 1]) {
      for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        const t = st.type[st.idx(x, rowY)];
        if (activeAt(st, x, rowY) && t === to && rng.next() < 0.8) placeStalactiteNoop();
      }
    }
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y; y < r.y + r.h; y++) {
        if (rng.next() < 0.85 && blob(x, y) < 0.5) st.setWallSilent(x, y, theme === 'granite' ? 180 : 178);
      }
    }
    return;
  }
  // desert:396 →(0.8+团簇0.2)→ 397;钟乳石名单外 no-op;OnlyWalls(187) → 墙 216
  for (let x = r.x; x < r.x + r.w; x++) {
    for (let y = r.y; y < r.y + r.h; y++) {
      if (st.type[st.idx(x, y)] !== def.tile || !activeAt(st, x, y)) continue;
      if (rng.next() < 0.8 && blob(x, y) < 0.2 && rng.next() < 0.5) st.setTileSilent(x, y, HARDSAND397);
    }
  }
  for (let x = r.x; x < r.x + r.w; x++) {
    for (let y = r.y; y < r.y + r.h; y++) {
      if (st.wall[st.idx(x, y)] !== def.wall) continue;
      if (rng.next() < 0.8 && blob(x, y) < 0.5) st.setWallSilent(x, y, 216);
    }
  }
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
      placeFurniture(st, key, x, y, style);
    } else {
      // 烛台:顶行悬挂(原版 +54 点亮帧——本引擎烛台恒点亮,帧差不建模)
      const y = r.y + 1;
      placeFurniture(st, 'candelabra', x, y, rng.int(0, 5), 'top');
    }
  }
  // 装饰循环:W/8+3 件
  const decoCount = Math.floor(r.w / 8) + 3;
  for (let k = 0; k < decoCount; k++) {
    const x = rng.int(0, r.w - 4) + 1 + r.x;
    const y = r.y + r.h - 2;
    switch (rng.int(0, 3)) {
      case 0: // 小堆 185(PlaceSmallPile size1:style*18)
        if (!activeAt(st, x, y)) st.setTileSilent(x, y, SMALL_PILE, rng.int(31, 33) * 18, 0);
        break;
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
function placeStairs(st: TileStore, rooms: Rect[], def: ThemeDef): void {
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
      st.setTileSilent(sx, sy, PLATFORM, 0, 0);
      st.slope[st.idx(sx, sy)] = dir === 1 ? 1 : 2;
    }
    // 顶步上方 4×1 平台(清空+补墙+平台)
    const px = from.x + (dir === 1 ? 1 : -4);
    for (let dx = 0; dx < 4; dx++) {
      if (!st.inBounds(px + dx, from.y - 1)) continue;
      st.setTileSilent(px + dx, from.y - 1, PLATFORM, 0, 0);
      st.setWallSilent(px + dx, from.y - 1, def.wall);
    }
  }
}

/** FindSideExit(Up 搜索 + AreaOr(4,3) 任一非实心) */
function findSideExit(st: TileStore, wallX: number, wallY: number, wallH: number, isLeft: boolean): number | null {
  const startX = wallX + (isLeft ? -4 : 0);
  for (let k = 0; k < wallH - 3; k++) {
    const y = wallY + wallH - 3 - k;
    let any = false;
    for (let dx = 0; dx < 4 && !any; dx++) {
      for (let dy = 0; dy < 3 && !any; dy++) {
        if (!solidAt(st, startX + dx, y + dy)) any = true;
      }
    }
    if (any) return y;
  }
  return null;
}

function placeDoors(st: TileStore, rooms: Rect[], def: ThemeDef): void {
  for (const r of rooms) {
    // 墙列矩形 (X, Y+1, 1, H-2)
    // 门禁（原版 PlaceTile(x, exitY)→PlaceDoor(j+1)，WorldGen.cs:31946）：mount
    // （exitY-1 实心）+ 地板（exitY+3 实心）缺一即不放门只留门洞——HouseBuilder
    // 的 forced=true 仅绕过首道空格门，门分支的锚点条件仍生效
    const tryDoor = (x: number, exitY: number) => {
      for (let dy = 0; dy < 3; dy++) st.setTileSilent(x, exitY + dy, 0);
      if (solidAt(st, x, exitY - 1) && solidAt(st, x, exitY + 3)) {
        placeDoorClosed(st, x, exitY, def.door);
      }
    };
    const exitR = findSideExit(st, r.x + r.w - 1, r.y + 1, r.h - 2, false);
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
    let any = false;
    for (let dx = 0; dx < 3 && !any; dx++) {
      for (let dy = 0; dy < 5 && !any; dy++) {
        if (!solidAt(st, x + dx, startY + dy)) any = true;
      }
    }
    if (any) return x;
  }
  return null;
}

function placePlatforms(st: TileStore, rooms: Rect[]): void {
  const top = rooms[0], bot = rooms[rooms.length - 1];
  // 顶层顶壁(isUp:候选自壁上 5 格起)
  const exitT = findVerticalExit(st, top.x + 2, top.y, top.w - 4, true);
  if (exitT !== null) {
    for (let dx = 0; dx < 3; dx++) st.setTileSilent(exitT + dx, top.y, PLATFORM, 0, 0);
  }
  if (rooms.length > 1) {
    const exitB = findVerticalExit(st, bot.x + 2, bot.y + bot.h - 1, bot.w - 4, false);
    if (exitB !== null) {
      for (let dx = 0; dx < 3; dx++) st.setTileSilent(exitB + dx, bot.y + bot.h - 1, PLATFORM, 0, 0);
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

// ---------- 宝箱四级联(PlaceChests) ----------
function placeChests(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink, rooms: Rect[], def: ThemeDef, theme: Theme): void {
  const tryAt = (x: number, y: number): boolean => {
    const underground = y > gs.worldSurface;
    const iceRoll = [670, 724, 950, 1319, 987, 1579][rng.int(0, 5)];
    return placeBuriedChest(st, rng, gs, chests, x, y, {
      style: underground ? def.chestStyle : 0,
      tile: underground && def.chestTile2 ? CHEST2 : undefined,
      loot: theme === 'ice' ? iceRoll : undefined,
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
/** 地下小屋 pass(UndergroundHousesAndBuriedChests 的 CaveHouse 段,cs:17153-17178
 *  + 沙漠追加段 cs:17193-17219) */
export function runCaveHousesPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const { w, h } = st;
  const count = Math.round(rng.int(35, 40) * (w * h) / 5040000);
  // 第 4 个 WorldGenRange：AdditionalDesertHouseCount（2-2 × WorldArea，
  // Configuration.json）——GetRandom 恒消费一次 Next（cs:17088）
  const desertHouses = rng.int(2, 2);
  let bastCount = 0;        // GenVars.extraBastStatueCount(≤2)
  let extractCount = 0;     // HouseBuilderContext.ExtractinatorCount
  const extractMax = rng.int(2, 4);
  let sharpCount = 0;       // context.SharpenerCount
  const sharpMax = rng.int(2, 4);

  /** 单座小屋放置（HouseBuilder.Place 原序），返回是否成功 */
  const placeHouse = (ox: number, oy: number, oceanGate: boolean): boolean => {
    if (oceanGate && (ox < gs.beachDistance || ox > w - gs.beachDistance)) return false; // oceanDepths 回避
    const rooms = createRooms(st, rng, ox, oy);
    if (!rooms.length) return false;
    // 位置合法(InWorld 10 边距 / 底部 < h-220)+ 房间互不重叠
    let ok = true;
    for (const r of rooms) {
      if (r.x < 10 || r.y < 10 || r.x + r.w > w - 10 || r.y + r.h > h - 220) ok = false;
    }
    for (let a = 0; a < rooms.length && ok; a++) {
      for (let b = a + 1; b < rooms.length && ok; b++) {
        const A = rooms[a], B = rooms[b];
        if (A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h) ok = false;
      }
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
          st.setWallSilent(x, y, def.wall);
        }
      }
    }
    // 2-4) 楼梯 / 门 / 平台
    placeStairs(st, rooms, def);
    placeDoors(st, rooms, def);
    placePlatforms(st, rooms);
    // 5) 支撑梁
    placeSupportBeams(st, rooms, def);
    // 6) 沙漠 Bast 石碑(优先件,≤2)
    if (theme === 'desert' && bastCount < 2) {
      const r = rooms[0];
      if (placeFurniture(st, 'v_506_bast_statue', r.x + 1 + rng.int(0, Math.max(1, r.w - 3)), r.y + r.h - 2)) bastCount++;
    }
    // 7) FillRooms:画/烛台 + 装饰(每房)
    for (const r of rooms) fillRooms(st, rng, r, def, theme);
    // 8) AgeRoom:七主题蚀变
    const seed = rng.int(0, 1 << 30);
    for (const r of rooms) ageRoom(st, rng, gs, r, theme, def, seed);
    // 9) 宝箱(ChestChance=1.0,四级联)
    placeChests(st, rng, gs, chests, rooms, def, theme);
    // 10) 主题专属件:丛林磨刀站 / 沙漠提炼机
    if (theme === 'jungle' && sharpCount < sharpMax) {
      const r = rooms[0];
      if (placeFurniture(st, 'v_377_sharpening_station', r.x + 1 + rng.int(0, Math.max(1, r.w - 3)), r.y + r.h - 2)) sharpCount++;
    }
    if (theme === 'desert' && extractCount < extractMax) {
      const r = rooms[rooms.length - 1];
      if (placeFurniture(st, 'v_219_extractinator', r.x + 1 + rng.int(0, Math.max(1, r.w - 3)), r.y + r.h - 2)) extractCount++;
    }
    return true;
  };

  for (let n = 0; n < count; n++) {
    const ox = rng.int(80, w - 81);
    const oy = rng.int(Math.ceil(gs.worldSurfaceHigh + 20), h - 231);
    placeHouse(ox, oy, true);
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
        if (!placeHouse(hx, hy, false)) { budget--; continue; }
        l++;
      }
    }
  }
}
