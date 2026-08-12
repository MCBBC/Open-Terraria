// 蜂巢(pass 45,HiveBiome.cs 1:1)+ 蜘蛛巢(1456 SpiderCaves L17455 / Spread.Spider L3653 1:1)
// + Webs 全局蛛网 pass(L13659)+ WebsInSpiderCavesAndHoney(L20140)。
// 蜂巢:主巢+隧道链(每巢各不相同)+蜂蜜斑(HoneyPatchBiome);剖面=核心40%蜂蜜/0.6墙86空腔/0.75实心蜂壳;
// 链终点幼虫托台(BOSS 房)。蜘蛛巢:countTiles 门(500≤空腔≤3499)采样 + 波前 BFS 刷墙62
// + 内饰(蛛网罐28/蛛网宝箱939/垂网165/覆饰187/小堆185);后续 pass 补 9/10 蛛网51+蜂巢钟乳石。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { placeBuriedChest, type ChestSink } from './BuriedChestsPass';
import { tileRunner } from './TileRunner';
import { solidTile as solidTileHB, poundTile as poundTileHB } from './HalfBrickPass';

const HIVE = TILE_BY_KEY['v_225_hive_block']!;
const LARVA = TILE_BY_KEY['v_231_larva']!;
const COBWEB = TILE_BY_KEY['v_51_cobweb']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const MUDT = TILE_BY_KEY['mud']!;
const LIHARD = TILE_BY_KEY['v_226_lihzahrd_brick']!;

/** CreateHiveTunnel(HiveBiome.cs:135)1:1:基础半径 12-20,步数每迭代净 -2,
 *  三阈值各自独立 ±0.5% 抖动且基于基础半径;±10 格墙 87(神庙)/地表空墙 → 整条作废 */
function hiveTunnel(st: TileStore, rng: RNG, gs: GenState, sx: number, sy: number): [number, number] {
  const baseR = rng.int(12, 20);
  let num2 = rng.int(10, 20);   // 剩余步数
  let vx = rng.int(-10, 10) * 0.2, vy = rng.int(-10, 10) * 0.2;
  let px = sx + 0.0, py = sy + 0.0;
  while (num2 > 0) {
    if (py > st.h - 250) num2 = 0;
    const r = baseR * (1 + rng.int(-20, 19) * 0.01);
    let next2 = num2 - 1;   // 本迭代后的剩余(可能被截断保护清零)
    const x0 = Math.max(1, Math.floor(px - r)), x1 = Math.min(st.w - 1, Math.floor(px + r));
    const y0 = Math.max(1, Math.floor(py - r)), y1 = Math.min(st.h - 1, Math.floor(py + r));
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        if (x < 50 || y < 50 || x > st.w - 50 || y > st.h - 50) { next2 = 0; }
        else {
          // ±10 格神庙墙(87)→ 截断
          if ((st.inBounds(x - 10, y) && st.wall[st.idx(x - 10, y)] === 87)
            || (st.inBounds(x + 10, y) && st.wall[st.idx(x + 10, y)] === 87)
            || (st.inBounds(x, y - 10) && st.wall[st.idx(x, y - 10)] === 87)
            || (st.inBounds(x, y + 10) && st.wall[st.idx(x, y + 10)] === 87)) next2 = 0;
          // 地表以上且上方 5 格无墙 → 截断(防穿透地表)
          if (y < gs.worldSurface && st.inBounds(x, y - 5) && st.wall[st.idx(x, y - 5)] === 0) next2 = 0;
        }
        const i = st.idx(x, y);
        const d = Math.hypot(x - px, y - py);
        if (d < baseR * 0.4 * (1 + rng.int(-10, 10) * 0.005)) {
          if (rng.int(0, 2) === 0) { st.liquid[i] = 255; st.liquidType[i] = 3; }
          st.wall[i] = 86;
          st.type[i] = 0; st.flags[i] = 0;
        } else if (d < baseR * 0.75 * (1 + rng.int(-10, 10) * 0.005)) {
          st.liquid[i] = 0; st.liquidType[i] = 0;
          if (st.wall[i] !== 86) { st.type[i] = HIVE; st.flags[i] = 1; }
        }
        if (d < baseR * 0.6 * (1 + rng.int(-10, 10) * 0.005)) st.wall[i] = 86;
      }
    }
    px += vx; py += vy;
    num2 = next2 - 1;   // 原版:num2 = num3 - 1(每迭代净 -2)
    vy += rng.int(-10, 10) * 0.05;
    vx += rng.int(-10, 10) * 0.05;
  }
  return [px, py];
}

