// 原版 pass 21 "Marble"（cs:12800 + MarbleBiome.cs）/ 22 "Granite"（cs:12884 + GraniteBiome.cs）1:1。
// 大理石：3×3 板格穹顶洞窟——板状态机（空/实心/半砖/四三角）+ SmoothSlope 重分类，
// 上半中空（墙 178）下半实心大理石（367），矿石保留，PlaceTight 钟乳石 165。
// 花岗岩：200×200 magma 压力模拟（300 轮细胞自动机）→ 实心花岗岩体（368，墙 180）
// + ShouldUseLava + 孤块清理 + FastRandom(65440) 钟乳石装饰。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { FastRandom } from '../../../core/rng';
import { intersectsAnyPotentialDungeonBounds } from './DungeonStyles1457'; // ★IIIII88 dual 钉角/拒带

const MARBLE = TILE_BY_KEY['v_367_marble_block']!;
const GRANITE = TILE_BY_KEY['v_368_granite_block']!;
import { placeTight, placeUncheckedStalactite as placeStalactiteWithRolls, frame165 } from './ShimmerPass';
import { genSolidType } from './GenSolid';
const STALACTITE = TILE_BY_KEY['v_165_cave_decos']!; // 仅哈希/置型用；帧走 ShimmerPass
const SNOW = TILE_BY_KEY['snow']!, ICE = TILE_BY_KEY['ice']!, THIN_ICE = TILE_BY_KEY['thin_ice']!;
const MUSH_GRASS = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const MUSH_TREE = TILE_BY_KEY['v_72_mushroom_tree']!;
const SANDSTONE = TILE_BY_KEY['sandstone']!, HARDSAND = TILE_BY_KEY['hardened_sand']!;

/** Main.wallLargeFrames 非零墙（Main.cs 全 22 项：1=phlebas 2=lazure）——这些墙的
 *  Framing.WallFrame(resetFrame) 走查表分支 **不掷骰**；其余非零墙必掷 1×Next(0,3) */
const WALL_LARGE_FRAMES = new Set([224, 323, 324, 325, 326, 327, 328, 329, 330, 179, 146,
  147, 167, 185, 274, 354, 355, 358, 359, 362, 363, 366]);

/** WorldGen.SquareWallFrame(i,j)（cs:80941）中心格 Framing.WallFrame(resetFrame:true)
 *  的掷骰语义：wall==0 早退不掷；wallLargeFrames∈{1,2} 查表不掷；其余非零墙
 *  掷 1×Next(0,3)（Framing.cs:326-390，生成期无其他分支差异）。大理石 PlaceSlab/
 *  花岗岩 PlaceDecorations 每格调用——缺掷则 pass 内流偏移 → 后续放置全体错位。 */
export function squareWallFrameRoll(st: TileStore, rng: RNG, x: number, y: number): void {
  const wl = st.wall[st.idx(x, y)];
  if (wl !== 0 && !WALL_LARGE_FRAMES.has(wl)) rng.int(0, 2);
}

/** WorldGenRange Count（Configuration.json：Marble=WorldArea、Granite=WorldWidth，均 Min4/Max8）。
 *  4200×1200 两模式 scale 均 = 1 → Next(4,9)。 */
function worldGenRangeCount(st: TileStore, rng: RNG, min: number, max: number, mode: 'area' | 'width'): number {
  const scale = mode === 'area' ? (st.w * st.h) / 5040000 : st.w / 4200;
  const lo = Math.max(1, Math.trunc(scale * min));
  const hi = Math.max(lo, Math.trunc(scale * max));
  return rng.int(lo, hi); // Next(scaledMin, scaledMax+1)
}

/** BiomeTileCheck（cs:10949）1:1：半径 50 逐格；368/367/147/161/162/70/72/396/397
 *  （active 才判）+ 墙 187/216（无视 active）。 */
export function biomeTileCheck(st: TileStore, x: number, y: number): boolean {
  for (let i = x - 50; i <= x + 50; i++) {
    for (let j = y - 50; j <= y + 50; j++) {
      if (!st.inBounds(i, j)) continue;
      const k = st.idx(i, j);
      if (st.flags[k]) {
        const t = st.type[k];
        if (t === GRANITE || t === MARBLE || t === SNOW || t === ICE || t === THIN_ICE
          || t === MUSH_GRASS || t === MUSH_TREE || t === SANDSTONE || t === HARDSAND) return true;
      }
      const wl = st.wall[k];
      if (wl === 187 || wl === 216) return true;
    }
  }
  return false;
}

