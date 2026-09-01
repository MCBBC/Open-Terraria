// FinishNoTraps（1456 WorldGen.cs:26129-26367 / 1457 cs:26253-26478，~240 行全新
// 尾段）——noTrapsWorldGen 专属 Finish 子段，挂在 FinalCleanup pass 体内
// Dirtiest Block(⑭) 之后、ShimmerCleanUp 之前（cs:22624 调用位）。
//
// 五段结构（逐行对照 1457）：
//   A 生命水晶 12→665 巨石 1/maxValue（getGood&&!tenth 时 1/2；掷照耗，全图扫描
//     ≈(w-100)×(h-100) 次 Next——本 pass 的 RNG 主消费）；只写 type（帧不动——
//     12/665 同为 Style2x2 帧表，帧天然兼容）。
//   B 雕像 105 / 死亡之箱 467@fx144/162 无线时：3×3 无线 → 25×25 随机找线接驳
//     （L 形 x 先 y 后）；无线且 105 → 15×15 随机放压板 135（style Next(2,4) 每掷
//     照耗）成功后接驳。
//   C 467（!tenth||remix）：8×8 随机找 0/1/Ore/59/151 格 + 3×3 SolidTile → 直写
//     141 炸药（帧/坡/半砖归零）+ TileFrame(resetFrame:true)（Check1x1 可杀——杀则
//     continue）→ 接驳。else j++（105 跳列，原版字面 bug-for-bug）。
//   D 残存无线 467@fx144/fy0 → 金箱 21@fx36/54（2×2 四格 type+frameX 改写）。
//   E 每箱 1/15：item[1] 非空时首个空位（自 idx1 起）塞 5346 Gas Trap。
//
// 巨石实心窗：头 SetBoulderSolidity(false)（cs:26255——SolidTile 判定不含巨石格）
// + (D) 前还原 true（cs:26453）。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { vanGenSolidType } from './GenSolid';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../../../data/items';
import { setBoulderSolidity } from './TrapsPass';
import { genTileFrame, genSquareTileFrame } from './FinalCleanupPass';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const sheetOf = (t: number): number => (t >= 0 && t < SHEET.length ? SHEET[t] : -1);

const T665 = TILE_BY_KEY['v_665_life_crystal_boulder']!;
const T141 = TILE_BY_KEY['v_141_explosives']!;
const T21 = TILE_BY_KEY['chest']!;
const T135 = TILE_BY_KEY['v_135_pressure_plates']!;
const T488 = TILE_BY_KEY['v_488_fallen_log']!;
const T_DIRT_FNT = TILE_BY_KEY['dirt']!;                 // 原版 sheet0（Clear(Tile) 的 type=0 落位）
const PLATE_SHEET = 135;

/** Main.tileSolidTop（TrapsPass 同表副本——同源副本禁 import 惯例） */
const SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);

/** TileID.Sets.Ore（TileID.cs:399） */
const ORE_SHEETS = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);

