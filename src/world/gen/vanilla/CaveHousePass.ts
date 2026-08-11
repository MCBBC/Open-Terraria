// 原版 CaveHouseBiome(HouseUtils.cs + HouseBuilder.cs + 七主题 *HouseBuilder.cs)1:1 移植。
// 数量 = CaveHouseCount 35-40 × WorldArea/5040000(Configuration.json);
// 房间生成(HouseUtils.CreateRooms/FindRoom):1 主房 + 概率上下副房(15-30×8-12);
// 主题评分(GetHouseType):wood=tile0+1 / jungle=59+60×10 / mushroom=59+70×10 /
//   ice=147+161 / desert=397+396+53 / granite=368 / marble=367;
// 七主题参数(Tile/Wall/Door/ChestStyle,各 Builder 构造);
// 每屋 1 箱(ChestChance 全 1.0):冰屋走冰箱旗标池,其余走深度分支通用池;
// 沙漠屋 ≤2 Bast 石碑 + 提炼机 2-4,丛林屋磨刀站 2-4(HouseBuilderContext)。
// 简化项(与原版差异,后续补):梁(AgeRoom 侵蚀/平台楼梯主题样式/画/年代感)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { placeBuriedChest, type ChestSink } from './BuriedChestsPass';
import { placeDoorClosed } from '../../Door';

type Rect = { x: number; y: number; w: number; h: number };

// ---------- 七主题参数表(各 *HouseBuilder.cs 构造) ----------
type Theme = 'wood' | 'ice' | 'jungle' | 'desert' | 'granite' | 'marble' | 'mushroom';
interface ThemeDef {
  tile: number; wall: number; door: number; chestStyle: number;
  chestTile2?: boolean; // UsesContainers2 → tile 467
}
function sheetTile(sheet: number): number {
  for (let id = 0; id < TILE_DEFS.length; id++) {
    const d = TILE_DEFS[id];
    if (d && d.vanilla?.sheet === sheet && d.key.startsWith('v_')) return id;
  }
  return -1;
}
const THEMES: Record<Theme, ThemeDef> = {
  wood: { tile: T.WOOD, wall: 27, door: 0, chestStyle: 1 },
  ice: { tile: TILE_BY_KEY['v_321_boreal_wood']!, wall: 149, door: 30, chestStyle: 11 },
  jungle: { tile: TILE_BY_KEY['v_158_rich_mahogany']!, wall: 42, door: 2, chestStyle: 8 },
  desert: { tile: TILE_BY_KEY['sandstone']!, wall: 187, door: 43, chestStyle: 10, chestTile2: true },
  granite: { tile: TILE_BY_KEY['v_369_smooth_granite_block']!, wall: 181, door: 34, chestStyle: 50 },
  marble: { tile: TILE_BY_KEY['v_357_smooth_marble_block']!, wall: 179, door: 35, chestStyle: 51 },
  mushroom: { tile: TILE_BY_KEY['v_190_glowing_mushroom_block']!, wall: 74, door: 6, chestStyle: 32 },
};

const PLATFORM = TILE_BY_KEY['platform']!;
const SMALL_PILE = TILE_BY_KEY['v_185_small_decos']!;
const DECO186 = TILE_BY_KEY['v_186_decos_3x2']!;
const CHEST2 = TILE_BY_KEY['v_467_chests_group_2']!;
// 评分用 tile(vanilla sheet id)
const SC0 = TILE_BY_KEY['stone']!;   // 0 石头
const SC1 = T.DIRT;                  // 1 泥土
const SC59 = TILE_BY_KEY['mud']!;    // 59 泥
const SC60 = TILE_BY_KEY['v_60_jungle_grass_block']!;
const SC70 = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const SC147 = TILE_BY_KEY['snow']!;  // 147 雪
const SC161 = TILE_BY_KEY['ice']!;   // 161 冰
const SC53 = TILE_BY_KEY['sand']!;   // 53 沙
const SC396 = TILE_BY_KEY['sandstone']!;
const SC397 = TILE_BY_KEY['hardened_sand']!;
const SC368 = TILE_BY_KEY['v_368_granite_block']!;
const SC367 = TILE_BY_KEY['v_367_marble_block']!;

const solidAt = (st: TileStore, x: number, y: number) =>
  st.inBounds(x, y) && !!st.flags[st.idx(x, y)] && !!(TILE_DEFS[st.type[st.idx(x, y)]]?.solid);

/** HouseUtils.FindRoom:左右 ±25 / 上 ±10 扫描,钳 15-30×8-12 */
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

/** 房间实心率(CreateRooms 用:副房取舍门禁 pct+0.2) */
function solidPct(st: TileStore, r: Rect): number {
  let n = 0;
  for (let x = r.x; x < r.x + r.w; x++) {
    for (let y = r.y; y < r.y + r.h; y++) {
      if (solidAt(st, x, y)) n++;
    }
  }
  return n / (r.w * r.h);
}