/** 蜂蜜坠落块(HiveBiome.cs:206/214):4×4 蜂壳封 2×2 蜜 + 向外砸出凹槽 */
function blockedHoneyCube(st: TileStore, x: number, y: number): void {
  for (let ix = x - 1; ix <= x + 2; ix++) {
    for (let iy = y - 1; iy <= y + 2; iy++) {
      if (!st.inBounds(ix, iy)) continue;
      const i = st.idx(ix, iy);
      if (ix >= x && ix <= x + 1 && iy >= y && iy <= y + 1) {
        st.type[i] = 0; st.flags[i] = 0;
        st.liquid[i] = 255; st.liquidType[i] = 3;
      } else {
        st.type[i] = HIVE; st.flags[i] = 1;
      }
    }
  }
}

function dentForHoneyFall(st: TileStore, x: number, y: number, dirIn: number): void {
  const dir = -dirIn;
  y++;
  let num = 0;
  let cx = x;
  while ((num < 4 || solidTileHB(st, cx, y)) && cx > 10 && cx < st.w - 10) {
    num++;
    cx += dir;
    if (solidTileHB(st, cx, y)) {
      // WorldGen.PoundTile（HiveBiome.cs:338）：半砖 toggle（非清除）——
      // 砸后该格不再是 SolidTile，循环随即退出，与原版控制流一致
      poundTileHB(st, cx, y);
      if (!st.flags[st.idx(cx, y + 1)]) {
        st.type[st.idx(cx, y + 1)] = HIVE;
        st.flags[st.idx(cx, y + 1)] = 1;
      }
    }
  }
}

/** 蜂蜜斑微群系(HoneyPatchBiome.cs:8-48)1:1。
 *  锚点:origin 实心 → 拒;向下 ≤80 找首个实心再 +2。门禁:圆 15 实心中丛林土/草
 *  (59/60)占比 ≥75% 且草(60)≥2 → 圆 8 实心 ≥20 → 保护图 16×16 → 近地狱/
 *  ±150 步进 10 有神庙砖 226 或墙 83/3/87 → 拒。
 *  塑形:圆 8 RadialDither(0,10) 蜂壳 229;圆(4,3) Blotches 挖蜜池(矩形掩码
 *  [-6,6]×[0,3] 记 ShapeData + 灌蜜);内轮廓(origin+1,掩码 [1,3])补泥 59;
 *  All(data) 外扩 1 圈、y≥锚行、非实心无蜜 → 蜂壳 229。
 *  RNG:RadialDither 每点 1 掷(Shapes.Circle 行主序自上而下)、Blotches 每点
 *  2 掷(+命中补 4 掷)——与原版逐点对齐。 */
