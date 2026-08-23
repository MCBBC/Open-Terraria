// 原版 WorldGen.TileRunner 移植(WorldGen.cs:46405)——地形/洞穴/矿石/沙/泥的万能 workhorse。
// 沿随机方向走 steps 步,每步以衰减半径的钻石区域(L1 距离 + 1.5% 抖动)铺设/挖除 type。
// type<0 = 挖空(-1 空气 / -2 遇活性块则填液体);type>=0 = 铺设(仅改写活性块 type,
// addTile 才激活空气格——原版语义,空气格上的幽灵 type 不渲染)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';

const MUD = TILE_BY_KEY['mud']!;
const CLAY = TILE_BY_KEY['clay']!;
const SANDSTONE = TILE_BY_KEY['sandstone']!;
const HARDSAND = TILE_BY_KEY['hardened_sand']!;
const MARBLE = TILE_BY_KEY['v_367_marble_block']!;
const GRANITE = TILE_BY_KEY['v_368_granite_block']!;

/** 按 vanilla sheet id 收集本仓库 tile id(缺失的自动跳过) */
export function idsByVanillaSheet(...sheets: number[]): Set<number> {
  const out = new Set<number>();
  for (const d of TILE_DEFS) {
    const vs = d.vanilla?.sheet;
    if (vs !== undefined && sheets.includes(vs)) out.add(TILE_BY_KEY[d.key]);
  }
  return out;
}

// 原版 Main.tileStone(Main.cs:6120-6139):宝石 63-68 + 活/失活石 130/131 + 琥珀石 566。
// 只有这些"放置类型"触发 flag3(仅替换石头)
const STONE_PLACED = idsByVanillaSheet(63, 64, 65, 66, 67, 68, 130, 131, 566);
// TileID.Sets.CanBeClearedDuringGeneration = false 全集（1456 TileID.cs:321，
// 2026-08-11 种子等价对齐——曾自加电路器件 135-137/141/443 保护，原版生成期可覆盖）
export const NOT_CLEARABLE = idsByVanillaSheet(
  396, 400, 401, 397, 398, 399, 404,   // 沙岩家族
  368, 367,                            // 花岗岩/大理石
  41, 43, 44,                          // 地牢砖
  481, 482, 483,                       // 1.4.5 新增不可清块
  226, 237);                           // 蜥蜴砖/陨石
// 原版 switch case 45/147/189/190/196/460/717/718/719:无条件 flag3(金砖/雪/云/荧光菇/雨云/雪云+1.4.5新增)
const FLAG3_ALWAYS = idsByVanillaSheet(45, 147, 189, 190, 196, 460, 717, 718, 719);
// ★TileID.Sets.SaveSlopes（TileID.cs:425-429，静态初始化=启动期默认 tileSolid 表快照，
//   生成期 Main.tileSolid 翻转不回写）：SaveSlopes[t]=默认实心 ∪ NonSolidSaveSlopes
//   {131,351,336,340,341,342,343,344}。TileRunner 写 type 时 !SaveSlopes[type] →
//   ClearSlope()（cs:77338-77341,Tile.cs:160=slope0+half0）——蛛网(51)/泥(59)/矿石等
//   非实心类型覆盖已带坡格必须清坡位（W 批 #19 残余根因:Webs #27 的 web runner 覆盖
//   沙漠带 #19 平滑坡 109 格,漏清 → truth@52 幻影坡）。
const SAVE_SLOPES = new Uint8Array(TILE_DEFS.length);
{
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    // ★PPPPP 批（2026-08-20）：pristine 三族差修正（同 TileCleanupPass/QuickCleanupPass
    //   isSaveSlope 勘误口径）——平台族 sheet{19,239,380,427,435-439}/192 活树叶/
    //   481-483 裂砖原版静态 tileSolid=true（SaveSlopes 启动期快照含之），仓库
    //   TILE_DEFS.solid=false → TileRunner 铺设覆写带坡的上述格时曾误走 ClearSlope
    //   支（vanilla 保坡）。NNNNN 备案"本种子零触发"口径债，此清。
    const pristineSolid = (TILE_DEFS[i]?.solid ?? false)
      || s === 19 || s === 239 || s === 380 || s === 427
      || (s !== undefined && s >= 435 && s <= 439)
      || s === 192 || s === 481 || s === 482 || s === 483;
    SAVE_SLOPES[i] = (pristineSolid
      || (s !== undefined && [131, 351, 336, 340, 341, 342, 343, 344].includes(s))) ? 1 : 0;
  }
}
// TileID.Sets.Ore:铺设 396/397 时矿石可覆盖
const ORE_SET = new Set<number>();
{
  for (const k of ['ore_copper', 'ore_tin', 'ore_iron', 'ore_lead', 'ore_silver', 'ore_tungsten',
    'ore_gold', 'ore_platinum', 'ore_demonite', 'ore_crimtane', 'ore_cobalt', 'ore_mythril',
    'ore_adamantite', 'ore_palladium', 'ore_orichalcum', 'ore_titanium', 'ore_chlorophyte',
    'ore_hellstone', 'ore_meteorite']) { const id = TILE_BY_KEY[k]; if (id !== undefined) ORE_SET.add(id); }
}

