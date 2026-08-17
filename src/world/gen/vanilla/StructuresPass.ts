// 阶段 4 结构 pass:
// - FloatingIslands(pass 19,L5552 + CloudIsland L47397 简化):云岛(云 189 壳 + 土芯 + 草皮)
// - LifeCrystals(pass 55,L7828):area×2e-5 个生命水晶(岩层空腔地上)
// - HellHouses 已由 HellFortPass.runHellFortPass 取代
// - SurfaceDecor:生物群系感知地表(丛林/雪原树密度、沙漠仙人掌、丛林藤蔓/蘑菇)
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { ITEM_BY_KEY } from '../../../data/items';
import { placeBuriedChest } from './BuriedChestsPass';
import { waterBoxPalmCheck, growPalmTree, seaOatWaterCheck, palmRangeFrame } from './TreePass';
import { idsByVanillaSheet } from './TileRunner';

/** 金字塔对拍探针开关（种子等价期临时；默认关闭零开销）。
 *  typeof 守卫同 DungeonPass SW_DGPA_TRACE——浏览器无 process,裸引用炸模块加载 */
const PYR_TRACE = typeof process !== 'undefined' && !!process.env.PYR_TRACE;
/** RNG 流位置指纹（对拍探针用；同 oracle StreamHash 算法） */
function pyrStream(rng?: { ur: { seedArray: Int32Array; inext: number } }): string {
  if (!PYR_TRACE) return '';
  const ur = (rng ?? (pyrRngCache as { ur: { seedArray: Int32Array; inext: number } })).ur;
  let h = 0x811c9dc5;
  const step = (b: number) => { h = Math.imul(h ^ (b & 0xff), 16777619) >>> 0; };
  for (let i = 0; i < ur.seedArray.length; i++) {
    const v = ur.seedArray[i] | 0;
    for (let b = 0; b < 4; b++) step(v >>> (8 * b));
  }
  const ix = ur.inext >>> 0;
  for (let b = 0; b < 4; b++) step(ix >>> (8 * b));
  return h.toString(16).padStart(8, '0');
}
let pyrRngCache: unknown = null;
import { solidTile as _solidTileHB } from './HalfBrickPass';
import { flipGenSolid } from './GenSolid';

const CLOUD = TILE_BY_KEY['v_189_cloud_block']!;
/** ★SquareWallFrame 掷骰还原（2026-08-16 #23 云层债根因，同 DesertPass 机制）：
 *  CloudIsland/CloudLake 的墙 73 填充循环（cs:78968）每格 `wall=73; SquareWallFrame(i,j)`
 *  ——Framing.WallFrame(resetFrame=true) 对「有墙且非大幅墙」格掷 1 次 genRand.Next(0,3)
 *  （Framing.cs:395-401；SquareWallFrame 九邻仅中心传 resetFrame，WorldGen.cs:80943）。
 *  岛#1 实测 2041 格 wall73 新写=2041 掷——曾整段省略 → pass 内流错位：⑥水池/⑦云 puff
 *  判定全错 + 后续岛的 x 掷漂移（4 座岛仅 1 座对位，全图 7109 掷缺失）。 */
const WALL_LARGE_FRAMES = new Set<number>([
  146, 147, 167, 179, 354,
  185, 224, 274, 323, 324, 325, 326, 327, 328, 329, 330, 355, 358, 359, 362, 363, 366,
]);
function wallFrameDraw(st: TileStore, rng: RNG, x: number, y: number): void {
  if (x <= 0 || y <= 0 || x >= st.w - 1 || y >= st.h - 1) return;
  const w = st.wall[st.idx(x, y)];
  if (w === 0 || WALL_LARGE_FRAMES.has(w)) return;
  rng.int(0, 2);                       // genRand.Next(0, 3)（wall 21 才有第二掷,73 无）
}
/** 雨云 196：CloudIsland/CloudLake 的雨云凸包（1/4）与岛上方 puff（1/2）专用；
 *  岛盘主体是云 189（cs:78724 num8）——196 误作主体会令土芯 type==189 判定恒假。
 *  云下雨幕由 WaterfallRenderer 画（WaterfallManager :204 type 11） */
const RAIN_CLOUD = TILE_BY_KEY['v_196_rain_cloud_block']!;
const EBONSAND = TILE_BY_KEY['v_112_ebonsand_block']!;
const CRIMSAND = TILE_BY_KEY['v_234_crimsand_block']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const CACTUS = TILE_BY_KEY['v_80_cactus']!;
const VINE = TILE_BY_KEY['v_52_vines']!;
const HEART = TILE_BY_KEY['crystal_heart']!;


// ================= Pass 23 FloatingIslands（cs:12976-13171 + CloudIsland cs:78618 + CloudLake cs:79068）1:1 =================
// 注册序 num=(int)(w*0.0008) 座岛 + skyLakes(4200 宽=1) 座天湖；
// 采样：x=Next(0.1w,0.9w) 避中央 ±150 → 与已放岛距 ≥180 → 该列自 y=200 起找首个活性格
// → y=Next(90, surf-100) 再 min(y, GenVars.worldSurfaceLow-50)；预算 w 次逐岛。
// 距离用 sqrt(dx²+dy²)（原版 Math.Sqrt——Math.hypot 有 ulp 级差异，禁用）
export function runFloatingIslandsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const isCount = Math.trunc(w * 0.0008);          // 3（4200 宽）
  // GenVars.skyLakes = Reset 段定值（WorldGen.cs:11197-11205）：1 + (w>8000) + (w>6000)
  // → 小 4200=1 / 中 6400=2 / 大 8400=3。曾硬编码 1 → 大尺寸少 2 座天湖（中尺寸少 1），
  // P|23 流哈希即失配（大 l2222 JS n=74908 ≠ 原版），天湖几何缺失级联下游全图。
  const skyLakes = 1 + (w > 8000 ? 1 : 0) + (w > 6000 ? 1 : 0);
  const total = isCount + skyLakes;
  const housesX: number[] = [];
  const housesY: number[] = [];
  let lakes = 0;
  for (let n = 0; n < total; n++) {
    let budget = w;
    while (--budget > 0) {
      let ok = true;
      let x = rng.int(Math.floor(w * 0.1), Math.floor(w * 0.9) - 1);   // Next(0.1w, 0.9w)
      while (x > w / 2 - 150 && x < w / 2 + 150) x = rng.int(Math.floor(w * 0.1), Math.floor(w * 0.9) - 1);
      for (let j = 0; j < housesX.length; j++) {
        if (x > housesX[j]! - 180 && x < housesX[j]! + 180) { ok = false; break; }
      }
      if (!ok) continue;
      ok = false;
      let surf = 0;
      for (let y = 200; y < gs.worldSurface && y < h; y++) {
        if (st.flags[st.idx(x, y)]) { surf = y; ok = true; break; }
      }
      if (!ok) continue;
      budget = -1;
      // GenVars.worldSurfaceLow（raw 截断）＝ gs.worldSurfaceLow（正数 floor≡trunc）
      const y = Math.min(rng.int(90, surf - 101), gs.worldSurfaceLow - 50);
      // GenVars.worldSurfaceLow（raw double 截断）——注意非 gs.worldSurfaceLow
      const isLake = lakes >= isCount;
          if (isLake) cloudLake(st, rng, x, y);
      else cloudIsland(st, rng, x, y);
          housesX.push(x); housesY.push(y);
      gs.floatingIslands.push({ x, y, style: 0, isLake });
      if (!isLake) lakes++;
    }
  }
}

/** WillWaterPlacedHereStayPut（cs:79050）：下/左/右三邻 = (活性实心非平台) 或 满水 */
function waterStaysPut(st: TileStore, x: number, y: number): boolean {
  const side = (ax: number, ay: number): boolean => {
    if (!st.inBounds(ax, ay)) return false;
    const k = st.idx(ax, ay);
    return (st.flags[k] !== 0 && !!TILE_DEFS[st.type[k]]?.solid && !TILE_DEFS[st.type[k]]?.platform)
      || st.liquid[k] === 255;
  };
  return side(x, y + 1) && side(x - 1, y) && side(x + 1, y);
}

/** CloudIsland（cs:78618-79066）1:1：①云盘(189) → ②底缘雨云凸包 → ③土芯(云→土) →
 *  ④土面云斑 → ⑤墙 73 → ⑥岛面水池 → ⑦岛上方云 puff + 中心注水 */