function placeHoneyPatch(
  st: TileStore, rng: RNG, gs: GenState,
  protectedRects: Array<{ x0: number; y0: number; x1: number; y1: number }>,
  ox: number, oy: number,
): boolean {
  // HoneyPatchBiome.cs:10-13
  if (st.inBounds(ox, oy) && st.flags[st.idx(ox, oy)] && solidTileHB(st, ox, oy)) return false;
  // cs:14-18:Searches.Down(80)+IsSolid(含 origin 本格),命中行 +2
  let ry = -1;
  for (let k = 0; k < 80 && oy + k < st.h; k++) {
    if (solidTileHB(st, ox, oy + k)) { ry = oy + k; break; }
  }
  if (ry < 0) return false;
  ry += 2;
  const rx = ox;
  // cs:22-26:圆 15 三计数门(Scanner 链:实心 / 60∪59 / 60)
  const circleRows = (hR: number, vR: number, fn: (dx: number, dy: number) => void): void => {
    const rr = (hR + 1) * (hR + 1);
    for (let dy = -vR; dy <= vR; dy++) {
      const num2 = (hR / vR) * dy;
      const half = Math.min(hR, Math.trunc(Math.sqrt(rr - num2 * num2)));
      for (let dx = -half; dx <= half; dx++) fn(dx, dy);
    }
  };
  let solid = 0, mudOrGrass = 0, grass = 0;
  circleRows(15, 15, (dx, dy) => {
    if (!st.inBounds(rx + dx, ry + dy)) return;
    const i = st.idx(rx + dx, ry + dy);
    if (!st.flags[i] || !TILE_DEFS[st.type[i]]?.solid) return;
    solid++;
    const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
    if (sheet === 60 || sheet === 59) mudOrGrass++;
    if (sheet === 60) grass++;
  });
  if (solid === 0 || mudOrGrass / solid < 0.75 || grass < 2) return false;
  // cs:28-32:圆 8 实心 ≥20
  let solid8 = 0;
  circleRows(8, 8, (dx, dy) => {
    if (solidTileHB(st, rx + dx, ry + dy)) solid8++;
  });
  if (solid8 < 20) return false;
  // cs:33-36:保护图 CanPlace(16×16)
  const rect = { x0: rx - 8, y0: ry - 8, x1: rx + 8, y1: ry + 8 };
  if (protectedRects.some((p) => p.x0 < rect.x1 && rect.x0 < p.x1 && p.y0 < rect.y1 && rect.y0 < p.y1)) return false;
  // cs:37-40 + TooCloseToImportantLocations(cs:50-81)
  if (ry >= gs.lavaLine - 30) return false;
  for (let i = rx - 150; i < rx + 150; i += 10) {
    if (i <= 0 || i > st.w - 1) continue;
    for (let j = ry - 150; j < ry + 150; j += 10) {
      if (j <= 0 || j > st.h - 1) continue;
      const ii = st.idx(i, j);
      if (st.flags[ii] && st.type[ii] === LIHARD) return false;
      if (st.wall[ii] === 83 || st.wall[ii] === 3 || st.wall[ii] === 87) return false;
    }
  }
  // cs:41:圆 8 + RadialDither(0,10) + IsSolid → SetTile(229)
  circleRows(8, 8, (dx, dy) => {
    const num2 = Math.max(0, Math.min(1, Math.sqrt(dx * dx + dy * dy) / 10));
    if (rng.next() > num2 && solidTileHB(st, rx + dx, ry + dy)) {
      const i = st.idx(rx + dx, ry + dy);
      st.type[i] = HIVE; st.flags[i] = 1;
      st.liquid[i] = 0; st.liquidType[i] = 0;
    }
  });
  // cs:43:圆(4,3) + Blotches(scale2,chance0.3) + IsSolid + ClearTile
  //   + RectangleMask(-6,6,0,3).Output(data) + SetLiquid(2=蜂蜜)
  const key = (qx: number, qy: number) => (qx + 16) * 64 + (qy + 16);
  const data = new Set<number>();
  circleRows(4, 3, (dx, dy) => {
    rng.next();   // Blotches 首掷丢弃
    const pts: Array<[number, number]> = [];
    if (rng.next() < 0.3) {
      const bx0 = rng.int(-1, 0), bx1 = rng.int(0, 1);
      const by0 = rng.int(-1, 0), by1 = rng.int(0, 1);
      for (let bi = bx0; bi <= bx1; bi++) for (let bj = by0; bj <= by1; bj++) pts.push([dx + bi, dy + bj]);
    } else {
      pts.push([dx, dy]);
    }
    for (const [qx, qy] of pts) {
      if (!solidTileHB(st, rx + qx, ry + qy)) continue;
      const i = st.idx(rx + qx, ry + qy);
      st.flags[i] = 0;   // ClearTile
      if (qx >= -6 && qx <= 6 && qy >= 0 && qy <= 3) {
        data.add(key(qx, qy));
        st.liquid[i] = 255; st.liquidType[i] = 3;   // 蜂蜜
      }
    }
  });
  // cs:44:InnerOutline(data)@origin+(0,1) + IsEmpty + RectangleMask(-6,6,1,3) → 泥 59
  const NEIGH8: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const k of data) {
    const qx = Math.trunc(k / 64) - 16, qy = (k % 64) - 16;
    let edge = false;
    for (const [nx, ny] of NEIGH8) {
      if (!data.has(key(qx + nx, qy + ny))) { edge = true; break; }
    }
    if (!edge) continue;
    const px = rx + qx, py = ry + 1 + qy;
    if (!st.inBounds(px, py)) continue;
    const i = st.idx(px, py);
    if (st.flags[i]) continue;                          // IsEmpty
    if (qx < -6 || qx > 6 || qy < 1 || qy > 3) continue;   // RectangleMask
    st.type[i] = MUDT; st.flags[i] = 1;
  }
  // cs:45:All(data)@origin + Expand(1) + IsBelowHeight(ry,inclusive) + IsNotSolid
  //   + NoLiquid(蜂蜜) → 蜂壳 229
  for (const k of data) {
    const qx = Math.trunc(k / 64) - 16, qy = (k % 64) - 16;
    for (let ex = -1; ex <= 1; ex++) {
      for (let ey = -1; ey <= 1; ey++) {
        const px = rx + qx + ex, py = ry + qy + ey;
        if (!st.inBounds(px, py) || py < ry) continue;   // IsBelowHeight(含锚行)
        const i = st.idx(px, py);
        if (st.flags[i] && TILE_DEFS[st.type[i]]?.solid) continue;   // IsNotSolid
        if (st.liquid[i] > 0 && st.liquidType[i] === 3) continue;    // NoLiquid(蜂蜜)
        st.type[i] = HIVE; st.flags[i] = 1;
      }
    }
  }
  protectedRects.push(rect);   // cs:46
  return true;
}