/** SolidOrSlopedTile（cs:70064）：active && tileSolid && !tileSolidTop && !inActive。
 *  slope/halfBrick 不参与（半砖/坡面仍是"实或坡"）。生成期无 actuator/平台类活性块，
 *  tileSolidTop 恒 false（本 pass 阶段世界无平台/桌子类），inActive 恒 false。 */
function solidOrSlopedAt(st: TileStore, x: number, y: number): boolean {
  return st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0
    && genSolidType(st.type[st.idx(x, y)]);
}

function solidTileAt(st: TileStore, x: number, y: number): boolean {
  // ★生成期实心走 genSolidType（cs:12537 起生成期 tileSolid[484]=false）：本 pass
  // 在 Desert 之后，CA 初值/放置门/清理门的 SolidTile 查询若用裸 TILE_DEFS.solid
  // （484=true），与 oracle 的 SOLID.Remove(484) 分叉——地下沙漠边缘的 484 会被
  // JS 当实心花岗岩腔壁（granite checkpoint 三哈希全差）。
  // ★SolidTile（cs:70155）还要求 !halfBrick && slope==0——PlaceSlab 每格调
  //  Tile.SmoothSlope 给大理石格上坡面/半砖后，后续 PlaceTight 门的 SolidTile 查询
  //  对这些格必须判非实心（否则门骰多掷 → pass 流全体错位）
  if (!solidOrSlopedAt(st, x, y)) return false;
  const i = st.idx(x, y);
  return st.half[i] === 0 && st.slope[i] === 0;
}

/** CanPoundTile（cs:81434）排除表（switch default true）：SmoothSlope 前置门 */
const NO_POUND_SHEETS = new Set([10, 48, 137, 232, 380, 387, 388, 476, 484]);
const sheetOfTile = (st: TileStore, i: number): number =>
  TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;

/** Tile.SmoothSlope（Tile.cs:822，applyToNeighbors=true）1:1。
 *  邻序 (x+1,y)→(x-1,y)→(x,y+1)→(x,y-1) 后自身；CanPoundTile||SolidOrSlopedTile 门；
 *  四邻 mask（上"非空"bit3 用 TileEmpty 语义）→ 半砖/坡面重分类。无掷骰但改
 *  half/slope 状态 → 影响后续 SolidTile 门与最终坡面。 */
function tileSmoothSlope(st: TileStore, x: number, y: number): void {
  for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Array<[number, number]>) {
    smoothSlopeSelf(st, nx, ny);
  }
  smoothSlopeSelf(st, x, y);
}

function smoothSlopeSelf(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (NO_POUND_SHEETS.has(sheetOfTile(st, i)) || !solidOrSlopedAt(st, x, y)) return;
  // TileEmpty(x,y-1)（cs:70037）：非 active（或 actuator 失活）即空
  const aboveNotEmpty = st.inBounds(x, y - 1) && st.flags[st.idx(x, y - 1)] !== 0;
  const aboveNotSolid = !solidOrSlopedAt(st, x, y - 1);
  const mask = ((aboveNotEmpty ? 1 : 0) << 3)
    | ((solidOrSlopedAt(st, x, y + 1) ? 1 : 0) << 2)
    | ((solidOrSlopedAt(st, x - 1, y) ? 1 : 0) << 1)
    | (solidOrSlopedAt(st, x + 1, y) ? 1 : 0);
  const flag2 = aboveNotSolid && aboveNotEmpty;
  switch (mask) {
    case 10: if (!flag2) { st.half[i] = 0; st.slope[i] = 3; } break;
    case 9: if (!flag2) { st.half[i] = 0; st.slope[i] = 4; } break;
    case 6: st.half[i] = 0; st.slope[i] = 1; break;
    case 5: st.half[i] = 0; st.slope[i] = 2; break;
    case 4: st.slope[i] = 0; st.half[i] = 1; break;
    default: st.half[i] = 0; st.slope[i] = 0; break;
  }
}

/** TileID.Sets.Ore（TileID.cs:399，19 个）——大理石/花岗岩 ResetToType 的矿石保留判定。
 *  曾抄成 20/203/70/21/116/234 的杂表 → 花岗岩体内矿石被吞（granite checkpoint 纯 type 差） */
const VANILLA_ORE = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);
// ★IIIII14（GraniteBiome.cs:213-216/262-265、MarbleBiome.cs:116-119）：drunk 世界
// 大理石/花岗岩「生成式互换」——大理石园放花岗岩块(368/墙180)、花岗岩园放大理石块
// (367/墙178)。vanilla 是各 Place 内的常量替换；本仓经模块档位传递（两入口置位）。
let drunkStoneSwap = false;