function cloudIsland(st: TileStore, rng: RNG, ci: number, cj: number): void {
  const tile = CLOUD;                                // num8 = 189（雨云只在凸包/puff 出现）
  let num = rng.int(100, 149);                       // Next(100,150)
  let num2 = num;
  let num3 = rng.int(20, 29);                        // Next(20,30)
  let b4 = ci, b5 = ci, b6 = cj, b7 = cj;            // bbox
  let px = ci + 0.0, py = cj + 0.0;
  let vx = rng.int(-20, 20) * 0.2;
  while (vx > -2 && vx < 2) vx = rng.int(-20, 20) * 0.2;
  let vy = rng.int(-20, -11) * 0.02;
  while (num > 0 && num3 > 0) {                      // ① 主体云盘
    num -= rng.int(0, 3);
    num3 -= 1;
    const x0 = Math.max(0, Math.trunc(px - num * 0.5)), x1 = Math.min(st.w, Math.trunc(px + num * 0.5));
    const y0 = Math.max(0, Math.trunc(py - num * 0.5)), y1 = Math.min(st.h, Math.trunc(py + num * 0.5));
    num2 = num * rng.int(80, 119) * 0.01;
    let top = py + 1;
    for (let x = x0; x < x1; x++) {
      if (rng.int(0, 1) === 0) top += rng.int(-1, 1);   // Next(2)==0 → Next(-1,2)
      if (top < py) top = py;
      if (top > py + 2) top = py + 2;
      for (let y = y0; y < y1; y++) {
        if (y <= top) continue;
        const ddx = Math.abs(x - px), ddy = Math.abs(y - py) * 3;
        if (Math.sqrt(ddx * ddx + ddy * ddy) >= num2 * 0.4) continue;
        if (x < b4) b4 = x;
        if (x > b5) b5 = x;
        if (y < b6) b6 = y;
        if (y > b7) b7 = y;
        const ti = st.idx(x, y);
        st.flags[ti] = 1; st.type[ti] = tile;
      }
    }
    px += vx; py += vy;
    vx += rng.int(-20, 20) * 0.05;
    if (vx > 1) vx = 1;
    if (vx < -1) vx = -1;
    if (vy > 0.2) vy = -0.2;
    if (vy < -0.2) vy = -0.2;
  }
  let r17 = b4 + rng.int(0, 4);                      // ② 底缘雨云凸包：num4+Next(5)
  let r19 = 0;
  // 步进 Next(r,(int)(r*1.5))——闭区间-1
  for (; r17 < b5; r17 += rng.int(r19, Math.floor(r19 * 1.5) - 1)) {
    let r18 = b7;
    while (r17 >= 15 && r17 < st.w - 15 && r18 >= 15 && r18 < st.h - 15 && st.flags[st.idx(r17, r18)] === 0) r18--;
    r18 += rng.int(-3, 3);                           // Next(-3,4)
    r19 = rng.int(4, 7);                             // Next(4,8)
    let mat = tile;
    if (rng.int(0, 3) === 0) mat = RAIN_CLOUD;       // Next(4)==0 → 196
    for (let x = r17 - r19; x <= r17 + r19; x++) {
      for (let y = r18 - r19; y <= r18 + r19; y++) {
        if (y <= b6 || !st.inBounds(x, y)) continue;
        const ddx = Math.abs(x - r17), ddy = Math.abs(y - r18) * 2;
        if (Math.sqrt(ddx * ddx + ddy * ddy) < r19 + rng.int(0, 1)) {   // num19 + Next(2)
          const ti = st.idx(x, y);
          st.flags[ti] = 1; st.type[ti] = mat;
        }
      }
    }
  }
  num = rng.int(80, 94);                             // ③ 土芯：Next(80,95)
  num2 = num;
  num3 = rng.int(10, 14);                            // Next(10,15)
  px = ci + 0.0; py = b6 + 0.0;
  vx = rng.int(-20, 20) * 0.2;
  while (vx > -2 && vx < 2) vx = rng.int(-20, 20) * 0.2;
  vy = rng.int(-20, -11) * 0.02;
  while (num > 0 && num3 > 0) {
    num -= rng.int(0, 3);
    num3 -= 1;
    const x0 = Math.max(0, Math.trunc(px - num * 0.5)), x1 = Math.min(st.w, Math.trunc(px + num * 0.5));
    const y0 = Math.max(0, b6 - 1), y1 = Math.min(st.h, Math.trunc(py + num * 0.5));
    num2 = num * rng.int(80, 119) * 0.01;
    let top = py + 1;
    for (let x = x0; x < x1; x++) {
      if (rng.int(0, 1) === 0) top += rng.int(-1, 1);
      if (top < py) top = py;
      if (top > py + 2) top = py + 2;
      for (let y = y0; y < y1; y++) {
        if (y <= top) continue;
        const ti = st.idx(x, y);
        const ddx = Math.abs(x - px), ddy = Math.abs(y - py) * 3;
        if (Math.sqrt(ddx * ddx + ddy * ddy) < num2 * 0.4 && st.type[ti] === tile) st.type[ti] = T.DIRT;
      }
    }
    px += vx; py += vy;
    vx += rng.int(-20, 20) * 0.05;
    if (vx > 1) vx = 1;
    if (vx < -1) vx = -1;
    if (vy > 0.2) vy = -0.2;
    if (vy < -0.2) vy = -0.2;
  }
  {                                                  // ④ 土面云斑：找活性土格向上盖云
    let cx = b4 + rng.int(0, 4);
    while (cx < b5) {
      let cy = b7;
      while ((cy < 0 || cy >= st.h || cx < 0 || cx >= st.w || !st.flags[st.idx(cx, cy)] || st.type[st.idx(cx, cy)] !== T.DIRT) && cx < b5) {
        cy--;
        if (cy < b6) { cy = b7; cx += rng.int(1, 3); }   // Next(1,4)
      }
      if (cx >= b5) continue;
      cy += rng.int(0, 3);                           // Next(0,4)
      const cr = rng.int(2, 4);                      // Next(2,5)
      for (let x = cx - cr; x <= cx + cr; x++) {
        for (let y = cy - cr; y <= cy + cr; y++) {
          if (y <= b6 || !st.inBounds(x, y)) continue;
          const ddx = Math.abs(x - cx), ddy = Math.abs(y - cy) * 2;
          if (Math.sqrt(ddx * ddx + ddy * ddy) < cr) st.type[st.idx(x, y)] = tile;   // 原版只写 type
        }
      }
      cx += rng.int(cr, Math.floor(cr * 1.5) - 1);
    }
  }
  for (let x = b4 - 20; x <= b5 + 20; x++) {         // ⑤ 全实心区填墙 73
    for (let y = b6 - 20; y <= b7 + 20; y++) {
      if (!st.inBounds(x, y)) continue;
      let all = true;
      for (let ox = x - 1; ox <= x + 1; ox++) {
        for (let oy = y - 1; oy <= y + 1; oy++) {
          if (!st.inBounds(ox, oy)) { all = false; continue; }
          const k = st.idx(ox, oy);
          if (st.flags[k] === 0 || (st.wall[k] > 0 && st.wall[k] !== 73)) all = false;
        }
      }
      if (all) {
        st.wall[st.idx(x, y)] = 73;
        wallFrameDraw(st, rng, x, y);   // cs:78968 SquareWallFrame——wall73 格必掷 Next(0,3)
      }
    }
  }
  for (let x = b4; x <= b5; x++) {                   // ⑥ 岛面水池
    let y = b6 - 10;
    while (y + 1 < st.h && st.flags[st.idx(x, y + 1)] === 0) y++;
    if (y >= b7) continue;
    if (!st.inBounds(x, y + 1) || st.type[st.idx(x, y + 1)] !== tile) continue;
    if (rng.int(0, 9) === 0) {                       // Next(10)==0 → 凹坑
      const wid = rng.int(1, 2);                     // Next(1,3)
      for (let xx = x - wid; xx <= x + wid; xx++) {
        if (!st.inBounds(xx, y)) continue;
        if (st.type[st.idx(xx, y)] === tile && waterStaysPut(st, xx, y)) {
          const k = st.idx(xx, y);
          st.flags[k] = 0; st.liquid[k] = 255; st.liquidType[k] = 1;
        }
        if (y + 1 < st.h && st.inBounds(xx, y + 1) && st.type[st.idx(xx, y + 1)] === tile && waterStaysPut(st, xx, y + 1)) {
          const k = st.idx(xx, y + 1);
          st.flags[k] = 0; st.liquid[k] = 255; st.liquidType[k] = 1;
        }
        if (xx > x - wid && xx < x + 2 && y + 2 < st.h && st.inBounds(xx, y + 2)
          && st.type[st.idx(xx, y + 2)] === tile && waterStaysPut(st, xx, y + 2)) {
          const k = st.idx(xx, y + 2);
          st.flags[k] = 0; st.liquid[k] = 255; st.liquidType[k] = 1;
        }
      }
    }
    if (st.inBounds(x, y)) {
      if (rng.int(0, 4) === 0 && waterStaysPut(st, x, y)) st.liquid[st.idx(x, y)] = 255;   // Next(5)
      st.liquidType[st.idx(x, y)] = 1;
    }
  }
  const puffs = rng.int(0, 3);                       // ⑦ 岛上方云 puff：Next(4)
  for (let n = 0; n <= puffs; n++) {
    const cx = rng.int(b4 - 5, b5 + 4);              // Next(num4-5, num5+5)
    const cy = b6 - rng.int(20, 39);                 // num6 - Next(20,40)
    const cr = rng.int(4, 7);                        // Next(4,8)
    let mat = tile;
    if (rng.int(0, 1) === 0) mat = RAIN_CLOUD;       // Next(2)==0 → 196
    for (let x = cx - cr; x <= cx + cr; x++) {
      for (let y = cy - cr; y <= cy + cr; y++) {
        if (!st.inBounds(x, y)) continue;
        const ddx = Math.abs(x - cx), ddy = Math.abs(y - cy) * 2;
        if (Math.sqrt(ddx * ddx + ddy * ddy) < cr + rng.int(-1, 1)) {   // num49 + Next(-1,2)
          const k = st.idx(x, y);
          st.flags[k] = 1; st.type[k] = mat;
        }
      }
    }
    for (let x = cx - cr + 2; x <= cx + cr - 2; x++) {   // 中心注水
      let y = cy - cr;
      while (y < st.h && st.flags[st.idx(x, y)] === 0) y++;
      if (st.inBounds(x, y) && waterStaysPut(st, x, y)) {
        const k = st.idx(x, y);
        st.flags[k] = 0; st.liquid[k] = 255; st.liquidType[k] = 1;
      }
    }
  }
}

/** CloudLake（cs:79068-79419）1:1：①云盘 → ②底缘雨云凸包（无 InWorld 门）→
 *  ③湖盆挖除+灌水（阈值 top-2、Y 下限 0）→ ④墙 73 → ⑤湖面水 */