/** Hives(pass 45,HiveBiome.Place):隧道链每段从段起点扇形展开,段终点接续 */
export function runBeehivePass(st: TileStore, rng: RNG, gs: GenState): void {
  const s = st.w / 4200;
  const count = 1 + rng.int(Math.floor(5 * s), Math.max(Math.floor(5 * s) + 1, Math.floor(8 * s)) - 1);
  const yMin = Math.floor((gs.worldSurface + gs.rockLevel) / 2);
  // 结构保护图近似(无全局 StructureMap):主巢 ±50(padding 5)与蜂蜜斑 16×16 互斥
  const protectedRects: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  let placed = 0;
  for (let n = 0; n < count * 100 && placed < count; n++) {
    // 原版 RandomWorldPoint((ws+rl)>>1, 20, 300, 20)（WorldGen.cs:16028，cs:27255
    // 参数序 top,right,bottom,left）：X∈[20,w-21]，Y∈[(ws+rl)/2, h-300]。
    // 此前 right=20/bottom=300 安反轴——横向两侧各砍 300 格（丛林边缘蜂巢绝迹）、
    // 纵向放到 h-21 贴地狱
    const x = rng.int(20, st.w - 21);
    const y = rng.int(yMin, st.h - 301);
    if (!st.inBounds(x, y) || !st.flags[st.idx(x, y)]) continue;
    // 原版验证:半径 15 圆内实心中 60/59 占比 ≥75% 且 60 ≥2
    let solid = 0, mudOrGrass = 0, grass = 0;
    for (let dx = -15; dx <= 15; dx++) {
      for (let dy = -15; dy <= 15; dy++) {
        if (dx * dx + dy * dy > 225) continue;
        if (!st.inBounds(x + dx, y + dy)) continue;
        const i = st.idx(x + dx, y + dy);
        if (!st.flags[i]) continue;
        solid++;
        if (st.type[i] === JUNGLE_GRASS || st.type[i] === MUDT) mudOrGrass++;
        if (st.type[i] === JUNGLE_GRASS) grass++;
      }
    }
    if (solid === 0 || mudOrGrass / solid < 0.75 || grass < 2) continue;
    // 隧道链:2-4 段;每段 2-4 条全部从段起点出发,段位置=最后一条终点
    let px = x + 0.0, py = y + 0.0;
    const segEnds: Array<[number, number]> = [];
    const segs = rng.int(2, 4);
    for (let seg = 0; seg < segs; seg++) {
      const tunnels = rng.int(2, 4);
      let ex = px, ey = py;
      for (let t = 0; t < tunnels; t++) {
        [ex, ey] = hiveTunnel(st, rng, gs, Math.floor(px), Math.floor(py));
      }
      px = ex; py = ey;
      segEnds.push([Math.floor(px), Math.floor(py)]);
    }
    // 蜂蜜坠落块:每个段终点 2×2 实心处放封蜜块+凹槽
    for (const [ex, ey] of segEnds) {
      const dir = rng.int(0, 1) === 0 ? -1 : 1;
      let hx = ex, guard = 0;
      while (guard++ < 60 && Math.abs(hx - ex) <= 50
        && !(st.flags[st.idx(hx, ey)] && st.flags[st.idx(hx, ey + 1)]
          && st.flags[st.idx(hx + 1, ey)] && st.flags[st.idx(hx + 1, ey + 1)])) {
        hx += dir;
      }
      if (Math.abs(hx - ex) > 50) continue;
      const x2 = hx + dir;
      // SpotActuallyNotInHive:4×4 内有非蜂巢实心则跳过
      let notInHive = false;
      for (let ix = x2 - 1; ix <= x2 + 2; ix++) {
        for (let iy = ey - 1; iy <= ey + 2; iy++) {
          if (ix < 10 || ix > st.w - 10) { notInHive = true; break; }
          if (st.flags[st.idx(ix, iy)] && st.type[st.idx(ix, iy)] !== HIVE) { notInHive = true; break; }
        }
        if (notInHive) break;
      }
      if (!notInHive) {
        blockedHoneyCube(st, x2, ey);
        dentForHoneyFall(st, x2, ey, dir);
      }
    }
    // 幼虫托台(BOSS 房):链终点 3 宽清空+蜂巢地板
    // （AddBeeLarva WorldGen.cs:32215-32236 逐行对应；原版末尾 PlaceTile(x,y,231) 放幼虫）
    const lx = Math.floor(px), ly = Math.floor(py);
    if (st.inBounds(lx, ly + 1)) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -2; dy <= 1; dy++) {
          if (!st.inBounds(lx + dx, ly + dy)) continue;
          const i = st.idx(lx + dx, ly + dy);
          if (dy !== 1) {
            st.type[i] = 0; st.flags[i] = 0;
          } else {
            st.type[i] = HIVE; st.flags[i] = 1;
          }
        }
      }
      // 幼虫 3×3（占 lx-1..lx+1 × ly-2..ly，底行贴蜂巢地板；顶行帧 (0,0)）
      for (let dx = 0; dx < 3; dx++) {
        for (let dy = 0; dy < 3; dy++) {
          const tx = lx - 1 + dx, ty = ly - 2 + dy;
          if (!st.inBounds(tx, ty)) continue;
          const i = st.idx(tx, ty);
          st.type[i] = LARVA; st.flags[i] = 1;
          st.frameX[i] = dx * 18; st.frameY[i] = dy * 18;
        }
      }
    }
    // ★cs:16036-16053:主巢落成后是"蜂蜜斑"(HoneyPatchBiome)而非卫星巢——
    //   目标数 Next(5)、预算 10000、每次先掷半径 NextDouble*60+30 再掷角度
    //   NextDouble*2π,y 无压缩;落点横向 50 边距内或放置失败则不计
    const patches = rng.int(0, 4);
    let done = 0, budget = 10000;
    while (done < patches && budget > 0) {
      const rad = rng.next() * 60 + 30;
      const ang = rng.next() * 6.2831854820251465;
      const hx = Math.trunc(Math.cos(ang) * rad) + x;
      const hy = Math.trunc(Math.sin(ang) * rad) + y;
      budget--;
      if (hx > 50 && hx < st.w - 50 && placeHoneyPatch(st, rng, gs, protectedRects, hx, hy)) done++;
    }
    protectedRects.push({ x0: x - 45, y0: y - 45, x1: x + 55, y1: y + 55 });   // AddProtectedStructure(±50, padding 5)
    placed++;
  }
}