export interface TileRunnerOpts {
  strength: number;
  steps: number;
  type: number;          // <0 挖空;>=0 铺设的 tile id
  addTile?: boolean;     // 铺设时激活格子并清液体(挖空恒 false)
  speedX?: number;
  speedY?: number;
  noYChange?: boolean;   // 地表以上铺设时填土墙(墙 2)
  overRide?: boolean;    // 覆盖已有活性块(默认 true)
  ignoreTileType?: number; // 遇此类型跳过(-1 不过滤)
  mudWall?: boolean;     // 丛林泥墙模式(墙 15/64 按深度)
}


/** framed 活性跳过判定 LUT(TileRunner 内层逐格热路径)。
 *  原版判定（cs:77217）：active && Main.tileFrameImportant[type] && !Main.tileCut[type]。
 *  ★曾用近似映射 framed&&!decor——沙漠后世界已有 484(滚动仙人掌)/485(蚁狮幼虫)：
 *  二者 frameImportant=true 但 **tileCut=true** → 原版不跳（耗 dist 掷+可被泥覆写），
 *  近似表跳过 → DirtToMud 起 dist 流偏 ~4.7k 掷,泥 runner 全体错位。现取
 *  Main.cs 全量 frameImportant(411 含循环 435-439+Echo 家族)扣除 tileCut(41)精确集。 */
