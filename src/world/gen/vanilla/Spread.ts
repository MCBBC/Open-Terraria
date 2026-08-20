// 原版 WorldGen.SpreadGrass 移植（WorldGen.cs:75210）——生成期草皮传播。
// 泥/石完全被包住（3×3 全实心）不转；岩浆邻格把 enclosed 拉回 true 但只断内层列循环
// （后续列仍可再拉回 false）；CanBeClearedDuringGeneration=false 不转。
import type { TileStore } from '../../TileStore';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { NOT_CLEARABLE } from './TileRunner';
import { vanGenSolidType } from './GenSolid';
// 与 MushroomPass.spreadGrassOnce 共用同一洪水计数器（原版 grassSpread 是单一静态字段，
// cs:75305-75316——限的是整场洪水总量，非单链深度）
import { grassSpreadState } from './MushroomPass';

// ---------- ★NNNNN 批（2026-08-19）：SpreadGrass 转化后的 SquareTileFrame 级联 ----------
// 原版 cs:75286-75288：type 写入后 SquareTileFrame(i,j) → 3×3 TileFrame。TileFrame
// 头（cs:82077-82082）对非活跃格清 half/slope/块漆；frameImportant 类型走 Check*——
// 其中 186/187 大石堆（Check3x2 cs:49190-49868）会校验 3×2 六格一致性与支撑行，
// 失败 → KillTile 整组清除。9293480 #73 残差 5 格 = 活树房间石堆第 6 格被后写活木
// (191,同帧)覆写 → 草皮转化 SquareTileFrame 触发 Check3x2 一致性失败 → vanilla 杀
// 除残件（a:1→0 t:187→0），JS 缺级联 → 残件永生。TryConvertingOrKillingTrees
// AboveIfTheyWouldBecomeInvalid（cs:75286 前置）与 SendTileSquare 在本管线所有调用
// 时点（SpreadingGrass 73 / GrassWall 79 / Moss 65 / MudCaves 17）树(5/323) 尚未
// 存在（Planting_Trees=82 之后）且 netMode=0——恒 no-op，不移植。

const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[i] = s;
}
/** sheet → 首个内部 id（187→186 转化写 type 用；186 若未实装则退化为不动 type） */
const INTERNAL_OF_SHEET = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !INTERNAL_OF_SHEET.has(s)) INTERNAL_OF_SHEET.set(s, i);
}
/** TileID.Sets.Boulders（TileID.cs:195）→ InvalidTileForPilesOrSpeleothems（cs:39005） */
const BOULDER_SHEETS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
/** Check3x2 style 组支撑类型表（cs:49344-49376 type=187 / cs:49301-49321 type=186）。
 *  Mud={59}（TileID.cs:287）；Snow={147}/Ice={161,163,164,200}（cs:24/28）；
 *  Sand={53,112,116,234}/HardenedSand={397,398,402,399}/Sandstone={396,400,403,401}。 */
function pileAnchorOk(pileSheet: number, styleGroup: number, belowSheet: number): boolean {
  if (pileSheet === 187) {
    if (styleGroup <= 5) return belowSheet === 59 || belowSheet === 60 || belowSheet === 226;
    if (styleGroup <= 8) return belowSheet === 57 || belowSheet === 58 || belowSheet === 75 || belowSheet === 76;
    if (styleGroup >= 29 && styleGroup <= 34) {
      return belowSheet === 53 || belowSheet === 112 || belowSheet === 116 || belowSheet === 234
        || belowSheet === 397 || belowSheet === 398 || belowSheet === 402 || belowSheet === 399
        || belowSheet === 396 || belowSheet === 400 || belowSheet === 403 || belowSheet === 401;
    }
    return true; // 其余样式组无支撑类型门（如本种子的组 12）
  }
  // 186
  if (styleGroup >= 26 && styleGroup <= 31) {
    return belowSheet === 147 || belowSheet === 161 || belowSheet === 163 || belowSheet === 164
      || belowSheet === 200 || belowSheet === 162 || belowSheet === 224;
  }
  if (styleGroup >= 32 && styleGroup <= 34) return belowSheet === 59 || belowSheet === 70;
  return true;
}

