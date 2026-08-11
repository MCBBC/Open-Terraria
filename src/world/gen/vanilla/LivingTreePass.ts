// 原版 "Living Trees"(WorldGen.cs:15551-15791)+ "Living Tree Walls"(:15792-15824)
// 1:1 移植。核心树形 = GrowLivingTree(:28123-28759)：
//   主干锥形收窄循环(:28271-28345,左右交替向内吃 1 格) → 侧枝斜上(:28350-28420,
//   步进 ±1、10% 纵向抖动、间隔 2-4 格长枝) → 顶部收尖+枝头(:28421-28509) →
//   根系下扎+横向根走(:28510-28600,横向根步进带惯性) → 叶簇(:28601-28720,
//   曼哈顿椭圆 / 圆形两种、LargePiles2 187+SmallPiles 185 地被) →
//   树干贯通竖井 GrowLivingTree_MakePassage(:29019-29290)（宽干 flag 才走）。
// 通道房 GrowLivingTreePassageRoom(:29306-29510)：活木腔+生命木门 2 扇+椅子/
// 生命木织机 304+活木宝箱(style12,主件 832 生命木魔棒/1:3 4281 雀杖)。
// 横向迷宫隧道 GrowLivingTree_HorizontalTunnel(:28783-29017)。
// 排除区(:15621-15651)：50×50 内地牢砖 41/43/44/481-483 一票否决、云族
// 189/196/460/717-719 一票否决、与 mCaveX ±50 拒绝（cs:15653-15663）。
// 秘密种子分支（extraLivingTrees/skyblock/errorWorld/dualDungeons/shimmer 等）
// 不在常规生成路径,按约定不移植,行号保留在注释中。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { placeDoorClosed } from '../../Door';
import { furnitureStyleBase } from '../../FurnitureStyle';
import { placeBuriedChest, type ChestSink } from './BuriedChestsPass';

const LIVING_WOOD = TILE_BY_KEY['v_191_living_wood_block']!;
const LEAF = TILE_BY_KEY['v_192_living_leaf_block']!;
const PLATFORM = TILE_BY_KEY['platform']!;
const CHAIR = TILE_BY_KEY['chair']!;
const LOOM = TILE_BY_KEY['v_304_living_loom']!;
const PILE2 = TILE_BY_KEY['v_187_decos_3x2_group_2']!;
const SMALL_PILE = TILE_BY_KEY['v_185_small_decos']!;

/** 活木墙（w244_livingwoodunsafe；原版墙 id 直存） */
const WALL_LIVING_WOOD = 244;
/** Main.wallDungeon（cs:10777 起）= 地牢墙族 */
const DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
/** TileID.Sets.Ore（TileID.cs:399）——GrowLivingTree 地面类型门禁用 */
const ORE_SHEETS = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);
/** TileID.Sets.Clouds（TileID.cs:197）——canPlaceLeaves 排除 */
const CLOUD_SHEETS = new Set([189, 196, 460, 717, 718, 719]);
/** LivingTrees 选址一票否决：地牢砖（cs:15627-15631） */
const EXCLUDE_BRICK = new Set([41, 43, 44, 481, 482, 483]);

// ---------- 读取辅助（生成期 wire 全 0，active = flags bit0） ----------
function sheetAt(st: TileStore, x: number, y: number): number {
  if (!st.inBounds(x, y)) return -1;
  return TILE_DEFS[st.type[st.idx(x, y)]]?.vanilla?.sheet ?? -1;
}
function typeAt(st: TileStore, x: number, y: number): number {
  return st.inBounds(x, y) ? st.type[st.idx(x, y)] : 0;
}
function activeAt(st: TileStore, x: number, y: number): boolean {
  return st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
}
function wallAt(st: TileStore, x: number, y: number): number {
  return st.inBounds(x, y) ? st.wall[st.idx(x, y)] : 0;
}
function solidAt(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  return st.flags[i] !== 0 && !!TILE_DEFS[st.type[i]]?.solid;
}
function isDungeonWall(w: number): boolean { return DUNGEON_WALLS.has(w); }
function inWorld(st: TileStore, x: number, y: number, slack: number): boolean {
  return x >= slack && y >= slack && x < st.w - slack && y < st.h - slack;
}

/** WorldGen.IsTileNearby（cs:8828）:distance 方框内是否存在该 type */
function isTileNearby(st: TileStore, x: number, y: number, type: number, distance: number): boolean {
  for (let i = x - distance; i <= x + distance; i++) {
    for (let j = y - distance; j <= y + distance; j++) {
      if (st.inBounds(i, j) && st.flags[st.idx(i, j)] !== 0 && st.type[st.idx(i, j)] === type) return true;
    }
  }
  return false;
}

/** 活木写入（cs 中 `type=191; active(true); halfBrick(false)` 三连） */
function setLivingWood(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.type[i] = LIVING_WOOD;
  st.flags[i] = 1;
  st.half[i] = 0;
}
function setLeaf(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.type[i] = LEAF;
  st.flags[i] = 1;
  st.half[i] = 0;
}
function deactivate(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.type[i] = 0; st.flags[i] = 0; st.half[i] = 0; st.slope[i] = 0;
}

/** WorldGen.PlaceTile(x, y, 19, …, style)（cs:28312/28741/29063/29103）：平台 1×1，style*18 横排 */
function placePlatform(st: TileStore, x: number, y: number, style: number): void {
  if (!st.inBounds(x, y)) return;
  st.setTileSilent(x, y, PLATFORM, style * 18, 0);
}
/** PlaceTile(x, Y, 10, …, style)（cs:29430/29466/28972/29100）：门锚=底行 Y（占 Y-2..Y），
 *  本仓库 placeDoorClosed 锚=顶行 → Y-2 */