const FRAME_IMPORTANT_SKIP_SHEETS = new Set([
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
const FRAMED_SKIP = new Uint8Array(TILE_DEFS.length);
for (let _i = 0; _i < TILE_DEFS.length; _i++) {
  const _s = TILE_DEFS[_i]?.vanilla?.sheet;
  if (typeof _s === 'number' && FRAME_IMPORTANT_SKIP_SHEETS.has(_s)) FRAMED_SKIP[_i] = 1;
}

/** 原版 WorldGen.PlaceWall（cs:75189）：边界 (1,W-2)×(1,H-2) 内 **仅 wall==0 时**落墙；
 *  成功落墙必经 SquareWallFrame→Framing.WallFrame(resetFrame:true) 掷 1 颗 Next(0,3)
 *  （cs:390——墙 15/64/178/180 均不在 wallLargeFrames 1/2 表 → 必掷）。
 *  曾无条件覆写+零掷骰 → jungle 段流指纹与墙网从首个泥 runner 起分叉。 */
function placeWall(st: TileStore, rng: RNG, x: number, y: number, type: number): void {
  if (x <= 1 || y <= 1 || x >= st.w - 2 || y >= st.h - 2) return;
  const i = st.idx(x, y);
  if (st.wall[i] === 0) { st.wall[i] = type; rng.int(0, 2); }
}

export function tileRunner(
  st: TileStore, rng: RNG, gs: GenState,
  i: number, j: number, o: TileRunnerOpts,
): void {
  const { strength, steps, type } = o;
  const addTile = o.addTile ?? false;
  const overRide = o.overRide ?? true;
  const noYChange = o.noYChange ?? false;
  const ignoreTileType = o.ignoreTileType ?? -1;
  let num1 = strength;          // 当前半径(衰减)
  let num2 = steps;             // 剩余步数
  let px = i + 0.0, py = j + 0.0;
  // 原版初始速度 Next(-10,11)*0.1(0.1 步长离散);仅 speedX/speedY 任一非 0 才覆写
  let vx = rng.int(-10, 10) * 0.1;
  let vy = rng.int(-10, 10) * 0.1;
  if ((o.speedX ?? 0) !== 0 || (o.speedY ?? 0) !== 0) {
    vx = o.speedX ?? 0; vy = o.speedY ?? 0;
  }
  // 原版 num3 液体类型掷骰（1456 cs:77163-77176）：notTheBees&&dontStarve 分支
  // 普通世界短路不掷；else if (Next(4)==0) 的 Next(4) **每次调用必掷**（普通世界
  // 结果弃用，num3 恒 0=水）。缺失则每次调用流偏 1 格——种子等价致命。
  rng.nextIntRange(0, 4);


  // 热循环局部化(零语义:typed array 引用与 w 提为局部;idx 内联 y*w+x)
  const stW = st.w;
  const ty = st.type, tf = st.flags, twall = st.wall, tliq = st.liquid, tltype = st.liquidType;
  const thalf = st.half, tslope = st.slope;
  while (num1 > 0 && num2 > 0) {
    // 泥向上钻出世界顶即停(原版)
    if (py < 0 && num2 > 0 && type === MUD) num2 = 0;
    num1 = strength * (num2 / steps);
    num2--;
    const x0 = Math.max(1, Math.floor(px - num1 * 0.5));
    const x1 = Math.min(stW - 1, Math.floor(px + num1 * 0.5));
    const y0 = Math.max(1, Math.floor(py - num1 * 0.5));
    const y1 = Math.min(st.h - 1, Math.floor(py + num1 * 0.5));
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        // 原版活性 framed 物件跳过（cs:77217-77220，在 dist 掷骰**之前**短路——
        // 这些格不消耗菱形判定骰）。近似映射：framed && !decor（树/箱/门等）；
        // 植物 decor≈tileCut 不跳。洞穴链阶段世界尚无 framed 活性块，零影响，
        // 后续矿石 pass 与结构 pass 有相对序保证，此门禁主要防未来反序调用。
        const ti = y * stW + x;   // ★曾重复 idx(ci0+ti 同值);内联
        if (tf[ti] && FRAMED_SKIP[ty[ti]]) continue;
        if (ignoreTileType >= 0 && ty[ti] === ignoreTileType && tf[ti]) continue;
        const dist = Math.abs(x - px) + Math.abs(y - py);
        if (dist >= strength * 0.5 * (1 + rng.int(-10, 10) * 0.015)) continue;
        // 丛林泥墙(原版 mudWall 分支:浅层墙 15,深层墙 64,均避让四邻;落墙走
        // PlaceWall 语义=仅空墙可落+成功必掷 1 颗 Next(0,3))
        // ★局部化:twall=st.wall 提局部 + idx 内联(泥 runner 每格 5-8 次跳读,热点)
        if (o.mudWall && y > gs.worldSurface && twall[ti - stW] !== 2
          && y < st.h - 210 - rng.int(0, 2)
          && dist < strength * 0.45 * (1 + rng.int(-10, 10) * 0.01)) {
          if (y > gs.lavaLine - rng.int(0, 3) - 50) {
            if (twall[ti - stW] !== 64 && twall[ti + stW] !== 64
              && twall[ti - 1] !== 64 && twall[ti + 1] !== 64) placeWall(st, rng, x, y, 15);
          } else if (twall[ti - stW] !== 15 && twall[ti + stW] !== 15
            && twall[ti - 1] !== 15 && twall[ti + 1] !== 15) {
            placeWall(st, rng, x, y, 64);
          }
        }
        // granite/marble 伴生墙(cs:77272-77278):核心 0.3R 内 PlaceWall 180/178
        if (type === GRANITE || type === MARBLE) {
          if (dist < strength * 0.3 * (1 + rng.int(-10, 10) * 0.01)) {
            placeWall(st, rng, x, y, type === GRANITE ? 180 : 178);
          }
        }
        if (type < 0) {
          // 挖空:仅活性沙不挖(原版 active&&type==53 保护);-2 在活性块上填液体
          if (tf[ti] && ty[ti] === T.SAND) continue;
          if (type === -2 && tf[ti] && (y < gs.waterLine || y > gs.lavaLine)) {
            tliq[ti] = 255;
            tltype[ti] = y > gs.lavaLine ? 2 : 1;
          }
          // 原版 active(false) **保留 type**（幽灵语义）——挖除清零会让后续
          // 拒绝采样/flag4 判定读错（收尾洞穴循环实测分叉点）
          tf[ti] = 0;
        } else {
          // 铺设:原版 flag4 规则（1456 cs:77277-77330）。结构语义：
          // overRide 仅门禁"保护计算"，**不门禁写入**——!flag4 一律写 type
          //（overRide=false 时 flag4 恒 false，活性块照写）
          let flag4 = false;
          const cur = ty[ti];
          if (overRide && tf[ti]) {
            // Main.tileStone[type](放置类型是宝石族)且目标非石头 → flag4
            flag4 = STONE_PLACED.has(type) && cur !== T.STONE;
            // CanBeClearedDuringGeneration:false 的 tile 被覆盖时恒 flag4
            if (NOT_CLEARABLE.has(cur)) flag4 = true;
            if (cur === T.STONE) {
              // 泥不替换近地表的石头(±50 抖动)
              if (type === MUD) {
                const f4r = rng.int(-50, 49);
                if (y < gs.worldSurface + f4r) flag4 = true;
              }
            } else if (FLAG3_ALWAYS.has(cur)) {
              // 金砖/雪/云/荧光菇/雨云/雪云/717-719:无条件保护
              flag4 = true;
            } else if (cur === T.SAND) {
              if (type === MUD && inUndergroundDesert(gs, x, y)) flag4 = true;
              if (type === CLAY) flag4 = true;  // 原版 case 53: type==40(ClayBlock)
              if (y < gs.worldSurface && type !== MUD) flag4 = true;
            } else if (cur === MARBLE || cur === GRANITE) {
              if (type === MUD) flag4 = true;
            } else if (cur === SANDSTONE || cur === HARDSAND) {
              // 原版 case 396/397（cs:77308-77311）：**赋值** flag4 = !TileID.Sets.Ore[type]
              // ——会覆盖前面 CanBeClearedDuringGeneration 置的 true（矿石可替换沙岩/硬化沙）。
              // 曾写成"非矿石才置 true"→ 矿石被 NOT_CLEARABLE 拦住，整片沙漠矿石缺失
              flag4 = !ORE_SET.has(type);
            }
          }
          if (!flag4) {
            ty[ti] = type;
            // cs:77338-77341:flag = type>=0 && !SaveSlopes[type] → 写后 ClearSlope()
            if (!SAVE_SLOPES[type]) { thalf[ti] = 0; tslope[ti] = 0; }
          }
          if (addTile) {
            tf[ti] = 1;
            tliq[ti] = 0;
            tltype[ti] = 0;
          }
          if (noYChange && y < gs.worldSurface && type !== MUD) twall[ti] = 2;
          if (type === MUD && y > gs.waterLine && tliq[ti] > 0) {
            tliq[ti] = 0;
            tltype[ti] = 0;
          }
        }
      }
    }
    // 移动 + 大半径加速(原版 12 档阶梯 50..900,每档速度抖动 ±0.05)
    px += vx; py += vy;
    for (const thr of [50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900]) {
      if (num1 > thr) {
        px += vx; py += vy;
        num2--;
        vy += rng.int(-10, 10) * 0.05;
        vx += rng.int(-10, 10) * 0.05;
      } else break;
    }
    // 每步全局速度抖动 + ±1 钳制(cs L46659-46673):X 恒抖;
    // !noYChange 时 Y 抖动;noYChange 且非泥、半径<3 时只钳不抖
    vx += rng.int(-10, 10) * 0.05;
    if (vx > 1) vx = 1;
    if (vx < -1) vx = -1;
    if (!noYChange) {
      vy += rng.int(-10, 10) * 0.05;
      if (vy > 1) vy = 1;
      if (vy < -1) vy = -1;
    } else if (type !== MUD && num1 < 3) {
      if (vy > 1) vy = 1;
      if (vy < -1) vy = -1;
    }
    // 泥专用 vy 规则(1456 cs L77484-77500)：±0.5 钳 + 岩层上界/地狱带上界定向推挤——
    // 丛林首轮泥 runner(vy 初始 ±1)靠它被压进 [rockLayer+100, maxTilesY-300] 带；缺失时泥漂出丛林
    if (type === MUD && !noYChange) {
      if (vy > 0.5) vy = 0.5;
      if (vy < -0.5) vy = -0.5;
      if (py < gs.rockLevel + 100) vy = 1;
      if (py > st.h - 300) vy = -1;
    }
  }
}