// ===================== 蜘蛛巢（1456 SpiderCaves L17455 + Spread.Spider L3653 1:1） =====================
const POT = TILE_BY_KEY['pot']!;
const DECO165 = TILE_BY_KEY['v_165_cave_decos']!;
const DECO187 = TILE_BY_KEY['v_187_decos_3x2_group_2']!;
const SMALL185 = TILE_BY_KEY['v_185_small_decos']!;
const MUSHROOM_GRASS = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const MAX_TILE_COUNT = 3500; // 原版 maxTileCount（countTiles 硬顶）
/** 原版 pass 63 时洞穴尚无自然墙（CaveWalls pass 67 才刷）。我方 TerrainPass 预填了
 *  墙 1/2——此处按原版时序语义视作"无墙"（可穿行、可覆写为 62） */
const treatAsNoWall = (wl: number) => wl === 0 || wl === 1 || wl === 2;

/** 原版 SolidTile 语义：active(flags) + tileSolid。生成期幽灵 tile（有 type 无 flags）不算实心 */
function solidTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[st.type[i]];
  return !!d && d.solid;
}

/** countTiles（L9493）1:1：洪泛计数非实心格，硬顶 3500；
 *  触界/遇墙 → 直接判满（reject）；shroom 按访问次数计（蘑菇草地邻接>1 即拒绝） */