function placeDoor(st: TileStore, x: number, yBottom: number, style: number): void {
  placeDoorClosed(st, x, yBottom - 2, style);
}
/** 底锚 framed 家具（PlaceTile 锚=底行；本仓库 topY = y-(h-1)） */
function placeFurniture(st: TileStore, tile: number, x: number, yBottom: number, style: number): boolean {
  const d = TILE_DEFS[tile];
  if (!d || !st.inBounds(x, yBottom)) return false;
  const fw = d.vanilla?.fw ?? 1;
  const w = d.w ?? fw, h = d.h ?? (d.vanilla?.fh ?? 1);
  const topY = yBottom - (h - 1);
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      if (!st.inBounds(x + dx, topY + dy) || st.flags[st.idx(x + dx, topY + dy)] !== 0) return false;
    }
  }
  const sheet = d.vanilla?.sheet ?? -1;
  const [bx, by] = furnitureStyleBase(sheet, style, fw);
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      st.setTileSilent(x + dx, topY + dy, tile, bx + dx * 18, by + dy * 18);
    }
  }
  return true;
}

/** WorldGen.PlaceSmallPile（cs:46831）：size0 单格 / size1 2×1，frameY=size*18 */
function placeSmallPile(st: TileStore, x: number, y: number, pileStyle: number, pileSize: number): boolean {
  if (pileSize === 1) {
    // cs:46853-46875:下方两格实心 + 上方两格空
    if (!solidAt(st, x, y + 1) || !solidAt(st, x + 1, y + 1)) return false;
    if (activeAt(st, x, y) || activeAt(st, x + 1, y)) return false;
    st.setTileSilent(x, y, SMALL_PILE, pileStyle * 36, 18);
    st.setTileSilent(x + 1, y, SMALL_PILE, pileStyle * 36 + 18, 18);
    return true;
  }
  if (solidAt(st, x, y + 1) && !activeAt(st, x, y)) {
    st.setTileSilent(x, y, SMALL_PILE, pileStyle * 18, 0);
    return true;
  }
  return false;
}

// ---------- GrowLivingTree_CanPlaceLeaves（cs:28761-28782） ----------
function canPlaceLeaves(st: TileStore, x: number, y: number): boolean {
  if (!inWorld(st, x, y, 5)) return false;
  const wl = wallAt(st, x, y);
  if (wl === WALL_LIVING_WOOD || wl === 78 || isDungeonWall(wl)) return false;
  if (!activeAt(st, x, y)) return true;
  const t = typeAt(st, x, y);
  if (t === LIVING_WOOD) return false;
  if (CLOUD_SHEETS.has(TILE_DEFS[t]?.vanilla?.sheet ?? -1)) return false;
  return true;
}

// ---------- GrowLivingTreePassageRoom（cs:29306-29510） ----------
function growLivingTreePassageRoom(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink, minl: number, minr: number, Y: number,
): void {
  const worldSurface = gs.worldSurface;
  let num = rng.int(0, 1);
  if (num === 0) num = -1;                                    // cs:29307
  let num2 = Y - 2;
  let num3 = Math.floor((minl + minr) / 2);
  if (num < 0) num3--;
  if (num > 0) num3++;
  const num4 = rng.int(15, 29);
  let num5 = num3 + num4;
  if (num < 0) { num5 = num3; num3 -= num4; }
  // cs:29321-29330:候选矩形碰到露天（无墙空气+地表以上）直接放弃
  for (let i = num3; i < num5; i++) {
    for (let j = Y - 20; j < Y + 10; j++) {
      if (wallAt(st, i, j) === 0 && !activeAt(st, i, j) && j < worldSurface) return;
    }
  }
  // 第一腔（cs:29333-29360）：3×(Y+2-(Y-4)) 壳 + 内腔空心
  for (let k = num3; k <= num5; k++) {
    for (let l = num2 - 2; l <= Y + 2; l++) {
      // cs:29337-29344：四邻粘土(40)转泥土——原版只改 type=0(dirt)，保持 active
      if (sheetAt(st, k - 1, l) === 40) st.type[st.idx(k - 1, l)] = T.DIRT;
      if (sheetAt(st, k + 1, l) === 40) st.type[st.idx(k + 1, l)] = T.DIRT;
      if (sheetAt(st, k, l - 1) === 40) st.type[st.idx(k, l - 1)] = T.DIRT;
      if (sheetAt(st, k, l + 1) === 40) st.type[st.idx(k, l + 1)] = T.DIRT;
      // cs:29346：平台(19)格让位,其余实心化
      if (wallAt(st, k, l) !== WALL_LIVING_WOOD && sheetAt(st, k, l) !== 19) setLivingWood(st, k, l);
      if (l >= num2 && l <= Y) {
        const i = st.idx(k, l);
        st.liquid[i] = 0; st.liquidType[i] = 0;
        st.wall[i] = WALL_LIVING_WOOD;
        deactivate(st, k, l);
      }
    }
  }
  placeDoor(st, Math.floor((minl + minr) / 2) + 3 * num, Y, 7);   // cs:29363
  const num6 = rng.int(5, 8);
  const num7 = rng.int(4, 5);
  if (num < 0) { num5 = num3 + num6; num3 -= num6; }
  else { num3 = num5 - num6; num5 += num6; }
  num2 = Y - num7;
  // 第二腔（cs:29369-29395）
  for (let m = num3 - 2; m <= num5 + 2; m++) {
    for (let n = num2 - 2; n <= Y + 2; n++) {
      if (wallAt(st, m, n) !== WALL_LIVING_WOOD && sheetAt(st, m, n) !== 19) setLivingWood(st, m, n);
      if (n >= num2 && n <= Y && m >= num3 && m <= num5) {
        const i = st.idx(m, n);
        st.liquid[i] = 0; st.liquidType[i] = 0;
        st.wall[i] = WALL_LIVING_WOOD;
        deactivate(st, m, n);
      }
    }
  }
  placeDoor(st, num < 0 ? num5 + 2 : num3 - 2, Y, 7);            // cs:29396
  let num8 = num < 0 ? num3 : num5;
  // 椅子（tile 15 style 5，1/2 概率）——vanilla frameX += 18 是面向翻转（num 方向）
  let num9 = 2;
  if (rng.int(0, 1) === 0) {
    num9 += 2;
    if (placeFurniture(st, CHAIR, num8, Y, 5) && num < 0) {
      for (let dy = -1; dy <= 0; dy++) {
        const i = st.idx(num8, Y + dy);
        st.frameX[i] += 18;                                       // cs:29404
      }
    }
  }
  num8 = num < 0 ? num3 + 2 : num5 - 2;
  placeFurniture(st, LOOM, num8, Y, 0);                           // 生命木织机 304（cs:29409）
  num8 = num < 0 ? num3 + 4 : num5 - 4;
  if (rng.int(0, num9 - 1) === 0) {
    if (placeFurniture(st, CHAIR, num8, Y, 5) && num > 0) {
      for (let dy = -1; dy <= 0; dy++) {
        const i = st.idx(num8, Y + dy);
        st.frameX[i] += 18;                                       // cs:29415
      }
    }
  }
  // 宝箱（cs:29418-29507）：主件 832 生命木魔棒 / 1:3 4281 雀杖；
  // AddBuriedChest(..., style 12) 在墙非 244 处降级木箱无主件（cs:36171-36186）。
  // loot 走 vi_ key：rollChestLoot 的 vid() 查 VANILLA_ITEM_KEY_BY_ID（vanilla.json
  // 全量 6059 条,与 vanilla-itemstats.json 盔甲/配饰表无关）,832/4281 裸 id 同样
  // 可入箱——key 路径只影响取用哪个注册键（见 BuriedChestsPass 尾段主件去重注释）
  num8 = num < 0 ? num3 + 8 : num5 - 7;
  const mainItemKey = rng.int(0, 2) === 0 ? 'vi_4281_finch_staff' : 'vi_832_living_wood_wand';
  // 落地行：房内 Y 行空心、Y+1 是活木地板（同 AddBuriedChest 的 i-1/num7-1 墙判定取同排）
  let gy = Y;
  while (gy < st.h - 1 && !activeAt(st, num8, gy)) gy++;
  const wallOk = wallAt(st, num8, gy - 1) === WALL_LIVING_WOOD;
  if (wallOk) {
    placeBuriedChest(st, rng, gs, chests, num8, Y, { style: 12, loot: mainItemKey });
  } else {
    placeBuriedChest(st, rng, gs, chests, num8, Y, { style: 0 });
  }
}

