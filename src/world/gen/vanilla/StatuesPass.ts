// 原版 "Statues" pass 1:1(cs:16952-17055 + SetupStatueList cs:4395 + PlaceStatueTrap cs:4436)。
// statueList 73 项:0-43 段 (105,i) 但 [34]=(349,0)、[43]=(105,50),
// 追加 63,64,65,66,68,69,70,71,72,73,75,51..62,77,78,67,74,37,2。
// 数量 = floor(73*2*w/4200);逐个顺序轮换取样式,落点向下扫到首个实心格上一格放置;
// 陷阱雕像样式 {4,7,10,18}(GenVars.StatuesWithTraps)→ 邻近放飞镖陷阱 137 并拉线。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS } from '../../../data/tiles';
import { vanGenSolidType } from './GenSolid';
import { genSquareTileFrame } from './FinalCleanupPass';
import { genSolidType } from './GenSolid';

/** statueList(cs:4395-4433):73 项 (tile, style) 对,原序 */
export const STATUE_LIST: Array<[number, number]> = (() => {
  const list: Array<[number, number]> = [];
  for (let i = 0; i < 44; i++) list.push([105, i]);
  list[34] = [349, 0];
  list[43] = [105, 50];
  for (const s of [63, 64, 65, 66, 68, 69, 70, 71, 72, 73, 75,
    51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62,
    77, 78, 67, 74, 37, 2]) list.push([105, s]);
  return list;
})();

const STATUE = STATUE_LIST;

/** 陷阱雕像 = 列表索引 {4,7,10,18}(GenVars.StatuesWithTraps;索引<34 时与样式同值) */
export const STATUES_WITH_TRAPS = new Set([4, 7, 10, 18]);

/** flag2 锚门谓词集（cs:17025：active && tileFrameImportant && !tileCut）——
 *  Main.cs 全量 frameImportant(411 含循环 435-439+Echo 家族)扣除 tileCut(41)精确集。
 *  ★tileCut 成员（484/485/482 草族等）虽 frameImportant 但不过门（TileRunner 同源
 *  表副本——本仓"同源副本禁 import"惯例）。 */
const FR_IMPORTANT_NOCUT = new Set([
  4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 26, 27, 29, 31, 33, 34, 35, 36,
  42, 49, 50, 55, 72, 77, 78, 79, 81, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97,
  98, 99, 100, 101, 102, 103, 104, 105, 106, 114, 125, 126, 128, 129, 132, 133, 134, 135,
  136, 137, 138, 139, 141, 142, 143, 144, 149, 165, 171, 172, 173, 174, 178, 185, 186, 187,
  207, 209, 210, 212, 215, 216, 217, 218, 219, 220, 227, 228, 233, 235, 237, 238, 239, 240,
  241, 242, 243, 244, 245, 246, 247, 269, 270, 271, 275, 276, 277, 278, 279, 280, 281, 282,
  283, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301,
  302, 303, 304, 305, 306, 307, 308, 309, 310, 314, 316, 317, 318, 319, 320, 323, 324, 334,
  335, 337, 338, 339, 349, 354, 355, 356, 358, 359, 360, 361, 362, 363, 364, 372, 373, 374,
  375, 376, 377, 378, 380, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 405, 406, 410,
  411, 412, 413, 414, 419, 420, 423, 424, 425, 427, 428, 429, 435, 436, 437, 438, 439, 440,
  441, 442, 443, 445, 452, 453, 455, 456, 457, 461, 462, 463, 464, 465, 466, 467, 468, 469,
  470, 471, 475, 476, 480, 486, 487, 488, 489, 490, 491, 493, 494, 497, 499, 505, 506, 509,
  510, 511, 520, 521, 522, 523, 524, 525, 526, 527, 530, 531, 532, 533, 538, 542, 543, 544,
  545, 547, 548, 550, 551, 552, 553, 554, 555, 556, 558, 559, 560, 564, 565, 567, 568, 569,
  570, 571, 572, 573, 579, 580, 581, 582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592,
  593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610,
  611, 612, 613, 614, 615, 616, 617, 619, 620, 621, 622, 623, 624, 629, 630, 631, 632, 634,
  639, 640, 642, 643, 644, 645, 646, 647, 648, 649, 650, 651, 652, 653, 656, 657, 658, 660,
  663, 664, 665, 693, 694, 695, 696, 698, 699, 700, 701, 702, 703, 704, 705, 706, 707, 709,
  710, 712, 713, 714, 715, 716, 720, 721, 723, 724, 725, 726, 733, 751, 752,
]);