/** PlatformProperTopFrame（cs:70197）：frameX/18（PlatformFrameWidth=CoordinateFullWidth
 *  =16+2 padding）∈{0..7,12..16,25..26}。 */
function platformProperTopFrame(fx: number): boolean {
  const num = Math.trunc(fx / 18);
  if ((num < 0 || num > 7) && (num < 12 || num > 16)) {
    if (num >= 25) return num <= 26;
    return false;
  }
  return true;
}

/** SolidTileAllowBottomSlope（cs:70211）：越界=真（InWorld 无 padding，原版语义）；
 *  active && (tileSolid||tileSolidTop) && (!topSlope || (平台&&正顶帧)) && !halfBrick。
 *  tileSolidTop 以 platform 近似（QuickCleanup/TileCleanup 同口径）；tileSolid 走
 *  vanGenSolidType（生成期可变表）。 */
function solidTileAllowBottomSlope(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const t = st.type[i];
  const platform = !!TILE_DEFS[t]?.platform;
  const topSlope = st.slope[i] === 1 || st.slope[i] === 2;
  if (topSlope && !(platform && platformProperTopFrame(st.frameX[i]))) return false;
  if (st.half[i]) return false;
  return vanGenSolidType(t) || platform;
}

/** 生成期 KillTile（cs:63933-63967）对 186/187 的语义：active(false)+halfBrick(false)
 *  +frameX/Y=-1+清漆+type=0（★cs:63965 type 归零——9293480 dump73 金标 raw typ 187→0
 *  实证；LivingTreePass.killTileGen 保留 type 是 ghost 通道近似，本处取精确语义）。
 *  inActive/liquid 支（58/230/147/224）/TruncatesWalls（{54,328,459,748}）均不触及
 *  186/187； 尘掷（默认 10×MakeTileDust）与 Check3x2 掉落表全走 Main.rand（非
 *  genRand 流）——世界生成掷流零影响。KillTile 尾 SquareTileFrame 被 destroyObject
 *  门挡（Check3x2 头 cs:49192）且 TileFrame 头清位对本类格已是 no-op——略。 */
function killTileGenPile(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (!st.flags[i]) return;
  st.flags[i] = 0;
  st.half[i] = 0;
  st.frameX[i] = -1;
  st.frameY[i] = -1;
  st.paint[i] = 0;
  st.type[i] = 0;
}