// ---------- GrowLivingTree_HorizontalTunnel（cs:28783-29017） ----------
function growLivingTreeHorizontalTunnel(st: TileStore, rng: RNG, gs: GenState, i: number, j: number): boolean {
  const worldSurface = gs.worldSurface;
  let left = i, right = i;
  const num3 = 80;                                               // cs:28786
  let num4 = 1;
  if (rng.int(0, 1) === 0) num4 *= -1;                           // cs:28793
  for (let k = 0; k < 2; k++) {
    // ---- 向右探测（cs:28796-28860） ----
    if (right === i && num4 > 0) {
      for (let l = i + 5; l < i + num3; l++) {
        if (!inWorld(st, l, j, 10)) return false;
        if (typeAt(st, l, j) === 48) break;                      // 荆棘阻挡
        if (typeAt(st, l, j) === LIVING_WOOD) {
          // cs:28827-28837：三行墙全 244（=邻树树干内腔）→ 从 l+2 接管
          let hit = true;
          for (let n = j - 2; n <= j; n++) if (wallAt(st, l + 2, n) !== WALL_LIVING_WOOD) hit = false;
          if (hit) { k = 2; right = l + 2; }
          break;
        }
        if (activeAt(st, l, j)) continue;
        let flag2 = true;
        for (let n5 = j - 2; n5 <= j; n5++) {
          if (j < worldSurface + 3
            && (wallAt(st, l + 1, n5) === 0 || wallAt(st, l + 2, n5) === 0 || wallAt(st, l + 3, n5) === 0)) {
            return false;                                        // cs:28851
          }
          if (activeAt(st, l, n5) || activeAt(st, l + 1, n5) || activeAt(st, l + 2, n5)) flag2 = false;
        }
        if (flag2) { k = 2; right = l; break; }
      }
    }
    // ---- 向左探测（cs:28861-28916） ----
    if (left === i && num4 < 0) {
      for (let l = i - 5; l > i - num3; l--) {
        if (!inWorld(st, l, j, 10)) return false;
        if (typeAt(st, l, j) === 48) break;
        if (typeAt(st, l, j) === LIVING_WOOD) {
          let hit = true;
          for (let n8 = j - 2; n8 <= j; n8++) if (wallAt(st, l - 3, n8) !== WALL_LIVING_WOOD) hit = false;
          if (hit) { k = 2; left = l - 2; }
          break;
        }
        if (!activeAt(st, l, j)) {
          let flag3 = true;
          for (let n9 = j - 2; n9 <= j; n9++) {
            if (j < worldSurface + 3
              && (wallAt(st, l - 1, n9) === 0 || wallAt(st, l - 2, n9) === 0 || wallAt(st, l - 3, n9) === 0)) {
              return false;
            }
            if (activeAt(st, l, n9) || activeAt(st, l - 1, n9) || activeAt(st, l - 2, n9)) flag3 = false;
          }
          if (flag3) { k = 2; left = l; break; }
        }
      }
    }
    num4 *= -1;
    if (k >= 2) break;
  }
  if (left === right) return false;                              // cs:28919
  // ---- 挖通（cs:28921-29015） ----
  let flag4 = false, flag5 = false;
  for (let n10 = j - 5; n10 <= j + 1; n10++) {
    for (let n11 = left; n11 <= right; n11++) {
      let n12 = 2;
      if (Math.abs(n11 - right) > 3 && Math.abs(n11 - left) > 3) n12 = 4;
      const topSheet = TILE_DEFS[typeAt(st, n11, n10)]?.vanilla?.sheet ?? -1;
      const is19 = topSheet === 19;
      if (wallAt(st, n11, n10) !== WALL_LIVING_WOOD && !is19 && topSheet !== 15 && topSheet !== 304 && topSheet !== 21 && topSheet !== 10) {
        const wl = wallAt(st, n11, n10);
        if (!isDungeonWall(wl)
          && (!activeAt(st, n11, n10)
            || (!isDungeonWall(wallAt(st, n11, n10 - 1)) && !isDungeonWall(wallAt(st, n11, n10 + 1))))
          && (activeAt(st, n11, n10) || wl !== 34)) {
          setLivingWood(st, n11, n10);
        }
        if (sheetAt(st, n11, n10 - 1) === 40) st.type[st.idx(n11, n10 - 1)] = T.DIRT;  // cs:28946 粘土→泥土
        if (sheetAt(st, n11, n10 + 1) === 40) st.type[st.idx(n11, n10 + 1)] = T.DIRT;
      }
      const tHere = sheetAt(st, n11, n10);
      const tAbove = sheetAt(st, n11, n10 - 1);
      const tBelow = sheetAt(st, n11, n10 + 1);
      const passable = tHere !== 19 && tHere !== 15 && tHere !== 304 && tHere !== 21 && tHere !== 10
        && tAbove !== 15 && tAbove !== 304 && tAbove !== 21 && tAbove !== 10 && tBelow !== 10;
      if (n10 >= j - n12 && n10 <= j && passable) {
        if (!isDungeonWall(wallAt(st, n11, n10))) st.wall[st.idx(n11, n10)] = WALL_LIVING_WOOD;
        const idx = st.idx(n11, n10);
        st.liquid[idx] = 0; st.liquidType[idx] = 0;
        deactivate(st, n11, n10);
      }
      if (n10 !== j) continue;
      let style = 7;
      if (isDungeonWall(wallAt(st, n11, n10)) || isDungeonWall(wallAt(st, n11, n10 - 1)) || isDungeonWall(wallAt(st, n11, n10 - 2))) {
        style = 13;
      }
      if (n11 <= left + 4 && !flag4) {
        if (typeAt(st, n11 - 1, n10) === T.DOOR_CLOSED || typeAt(st, n11 + 1, n10) === T.DOOR_CLOSED) flag4 = true;
        else if (rng.int(0, 2) === 0) {
          placeDoor(st, n11, n10, style);
          if (typeAt(st, n11, n10) === T.DOOR_CLOSED) flag4 = true;
        }
      }
      if (n11 < right - 4 || flag5) continue;
      if (typeAt(st, n11 - 1, n10) === T.DOOR_CLOSED || typeAt(st, n11 + 1, n10) === T.DOOR_CLOSED) flag5 = true;
      else if (rng.int(0, 2) === 0) {
        placeDoor(st, n11, n10, style);
        if (typeAt(st, n11, n10) === T.DOOR_CLOSED) flag5 = true;
      }
    }
  }
  return true;
}