// ── ★IIIII40：Main.tileFrameImportant（1457/1458 Main.cs InitializeTiles 赋值全集
//    403 项）——PlaceTile 入口臂②判定（cs:60137）。仅本 pass 消费的局部副本
//    （同源副本禁 import 惯例），生成期只用于目标格既有型的可加性判定。 ──
const FRAME_IMPORTANT_FNT = new Set([
  630, 631, 571, 579, 591, 592, 538, 544, 629, 550, 551, 533, 553, 554, 555, 556, 558, 559, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 632, 640, 643, 644, 645, 710, 568, 569,
  570, 580, 582, 619, 620, 572, 560, 564, 567, 565, 593, 594, 654, 518, 519, 549, 529, 637, 530, 705,
  233, 485, 227, 228, 231, 216, 217, 218, 219, 642, 220, 338, 453, 456, 165, 209, 215, 210, 212, 207,
  178, 184, 185, 186, 187, 173, 174, 139, 149, 142, 143, 144, 136, 137, 138, 664, 665, 484, 711, 712,
  713, 714, 715, 716, 320, 49, 380, 201, 3, 4, 5, 10, 11, 12, 13, 14, 469, 486, 488, 704,
  487, 489, 490, 15, 497, 16, 17, 18, 19, 20, 21, 467, 441, 468, 24, 26, 695, 27, 28,
  29, 31, 696, 33, 34, 35, 42, 50, 707, 55, 61, 703, 71, 72, 73, 74, 77, 78, 79, 81,
  82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 101, 102,
  103, 104, 105, 100, 106, 110, 113, 114, 125, 287, 126, 128, 129, 132, 133, 134, 135, 172, 319, 323,
  335, 337, 349, 376, 378, 425, 465, 506, 510, 511, 531, 545, 547, 548, 552, 573, 613, 614, 621,
  622, 623, 624, 700, 656, 701, 141, 270, 271, 581, 660, 314, 698, 583, 584, 585, 586, 587, 588,
  589, 590, 595, 596, 615, 616, 634, 493, 395, 520, 405, 406, 452, 411, 457, 462, 454, 494, 455,
  412, 387, 386, 388, 389, 653, 723, 724, 377, 373, 375, 374, 461, 709, 646, 372, 639, 358, 359,
  360, 361, 362, 363, 364, 391, 392, 393, 394, 542, 505, 521, 522, 523, 524, 525, 526, 527, 543,
  598, 356, 663, 334, 440, 471, 300, 301, 302, 303, 304, 305, 306, 307, 308, 354, 499, 355, 699,
  324, 463, 491, 464, 466, 419, 442, 443, 444, 420, 423, 424, 428, 429, 445, 476, 283, 288, 289,
  290, 291, 292, 293, 294, 295, 296, 297, 316, 317, 318, 410, 480, 509, 657, 658, 720, 721, 725,
  733, 751, 752, 753, 427, 726, 36, 275, 276, 277, 278, 279, 280, 281, 282, 285, 286, 414, 413,
  309, 310, 339, 532, 298, 299, 171, 247, 245, 246, 239, 240, 241, 242, 243, 244, 254, 237, 238,
  235, 236, 702, 269, 470, 475, 390, 597, 617,
]);

const WIRE_RED = TileStore.WIRE_RED;

/** SolidTile（cs:70155）：active && 生成期 tileSolid && !solidTop && !half && slope==0
 *  && !inActive。★巨石族在 FinishNoTraps 头已翻非实心 → 巨石格不过本门（(C) 的
 *  3×3 支撑判定语义关键）。 */
function solidTileF(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  const t = st.type[i]!;
  return st.flags[i] !== 0 && vanGenSolidType(t) && !SOLID_TOP.has(sheetOf(t))
    && !st.half[i] && st.slope[i] === 0 && ((st.wire[i] >>> 5) & 1) === 0;
}

/** L 形布线（cs:26300-26320 字面两段式：起点→x 走→y 走；与 TrapsPass.lWire 的
 *  合流循环等价覆盖同格集，此处按原版字面另写副本）。 */
function wireL(st: TileStore, x0: number, y0: number, x1: number, y1: number): void {
  st.wire[st.idx(x0, y0)] |= WIRE_RED;
  let wx = x0, wy = y0;
  while (wx !== x1) {
    if (wx < x1) wx++; else wx--;
    st.wire[st.idx(wx, wy)] |= WIRE_RED;
  }
  while (wy !== y1) {
    if (wy < y1) wy++; else wy--;
    st.wire[st.idx(wx, wy)] |= WIRE_RED;
  }
}

/** 原版物品 id → 本仓内部 id（BuriedChestsPass.vid 同源副本） */
function vid(id: number): number {
  const k = VANILLA_ITEM_KEY_BY_ID[id];
  return k ? (ITEM_BY_KEY[k] ?? -1) : -1;
}

/** TileID.Sets.Platforms（TileID.cs:157 全 6 成员）——SolidTile2 平台支 */
const PLATFORMS_FNT = new Set([19, 427, 435, 436, 437, 438, 439]);
/** TileID.Sets.Boulders（TileID.cs:195，含 665）——Wiring.IsAMechanism 拒门 */
const BOULDERS_SETS_FNT = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);

/** SolidTile2（cs:71023）：active && tileSolid && (平台&&(half||topSlope) || slope==0)
 *  && !half && !inActive。★与本仓 GenSolid 覆写表联动（巨石窗语义关键）。 */