function cloudLake(st: TileStore, rng: RNG, ci: number, cj: number): void {
  const tile = CLOUD;
  let num = rng.int(100, 149);
  let num2 = num;
  let num3 = rng.int(20, 29);
  let b4 = ci, b5 = ci, b6 = cj, b7 = cj;
  let px = ci + 0.0, py = cj + 0.0;
  let vx = rng.int(-20, 20) * 0.2;
  while (vx > -2 && vx < 2) vx = rng.int(-20, 20) * 0.2;
  let vy = rng.int(-20, -11) * 0.02;
  while (num > 0 && num3 > 0) {                      // ① 云盘（同 CloudIsland）
    num -= rng.int(0, 3);
    num3 -= 1;
    const x0 = Math.max(0, Math.trunc(px - num * 0.5)), x1 = Math.min(st.w, Math.trunc(px + num * 0.5));
    const y0 = Math.max(0, Math.trunc(py - num * 0.5)), y1 = Math.min(st.h, Math.trunc(py + num * 0.5));
    num2 = num * rng.int(80, 119) * 0.01;
    let top = py + 1;
    for (let x = x0; x < x1; x++) {
      if (rng.int(0, 1) === 0) top += rng.int(-1, 1);
      if (top < py) top = py;
      if (top > py + 2) top = py + 2;
      for (let y = y0; y < y1; y++) {
        if (y <= top) continue;
        const ddx = Math.abs(x - px), ddy = Math.abs(y - py) * 3;
        if (Math.sqrt(ddx * ddx + ddy * ddy) >= num2 * 0.4) continue;
        if (x < b4) b4 = x;
        if (x > b5) b5 = x;
        if (y < b6) b6 = y;
        if (y > b7) b7 = y;
        const ti = st.idx(x, y);
        st.flags[ti] = 1; st.type[ti] = tile;
      }
    }
    px += vx; py += vy;
    vx += rng.int(-20, 20) * 0.05;
    if (vx > 1) vx = 1;
    if (vx < -1) vx = -1;
    if (vy > 0.2) vy = -0.2;
    if (vy < -0.2) vy = -0.2;
  }
  let r17 = b4 + rng.int(0, 4);                      // ② 雨云凸包（CloudLake 无 InWorld 门）
  let r19 = 0;
  // 步进 Next(r,(int)(r*1.5))——闭区间-1
  for (; r17 < b5; r17 += rng.int(r19, Math.floor(r19 * 1.5) - 1)) {
    let r18 = b7;
    while (r18 >= 0 && st.flags[st.idx(r17, r18)] === 0) r18--;
    r18 += rng.int(-3, 3);
    r19 = rng.int(4, 7);
    let mat = tile;
    if (rng.int(0, 3) === 0) mat = RAIN_CLOUD;
    for (let x = r17 - r19; x <= r17 + r19; x++) {
      for (let y = r18 - r19; y <= r18 + r19; y++) {
        if (y <= b6) continue;
        const ddx = Math.abs(x - r17), ddy = Math.abs(y - r18) * 2;
        if (Math.sqrt(ddx * ddx + ddy * ddy) < r19 + rng.int(0, 1)) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.flags[ti] = 1; st.type[ti] = mat;
        }
      }
    }
  }
  num = rng.int(80, 94);                             // ③ 湖盆挖除 + 灌水
  num2 = num;
  num3 = rng.int(10, 14);
  px = ci + 0.0; py = b6 + 0.0;
  vx = rng.int(-20, 20) * 0.2;
  while (vx > -2 && vx < 2) vx = rng.int(-20, 20) * 0.2;
  vy = rng.int(-20, -11) * 0.02;
  while (num > 0 && num3 > 0) {
    num -= rng.int(0, 3);
    num3 -= 1;
    const x0 = Math.max(0, Math.trunc(px - num * 0.5)), x1 = Math.min(st.w, Math.trunc(px + num * 0.5));
    const y0 = Math.max(0, b6 - 1), y1 = Math.min(st.h, Math.trunc(py + num * 0.5));
    num2 = num * rng.int(80, 119) * 0.01;
    let top = py + 1;
    for (let x = x0; x < x1; x++) {
      if (rng.int(0, 1) === 0) top += rng.int(-1, 1);
      if (top < py) top = py;
      if (top > py + 2) top = py + 2;
      for (let y = y0; y < y1; y++) {
        if (y <= top - 2) continue;                  // CloudLake 阈值 top-2（岛芯是 top）
        const ti = st.idx(x, y);
        const ddx = Math.abs(x - px), ddy = Math.abs(y - py) * 3;
        if (!(Math.sqrt(ddx * ddx + ddy * ddy) < num2 * 0.4) || st.type[ti] !== tile) continue;
        st.flags[ti] = 0;
        st.wall[ti] = 0;                             // 本格 + 四邻 + 上两角清墙
        if (x - 1 >= 0) st.wall[st.idx(x - 1, y)] = 0;
        if (x + 1 < st.w) st.wall[st.idx(x + 1, y)] = 0;
        if (y - 1 >= 0) st.wall[st.idx(x, y - 1)] = 0;
        if (x - 1 >= 0 && y - 1 >= 0) st.wall[st.idx(x - 1, y - 1)] = 0;
        if (x + 1 < st.w && y - 1 >= 0) st.wall[st.idx(x + 1, y - 1)] = 0;
        if (y > top + 1) {
          if (waterStaysPut(st, x, y)) st.liquid[ti] = 255;
          st.liquidType[ti] = 1;
        }
      }
    }
    px += vx; py += vy;
    vx += rng.int(-20, 20) * 0.05;
    if (vx > 1) vx = 1;
    if (vx < -1) vx = -1;
    if (vy > 0.2) vy = -0.2;
    if (vy < 0) vy = 0;                              // CloudLake 湖盆段 Y 下限 0（岛芯是 -0.2）
  }
  for (let x = b4 - 20; x <= b5 + 20; x++) {         // ④ 墙 73
    for (let y = b6 - 20; y <= b7 + 20; y++) {
      if (!st.inBounds(x, y)) continue;
      let all = true;
      for (let ox = x - 1; ox <= x + 1; ox++) {
        for (let oy = y - 1; oy <= y + 1; oy++) {
          if (!st.inBounds(ox, oy)) { all = false; continue; }
          const k = st.idx(ox, oy);
          if (st.flags[k] === 0 || (st.wall[k] > 0 && st.wall[k] !== 73)) all = false;
        }
      }
      if (all) st.wall[st.idx(x, y)] = 73;
    }
  }
  for (let x = b4; x <= b5; x++) {                   // ⑤ 湖面水（同 CloudIsland ⑥）
    let y = b6 - 10;
    while (y + 1 < st.h && st.flags[st.idx(x, y + 1)] === 0) y++;
    if (y >= b7) continue;
    if (!st.inBounds(x, y + 1) || st.type[st.idx(x, y + 1)] !== tile) continue;
    if (rng.int(0, 9) === 0) {
      const wid = rng.int(1, 2);
      for (let xx = x - wid; xx <= x + wid; xx++) {
        if (!st.inBounds(xx, y)) continue;
        if (st.type[st.idx(xx, y)] === tile && waterStaysPut(st, xx, y)) {
          const k = st.idx(xx, y);
          st.flags[k] = 0; st.liquid[k] = 255; st.liquidType[k] = 1;
        }
        if (y + 1 < st.h && st.inBounds(xx, y + 1) && st.type[st.idx(xx, y + 1)] === tile && waterStaysPut(st, xx, y + 1)) {
          const k = st.idx(xx, y + 1);
          st.flags[k] = 0; st.liquid[k] = 255; st.liquidType[k] = 1;
        }
        if (xx > x - wid && xx < x + 2 && y + 2 < st.h && st.inBounds(xx, y + 2)
          && st.type[st.idx(xx, y + 2)] === tile && waterStaysPut(st, xx, y + 2)) {
          const k = st.idx(xx, y + 2);
          st.flags[k] = 0; st.liquid[k] = 255; st.liquidType[k] = 1;
        }
      }
    }
    if (st.inBounds(x, y)) {
      if (rng.int(0, 4) === 0 && waterStaysPut(st, x, y)) st.liquid[st.idx(x, y)] = 255;
      st.liquidType[st.idx(x, y)] = 1;
    }
  }
  // ⑥ 湖上方云 puff（cs:79442-79481）——★与 CloudIsland ⑦ 的差异：数量 Next(1,4)
  //  （非 Next(4)）、材质门反向（Next(4)!=0 → 雨云 196,==0 才云 189）。
  //  曾整段缺失 → 湖岛上方 ~76 格雨云 puff + 中心注水丢失（#23 残余）。
  const puffs = rng.int(1, 3);                       // Next(1,4)
  for (let n = 0; n <= puffs; n++) {
    const cx = rng.int(b4 - 5, b5 + 4);              // Next(num4-5, num5+5)
    const cy = b6 - rng.int(20, 39);                 // num6 - Next(20,40)
    const cr = rng.int(4, 7);                        // Next(4,8)
    let mat = tile;
    if (rng.int(0, 3) !== 0) mat = RAIN_CLOUD;       // Next(4)!=0 → 196（反向门）
    for (let x = cx - cr; x <= cx + cr; x++) {
      for (let y = cy - cr; y <= cy + cr; y++) {
        if (!st.inBounds(x, y)) continue;
        const ddx = Math.abs(x - cx), ddy = Math.abs(y - cy) * 2;
        if (Math.sqrt(ddx * ddx + ddy * ddy) < cr + rng.int(-1, 1)) {
          const k = st.idx(x, y);
          st.flags[k] = 1; st.type[k] = mat;
        }
      }
    }
    for (let x = cx - cr + 2; x <= cx + cr - 2; x++) {   // 中心注水
      let y = cy - cr;
      while (y < st.h && st.flags[st.idx(x, y)] === 0) y++;
      if (st.inBounds(x, y) && waterStaysPut(st, x, y)) {
        const k = st.idx(x, y);
        st.flags[k] = 0; st.liquid[k] = 255; st.liquidType[k] = 1;
      }
    }
  }
}

/** 生命水晶(pass 57,cs:16863-16904):area×2e-5 次;每次拒绝采样上限 10000
 *  (skyblock=10,本仓库非 skyblock)。★掷序 Y 先 X 后(cs:16886/16891)。 */
export function runLifeCrystalsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const yMin = Math.floor((gs.worldSurface * 2 + gs.rockLevel) / 3);
  const count = Math.floor(w * h * 0.00002);
  const maxTries = 10000;
  for (let n = 0; n < count; n++) {
    let done = false;
    for (let tries = 0; !done && tries < maxTries; tries++) {
      const y = rng.int(yMin, h - 301);               // cs:16886 Next(yMin, h-300)
      const x = rng.int(40, w - 41);                  // cs:16891 Next(40, w-40)
      done = addLifeCrystal(st, x, y);
    }
  }
  // ★pass 尾 tileSolid 翻转（cs:16944 `Main.tileSolid[225] = false`）：蜂巢块自此
  //   非实心——UndergroundHouses 头（cs:17078）短暂回实心、尾（cs:17222）再翻 false,
  //   Piles 尾（cs:19599）最终还原 true。蜂巢在此前已生成（Hives pass cs:16005）,
  //   下游小屋/宝箱锚定不应踩在蜂巢上（消费端走 GenSolid 可见）。
  flipGenSolid([225], false);
}

/** AddLifeCrystal(cs:32077-32144)1:1:自 j 向下扫列 i 首个实心活性格,
 *  锚行 num = k-1。anyLava/anyShimmer/EmptyTileCheck/wallDungeon 四门 →
 *  锚列 i-1..i 的 num+1 底座须 nactive(active 且非半砖)+tileSolid,
 *  底座坡面/半砖复位(cs:32114-32123);心占 (i-1..i, num-1..num)。 */
function addLifeCrystal(st: TileStore, i: number, j: number): boolean {
  const { h } = st;
  if (!st.inBounds(i, j)) return false;
  for (let k = j; k < h; k++) {
    const ki = st.idx(i, k);
    if (!st.flags[ki] || !TILE_DEFS[st.type[ki]]?.solid) continue;
    const num = k - 1;
    const at = (xx: number, yy: number) => st.idx(xx, yy);
    if (!st.inBounds(i, num - 1) || !st.inBounds(i - 1, num - 1)
      || !st.inBounds(i, num + 1) || !st.inBounds(i - 1, num + 1)) return false;
    // cs:32084-32088:心位/邻位有岩浆、心位有微光 → false
    if ((st.liquid[at(i, num - 1)] > 0 && st.liquidType[at(i, num - 1)] === 2)
      || (st.liquid[at(i - 1, num - 1)] > 0 && st.liquidType[at(i - 1, num - 1)] === 2)) return false;
    if (st.liquid[at(i, num - 1)] > 0 && st.liquidType[at(i, num - 1)] === 4) return false;
    // cs:32092 EmptyTileCheck(i-1, i, num-1, num):心位 2×2 无活性块
    for (let xx = i - 1; xx <= i; xx++) {
      for (let yy = num - 1; yy <= num; yy++) {
        if (st.flags[at(xx, yy)]) return false;
      }
    }
    // cs:32096:锚行墙为地牢墙 → false
    if (DUNGEON_WALLS.has(st.wall[at(i, num)])) return false;
    // cs:32104-32113:底座(i-1, num+1)/(i, num+1) 须 nactive(active 且非半砖)+tileSolid
    for (const bx of [i - 1, i]) {
      const bi = at(bx, num + 1);
      if (!st.flags[bi] || st.half[bi] || !TILE_DEFS[st.type[bi]]?.solid) return false;
      if (st.half[bi] !== 0 || st.slope[bi] !== 0) { st.half[bi] = 0; st.slope[bi] = 0; }  // 坡面复位
    }
    // cs:32124-32139:四格心,frameX 0/18、frameY 0/18
    st.setTileSilent(i - 1, num - 1, HEART, 0, 0);
    st.setTileSilent(i, num - 1, HEART, 18, 0);
    st.setTileSilent(i - 1, num, HEART, 0, 18);
    st.setTileSilent(i, num, HEART, 18, 18);
    return true;
  }
  return false;
}

/** 地表装饰:按生物群系种树/仙人掌/藤蔓/蘑菇(原版 pass 60+ 系列简化) */
export function runSurfaceDecorPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const isSoft = (t: number) => t === T.TALLGRASS || t === T.FLOWER || t === T.MUSHROOM || t === VINE;
  let x = rng.int(6, 14);
  let sinceLast = 0;
  while (x < w - 6) {
    let sy = -1;
    for (let y = 0; y < h; y++) {
      if (st.flags[st.idx(x, y)]) { sy = y; break; }
    }
    if (sy >= 0) {
      const ground = st.type[st.idx(x, sy)];
      const relaxed = sinceLast >= 24;
      // ---- 树已由 vanilla/TreePass.ts 替换（原版 AddTrees 逐列语义）----
      // ---- 仙人掌已由本文件 runCactusPalmTreesAndCoralPass 替换（原版 pass 96
      //      CactusPalmTreesAndCoral：GrowCactus 成簇语义；旧「12% 直柱 2-5 格」简化已删）----
      // ---- 杂草/花/蘑菇 ----(藤蔓在下方统一扫描)
      // 门禁对齐原版 GrassPlantsEvilPlantsAndPumpkinsOnSurface(WorldGen.cs:20209-20260):
      // 草 2→杂草 3 / 腐化草 23→24 / 猩红草 199→201——【雪 147 不长任何植物】
      // (雪原只有针叶树;SNOW 曾混入门内 = 用户报"杂草花长在冰雪环境"根因)
      if (!st.flags[st.idx(x, sy - 1)] && (ground === T.GRASS || ground === JUNGLE_GRASS)) {
        const r = rng.next();
        if (r < 0.3) st.setTileSilent(x, sy - 1, T.TALLGRASS, [0, 18, 36, 54, 72, 90][rng.int(0, 5)], 0);
        else if (r < 0.42) st.setTileSilent(x, sy - 1, T.FLOWER, [108, 126, 162, 180, 216, 252, 342, 540, 594][rng.int(0, 8)], 0);
        else if (r < 0.45) st.setTileSilent(x, sy - 1, T.MUSHROOM, 144, 0);
      }
    }
    x++;
    sinceLast++;
  }
  // ---- 藤蔓:挂在悬空草根/草皮下方(洞穴顶/崖底)----
  for (let vx = 2; vx < w - 2; vx++) {
    for (let vy = 2; vy < h - 2; vy++) {
      const i = st.idx(vx, vy);
      if (st.type[i] !== JUNGLE_GRASS && st.type[i] !== T.GRASS) continue;
      if (!st.flags[i] || st.flags[st.idx(vx, vy + 1)]) continue;
      if (st.liquid[st.idx(vx, vy + 1)] > 0) continue;
      if (rng.next() < 0.5) continue;
      const len = rng.int(1, 8);
      for (let k = 1; k <= len; k++) {
        const ii = st.idx(vx, vy + k);
        if (vy + k >= h - 1 || st.flags[ii] || st.type[ii] !== 0) break;
        st.setTileSilent(vx, vy + k, VINE, 0, 0);
      }
      vy += 10; // 稀疏
    }
  }
}