/**
 * 原版 WorldGen.digTunnel(L48132)移植:蜿蜒洞穴原语。
 * 速度 = (dir + 噪声游走±0.2/步) × 0.6 → 会拐弯;半径在 [Size×0.6, Size×2] 随机波动 → 粗细变化。
 * 这是有机洞型的来源(TileRunner strength<50 时恒速恒宽 = 直线刀砍)。
 */
export function digTunnel(
  st: TileStore, rng: RNG,
  X: number, Y: number, xDir: number, yDir: number,
  steps: number, size: number, wet = false,
): [number, number] {
  let x = Math.max(size + 1, Math.min(st.w - size - 1, X));
  let y = Math.max(size + 1, Math.min(st.h - size - 1, Y));
  let noiseX = 0, noiseY = 0;
  let radius = size;
  for (let step = 0; step < steps; step++) {
    // (int) 向零截断（cs:79766-79767）：floor 在负小数时多扫一列 → 多耗 dist 骰
    const x0 = Math.trunc(x - radius), x1 = Math.floor(x + radius);
    const y0 = Math.trunc(y - radius), y1 = Math.floor(y + radius);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        if (Math.abs(ix - x) + Math.abs(iy - y) < radius * (1 + rng.int(-10, 10) * 0.005)
          && st.inBounds(ix, iy)) {
          const i = st.idx(ix, iy);
          st.flags[i] = 0; // 原版 active(false) 保留 type（幽灵）——清零分叉拒绝采样
          if (wet) { st.liquid[i] = 255; st.liquidType[i] = 1; }
        }
      }
    }
    radius += rng.int(-50, 50) * 0.03;
    if (radius < size * 0.6) radius = size * 0.6;
    if (radius > size * 2) radius = size * 2;
    noiseX += rng.int(-20, 20) * 0.01;
    noiseY += rng.int(-20, 20) * 0.01;
    noiseX = Math.max(-1, Math.min(1, noiseX));
    noiseY = Math.max(-1, Math.min(1, noiseY));
    x += (xDir + noiseX) * 0.6;
    y += (yDir + noiseY) * 0.6;
  }
  return [x, y];
}

