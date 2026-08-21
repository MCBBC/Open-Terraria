// 1457 新增：FinalSeedCleanup 全种子终扫（WorldGen.cs:692 FinalizeSecretSeeds 尾部
// **无条件**调用 + 实现 :695-830）+ 四涂装种子族单格/全图 pass。
//
// ── 结构 ──
//   FinalSeedCleanup(:695)        全图 [5, 尺寸-5) 扫描：悬空 Falling 块按类型静态化
//                                 （224→147 / 53,495→397 / 112→398 / 234→399 / 116→402,
//                                 其余→1 泥土）+ 逐格 FinalSeedCleanup_Paint。
//   FinalSeedCleanup_Paint(:749)  四涂种单格涂（echo/illuminant/gray/negative）。
//   DoCoatEverythingEcho(:913)    边距 5（1456 是 0）+ errorWorld 时 ErrorRemoval 全图 +
//                                 8000 箱 1/25 塞 SpectreGoggles(4409)。
//   DoCoatEverythingIlluminant(:975) 边距 5。
//   DoPaintEverythingGray(:777)   边距 5；JustTheSurface 上界 Min(w-5, worldSurface+Next(3))。
//   DoPaintEverythingNegative(:806) 边距 5；JustUnderground 时底边距 30→25 行
//                                 （`maxTilesY - num - 20`，num=5 ⇒ 距底 25）。
//
// ★旗标现状：四涂装种子（coatEverythingEcho/illuminant/paintEverythingGray/negative）
//  与 errorWorld 均为 1457 SecretSeed **哈希注册**（无公开文本种子），本仓 SeedEasterEggs
//  仅登记旗标位（恒 false）——文本/哈希触发链归秘密种子批（批 F）。终扫的落砂静态化
//  部分不依赖旗标，普通世界照跑。
import { TILE_DEFS } from '../../../data/tiles';
import type { TileStore } from '../../TileStore';
import type { SeedFlags } from '../SeedEasterEggs';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../../../data/items';

/** 原版物品 id → 本仓内部 id（未注册 -1）——4409 SpectreGoggles 入箱用 */
function vidItem(id: number): number {
  const k = VANILLA_ITEM_KEY_BY_ID[id];
  return k ? (ITEM_BY_KEY[k] ?? -1) : -1;
}

/** 内部 id → 原版 tile sheet（Falling 判定/静态化映射走 sheet 空间） */
const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
const SHEET_TO_ID = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') {
    SHEET_OF[i] = s;
    if (!SHEET_TO_ID.has(s)) SHEET_TO_ID.set(s, i);
  }
}
const sheetOf = (t: number): number => (t >= 0 && t < SHEET_OF.length ? SHEET_OF[t] : -1);

/** TileID.Sets.Falling（1457 TileID.cs:395）= {53,234,112,116,224,123,330,331,332,333,495} */
const FALLING_SHEETS = new Set([53, 234, 112, 116, 224, 123, 330, 331, 332, 333, 495]);