// ---------- GrowLivingTree_MakePassage（cs:29019-29290） ----------
interface PassageRefs { minl: number; minr: number }
function growLivingTreeMakePassage(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink,
  j: number, W: number, refs: PassageRefs, noSecretRoom: boolean,
): void {
  const worldSurface = gs.worldSurface;
  const underworldLayer = gs.lavaLine;          // Main.UnderworldLayer => maxTilesY-200（Main.cs:2863）
  let flag = noSecretRoom;
  const startL = refs.minl, startR = refs.minr;  // cs:29023-29024 存档,函数末恢复
  let flag2 = false;
  const num3 = 5;
  let num4 = j - 6;
  let num5 = 50;
  let num6 = rng.int(400, 699);                  // cs:29033 Next(400,700)
  let num8 = 0;
  let flag3 = true;
  let num9 = rng.int(5, 15);
  let minl = refs.minl, minr = refs.minr;
  while (num6 > 0) {
    if (num4 > underworldLayer + rng.int(15, 30)) num6 = 0;   // cs:29053
    num4++;
    num6--;
    num5--;
    const num10 = Math.floor((minl + minr) / 2);
    // cs:29073-29077:两侧已是墙 244 空腔（打到天然洞穴）→ 停
    if (!activeAt(st, minl, num4) && wallAt(st, minl, num4) === WALL_LIVING_WOOD
      && !activeAt(st, minr, num4) && wallAt(st, minr, num4) === WALL_LIVING_WOOD) {
      num6 = 0;
      break;
    }
    let num11 = 1;
    if (num4 > j && W <= 4) num11++;
    for (let i = minl - num11; i <= minr + num11; i++) {
      if (isDungeonWall(wallAt(st, i, num4))) { flag = true; flag2 = true; }  // cs:29082
      if (i > num10 - 2 && i <= num10 + 1) {
        // 井筒核心 2-4 列（cs:29088-29113）
        if (num4 > j - 4) {
          let flag4 = true;
          if (!activeAt(st, i, num4 + 1) && wallAt(st, i, num4 + 1) === 34) flag4 = false;
          const sh = sheetAt(st, i, num4);
          if (sh !== 19 && sh !== 15 && sh !== 304 && sh !== 21 && sh !== 10
            && sheetAt(st, i, num4 - 1) !== 15 && sheetAt(st, i, num4 - 1) !== 304
            && sheetAt(st, i, num4 - 1) !== 21 && sheetAt(st, i, num4 - 1) !== 10
            && sheetAt(st, i, num4 + 1) !== 10) {
            deactivate(st, i, num4);
          }
          const wl = wallAt(st, i, num4);
          if (!isDungeonWall(wl) && wl !== 3 && wl !== 83) st.wall[st.idx(i, num4)] = WALL_LIVING_WOOD;
          const wlL = wallAt(st, i - 1, num4);
          if (!isDungeonWall(wlL) && (wlL > 0 || num4 >= worldSurface)) st.wall[st.idx(i - 1, num4)] = WALL_LIVING_WOOD;
          const wlR = wallAt(st, i + 1, num4);
          if (!isDungeonWall(wlR) && (wlR > 0 || num4 >= worldSurface)) st.wall[st.idx(i + 1, num4)] = WALL_LIVING_WOOD;
          if (num4 === j && flag4) {
            deactivate(st, i, num4 + 1);
            placePlatform(st, i, num4 + 1, 23);   // 生命木平台（cs:29109）
          }
        }
      } else {
        // 井壁（cs:29115-29142）
        const sh = sheetAt(st, i, num4);
        if (sh !== 15 && sh !== 304 && sh !== 21 && sh !== 10
          && sheetAt(st, i - 1, num4) !== 10 && sheetAt(st, i + 1, num4) !== 10) {
          const wl = wallAt(st, i, num4);
          if (!isDungeonWall(wl) && wl !== 3 && wl !== 83 && (activeAt(st, i, num4) || wl !== 34)) {
            setLivingWood(st, i, num4);
          }
          if (sheetAt(st, i - 1, num4) === 40) st.type[st.idx(i - 1, num4)] = T.DIRT;  // cs:29136 粘土→泥土
          if (sheetAt(st, i + 1, num4) === 40) st.type[st.idx(i + 1, num4)] = T.DIRT;
        }
        if (num4 <= j && num4 > j - 4 && i > minl - num11 && i <= minr + num11 - 1) {
          st.wall[st.idx(i, num4)] = WALL_LIVING_WOOD;         // cs:29144
        }
      }
    }
    num8++;
    if (num8 >= 6) {
      num8 = 0;
      let num12 = rng.int(0, 2);                  // cs:29149
      if (num12 === 0) num12 = -1;
      if (flag3) num12 = 2;                       // cs:29154 首个 6 步段必为井口平台
      if (num12 === -1 && wallAt(st, minl - num3, num4) === WALL_LIVING_WOOD) num12 = 1;
      else if (num12 === 1 && wallAt(st, minr + num3, num4) === WALL_LIVING_WOOD) num12 = -1;
      if (num12 === 2) {
        flag3 = false;
        let style = 23;
        if (isDungeonWall(wallAt(st, minl, num4 + 1))
          || isDungeonWall(wallAt(st, minl + 1, num4 + 1))
          || isDungeonWall(wallAt(st, minl + 2, num4 + 1))) {
          style = 12;                             // cs:29159
        }
        for (let k = minl; k <= minr; k++) {
          if (k > num10 - 2 && k <= num10 + 1) {
            deactivate(st, k, num4 + 1);
            placePlatform(st, k, num4 + 1, style);
          }
        }
      } else {
        minl += num12;                            // cs:29177 井筒蛇形横移
        minr += num12;
      }
      if (noSecretRoom) {
        num9--;
        if (num9 <= 0) {
          num9 = growLivingTreeHorizontalTunnel(st, rng, gs, num10, num4)
            ? rng.int(5, 20) : rng.int(2, 10);    // cs:29182-29186
        }
      }
      if (num5 <= 0 && !flag) {
        flag = true;
        growLivingTreePassageRoom(st, rng, gs, chests, minl, minr, num4);  // cs:29190
      }
    }
    if (flag2) {
      let flag5 = true;
      for (let l = minl; l <= minr; l++) {
        for (let m = num4 + 1; m <= num4 + 2; m++) {
          if (solidAt(st, l, m)) flag5 = false;
        }
      }
      if (flag5) num6 = 0;                        // cs:29198
    } else {
      if (num5 > 0) continue;
      let flag6 = true;
      for (let n = minl; n <= minr; n++) {
        for (let n13 = num4 + 1; n13 <= num4 + 4; n13++) {
          if (solidAt(st, n, n13)) flag6 = false;
        }
      }
      if (flag6) num6 = 0;                        // cs:29209
    }
  }
  refs.minl = startL; refs.minr = startR;         // cs:29216-29217 恢复
  // 井口 j-3..j 贯通 + 墙补（cs:29219-29242）
  for (let n14 = refs.minl; n14 <= refs.minr; n14++) {
    for (let n15 = j - 3; n15 <= j; n15++) {
      deactivate(st, n14, n15);
      let flag7 = true;
      for (let n16 = n14 - 1; n16 <= n14 + 1; n16++) {
        for (let n17 = n15 - 1; n17 <= n15 + 1; n17++) {
          if (!activeAt(st, n16, n17) && wallAt(st, n16, n17) === 0) flag7 = false;
        }
      }
      if (flag7 && !isDungeonWall(wallAt(st, n14, n15))) {
        st.wall[st.idx(n14, n15)] = WALL_LIVING_WOOD;
      }
    }
  }
}