/** Check3x2（cs:49190-49868）type∈{186,187} 全量。返回是否发生了整组杀除。 */
function check3x2PileFull(st: TileStore, i: number, j: number, pileSheet: number): boolean {
  if (destroyObjectP) return false;                // cs:49192 头门（杀除期再入早退）
  if (!st.inBounds(i, j)) return false;
  const ii = st.idx(i, j);
  if (!st.flags[ii] || SHEET_OF[st.type[ii]] !== pileSheet) return false;
  const frameX = st.frameX[ii] | 0;
  const frameY = st.frameY[ii] | 0;
  const num3 = Math.trunc(frameY / 36);                    // cs:49204
  const num4 = frameY % 36;
  const num = j - Math.trunc(num4 / 18);                   // cs:49208
  let n5 = Math.trunc(frameX / 18);
  let n6 = 0;
  while (n5 > 2) { n5 -= 3; n6++; }                        // cs:49209-49213
  n5 = i - n5;
  const num7 = n6 * 54;
  const num8 = num + 2;                                    // flag2(type14 style25) 不触及 186/187
  let flag = false;
  for (let k = n5; k < n5 + 3; k++) {
    for (let l = num; l < num8; l++) {
      if (!st.inBounds(k, l)) { flag = true; continue; }
      const idx = st.idx(k, l);
      if (!st.flags[idx] || SHEET_OF[st.type[idx]] !== pileSheet
        || st.frameX[idx] !== (k - n5) * 18 + num7
        || st.frameY[idx] !== (l - num) * 18 + num3 * 36) {
        flag = true;                                       // cs:49233 六格一致
      }
    }
    // 支撑行三连（186: cs:49286-49290 / 187: cs:49329-49333）
    if (!solidTileAllowBottomSlope(st, k, num8)) { flag = true; continue; }
    if (st.inBounds(k, num8)) {
      const bi = st.idx(k, num8);
      if (st.flags[bi] && BOULDER_SHEETS.has(SHEET_OF[st.type[bi]])) { flag = true; continue; }
      if (st.flags[bi] && !pileAnchorOk(pileSheet, n6, SHEET_OF[st.type[bi]])) flag = true;
    }
  }
  // 187→186 草地变体转化（cs:49383-49397）：首格 frameX∈[756,900] 且支撑行三格非
  // 草族（2/477/492）→ 六格 frameX-=378、type=186（原版直写六格不查 active）——转化
  // 后杀除循环按 type==187 匹配不到，等价"转组免死"。
  if (pileSheet === 187 && st.inBounds(n5, num) && frameX >= 756 && frameX <= 900) {
    let grassBelow = false;
    for (let k = n5; k < n5 + 3; k++) {
      if (!st.inBounds(k, num8)) continue;
      const bs = SHEET_OF[st.type[st.idx(k, num8)]];
      if (bs === 2 || bs === 477 || bs === 492) grassBelow = true;
    }
    if (!grassBelow) {
      const t186 = INTERNAL_OF_SHEET.get(186) ?? st.type[ii];
      for (let k = n5; k < n5 + 3; k++) {
        for (let l = num; l < num8; l++) {
          if (!st.inBounds(k, l)) continue;
          const idx = st.idx(k, l);
          st.frameX[idx] -= 378;
          st.type[idx] = t186;
        }
      }
    }
  }
  if (!flag) return false;                                 // cs:49416
  // cs:49421-49435：destroyObject 门内整组 KillTile（仅仍为该 type 的 active 格）
  destroyObjectP = true;
  for (let k = n5; k < n5 + 3; k++) {
    for (let l = num; l < num8; l++) {
      if (!st.inBounds(k, l)) continue;
      const idx = st.idx(k, l);
      if (st.flags[idx] && SHEET_OF[st.type[idx]] === pileSheet) killTileGenPile(st, k, l);
    }
  }
  destroyObjectP = false;
  // 掉落表（cs:49436-49855）全走 Main.rand/Item.NewItem——生成期世界物品不在 8 通道
  // 金标域且本种子 frameX=648 不命中 187 遗物档（918-970），略。
  // cs:49856-49862：destroyObject=false 后 5×5 TileFrame 复扫（可连锁杀邻组）
  for (let x = n5 - 1; x < n5 + 4; x++) {
    for (let y = num - 1; y < num + 4; y++) {
      tileFrameScoped(st, x, y);
    }
  }
  return true;
}

/** SquareTileFrame 语境的 TileFrame 子集（cs:82067+）：界内 5 格 padding（cs:82069）、
 *  非活跃清 half/slope/块漆（cs:82077-82082）、frameImportant 中 186/187 大石堆
 *  （Check3x2）与 185 小堆（CheckPile/Check2x1，QQQQQ 补——12345 链 #73 活树房
 *  蛙卵石堆孤儿半 T0>185 实证 NNNN"其余分支零可观测写"论断对 185 不成立）有
 *  清除语义；其余 frameImportant/仙人掌/藤蔓分支在本管线触发时点（树未生成/沙上
 *  无草/藤悬于草下）不产生 8 通道可观测写——LivingTreePass.squareTileFrameGen 同
 *  款口径。 */
function tileFrameScoped(st: TileStore, x: number, y: number): void {
  if (x <= 5 || y <= 5 || x >= st.w - 5 || y >= st.h - 5) return;
  const i = st.idx(x, y);
  if (!st.flags[i]) {
    st.half[i] = 0;
    st.slope[i] = 0;
    st.paint[i] = 0;
    return;
  }
  const sh = SHEET_OF[st.type[i]];
  if (sh === 186 || sh === 187) check3x2PileFull(st, x, y, sh);
  else if (sh === 185) checkPileGen(st, x, y);
}

/** vanilla destroyObject（WorldGen 静态位）的本语境镜像：Check2x1/Check3x2 杀除期
 *  间置真——期间再入两者头门早退（cs:46981/49192）；CheckPile 无此门（cs:46891
 *  无 destroyObject 查询——Check2x1 杀除的 KillTile 尾级联仍可触发它，bug-for-bug）。 */
let destroyObjectP = false;