/** Place1x1 机关门的 Boulders 底座排除（TileID.Sets.Boulders，TileID.cs:195；
 *  Place1x1 cs:45213：IsAMechanism[135] && Boulders[底.type] → 拒放陷阱） */
const BOULDERS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);

/** Check2x2 上方箱族豁免（cs:48483-85：BasicChest{21,467}+BasicChestFake{441,468}
 *  +88 梳妆台+470 人偶架+475 帽架；裸读 type 不查 active——ghost type 保真）。
 *  与 FinalCleanupPass/HalfBrickPass 同源表副本（"同源副本禁 import"惯例）。 */
const CHEST_PROTECT_2X2 = new Set([21, 467, 441, 468, 88, 470, 475]);
const PLATFORMS_TOP = new Set([19, 427, 435, 436, 437, 438, 439]);
const platformProperTop = (fx: number): boolean => {
  const n = Math.floor(fx / 18);
  return (n >= 0 && n <= 7) || (n >= 12 && n <= 16) || (n >= 25 && n <= 26);
};
/** SolidTileAllowBottomSlope（cs:70211，引擎同源副本）：!InWorld→true；
 *  active&&(genSolid||platform)&&(!顶坡||平台正帧)&&!half&&!inActive */
function solidAllowBottomSlope(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  if (!st.flags[i] || (st.wire[i] & 32)) return false;
  const d = TILE_DEFS[st.type[i]];
  if (!d || !(genSolidType(st.type[i]) || d.platform)) return false;
  const sl = st.slope[i];
  if ((sl === 1 || sl === 2) && !(PLATFORMS_TOP.has(SHEET[st.type[i]]) && platformProperTop(st.frameX[i]!))) return false;
  return !st.half[i];
}

/** ★GGGGG 本地补件：Check2x2 巨石支 484（cs:48405-48807 boulder 分支）。
 *  FinalCleanupPass 引擎只派发 138/411（CCCCC 定向批；484 维持"未派发备案"），
 *  本批冻结禁区只 import——s22222 #58 在场成员 (2407,807) 孤立 484 半组
 *  （伙伴格被矿覆写的巨石残件，惰性帧校验击杀）按 HalfBrickPass 同源副本
 *  惯例本地补齐。零掷族（484 尘掷=0，RRRR 表）；杀尾 KillTile 尾九宫走引擎
 *  genSquareTileFrame（其余 Check* 分派），嵌套 484 由 4×4 尾窗再扫一轮。 */