const SANDSTONE_BRICK = TILE_BY_KEY['v_151_sandstone_brick']!;
const POT = TILE_BY_KEY['pot']!;
const SMALL185 = TILE_BY_KEY['v_185_small_decos']!;
const SAND = TILE_BY_KEY['sand']!;
const DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);

/** Pyramids pass（1456 cs:15426-15534）1:1：候选全部来自 DunesPass（GenVars.PyrX/PyrY）。
 *  校验链：x∈(300,w-300) → 地牢侧带回避（cs:15450-15452）→ 自 PyrY 下扫首个活性格
 *  须 < worldSurface 且为沙 53 → 与**全部先序候选**（含已被拒者）距 ≥220 → k-- 后 Pyramid()。
 *  无候选时直接无金字塔（原版路径如此；旧自掷兜底已删——非原版且白耗 RNG）。 */
export function runPyramidPass(
  st: TileStore, rng: RNG, gs: GenState,
  chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>,
): void {
  const accepted: Array<{ x: number; y: number }> = [];
  for (let idx = 0; idx < gs.pyramidSpots.length; idx++) {
    const cand = gs.pyramidSpots[idx];
    const num = cand.x;
    if (num <= 300 || num >= st.w - 300) continue;
    // 地牢侧回避（cs:15450-15452）：dungeonSide>Left 时须 num ≥ dungeonX+0.15w；
    // dungeonSide<Right 时须 num ≤ dungeonX-0.15w（任一不过即拒）。
    // ★dungeonX 此处 = generatingDungeonPositionX 的**终值**＝爬升入口走廊终点（入口 X，
    //   LegacyEntranceDungeonHall.cs:367 每条爬升走廊回写 genVars 覆盖 :394 的最高房
    //   中心 X 瞬态；Dungeon pass #36 先于本 pass），非 Reset 期 dungeonLocation。
    //   2026-08-16 审计修正：曾把 :394 瞬态当终值回填 topX。
    const dgX = gs.generatingDungeonPositionX || gs.dungeonLocation;
    const band = st.w * 0.15;
    if (!(gs.dungeonSide > -1 || !(num < dgX + band))) continue;
    if (!(gs.dungeonSide < 1 || !(num > dgX - band))) continue;
    let k = cand.y;
    while (k < st.h && st.inBounds(num, k) && !st.flags[st.idx(num, k)]) k++;
    if (k >= gs.worldSurface) continue;
    if (st.type[st.idx(num, k)] !== SAND) continue;   // cs:15455 沙列门禁
    // 与全部先序候选（PyrX[0..idx-1]）取最小距，须 ≥220（cs:15460-15472）
    let minDist = st.w;
    for (let l = 0; l < idx; l++) minDist = Math.min(minDist, Math.abs(num - gs.pyramidSpots[l].x));
    if (minDist >= 220) {
      if (PYR_TRACE) console.log(`PYR cand#${idx} x=${num} k=${k} minDist=${minDist} ACCEPT`);
      k--;
      pyramid(st, rng, gs, chests, num, k, 75, 125, false);
      accepted.push({ x: num, y: k });
    } else if (PYR_TRACE) {
      console.log(`PYR cand#${idx} x=${num} k=${k} minDist=${minDist} REJECT-dist`);
    }
  }
}

/** WorldGen.Pyramid（1456 cs:27816-28160）1:1：沙岩砖 151 主体 + 墙 34 +
 *  入口阶梯掏空 → 之字形下行隧道（端点房间：金箱 1 号主件 848/857/934 三选一、
 *  小堆 185×N、四支火把 91、整排瓦罐 28 style25-27）→ 长出口隧道。
 *  RNG 消费顺序逐掷对齐（num2/num3/num5/num8/num11/num12/房间段/出口段）。 */
function pyramid(
  st: TileStore, rng: RNG, gs: GenState,
  chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>,
  i: number, j: number, pyramidMinDepth: number, pyramidMaxDepth: number, noTunnel: boolean,
): boolean {
  if (PYR_TRACE) pyrRngCache = rng;
  const num = SANDSTONE_BRICK;   // 151
  const wall = 34;               // SandstoneBrickUnsafe
  const gi = st.idx(i, j);
  if (st.flags[gi] && (st.type[gi] === num || st.wall[gi] === 151)) return false;
  const active = (x: number, y: number) => st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
  const deact = (x: number, y: number) => { if (st.inBounds(x, y)) st.flags[st.idx(x, y)] = 0; };
  const setBrick = (x: number, y: number) => {
    if (!st.inBounds(x, y)) return;
    const k = st.idx(x, y);
    st.type[k] = num; st.flags[k] = 1; st.half[k] = 0; st.slope[k] = 0;
  };
  const num2 = j - rng.int(0, 6);                       // j - Next(0,7)
  const num3 = rng.int(9, 12);                          // Next(9,13)
  let num4 = 1;
  const num5 = j + rng.int(pyramidMinDepth, pyramidMaxDepth - 1); // Next(75,125)
  if (PYR_TRACE) console.log(`PYR enter i=${i} j=${j} num2=${num2} num3=${num3} num5=${num5}`);
  // 主体：逐层加宽的实心沙岩砖塔（cs:27859-27868）
  for (let k = num2; k < num5; k++) {
    for (let l = i - num4; l < i + num4 - 1; l++) setBrick(l, k);
    num4++;
  }
  // 封闭区刷墙 34（cs:27870-27888：3×3 全砖）
  for (let m = i - num4 - 5; m <= i + num4 + 5; m++) {
    for (let n = j - 1; n <= num5 + 1; n++) {
      let all = true;
      for (let a = m - 1; a <= m + 1 && all; a++) {
        for (let b = n - 1; b <= n + 1; b++) {
          if (!st.inBounds(a, b) || !st.flags[st.idx(a, b)] || st.type[st.idx(a, b)] !== num) { all = false; break; }
        }
      }
      if (all && st.inBounds(m, n)) st.wall[st.idx(m, n)] = wall;
    }
  }
  let num8 = 1;
  if (rng.int(0, 1) === 0) num8 = -1;                   // Next(2)==0 → -1
  let num9 = i - num3 * num8;
  let num10 = j + num3;
  const num11 = rng.int(5, 7);                          // Next(5,8)
  let flag2 = true;
  let num12 = rng.int(20, 29);                          // Next(20,30)
  if (PYR_TRACE) console.log(`PYR tunnel num8=${num8} num9=${num9} num10=${num10} num11=${num11} num12=${num12}`);
  let pyrIt = 0;
  // 入口掏空（cs:27903-27924）：自沙面斜向下切阶梯
  while (flag2) {
    if (PYR_TRACE && pyrIt < 400) console.log(`PYR stair it${pyrIt} num9=${num9} num10=${num10}`);
    pyrIt++;
    flag2 = false;
    let flag3 = false;
    for (let n13 = num10; n13 <= num10 + num11; n13++) {
      const n14 = num9;
      if (active(n14, n13 - 1) && st.type[st.idx(n14, n13 - 1)] === SAND) flag3 = true;
      if (active(n14, n13) && st.type[st.idx(n14, n13)] === num) {
        if (st.inBounds(n14, n13 + 1)) st.wall[st.idx(n14, n13 + 1)] = wall;
        if (st.inBounds(n14 + num8, n13)) st.wall[st.idx(n14 + num8, n13)] = wall;
        deact(n14, n13);
        flag2 = true;
      }
      if (flag3 && st.inBounds(n14, n13)) {
        const k = st.idx(n14, n13);
        st.type[k] = SAND; st.flags[k] = 1; st.half[k] = 0; st.slope[k] = 0;
      }
    }
    num9 -= num8;
  }
  num9 = i - num3 * num8;
  let flag4 = true;
  let flag5 = false;
  flag2 = true;
  // 之字形下行隧道 + 端点房间（cs:27928-28046）
  pyrIt = 0;
  while (flag2) {
    if (PYR_TRACE && pyrIt < 500) console.log(`PYR zig it${pyrIt} num9=${num9} num10=${num10} num12=${num12} f4=${flag4} f5=${flag5}`);
    pyrIt++;
    for (let n15 = num10; n15 <= num10 + num11; n15++) deact(num9, n15);
    num9 += num8;
    num10++;
    num12--;
    if (num10 >= num5 - num11 * 2) num12 = 10;
    if (num12 <= 0) {
      let flag6 = false;
      if (!flag4 && !flag5) {
        if (noTunnel) flag2 = false;
        flag5 = true;
        flag6 = true;
        const num17 = rng.int(7, 12);                   // Next(7,13)
        const num18 = rng.int(23, 27);                  // Next(23,28)
        const num19 = num18;
        const num20 = num9;
        let cur = num18;
        while (cur > 0) {
          for (let n21 = num10 - num17 + num11; n21 <= num10 + num11; n21++) {
            if (cur === num19 || cur === 1) {
              if (n21 >= num10 - num17 + num11 + 2) deact(num9, n21);
            } else if (cur === num19 - 1 || cur === 2 || cur === num19 - 2 || cur === 3) {
              if (n21 >= num10 - num17 + num11 + 1) deact(num9, n21);
            } else deact(num9, n21);
          }
          cur--;
          num9 += num8;
        }
        const num22 = num9 - num8;
        const num23 = Math.min(num22, num20);
        const num24 = Math.max(num22, num20);
        // 主件三选一（cs:28000-28016：0→848 法老面具 / 1→857 沙暴瓶 / 2→934 飞毯）
        let num25 = rng.int(0, 2);
        if (num25 === 0) num25 = rng.int(0, 2);
        const lootKeys = ['vi_848_PharaohsMask', 'vi_857_sandstorm_in_a_bottle', 'vi_934_FlyingCarpet'];
        const lootKey = lootKeys[num25];
        if (PYR_TRACE) console.log(`PYR room num17=${num17} n23=${num23} n24=${num24} chestX=${Math.floor((num23 + num24) / 2)} num10=${num10} main=${lootKey} st=${pyrStream()}`);
        placeBuriedChest(st, rng, gs, chests, Math.floor((num23 + num24) / 2), num10, {
          style: 1, loot: lootKey,
        });
        const num26 = rng.int(1, 9);                    // Next(1,10)
        if (PYR_TRACE) console.log(`PYR rm1 num26=${num26} st=${pyrStream()}`);
        for (let n27 = 0; n27 < num26; n27++) {
          const i2 = rng.int(num23, num24 - 1);         // cs:28025 Next(num23, num24) 上界不含
          const j2 = num10 + num11;
          placeSmallPile(st, i2, j2, rng.int(16, 18), 1);   // Next(16,19)
        }
        if (PYR_TRACE) console.log(`PYR rm2 piles-done st=${pyrStream()}`);
        placeTorch(st, num23 + 2, num10 - num17 + num11 + 1, rng.int(4, 6));   // Next(4,7)
        placeTorch(st, num23 + 3, num10 - num17 + num11, rng.int(4, 6));
        placeTorch(st, num24 - 2, num10 - num17 + num11 + 1, rng.int(4, 6));
        placeTorch(st, num24 - 3, num10 - num17 + num11, rng.int(4, 6));
        if (PYR_TRACE) console.log(`PYR rm3 torches-done st=${pyrStream()}`);
        for (let n28 = num23; n28 <= num24; n28++) {
          placePotRow(st, rng, n28, num10 + num11, rng.int(25, 27));   // Next(25,28)
        }
        if (PYR_TRACE) console.log(`PYR rm4 pots-done st=${pyrStream()}`);
      }
      if (flag4) {
        flag4 = false;
        num8 *= -1;
        num12 = rng.int(15, 19);                        // Next(15,20)
      } else if (flag6) {
        num12 = rng.int(10, 14);                        // Next(10,15)
      } else {
        num8 *= -1;
        num12 = rng.int(20, 39);                        // Next(20,40)
      }
    }
    if (num10 >= num5 - num11) flag2 = false;
  }
  if (noTunnel) return true;
  // 长出口隧道（cs:28052-28157）
  let num29 = rng.int(100, 199);                        // Next(100,200)
  let num30 = rng.int(500, 799);                        // Next(500,800)
  flag2 = true;
  const num31 = num11;
  num12 = rng.int(10, 49);                              // Next(10,50)
  if (num8 === 1) num9 -= num31;
  const num32 = rng.int(5, 9);                          // Next(5,10)
  while (flag2) {
    num29--;
    num30--;
    num12--;
    // ★cs:28078:for 条件里的 Next(0,2) 每列求值一次(C# 条件逐迭代重算)——
    //   上界须逐列重掷(曾每外层只掷一次);下界 init 仍只掷一次
    const lo = num9 - num32 - rng.int(0, 1);            // init:1×Next(0,2)
    for (let n33 = lo; n33 <= num9 + num31 + num32 + rng.int(0, 1); n33++) {
      const n34 = num10;
      if (n33 >= num9 && n33 <= num9 + num31) {
        deact(n33, n34);
      } else if (st.inBounds(n33, n34) && !DUNGEON_WALLS.has(st.wall[st.idx(n33, n34)])) {
        setBrick(n33, n34);
      }
      if (n33 >= num9 - 1 && n33 <= num9 + 1 + num31 && st.inBounds(n33, n34)
        && !DUNGEON_WALLS.has(st.wall[st.idx(n33, n34)])) {
        st.wall[st.idx(n33, n34)] = wall;
      }
    }
    num10++;
    num9 += num8;
    if (num29 <= 0) {
      flag2 = false;
      for (let n35 = num9 + 1; n35 <= num9 + num31 - 1; n35++) {
        if (active(n35, num10)) flag2 = true;
      }
    }
    if (num12 < 0) {
      num12 = rng.int(10, 49);
      num8 *= -1;
    }
    if (num30 <= 0) flag2 = false;
  }
  return true;
}