function solidTile2Fnt(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const t = st.type[i]!;
  const sh = sheetOf(t);
  const platOk = PLATFORMS_FNT.has(sh) && (st.half[i] !== 0 || st.slope[i] === 1 || st.slope[i] === 2);
  return vanGenSolidType(t) && (platOk || st.slope[i] === 0) && !st.half[i]
    && ((st.wire[i] >>> 5) & 1) === 0;
}

// ★IIIII36 定罪修复②：FNT(B) 放板不再借 TrapsPass.placePlate——其 cascade3x3T 是
//   陷阱域裁剪分派表（无 184 苔芽 Next(3)/72 等全环掷族），与 vanilla PlaceTile 尾
//   SquareTileFrame→TileFrame→TileFrameImportant **全环**分派不等价。x86 权威在
//   本 seed 实测 FNT(B) 板尾级联掷 = PlaceTile|SquareTileFrame|TileFrameImportant 链
//   恰 +721 掷。此处按 cs:59833(cs:60162)→Place1x1(cs:45584) 直写 + 引擎全环级联：
//
// ★IIIII39 定罪修复③（终局）：PlaceTile case135 尾的 SquareTileFrame 是**无条件**
//   直落（1457 cs:60629-60630 / 1456 cs:60162-63：`Place1x1(...);SquareTileFrame(i,j);
//   break;`）——Place1x1 支撑门失败不写格时级联**照常触发**，苔藓邻格每块 1×Next(3)
//   照耗。IIII36 版误读为「尾 if(active) 才级联」，把失败尝试的邻域掷族整段漏掉
//   （per-anchor Δ 掷数补偿漂移 → #105 相位错位残差）。现改回无条件级联 + 按
//   Place1x1 内部边界拆两步：
export function placePlateVanillaFnt(st: TileStore, rng: RNG, x: number, y: number, style: number): boolean {
  // ── PlaceTile 外壳（cs:59833）：生成期 488 门 → 后续无条件走 case135 ──
  if (!st.inBounds(x, y)) return false;
  const i0 = st.idx(x, y);
  const preActive = st.flags[i0] !== 0;
  if (preActive && st.type[i0] === T488) return false;                      // cs:59835-38 生成期 488 门
  // ── ★IIIII40：PlaceTile 入口双臂（1457 cs:60133-60142 / rig 同文；num=135 不入任何
  //    前置早退族——转化族(23/199/2/109/60/661/662/70/633/moss)逐支 135 全不受理、
  //    num==81 门不适用、IsADripTile 非成员、liquid 门仅拦 torch/草本 banned 表（135
  //    缺席）⇒ 双臂**恒达**且先于 case135 本体、与成败无关；零掷流交互（纯标志写）
  //    ⇒ IIII39 值馈基线不动，只补标志副作用）：
  //    臂①目标失活：tile.Clear(Tile|TilePaint|Slope)（Tile.cs:746-771）＝type→原版0+
  //       失活+帧0 + slope(0)+halfBrick(false)；墙/液/红电线保留（未含 Wall/Liquid/
  //       Wiring 位）。非活性 ghost 型一并抹除（本仓 sheet-0 位=internal 'dirt'）。
  //    臂②目标活性：ResetsHalfBrickPlacementAttempt[num=135]=true（TileID.cs:181
  //       CreateBoolSet(true,…)=默认 true、草苔藓族 false——135 不在排除表） &&
  //       !Main.tileFrameImportant[tile.type] ＝ halfBrick(false)+frameX/Y 归零。
  //       ——x86 HALFOFF 探针实证 FNT 窗内恰 15 格 true→false 转变全部经此臂，
  //       caller=FinishNoTraps→PlaceTile（/tmp/iii41-out/x-halfoff.txt rc 段）；
  //       17 次 PA 尝试覆盖（两格各两次：首次清毕次次幂等）。 ──
  if (!preActive) {
    st.type[i0] = T_DIRT_FNT;                       // tile.Clear(Tile)：原版 type=0（inactive）
    st.slope[i0] = 0; st.half[i0] = 0;              // tile.Clear(Slope)
    st.frameX[i0] = 0; st.frameY[i0] = 0;           // tile.Clear(Tile) 帧 0（原地非 null Tile 恒有）
    st.paint[i0] = 0;                               // tile.Clear(TilePaint)
    st.coat[i0] &= ~TileStore.COAT_BLOCK_MASK;      // ClearBlockPaintAndCoating（方块侧三清）
  } else if (!FRAME_IMPORTANT_FNT.has(sheetOf(st.type[i0]!))) {
    st.half[i0] = 0;                                // tile.halfBrick(halfBrick: false)
    st.frameY[i0] = 0; st.frameX[i0] = 0;           // cs:60138-60140 帧 0
  }
  // ── Place1x1（cs:45584，内部自带 InWorld(,2) 早退——早退**不阻断**外壳级联）──
  if (x >= 2 && y >= 2 && x < st.w - 2 && y < st.h - 2) {
    const belowId = st.inBounds(x, y + 1) ? st.type[st.idx(x, y + 1)]! : -1;  // 原版裸读 type
    const belowSh = belowId >= 0 && belowId < TILE_DEFS.length ? SHEET[belowId] : -1;
    if (!BOULDERS_SETS_FNT.has(belowSh) && solidTile2Fnt(st, x, y + 1) && !st.flags[i0]) {
      // cs:45610 写支：置位+frameY=style*18
      st.flags[i0] = 1;
      st.type[i0] = T135;
      st.slope[i0] = 0; st.half[i0] = 0;
      st.paint[i0] = 0; st.paintWall[i0] = 0;
      st.frameY[i0] = style * 18;
    }
  }
  // ── cs:60630 尾级联 + x86 实证第二拍（IIIII39：SQ 恒 ≥1；格仍活性时再扫一遭，
  //    全数据律 nsq≥2 ⇔ 首扫后 flags!=0，6577/6579 全合）──
  genSquareTileFrame(st, rng, x, y);
  if (st.flags[i0] !== 0) genSquareTileFrame(st, rng, x, y);
  return st.flags[i0] !== 0 && sheetOf(st.type[i0]!) === PLATE_SHEET;
}