function countTiles(st: TileStore, x: number, y: number): { count: number; shroom: number } {
  let count = 0, shroom = 0;
  const seen = new Set<number>();
  const stack: Array<[number, number]> = [];
  if (!(x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1)) stack.push([x, y]);
  while (stack.length) {
    if (count >= MAX_TILE_COUNT) break;
    const [cx, cy] = stack.pop()!;
    if (cx <= 1 || cx >= st.w - 1 || cy <= 1 || cy >= st.h - 1) return { count: MAX_TILE_COUNT, shroom };
    const k = cx * 100000 + cy;
    if (seen.has(k)) continue;
    const i = st.idx(cx, cy);
    if (!treatAsNoWall(st.wall[i])) return { count: MAX_TILE_COUNT, shroom };
    seen.add(k);
    if (st.flags[i] && st.type[i] === MUSHROOM_GRASS) shroom++;
    if (!solidTile(st, cx, cy)) {
      count++;
      stack.push([cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]);
    }
  }
  return { count, shroom };
}

/** PlacePot（L?）1:1：2×2（y-1..y 行），随机 3 变体在 X 轴、style 在 Y 轴；占用格须空、脚下须实心 */
function placePot(st: TileStore, rng: RNG, x: number, y: number, style: number): boolean {
  for (let k = 0; k < 2; k++) {
    for (let l = -1; l < 1; l++) {
      if (!st.inBounds(x + k, y + l) || st.flags[st.idx(x + k, y + l)]) return false;
    }
    if (!solidTile(st, x + k, y + 1)) return false;
  }
  const variant = rng.int(0, 2) * 36; // 原版仅在放置成功时消费 Next(3)
  for (let k = 0; k < 2; k++) {
    for (let l = -1; l < 1; l++) {
      st.setTileSilent(x + k, y + l, POT, k * 18 + variant, (l + 1) * 18 + style * 36);
    }
  }
  return true;
}

/** PlaceTight(spiders:true)（L?）1:1：垂挂蛛网 165（1×2，fx=108+variation*18）；
 *  消耗 Next(2)+Next(3)（与原版参数求值顺序一致） */
function placeTightWebs(st: TileStore, rng: RNG, x: number, y: number): boolean {
  rng.int(0, 1); // preferSmall
  const variation = rng.int(0, 2);
  if (!solidTile(st, x, y - 1)) return false;
  if (!st.inBounds(x, y) || st.flags[st.idx(x, y)]) return false;
  if (!st.inBounds(x, y + 1) || st.flags[st.idx(x, y + 1)]) return false;
  const fx = 108 + variation * 18;
  st.setTileSilent(x, y, DECO165, fx, 0);
  st.setTileSilent(x, y + 1, DECO165, fx, 18);
  return true;
}

/** PlaceTile(187, style) 近似：3×2 覆饰，底行=air 格 y、顶行 y-1（fx=style*54 单行，Tiles_187 1890×72 实证） */
function placeDeco187(st: TileStore, x: number, y: number, style: number): boolean {
  for (let k = 0; k < 3; k++) {
    for (let l = -1; l < 1; l++) {
      if (!st.inBounds(x + k, y + l) || st.flags[st.idx(x + k, y + l)]) return false;
    }
  }
  for (let k = 0; k < 3; k++) {
    for (let l = -1; l < 1; l++) {
      st.setTileSilent(x + k, y + l, DECO187, style * 54 + k * 18, (l + 1) * 18);
    }
  }
  return true;
}