function isOreType(t: number): boolean {
  const v = TILE_DEFS[t]?.vanilla?.sheet;
  return v != null && VANILLA_ORE.has(v);
}

export function runMarbleGranitePass(st: TileStore, rng: RNG, gs: GenState,
  gp?: import('../GenProgress').GenProgress): void {
  // Marble(12800)/Granite(12884) 各自是独立 GenPass——RunPass 每 pass 前重播种子
  // ★进度：Marble 窗由包装层 beginVan；本层只补 Granite 子窗
  rng.reseed(gs.seed);                          // ▶Marble cs:12800
  runMarblePass(st, rng, gs);
  rng.reseed(gs.seed); gp?.beginVan('Granite'); // ▶Granite cs:12884
  runGranitePass(st, rng, gs);
}

/** cs:12800-12883：采样带 = n/num*(w-200)+100 起宽 (w-160)/num；
 *  y∈[GenVars.rockLayer+20, +(h-rockLayer-40-200))；★IIIII58 REMIX（cs:12856-12857
 *  三元第二支）：remixWorldGen 时 y∈[GenVars.worldSurface+100, GenVars.rockLayer)
 *  （height=rock−ws−100，Next(y0,y0+h)=含端 [ws+100, rock−1]）——remix 把蘑菇/大理石
 *  整体抬到浅层。中部 45-55% 重掷 beachDistance..w-；100 次预算；失败计数 > w*10
 *  收缩 count。Place 内联在采样环（BiomeTileCheck 双查）。 */
export function runMarblePass(st: TileStore, rng: RNG, gs: GenState): void {
  drunkStoneSwap = !!gs.seedFlags.drunkWorld;
  let count = worldGenRangeCount(st, rng, 4, 8, 'area');
  // ★IIIII88（WorldGen.cs:12821-12824）：dual 时 Marble Count GetRandom 后减半
  if (gs.seedFlags.dualDungeons) count = Math.trunc(count / 2);
  const isDual = !!gs.seedFlags.dualDungeons;
  let placed = 0, fails = 0;
  while (placed < count) {
    const frac = placed / count;
    let x = 0, y = 0, ok = false;
    let budget = 100;
    while (!ok) {
      budget--;
      if (budget <= 0) break;
      if (!isDual) {
        const x0 = Math.trunc(frac * (st.w - 200)) + 100;
        x = rng.int(x0, x0 + Math.trunc((st.w - 160) / count) - 1);   // RandomRectanglePoint 先 X
        // ★IIIII58：REMIX 世界走 cs:12857 第二支——Y 带 worldSurface+100 .. rockLayer
        const y0 = !!gs.seedFlags.remix
          ? Math.trunc(gs.genWorldSurface) + 100
          : Math.trunc(gs.genRockLayer) + 20;                          // GenVars.rockLayer（raw 截断）
        const yH = !!gs.seedFlags.remix
          ? Math.trunc(gs.genRockLayer) - Math.trunc(gs.genWorldSurface) - 100
          : st.h - (Math.trunc(gs.genRockLayer) + 40) - 200;
        y = rng.int(y0, y0 + yH - 1);                                  // 后 Y
        while (x > st.w * 0.45 && x < st.w * 0.55) x = rng.int(gs.beachDistance, st.w - gs.beachDistance - 1);
        ok = true;
      } else {
        // ★IIIII88 双地牢钉角支（WorldGen.cs:12836-12858）：origin 按 placed 序号钉两侧
        //   （case0=左上 120..220、case1=右上 w-220..w-120、default=全幅 120..w-120），
        //   ±40 拒带门=IntersectsAnyPotentialDungeonBounds 取反——命中则整环重掷。
        let xa = 120, xb = 121;
        switch (placed) {
          case 0: xa = 120; xb = 220; break;
          case 1: xa = st.w - 120 - 100; xb = st.w - 120; break;
          default: xa = 120; xb = st.w - 120; break;
        }
        const y0r = !!gs.seedFlags.remix
          ? Math.trunc(gs.genWorldSurface) + 100
          : Math.trunc(gs.genRockLayer) + 20;
        const yHr = !!gs.seedFlags.remix
          ? Math.trunc(gs.genRockLayer) - Math.trunc(gs.genWorldSurface) - 100
          : st.h - (Math.trunc(gs.genRockLayer) + 40) - 200;
        x = rng.int(xa, xa + (xb - xa) - 1);
        y = rng.int(y0r, y0r + yHr - 1);
        ok = !intersectsAnyPotentialDungeonBounds(x - 40, y - 40, x + 40, y + 40);
      }
    }
    fails++;
    if (ok && marblePlace(st, rng, x, y)) { placed++; fails = 0; }
    else if (fails > st.w * 10) { count = placed; placed++; fails = 0; }
  }
}