function check2x2Boulder484(st: TileStore, rng: RNG, x: number, y: number): void {
  const i0 = st.idx(x, y);
  if (!st.flags[i0] || SHEET[st.type[i0]] !== 484) return;
  let num2 = -Math.trunc(st.frameX[i0]! / 18);      // cs:48418
  let num = 0;
  if (num2 < -1) { num2 += 2; num = 36; }
  num2 += x;
  let num4 = st.frameY[i0]!;
  let num5 = 0;
  while (num4 >= 36) { num4 -= 36; num5++; }
  const num6 = y - Math.trunc(num4 / 18);
  const inW = (k: number, l: number): boolean => k >= 0 && l >= 0 && k < st.w && l < st.h;
  let bad = false;
  for (let k = num2; k < num2 + 2; k++) {
    for (let l = num6; l < num6 + 2; l++) {
      if (!inW(k, l)) { bad = true; break; }        // GetTileSafely 新格→失配
      const q = st.idx(k, l);
      if (!st.flags[q] || SHEET[st.type[q]!] !== 484
        || st.frameX[q] !== (k - num2) * 18 + num
        || st.frameY[q] !== (l - num6) * 18 + num5 * 36) { bad = true; break; }
    }
  }
  // cs:48473-90 Boulders 支：上方箱族豁免 + 底两格 SolidTileAllowBottomSlope 联合门
  const chestAbove = (cx: number, cy: number): boolean =>
    inW(cx, cy) && CHEST_PROTECT_2X2.has(SHEET[st.type[st.idx(cx, cy)]] ?? -1);
  if (!chestAbove(num2, num6 - 1) && !chestAbove(num2 + 1, num6 - 1)
    && !solidAllowBottomSlope(st, num2, num6 + 2)
    && !solidAllowBottomSlope(st, num2 + 1, num6 + 2)) bad = true;
  if (!bad) return;
  // cs:48567 击杀环（destroyObject 闸内同型格 KillTile；484 尘掷=0）+ 尾 4×4
  const kills: Array<[number, number]> = [];
  for (let k = num2; k < num2 + 2; k++) {
    for (let l = num6; l < num6 + 2; l++) {
      if (inW(k, l) && st.flags[st.idx(k, l)] && SHEET[st.type[st.idx(k, l)]] === 484) {
        kills.push([k, l]);
      }
    }
  }
  for (const [kx, ky] of kills) st.setTileSilent(kx, ky, 0);
  for (const [kx, ky] of kills) genSquareTileFrame(st, rng, kx, ky);   // KillTile 尾九宫
  for (let k = num2 - 1; k < num2 + 3; k++) {                          // cs:48801-07 4×4 尾
    for (let l = num6 - 1; l < num6 + 3; l++) {
      if (inW(k, l) && st.flags[st.idx(k, l)] && SHEET[st.type[st.idx(k, l)]] === 484) {
        check2x2Boulder484(st, rng, k, l);                             // 嵌套 484（罕见，收敛杀）
      }
    }
  }
}

/** ★GGGGG 帧债垫片（惰性）：JS DungeonPass 陈设 chTile/dgWr 只写 type 不落帧
 *  （NNN 批仅补 banner 91）。放置期 SquareTileFrame 的 Check* 完整性校验读帧——
 *  零帧组必假杀（m 链 #58 实锤：(1578,911) 画 240×9 + (1172,923) 柜 88×6；
 *  vanilla 有效帧 → 校验通过保留——金标 058 两物俱在）。DungeonPass 为并行冻结
 *  域，本垫片在扫窗命中「同类连通**满矩形**组、全零帧」时就地写自洽 style-0
 *  帧型（帧通道 8 通道对拍不可见；渲染帧型自洽，真实 style 债在案移交
 *  DungeonPass 帧链批——其落帧后本垫片恒不触发，可整段删除）。
 *  组残缺（矩形不满）不垫：彼时 type/active 失配本就两版同杀，帧无关。 */
function backfillZeroFrames(st: TileStore, x: number, y: number): void {
  const i0 = st.idx(x, y);
  const t = st.type[i0];
  if (!st.flags[i0] || !TILE_DEFS[t]?.framed) return;
  if (st.frameX[i0] !== 0 || st.frameY[i0] !== 0) return;
  // 组 bbox：同类活性连通扫描（多格陈设最大 6×4 → ±5 窗足够）
  let x0 = x, y0 = y, x1 = x, y1 = y;
  const cells: number[] = [i0];
  const grow = (cx: number, cy: number): void => {
    for (let dx = -5; dx <= 5; dx++) {
      for (let dy = -5; dy <= 5; dy++) {
        const nx = cx + dx, ny = cy + dy;
        if (!st.inBounds(nx, ny)) continue;
        const ni = st.idx(nx, ny);
        if (!st.flags[ni] || st.type[ni] !== t) continue;
        if (st.frameX[ni] !== 0 || st.frameY[ni] !== 0) return;   // 混帧组不垫
        if (nx < x0) x0 = nx; if (nx > x1) x1 = nx;
        if (ny < y0) y0 = ny; if (ny > y1) y1 = ny;
        cells.push(ni);
      }
    }
  };
  grow(x, y);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) < 2) return;                   // 单格（style0 合法）
  // 满矩形校验：bbox 内每格皆同类活性且零帧（两相邻同型物并组 → 非满矩形 → 跳过）
  for (let xx = x0; xx <= x1; xx++) {
    for (let yy = y0; yy <= y1; yy++) {
      const qi = st.idx(xx, yy);
      if (!st.flags[qi] || st.type[qi] !== t || st.frameX[qi] !== 0 || st.frameY[qi] !== 0) return;
    }
  }
  for (const qi of cells) {
    const qx = qi % st.w, qy = Math.floor(qi / st.w);
    st.frameX[qi] = (qx - x0) * 18;
    st.frameY[qi] = (qy - y0) * 18;
  }
}