/** PlaceTile(x, y, 91, style)（金字塔房装饰）：PlaceTile case91 → PlaceBanner
 *  （cs:46270）——占 (x, y..y+2) 3 格高，顶锚 (x, y-1) 须活性实心非 solidTop，
 *  下方三格须全空；frameX = style*18（每 111 style 换行 -1998/+54Y，金字塔
 *  style∈[4,6] 不触达）。曾误当火把（tile4 1×1 无门禁直写）——金字塔房 dump
 *  对拍实锤：cs 4 旗×3 格 vs js 4 火把×1 格 */
const BANNER = TILE_BY_KEY['v_91_banners']!;
function placeTorch(st: TileStore, x: number, y: number, style: number): void {
  if (!st.inBounds(x, y - 1) || !st.inBounds(x, y + 2)) return;
  const ai = st.idx(x, y - 1);
  const anchor = TILE_DEFS[st.type[ai]];
  if (!st.flags[ai] || !anchor?.solid || anchor.platform) return;   // nactive+solid+!solidTop
  for (let dy = 0; dy <= 2; dy++) {
    if (st.flags[st.idx(x, y + dy)]) return;                        // 三格全空门
  }
  let fx = style * 18, fy = 0;
  let s = style;
  while (s >= 111) { s -= 111; fx -= 1998; fy += 54; }              // cs:46273-46278
  for (let dy = 0; dy <= 2; dy++) st.setTileSilent(x, y + dy, BANNER, fx, fy + dy * 18);
}

/** PlaceSmallPile（size1=2×1）：fx=pileStyle*36(+18)，fy=18；下方双列实心 + 双格净空 */
function placeSmallPile(st: TileStore, x: number, y: number, pileStyle: number, pileSize: number): void {
  if (pileSize !== 1) return;
  const solidAt = (xx: number, yy: number) => st.inBounds(xx, yy) && st.flags[st.idx(xx, yy)] !== 0
    && !!TILE_DEFS[st.type[st.idx(xx, yy)]]?.solid;
  if (!solidAt(x, y + 1) || !solidAt(x + 1, y + 1)) return;
  if (!st.inBounds(x, y) || st.flags[st.idx(x, y)]) return;
  if (!st.inBounds(x + 1, y) || st.flags[st.idx(x + 1, y)]) return;
  st.setTileSilent(x, y, SMALL185, pileStyle * 36, 18);
  st.setTileSilent(x + 1, y, SMALL185, pileStyle * 36 + 18, 18);
}

/** PlacePot（1456 cs:54082）：style 由调用方掷；变体 Next(3) 仅在放置成功时消费 */
function placePotRow(st: TileStore, rng: RNG, x: number, y: number, style: number): void {
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = -1; dy <= 0; dy++) {
      if (!st.inBounds(x + dx, y + dy) || st.flags[st.idx(x + dx, y + dy)]) return;
    }
    if (!st.inBounds(x + dx, y + 1)) return;
    const k = st.idx(x + dx, y + 1);
    if (!st.flags[k] || st.half[k] || st.slope[k] !== 0) return;
    if (!TILE_DEFS[st.type[k]]?.solid) return;
  }
  const variant = rng.int(0, 2) * 36;
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = -1; dy <= 0; dy++) {
      st.setTileSilent(x + dx, y + dy, POT, dx * 18 + variant, (dy + 1) * 18 + style * 36);
      st.half[st.idx(x + dx, y + dy)] = 0;
    }
  }
}

/** SurfaceWaterInJungle（1456 cs:15887-15909）1:1：逐列自 worldSurfaceLow 扫到
 *  worldSurface-1，首个活性格若是丛林草 60 → 其上两格灌满水（liquidType 0=水）。
 *  原版整 pass 零 RNG——旧实现误作"挖湿隧道"（digTunnel 消耗大量 RNG 且语义完全不符）。 */
export function runWetJunglePass(st: TileStore, _rng: RNG, gs: GenState): void {
  const h = st.h;
  for (let i = 0; i < st.w; i++) {
    for (let j = Math.floor(gs.worldSurfaceLow); j < gs.worldSurface - 1; j++) {
      if (!st.inBounds(i, j)) break;
      const k = st.idx(i, j);
      if (!st.flags[k]) continue;
      if (st.type[k] === JUNGLE_GRASS) {
        // (i, j-1) 与 (i, j-2)：liquid=255、liquidType 0（原版编码 0=水 → 本仓库 1）
        if (st.inBounds(i, j - 1)) {
          const a = st.idx(i, j - 1);
          st.liquid[a] = 255; st.liquidType[a] = 1;
        }
        if (st.inBounds(i, j - 2)) {
          const b = st.idx(i, j - 2);
          st.liquid[b] = 255; st.liquidType[b] = 1;
        }
      }
      break; // 首个活性格即止（原版 break）
    }
  }
  void h;
}



// ===================== 炼金草药（pass AlchemyHerbs cs:20109 + MatureTheHerbPlants cs:45757） =====================

const HERB_SPROUT = TILE_BY_KEY['v_82_herbs_sprout']!;
const MUD_TILE = TILE_BY_KEY['mud']!;
const HERB_MATURE = TILE_BY_KEY['v_83_herbs_mature']!;
const HERB_BLOOM = TILE_BY_KEY['v_84_herbs_bloom']!;
/** Main.tileAlch：82/83/84 三态草药（PlantAlch ±15 邻域密度门用） */
const TILE_ALCH = new Set<number>([HERB_SPROUT, HERB_MATURE, HERB_BLOOM]);
/** PlaceAlch 各 style 的基座白名单（cs:45395-45464；78 割草/380 花盆箱为通用补充） */
const ALCH_GROUND: Array<Set<number>> = [
  idsByVanillaSheet(2, 477, 492, 78, 380, 109),          // 0 草/神圣草
  idsByVanillaSheet(60, 78, 380),                        // 1 丛林草
  idsByVanillaSheet(0, 59, 78, 380),                     // 2 土/泥
  idsByVanillaSheet(661, 662, 203, 199, 23, 25, 78, 380),// 3 邪恶
  idsByVanillaSheet(53, 78, 380, 116),                   // 4 沙/珍珠沙
  idsByVanillaSheet(57, 633, 78, 380),                   // 5 灰烬/灰烬草
  idsByVanillaSheet(78, 380, 147, 161, 163, 164, 200),   // 6 冰雪族
];
/** PlaceSuitableHerbHere（cs:45948-45976）：基座类型 → style 分派（顺序覆盖式） */
const HERB_STYLE_GROUND: Array<[Set<number>, number]> = [
  [idsByVanillaSheet(2, 109), 0],
  [idsByVanillaSheet(60), 1],
  [idsByVanillaSheet(0, 59), 2],
  [idsByVanillaSheet(23, 661, 25, 203, 199, 662), 3],
  [idsByVanillaSheet(53, 116), 4],
  [idsByVanillaSheet(57, 633), 5],
  [idsByVanillaSheet(147, 163, 164, 161, 200), 6],
];

/** PlaceAlch（cs:45386）1:1：目标格净空 + 基座 nactive/整砖 + style 白名单/液体门。
 *  style 4/6 只拒岩浆、style 5 只拒非岩浆（水中焰花/灰烬上） */
function placeAlch(st: TileStore, x: number, y: number, style: number): boolean {
  if (!st.inBounds(x, y) || !st.inBounds(x, y + 1)) return false;
  const k = st.idx(x, y);
  const g = st.idx(x, y + 1);
  if (st.flags[k]) return false;
  if (!st.flags[g] || st.half[g] || st.slope[g] !== 0) return false;
  if (!ALCH_GROUND[style].has(st.type[g])) return false;
  const liq = st.liquid[k];
  const lava = liq > 0 && st.liquidType[k] === 2;
  if (style <= 3) { if (liq > 0) return false; }
  else if (style === 4 || style === 6) { if (lava) return false; }
  else if (style === 5) { if (liq > 0 && !lava) return false; }
  st.setTileSilent(x, y, HERB_SPROUT, 18 * style, 0);
  return true;
}