/** MarbleBiome.Place（MarbleBiome.cs:180-253）1:1 */
function marblePlace(st: TileStore, rng: RNG, ox0: number, oy0: number): boolean {
  if (biomeTileCheck(st, ox0, oy0)) return false;
  const bn = Math.trunc(rng.int(80, 149) / 3);          // Next(80,150)/3
  const bn2 = Math.trunc(rng.int(40, 59) / 3);          // Next(40,60)/3
  const bn3 = Math.trunc((bn2 * 3 - rng.int(20, 29)) / 3);
  const ox = ox0 - Math.trunc(bn * 3 / 2), oy = oy0 - Math.trunc(bn2 * 3 / 2);
  // Slab 状态机：0空 1实心 2半砖 3右下 4左下 5右上 6左上
  const state: number[][] = [];
  const hasWall: boolean[][] = [];
  for (let i = 0; i < bn + 2; i++) { state.push(new Array(bn2 + 2).fill(0)); hasWall.push(new Array(bn2 + 2).fill(false)); }
  const groupSolid = (x: number, y: number): boolean => {
    let cnt = 0;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (solidOrSlopedAt(st, x + a, y + b)) cnt++;
    return cnt > 0;                                     // scale/4*3 = 0（int 除）；IsGroupSolid 用 SolidOrSlopedTile
  };
  for (let i = -1; i < bn + 1; i++) {
    const n4 = (i - Math.trunc(bn / 2)) / bn + 0.5;
    const n5 = Math.trunc((0.5 - Math.abs(n4 - 0.5)) * 5) - 2;
    for (let j = -1; j < bn2 + 1; j++) {
      let wall = true, solid = false;
      const g2 = groupSolid(i * 3 + ox, j * 3 + oy);
      const n6 = Math.abs(j - Math.trunc(bn2 / 2)) - Math.trunc(bn3 / 4) + n5;
      if (n6 > 3) { solid = g2; wall = false; }
      else if (n6 > 0) { solid = j - Math.trunc(bn2 / 2) > 0 || g2; wall = j - Math.trunc(bn2 / 2) < 0 || n6 <= 2; }
      else if (n6 === 0) solid = rng.int(0, 1) === 0 && (j - Math.trunc(bn2 / 2) > 0 || g2);
      if (Math.abs(n4 - 0.5) > 0.35 + rng.next() * 0.1 && !g2) { wall = false; solid = false; }
      state[i + 1]![j + 1] = solid ? 1 : 0;
      hasWall[i + 1]![j + 1] = wall;
    }
  }
  const slabSolid = (s: number, lx: number, ly: number, scale: number): boolean => {
    switch (s) {
      case 0: return false;
      case 1: return true;
      case 2: return ly >= Math.trunc(scale / 2);
      case 3: return lx >= scale - ly;
      case 4: return lx < ly;
      case 5: return lx > ly;
      case 6: return lx < scale - ly;
      default: return true;
    }
  };
  // SmoothSlope（MarbleBiome.cs:79-110）：4 邻实心码 → 状态重分类
  for (let i = 0; i < bn; i++) {
    for (let j = 0; j < bn2; j++) {
      const sx = i + 1, sy = j + 1;
      if (state[sx]![sy] === 0) continue;
      const code = ((state[sx]![sy - 1] !== 0 ? 1 : 0) << 3)
        | ((state[sx]![sy + 1] !== 0 ? 1 : 0) << 2)
        | ((state[sx - 1]![sy] !== 0 ? 1 : 0) << 1)
        | (state[sx + 1]![sy] !== 0 ? 1 : 0);
      state[sx]![sy] = code === 10 ? 6 : code === 9 ? 5 : code === 6 ? 4 : code === 5 ? 3 : code === 4 ? 2 : 1;
    }
  }
  const bn7 = Math.trunc(bn / 2), bn8 = Math.trunc(bn2 / 2);
  const bn9 = (bn8 + 1) * (bn8 + 1);
  const vv = rng.next() * 2 - 1, vv2 = rng.next() * 2 - 1, vv3 = rng.next() * 2 - 1;
  let n11 = 0;
  for (let m = 0; m <= bn; m++) {
    const n12 = bn8 / bn7 * (m - bn7);
    const n13 = Math.min(bn8, Math.trunc(Math.sqrt(Math.max(0, bn9 - n12 * n12))));
    n11 = m >= Math.trunc(bn / 2)
      ? n11 + (vv2 + (vv3 - vv2) * (m / Math.trunc(bn / 2) - 1))
      : n11 + (vv + (vv2 - vv) * (m / Math.trunc(bn / 2)));
    for (let n = bn8 - n13; n <= bn8 + n13; n++) {
      // PlaceSlab（scale=3）
      const pOX = m * 3 + ox, pOY = n * 3 + oy + Math.trunc(n11);
      const pst = state[m + 1]![n + 1]!, pWall = hasWall[m + 1]![n + 1]!;
      const __probe = (globalThis as { __swSlabProbe?: (x: number, y: number, pst: number, pWall: boolean) => void }).__swSlabProbe;
      if (__probe) __probe(pOX, pOY, pst, pWall);
      let pn4 = 0, pn5 = 3;
      for (let i = -1; i < 4; i++) {
        if ((i === -1 || i === 3) && rng.int(0, 1) === 0) continue;   // 边缘列 50% 跳过
        if (rng.int(0, 1) === 0) pn4--;
        if (rng.int(0, 1) === 0) pn5++;
        for (let j = pn4; j < pn5; j++) {
          const px = pOX + i, py = pOY + j;
          if (!st.inBounds(px, py)) continue;
          const ti = st.idx(px, py);
          // ★IIIII14：slab 材质档（PlaceSlab 头 num/wall 常量——drunk 368/180）
          const mT = drunkStoneSwap ? GRANITE : MARBLE;
          const mW = drunkStoneSwap ? 180 : 178;
          st.type[ti] = isOreType(st.type[ti]) ? st.type[ti] : mT;  // ResetToType：矿石保留
          st.flags[ti] = slabSolid(pst, i, j, 3) ? 1 : 0;
          st.liquid[ti] = 0; st.liquidType[ti] = 0;
          st.half[ti] = 0; st.slope[ti] = 0;  // ResetToType 清 sTileHeader（半砖/坡面）
          // ★IIIII169·B1（R1）：Tile.ResetToType（Tile.cs:251-261）frameX=0/frameY=0——
          // 生成期 TileFrame 的 TileFrameCosmetic 被 !generatingWorld 门死（WorldGen.cs:82652）
          // 帧不会邻接重排,必须显式清零;否则 placeTight 钟乳石材质带残帧（486/504/522,18..90）
          // 在 marblePlace 覆写时顺延（x86 窗 #21 一跳 t367 f(0,0)）
          st.frameX[ti] = 0; st.frameY[ti] = 0;
          // ★wall 是 Tile.cs 独立 ushort 字段——ResetToType 的 bTileHeader*=0 不清墙，
          // HasWall=false 时保留旧墙（SquareWallFrame 掷照旧）
          if (pWall) st.wall[ti] = mW;
          // WorldUtils.TileFrame(frameNeighbors:true)（cs:WorldUtils.cs:79-88）：
          // 中心 + (x+1,y)/(x-1,y)/(x,y+1)/(x,y-1) 各一次 TileFrameImportant——
          // 165 格 → CheckStalactite 重查（支撑被后续格上坡 → 击杀/重定型掷）
          frame165(st, rng, px, py);
          frame165(st, rng, px + 1, py);
          frame165(st, rng, px - 1, py);
          frame165(st, rng, px, py + 1);
          frame165(st, rng, px, py - 1);
          // SquareWallFrame：中心格 WallFrame(resetFrame:true) 非零墙掷 1×Next(0,3)
          //（PlaceSlab 每格,cs:MarbleBiome.cs:160-168）
          squareWallFrameRoll(st, rng, px, py);
          // Tile.SmoothSlope（applyToNeighbors=true）：无掷但写 half/slope——
          // 影响本列/邻列后续 SolidTile 门（PlaceTight 骰）与最终坡面
          tileSmoothSlope(st, px, py);
          if (solidTileAt(st, px, py - 1) && rng.int(0, 3) === 0) placeTight(st, rng, px, py);
          if (solidTileAt(st, px, py) && rng.int(0, 3) === 0) placeTight(st, rng, px, py - 1);
        }
      }
    }
  }
  return true;
}