type ChestSink = Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>;

// ★IIIII39 批：FNT per-attempt 相位标定仪（rig 侧 JJHook.FntLine 同构镜像，默认无钩零开销）。
// 行式与 /tmp/rrrr-rigs/src/Terraria/WorldGen.cs FinishNoTraps 织入完全一致：
//   FNTSTART|rc / AT|i|j|rc / ACONV|i|j|rc / HUNT|i|j|tx,ty|f|rc / PATT|i|j|px,py|1|rc
//   BEND|i|j|rc / CI|i|j|q|ex,ey|st|rc / CEND|i|j|rc / MAINEND|rc
//   ECH|n|e15|skip|rc / FNTEND|rc —— rc=__swRollCntI39.v（__swOnRoll 全局样本计数）。
interface FntProbeI39 { emit?: (line: string) => void; v?: number }

/** FinishNoTraps 主体（cs:26253-26478）。chests=世界箱表（(E) 段消费）。 */
export function runFinishNoTraps(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const nf = gs.seedFlags;
  setBoulderSolidity(false);                                          // cs:26255
  let maxValue = 5;
  if (nf.getGoodWorld && !nf.tenthAnniversary) maxValue = 2;          // cs:26256-26259
  const w = st.w, h = st.h;

  const G39 = globalThis as unknown as { __swFntProbeI39?: FntProbeI39; __swRollCntI39?: { v: number } };
  const pr = G39.__swFntProbeI39;
  const em = pr?.emit;
  const rc = (): number => pr ? (G39.__swRollCntI39?.v ?? -1) : -1;
  if (pr) em?.(`FNTSTART|${rc()}`);

  for (let i = 50; i < w - 50; i++) {
    for (let j = 50; j < h - 50; j++) {
      if (pr) em?.(`AT|${i}|${j}|${rc()}`);
      // ---- (A) 生命水晶 → 巨石（cs:26264-26274；掷照耗） ----
      const ai = st.idx(i, j);
      const rollA = rng.int(0, maxValue - 1);
      if (rollA === 0 && st.flags[ai]
        && sheetOf(st.type[ai]!) === 12 && st.frameX[ai] === 0 && st.frameY[ai] === 0) {
        st.type[st.idx(i, j)] = T665;
        st.type[st.idx(i, j + 1)] = T665;
        st.type[st.idx(i + 1, j)] = T665;
        st.type[st.idx(i + 1, j + 1)] = T665;
        if (pr) em?.(`ACONV|${i}|${j}|${rc()}`);
      }
      // ---- (B) 门（cs:26275-26277）：偶偶格 + 活性 + 105/467@fx144|162 ----
      const bi = st.idx(i, j);
      if (i % 2 !== 0 || j % 2 !== 0 || !st.flags[bi]) continue;
      const sh = sheetOf(st.type[bi]!);
      if (sh !== 105 && !(sh === 467 && (st.frameX[bi] === 144 || st.frameX[bi] === 162))) continue;
      // 3×3 邻域无线判定（cs:26279-26290）
      let wired = false;
      for (let k = i - 1; k <= i + 1; k++) {
        for (let l = j - 1; l <= j + 1; l++) {
          if (st.inBounds(k, l) && (st.wire[st.idx(k, l)] & WIRE_RED)) wired = true;
        }
      }
      if (!wired) {
        // 25×25 随机找线（cs:26292-26306；625 掷上限）
        const num = 25;
        let tx = 0, ty = 0, found = false, steps = 0;
        for (let m = 0; m < num * num; m++) {
          tx = rng.int(i - num, i + num);
          ty = rng.int(j - num, j + num);
          steps++;
          if (st.wire[st.idx(tx, ty)] & WIRE_RED) { found = true; break; }
        }
        if (pr) em?.(`HUNT|${i}|${j}|${tx},${ty}|${found ? 1 : 0}|${rc()}`);
        if (found) {
          wireL(st, i, j, tx, ty);                                      // cs:26308-26326
        } else if (sh === 105) {
          // 15×15 随机放板（cs:26327-26351；每掷 3 耗：x/y/style）
          const num15 = 15;
          let px2 = 0, py2 = 0, placed = false, psteps = 0, lastStyle = -1;
          for (let n = 0; n < num15 * num15; n++) {
            const preP = rc();
            px2 = i + rng.int(-num15, num15);
            py2 = j + rng.int(-num15, num15);
            lastStyle = rng.int(2, 3);
            // ★IIIII36 定罪修复①②：vanilla PlaceTile(135,forced) 成功后无条件尾
            //   SquareTileFrame→全环 TileFrame（x86 权威实测 FNT(B) 板尾级联掷恰 +721；
            //   tags 链 PlaceTile|SquareTileFrame|TileFrameImportant 全量）。旧
            //   TrapsPass.placePlate 调用其 cascade3x3T 是陷阱域裁剪分派表（无 184 苔芽
            //   Next(3)/72 等掷族；且曾漏传 rng ⇒ 全零耗）——两者皆不等价。换
            //   placePlateVanillaFnt 直写谓词+引擎全环级联（TrapsPass 不动）。
            placePlateVanillaFnt(st, rng, px2, py2, lastStyle);
            psteps++;
            const okN = sheetOf(st.type[st.idx(px2, py2)]!) === PLATE_SHEET;
            if (pr) em?.(`PA|${i}|${j}|${n}|${px2},${py2}|${lastStyle}|${okN ? 1 : 0}|${preP},${rc()}`);
            if (okN) { placed = true; break; }
          }
          if (placed) {
            if (pr) em?.(`PATT|${i}|${j}|${px2},${py2}|1|${rc()}`);
            wireL(st, i, j, px2, py2);
          }
        }
      }
      if (pr) em?.(`BEND|${i}|${j}|${rc()}`);
      // ---- (C) 467 → 141 炸药埋点（cs:26355-26448；else j++ 跳列） ----
      if (sh === 467 && (!nf.tenthAnniversary || nf.remix)) {
        const num8 = 8;
        let doneC = false;
        for (let q = 0; q < num8 * num8 && !doneC; q++) {
          const ex = i + rng.int(-num8, num8);
          const ey = j + rng.int(-num8, num8);
          const et = sheetOf(st.type[st.idx(ex, ey)]!);
          if (!(et === 0 || et === 1 || ORE_SHEETS.has(et) || et === 59 || et === 151)) {
            if (pr) em?.(`CI|${i}|${j}|${q}|${ex},${ey}|0|${rc()}`);
            continue;
          }
          let solid = true;
          for (let a = ex - 1; a <= ex + 1 && solid; a++) {
            for (let b = ey - 1; b <= ey + 1; b++) {
              if (!solidTileF(st, a, b)) { solid = false; break; }
            }
          }
          if (!solid) {
            if (pr) em?.(`CI|${i}|${j}|${q}|${ex},${ey}|1|${rc()}`);
            continue;
          }
          const ei = st.idx(ex, ey);
          st.type[ei] = T141;
          st.frameX[ei] = 0; st.frameY[ei] = 0;
          st.slope[ei] = 0; st.half[ei] = 0;
          // TileFrame(ex,ey,resetFrame:true)（cs:26417）——Check1x1 无地基可杀
          genTileFrameSafe(st, rng, ex, ey);
          const survived = sheetOf(st.type[ei]!) === 141;
          if (!survived) {                                              // cs:26421-26423
            if (pr) em?.(`CI|${i}|${j}|${q}|${ex},${ey}|2|${rc()}`);
            continue;
          }
          if (pr) em?.(`CI|${i}|${j}|${q}|${ex},${ey}|3|${rc()}`);
          wireL(st, i, j, ex, ey);
          doneC = true;
        }
      } else {
        j++;                                                            // cs:26449 else j++（105 跳列）
      }
      if (pr) em?.(`CEND|${i}|${j}|${rc()}`);
    }
  }
  setBoulderSolidity(true);                                           // cs:26453
  if (pr) em?.(`MAINEND|${rc()}`);
  // ---- (D) 残存无线 467@fx144/fy0 → 金箱 21@fx36/54（cs:26455-26475） ----
  for (let x = 20; x < w - 20; x++) {
    for (let y = 20; y < h - 20; y++) {
      const di = st.idx(x, y);
      if (!st.flags[di] || sheetOf(st.type[di]!) !== 467) continue;
      if (st.frameX[di] !== 144 || st.frameY[di] !== 0) continue;
      if ((st.wire[st.idx(x, y)] & WIRE_RED) || (st.wire[st.idx(x + 1, y)] & WIRE_RED)
        || (st.wire[st.idx(x, y + 1)] & WIRE_RED) || (st.wire[st.idx(x + 1, y + 1)] & WIRE_RED)) continue;
      st.type[st.idx(x, y)] = T21; st.frameX[st.idx(x, y)] = 36;
      st.type[st.idx(x + 1, y)] = T21; st.frameX[st.idx(x + 1, y)] = 54;
      st.type[st.idx(x, y + 1)] = T21; st.frameX[st.idx(x, y + 1)] = 36;
      st.type[st.idx(x + 1, y + 1)] = T21; st.frameX[st.idx(x + 1, y + 1)] = 54;
    }
  }
  // ---- (E) 每箱 1/15 塞 5346 Gas Trap（cs:26477-26492） ----
  // ★IIII102c：原文 `num18<8000 { chest=Main.chest[num18]; if null break; … }`——
  //   首洞截断（整链后续不再耗 Next(15)）;稀疏 sink 下必须镜像,否则掷流漂移。
  const gasId = vid(5346);
  for (let num18 = 0; num18 < chests.length && num18 < 8000; num18++) {
    const c = chests[num18];
    if (!c) break;
    const e15 = rng.int(0, 14);                                         // Next(15)（掷照耗）
    const skip = e15 !== 0 || !c.items[1] || c.items[1].stack === 0;
    if (pr) em?.(`ECH|${num18}|${e15}|${skip ? 1 : 0}|${rc()}`);
    if (skip) continue;
    if (gasId < 0) continue;                                            // 未注册防御（现注册,不触发）
    const items = c.items;
    for (let q = 1; q < 20; q++) {
      const cur = q < items.length ? items[q]! : null;
      if (!cur || cur.stack === 0) { items[q] = { id: gasId, stack: 1 }; break; }
    }
  }
  if (pr) em?.(`FNTEND|${rc()}`);
}

/** TileFrame 单格生成期入口（FinalCleanupPass.genTileFrame = TileFrame(resetFrame:true) 字面包装） */
function genTileFrameSafe(st: TileStore, rng: RNG, x: number, y: number): void {
  genTileFrame(st, rng, x, y);
}
