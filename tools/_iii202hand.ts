// IIII202 独立手译重放（免 rig 三向对账第二脚）：GrowLivingTree 家族编排逐行自
// Terarria1458/Terraria/WorldGen.cs:28255-29633 手译（pass 循环 :15551-15791）。
// 叶级写格助手（setLivingWood/setLeaf/PlaceTile 链/SolidTile 语义）复用本仓已认证
// 移植（LivingTreePass.ts 导出面）——三向对账（gold 043 ↔ 本手译 ↔ JS 在线移植）
// 中唯一自由变量=编排与骰流。含 1458 四处 dualDungeons 门（cs:28939/:29003/:29184/:29457）。
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import type { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { T, TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { placeBuriedChest, type ChestSink } from '../src/world/gen/vanilla/BuriedChestsPass';
import { flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import {
  sheetAt, activeAt, wallAt, ltSolid, isDungeonWall, inWorld,
  isTileNearby, isTileNearbySheet,
  setLivingWood, setLeaf, deactivate, placePlatform,
  placeTilePile, placeSmallPile, placeDoorTile, place1x2, place3x3, squareTileFrameGen,
} from '../src/world/gen/vanilla/LivingTreePass';
import { intersectsAnyPotentialDungeonBounds } from '../src/world/gen/vanilla/DungeonStyles1457';

const LIVING_WOOD = TILE_BY_KEY['v_191_living_wood_block']!;
const LEAF = TILE_BY_KEY['v_192_living_leaf_block']!;
const WALL_LIVING_WOOD = 244;
const DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
const ORE_SHEETS = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);
const EXCLUDE_BRICK = new Set([41, 43, 44, 481, 482, 483]);
const CLOUD_SHEETS = new Set([189, 196, 460, 717, 718, 719]);

/** TileID.Sets.Clouds（cs:197）——CanPlaceLeaves 排除 */
const isCloudSheet = (s: number): boolean => CLOUD_SHEETS.has(s);
/** cs Main.wallDungeon */
const wallDungeon = (w: number): boolean => DUNGEON_WALLS.has(w);

// ── GrowLivingTree_CanPlaceLeaves（cs:28893-28913）─────────────────────────
function canPlaceLeavesHand(st: TileStore, x: number, y: number): boolean {
  if (!inWorld(st, x, y, 5)) return false;
  if (wallAt(st, x, y) === 244 || wallAt(st, x, y) === 78 || wallDungeon(wallAt(st, x, y))) return false;
  if (!activeAt(st, x, y)) return true;
  const s = sheetAt(st, x, y);
  if (s === 191 || isCloudSheet(s)) return false;
  return true;
}

// ── GrowLivingTree_HorizontalTunnel（cs:28915-29149）───────────────────────
function horizontalTunnelHand(st: TileStore, rng: RNG, gs: GenState, i: number, j: number): boolean {
  let num = i;
  let num2 = i;
  let num3 = 80;                                   // cs:28920（非 eLT/NTB 恒 80）
  let num4 = 1;
  if (rng.int(0, 1) === 0) num4 *= -1;             // cs:28944 Next(2)（先于两道界域门）
  for (let k = 0; k < 2; k++) {
    // 右扫（cs:28948-28989）——cs:28939 界域门在右扫支内
    if (num === i && num4 > 0) {
      if (gs.seedFlags.dualDungeons
        && intersectsAnyPotentialDungeonBounds(i + 5, j - 7, (i + 5) + (i + num3), (j - 7) + (j + 7))) {
        return false;
      }
      for (let l = i + 5; l < i + num3; l++) {
        if (!inWorld(st, l, j, 10)) return false;
        if (j < gs.worldSurface) {
          for (let m = j - 7; m <= j + 7 && wallAt(st, l, m) !== 0; m++) { /* 空转 */ }
        }
        if (sheetAt(st, l, j) === 48) break;
        if (sheetAt(st, l, j) === 191) {
          let f = false;
          for (let n = j - 2; n <= j; n++) {
            if (wallAt(st, l + 2, n) !== 244) f = true;
          }
          if (!f) { k = 2; num2 = l + 2; }
          break;
        }
        if (activeAt(st, l, j)) continue;
        let flag2 = true;
        for (let num5 = j - 2; num5 <= j; num5++) {
          if (j < gs.worldSurface + 3
            && (wallAt(st, l + 1, num5) === 0 || wallAt(st, l + 2, num5) === 0 || wallAt(st, l + 3, num5) === 0)) return false;
          if (activeAt(st, l, num5) || activeAt(st, l + 1, num5) || activeAt(st, l + 2, num5)) flag2 = false;
        }
        if (flag2) { k = 2; num2 = l; break; }
      }
    }
    // 左扫（cs:29008-29049）——cs:29003 界域门在左扫支内
    if (num2 === i && num4 < 0) {
      if (gs.seedFlags.dualDungeons
        && intersectsAnyPotentialDungeonBounds(i - num3, j - 7, (i - num3) + (i - 5), (j - 7) + (j + 7))) {
        return false;
      }
      for (let num6 = i - 5; num6 > i - num3; num6--) {
        if (!inWorld(st, num6, j, 10)) return false;
        if (j < gs.worldSurface) {
          for (let num7 = j - 7; num7 <= j + 7 && wallAt(st, num6, num7) !== 0; num7++) { /* 空转 */ }
        }
        if (sheetAt(st, num6, j) === 48) break;
        if (sheetAt(st, num6, j) === 191) {
          let f = false;
          for (let num8 = j - 2; num8 <= j; num8++) {
            if (wallAt(st, num6 - 3, num8) !== 244) f = true;
          }
          if (!f) { k = 2; num = num6 - 2; }
          break;
        }
        if (!activeAt(st, num6, j)) {
          let flag3 = true;
          for (let num9 = j - 2; num9 <= j; num9++) {
            if (j < gs.worldSurface + 3
              && (wallAt(st, num6 - 1, num9) === 0 || wallAt(st, num6 - 2, num9) === 0 || wallAt(st, num6 - 3, num9) === 0)) return false;
            if (activeAt(st, num6, num9) || activeAt(st, num6 - 1, num9) || activeAt(st, num6 - 2, num9)) flag3 = false;
          }
          if (flag3) { k = 2; num = num6; break; }
        }
      }
    }
    num4 *= -1;
  }
  if (num === num2) return false;
  let flag4 = false;
  let flag5 = false;
  for (let num10 = j - 5; num10 <= j + 1; num10++) {
    for (let num11 = num; num11 <= num2; num11++) {
      let num12 = 2;
      if (Math.abs(num11 - num2) > 3 && Math.abs(num11 - num) > 3) num12 = 4;
      const s0 = sheetAt(st, num11, num10);
      if (wallAt(st, num11, num10) !== 244 && s0 !== 19 && s0 !== 15 && s0 !== 304 && s0 !== 21 && s0 !== 10) {
        if (!wallDungeon(wallAt(st, num11, num10))
          && (!activeAt(st, num11, num10)
            || (!wallDungeon(wallAt(st, num11, num10 - 1)) && !wallDungeon(wallAt(st, num11, num10 + 1))))
          && (activeAt(st, num11, num10) || wallAt(st, num11, num10) !== 34)) {
          setLivingWood(st, num11, num10);
        }
        if (sheetAt(st, num11, num10 - 1) === 40) st.type[st.idx(num11, num10 - 1)] = T.DIRT;
        if (sheetAt(st, num11, num10 + 1) === 40) st.type[st.idx(num11, num10 + 1)] = T.DIRT;
      }
      const sm = sheetAt(st, num11, num10);
      const smu = sheetAt(st, num11, num10 - 1);
      const smd = sheetAt(st, num11, num10 + 1);
      if (num10 >= j - num12 && num10 <= j
        && sm !== 19 && sm !== 15 && sm !== 304 && sm !== 21 && sm !== 10
        && smu !== 15 && smu !== 304 && smu !== 21 && smu !== 10 && smd !== 10) {
        if (!wallDungeon(wallAt(st, num11, num10))) st.wall[st.idx(num11, num10)] = 244;
        st.liquid[st.idx(num11, num10)] = 0;
        deactivate(st, num11, num10);
      }
      if (num10 !== j) continue;
      let style = 7;
      if (wallDungeon(wallAt(st, num11, num10)) || wallDungeon(wallAt(st, num11, num10 - 1)) || wallDungeon(wallAt(st, num11, num10 - 2))) style = 13;
      if (num11 <= num + 4 && !flag4) {
        if (sheetAt(st, num11 - 1, num10) === 10 || sheetAt(st, num11 + 1, num10) === 10) flag4 = true;
        else if (rng.int(0, 2) === 0) {
          placeDoorTile(st, rng, num11, num10, style);
          if (sheetAt(st, num11, num10) === 10) flag4 = true;
        }
      }
      if (num11 < num2 - 4 || flag5) continue;
      if (sheetAt(st, num11 - 1, num10) === 10 || sheetAt(st, num11 + 1, num10) === 10) flag5 = true;
      else if (rng.int(0, 2) === 0) {
        placeDoorTile(st, rng, num11, num10, style);
        if (sheetAt(st, num11, num10) === 10) flag5 = true;
      }
    }
  }
  return true;
}

// ── GrowLivingTreePassageRoom（cs:29423-29510）────────────────────────────
function passageRoomHand(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink, minl: number, minr: number, Y: number,
): void {
  let num = rng.int(0, 1);                          // cs:29424 Next(2)
  if (num === 0) num = -1;
  let num2 = Y - 2;
  let num3 = Math.floor((minl + minr) / 2);
  if (num < 0) num3--;
  if (num > 0) num3++;
  const num4 = rng.int(15, 29);                     // cs:29433 Next(15,30)
  let num5 = num3 + num4;
  if (num < 0) { num5 = num3; num3 -= num4; }
  // cs:29437-29447 露天门
  for (let i = num3; i < num5; i++) {
    for (let j = Y - 20; j < Y + 10; j++) {
      if (wallAt(st, i, j) === 0 && !activeAt(st, i, j) && j < gs.worldSurface) return;
    }
  }
  // ★cs:29449-29453 dualDungeons 界域门（Rectangle(num3, Y-20, num5, Y+10)）
  if (gs.seedFlags.dualDungeons
    && intersectsAnyPotentialDungeonBounds(num3, Y - 20, num3 + num5, (Y - 20) + (Y + 10))) {
    return;
  }
  // 第一腔（cs:29455-29476）
  for (let k = num3; k <= num5; k++) {
    for (let l = num2 - 2; l <= Y + 2; l++) {
      if (sheetAt(st, k - 1, l) === 40) st.type[st.idx(k - 1, l)] = T.DIRT;
      if (sheetAt(st, k + 1, l) === 40) st.type[st.idx(k + 1, l)] = T.DIRT;
      if (sheetAt(st, k, l - 1) === 40) st.type[st.idx(k, l - 1)] = T.DIRT;
      if (sheetAt(st, k, l + 1) === 40) st.type[st.idx(k, l + 1)] = T.DIRT;
      if (wallAt(st, k, l) !== 244 && sheetAt(st, k, l) !== 19) setLivingWood(st, k, l);
      if (l >= num2 && l <= Y) {
        const ii = st.idx(k, l);
        st.liquid[ii] = 0;
        st.wall[ii] = 244;
        deactivate(st, k, l);
      }
    }
  }
  placeDoorTile(st, rng, Math.floor((minl + minr) / 2) + 3 * num, Y, 7);   // cs:29477
  const num6 = rng.int(5, 8);                       // cs:29478 Next(5,9)
  const num7 = rng.int(4, 5);                       // cs:29479 Next(4,6)
  if (num < 0) { num5 = num3 + num6; num3 -= num6; }
  else { num3 = num5 - num6; num5 += num6; }
  num2 = Y - num7;
  // 第二腔（cs:29485-29501）
  for (let m = num3 - 2; m <= num5 + 2; m++) {
    for (let n = num2 - 2; n <= Y + 2; n++) {
      if (wallAt(st, m, n) !== 244 && sheetAt(st, m, n) !== 19) setLivingWood(st, m, n);
      if (n >= num2 && n <= Y && m >= num3 && m <= num5) {
        const ii = st.idx(m, n);
        st.liquid[ii] = 0;
        st.wall[ii] = 244;
        deactivate(st, m, n);
      }
    }
  }
  let i2 = num < 0 ? num5 + 2 : num3 - 2;           // cs:29502-29505
  placeDoorTile(st, rng, i2, Y, 7);
  let num8 = num < 0 ? num3 : num5;
  let num9 = 2;
  if (rng.int(0, num9 - 1) === 0) {                 // cs:29511 Next(num9)
    num9 += 2;
    place1x2(st, num8, Y, 5);
    squareTileFrameGen(st, num8, Y);
    if (num < 0) {
      st.frameX[st.idx(num8, Y - 1)] += 18;
      st.frameX[st.idx(num8, Y)] += 18;
    }
  }
  num8 = num < 0 ? num3 + 2 : num5 - 2;
  place3x3(st, num8, Y);                            // cs:29523 生命木织机
  squareTileFrameGen(st, num8, Y);
  num8 = num < 0 ? num3 + 4 : num5 - 4;
  if (rng.int(0, num9 - 1) === 0) {                 // cs:29528 Next(num9)
    place1x2(st, num8, Y, 5);
    squareTileFrameGen(st, num8, Y);
    if (num > 0) {
      st.frameX[st.idx(num8, Y - 1)] += 18;
      st.frameX[st.idx(num8, Y)] += 18;
    }
  }
  num8 = num < 0 ? num3 + 8 : num5 - 7;
  const mainItem = rng.int(0, 2) === 0 ? 'vi_4281_finch_staff' : 'vi_832_living_wood_wand';  // cs:29537-29539
  // 非 remix：单箱（cs:29532-29535 else 支；落地行/箱墙门=AddBuriedChest cs:36171-36186 语义,
  //   与移植 placeBuriedChest 调用形一致——gy 下探+左列底行墙门）
  let gy = Y;
  while (gy < st.h - 1 && !activeAt(st, num8, gy)) gy++;
  const wallOk = wallAt(st, num8 - 1, gy - 1) === 244;
  if (wallOk) placeBuriedChest(st, rng, gs, chests, num8, Y, { style: 12, loot: mainItem, flags: { sky: true } });
  else placeBuriedChest(st, rng, gs, chests, num8, Y, { style: 0, flags: { wooden: true } });
}

// ── GrowLivingTree_MakePassage（cs:29151-29345）───────────────────────────
function makePassageHand(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink,
  j: number, W: number, minl0: number, minr0: number, noSecretRoom: boolean,
): { minl: number; minr: number } {
  const worldSurface = gs.worldSurface;
  const underworldLayer = st.h - 200;               // Main.UnderworldLayer = maxTilesY-200
  let flag = noSecretRoom;
  const startL = minl0, startR = minr0;             // cs:29023-29024
  let flag2 = false;
  const num3 = 5;
  let num4 = j - 6;
  let num5 = 50;
  let num6 = rng.int(400, 699);                     // cs:29033 Next(400,700)
  let num8 = 0;
  let flag3 = true;
  let num9 = rng.int(5, 15);                        // cs:29042 Next(5,16)
  // ★cs:29184-29188 dualDungeons 竖井深钳——矩形 (minl, num4, max(1,minr-minl), num6)
  //   交界域 ⇒ num6 = bounds.Top - num4 - 2
  if (gs.seedFlags.dualDungeons
    && intersectsAnyPotentialDungeonBounds(minl0, num4, minl0 + Math.max(1, minr0 - minl0), num4 + num6)) {
    for (const b of DUAL_BOUNDS_HAND) {
      if (minl0 < b.r && b.l < minl0 + Math.max(1, minr0 - minl0) && num4 < b.b && b.t < num4 + num6) {
        num6 = b.t - num4 - 2;
        break;
      }
    }
  }
  let minl = minl0, minr = minr0;
  while (num6 > 0) {
    if (num4 > underworldLayer + rng.int(15, 30)) num6 = 0;   // cs:29053 每轮掷
    num4++;
    num6--;
    num5--;
    const num10 = Math.floor((minl + minr) / 2);
    if (!activeAt(st, minl, num4) && wallAt(st, minl, num4) === 244
      && !activeAt(st, minr, num4) && wallAt(st, minr, num4) === 244) {
      num6 = 0;
      break;
    }
    let num11 = 1;
    if (num4 > j && W <= 4) num11++;
    for (let i = minl - num11; i <= minr + num11; i++) {
      if (wallDungeon(wallAt(st, i, num4))) { flag = true; flag2 = true; }
      if (i > num10 - 2 && i <= num10 + 1) {
        if (num4 > j - 4) {
          let flag4 = true;
          if (!activeAt(st, i, num4 + 1) && wallAt(st, i, num4 + 1) === 34) flag4 = false;
          const s = sheetAt(st, i, num4);
          const su = sheetAt(st, i, num4 - 1);
          const sd = sheetAt(st, i, num4 + 1);
          if (s !== 19 && s !== 15 && s !== 304 && s !== 21 && s !== 10
            && su !== 15 && su !== 304 && su !== 21 && su !== 10 && sd !== 10) {
            deactivate(st, i, num4);
          }
          const wl = wallAt(st, i, num4);
          if (!wallDungeon(wl) && wl !== 3 && wl !== 83) st.wall[st.idx(i, num4)] = 244;
          const wlL = wallAt(st, i - 1, num4);
          if (!wallDungeon(wlL) && (wlL > 0 || num4 >= worldSurface)) st.wall[st.idx(i - 1, num4)] = 244;
          const wlR = wallAt(st, i + 1, num4);
          if (!wallDungeon(wlR) && (wlR > 0 || num4 >= worldSurface)) st.wall[st.idx(i + 1, num4)] = 244;
          if (num4 === j && i > num10 - 2 && i <= num10 + 1 && flag4) {
            deactivate(st, i, num4 + 1);
            placePlatform(st, rng, i, num4 + 1, 23);
          }
        }
      } else {
        const s = sheetAt(st, i, num4);
        const sl = sheetAt(st, i - 1, num4);
        const sr = sheetAt(st, i + 1, num4);
        if (s !== 15 && s !== 304 && s !== 21 && s !== 10 && sl !== 10 && sr !== 10) {
          const wl = wallAt(st, i, num4);
          if (!wallDungeon(wl) && wl !== 3 && wl !== 83 && (activeAt(st, i, num4) || wl !== 34)) {
            setLivingWood(st, i, num4);
          }
          if (sheetAt(st, i - 1, num4) === 40) st.type[st.idx(i - 1, num4)] = T.DIRT;
          if (sheetAt(st, i + 1, num4) === 40) st.type[st.idx(i + 1, num4)] = T.DIRT;
        }
        if (num4 <= j && num4 > j - 4 && i > minl - num11 && i <= minr + num11 - 1) {
          st.wall[st.idx(i, num4)] = 244;
        }
      }
    }
    num8++;
    if (num8 >= 6) {
      num8 = 0;
      let num12 = rng.int(0, 2);                    // cs:29149 Next(3)
      if (num12 === 0) num12 = -1;
      if (flag3) num12 = 2;
      if (num12 === -1 && wallAt(st, minl - num3, num4) === 244) num12 = 1;
      else if (num12 === 1 && wallAt(st, minr + num3, num4) === 244) num12 = -1;
      if (num12 === 2) {
        flag3 = false;
        let style = 23;
        if (wallDungeon(wallAt(st, minl, num4 + 1)) || wallDungeon(wallAt(st, minl + 1, num4 + 1))
          || wallDungeon(wallAt(st, minl + 2, num4 + 1))) style = 12;
        for (let k = minl; k <= minr; k++) {
          if (k > num10 - 2 && k <= num10 + 1) {
            deactivate(st, k, num4 + 1);
            placePlatform(st, rng, k, num4 + 1, style);
          }
        }
      } else {
        minl += num12;
        minr += num12;
      }
      if (noSecretRoom) {
        num9--;
        if (num9 <= 0) {
          num9 = !horizontalTunnelHand(st, rng, gs, num10, num4) ? rng.int(2, 10) : rng.int(5, 20);
        }
      }
      if (num5 <= 0 && !flag) {
        flag = true;
        passageRoomHand(st, rng, gs, chests, minl, minr, num4);
      }
    }
    if (flag2) {
      let flag5 = true;
      for (let l = minl; l <= minr; l++) {
        for (let m = num4 + 1; m <= num4 + 2; m++) {
          if (ltSolid(st, l, m)) flag5 = false;
        }
      }
      if (flag5) num6 = 0;
    } else {
      if (num5 > 0) continue;
      let flag6 = true;
      for (let n = minl; n <= minr; n++) {
        for (let n13 = num4 + 1; n13 <= num4 + 4; n13++) {
          if (ltSolid(st, n, n13)) flag6 = false;
        }
      }
      if (flag6) num6 = 0;
    }
  }
  // cs:29216-29217 恢复 + 井口贯通
  minl = startL; minr = startR;
  for (let n14 = minl; n14 <= minr; n14++) {
    for (let n15 = j - 3; n15 <= j; n15++) {
      deactivate(st, n14, n15);
      let flag7 = true;
      for (let n16 = n14 - 1; n16 <= n14 + 1; n16++) {
        for (let n17 = n15 - 1; n17 <= n15 + 1; n17++) {
          if (!activeAt(st, n16, n17) && wallAt(st, n16, n17) === 0) flag7 = false;
        }
      }
      if (flag7 && !wallDungeon(wallAt(st, n14, n15))) st.wall[st.idx(n14, n15)] = 244;
    }
  }
  return { minl, minr };
}

/** 界域登记表（LATE 入口态第二件——探针注入；vanilla GenVars.dungeonGenVars[i]
 *  .outerPotentialDungeonBounds 的 Top 消费面） */
let DUAL_BOUNDS_HAND: { l: number; t: number; r: number; b: number }[] = [];
export function setHandDualBounds(b: { l: number; t: number; r: number; b: number }[]): void {
  DUAL_BOUNDS_HAND = b;
}

// ── GrowLivingTree（cs:28255-28891）───────────────────────────────────────
function growLivingTreeHand(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink,
  i: number, j0: number, patch = false,
): boolean {
  const j = j0;
  const worldSurface = gs.worldSurface;
  const array = new Int32Array(1000), array2 = new Int32Array(1000), array3 = new Int32Array(1000), array4 = new Int32Array(1000);
  const array5 = new Int32Array(2000), array6 = new Int32Array(2000), array7 = new Uint8Array(2000);
  let num = 0;
  let num2 = 0;
  // cs:28285-28302 头门
  if (!ltSolid(st, i, j + 1)) return false;
  if (activeAt(st, i, j)) return false;
  const gSheet = sheetAt(st, i, j + 1);
  const ntbFoot = gs.seedFlags.notTheBees && (gSheet === 60 || gSheet === 59);
  if (!gs.seedFlags.errorWorld && gSheet !== 0 && gSheet !== 2 && gSheet !== 1 && gSheet !== 40
    && !ORE_SHEETS.has(gSheet) && !ntbFoot) return false;
  if (j < 150) return false;
  // cs:28310-28330 干宽
  let num3 = i - rng.int(2, 2);                     // Next(2,3) 恒 2（掷保留）
  let num4 = i + rng.int(2, 2);
  // ddual：skyblock/eLT/NTB 加宽支全不走
  if (rng.int(0, 4) === 0) {                        // cs:28331 Next(5)
    if (rng.int(0, 1) === 0) num3--; else num4++;
  }
  const num5 = num4 - num3;
  let flag = num5 >= 4;
  let num6 = i - 50, num7 = i + 50;
  if (patch) {
    num6 = i - 20; num7 = i + 20;
    num3 = i - rng.int(1, 2);                       // cs:28348 Next(1,3)
    num4 = i + rng.int(1, 2);
    flag = num5 >= 4;                               // cs:28353（num5 不重算,死赋值照录）
  }
  // cs:28358-28379 净空检查
  {
    const num8 = 5;
    for (let k = num6; k <= num7; k++) {
      for (let l = num8; l < j - 5; l++) {
        if (activeAt(st, k, l)) {
          if (!patch) return false;
          const s = sheetAt(st, k, l);
          if (s !== 2 && s !== 0 && s !== 1 && s !== 191 && s !== 192 && s !== 383 && s !== 384) return false;
        }
      }
    }
  }
  flipGenSolid([48], false);                        // cs:28381 tileSolid[48]=false
  let num9 = num3, num10 = num4;
  const minl0 = num3, minr0 = num4;
  let num11 = j;
  let flag2 = true;
  let num12 = rng.int(-8, -5);                      // cs:28388 Next(-8,-4)
  let num13 = rng.int(0, 1);                        // cs:28389 Next(2)
  let num14 = rng.int(5, 14);                       // cs:28390 Next(5,15)
  const maxValue = 2;                               // cs:28392（非 eLT）
  // cs:28402-28433 主干收窄循环
  while (flag2) {
    num12++;
    if (num12 > num14) {
      num14 = rng.int(5, 14);
      num12 = 0;
      array2[num] = num11 + rng.int(0, 4);          // cs:28414 Next(5)
      if (rng.int(0, 4) === 0) num13 = num13 === 0 ? 1 : 0;   // cs:28415 Next(5)
      if (num13 === 0) {
        array3[num] = -1;
        array[num] = num3;
        array4[num] = num4 - num3;
        if (rng.int(0, maxValue - 1) === 0) num3++;  // cs:28418 Next(maxValue)
        num9++;                                      // cs:28425 !flag3 支
        num13 = 1;
      } else {
        array3[num] = 1;
        array[num] = num4;
        array4[num] = num4 - num3;
        if (rng.int(0, maxValue - 1) === 0) num4--;
        num10--;
        num13 = 0;
      }
      if (num9 === num10) flag2 = false;
      num++;
    }
    for (let m = num3; m <= num4; m++) {            // cs:28477-28483 非 eLT 行写入
      if (!wallDungeon(wallAt(st, m, num11))) setLivingWood(st, m, num11);
    }
    num11--;
  }
  // cs:28494-28544 侧枝
  for (let n15 = 0; n15 < num - 1; n15++) {
    let n16 = array[n15]! + array3[n15]!;
    let n17 = array2[n15]!;
    let n18 = Math.trunc(array4[n15]! * (1 + rng.int(20, 29) * 0.1));   // cs:28499
    if (!wallDungeon(wallAt(st, n16, n17 + 1))) setLivingWood(st, n16, n17 + 1);
    let n19 = rng.int(3, 4);                        // cs:28507 Next(3,5)
    while (n18 > 0) {
      n18--;
      if (!wallDungeon(wallAt(st, n16, n17))) setLivingWood(st, n16, n17);
      if (rng.int(0, 9) === 0) {
        n17 = rng.int(0, 1) !== 0 ? n17 + 1 : n17 - 1;
      } else {
        n16 += array3[n15]!;
      }
      if (n19 > 0) {
        n19--;
      } else if (rng.int(0, 1) === 0) {
        n19 = rng.int(2, 4);
        if (!wallDungeon(wallAt(st, n16, n17))) {
          if (rng.int(0, 1) === 0) {
            setLivingWood(st, n16, n17);
            setLivingWood(st, n16, n17 - 1);
            array5[num2] = n16; array6[num2] = n17; num2++;
          } else {
            setLivingWood(st, n16, n17);
            setLivingWood(st, n16, n17 + 1);
            array5[num2] = n16; array6[num2] = n17; num2++;
          }
        }
      }
      if (n18 === 0) { array5[num2] = n16; array6[num2] = n17; num2++; }
    }
  }
  // cs:28545-28592 顶部收尖 + 枝头
  let n20 = Math.floor((num3 + num4) / 2);
  let n21 = num11;
  let n22 = rng.int(num5 * 3, num5 * 5 - 1);        // cs:28548 Next(num5*3, num5*5)
  let n23 = 0, n24 = 0;
  while (n22 > 0 && n21 >= 30) {
    if (!wallDungeon(wallAt(st, n20, n21))) setLivingWood(st, n20, n21);
    if (n23 > 0) n23--;
    if (n24 > 0) n24--;
    for (let n25 = -1; n25 < 2; n25++) {
      if (n25 === 0 || ((n25 >= 0 || n23 !== 0) && (n25 <= 0 || n24 !== 0)) || rng.int(0, 1) !== 0) continue;
      let n26 = n20, n27 = n21;
      let n28 = rng.int(num5, num5 * 3 - 1);        // cs:28570 Next(num5, num5*3)
      if (n25 < 0) n23 = rng.int(3, 4);
      if (n25 > 0) n24 = rng.int(3, 4);
      let n29 = 0;
      while (n28 > 0) {
        n28--;
        n26 += n25;
        if (!wallDungeon(wallAt(st, n26, n27))) setLivingWood(st, n26, n27);
        if (n28 === 0) { array5[num2] = n26; array6[num2] = n27; array7[num2] = 1; num2++; }
        if (rng.int(0, 4) === 0) {
          n27 = rng.int(0, 1) !== 0 ? n27 + 1 : n27 - 1;
          if (!wallDungeon(wallAt(st, n26, n27))) setLivingWood(st, n26, n27);
        }
        if (n29 > 0) {
          n29--;
        } else if (rng.int(0, 2) === 0) {
          n29 = rng.int(2, 3);
          const n30 = n26;
          let n31 = n27;
          n31 = rng.int(0, 1) !== 0 ? n31 + 1 : n31 - 1;
          if (!wallDungeon(wallAt(st, n30, n31))) setLivingWood(st, n30, n31);
          array5[num2] = n30; array6[num2] = n31; array7[num2] = 1; num2++;
          array5[num2] = n30 + rng.int(-5, 5); array6[num2] = n31 + rng.int(-5, 5); array7[num2] = 1; num2++;
        }
      }
    }
    array5[num2] = n20; array6[num2] = n21; num2++;
    if (rng.int(0, 3) === 0) {
      n20 = rng.int(0, 1) !== 0 ? n20 + 1 : n20 - 1;
      if (!wallDungeon(wallAt(st, n20, n21))) setLivingWood(st, n20, n21);
    }
    n21--;
    n22--;
  }
  // cs:28594-28683 根系
  for (let n32 = minl0; n32 <= minr0; n32++) {
    let n33 = rng.int(1, 5);                        // cs:28597 Next(1,6)
    let n34 = j + 1;
    while (n33 > 0) {
      if (ltSolid(st, n32, n34)) n33--;
      setLivingWood(st, n32, n34);                  // cs:28601-28603 无墙门（无条件写）
      n34++;
    }
    const n35 = n34;
    const n36 = rng.int(2, num5);                   // cs:28608 Next(2, num5+1)
    for (let n37 = 0; n37 < n36; n37++) {
      n34 = n35;
      const n38 = Math.floor((minl0 + minr0) / 2);
      let n39 = n32 >= n38 ? 1 : -1;
      let n40 = 1;
      if (n32 === n38 || (num5 > 6 && (n32 === n38 - 1 || n32 === n38 + 1))) n39 = 0;
      const n41 = n39;
      let n42 = n32;
      n33 = rng.int(Math.trunc(num5 * 3.5), num5 * 6 - 1);   // cs:28621
      while (n33 > 0) {
        n33--;
        n42 += n39;
        if (wallAt(st, n42, n34) !== 244) setLivingWood(st, n42, n34);
        n34 += n40;
        if (wallAt(st, n42, n34) !== 244) setLivingWood(st, n42, n34);
        if (!activeAt(st, n42, n34 + 1)) { n39 = 0; n40 = 1; }
        if (rng.int(0, 2) === 0) {
          n39 = n41 < 0 ? (n39 === 0 ? -1 : 0) : (n41 <= 0 ? rng.int(-1, 1) : (n39 === 0 ? 1 : 0));
        }
        if (rng.int(0, 2) === 0) {
          n40 = n40 === 0 ? 1 : 0;
        }
      }
    }
  }
  // cs:28686-28850 叶簇
  for (let n43 = 0; n43 < num2; n43++) {
    let n44 = rng.int(5, 7);                        // cs:28695 Next(5,8)
    n44 = Math.trunc(n44 * (1 + num5 * 0.05));
    if (array7[n43]) n44 = rng.int(6, 11) + num5;   // cs:28699 Next(6,12)+num5
    const n45 = array5[n43]! - n44 * 2;
    const n46 = array5[n43]! + n44 * 2;
    const n47 = array6[n43]! - n44 * 2;
    const n48 = array6[n43]! + n44 * 2;
    const n49 = 2.0 - rng.int(0, 4) * 0.1;          // cs:28705 Next(5)
    for (let n50 = n45; n50 <= n46; n50++) {
      for (let n51 = n47; n51 <= n48; n51++) {
        if (!canPlaceLeavesHand(st, n50, n51)) continue;
        if (array7[n43]) {
          // cs:28722-28730 圆冠（XNA Vector2D float32 Length——fround 链照 IIIRS97c 判例）
          const dx = array5[n43]! - n50, dy = array6[n43]! - n51;
          const lenSq = Math.fround(Math.fround(Math.fround(Math.fround(dx * dx) + Math.fround(dy * dy))));
          if (Math.sqrt(lenSq) < n44 * 0.9) setLeaf(st, n50, n51);
        } else if (Math.abs(array5[n43]! - n50) + Math.abs(array6[n43]! - n51) * n49 < n44) {
          setLeaf(st, n50, n51);
        }
      }
      if (rng.int(0, 29) === 0) {                   // cs:28753 Next(30)
        let n52 = n47;
        if (inWorld(st, n50, n52, 5) && !activeAt(st, n50, n52)) {
          for (; !activeAt(st, n50, n52 + 1) && n52 < n48; n52++) { /* 空转 */ }
          if (sheetAt(st, n50, n52 + 1) === 192) {
            const sty = rng.int(50, 51);            // cs:28760 Next(50,52)
            placeTilePile(st, n50, n52, sty);
          }
        }
      }
      if (array7[n43] || rng.int(0, 14) !== 0) continue;   // cs:28767 Next(15)
      let n53 = n48;
      const n54 = n53 + 100;
      if (activeAt(st, n50, n53)) continue;
      for (; !activeAt(st, n50, n53 + 1) && n53 < n54; n53++) { /* 空转 */ }
      if (sheetAt(st, n50, n53 + 1) === 192) continue;
      if (rng.int(0, 1) === 0) {                    // cs:28778 Next(2)
        const sty = rng.int(47, 49);                // cs:28779 Next(47,50)
        placeTilePile(st, n50, n53, sty);
        continue;
      }
      const n55 = rng.int(0, 1);                    // cs:28783 Next(2)
      let pileStyle = 72;
      if (n55 === 1) pileStyle = rng.int(59, 61);   // cs:28785 Next(59,62)
      placeSmallPile(st, n50, n53, pileStyle, n55);
    }
  }
  // cs:28853-28878 贯通竖井门（flag ∧ flag4 扫描）
  if (flag) {
    let flag4 = false;
    const n56 = j, n57 = j + 20;
    for (let n58 = n56; n58 < n57 && !(n58 >= worldSurface - 2); n58++) {
      for (let n59 = minl0; n59 <= minr0; n59++) {
        if (wallAt(st, n59, n58) === 0 && !ltSolid(st, n59, n58)) { flag4 = true; break; }
      }
      if (flag4) break;
    }
    if (!flag4) {
      makePassageHand(st, rng, gs, chests, j, num5, minl0, minr0, patch);
    }
  }
  flipGenSolid([48], true);                         // cs:28880 tileSolid[48]=true
  return true;
}

// ── LivingTrees pass（cs:15551-15791）─────────────────────────────────────
export function runLivingTreesPassHand(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink,
): void {
  const w = st.w;
  const worldSurface = gs.worldSurface;
  const num = 200;                                  // cs:15560
  const num2 = 0;
  const num3 = w / 4200;                            // cs:15563
  let num4 = rng.int(0, Math.floor(2 * num3));      // cs:15564 Next(0, (int)(2*num3)+1)
  if (num4 === 0 && rng.int(0, 1) === 0) num4++;    // cs:15565
  // ddual：eLT/ntb/drunk/tenth/remix 增量支全不走
  for (let i = 0; i < num4; i++) {
    let flag = false;
    let num5 = 0;
    while (!flag) {
      num5++;
      if (num5 > Math.floor(w / 2)) flag = true;    // cs:15607
      const num6 = rng.int(gs.beachDistance, w - gs.beachDistance - 1);   // cs:15610
      if (num6 <= Math.floor(w / 2) - num || num6 >= Math.floor(w / 2) + num) {
        let j = num2;
        for (; !activeAt(st, num6, j) && j < worldSurface; j++) { /* 空转 */ }   // cs:15624
        if (j >= worldSurface) continue;
        const baseSheet = sheetAt(st, num6, j);
        if (baseSheet === 0) {                      // cs:15629（非 NTB）
          j--;
          if (j > 150) {
            let flag2 = true;
            if (isTileNearby(st, num6, j, LIVING_WOOD, 10) || isTileNearby(st, num6, j, LEAF, 10)) flag2 = false;
            if (flag2 && !gs.seedFlags.errorWorld) {
              outer:
              for (let k = num6 - 50; k < num6 + 50; k++) {
                for (let l = j - 50; l < j + 50; l++) {
                  if (!activeAt(st, k, l)) continue;
                  const s = sheetAt(st, k, l);
                  if (EXCLUDE_BRICK.has(s)) { flag2 = false; break outer; }
                  if (CLOUD_SHEETS.has(s) && !gs.seedFlags.extraLivingTrees) { flag2 = false; break outer; }
                }
              }
            }
            if (!gs.seedFlags.extraLivingTrees) {
              for (let m = 0; m < gs.numMCaves; m++) {
                if (num6 > gs.mCaveX[m]! - 50 && num6 < gs.mCaveX[m]! + 50) { flag2 = false; break; }
              }
            }
            if (flag2) {
              const rc0 = (globalThis as unknown as { __ltRc?: { n: number } }).__ltRc?.n ?? -1;
              flag = growLivingTreeHand(st, rng, gs, chests, num6, j);
              console.log(`HAT|i=${num6}|j=${j}|p=0|rc=${rc0}|r=${flag ? 1 : 0}|rcEnd=${(globalThis as unknown as { __ltRc?: { n: number } }).__ltRc?.n ?? -1}`);
              if (flag) {
                for (let n = -1; n <= 1; n++) {
                  if (n === 0) continue;
                  let num7 = num6;
                  let num8 = rng.int(0, 3);         // cs:15728 Next(4)
                  // ddual：增量支全不走
                  for (let n9 = 0; n9 < num8; n9++) {
                    num7 += rng.int(13, 30) * n;    // cs:15740 Next(13,31)
                    if (num7 <= Math.floor(w / 2) - num || num7 >= Math.floor(w / 2) + num) {
                      let num10 = j;
                      if (activeAt(st, num7, num10)) {
                        while (num10 > 0 && activeAt(st, num7, num10)) num10--;
                      } else {
                        for (; num10 < st.h - 1 && !activeAt(st, num7, num10); num10++) { /* 空转 */ }
                        num10--;
                      }
                      flag2 = true;
                      if (!gs.seedFlags.errorWorld) {
                        outer2:
                        for (let n11 = num6 - 50; n11 < num6 + 50; n11++) {
                          for (let n12 = j - 50; n12 < j + 50; n12++) {
                            if (!activeAt(st, n11, n12)) continue;
                            const s = sheetAt(st, n11, n12);
                            if (EXCLUDE_BRICK.has(s)) { flag2 = false; break outer2; }
                            if (CLOUD_SHEETS.has(s)) { flag2 = false; break outer2; }
                          }
                        }
                      }
                      if (flag2) {
                        const rc0 = (globalThis as unknown as { __ltRc?: { n: number } }).__ltRc?.n ?? -1;
                        const okP = growLivingTreeHand(st, rng, gs, chests, num7, num10, true);
                        console.log(`HAT|i=${num7}|j=${num10}|p=1|rc=${rc0}|r=${okP ? 1 : 0}|rcEnd=${(globalThis as unknown as { __ltRc?: { n: number } }).__ltRc?.n ?? -1}`);
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
  flipGenSolid([192], false);                       // cs:15789
}

// 探针脚手架：hydrate 基座 + 掷账（复用 _iii202re 的基座格式）
const OUT = process.env.SW_I202_OUT ?? '/tmp/iii202-out';
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;

/** 独立入口（由 _iii202re.test.ts SW_I202_HAND=1 调）：hydrate→手译 pass→掷账已在探针侧包装 */
export function hydrateBase(): { st: TileStore; gs: GenState; dual: { enabled: boolean; potentialBounds: { l: number; t: number; r: number; b: number }[] } } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = JSON.parse(readFileSync(`${OUT}/base/base_gs.json`, 'utf8')) as unknown as GenState;
  const dual = JSON.parse(readFileSync(`${OUT}/base/base_dual.json`, 'utf8')) as { enabled: boolean; potentialBounds: { l: number; t: number; r: number; b: number }[] };
  return { st, gs, dual };
}