/** KillTile 尾 SquareTileFrame（cs:63964）——185/186/187 杀的级联可连带杀邻堆 */
function killPileTail(st: TileStore, x: number, y: number): void {
  killTileGenPile(st, x, y);
  squareTileFrameGen(st, x, y);
}

/** Snow/Ice 支撑族（CheckPile cs:46940-46947 / Check2x1 cs:47061-47070）：
 *  Snow={147}（TileID.cs:24）Ice={161,163,164,200}（:28）+ 显式 162/224 */
const PILE_SNOW_OK = new Set([147, 161, 163, 164, 200, 162, 224]);
/** Sand/HardenedSand/Sandstone 支撑族（TileID.cs:30-34） */
const PILE_SAND_OK = new Set([53, 112, 116, 234, 397, 398, 402, 399, 396, 400, 403, 401]);

/** CheckPile（cs:46891）1:1（type 185 派发语境）：fy==18 → Check2x1（2 宽堆）；
 *  无支撑（SolidTileAllowBottomSlope）→ 杀；雪堆(36-47)/沙堆(54-59,73-76) 支撑
 *  类型门 → 杀。下方格 inactive → 不查（cs:46928-46932 早退）。杀=零掷（185 尘掷
 *  0/掉落被 isGeneratingOrLoadingWorld noItem=true 免）。 */
function checkPileGen(st: TileStore, x: number, y: number): void {
  const i = st.idx(x, y);
  const fx = st.frameX[i] | 0, fy = st.frameY[i] | 0;
  const sheet = SHEET_OF[st.type[i]];
  if (fy === 18 || sheet === 649) { check2x1Gen(st, x, y, sheet); return; }
  if (!solidTileAllowBottomSlope(st, x, y + 1)) { killPileTail(st, x, y); return; }
  if (sheet !== 185) return;
  const num = Math.trunc(fx / 18);
  if (!st.inBounds(x, y + 1)) return;
  const bi = st.idx(x, y + 1);
  if (!st.flags[bi]) return;                       // cs:46928 !active() → return
  const below = SHEET_OF[st.type[bi]];
  if ((num >= 36 && num <= 47) || (num >= 54 && num <= 59) || (num >= 73 && num <= 76)) {
    const ok = (num >= 36 && num <= 47) ? PILE_SNOW_OK.has(below) : PILE_SAND_OK.has(below);
    if (!ok) killPileTail(st, x, y);
  }
}

/** Check2x1（cs:46979-47371）type 185 语境 1:1：2 宽堆配对完整性 + 支撑双门 +
 *  草地变体转化（fx∈[1368,1458] → -1368）+ 支撑类型门（num5 组：25-30 雪/41-46,
 *  62-64 沙）→ 失败杀两格（destroyObject 闸 + 尾 SquareTileFrame×2）。 */