/** PlantAlch（cs:45910）1:1：y 带三段掷（1/40 深层带、9/10 地表带、其余全域），
 *  下落至首个活性格；基座须 nactive 且上格净空无液；±15（×w/4200）内草药 <5 才种 */
function plantAlch(st: TileStore, rng: RNG, gs: GenState): void {
  const w = st.w, h = st.h;
  const num = rng.int(20, w - 21);                        // Next(20, maxTilesX-20)
  let y: number;
  if (rng.int(0, 39) === 0) y = rng.int(Math.floor((gs.rockLevel + h) / 2), h - 21);
  else if (rng.int(0, 9) !== 0) y = rng.int(Math.floor(gs.worldSurface), h - 21);
  else y = rng.int(20, h - 21);
  while (y < h - 20 && !(st.inBounds(num, y) && st.flags[st.idx(num, y)])) y++;
  if (!st.inBounds(num, y)) return;
  const k = st.idx(num, y);
  if (!st.flags[k] || st.half[k] || st.slope[k] !== 0) return;   // nactive
  if (!st.inBounds(num, y - 1)) return;
  if (st.flags[st.idx(num, y - 1)] || st.liquid[st.idx(num, y - 1)] !== 0) return;
  const rad = Math.floor(15 * (w / 4200));
  const x0 = Math.max(4, Math.min(w - 4, num - rad));
  const x1 = Math.max(4, Math.min(w - 4, num + rad));
  const y0 = Math.max(4, Math.min(h - 4, y - rad));
  const y1 = Math.max(4, Math.min(h - 4, y + rad));
  let near = 0;
  for (let i = x0; i <= x1; i++) {
    for (let j = y0; j <= y1; j++) {
      if (TILE_ALCH.has(st.type[st.idx(i, j)])) near++;
    }
  }
  if (near < 5) {
    for (const [set, style] of HERB_STYLE_GROUND) {
      if (set.has(st.type[k])) placeAlch(st, num, y - 1, style);
    }
  }
}

/** AlchemyHerbs pass（cs:20109）：w×1.7 次 PlantAlch */
export function runAlchemyHerbsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const count = Math.floor(st.w * 1.7);
  for (let i = 0; i < count; i++) plantAlch(st, rng, gs);
}

/** MatureTheHerbPlants（cs:45757，DyePlants pass 内调用）1:1：
 *  岩层以下泥土/泥面 1/25 补种 82(frameX=36)；既有 82 → 1/3 熟成 83，
 *  frameX=36 再 1/2、frameX=108 再 1/3 进阶 84 */
export function matureHerbPlants(st: TileStore, rng: RNG, gs: GenState): void {
  for (let i = 10; i < st.w - 10; i++) {
    for (let j = 10; j < st.h - 10; j++) {
      const k = st.idx(i, j);
      const below = st.idx(i, j + 1);
      if (j > gs.rockLevel && (st.type[below] === MUD_TILE || st.type[below] === T.DIRT)
        && _solidTileHB(st, i, j + 1) && !st.flags[k] && st.liquid[k] === 0
        && rng.int(0, 24) === 0) {
        st.setTileSilent(i, j, HERB_SPROUT, 36, 0);
      }
      if (st.type[k] === HERB_SPROUT && rng.int(0, 2) === 0) {
        st.type[k] = HERB_MATURE;
        if (st.frameX[k] === 36 && rng.int(0, 1) === 0) st.type[k] = HERB_BLOOM;
        if (st.frameX[k] === 108 && rng.int(0, 2) === 0) st.type[k] = HERB_BLOOM;
      }
    }
  }
}

// ================= Pass 96 CactusPalmTreesAndCoral（cs:21115-21325 + PlantCactus cs:54176 +
// GrowCactus cs:56584-56805）1:1 =================
// 原版同一 pass 三段列扫描（cs:21198-21202 switch）：
//   n=0 左海滩段 x∈[5,380)      maxValue=Next(3,13)  flag=false → 珊瑚/贝壳
//   n=1 中段     x∈[400,w-400)  maxValue=8           flag=true  → 水盒棕榈/仙人掌
//   n=2 右海滩段 x∈[w-380,w-5)  maxValue=Next(3,13)  flag=false → 珊瑚/贝壳
// 命中列（Next(maxValue)==0）自 y=0 扫到 worldSurface-1 找首个沙族面（53/112/234）
// 且上格空墙 0 → 分支处理。未命中列走海滨燕麦段（见下方备案）。
// 注册序：SettleLiquidsPart2AndNotTheBees(21051) < 本 pass(21115) < TileCleanup(21327)。
// 已知近似（备案，接线时评估掷骰流影响）：
//   - pass 头部绿洲消费段（cs:21129-21153：绿洲棕榈 323/海滨燕麦/绿洲植物 530）未实现；
//   - 未命中列的 PlantSeaOat/GrowSeaOat/PlaceOasisPlant 段（cs:21302-21320）未实现；
//   - SquareTileFrame 对仙人掌为 no-op：渲染端 cactusFrameAt（WorldGen.CactusFrame
//     1:1，render/VanillaTiler.ts）按邻接实时求帧，生成期无需写帧。
/** TileID.Sets.Conversion.Sand（TileID.cs:30）：53/112/116/234 */
const SAND_CONV = idsByVanillaSheet(53, 112, 116, 234);
/** 列扫描门沙族（cs:21210：仅 53/112/234——珍珠沙 116 不在生成期地表） */
const SAND_GATE = idsByVanillaSheet(53, 112, 234);
const CORAL = TILE_BY_KEY['v_81_coral']!;
const SEASHELLS = TILE_BY_KEY['v_324_seashells']!;
/** WorldGen.cs:4258-4262 readonly 常量：水盒宽/高/液量阈值 */
const CACTUS_WATER_WIDTH = 50;
const CACTUS_WATER_HEIGHT = 25;
const CACTUS_WATER_LIMIT = 25;

/** GrowCactus（cs:56584-56805）单步语义：
 *  锚点 (i,j) 须 nactive 的仙人掌或沙族、非半砖（生成期无 slope 门）、上格无液；
 *  50×25 水盒（[i-50,i+50)×[j-25,j+25)，InWorld 内求和）液量和/255 > 25 即停。
 *  沙锚（cs:56611-56642）：上方三格净空；13×5 邻域（[i-6,i+6]×[j-3,j+1]，InWorld 5
 *  余量）内仙人掌 ≥4 即停、沙计数 >10 才在上格冒仙人掌；1/2 清锚格 slope。
 *  仙人掌锚（cs:56643-56804）：扫基列顶（列尽向更长邻臂列平移）→ 高度门
 *  （[num-2,num+2]×[j-(11-num6),j+num6] 盒内仙人掌数 ≥ Next(11,13) 即停，drunkWorld
 *  分支不触发）→ num7==0 时横向分叉三选一（Next(3)：0 西臂 / 1 东臂 / 否则
 *  num6 < Next(2,8) 且上格净空继续上长）；num7!=0 时臂上补格。 */
/** CheckCactus（cs:54132-54174）：仙人掌支撑复查——自 (i,j) 向下扫基列（含臂列
 *  平移），落底格非整砖沙族 → KillTile(i,j)；臂列（i≠基列）无邻仙人掌 → KillTile；
 *  正列下格非仙人掌/沙族 → KillTile。KillTile(80) 尘段 10 尘 × 0 掷（MakeTileDust
 *  case 80/81→num32 无掷）——纯格效应；随后 SquareTileFrame 3×3 引发邻仙人掌
 *  级联复查（KillTile 尾 cs:63991）。BB 批 #98 -7,120 掷根因：旧移植静默放置漏了
 *  此链——vanilla 击杀的悬空/失托仙人掌残留（+39 格），地形演化差异改变列扫描
 *  的 PlantCactus 命中数 → 掷流漂移 */
function checkCactus(st: TileStore, i: number, j: number): boolean {
  let num = j, num2 = i;
  const cactusAt = (x: number, y: number): boolean =>
    st.inBounds(x, y) && st.flags[st.idx(x, y)] === 1 && st.type[st.idx(x, y)] === CACTUS;
  while (cactusAt(num2, num)) {
    num++;
    if (!cactusAt(num2, num)) {
      // 臂列平移（cs:54145-54152）：邻列同深+其上一格均为仙人掌 → 基列横移
      if (cactusAt(num2 - 1, num) && cactusAt(num2 - 1, num - 1) && num2 >= i) num2--;
      if (cactusAt(num2 + 1, num) && cactusAt(num2 + 1, num - 1) && num2 <= i) num2++;
    }
  }
  // 落底支撑：整砖（非半/坡）沙族（cs:54155）
  if (!st.inBounds(num2, num)) return false; // 生成域内不可达（底为基岩）
  const bi = st.idx(num2, num);
  if (!st.flags[bi] || st.half[bi] !== 0 || st.slope[bi] !== 0
    || !SAND_CONV.has(st.type[bi])) {
    killCactus(st, i, j);
    return true;
  }
  if (i !== num2) {
    // 臂列：下/左/右均无仙人掌 → 击杀（cs:54162）
    if (!cactusAt(i, j + 1) && !cactusAt(i - 1, j) && !cactusAt(i + 1, j)) {
      killCactus(st, i, j);
      return true;
    }
  } else {
    // 正列：下格非活性或非仙人掌/沙族 → 击杀（cs:54168）
    const below = st.inBounds(i, j + 1) ? st.idx(i, j + 1) : -1;
    const belowOk = below >= 0 && st.flags[below] === 1
      && (st.type[below] === CACTUS || SAND_CONV.has(st.type[below]));
    if (!belowOk) {
      killCactus(st, i, j);
      return true;
    }
  }
  return false;
}

/** KillTile(80) 生成期子集（cs:63559 noItem=true 尘 10×0 掷）：清格 + 半砖/坡面
 *  归零（active(false) 与 TileFrame 入口的死格重置）+ SquareTileFrame 3×3 级联 */
/** DD #98 列级事件链钩（一次性诊断 tools/_ddfin.test.ts；vanilla CactusProbe 对拍：
 *  PlantCactus 入口 / CheckCactus 三处 KillTile 位点）。null=零开销。
 *  grow?(i2, j2, rolls)：PlantCactus 150 试环逐试掷耗记录（II 批掷差定位） */
let ccTraceHook: { plant: (i: number, j: number) => void; kill: (i: number, j: number) => void; place?: (x: number, y: number) => void; grow?: (i2: number, j2: number) => void } | null = null;
export function setCcTrace(h: { plant: (i: number, j: number) => void; kill: (i: number, j: number) => void; place?: (x: number, y: number) => void; grow?: (i2: number, j2: number) => void } | null): void {
  ccTraceHook = h;
}
function killCactus(st: TileStore, i: number, j: number): void {
  ccTraceHook?.kill(i, j);
  if (!st.inBounds(i, j)) return;
  const k = st.idx(i, j);
  if (!st.flags[k]) return;
  st.setTileSilent(i, j, 0, 0, 0);   // 原版 frameX/Y=-1（Uint16 无符号位域,0 等价清零）
  st.half[k] = 0;
  st.slope[k] = 0;
  frameAroundCactus(st, i, j);
}

/** SquareTileFrame(x,y) 生成期有效子集（cs:80924）：3×3 逐格 TileFrame——死格
 *  半砖/坡面重置；活性仙人掌 80 → CheckCactus（其余类型：frameImportant 归
 *  TileFrameImportant、实心族归 Cosmetic——均无掷骰无格写，备案省略）。
 *  ★遍历序照原版列主序（x-1 列自上而下 → x → x+1）——级联击杀下顺序影响结果 */