/** PlaceSmallPile（L?）1:1：size0=1×1（fx=style*18）；size1=2×1（fx=style*36，fy=18） */
function placeSmallPile(st: TileStore, x: number, y: number, pileStyle: number, pileSize: number): boolean {
  if (pileSize === 1) {
    if (!solidTile(st, x, y + 1) || !solidTile(st, x + 1, y + 1)) return false;
    if (!st.inBounds(x, y) || st.flags[st.idx(x, y)]) return false;
    if (!st.inBounds(x + 1, y) || st.flags[st.idx(x + 1, y)]) return false;
    st.setTileSilent(x, y, SMALL185, pileStyle * 36, 18);
    st.setTileSilent(x + 1, y, SMALL185, pileStyle * 36 + 18, 18);
    return true;
  }
  if (!solidTile(st, x, y + 1)) return false;
  if (!st.inBounds(x, y) || st.flags[st.idx(x, y)]) return false;
  st.setTileSilent(x, y, SMALL185, pileStyle * 18, 0);
  return true;
}

/** Spread.Spider（L3653）1:1：波前 BFS 逐层扩散。
 *  每格：地狱线/地表线随机带（Next(5)×2）双重拦截；实心或已有墙 → 实心且无墙时背面刷 62 后止步；
 *  空格无墙 → 刷 62+清液体+内饰（地面 1/3：1/15 蛛网宝箱(939/箱型15)否则蛛网罐 style19-20；
 *  天花板 1/3 垂网 165；否则地面放覆饰 187 style9-13 + 1/3 小堆 185×2） */
function spreadSpider(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink, x: number, y: number): void {
  const seen = new Set<number>();
  const key = (px: number, py: number) => px * 100000 + py;
  let frontier: Array<[number, number]> = [[x, y]];
  const DIRS: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while (frontier.length) {
    const layer = frontier;
    frontier = [];
    for (const [cx, cy] of layer) {
      if (cx < 1 || cx >= st.w - 1 || cy < 1 || cy >= st.h - 1) continue;
      if (cy >= gs.lavaLine - rng.int(0, 4)) continue; // UnderworldLayer(h-200) - Next(5)
      if (cy < gs.worldSurface + rng.int(0, 4)) continue;
      seen.add(key(cx, cy));
      const i = st.idx(cx, cy);
      if (solidTile(st, cx, cy) || !treatAsNoWall(st.wall[i])) {
        if (st.flags[i] && treatAsNoWall(st.wall[i])) st.wall[i] = 62;
        continue;
      }
      st.wall[i] = 62;
      if (!st.flags[i]) {
        st.liquid[i] = 0; st.liquidType[i] = 0;
        if (solidTile(st, cx, cy + 1) && rng.int(0, 2) === 0) {
          if (rng.int(0, 14) === 0) {
            placeBuriedChest(st, rng, gs, chests, cx, cy, { style: 15, loot: 'vi_939_web_slinger' });
          } else {
            placePot(st, rng, cx, cy, rng.int(19, 20));
          }
        }
        if (!st.flags[i]) {
          if (solidTile(st, cx, cy - 1) && rng.int(0, 2) === 0) {
            placeTightWebs(st, rng, cx, cy);
          } else if (solidTile(st, cx, cy + 1)) {
            placeDeco187(st, cx, cy, 9 + rng.int(0, 4));
            if (rng.int(0, 2) === 0) {
              if (!st.flags[i]) placeSmallPile(st, cx, cy, 34 + rng.int(0, 3), 1);
              if (!st.flags[i]) placeSmallPile(st, cx, cy, 48 + rng.int(0, 5), 0);
            }
          }
        }
      }
      for (const [dx, dy] of DIRS) {
        if (!seen.has(key(cx + dx, cy + dy))) frontier.push([cx + dx, cy + dy]);
      }
    }
  }
}

/** SpiderCaves pass（L17455）1:1：w*0.005 个巢；采样 x∈[200,w-200) y∈[(ws+rock)/2,h-230)；
 *  countTiles 门 500≤空腔<3500（重试上限 w/2，超限放弃该巢） */