function check2x1Gen(st: TileStore, x: number, y: number, sheet: number): void {
  if (destroyObjectP) return;                      // cs:46981
  const ii = st.idx(x, y);
  const fx = st.frameX[ii] | 0, fy = st.frameY[ii] | 0;
  let num2 = Math.trunc(fx / 18);
  num2 %= 2;
  const num = x - num2;                            // 左锚
  if (!st.inBounds(num, y) || !st.inBounds(num + 1, y)) return;
  let flag = true;
  const iL = st.idx(num, y), iR = st.idx(num + 1, y);
  const fxL = st.frameX[iL] | 0;
  if ((st.frameX[iR] | 0) === fxL + 18
    && SHEET_OF[st.type[iL]] === sheet && SHEET_OF[st.type[iR]] === sheet
    && st.flags[iL] && st.flags[iR]) flag = false; // cs:47005 配对完整
  // cs:47044-47055 else 支（type 29/103/462 专属桌门不触及 185）
  if (!solidTileAllowBottomSlope(st, num, y + 1)) flag = true;
  if (!solidTileAllowBottomSlope(st, num + 1, y + 1)) flag = true;
  if (sheet === 185) {
    // cs:47058-47065 草地变体转化（转化判读支撑行现值——与 Check3x2 的 187 门同构）
    if (st.inBounds(num, y + 1) && st.inBounds(num + 1, y + 1)) {
      const bl = SHEET_OF[st.type[st.idx(num, y + 1)]];
      const br = SHEET_OF[st.type[st.idx(num + 1, y + 1)]];
      if (fxL >= 1368 && fxL <= 1458 && bl !== 2 && br !== 2 && bl !== 477 && br !== 477 && bl !== 492 && br !== 492) {
        st.frameX[iL] = (fxL - 1368) as never;
        st.frameX[iR] = ((st.frameX[iR] | 0) - 1368) as never;
      }
    }
    // cs:47067-47096 支撑门（巨石族 + num5 组类型门；下格 inactive → continue）
    const num5 = Math.trunc((st.frameX[iL] | 0) / 36) + (Math.trunc(fy / 18) - 1) * 52;
    for (let j = num; j <= num + 1; j++) {
      if (!st.inBounds(j, y + 1)) continue;
      const bj = st.idx(j, y + 1);
      if (st.flags[bj] && BOULDER_SHEETS.has(SHEET_OF[st.type[bj]])) { flag = true; break; }
      if (!st.flags[bj]) continue;
      const bt = SHEET_OF[st.type[bj]];
      if (num5 >= 25 && num5 <= 30) {
        if (!PILE_SNOW_OK.has(bt)) flag = true;
      } else if ((num5 >= 41 && num5 <= 46) || (num5 >= 62 && num5 <= 64)) {
        if (!PILE_SAND_OK.has(bt)) flag = true;
      }
    }
  }
  if (!flag) return;                               // cs:47098
  destroyObjectP = true;                           // cs:47110
  if (SHEET_OF[st.type[iL]] === sheet && st.flags[iL]) killPileTail(st, num, y);
  if (SHEET_OF[st.type[iR]] === sheet && st.flags[iR]) killPileTail(st, num + 1, y);
  // 掉落表（cs:47119+）：isGeneratingOrLoadingWorld 强制 noItem（cs:63585）→ 零掷零物
  destroyObjectP = false;                          // cs:47366
  squareTileFrameGen(st, num, y);                  // cs:47367-47368 尾复扫
  squareTileFrameGen(st, num + 1, y);
}

/** SquareTileFrame（cs:80924-80934）：列优先 3×3 调用序。 */
function squareTileFrameGen(st: TileStore, x: number, y: number): void {
  for (let d = 0; d < 9; d++) {
    const dx = ((d / 3) | 0) - 1, dy = (d % 3) - 1;
    tileFrameScoped(st, x + dx, y + dy);
  }
}

/** 把 (x,y) 及相邻同源 tile 转 grass 类型；repeat=true 时 3×3 邻格递归扩散。
 *  ★M3（2026-08-13）：旧实现是陈旧分叉，对齐 MushroomPass.spreadGrassOnce 同款：
 *  ① 补 !active 门（cs:75218）——本仓 inactive 格保留残留 type（幽灵语义），
 *    只比 type 不比 active 会误转已挖除格；
 *  ② InWorld(i,j,10) padding（cs:75218），旧版只查 inBounds；
 *  ③ 岩浆邻格 = `flag=true; break` 只断内层（cs:75260-75264），旧版硬 return
 *    且外层循环一并断——双重偏离；
 *  ④ 递归上限换全局计数器 grassSpread<1000（cs:75305-75316），旧版 depth>400
 *    是自创近似。
 *  enclosed 判定（cs:75251）只查 active && tileSolid（无 half/slope/solidTop），
 *  与 SolidTile 不同族，勿"顺手统一"。
 *  cs:75223-75244 邪恶草族滩带门 / dirt==0 地表门：本入口调用方（MossPass 苔藓、
 *  GrassWallPass/WorldGen 草皮）dirt 恒非 0、grass 恒非邪恶草族（邪恶草走
 *  MushroomPass.spreadGrassOnce，含该门），零影响故不复制。 */