/** TileID.Sets.IsATreeTrunk（TileID.cs:161）——CanKillTile 上格早退门 */
const IS_TREE_TRUNK = new Set([5, 72, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);
/** cs:62308-62316 上邻保护族（21 箱/26 祭坛/72/77/88 梳妆台/467/488 倒木）——
 *  TileCleanupPass 同表副本（同源惯例,不 import 防耦合） */
const UP_PROTECT_FAMILY = new Set([21, 26, 72, 77, 88, 467, 488]);

/** WorldGen.CanKillTile(i, j)（1457 cs:62306+）本语境可达子集：落砂静态化的
 *  CanKillTile 消费只落在 (i,j±1) 邻格上——Boulders+CheckBoulderChest（落砂非巨石）、
 *  门 10/235/箱 21/467/88（被杀格类型 switch,落砂族不命中）均不可达,略。
 *  ★无 chest 注册表参数：CheckBoulderChest 分支不可达（同上）。 */
function canKillTileFSC(st: TileStore, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  if (st.wall[i] === 350) return false;
  if (y >= 1) {
    const u = st.idx(x, y - 1);
    if (st.flags[u]) {
      const sh = sheetOf(st.type[u]!);
      const self = sheetOf(st.type[i]!);
      if (UP_PROTECT_FAMILY.has(sh) && self !== sh) return false;
      if (IS_TREE_TRUNK.has(sh) || sh === 323) {
        const fx = st.frameX[u]!, fy = st.frameY[u]!;
        // cs:62282-62284 帧位例外（侧枝列/干身下段放行）
        const sideBranch = (fx === 66 && fy >= 0 && fy <= 44) || (fx === 44 && fy >= 198 && fy <= 242)
          || (fx === 88 && fy >= 66 && fy <= 110) || (fx === 66 && fy >= 198 && fy <= 242);
        if (!sideBranch && fy < 198) return false;
        if (sh === 323 && (fx === 66 || fx === 220)) return false;
      }
    }
  }
  return true;
}

/** WorldGen.SolidTile3(i, j)（cs:71005）：nactive && tileSolid && !tileSolidTop */
function solidTile3FSC(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  if ((st.wire[i] >>> 5) & 1) return false;   // nactive = active && !inActive
  const d = TILE_DEFS[st.type[i]!];
  return !!d && !!d.solid && !d.platform;
}

/** Tile.ResetToType（Tile.cs:251）：liquid=0、sTileHeader=32（仅活性位）、帧/漆/线/
 *  涂层头全清、type 直写（墙不清）。 */
function resetToType(st: TileStore, x: number, y: number, sheet: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  const id = SHEET_TO_ID.get(sheet) ?? 0;
  st.type[i] = id;
  st.flags[i] = 1;
  st.liquid[i] = 0;
  st.liquidType[i] = 0;
  st.half[i] = 0;
  st.slope[i] = 0;
  st.frameX[i] = 0;
  st.frameY[i] = 0;
  st.wire[i] = 0;          // sTileHeader=32：线四色+致动器+已致动全清
  st.paint[i] = 0;         // bTileHeader=0：墙漆清
  st.paintWall[i] = 0;
}

/** 悬空 Falling 块 → 静态化目标类型（cs:711-730 switch） */
function staticTargetSheet(sheet: number): number {
  switch (sheet) {
    case 224: return 147;
    case 53:
    case 495: return 397;
    case 112: return 398;
    case 234: return 399;
    case 116: return 402;
    default: return 1;
  }
}

/** FinalSeedCleanup_Paint（cs:749）：四涂种单格涂（旗标未实装时恒 no-op） */
function finalSeedCleanupPaint(st: TileStore, x: number, y: number, f: SeedFlags): void {
  if (f.coatEverythingEcho) {
    doCoatEverythingEchoSingleTile(st, x, y, f);
    if (f.errorWorld) doCoatEverythingEchoErrorRemoval(st, x, y);
  }
  if (f.coatEverythingIlluminant) doCoatEverythingIlluminantSingleTile(st, x, y, f);
  if (f.paintEverythingGray) doPaintEverythingGraySingleTile(st, x, y, f);
  if (f.paintEverythingNegative) doPaintEverythingNegativeSingleTile(st, x, y, f.negativeJustSomeThings ?? false);
}

/** FinalSeedCleanup（cs:695-747）：全种子终扫——悬空 Falling 块静态化。
 *  分支语义：上格可清/不存在 且 下格活且不可清 → 本格静态化（原地落定）；
 *  否则下格静态化（下坠一格成型,原格保留 Falling 态——原版如此,勿"修"）。 */
export function finalSeedCleanup(st: TileStore, f: SeedFlags): void {
  const num = 5;
  for (let i = num; i < st.w - num; i++) {
    for (let j = num; j < st.h - num; j++) {
      const i0 = st.idx(i, j);
      if (!st.flags[i0]) continue;
      const sheet = sheetOf(st.type[i0]!);
      if (sheet < 0 || !FALLING_SHEETS.has(sheet)) continue;
      if (solidTile3FSC(st, i, j + 1)) continue;      // 落点已实心 → 支撑成立,跳过
      const target = staticTargetSheet(sheet);
      const upGone = !st.inBounds(i, j - 1) || !st.flags[st.idx(i, j - 1)];
      const upKillable = canKillTileFSC(st, i, j - 1);
      const downActive = st.inBounds(i, j + 1) && !!st.flags[st.idx(i, j + 1)];
      if ((upGone || upKillable) && downActive && !canKillTileFSC(st, i, j + 1)) {
        resetToType(st, i, j, target);
        finalSeedCleanupPaint(st, i, j, f);
        continue;
      }
      resetToType(st, i, j + 1, target);
      finalSeedCleanupPaint(st, i, j + 1, f);
      // echo 涂种：静态化格补隐形（`!tile3.invisibleBlock()` 门;旗标未实装恒跳过）。
      // invisibleBlock 暂记 wire bit6（渲染消费端批 F 接）
      if (f.coatEverythingEcho && !(st.wire[st.idx(i, j + 1)] & 64)) {
        st.wire[st.idx(i, j + 1)] |= 64;
      }
    }
  }
}

// ===================== 四涂装种子族（旗标未实装,结构先行） =====================

/** DoCoatEverythingEcho_SingleTile（cs:940-988）：JustSomeThings/JustInnerBlocks/
 *  全涂 三变体——本仓 Tile 无 invisible/fullbright 位,先以 wire 高位暂记
 *  （bit6=invisibleBlock/bit7=invisibleWall,渲染消费端批 F 接）。 */
function doCoatEverythingEchoSingleTile(st: TileStore, x: number, y: number, f: SeedFlags): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (f.echoJustSomeThings) {
    const sh = sheetOf(st.type[i]!);
    const isBoulder = [138, 484, 664, 665, 711, 712, 713, 714, 715, 716].includes(sh);
    if (sh === 48 || sh === 232 || sh === 137 || (isBoulder && sh !== 665 && sh !== 711)
      || sh === 141 || sh === 135 || sh === 443) {
      st.wire[i] |= 64;   // invisibleBlock(true)
    }
  } else if (f.echoJustInnerBlocks) {
    let allSolid = true;
    for (let a = x - 1; a <= x + 1; a++) {
      for (let b = y - 1; b <= y + 1; b++) {
        if (!solidTile3FSC(st, a, b)) allSolid = false;
      }
    }
    if (allSolid) st.wire[i] |= 64 | 128;      // invisibleBlock+invisibleWall
    if (!f.errorWorld) st.wire[i] |= 128;      // invisibleWall
  } else {
    st.wire[i] |= 64 | 128;
  }
}