function frameAroundCactus(st: TileStore, x: number, y: number): void {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cx = x + dx, cy = y + dy;
      if (!st.inBounds(cx, cy)) continue;   // cs:82069 边界早退
      const k = st.idx(cx, cy);
      if (!st.flags[k]) {
        // cs:82077-82081 死格重置（含涂装清零——生成期无涂装）
        st.half[k] = 0;
        st.slope[k] = 0;
        continue;
      }
      if (st.type[k] === CACTUS) checkCactus(st, cx, cy);
    }
  }
}

export function growCactus(st: TileStore, rng: RNG, i: number, j: number): void {
  if (j <= 0 || !st.inBounds(i, j) || !st.inBounds(i, j - 1)) return;   // cs:56586 + C# OOB 读 = 空格
  const anchor = st.idx(i, j);
  const anchorType = st.type[anchor];
  if (!st.flags[anchor] || st.half[anchor] !== 0
    || (anchorType !== CACTUS && !SAND_CONV.has(anchorType))
    || st.liquid[st.idx(i, j - 1)] > 0) return;
  // ---- 50×25 水盒（cs:56599-56609；remix 分支不触发）----
  let water = 0;
  for (let k = i - CACTUS_WATER_WIDTH; k < i + CACTUS_WATER_WIDTH; k++) {
    for (let l = j - CACTUS_WATER_HEIGHT; l < j + CACTUS_WATER_HEIGHT; l++) {
      if (st.inBounds(k, l)) water += st.liquid[st.idx(k, l)];
    }
  }
  if (Math.trunc(water / 255) > CACTUS_WATER_LIMIT) return;
  const activeAt = (x: number, y: number): boolean =>
    st.inBounds(x, y) && st.flags[st.idx(x, y)] === 1;
  const isCactus = (x: number, y: number): boolean =>
    st.inBounds(x, y) && st.flags[st.idx(x, y)] === 1 && st.type[st.idx(x, y)] === CACTUS;
  const place = (x: number, y: number): void => {
    ccTraceHook?.place?.(x, y);
    st.setTileSilent(x, y, CACTUS, 0, 0);   // CopyPaintAndCoating：生成期无涂装
    frameAroundCactus(st, x, y);            // SquareTileFrame（cs:56638 等）→ CheckCactus 击杀链
  };

  if (SAND_CONV.has(anchorType)) {
    // ---- 沙锚：在上格冒新仙人掌（cs:56611-56642）----
    if (activeAt(i, j - 1) || activeAt(i - 1, j - 1) || activeAt(i + 1, j - 1)) return;
    let cacti = 0, sand = 0;
    sandScan:
    for (let m = i - 6; m <= i + 6; m++) {
      for (let n = j - 3; n <= j + 1; n++) {
        // InWorld(m, n, 5)（cs:9635）：5 格余量
        if (m < 5 || m >= st.w - 5 || n < 5 || n >= st.h - 5) continue;
        const kk = st.idx(m, n);
        if (!st.flags[kk]) continue;
        const t = st.type[kk];
        if (t === CACTUS) {
          cacti++;
          if (cacti >= 4) return;           // cs:56629：邻域仙人掌 ≥4 即停
        }
        if (SAND_CONV.has(t)) {
          sand++;
          if (sand > 10) break sandScan;    // cs:56635：>10 提前出局（两层 break）
        }
      }
    }
    if (sand > 10) {
      if (rng.int(0, 1) === 0) st.slope[anchor] = 0;   // cs:56640：isGeneratingOrLoadingWorld 恒真
      place(i, j - 1);
    }
    return;
  }
  if (anchorType !== CACTUS) return;         // cs:56643（防御；上部门已保证）

  // ---- 仙人掌锚：向顶扫基列（cs:56644-56661）----
  let num = i, num2 = j;
  while (isCactus(num, num2)) {
    num2++;
    if (!isCactus(num, num2)) {
      // 列尽：邻臂列在同深且其上一格也是仙人掌 → 基列平移到臂列
      if (isCactus(num - 1, num2) && isCactus(num - 1, num2 - 1) && num >= i) num--;
      if (isCactus(num + 1, num2) && isCactus(num + 1, num2 - 1) && num <= i) num++;
    }
  }
  num2--;
  const num6 = num2 - j;                     // 锚上方高度
  const num7 = i - num;                      // 基列横偏
  num = i - num7;                            // cs:56664：镜像基列
  num2 = j;
  const num8 = 11 - num6;
  // ---- 高度门（cs:56666-56679）：盒内仙人掌计数 ≥ Next(11,13) 即停 ----
  let num9 = 0;
  for (let num10 = num - 2; num10 <= num + 2; num10++) {
    for (let num11 = num2 - num8; num11 <= num2 + num6; num11++) {
      if (isCactus(num10, num11)) num9++;
    }
  }
  if (num9 >= rng.int(11, 12)) return;       // cs:56678：num9 >= Next(11,13)
  num = i;
  num2 = j;
  if (num7 === 0) {
    if (num6 === 0) {
      // cs:56687-56701：孤格 → 直上一格
      if (!activeAt(num, num2 - 1)) place(num, num2 - 1);
      return;
    }
    // ---- 横向分叉三选一（cs:56703-56758）----
    let flag = false, flag2 = false;
    if (isCactus(num, num2 - 1)) {
      // 西臂净空五连格（含对角/隔一格）
      if (!activeAt(num - 1, num2) && !activeAt(num - 2, num2 + 1) && !activeAt(num - 1, num2 - 1)
        && !activeAt(num - 1, num2 + 1) && !activeAt(num - 2, num2)) flag = true;
      // 东臂镜像
      if (!activeAt(num + 1, num2) && !activeAt(num + 2, num2 + 1) && !activeAt(num + 1, num2 - 1)
        && !activeAt(num + 1, num2 + 1) && !activeAt(num + 2, num2)) flag2 = true;
    }
    const num12 = rng.int(0, 2);             // cs:56726：Next(3) 三选一
    if (num12 === 0 && flag) {
      place(num - 1, num2);                  // 西臂
    } else if (num12 === 1 && flag2) {
      place(num + 1, num2);                  // 东臂
    } else if (num6 < rng.int(2, 7)          // cs:56741：Next(2,8) 上长门
      && !isCactus(num - 1, num2 - 1) && !isCactus(num + 1, num2 - 1)
      && !activeAt(num, num2 - 1)) {
      place(num, num2 - 1);                  // 继续上长
    }
  } else if (!activeAt(num, num2 - 1) && !activeAt(num, num2 - 2)
    && !activeAt(num + num7, num2 - 1) && isCactus(num - num7, num2 - 1)) {
    // cs:56764-56780：臂列锚 → 补直上一格（对侧臂须存在）
    place(num, num2 - 1);
  }
}

/** PlantCactus（cs:54176-54187）：锚点一次 GrowCactus + 150 次随机邻域尝试
 *  （x∈[i-1,i+1]、y∈[j-10,j+1]）→ 天然成簇 */
export function plantCactus(st: TileStore, rng: RNG, i: number, j: number): void {
  ccTraceHook?.plant(i, j);
  growCactus(st, rng, i, j);
  const hook = ccTraceHook?.grow;
  if (hook) {
    for (let k = 0; k < 150; k++) {
      const i2 = rng.int(i - 1, i + 1);        // Next(i-1, i+2)
      const j2 = rng.int(j - 10, j + 1);       // Next(j-10, j+2)
      growCactus(st, rng, i2, j2);
      hook(i2, j2);
    }
    return;
  }
  for (let k = 0; k < 150; k++) {
    const i2 = rng.int(i - 1, i + 1);        // Next(i-1, i+2)
    const j2 = rng.int(j - 10, j + 1);       // Next(j-10, j+2)
    growCactus(st, rng, i2, j2);
  }
}

/** RollRandomSeaShellStyle（cs:45176-45192）：Next(2) 起，1/10→2、1/10→3、1/50→4
 *  （四次掷骰顺序固定） */
function rollRandomSeaShellStyle(rng: RNG): number {
  let result = rng.int(0, 1);
  if (rng.int(0, 9) === 0) result = 2;
  if (rng.int(0, 9) === 0) result = 3;
  if (rng.int(0, 49) === 0) result = 4;
  return result;
}

/** PlaceTile 81 珊瑚（cs:60214-60218）生成期有效子集：上格空、下格整砖实心
 *  （cs:59455-59463）；frameX = 26*Next(6)。81 非固体 → 可在水下放置。 */
function placeCoral(st: TileStore, rng: RNG, x: number, y: number): boolean {
  if (!st.inBounds(x, y) || !st.inBounds(x, y - 1) || !st.inBounds(x, y + 1)) return false;
  if (st.flags[st.idx(x, y - 1)]) return false;
  const bi = st.idx(x, y + 1);
  if (!st.flags[bi] || !TILE_DEFS[st.type[bi]]?.solid
    || st.half[bi] !== 0 || st.slope[bi] !== 0) return false;
  st.setTileSilent(x, y, CORAL, 26 * rng.int(0, 5), 0);
  return true;
}

/** PlaceTile 324 贝壳 → Place1x1（cs:60166-60171 + 45194-45210）：下格 SolidTile2；
 *  frameX = 22*Next(3)、frameY = 22*style */
function placeSeaShell(st: TileStore, rng: RNG, x: number, y: number, style: number): boolean {
  if (!st.inBounds(x, y) || !st.inBounds(x, y + 1)) return false;
  const bi = st.idx(x, y + 1);
  if (!(st.flags[bi] && TILE_DEFS[st.type[bi]]?.solid
    && st.slope[bi] === 0 && st.half[bi] === 0)) return false;
  st.setTileSilent(x, y, SEASHELLS, 22 * rng.int(0, 2), 22 * style);
  return true;
}

// ============ 绿洲消费段（cs:21129-21163）+ 尾部燕麦段（cs:21302-21320）共用辅助 ============
const PALM = TILE_BY_KEY['v_323_palm_trees']!;
const SEAOAT = TILE_BY_KEY['v_529_sea_oats']!;
const OASIS_PLANT = TILE_BY_KEY['v_530_oasis_plants']!;
/** GenVars.oasisHeight（GenVars.cs:268）= 20——与 OasisPass.OASIS_HEIGHT 同源常量
 *  （本文件不得改 OasisPass，无法 import 其私有常量，原样复制） */
const OASIS_HEIGHT = 20;
/** TileID.Sets.Conversion.Sand（TileID.cs:30）：53/112/116/234——燕麦/绿洲植物基座沙族门 */
const SAND_FAMILY = idsByVanillaSheet(53, 112, 116, 234);
/** 苗 tile 20：棕榈越过找基座（cs:27268 while type==20）——同 TreePass.PLANTS */
const PALM_SAPLING = idsByVanillaSheet(20);
/** 棕榈基座沙族（cs:27292：53/234/116/112）——同 TreePass.PALM_GROUND */
const PALM_GROUND = idsByVanillaSheet(53, 234, 116, 112);

/** EmptyTileCheck（L15685 简化：出界 false，任何活性格 false）——同 TreePass */
function palmEmptyCheck(st: TileStore, x0: number, x1: number, y0: number, y1: number): boolean {
  if (x0 < 0 || x1 >= st.w || y0 < 0 || y1 >= st.h) return false;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (st.flags[st.idx(x, y)]) return false;
    }
  }
  return true;
}

/** GrowPalmTree（cs:27260-27352）= TryGrowingTreeByType(323)（cs:30508）。
 *  TreePass.growPalmTree 为私有函数且本任务只许改本文件，故同源复制（若后续
 *  TreePass 导出 growPalmTree 应改回复用防漂移）。
 *  侧净空注意：1456:27302 用 num-num2（num2=20+treeHeightAddon=20 → num-20）；
 *  1405:11800 是 index1-30——TreePass 移植仍携 1405 值 -30，此处按项目铁律取
 *  1456 终态 -20。 */