/** cs:12884-12975：采样与放置两段分离——先收点（CanPlace = !BiomeTileCheck && !active），
 *  再统一 Place。带宽 (w-200)/num。 */
export function runGranitePass(st: TileStore, rng: RNG, gs: GenState): void {
  drunkStoneSwap = !!gs.seedFlags.drunkWorld;
  let count = worldGenRangeCount(st, rng, 4, 8, 'width');
  // ★IIIII88（WorldGen.cs:12892-12895）：dual 时 Granite Count GetRandom 后减半
  if (gs.seedFlags.dualDungeons) count = Math.trunc(count / 2);
  const isDual = !!gs.seedFlags.dualDungeons;
  const pts: Array<[number, number]> = [];
  let placed = 0, fails = 0;
  while (placed < count) {
    const frac = placed / count;
    let x = 0, y = 0, ok = false;
    let budget = 100;
    while (!ok) {
      budget--;
      if (budget <= 0) break;
      if (!isDual) {
        const x0 = Math.trunc(frac * (st.w - 200)) + 100;
        x = rng.int(x0, x0 + Math.trunc((st.w - 200) / count) - 1);
        // ★IIIII58：REMIX 世界走 cs:12932 第二支——Y 带 worldSurface+100 .. rockLayer
        const y0 = !!gs.seedFlags.remix
          ? Math.trunc(gs.genWorldSurface) + 100
          : Math.trunc(gs.genRockLayer) + 20;
        const yH = !!gs.seedFlags.remix
          ? Math.trunc(gs.genRockLayer) - Math.trunc(gs.genWorldSurface) - 100
          : st.h - (Math.trunc(gs.genRockLayer) + 40) - 200;
        y = rng.int(y0, y0 + yH - 1);
        while (x > st.w * 0.45 && x < st.w * 0.55) x = rng.int(gs.beachDistance, st.w - gs.beachDistance - 1);
        ok = true;
      } else {
        // ★IIIII88 双地牢钉角支（WorldGen.cs:12907-12933）：与 Marble 同形,±40 拒带
        let xa = 120, xb = 121;
        switch (placed) {
          case 0: xa = 120; xb = 220; break;
          case 1: xa = st.w - 120 - 100; xb = st.w - 120; break;
          default: xa = 120; xb = st.w - 120; break;
        }
        const y0r = !!gs.seedFlags.remix
          ? Math.trunc(gs.genWorldSurface) + 100
          : Math.trunc(gs.genRockLayer) + 20;
        const yHr = !!gs.seedFlags.remix
          ? Math.trunc(gs.genRockLayer) - Math.trunc(gs.genWorldSurface) - 100
          : st.h - (Math.trunc(gs.genRockLayer) + 40) - 200;
        x = rng.int(xa, xa + (xb - xa) - 1);
        y = rng.int(y0r, y0r + yHr - 1);
        ok = !intersectsAnyPotentialDungeonBounds(x - 40, y - 40, x + 40, y + 40);
      }
    }
    fails++;
    if (ok && !biomeTileCheck(st, x, y) && !(st.inBounds(x, y) && st.flags[st.idx(x, y)])) {
      pts.push([x, y]); placed++;
    } else if (fails > st.w * 10) { count = placed; placed++; fails = 0; }
  }
  for (let i = 0; i < count && i < pts.length; i++) granitePlace(st, rng, gs, pts[i]![0]!, pts[i]![1]!);
}