function createRooms(st: TileStore, rng: RNG, ox: number, oy: number): Rect[] {
  // 向下 ≤200 找实心(HouseUtils.CreateRooms)
  let py = oy;
  for (let i = 0; i < 200 && !solidAt(st, ox, py); i++) py++;
  if (!solidAt(st, ox, py) || py === oy) return [];
  const main = findRoom(st, ox, py);
  const above = findRoom(st, main.x + (main.w >> 1), main.y + 1);
  let below = findRoom(st, main.x + (main.w >> 1), main.y + main.h + 10);
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

/** GetHouseType:房间 ±10 环境评分 */
function getHouseType(st: TileStore, rooms: Rect[]): Theme {
  const count = (t: number) => {
    let n = 0;
    for (const r of rooms) {
      for (let x = r.x - 10; x < r.x + r.w + 10; x++) {
        for (let y = r.y - 10; y < r.y + r.h + 10; y++) {
          if (st.inBounds(x, y) && st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] === t) n++;
        }
      }
    }
    return n;
  };
  const scores: Array<[Theme, number]> = [
    ['wood', count(SC0) + count(SC1)],
    ['jungle', count(SC59) + count(SC60) * 10],
    ['mushroom', count(SC59) + count(SC70) * 10],
    ['ice', count(SC147) + count(SC161)],
    ['desert', count(SC397) + count(SC396) + count(SC53)],
    ['granite', count(SC368)],
    ['marble', count(SC367)],
  ];
  let best: [Theme, number] = scores[0];
  for (let i = 1; i < scores.length; i++) if (best[1] < scores[i][1]) best = scores[i];
  return best[0];
}

/** 简易家具放置器(帧步长 = fw*18/style) */
function placeFurniture(st: TileStore, key: string, x: number, y: number, style = 0): boolean {
  const t = TILE_BY_KEY[key];
  if (t === undefined) return false;
  const d = TILE_DEFS[t];
  const fw = d.vanilla?.fw ?? 1;
  const fh = d.vanilla?.fh ?? 1;
  const w = d.w ?? fw, h = d.h ?? fh;
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      if (!st.inBounds(x + dx, y - (h - 1) + dy)) return false;
      if (st.flags[st.idx(x + dx, y - (h - 1) + dy)]) return false;
    }
  }
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      st.setTileSilent(x + dx, y - (h - 1) + dy, t, style * fw * 18 + dx * 18, dy * 18);
    }
  }
  return true;
}