function inUndergroundDesert(gs: GenState, x: number, y: number): boolean {
  const ud = gs.undergroundDesert;
  return !!ud && x >= ud.x0 && x <= ud.x1 && y >= ud.y0 && y <= ud.y1;
}

// ---- OreRunner(WorldGen.cs:49246-49355)——祭坛矿/地表矿脉专用原语,与 TileRunner 是
//      两个不同原语(R8-10):①无 addTile 语义,只改写 active 格(矿脉绝不凸进空气腔);
//      ②白名单替换表(49312):泥土/石/草族/沙/雪 147/粘土/泥 59/苔族 tileMoss/
//      199/200/203/234/396-403 全家族/(NTB)230/(神庙砖 225 且 wall!=108)——表外
//      (地牢砖/灰烬/黑曜石/家具)一律不动;③命中后 paintTile(k,l,0) 清油漆(49315);
//      ④盒钳 [0,maxTilesX]/[0,maxTilesY](49281-49296,TileRunner 是 [1,w-1]);
//      ⑤运动:val+=val2 后只重掷 X(Next(-10,11)*0.05 钳 ±1,49342-49351)——Y 速度
//      仅初掷 Next(-10,11)*0.1 恒定=恒斜率直线漂移;无 num3 液掷、无 framed 跳过、
//      无 ClearSlope(OreRunner 不清坡)。dist 骰对全盒格消耗(短路在骰后)。 ----
/** Main.tileMoss 全表(Main.cs:7146-7186):179/180/181/182/183/381/534/536/539/625/627 */
const ORE_REPLACE_SHEETS = [
  0, 1, 23, 25, 40, 53, 57, 59, 60, 70, 109, 112, 116, 117, 147, 161, 163, 164,
  199, 200, 203, 234, 396, 397, 398, 399, 400, 401, 402, 403,
  179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627,
];
export interface OreRunnerOpts {
  strength: number;
  steps: number;
  /** 内部 tile id(替换产物);-1 = 只处理墙(本仓未用) */
  type: number;
  /** notTheBees 世界:白名单追加 230(蘑菇泥) */
  ntb?: boolean;
}
export function oreRunner(
  st: TileStore, rng: RNG, i: number, j: number, o: OreRunnerOpts,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const { strength, steps, type } = o;
  const replace = idsByVanillaSheet(...ORE_REPLACE_SHEETS);
  if (o.ntb) for (const id of idsByVanillaSheet(230)) replace.add(id);
  const templeBrick = idsByVanillaSheet(225);
  let num = strength;
  let num2 = steps;
  let px = i + 0.0, py = j + 0.0;
  const vx0 = rng.int(-10, 10) * 0.1;   // 49268-49269 双初掷(X/Y 各一次)
  let vx = vx0;
  const vy = rng.int(-10, 10) * 0.1;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  while (num > 0 && num2 > 0) {
    if (py < 0 && num2 > 0 && type === MUD) num2 = 0;  // 49278 泥出顶即停
    num = strength * (num2 / steps);
    num2--;
    // 盒界 trunc+钳 [0,w]/[0,h](49281-49296;TileRunner 是 [1,w-1])
    const x0 = Math.max(0, Math.trunc(px - num * 0.5));
    const x1 = Math.min(st.w, Math.trunc(px + num * 0.5));
    const y0 = Math.max(0, Math.trunc(py - num * 0.5));
    const y1 = Math.min(st.h, Math.trunc(py + num * 0.5));
    for (let k = x0; k < x1; k++) {
      for (let l = y0; l < y1; l++) {
        // dist 骰对全盒格消耗(49303-49305:骰在短路链首段内恒掷)
        if (!(Math.abs(k - px) + Math.abs(l - py) < strength * 0.5 * (1 + rng.int(-10, 10) * 0.015))) continue;
        if (!st.inBounds(k, l)) continue;  // 原版靠盒钳不越界;防御等价
        const idx = st.idx(k, l);
        if (type !== -1 && st.flags[idx] !== 0) {
          const t = st.type[idx];
          // 白名单(49312-49314):表外不动;225 神庙砖带 wall!=108 门
          const ok = replace.has(t) || (templeBrick.has(t) && st.wall[idx] !== 108);
          if (ok) {
            st.type[idx] = type;
            st.paint[idx] = 0;              // paintTile(k,l,0) 清油漆(49315)
            if (k < bx0) bx0 = k; if (k > bx1) bx1 = k;
            if (l < by0) by0 = l; if (l > by1) by1 = l;
          }
        }
      }
    }
    px += vx; py += vy;                     // 49353
    vx += rng.int(-10, 10) * 0.05;          // 49354 只重掷 X
    if (vx > 1) vx = 1;
    if (vx < -1) vx = -1;
  }
  return bx0 === Infinity ? null : { x0: bx0, y0: by0, x1: bx1, y1: by1 };
}