/** 放置期 SquareTileFrame 九宫（cs:80924 列主序）+ 引擎未派发成员 484 本地补。
 *  484 补件在引擎扫之后跑（后置序：引擎级联杀已生效，484 判据读终态——与
 *  vanilla 逐格交错序在"同窗多杀"边角才可能分叉，四链复核裁决）。 */
function statueFrameSweep(st: TileStore, rng: RNG, x: number, y: number): void {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cx = x + dx, cy = y + dy;
      if (!st.inBounds(cx, cy)) continue;
      backfillZeroFrames(st, cx, cy);
    }
  }
  genSquareTileFrame(st, rng, x, y);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cx = x + dx, cy = y + dy;
      if (!st.inBounds(cx, cy)) continue;
      const ci = st.idx(cx, cy);
      if (st.flags[ci] && SHEET[st.type[ci]] === 484) check2x2Boulder484(st, rng, cx, cy);
    }
  }
}

function statueTileKey(sheet: number): number | null {
  for (let id = 0; id < TILE_DEFS.length; id++) {
    const d = TILE_DEFS[id];
    if (d && d.vanilla?.sheet === sheet && d.key.startsWith('v_')) return id;
  }
  return null;
}

/** JS type → 原版 sheet id 直查表（flag2 锚门/陷阱底座门谓词用） */
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let q = 0; q < TILE_DEFS.length; q++) {
  const s = TILE_DEFS[q]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[q] = s;
}

const STATUE_105 = statueTileKey(105);
const STATUE_349 = statueTileKey(349);
/** ★PPPPP 导出：MarblePileWithStatues 的 Statue（cs:10547）复用同放置模型 */
export { STATUE_105, STATUE_349 };
const TRAP = statueTileKey(135);   // cs:4451 PlaceTile(135)——超级飞镖陷阱（曾误 137）
const TRAP_162 = statueTileKey(162);
const WIRE_RED = TileStore.WIRE_RED;

/** PlaceStatueTrap(cs:4436-4462)：±10 盒内找"空格+下方 SolidTile2 且非冰(162)"位放
 *  超级飞镖陷阱(135,曾误用 137)并 WireLine 拉红线——L 形拐点=(陷阱x,雕像y)
 *  （cs:111-129：横段沿 start(雕像)y、竖段沿 end(陷阱)x）。
 *  GGGGG 补三件：①Place1x1 机关门 Boulders 底座拒放（cs:45213）→ 原版该候选
 *  PlaceTile 落空后**续扫下一候选**（tile2.type!=135 不拉线不 return）；
 *  ②PlaceTile case 135 尾 SquareTileFrame(tx,ty)（cs:60162-65）——放置期组拆
 *  级联（邻格 165/187 族惰性帧校验击杀）；③放置校验=PlaceTile 后回读
 *  tile2.active()&&type==135（cs:4453）才拉线返回。 */
