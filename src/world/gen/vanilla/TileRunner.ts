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
const SNOW = TILE_BY_KEY['snow']!;
const CLOUD = TILE_BY_KEY['v_189_cloud_block']!;
const GLOW_MUSH = TILE_BY_KEY['v_190_glowing_mushroom_block']!;
const RAIN_CLOUD = TILE_BY_KEY['v_196_rain_cloud_block']!;
const SANDSTONE = TILE_BY_KEY['sandstone']!;
const HARDSAND = TILE_BY_KEY['hardened_sand']!;
const MARBLE = TILE_BY_KEY['v_367_marble_block']!;
const GRANITE = TILE_BY_KEY['v_368_granite_block']!;

// 原版 Main.tileStone:与石同族的替代矿 tile(flag3 逻辑用)
const STONE_FAMILY = new Set<number>();
{
  const stoneKeys = ['stone', 'ore_tin', 'ore_lead', 'ore_tungsten', 'ore_platinum', 'ore_cobalt',
    'ore_mythril', 'ore_adamantite', 'ore_palladium', 'ore_orichalcum', 'ore_titanium',
    'v_25_ebonstone_block', 'v_203_crimstone_block', 'v_117_pearlstone_block',
    'v_368_granite_block', 'v_367_marble_block'];
  for (const k of stoneKeys) { const id = TILE_BY_KEY[k]; if (id !== undefined) STONE_FAMILY.add(id); }
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
  let vx = rng.range(-1, 1);
  let vy = rng.range(-1, 1);
  if (o.speedX !== undefined || o.speedY !== undefined) {
    vx = o.speedX ?? 0; vy = o.speedY ?? 0;
  }

  while (num1 > 0 && num2 > 0) {
    // 泥向上钻出世界顶即停(原版)
    if (py < 0 && num2 > 0 && type === MUD) num2 = 0;
    num1 = strength * (num2 / steps);
    num2--;
    const x0 = Math.max(1, Math.floor(px - num1 * 0.5));
    const x1 = Math.min(st.w - 1, Math.floor(px + num1 * 0.5));
    const y0 = Math.max(1, Math.floor(py - num1 * 0.5));
    const y1 = Math.min(st.h - 1, Math.floor(py + num1 * 0.5));
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        if (ignoreTileType >= 0 && st.type[st.idx(x, y)] === ignoreTileType && st.flags[st.idx(x, y)]) continue;
        const dist = Math.abs(x - px) + Math.abs(y - py);
        if (dist >= strength * 0.5 * (1 + rng.range(-0.15, 0.15))) continue;
        const ti = st.idx(x, y);
        // 丛林泥墙(原版 mudWall 分支:浅层墙 15,深层墙 64,均避让邻墙)
        if (o.mudWall && y > gs.worldSurface && st.wall[st.idx(x, y - 1)] !== 2
          && y < st.h - 210 - rng.int(0, 2)
          && dist < strength * 0.45 * (1 + rng.range(-0.1, 0.1))) {
          if (y > gs.lavaLine - rng.int(0, 3) - 50) {
            if (st.wall[st.idx(x, y - 1)] !== 64 && st.wall[st.idx(x, y + 1)] !== 64
              && st.wall[st.idx(x - 1, y)] !== 64) st.wall[ti] = 15;
          } else if (st.wall[st.idx(x, y - 1)] !== 15 && st.wall[st.idx(x, y + 1)] !== 15
            && st.wall[st.idx(x - 1, y)] !== 15) {
            st.wall[ti] = 64;
          }
        }
        if (type < 0) {
          // 挖空:沙不挖(原版 53 保护);-2 在活性块上填液体
          if (st.type[ti] === T.SAND) continue;
          if (type === -2 && st.flags[ti] && (y < gs.waterLine || y > gs.lavaLine)) {
            st.liquid[ti] = 255;
            st.liquidType[ti] = y > gs.lavaLine ? 2 : 1;
          }
          st.type[ti] = 0;
          st.flags[ti] = 0;
        } else {
          // 铺设:原版 flag3 规则(WorldGen.cs:46528-46555)
          if (overRide || !st.flags[ti]) {
            const cur = st.type[ti];
            let flag3 = STONE_FAMILY.has(type) && cur !== T.STONE;
            // CanBeClearedDuringGeneration ≈ 关键物块(祭坛/球/宝箱等 framed 物)不可被覆盖
            const curDef = TILE_DEFS[cur];
            if (curDef?.vanilla?.fw || curDef?.vanilla?.fh) flag3 = true;
            if (cur === T.STONE) {
              // 泥不替换近地表的石头(±50 抖动)
              if (type === MUD && y < gs.worldSurface + rng.int(-50, 49)) flag3 = true;
            } else if (cur === CLAY || cur === SNOW || cur === CLOUD || cur === GLOW_MUSH
              || cur === RAIN_CLOUD) {
              flag3 = true;
            } else if (cur === T.SAND) {
              if (type === MUD && inUndergroundDesert(gs, x, y)) flag3 = true;
              if (y < gs.worldSurface && type !== MUD) flag3 = true;
            } else if (cur === MARBLE || cur === GRANITE) {
              if (type === MUD) flag3 = true;
            } else if (cur === SANDSTONE || cur === HARDSAND) {
              if (!ORE_SET.has(type)) flag3 = true;
            }
            if (!flag3) st.type[ti] = type;
          }
          if (addTile) {
            st.flags[ti] = 1;
            st.liquid[ti] = 0;
            st.liquidType[ti] = 0;
          }
          if (noYChange && y < gs.worldSurface && type !== MUD) st.wall[ti] = 2;
          if (type === MUD && y > gs.waterLine && st.liquid[ti] > 0) {
            st.liquid[ti] = 0;
            st.liquidType[ti] = 0;
          }
        }
      }
    }
    // 移动 + 大半径加速(原版 9 档阶梯,速度抖动 ±0.05)
    px += vx; py += vy;
    for (const thr of [50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800]) {
      if (num1 > thr) {
        px += vx; py += vy;
        num2--;
        vy += rng.int(-10, 10) * 0.05;
        vx += rng.int(-10, 10) * 0.05;
      } else break;
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
    const x0 = Math.floor(x - radius), x1 = Math.floor(x + radius);
    const y0 = Math.floor(y - radius), y1 = Math.floor(y + radius);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        if (Math.abs(ix - x) + Math.abs(iy - y) < radius * (1 + rng.int(-10, 10) * 0.005)
          && st.inBounds(ix, iy)) {
          const i = st.idx(ix, iy);
          st.type[i] = 0; st.flags[i] = 0;
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