export function spreadGrass(st: TileStore, x: number, y: number, dirt: number, grass: number, repeat = true): void {
  // InWorld(i,j,10)（cs:75218）
  if (x < 10 || x >= st.w - 10 || y < 10 || y >= st.h - 10) return;
  const i = st.idx(x, y);
  if (!st.flags[i] || st.type[i] !== dirt) return;   // active && type==dirt（cs:75218）
  // 3×3 窗口 clamp 到世界界（cs:75240-75247）
  const x0 = Math.max(0, x - 1), x1 = Math.min(st.w, x + 2);
  const y0 = Math.max(0, y - 1), y1 = Math.min(st.h, y + 2);
  let enclosed = true;
  for (let k = x0; k < x1; k++) {
    for (let l = y0; l < y1; l++) {
      const wi = st.idx(k, l);
      // ★MMMMM：cs:75251 `!Main.tileSolid[type]` 读的是**生成期可变表**（LifeCrystals
      // 尾 cs:16944 翻 225=false、Piles 尾 cs:19591 才还原——Moss pass 窗口期蜂巢块/
      // 发光蘑菇块等按非实心算）；静态 TILE_DEFS.solid 曾把 225 当实心 → 尾段洪水
      // enclosed 误判 → 蜂巢贴面石头漏转（#65 残差 T179>1×4 ow=64 族）。走 vanGenSolidType
      // （含 19/239/380/427/435-439 原版 tileSolid=true 的碰撞 false 差集，尾部清剿批同源）
      if (!st.flags[wi] || !vanGenSolidType(st.type[wi])) enclosed = false;
      // ★岩浆只 break 内层（cs:75260-75264）——后续列可再把 enclosed 拉回 false
      if (st.liquidType[wi] === 2 && st.liquid[wi] > 0) { enclosed = true; break; }
    }
  }
  if (enclosed) return;
  // CanBeClearedDuringGeneration=false 的泥（沙漠沙岩族等）不转（cs:75265）
  if (NOT_CLEARABLE.has(st.type[i])) return;
  st.type[i] = grass;
  // ★NNNNN：cs:75288 SquareTileFrame(i,j)——TileFrame 头清位 + 186/187 大石堆
  // Check3x2 一致性/支撑校验级联（#73 5 格残差根因；flag2 转化支/树杀手前置在本
  // 管线所有调用时点恒 no-op，见文件头注）
  squareTileFrameGen(st, x, y);
  if (!repeat) return;
  // cs:75305-75316：邻格 active && 同 dirt，grassSpread<1000 才递归
  for (let m = x0; m < x1; m++) {
    for (let n = y0; n < y1; n++) {
      const ni = st.idx(m, n);
      if (st.flags[ni] && st.type[ni] === dirt && grassSpreadState.n < 1000) {
        grassSpreadState.n++;
        spreadGrass(st, m, n, dirt, grass, true);
        grassSpreadState.n--;
      }
    }
  }
}

/** 全图传播(对应原版逐 tile 调用 SpreadGrass 的 pass,如 Mud Caves To Grass)。
 * centerX/maxDist 可选:仅转换距中心 maxDist 内的泥(参考世界正是泥迹全图、
 * 丛林草紧贴丛林核心——远离核心的泥保持泥色) */
export function spreadGrassAll(st: TileStore, dirt: number, grass: number, centerX = -1, maxDist = 0): void {
  for (let y = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      if (centerX >= 0 && Math.abs(x - centerX) > maxDist) continue;
      if (st.type[st.idx(x, y)] === dirt) spreadGrass(st, x, y, dirt, grass, false);
    }
  }
  // 单格不扩散传播力弱,重复两轮让草皮连通。
  // 关键:必须以"轮初快照"判定邻草——同轮内边扫边转会在扫描方向上链式雪崩,
  // 把整条连通泥网全部转成草(丛林"全草无泥"与远程草带的根因)
  for (let round = 0; round < 2; round++) {
    const targets: number[] = [];
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        if (st.type[i] !== dirt) continue;
        let touch = false;
        for (let dx = -1; dx <= 1 && !touch; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (!st.inBounds(x + dx, y + dy)) continue;
            if (st.type[st.idx(x + dx, y + dy)] === grass) { touch = true; break; }
          }
        }
        if (touch) targets.push(i);
      }
    }
    for (const i of targets) st.type[i] = grass;
  }
  void T; void TILE_BY_KEY;
}

/**
 * 原版 MudCavesToJungleGrass pass（cs:12499-12530）1:1——替代自创 spreadGrassAll 近似：
 *  ① 全图逐 tile SpreadGrass(59, 60)（递归洪水，grassSpread 全局深度 ≤1000，
 *     InWorld(i,j,10) 门禁，3×3 封闭/岩浆判定，CanBeCleared 门禁）；
 *  ② ScanTileColumnAndRemoveClumps（cs:10164）：逐列竖向连续段 <20 且连通域 <20 → 清除。
 * 原版泥→丛林草无中心限距（自创 centerX/maxDist 与 2 轮快照扩散均偏离原版）。
 * 零 RNG——纯状态机，与掷骰流无关。
 */