export function placeStatueTrap(st: TileStore, rng: RNG, x: number, y: number): void {
  if (!st.inBounds(x, y) || x < 20 || x > st.w - 21 || y < 20 || y > st.h - 21 || !TRAP) return;
  for (let i = -10; i <= 10; i++) {
    for (let j = -10; j <= 10; j++) {
      const tx = x + i, ty = y + j;
      if (!st.inBounds(tx, ty + 1)) continue;
      const ci = st.idx(tx, ty), bi = st.idx(tx, ty + 1);
      if (st.flags[ci]) continue;                                   // !tile2.active()
      // SolidTile2(tile)（cs:70178）：active && 生成期 tileSolid && slope==0 && !halfBrick && !inActive
      if (!st.flags[bi] || st.half[bi] || st.slope[bi] !== 0 || ((st.wire[bi] >>> 5) & 1) === 1
        || !vanGenSolidType(st.type[bi])) continue;
      if (st.type[bi] === TRAP_162) continue;                       // tile.type != 162（冰特判）
      // Place1x1 cs:45213 机关门：底座是 Boulders 族 → 不落陷阱（续扫）
      if (BOULDERS.has(SHEET[st.type[bi]])) continue;
      st.setTileSilent(tx, ty, TRAP, 0, 0);
      statueFrameSweep(st, rng, tx, ty);                            // PlaceTile(135) 尾九宫
      // cs:4453：放置成功（tile2 活性且 type==135）才拉线返回，否则续扫
      if (!(st.flags[ci] && st.type[ci] === TRAP)) continue;
      // WireLine(new Point(x,y), new Point(tx,ty))：横段沿雕像 y、竖段沿陷阱 x
      const x0 = Math.min(x, tx), x1 = Math.max(x, tx);
      const y0 = Math.min(y, ty), y1 = Math.max(y, ty);
      for (let wx = x0; wx <= x1; wx++) st.wire[st.idx(wx, y)] |= WIRE_RED;
      for (let wy = y0; wy <= y1; wy++) st.wire[st.idx(tx, wy)] |= WIRE_RED;
      return;
    }
  }
}