export function runSpiderNestPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const count = Math.floor(st.w * 0.005);
  const retryCap = Math.floor(st.w / 2);
  const yMin = Math.floor((gs.worldSurface + gs.rockLevel) / 2);
  for (let n = 0; n < count; n++) {
    let x = rng.int(200, st.w - 201);
    let y = rng.int(yMin, st.h - 231);
    let c = countTiles(st, x, y);
    let tries = 0;
    while ((c.count >= MAX_TILE_COUNT || c.count < 500) && tries < retryCap) {
      tries++;
      x = rng.int(200, st.w - 201);
      y = rng.int(yMin, st.h - 231);
      c = countTiles(st, x, y);
      if (c.shroom > 1) c.count = 0;
    }
    if (tries < retryCap) spreadSpider(st, rng, gs, chests, x, y);
  }
}

/** WebsInSpiderCavesAndHoney pass（L20140）1:1：
 *  墙86 蜂巢腔 → 液体转蜂蜜 + 1/3 钟乳石(165)；墙62 蜘蛛巢 → 清液体 +
 *  空格 9/10 放蛛网 51（±2-4 内有实心才放） */
export function runWebsInSpiderCavesPass(st: TileStore, rng: RNG, gs: GenState): void {
  for (let i = 100; i < st.w - 100; i++) {
    for (let j = Math.floor(gs.worldSurface); j < st.h - 100; j++) {
      const idx = st.idx(i, j);
      if (st.wall[idx] === 86) {
        if (st.liquid[idx] > 0) st.liquidType[idx] = 3; // honey
        if (rng.int(0, 2) === 0) {
          // PlaceTight(spiders:false) → PlaceUncheckedStalactite（cs:38373-38402）：
          // 帧按上方实心块类型分派——蜂巢腔内上方必是蜂巢块 225 → 蜂蜜滴单格
          // fx=162+变体×18（162/180/198）、fy=72。此前错用雪地冰锥帧(0..36, 双格 fy 0/18)
          // ——蜂巢里挂出一串冰锥的根因
          if (solidTile(st, i, j - 1) && st.inBounds(i, j) && !st.flags[st.idx(i, j)]
            && st.inBounds(i, j + 1) && !st.flags[st.idx(i, j + 1)]) {
            const fx = 162 + rng.int(0, 2) * 18;
            st.setTileSilent(i, j, DECO165, fx, 72);
          }
        }
      }
      if (st.wall[idx] === 62) {
        st.liquid[idx] = 0; st.liquidType[idx] = 0;
      }
      if (st.wall[idx] === 62 && !st.flags[idx] && rng.int(0, 9) !== 0) {
        const r = rng.int(2, 4);
        let nearSolid = false;
        for (let k = i - r; k <= i + r && !nearSolid; k++) {
          for (let l = j - r; l <= j + r; l++) {
            if (solidTile(st, k, l)) { nearSolid = true; break; }
          }
        }
        if (nearSolid) st.setTileSilent(i, j, COBWEB, 0, 0);
      }
    }
  }
}

/** Webs pass（L13659）1:1：w*h*0.0006 次天花板蛛网 runner（前 numMCaves 次锚定山洞口）。
 *  TileRunner(51, addTile:true, ±1 横速, -1 升速, 4-10 半径, 2-3 步) */
export function runWebsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const count = Math.floor(st.w * st.h * 0.0006);
  const numMCaves = gs.numMCaves ?? 0;
  for (let i = 0; i < count; i++) {
    let j = rng.int(20, st.w - 21);
    let num = rng.int(Math.floor(gs.worldSurfaceHigh), st.h - 21);
    if (i < numMCaves && gs.mCaveX && gs.mCaveY) {
      j = gs.mCaveX[i]; num = gs.mCaveY[i];
    }
    if (!st.inBounds(j, num) || st.flags[st.idx(j, num)]) continue;
    if (!(num > gs.worldSurface || st.wall[st.idx(j, num)] > 0)) continue;
    while (num > Math.floor(gs.worldSurfaceLow) && !st.flags[st.idx(j, num)]) num--;
    num++;
    const dir = rng.int(0, 1) === 0 ? -1 : 1;
    while (j > 10 && j < st.w - 10 && !st.flags[st.idx(j, num)]) j += dir;
    j -= dir;
    if (!st.inBounds(j, num)) continue;
    if (!(num > gs.worldSurface || st.wall[st.idx(j, num)] > 0)) continue;
    tileRunner(st, rng, gs, j, num, {
      strength: rng.int(4, 10), steps: rng.int(2, 3), type: COBWEB,
      addTile: true, speedX: dir, speedY: -1,
    });
  }
}