// ---------- GrowLivingTree（cs:28123-28759） ----------
export function growLivingTree(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink, i: number, j0: number, patch = false,
): boolean {
  const j = j0;
  const worldSurface = gs.worldSurface;
  // 前置门禁（cs:28158-28180）：脚下实心、锚点空、地面类型 dirt/grass/stone/clay/ore
  if (!solidAt(st, i, j + 1)) return false;
  if (activeAt(st, i, j)) return false;
  const gSheet = sheetAt(st, i, j + 1);
  if (gSheet !== 0 && gSheet !== 2 && gSheet !== 1 && gSheet !== 40 && !ORE_SHEETS.has(gSheet)) return false;
  if (j < 150) return false;

  let num3 = i - rng.int(2, 2);   // cs:28182 Next(2,3) 恒 2（保留掷骰消耗）
  let num4 = i + rng.int(2, 2);   // cs:28183
  if (rng.int(0, 4) === 0) {      // cs:28200 Next(5)
    if (rng.int(0, 1) === 0) num3--;
    else num4++;
  }
  const num5 = num4 - num3;       // cs:28199（patch 覆写前定宽,后续全用此值）
  let flag = num5 >= 4;
  let num6 = i - 50, num7 = i + 50;
  if (patch) {
    num6 = i - 20; num7 = i + 20;
    num3 = i - rng.int(1, 2);
    num4 = i + rng.int(1, 2);
    flag = num5 >= 4;
  }
  // 净空检查（cs:28232-28255）：树冠投影内(上方到 j-5)不得有实心物
  {
    const num8 = 5;
    for (let k = num6; k <= num7; k++) {
      for (let l = num8; l < j - 5; l++) {
        if (activeAt(st, k, l)) {
          if (!patch) return false;
          const sh = sheetAt(st, k, l);
          if (sh !== 2 && sh !== 0 && sh !== 1 && sh !== 191 && sh !== 192 && sh !== 383 && sh !== 384) return false;
        }
      }
    }
  }
  let num9 = num3, num10 = num4;
  let minl = num3, minr = num4;
  let num11 = j;
  let flag2 = true;
  let num12 = rng.int(-8, -5);    // cs:28264
  let num13 = rng.int(0, 1);      // cs:28265
  let num14 = rng.int(5, 14);     // cs:28266
  const maxValue = 2;             // cs:28267（extraLivingTrees 才会 >2）
  const ax = new Int32Array(1000), ax2 = new Int32Array(1000), ax3 = new Int32Array(1000), ax4 = new Int32Array(1000);
  let num = 0;
  const ax5 = new Int32Array(2000), ax6 = new Int32Array(2000), ax7 = new Uint8Array(2000);
  let num2 = 0;
  // ---- 主干收窄循环（cs:28271-28345） ----
  while (flag2) {
    num12++;
    if (num12 > num14) {
      num14 = rng.int(5, 14);
      num12 = 0;
      ax2[num] = num11 + rng.int(0, 4);
      if (rng.int(0, 4) === 0) num13 = num13 === 0 ? 1 : 0;
      if (num13 === 0) {
        ax3[num] = -1;
        ax[num] = num3;
        ax4[num] = num4 - num3;
        if (rng.int(0, maxValue - 1) === 0) num3++;      // cs:28294 Next(maxValue)
        num9++;                                          // cs:28301（flag3 恒 false）
        num13 = 1;
      } else {
        ax3[num] = 1;
        ax[num] = num4;
        ax4[num] = num4 - num3;
        if (rng.int(0, maxValue - 1) === 0) num4--;      // cs:28313
        num10--;                                         // cs:28320
        num13 = 0;
      }
      if (num9 === num10) flag2 = false;
      num++;
    }
    for (let m = num3; m <= num4; m++) {
      if (!isDungeonWall(wallAt(st, m, num11))) setLivingWood(st, m, num11);   // cs:28343
    }
    num11--;
  }
  // ---- 侧枝（cs:28347-28420） ----
  for (let n15 = 0; n15 < num - 1; n15++) {
    let n16 = ax[n15] + ax3[n15];
    let n17 = ax2[n15];
    let n18 = Math.trunc(ax4[n15] * (1 + rng.int(20, 29) * 0.1));  // cs:28352
    if (!isDungeonWall(wallAt(st, n16, n17 + 1))) setLivingWood(st, n16, n17 + 1);
    let n19 = rng.int(3, 4);                              // cs:28360
    while (n18 > 0) {
      n18--;
      if (!isDungeonWall(wallAt(st, n16, n17))) setLivingWood(st, n16, n17);
      if (rng.int(0, 9) === 0) {                          // cs:28365 10% 纵向抖动
        n17 = rng.int(0, 1) !== 0 ? n17 + 1 : n17 - 1;
      } else {
        n16 += ax3[n15];
      }
      if (n19 > 0) {
        n19--;
      } else if (rng.int(0, 1) === 0) {                   // cs:28371 长枝
        n19 = rng.int(2, 4);
        if (!isDungeonWall(wallAt(st, n16, n17))) {
          if (rng.int(0, 1) === 0) {
            setLivingWood(st, n16, n17);
            setLivingWood(st, n16, n17 - 1);
            ax5[num2] = n16; ax6[num2] = n17; num2++;
          } else {
            setLivingWood(st, n16, n17);
            setLivingWood(st, n16, n17 + 1);
            ax5[num2] = n16; ax6[num2] = n17; num2++;
          }
        }
      }
      if (n18 === 0) {
        ax5[num2] = n16; ax6[num2] = n17; num2++;
      }
    }
  }
  // ---- 顶部收尖 + 枝头（cs:28421-28509） ----
  let n20 = Math.floor((num3 + num4) / 2);
  let n21 = num11;
  let n22 = rng.int(num5 * 3, num5 * 5 - 1);              // cs:28424
  let n23 = 0, n24 = 0;
  while (n22 > 0 && n21 >= 30) {
    if (!isDungeonWall(wallAt(st, n20, n21))) setLivingWood(st, n20, n21);
    if (n23 > 0) n23--;
    if (n24 > 0) n24--;
    for (let n25 = -1; n25 < 2; n25++) {
      if (n25 === 0 || ((n25 >= 0 || n23 !== 0) && (n25 <= 0 || n24 !== 0)) || rng.int(0, 1) !== 0) continue;
      let n26 = n20, n27 = n21;
      let n28 = rng.int(num5, num5 * 3 - 1);              // cs:28446
      if (n25 < 0) n23 = rng.int(3, 4);
      if (n25 > 0) n24 = rng.int(3, 4);
      let n29 = 0;
      while (n28 > 0) {
        n28--;
        n26 += n25;
        if (!isDungeonWall(wallAt(st, n26, n27))) setLivingWood(st, n26, n27);
        if (n28 === 0) { ax5[num2] = n26; ax6[num2] = n27; ax7[num2] = 1; num2++; }
        if (rng.int(0, 4) === 0) {
          n27 = rng.int(0, 1) !== 0 ? n27 + 1 : n27 - 1;
          if (!isDungeonWall(wallAt(st, n26, n27))) setLivingWood(st, n26, n27);
        }
        if (n29 > 0) {
          n29--;
        } else if (rng.int(0, 2) === 0) {
          n29 = rng.int(2, 3);
          const n30 = n26;
          let n31 = n27;
          n31 = rng.int(0, 1) !== 0 ? n31 + 1 : n31 - 1;
          if (!isDungeonWall(wallAt(st, n30, n31))) setLivingWood(st, n30, n31);
          ax5[num2] = n30; ax6[num2] = n31; ax7[num2] = 1; num2++;
          ax5[num2] = n30 + rng.int(-5, 5); ax6[num2] = n31 + rng.int(-5, 5); ax7[num2] = 1; num2++;
        }
      }
    }
    ax5[num2] = n20; ax6[num2] = n21; num2++;
    if (rng.int(0, 3) === 0) {
      n20 = rng.int(0, 1) !== 0 ? n20 + 1 : n20 - 1;
      if (!isDungeonWall(wallAt(st, n20, n21))) setLivingWood(st, n20, n21);
    }
    n21--;
    n22--;
  }
  // ---- 根系（cs:28511-28600） ----
  for (let n32 = minl; n32 <= minr; n32++) {
    let n33 = rng.int(1, 5);                              // cs:28514
    let n34 = j + 1;
    while (n33 > 0) {
      if (solidAt(st, n32, n34)) n33--;
      setLivingWood(st, n32, n34);
      n34++;
    }
    const n35 = n34;
    const n36 = rng.int(2, num5);                         // cs:28525 Next(2, num5+1)
    for (let n37 = 0; n37 < n36; n37++) {
      n34 = n35;
      const n38 = Math.floor((minl + minr) / 2);
      let n39 = n32 >= n38 ? 1 : -1;
      let n40 = 1;
      if (n32 === n38 || (num5 > 6 && (n32 === n38 - 1 || n32 === n38 + 1))) n39 = 0;
      const n41 = n39;
      let n42 = n32;
      n33 = rng.int(Math.trunc(num5 * 3.5), num5 * 6 - 1); // cs:28538
      while (n33 > 0) {
        n33--;
        n42 += n39;
        if (wallAt(st, n42, n34) !== WALL_LIVING_WOOD) setLivingWood(st, n42, n34);
        n34 += 1;
        if (wallAt(st, n42, n34) !== WALL_LIVING_WOOD) setLivingWood(st, n42, n34);
        if (!activeAt(st, n42, n34 + 1)) { n39 = 0; n40 = 1; }   // cs:28547 悬空改竖直下扎
        if (rng.int(0, 2) === 0) {
          n39 = n41 < 0 ? (n39 === 0 ? -1 : 0) : (n41 <= 0 ? rng.int(-1, 1) : (n39 === 0 ? 1 : 0));
        }
        if (rng.int(0, 2) === 0) {
          n40 = n40 === 0 ? 1 : 0;
        }
      }
    }
  }
  // ---- 叶簇（cs:28603-28720） ----
  for (let n43 = 0; n43 < num2; n43++) {
    let n44 = rng.int(5, 7);
    n44 = Math.trunc(n44 * (1 + num5 * 0.05));
    if (ax7[n43]) n44 = rng.int(6, 11) + num5;
    const n45 = ax5[n43] - n44 * 2;
    const n46 = ax5[n43] + n44 * 2;
    const n47 = ax6[n43] - n44 * 2;
    const n48 = ax6[n43] + n44 * 2;
    const n49 = 2.0 - rng.int(0, 4) * 0.1;                // cs:28618
    for (let n50 = n45; n50 <= n46; n50++) {
      for (let n51 = n47; n51 <= n48; n51++) {
        if (!canPlaceLeaves(st, n50, n51)) continue;
        if (ax7[n43]) {
          // 枝头圆冠（cs:28633-28645）
          const dx = ax5[n43] - n50, dy = ax6[n43] - n51;
          if (Math.sqrt(dx * dx + dy * dy) < n44 * 0.9) setLeaf(st, n50, n51);
        } else if (Math.abs(ax5[n43] - n50) + Math.abs(ax6[n43] - n51) * n49 < n44) {
          setLeaf(st, n50, n51);                            // cs:28648
        }
      }
      if (rng.int(0, 29) === 0) {                           // cs:28653 叶顶大石堆
        let n52 = n47;
        if (inWorld(st, n50, n52, 5) && !activeAt(st, n50, n52)) {
          while (!activeAt(st, n50, n52 + 1) && n52 < n48) n52++;
          if (sheetAt(st, n50, n52 + 1) === 192) {
            placeFurniture(st, PILE2, n50, n52, rng.int(50, 51));
          }
        }
      }
      if (ax7[n43] || rng.int(0, 14) !== 0) continue;
      // cs:28666-28691 叶下地被（LargePiles2 47-49 / SmallPiles 59-61,72）
      let n53 = n48;
      const n54 = n53 + 100;
      if (activeAt(st, n50, n53)) continue;
      while (!activeAt(st, n50, n53 + 1) && n53 < n54) n53++;
      if (sheetAt(st, n50, n53 + 1) === 192) continue;
      if (rng.int(0, 1) === 0) {
        placeFurniture(st, PILE2, n50, n53, rng.int(47, 49));
        continue;
      }
      const n55 = rng.int(0, 1);
      let pileStyle = 72;
      if (n55 === 1) pileStyle = rng.int(59, 61);
      placeSmallPile(st, n50, n53, pileStyle, n55);
    }
  }
  // ---- 树干贯通竖井（cs:28722-28754）：宽干(num5>=4)且地表下无既有空腔时 ----
  if (flag) {
    let flag4 = false;
    const n56 = j;
    const n57 = j + 20;
    for (let n58 = n56; n58 < n57 && n58 < worldSurface - 2; n58++) {
      for (let n59 = minl; n59 <= minr; n59++) {
        if (wallAt(st, n59, n58) === 0 && !solidAt(st, n59, n58)) {
          flag4 = true;
          break;
        }
      }
      if (flag4) break;
    }
    if (!flag4) {
      const refs: PassageRefs = { minl, minr };
      growLivingTreeMakePassage(st, rng, gs, chests, j, num5, refs, patch);
      minl = refs.minl; minr = refs.minr;
    }
  }
  return true;
}