/** DoCoatEverythingEcho_ErrorRemoval（cs:990-1003）：隐形块停用/隐形墙清零/
 *  实心下墙清零。 */
function doCoatEverythingEchoErrorRemoval(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (st.wire[i] & 64) st.flags[i] = 0;        // invisibleBlock → active(false)
  if (st.wire[i] & 128) st.wall[i] = 0;        // invisibleWall → wall=0
  if (solidTile3FSC(st, x, y)) st.wall[i] = 0;
}

/** DoCoatEverythingIlluminant_SingleTile（cs:1005-1040）：fullbright 位
 *  （bit 暂记同上,渲染消费端批 F 接）。 */
function doCoatEverythingIlluminantSingleTile(st: TileStore, x: number, y: number, f: SeedFlags): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (f.illuminantJustSomeThings) {
    const sh = sheetOf(st.type[i]!);
    if (sh === 12 || sh === 665 || sh === 639) st.wire[i] |= 256;   // fullbrightBlock
  } else if (f.illuminantJustRandomSpots) {
    // JustRandomSpots 分支原版每格掷 Next(2)——全图 pass 侧消费（此处单格版不掷,
    // 与原版单格语义一致:掷在 DoCoatEverythingIlluminant 循环内）
    st.wire[i] |= 256 | 512;
  } else {
    st.wire[i] |= 256 | 512;
  }
}

/** DoPaintEverythingGray_SingleTile（cs:789-805）：Ore/Gems/178 → 漆 27（白变体 26）;
 *  否则块+墙同漆。 */
function doPaintEverythingGraySingleTile(st: TileStore, x: number, y: number, f: SeedFlags): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  const b = f.grayUseWhite ? 26 : 27;
  const sh = sheetOf(st.type[i]!);
  if (f.grayJustTreasure) {
    const ORE = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);
    const GEMS = new Set([178, 179, 180, 181, 182, 183]);
    if (ORE.has(sh) || GEMS.has(sh) || sh === 178) st.paint[i] = b;
  } else {
    st.paint[i] = b;
    st.paintWall[i] = b;
  }
}

/** DoPaintEverythingNegative_SingleTile（cs:817-893）：JustSomeThings 变体只涂地牢砖/
 *  裂砖/地牢墙/云/73 墙/192·384 藤族/60 墙;否则全涂 30。 */
function doPaintEverythingNegativeSingleTile(st: TileStore, x: number, y: number, justSomeThings: boolean): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (!justSomeThings) {
    st.paint[i] = 30;
    st.paintWall[i] = 30;
    return;
  }
  const sh = sheetOf(st.type[i]!);
  const DUNGEON_TILES = new Set([41, 43, 44, 677, 678, 679]);
  const DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
  const CRACKED = new Set([481, 482, 483]);
  const CLOUDS = new Set([189, 196, 460, 717, 718, 719]);
  if (st.flags[i] && DUNGEON_TILES.has(sh)) st.paint[i] = 30;
  if (st.flags[i] && CRACKED.has(sh)) st.paint[i] = 30;
  if (DUNGEON_WALLS.has(st.wall[i])) {
    st.paintWall[i] = 30;
    if (sh === 19) st.paint[i] = 30;
  }
  if (st.flags[i] && CLOUDS.has(sh)) st.paint[i] = 30;
  if (st.wall[i] === 73) st.paintWall[i] = 30;
  if (sh === 192 || sh === 384) {
    st.paint[i] = 30;
    const dSh = st.inBounds(x, y + 1) ? sheetOf(st.type[st.idx(x, y + 1)]!) : -1;
    if (dSh === 52 || dSh === 382 || dSh === 62) {
      for (let k = y + 1; k < st.h; k++) {
        const ki = st.idx(x, k);
        if (!st.flags[ki]) break;
        const ks = sheetOf(st.type[ki]!);
        if (ks !== 52 && ks !== 382 && ks !== 62) break;
        st.paint[ki] = 30;
      }
    }
    const uSh = st.inBounds(x, y - 1) ? sheetOf(st.type[st.idx(x, y - 1)]!) : -1;
    if (uSh === 186 || uSh === 187) {
      st.paint[st.idx(x, y - 1)] = 30;
      const u2 = st.inBounds(x, y - 2) ? sheetOf(st.type[st.idx(x, y - 2)]!) : -1;
      if (u2 === 186 || u2 === 187) st.paint[st.idx(x, y - 2)] = 30;
    }
  }
  if (st.wall[i] === 60) st.paintWall[i] = 30;
}