/** Statues pass 主体。须在洞穴/生物群系成形后调用(原版序:SettleLiquids 后、地下屋前) */
export function runStatuesPass(st: TileStore, rng: RNG, gs: GenState): void {
  // 一次性探针钩（同 WebsPass 模式）：Statues 入口快照（债时间线用）
  {
    const g0 = globalThis as { __swStatCap?: (gs: GenState, st: TileStore) => void };
    try { g0.__swStatCap?.(gs, st); } catch { /* probe */ }
  }
  if (!STATUE_105) return;
  const { w, h } = st;
  const count = Math.floor(STATUE.length * 2 * (w / 4200));
  let num = 0; // 样式序游标(cs:16970 顺序轮换)
  const yMin = Math.floor((gs.worldSurface * 2 + gs.rockLevel) / 3);
  for (let i = 0; i < count; i++) {
    if (num >= STATUE.length) num = 0;
    const [sheet, style] = STATUE[num];
    let done = false;
    let fail = 0;
    while (!done) {
      let x = rng.int(20, w - 21);
      let y = rng.int(yMin, h - 301);
      // 海洋回避(cs:16989 oceanDepths)——y > oceanLevel 直接 false 必须前置：
      // 否则深层海滩列（y 超过海平面线）会被误拒重掷
      const oceanTop = (gs.worldSurface + gs.rockLevel) / 2 + 40;
      let guard = 100;
      while (y <= oceanTop && (x < gs.beachDistance || x > w - gs.beachDistance) && guard-- > 0) {
        x = rng.int(20, w - 21);
        y = rng.int(yMin, h - 301);
      }
      if (guard <= 0) { done = true; break; }
      // 向下扫到首个 active 格,雕像坐其上一格(cs:17014-17018)
      while (y < h && !st.flags[st.idx(x, y)]) y++;
      if (y >= h) { done = true; break; }
      y--;
      const ai = st.idx(x, y);
      // cs:17024-17028 flag2 双门：①锚格活性且 frameImportant 且非 tileCut → 拒
      //   （不放不清不扫）；②锚格 anyShimmer → 拒。均计 fail 重掷。
      const shimmer = st.liquid[ai] > 0 && st.liquidType[ai] === 4 /* LIQ_SHIMMER */;
      const flag2 = !(st.flags[ai] && FR_IMPORTANT_NOCUT.has(SHEET[st.type[ai]])) && !shimmer;
      // cs:59501 PlaceTile 前奏 tile.Clear(Tile|TilePaint|Slope)：**任何失败尝试也会清**
      // inactive 锚格的 half/slope/type/帧（golden 半砖位 v0 的来源；须在一切本地门
      // 之前——原版 pass 无边界门，PlaceTile 照调）。WWW 批 2026-08-18 接线。
      // ★PPPP 补 else-if 支（cs:59503-59507）：锚格 **活性** 且非 frameImportant 时
      //   ResetsHalfBrickPlacementAttempt[num]（105/349 不在例外表 → 恒 true）→
      //   halfBrick(false)+帧归零（type/active 保留）。触发场景=随机 y 落在岩体内 →
      //   下扫首格即活性 → y-- 锚到活性半砖泥/石 → 放置必败但半砖被原版清掉
      //   （#58 残余 7 Hf：(3063,475) 等七格 H0>1 的真身）。
      if (flag2) {
        if (!st.flags[ai]) {
          st.half[ai] = 0; st.slope[ai] = 0; st.type[ai] = 0; st.frameX[ai] = 0; st.frameY[ai] = 0;
        } else if (!TILE_DEFS[st.type[ai]]?.framed) {
          st.half[ai] = 0; st.frameX[ai] = 0; st.frameY[ai] = 0;
        }
        if (y < 2 || !st.inBounds(x + 1, y - 2)) { fail++; if (fail >= 10000) { done = true; } continue; }
        // 2×3 净空(PlaceTile forced 语义:占用格须非 active)
        let ok = true;
        for (let dx = 0; dx < 2 && ok; dx++) {
          for (let dy = -2; dy <= 0 && ok; dy++) {
            if (st.flags[st.idx(x + dx, y + dy)]) ok = false;
          }
        }
        // ★Place2xX 底座门（cs:39762）：SolidTile2(x,y+1) && SolidTile2(x+1,y+1)——
        //   SolidTile2（cs:70178）= active && 生成期 tileSolid && slope==0 && !halfBrick
        //   && !inActive（无 solidTop 条件，勿用 SolidTile）。曾整门缺失 → #58 干净基座
        //   下 100+ 雕像错位（半砖/坡面/非实心底座被误收）。WWW 批 2026-08-18 修。
        if (ok) {
          for (const bx of [x, x + 1]) {
            const bi = st.idx(bx, y + 1);
            if (!st.flags[bi] || st.half[bi] || st.slope[bi] !== 0
              || ((st.wire[bi] >>> 5) & 1) === 1 || !vanGenSolidType(st.type[bi])) { ok = false; break; }
          }
        }
        if (ok) {
          const tile = sheet === 349 ? STATUE_349 : STATUE_105;
          if (!tile) { done = true; break; }
          // 雕像帧换行（PlaceTile case 105，cs:39716-39720）：每行 55 列——
          // frameX=(style%55)*36、frameY=floor(style/55)*54。此前单轴 style*36，
          // style≥55 全部越界错位（Tiles_105 宽 1980=55 列）
          const row = Math.floor(style / 55);
          for (let dx = 0; dx < 2; dx++) {
            for (let dy = 0; dy < 3; dy++) {
              st.setTileSilent(x + dx, y - 2 + dy, tile, (style - row * 55) * 36 + dx * 18, row * 54 + dy * 18);
            }
          }
        }
        // ★GGGGG：PlaceTile case 105 尾 SquareTileFrame(i,j)（cs:60100）——放置期
        //   组拆级联（成功/失败尝试都要跑）：九宫 TileFrame → frameImportant Check*
        //   惰性帧校验（m/s 链 #58 首差根源：165 钟乳石悬挂失守/187 沙堆/484 巨石
        //   半组被首次帧校验整组击杀——放置前从未被任何 pass 帧到）。引擎复用
        //   FinalCleanupPass.genSquareTileFrame（与 DDDDD settle 侧 165/91 派发同源）。
        statueFrameSweep(st, rng, x, y);
      }
      // cs:17029 成功判定=PlaceTile 后回读锚格（引用语义）：tile.active()&&type==x。
      //   含"幻影成功"——随机 y 落在既有同型雕像体内（flag2 拒）也计成功推进 num
      //   （甚至触发 PlaceStatueTrap）。
      if (st.flags[ai] && SHEET[st.type[ai]] === sheet) {
        if (STATUES_WITH_TRAPS.has(num)) placeStatueTrap(st, rng, x, y);
        num++;
        done = true;
      } else {
        fail++;
        if (fail >= 10000) { done = true; }
      }
    }
  }
}