// ---------- LivingTrees pass（cs:15551-15791） ----------
export function runLivingTreesPass(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink,
): void {
  const { w } = st;
  const num = 200;                        // cs:15560 与世界中心 ±200 排除带
  const num2 = 0;                         // cs:15561（extraFloatingIslands 才 >0）
  const num3 = w / 4200;                  // cs:15563
  let num4 = rng.int(0, Math.floor(2 * num3));   // cs:15564 Next(0, (int)(2*num3)+1)
  if (num4 === 0 && rng.int(0, 1) === 0) num4++; // cs:15565 genRand.Next(2)==0（int(0,1) ≡ Next(2) 位级一致）
  for (let i = 0; i < num4; i++) {
    let flag = false;
    let num5 = 0;
    while (!flag) {
      num5++;
      if (num5 > w / 2) flag = true;      // cs:15608
      const num6 = rng.int(gs.beachDistance, w - gs.beachDistance - 1);  // cs:15610
      if (num6 <= Math.floor(w / 2) - num || num6 >= Math.floor(w / 2) + num) {
        let j = num2;
        // cs:15622-15629：自顶向下找首个实心格（超过 worldSurface 放弃）
        for (; !activeAt(st, num6, j) && j < gs.worldSurface; j++) { /* 空转 */ }
        if (j >= gs.worldSurface) continue;
        if (sheetAt(st, num6, j) === 0) {   // cs:15632 type==0(泥土)
          j--;
          if (j > 150) {
            let flag2 = true;
            if (isTileNearby(st, num6, j, LIVING_WOOD, 10) || isTileNearby(st, num6, j, LEAF, 10)) {
              flag2 = false;                // cs:15639-15642
            }
            if (flag2) {
              // cs:15645-15671：候选点周围 100×100 排除区
              outer:
              for (let k = num6 - 50; k < num6 + 50; k++) {
                for (let l = j - 50; l < j + 50; l++) {
                  if (!activeAt(st, k, l)) continue;
                  const sh = sheetAt(st, k, l);
                  if (EXCLUDE_BRICK.has(sh)) { flag2 = false; break outer; }
                  if (CLOUD_SHEETS.has(sh)) { flag2 = false; break outer; }
                }
              }
            }
            // cs:15674-15682：与 Mount Caves 锚点 ±50 拒绝
            for (let m = 0; m < gs.numMCaves; m++) {
              if (num6 > gs.mCaveX[m] - 50 && num6 < gs.mCaveX[m] + 50) {
                flag2 = false;
                break;
              }
            }
            if (flag2) {
              flag = growLivingTree(st, rng, gs, chests, num6, j);
              if (flag) {
                // cs:15692-15763：左右两侧补种 patch 小树
                for (let n = -1; n <= 1; n++) {
                  if (n === 0) continue;
                  let num7 = num6;
                  let num8 = rng.int(0, 3);
                  for (let n9 = 0; n9 < num8; n9++) {
                    num7 += rng.int(13, 30) * n;
                    if (num7 <= Math.floor(w / 2) - num || num7 >= Math.floor(w / 2) + num) {
                      let num10 = j;
                      if (activeAt(st, num7, num10)) {
                        while (num10 > 0 && activeAt(st, num7, num10)) num10--;
                      } else {
                        for (; num10 < st.h - 1 && !activeAt(st, num7, num10); num10++) { /* 空转 */ }
                        num10--;
                      }
                      flag2 = true;
                      outer2:
                      for (let n11 = num6 - 50; n11 < num6 + 50; n11++) {
                        for (let n12 = j - 50; n12 < j + 50; n12++) {
                          if (!activeAt(st, n11, n12)) continue;
                          const sh = sheetAt(st, n11, n12);
                          if (EXCLUDE_BRICK.has(sh)) { flag2 = false; break outer2; }
                          if (CLOUD_SHEETS.has(sh)) { flag2 = false; break outer2; }
                        }
                      }
                      if (flag2) growLivingTree(st, rng, gs, chests, num7, num10, true);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

// ---------- LivingTreeWalls pass（cs:15792-15824，零掷骰） ----------
export function runLivingTreeWallsPass(st: TileStore, gs: GenState): void {
  for (let i = 25; i < st.w - 25; i++) {
    for (let j = 25; j < gs.worldSurface; j++) {
      // cs:15805：自身或四邻为活木 → 候选
      if (typeAt(st, i, j) === LIVING_WOOD || typeAt(st, i, j - 1) === LIVING_WOOD
        || typeAt(st, i - 1, j) === LIVING_WOOD || typeAt(st, i + 1, j) === LIVING_WOOD
        || typeAt(st, i, j + 1) === LIVING_WOOD) {
        // cs:15807-15816：八邻中 4 个斜角必须全为活木(实心)或已有墙 244
        let flag = true;
        for (let k = i - 1; k <= i + 1; k++) {
          for (let l = j - 1; l <= j + 1; l++) {
            if (k !== i && l !== j
              && (!activeAt(st, k, l) || typeAt(st, k, l) !== LIVING_WOOD)
              && wallAt(st, k, l) !== WALL_LIVING_WOOD) {
              flag = false;
            }
          }
        }
        if (flag) st.wall[st.idx(i, j)] = WALL_LIVING_WOOD;   // cs:15819
      }
    }
  }
}