/** DoCoatEverythingEcho（cs:913-938）：边距 5 全图涂 + errorWorld ErrorRemoval +
 *  8000 箱 1/25 首空堆叠槽（自槽 1 起）塞 SpectreGoggles(4409)。
 *  ★1456 边距 0（全图含边框）→ 1457 收 5。chests 为世界箱注册表
 *  （items[i] = {id, stack}|null,槽 0 = 主件槽）。 */
export function doCoatEverythingEcho(st: TileStore, f: SeedFlags,
  chests: Array<{ items: Array<{ id: number; stack: number } | null> }> | null,
  rngNext25: () => boolean): void {
  const num = 5;
  for (let i = num; i < st.w - num; i++) {
    for (let j = num; j < st.h - num; j++) {
      doCoatEverythingEchoSingleTile(st, i, j, f);
    }
  }
  if (f.errorWorld) {
    for (let k = num; k < st.w - num; k++) {
      for (let l = num; l < st.h - num; l++) {
        doCoatEverythingEchoErrorRemoval(st, k, l);
      }
    }
  }
  if (!chests) return;
  const goggles = vidItem(4409);
  const limit = Math.min(8000, chests.length);
  for (let m = 0; m < limit; m++) {
    const items = chests[m]!.items;
    if (!rngNext25()) continue;                       // genRand.Next(25) != 0 → continue
    if (!items[1] || (items[1].stack ?? 0) === 0) continue;   // chest.item[1].stack == 0 → continue
    for (let n = 1; n < items.length; n++) {
      if (!items[n] || (items[n]!.stack ?? 0) === 0) {
        if (goggles >= 0) items[n] = { id: goggles, stack: 1 };
        break;
      }
    }
  }
}

/** DoCoatEverythingIlluminant（cs:1005 边距 5 全图）——JustRandomSpots 每格 1 掷 */
export function doCoatEverythingIlluminant(st: TileStore, f: SeedFlags, next2: () => boolean): void {
  const num = 5;
  for (let i = num; i < st.w - num; i++) {
    for (let j = num; j < st.h - num; j++) {
      if (f.illuminantJustRandomSpots && !next2()) continue;
      doCoatEverythingIlluminantSingleTile(st, i, j, f);
    }
  }
}

/** DoPaintEverythingGray（cs:777-805）：边距 5;JustTheSurface 上界逐列
 *  Min(w-5, worldSurface+Next(3))（同掷）。 */
export function doPaintEverythingGray(st: TileStore, f: SeedFlags, worldSurface: number, next3: () => number): void {
  const num = 5;
  let bound = st.h;
  for (let i = num; i < st.w - num; i++) {
    if (f.grayJustTheSurface) {
      bound = Math.min(st.w - 5, worldSurface + next3());
    }
    for (let j = num; j < bound; j++) doPaintEverythingGraySingleTile(st, i, j, f);
  }
}

/** DoPaintEverythingNegative（cs:806-815）：边距 5;JustUnderground 下界
 *  Max(5, worldSurface-Next(3)),上界 maxTilesY - 5 - 20（底边距 25 行,1456 是 30）。 */
export function doPaintEverythingNegative(st: TileStore, f: SeedFlags, worldSurface: number, next3: () => number): void {
  const num = 5;
  let lower = num;
  for (let i = num; i < st.w - num; i++) {
    if (f.negativeJustUnderground) {
      lower = Math.max(num, Math.floor(worldSurface) - next3());
    }
    for (let j = lower; j < st.h - num - 20; j++) doPaintEverythingNegativeSingleTile(st, i, j, f.negativeJustSomeThings ?? false);
  }
}