export function runMudCavesPass(st: TileStore, dirt: number, grass: number): void {
  const { w, h } = st;
  let grassSpread = 0;
  // 热循环局部化 + solid LUT(定义同源=原判定式逐 id 预计算;洪水逐格 3×3 窗判定)
  const ty = st.type, tf = st.flags, tlt = st.liquidType, tl = st.liquid;
  const SOLID = new Uint8Array(TILE_DEFS.length);
  for (let id = 0; id < TILE_DEFS.length; id++) {
    if (TILE_DEFS[id]?.solid) SOLID[id] = 1;
  }

  const spread = (x: number, y: number): void => {
    // InWorld(i,j,10)（cs:75218）
    if (x < 10 || x >= w - 10 || y < 10 || y >= h - 10) return;
    const ci = y * w + x;
    if (!tf[ci] || ty[ci] !== dirt) return;
    // 生成期 dirt==0 的地表限高门禁：dirt=59 不触发；type==dirt && active → 不 return
    // 3×3 窗口（clamp 到世界界，cs:75240-75251）
    const x0 = Math.max(0, x - 1), x1 = Math.min(w, x + 2);
    const y0 = Math.max(0, y - 1), y1 = Math.min(h, y + 2);
    let enclosed = true;
    for (let k = x0; k < x1; k++) {
      for (let l = y0; l < y1; l++) {
        const wi = l * w + k;
        if (!tf[wi] || !SOLID[ty[wi]]) enclosed = false;
        // ★岩浆只 break 内层循环（cs:75260-75264）——后续列可再把 enclosed 拉回 false；
        // 曾实现为"遇岩浆直接 return"≠原版
        if (tlt[wi] === 2 && tl[wi] > 0) { enclosed = true; break; }
      }
    }
    if (enclosed) return;
    if (NOT_CLEARABLE.has(ty[ci])) return;
    // flag2（Conversion.Grass[dirt]）的 Convert 分支仅 grass=23/199/109——本调用 grass=60 直写
    ty[ci] = grass;
    for (let m = x0; m < x1; m++) {
      for (let n = y0; n < y1; n++) {
        const ni = n * w + m;
        if (tf[ni] && ty[ni] === dirt && grassSpread < 1000) {
          grassSpread++;
          spread(m, n);
          grassSpread--;
        }
      }
    }
  };

  // ① 全图逐 tile 播种（cs:12510-12520）
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (st.flags[st.idx(x, y)]) {
        grassSpread = 0;
        spread(x, y);
      }
    }
  }

  // ② 散块清除（cs:12522-12529 + ScanTileColumnAndRemoveClumps cs:10164）
  const MAX = 20; // tileCounterMax（cs:4307）
  const solidClearable = (i: number): boolean => {
    const t = st.type[i];
    return st.flags[i] !== 0 && !!TILE_DEFS[t]?.solid && !NOT_CLEARABLE.has(t);
  };
  const counted = new Int32Array(MAX);
  let countN = 0;
  const flood = (x: number, y: number): void => {
    if (countN >= MAX) return;
    if (x < 5 || x >= w - 5 || y < 5 || y >= h - 5) return;
    const i = st.idx(x, y);
    if (!solidClearable(i)) return;
    for (let n = 0; n < countN; n++) if (counted[n] === i) return;
    counted[countN++] = i;
    flood(x - 1, y); flood(x + 1, y); flood(x, y - 1); flood(x, y + 1);
  };
  for (let x = 10; x < w - 10; x++) {
    let run = 0, runY = 0;
    for (let y = 10; y < h - 10; y++) {
      if (solidClearable(st.idx(x, y))) {
        if (run === 0) runY = y;
        run++;
        continue;
      }
      if (run > 0 && run < MAX) {
        countN = 0;
        flood(x, runY);
        if (countN < MAX) {
          for (let n = 0; n < countN; n++) st.flags[counted[n]] = 0;
        }
      }
      run = 0;
    }
  }
}