/** cs:21151-21152 棕榈种植代理——复用 TreePass.growPalmTree(1456 :27270-27340 终态;
 * 2026-08-13 前是同源复制的 growPalmTreeAt,已去重) */
function growPalmTreeAt(st: TileStore, rng: RNG, gs: GenState, i: number, y: number): boolean {
  return growPalmTree(st, rng, i, y, gs);
}

/** SolidTileAllowBottomSlope（cs:70211）：active && (tileSolid||tileSolidTop) &&
 *  非 topSlope(1/2) && !halfBrick。tileSolidTop≈platform（HalfBrickPass 同款近似）；
 *  cs:70214 出界返回 true（原版怪癖，照抄）。 */
function solidAllowBottomSlope(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  const t = st.type[i];
  if (!st.flags[i] || t === 0) return false;
  const d = TILE_DEFS[t];
  return !!d && (d.solid || !!d.platform)
    && st.slope[i] !== 1 && st.slope[i] !== 2 && !st.half[i];
}

/** SeaOatWaterCheck 已迁 TreePass（棕榈尾帧扫复用；本文件经 import 使用） */

/** PlantSeaOat（cs:58315-58350）：本格空气/无墙/无液 + 下格整砖沙族 + 水检过 →
 *  种燕麦 529（frameX=18*Next(5)、frameY=0）。Next(5) 只在成功路径消耗。
 *  BlockColorAndCoating/UseBlockColors 拷贝下格涂装——生成期无涂装，等价无操作。 */
function plantSeaOat(st: TileStore, rng: RNG, gs: GenState, x: number, y: number): boolean {
  if (!st.inBounds(x, y) || !st.inBounds(x, y + 1)) return false;
  const i = st.idx(x, y);
  if (st.wall[i] > 0 || st.flags[i] || st.liquid[i] > 0) return false;   // cs:58318-58320
  if (!solidAllowBottomSlope(st, x, y + 1)) return false;
  if (!SAND_FAMILY.has(st.type[st.idx(x, y + 1)])) return false;         // cs:58321 Conversion.Sand
  if (!seaOatWaterCheck(st, gs, x, y)) return false;                     // cs:58323
  st.setTileSilent(x, y, SEAOAT, 18 * rng.nextInt(5), 0);                // cs:58333-58336
  return true;
}

/** GrowSeaOat（cs:58359-58367）：frameX < 180 时 +90（两段生长）。零掷骰 */
function growSeaOat(st: TileStore, x: number, y: number): void {
  const i = st.idx(x, y);
  if (st.frameX[i] < 180) st.frameX[i] += 90;
}

/** OasisPlantWaterCheck（cs:47511-47536）：45×41 盒非实心格液量和 /255 ≥ 20。
 *  cs:47522 原版在内层判的是参数 x 而非循环变量 i（海滩带整列放空）——照抄。 */
function oasisPlantWaterCheck(st: TileStore, gs: GenState, x: number, y: number): boolean {
  if (x <= gs.beachDistance || x >= st.w - gs.beachDistance) return false;
  let sum = 0;
  for (let i = x - 45; i <= x + 45; i++) {
    for (let j = y - 20; j <= y + 20; j++) {
      if (st.inBounds(i, j) && !_solidTileHB(st, i, j)) sum += st.liquid[st.idx(i, j)];
    }
  }
  return Math.trunc(sum / 255) >= 20;
}

/** PlaceOasisPlant（cs:47543-47615）：Next(9) style 掷在海滩/边界早退门之前——
 *  每次调用必掷（RNG 流关键）。门：3×2 盒内活性物须全为燕麦 529 且无液、
 *  盒下 3 格整砖沙族（Conversion.Sand）、OasisPlantWaterCheck 过 → 清盒后铺
 *  6 格 530（frameX=54*style+{0,18,36}，frameY={0,18}，style num2 恒 0 → num4=0）。 */
function placeOasisPlant(st: TileStore, rng: RNG, gs: GenState, X: number, Y: number): void {
  const style = rng.nextInt(9);                              // cs:47546——早退门之前
  if (X < gs.beachDistance || X > st.w - gs.beachDistance || Y < 5 || Y > st.h - 5) return;
  let flag = true;
  for (let i = X - 1; i <= X + 1; i++) {
    for (let j = Y - 1; j <= Y; j++) {                       // cs:47555：j < Y+1（两行）
      if (!st.inBounds(i, j)) continue;
      const k = st.idx(i, j);
      if (st.flags[k] && st.type[k] !== SEAOAT) flag = false;   // 活性且非 529 → 拒
      if (st.liquid[k] > 0) flag = false;                       // cs:47562
    }
    if (!st.inBounds(i, Y + 1) || !_solidTileHB(st, i, Y + 1)
      || !SAND_FAMILY.has(st.type[st.idx(i, Y + 1)])) flag = false;   // cs:47567-47570
  }
  if (!flag || !oasisPlantWaterCheck(st, gs, X, Y)) return;
  // cs:47582-47590：清 3×2 盒活性物（KillTile noItem——生成期 isGeneratingOrLoadingWorld
  // 强制 noItem，529 不进任何 genRand 分支 → 零掷骰；随后 6 格全被覆写，帧残留无影响）
  for (let i = X - 1; i <= X + 1; i++) {
    for (let j = Y - 1; j <= Y; j++) {
      // KillTile(noItem) 生成期子集:清格 + SquareTileFrame 3×3 级联(cs:63974;
      // 529/530 不进任何 genRand 分支 → 零掷)
      if (st.inBounds(i, j) && st.flags[st.idx(i, j)]) {
        st.setTileSilent(i, j, 0, 0, 0);
        st.half[st.idx(i, j)] = 0;
        st.slope[st.idx(i, j)] = 0;
        palmRangeFrame(st, gs, i - 1, j - 1, i + 1, j + 1);
      }
    }
  }
  const fx = 54 * style;                                     // cs:47593 num3 = 54*num
  for (let i = X - 1; i <= X + 1; i++) {
    for (let j = Y - 1; j <= Y; j++) {
      st.setTileSilent(i, j, OASIS_PLANT, fx + 18 * (i - (X - 1)), 18 * (j - (Y - 1)));
    }
  }
}

/** pass 96 本体。Skyblock.denyAllGeneration（cs:21117）→ 整段跳过（零掷骰）。 */
export function runCactusPalmTreesAndCoralPass(st: TileStore, rng: RNG, gs: GenState): void {
  const g0 = globalThis as { __swCcCap?: (gs: GenState, st: TileStore) => void };
  try { g0.__swCcCap?.(gs, st); } catch { /* probe */ }
  if (gs.seedFlags.skyblock) return;
  const w = st.w;
  const num = 8;                             // cs:21120（remixWorldGen=2 不触发）
  const num7 = 380;                          // cs:21127
  const maxL = rng.int(3, 12);               // cs:21123 Next(3,13)——左段列距骰
  const maxR = rng.int(3, 12);               // cs:21124 Next(3,13)——右段列距骰
  rng.int(2, 5); rng.int(2, 5);              // cs:21125-21126 Next(2,6)×2——死骰（声明后未用）
  // ---- 头部绿洲消费段（cs:21129-21163）：每片绿洲 ±(width*1.5)×±oasisHeight(20) 逐格 ----
  for (let i = 0; i < gs.numOasis; i++) {
    const num8 = Math.trunc(gs.oasisW[i]! * 1.5);      // cs:21131 (int)(oasisWidth*1.5)
    const ox = gs.oasisX[i]!, oy = gs.oasisY[i]!;
    for (let j = ox - num8; j <= ox + num8; j++) {
      for (let k = oy - OASIS_HEIGHT; k <= oy + OASIS_HEIGHT; k++) {
        // cs:21138-21149：17×17 邻域已有棕榈 323 → 概率 1.0 降为 0.13（全扫不 break，
        // num9 赋值幂等）
        let num9 = 1.0;
        for (let l = j - 8; l <= j + 8; l++) {
          for (let m = k - 8; m <= k + 8; m++) {
            if (st.inBounds(l, m) && st.flags[st.idx(l, m)] && st.type[st.idx(l, m)] === PALM) num9 = 0.13;
          }
        }
        if (rng.next() < num9) growPalmTreeAt(st, rng, gs, j, k);   // cs:21151-21152 NextDouble < num9
        if (plantSeaOat(st, rng, gs, j, k)) {                   // cs:21154
          if (rng.nextInt(2) === 0) growSeaOat(st, j, k);       // cs:21156
          if (rng.nextInt(2) === 0) growSeaOat(st, j, k);       // cs:21160
        }
        placeOasisPlant(st, rng, gs, j, k);                     // cs:21163（530，Next(9) 必掷）
      }
    }
  }
  const yTop = gs.worldSurface - 1;          // cs:21198：num13 = worldSurface - 1
  for (let n = 0; n < 3; n++) {
    let x0: number, x1: number, flag: boolean, maxValue: number;
    if (n === 0) { x0 = 5; x1 = num7; flag = false; maxValue = maxL; }
    else if (n === 1) { x0 = 400; x1 = w - 400; flag = true; maxValue = num; }
    else { x0 = w - num7; x1 = w - 5; flag = false; maxValue = maxR; }
    for (let x = x0; x < x1; x++) {
      if (rng.nextInt(maxValue) !== 0) {
        // ---- 尾部燕麦段（cs:21302-21320）：列距骰未命中的列，y 自 0 起整列铺燕麦/530 ----
        for (let y = 0; y < yTop && y < st.h; y++) {
          if (plantSeaOat(st, rng, gs, x, y)) {                // cs:21309
            if (rng.nextInt(2) === 0) growSeaOat(st, x, y);    // cs:21312
            if (rng.nextInt(2) === 0) growSeaOat(st, x, y);    // cs:21315
          }
          placeOasisPlant(st, rng, gs, x, y);                  // cs:21318（Next(9) 必掷）
        }
        continue;
      }
      // y=0 起扫（cs:21205）；y<1 时上格越界（C# OOB 读 = 空格 → 门必过但
      // 放置目标 y-1<0 不可写）——等价跳过
      for (let y = 1; y < yTop && y < st.h; y++) {
        const ti = st.idx(x, y);
        if (!st.flags[ti] || !SAND_GATE.has(st.type[ti])) continue;   // cs:21208-21211
        const ai = st.idx(x, y - 1);
        if (st.flags[ai] || st.wall[ai] !== 0) continue;              // cs:21213-21216
        if (flag) {
          // ---- 中段：湖畔水盒棕榈 / 仙人掌（cs:21257-21279；水盒逻辑在
          //      TreePass.waterBoxPalmCheck——超限已掷 Next(4) 时不再 PlantCactus）----
          if (!waterBoxPalmCheck(st, rng, x, y, gs)) plantCactus(st, rng, x, y);
        } else {
          // ---- 两端海滩段：珊瑚 81 / 贝壳 324（cs:21283-21299）----
          if (st.inBounds(x, y - 4)
            && st.liquid[st.idx(x, y - 2)] === 255
            && st.liquid[st.idx(x, y - 3)] === 255
            && st.liquid[st.idx(x, y - 4)] === 255) {
            if (rng.int(0, 1) === 0) placeCoral(st, rng, x, y - 1);
            else placeSeaShell(st, rng, x, y - 1, rollRandomSeaShellStyle(rng));
            break;                          // cs:21292：放置后跳出本列扫描
          }
          if (st.inBounds(x, y - 2) && st.liquid[st.idx(x, y - 2)] === 0 && y < gs.worldSurface) {
            placeSeaShell(st, rng, x, y - 1, rollRandomSeaShellStyle(rng));
            break;                          // cs:21299
          }
        }
      }
    }
  }
}
