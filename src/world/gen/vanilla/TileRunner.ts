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


/** framed 活性跳过判定 LUT(TileRunner 内层逐格热路径;定义同源=原判定式逐 id 预计算) */
const FRAMED_SKIP = new Uint8Array(TILE_DEFS.length);
for (let _i = 0; _i < TILE_DEFS.length; _i++) {
  const _d = TILE_DEFS[_i];
  if (_d && _d.framed && !_d.decor) FRAMED_SKIP[_i] = 1;
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
        // 丛林泥墙(原版 mudWall 分支:浅层墙 15,深层墙 64,均避让四邻)
        // ★局部化:twall=st.wall 提局部 + idx 内联(泥 runner 每格 5-8 次跳读,热点)
        if (o.mudWall && y > gs.worldSurface && twall[ti - stW] !== 2
          && y < st.h - 210 - rng.int(0, 2)
          && dist < strength * 0.45 * (1 + rng.int(-10, 10) * 0.01)) {
          if (y > gs.lavaLine - rng.int(0, 3) - 50) {
            if (twall[ti - stW] !== 64 && twall[ti + stW] !== 64
              && twall[ti - 1] !== 64 && twall[ti + 1] !== 64) twall[ti] = 15;
          } else if (twall[ti - stW] !== 15 && twall[ti + stW] !== 15
            && twall[ti - 1] !== 15 && twall[ti + 1] !== 15) {
            twall[ti] = 64;
          }
        }
        // granite/marble 伴生墙(cs L46503-46506):核心 0.3R 内同步铺墙 180/178
        if (type === GRANITE || type === MARBLE) {
          if (dist < strength * 0.3 * (1 + rng.int(-10, 10) * 0.01)) {
            twall[ti] = type === GRANITE ? 180 : 178;
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
          if (!flag4) ty[ti] = type;
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