/** 地下小屋 pass(UndergroundHousesAndBuriedChests 的 CaveHouse 段,cs:17153-17178) */
export function runCaveHousesPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const { w, h } = st;
  const count = Math.round(rng.int(35, 40) * (w * h) / 5040000);
  let bastCount = 0;        // GenVars.extraBastStatueCount(≤2)
  let extractCount = 0;     // HouseBuilderContext.ExtractinatorCount
  let extractMax = rng.int(2, 4);
  let sharpCount = 0;       // context.SharpenerCount
  let sharpMax = rng.int(2, 4);

  for (let n = 0; n < count; n++) {
    const ox = rng.int(80, w - 81);
    const oy = rng.int(Math.ceil(gs.worldSurfaceHigh + 20), h - 231);
    if (ox < gs.beachDistance || ox > w - gs.beachDistance) continue; // oceanDepths 回避
    const rooms = createRooms(st, rng, ox, oy);
    if (!rooms.length) continue;
    // 位置合法(InWorld 10 边距 / 底部 < h-220)
    let ok = true;
    for (const r of rooms) {
      if (r.x < 10 || r.y < 10 || r.x + r.w > w - 10 || r.y + r.h > h - 220) ok = false;
    }
    if (!ok) continue;
    // 房间互不重叠
    for (let a = 0; a < rooms.length && ok; a++) {
      for (let b = a + 1; b < rooms.length && ok; b++) {
        const A = rooms[a], B = rooms[b];
        if (A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h) ok = false;
      }
    }
    if (!ok) continue;
    const theme = getHouseType(st, rooms);
    const def = THEMES[theme];
    if (def.tile < 0) continue;
    // 岩浆回避(granite 主题豁免,HouseUtils.AreRoomsValid)
    if (theme !== 'granite') {
      for (const r of rooms) {
        for (let x = r.x - 2; x < r.x + r.w + 2; x++) {
          for (let y = r.y - 2; y < r.y + r.h + 2; y++) {
            if (st.inBounds(x, y) && st.liquid[st.idx(x, y)] > 0 && st.liquidType[st.idx(x, y)] === 2) ok = false;
          }
        }
      }
      if (!ok) continue;
    }

    // ---- 建造(HouseBuilder.Place) ----
    // PlaceEmptyRooms:外壳 + 内腔墙
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
    // 门:左右壁外侧找 3×3 空区(FindSideExit AreaOr(4,3) 近似),凿壁 1×3 后放门
    for (const r of rooms) {
      for (const leftSide of [true, false]) {
        const side = leftSide ? r.x : r.x + r.w - 1;
        for (let dy = 1; dy <= r.h - 4; dy++) {
          const y = r.y + dy;
          let clear = true;
          for (let k = 0; k < 3 && clear; k++) {
            for (let m = 1; m <= 3 && clear; m++) {
              const xx = leftSide ? side - m : side + m;
              if (!st.inBounds(xx, y + k) || st.flags[st.idx(xx, y + k)]) clear = false;
            }
          }
          if (!clear) continue;
          for (let k = 0; k < 3; k++) st.setTileSilent(side, y + k, 0);
          placeDoorClosed(st, side, y, def.door);
          break;
        }
      }
    }
    // 顶/底垂直出口:3 宽平台(CreatePlatformsList 简化——顶层顶壁/底层底壁各一)
    {
      const top = rooms[0], bot = rooms[rooms.length - 1];
      const putPlat = (r: Rect, y: number) => {
        const px = r.x + 2 + rng.int(0, Math.max(1, r.w - 5));
        for (let dx = 0; dx < 3; dx++) {
          if (st.inBounds(px + dx, y)) st.setTileSilent(px + dx, y, PLATFORM, 0, 0);
        }
      };
      putPlat(top, top.y);
      if (rooms.length > 1) putPlat(bot, bot.y + bot.h - 1);
      // 楼梯:相邻房间对角平台链(CreateStairsList 简化)
      for (let i = 1; i < rooms.length; i++) {
        const upper = rooms[i - 1], lower = rooms[i];
        const steps = Math.max(1, lower.y - (upper.y + upper.h) + 1);
        for (let s = 0; s < steps; s++) {
          const sx = lower.x + 1 + ((s * 3) % Math.max(1, lower.w - 4));
          const sy = lower.y + 1 + s;
          if (st.inBounds(sx, sy)) st.setTileSilent(sx, sy, PLATFORM, 0, 0);
        }
      }
    }
    // FillRooms:每房 width/8+3 件陈设
    for (const r of rooms) {
      const n = Math.floor(r.w / 8) + 3;
      for (let k = 0; k < n; k++) {
        const fx = r.x + 1 + rng.int(0, Math.max(1, r.w - 3));
        const fy = r.y + r.h - 2; // 内腔地面行
        switch (rng.int(0, 7)) {
          case 0: placeFurniture(st, 'table', fx, fy); break;
          case 1: placeFurniture(st, 'workbench', fx, fy); break;
          case 2: placeFurniture(st, 'piano', fx, fy); break;
          case 3: placeFurniture(st, 'bookcase', fx, fy); break;
          case 4: if (rng.next() < 0.3) placeFurniture(st, 'bathtub', fx, fy); break;
          case 5: if (SMALL_PILE >= 0 && !st.flags[st.idx(fx, fy)]) st.setTileSilent(fx, fy, SMALL_PILE, rng.int(31, 33) * 18, 0); break;
          case 6: if (DECO186 >= 0) placeFurniture(st, 'v_186_decos_3x2', fx, fy, rng.int(22, 25)); break;
          case 7: placeFurniture(st, 'anvil', fx, fy); break;
        }
      }
    }
    // 主题专属(PlaceBiomeSpecificPriorityTool/Tool)
    const floorY = (r: Rect) => r.y + r.h - 2;
    if (theme === 'desert' && bastCount < 2) {
      const r = rooms[0];
      if (placeFurniture(st, 'v_506_bast_statue', r.x + 1 + rng.int(0, Math.max(1, r.w - 3)), floorY(r))) bastCount++;
    }
    if (theme === 'desert' && extractCount < extractMax) {
      const r = rooms[rooms.length - 1];
      if (placeFurniture(st, 'v_219_extractinator', r.x + 1 + rng.int(0, Math.max(1, r.w - 3)), floorY(r))) extractCount++;
    }
    if (theme === 'jungle' && sharpCount < sharpMax) {
      const r = rooms[0];
      if (placeFurniture(st, 'v_377_sharpening_station', r.x + 1 + rng.int(0, Math.max(1, r.w - 3)), floorY(r))) sharpCount++;
    }
    // 宝箱(PlaceChests,ChestChance=1.0):地面行向下落;
    // 冰屋 style11 → 冰箱旗标池;沙漠屋 tile467 style10;其余主题样式 + 深度分支通用池
    {
      const r = rooms[rooms.length - 1];
      const chestY = r.y + r.h - 1;
      const chestX = r.x + 1 + rng.int(0, Math.max(1, r.w - 4));
      const iceRoll = [670, 724, 950, 1319, 987, 1579][rng.int(0, 5)];
      placeBuriedChest(st, rng, gs, chests, chestX, chestY, {
        style: def.chestStyle,
        tile: def.chestTile2 ? CHEST2 : undefined,
        loot: theme === 'ice' ? iceRoll : undefined,
        flags: theme === 'ice' ? { ice: true } : {},
      });
    }
  }
}