/** GraniteBiome.Place（GraniteBiome.cs:73-353）1:1：magma 压力 CA → 放置 → 清理 → 装饰 */
function granitePlace(st: TileStore, rng: RNG, gs: GenState, x0: number, y0: number): void {
  const __probe = (globalThis as { __swGranitePlace?: (x: number, y: number) => void }).__swGranitePlace;
  if (__probe) __probe(x0, y0);
  if (!st.inBounds(x0, y0) || st.flags[st.idx(x0, y0)]) return;
  const gox = x0 - 100, goy = y0 - 100;             // 200×200 magma 图
  // let:轮末 Utils.Swap 引用交换(GraniteBiome.cs:186)
  let pres = new Float64Array(200 * 200);
  let res = new Float64Array(200 * 200);
  let mact = new Uint8Array(200 * 200);
  for (let a = 0; a < 200; a++) {
    for (let b = 0; b < 200; b++) {
      res[a * 200 + b] = solidTileAt(st, a + gox, b + goy) ? 4 : 1;
    }
  }
  // 8 邻域单位向量（Vector2D.Normalize）
  const NVX = [-Math.SQRT1_2, -1, -Math.SQRT1_2, 0, 0, 0, Math.SQRT1_2, 1, Math.SQRT1_2];
  const NVY = [-Math.SQRT1_2, 0, Math.SQRT1_2, -1, 0, 1, -Math.SQRT1_2, 0, Math.SQRT1_2];
  let x3 = 100, x4 = 100, y3 = 100, y4 = 100;
  // ★原版双缓冲稀疏写+轮末 Swap(GraniteBiome.cs:47-49/:186-187):target 在
  //  BuildMagmaMap 时全新(全 0),循环只写被激活/过压力门的格,轮末交换数组引用——
  //  本轮未写格保留 **i-2 轮**值。曾每轮 tPres.set(pres) 全量刷新 → 未写格保留
  //  i-1 轮值,CA 边界低压力格行为分叉
  // ★BuildMagmaMap(GraniteBiome.cs:96-107):target 缓冲初始为 source 的**别名拷贝**
  //  (未写格 Resistance 恒保持地形初值 1/4,非全 0)——曾 new 全 0 数组,CA 边界
  //  电阻场差一个量级(oracle 对账揪出;此前为对齐 JS 曾在 oracle 镜像 0 初值,现
  //  双侧回正原版语义)
  const tPres0 = Float64Array.from(pres);
  const tRes0 = Float64Array.from(res);
  const tAct0 = Uint8Array.from(mact);
  let tPres = tPres0, tRes = tRes0, tAct = tAct0;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  for (let it = 0; it < 300; it++) {
    for (let j = x3; j <= x4; j++) {
      for (let k = y3; k <= y4; k++) {
        const ji = j * 200 + k;
        if (!mact[ji]) continue;
        let sum = 0, vx = 0, vy = 0;
        for (let l = -1; l <= 1; l++) {
          for (let m = -1; m <= 1; m++) {
            if (l === 0 && m === 0) continue;
            const vi = (l + 1) * 3 + (m + 1);
            const ni = (j + l) * 200 + (k + m);
            const np = pres[ni]!;
            if (pres[ji]! > 0.01 && !mact[ni]) {
              if (l === -1) x3 = clamp(j + l, 1, x3); else x4 = clamp(j + l, x4, 198);
              if (m === -1) y3 = clamp(k + m, 1, y3); else y4 = clamp(k + m, y4, 198);
              // ToFlow(:31):保压/保阻,置 active——稀疏写下须整格写入 target
              tPres[ni] = pres[ni]!; tRes[ni] = res[ni]!; tAct[ni] = 1;
            }
            sum += np;
            vx += np * NVX[vi]!; vy += np * NVY[vi]!;
          }
        }
        sum /= 8;
        if (sum > res[ji]!) {
          const len = Math.sqrt(vx * vx + vy * vy) / 8;
          let nv = Math.max(sum - len - pres[ji]!, 0) + len + pres[ji]! * 0.875 - res[ji]!;
          nv = Math.max(0, nv);
          tPres[ji] = nv;
          tRes[ji] = Math.max(0, res[ji]! - nv * 0.02);
          // CreateFlow(:31)恒 active:true——整格写入含激活位。曾只写压力/电阻：
          // 稀疏交换语义下本格 target 残留 i-2 轮 inactive 态 → CA 细胞提前死亡、
          // 花岗岩腔边界比原版小一圈（wall 180 网大面积缺失）
          tAct[ji] = 1;
        }
      }
    }
    // CreateFlow(25.0) 默认 resistance=0(:34)——中心注入须清 tRes(曾残留初值
    // 1/4,中心压差差一个量级并外传全图)
    if (it < 2) { tPres[100 * 200 + 100] = 25; tRes[100 * 200 + 100] = 0; tAct[100 * 200 + 100] = 1; }
    // Utils.Swap(引用交换,零拷贝)
    let tp = pres; pres = tPres; tPres = tp;
    tp = res; res = tRes; tRes = tp;
    let tq = mact; mact = tAct; tAct = tq;
  }
  // ShouldUseLava：中心线 ≤ lavaLine-30 免岩浆；±50 内有冰雪/薄冰(161-163)/200 拒绝
  const useLava = (() => {
    if (goy + 100 <= gs.lavaLine - 30) return false;
    for (let a = -50; a < 50; a++) {
      for (let b = -50; b < 50; b++) {
        const ax = gox + 100 + a, ay = goy + 100 + b;
        if (ax >= 10 && ax < st.w - 10 && ay >= 10 && ay < st.h - 10 && st.flags[st.idx(ax, ay)]) {
          const t = TILE_DEFS[st.type[st.idx(ax, ay)]]?.vanilla?.sheet ?? 0;
          if (t === 147 || t === 200 || (t >= 161 && t <= 163)) return false;
        }
      }
    }
    return true;
  })();
  // PlaceGranite
  for (let i = x3; i <= x4; i++) {
    for (let j = y3; j <= y4; j++) {
      const mi = i * 200 + j;
      const tx = gox + i, ty = goy + j;
      if (tx < 10 || tx >= st.w - 10 || ty < 10 || ty >= st.h - 10 || !mact[mi]) continue;
      const ti = st.idx(tx, ty);
      const gnum = Math.sin((goy + j) * 0.4) * 0.7 + 1.2;
      const gnum2 = 0.2 + 0.5 / Math.sqrt(Math.max(0, pres[mi]! - res[mi]!));
      // ★IIIII14：granite 园材质/墙档（PlaceGranite 头——drunk 置 367/178）
      const gT = drunkStoneSwap ? MARBLE : GRANITE;
      const gW = drunkStoneSwap ? 178 : 180;
      if (Math.max(1 - Math.max(0, gnum * gnum2), pres[mi]! / 15) > 0.35 + (solidTileAt(st, tx, ty) ? 0 : 0.5)) {
        st.type[ti] = isOreType(st.type[ti]) ? st.type[ti] : gT;
        st.flags[ti] = 1; st.liquid[ti] = 0; st.liquidType[ti] = 0;
        st.half[ti] = 0; st.slope[ti] = 0;           // ResetToType 清 sTileHeader
        // ★IIIII169·B1（R1）：同 marblePlace——ResetToType 帧清零（残帧只进 ResetToType 支;
        // res<0.01 ClearTile 支与 CleanupTiles 是 Tile.ClearTile（Tile.cs:124-128）帧保留,
        // 反向清帧=R3 教训,勿加）
        st.frameX[ti] = 0; st.frameY[ti] = 0;
        st.wall[ti] = gW;
      } else if (res[mi]! < 0.01) {
        st.flags[ti] = 0;                            // ClearTile：type/wall/液体保留
        st.half[ti] = 0; st.slope[ti] = 0;           // ClearSlope
        st.wall[ti] = gW;
      }
      if (st.liquid[ti] > 0 && useLava) st.liquidType[ti] = 2;
    }
  }
  // CleanupTiles：3×3 实心邻 <3 的活性花岗岩清除
  const clean: Array<[number, number]> = [];
  for (let i = x3; i <= x4; i++) {
    for (let j = y3; j <= y4; j++) {
      if (!mact[i * 200 + j]) continue;
      const tx = gox + i, ty = goy + j;
      if (tx < 10 || tx >= st.w - 10 || ty < 10 || ty >= st.h - 10 || !solidTileAt(st, tx, ty)) continue;
      let cnt = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (solidTileAt(st, tx + a, ty + b)) cnt++;
      if (cnt < 3) clean.push([tx, ty]);
    }
  }
  for (const [cx, cy] of clean) {
    const ti = st.idx(cx, cy);
    st.flags[ti] = 0; st.wall[ti] = drunkStoneSwap ? 178 : 180;   // CleanupTiles 墙档(cs:262-265)
    st.half[ti] = 0; st.slope[ti] = 0;               // ClearTile→ClearSlope
  }
  // PlaceDecorations：FastRandom(seed).WithModifier(65440) 独立流（与 genRand 无关）
  const fr = new FastRandom(gs.seed).withModifier(65440);
  for (let i = x3; i <= x4; i++) {
    for (let j = y3; j <= y4; j++) {
      const mi = i * 200 + j;
      const tx = gox + i, ty = goy + j;
      if (tx < 10 || tx >= st.w - 10 || ty < 10 || ty >= st.h - 10 || !mact[mi]) continue;
      // WorldUtils.TileFrame → 165 格 CheckStalactite 重查（GraniteBiome.cs:345）
      frame165(st, rng, tx, ty);
      // SquareWallFrame：非零墙掷 1×Next(0,3)（GraniteBiome.cs:346 每活性格）
      squareWallFrameRoll(st, rng, tx, ty);
      const fr2 = fr.withModifierXY(tx, ty);
      if (fr2.nextMax(8) === 0 && st.flags[st.idx(tx, ty)]) {
        if (ty + 1 < st.h && !st.flags[st.idx(tx, ty + 1)]) {
          placeStalactiteWithRolls(st, tx, ty + 1, fr2.nextMax(2) === 0, fr2.nextMax(3));
        }
        if (ty - 1 >= 0 && !st.flags[st.idx(tx, ty - 1)]) {
          placeStalactiteWithRolls(st, tx, ty - 1, fr2.nextMax(2) === 0, fr2.nextMax(3));
        }
      }
      if (fr2.nextMax(2) === 0) tileSmoothSlope(st, tx, ty);  // Tile.SmoothSlope（GraniteBiome.cs:352）
    }
  }
}
