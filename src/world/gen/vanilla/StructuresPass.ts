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
import { idsByVanillaSheet } from './TileRunner';
import { solidTile as _solidTileHB } from './HalfBrickPass';

const CLOUD = TILE_BY_KEY['v_189_cloud_block']!;
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


export function runFloatingIslandsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w } = st;
  // 原版 pass 21（L5552-5637）：岛数 = w*0.0008，另加 skyLakes（1 + w>8000 + w>6000）。
  // 前 islands 个 = CloudIsland，其余 = CloudLake；间距/中心避让为固定值（不缩放）
  const islands = Math.floor(w * 0.0008);
  let skyLakes = 1;
  if (w > 8000) skyLakes++;
  if (w > 6000) skyLakes++;
  const total = islands + skyLakes;
  const placed: number[] = [];
  let lakeIdx = 0;
  for (let n = 0; n < total; n++) {
    let x = 0, ok = false;
    for (let attempt = 0; attempt < 200 && !ok; attempt++) {
      // 原版（WorldGen.cs:13017-13028）：x = Next(0.1w, 0.9w)，仅 |x-w/2|<150 重掷。
      // 重掷带宽扩为 ±max(150, 0.05w)：与刷怪器 skyMob 中央带（NPC.cs:1290 段：
      // x<0.45w||x>0.55w 之外不判天空怪）完全重合——既 1:1 保留原版全域分布，
      // 又保证岛不落进"当地表刷僵尸/水母"的窄缝（曾误修成两侧 8%~42% 带，过度收窄）
      const band = Math.max(150, Math.floor(w * 0.05));
      x = rng.int(Math.floor(w * 0.1), Math.floor(w * 0.9) - 1);
      if (Math.abs(x - w / 2) < band) continue;
      ok = placed.every((px) => Math.abs(px - x) >= 180);
    }
    // 该列地表（原版从 y=200 起扫）
    let surf = 0;
    let found = false;
    for (let y = 200; y < gs.worldSurface; y++) {
      if (st.flags[st.idx(x, y)]) { surf = y; found = true; break; }
    }
    if (!found) continue;
    // 原版（cs:13072/13093）：y = Next(90, surf-100) 后 min(y, worldSurfaceLow-50)，无
    // 0.35 钳（曾有 y 钳把岛整体抬高，已删）——skyMob 由刷怪侧"露天高空"判定兜底。
    // 下限取 102 而非原版字面 90：岛的列顶游走最多再上漂 13 格（vy -0.44×29 步），
    // 岛树最高 29 格——90 下限时树冠可探进 y<60 深空（违反 sky-invariant 不变量；
    // 原版岛树是从岛体随机游走找点种植、不贴最高凸起，故 90 即可，此处按实测补偿）
    const y = Math.min(rng.int(102, Math.max(103, surf - 100)), gs.worldSurfaceLow - 50);
    const isLake = lakeIdx >= islands;
    if (isLake) cloudLake(st, rng, x, y);
    else cloudIsland(st, rng, x, y);
    placed.push(x);
    gs.floatingIslands.push({ x, y, style: 0, isLake });
    if (!isLake) lakeIdx++;
  }
}

/** 雨云凸包（CloudIsland L47484-47522 / CloudLake 尾段同构）：
 *  自 bbox 左+Next(5) 起，步进 Next(r, 1.5r)；每步从岛底向上找实心面，
 *  中心下移 Next(-3,4)，椭圆 r=Next(4,8)（纵压×2），1/4 雨云 196 其余云 189 */
function rainBumps(st: TileStore, rng: RNG, bx0: number, bx1: number, by0: number, by1: number): void {
  const RAIN = TILE_BY_KEY['v_196_rain_cloud_block']!;
  let r = rng.int(4, 7);
  for (let x = bx0 + rng.int(0, 4); x < bx1; x += rng.int(r, Math.floor(r * 1.5))) {
    let y = by1;
    while (y > 1 && !st.flags[st.idx(x, y)]) y--;
    const cy = y + rng.int(-3, 3);
    r = rng.int(4, 7);
    const mat = rng.int(0, 3) === 0 ? RAIN : CLOUD;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const tx = x + dx, ty = cy + dy;
        if (ty <= by0 || !st.inBounds(tx, ty)) continue;
        if (Math.hypot(dx, dy * 2) < r + rng.int(0, 1)) {
          const ti = st.idx(tx, ty);
          st.type[ti] = mat; st.flags[ti] = 1;
        }
      }
    }
  }
}

/** CloudLake（L47704）：天湖 = 纯云盘 + 雨云凸包（无土芯/无墙/无水池） */
function cloudLake(st: TileStore, rng: RNG, i: number, j: number): void {
  let num1 = rng.int(100, 149);
  let steps = rng.int(20, 29);
  let px = i + 0.0, py = j + 0.0;
  let vx = rng.int(-20, 20) * 0.2;
  while (vx > -2 && vx < 2) vx = rng.int(-20, 20) * 0.2;
  let vy = rng.int(-20, -11) * 0.02;
  let bx0 = i, bx1 = i, by0 = j, by1 = j;
  while (num1 > 0 && steps > 0) {
    num1 -= rng.int(0, 3);
    steps--;
    const x0 = Math.max(0, Math.floor(px - num1 * 0.5)), x1 = Math.min(st.w, Math.floor(px + num1 * 0.5));
    const y0 = Math.max(0, Math.floor(py - num1 * 0.5)), y1 = Math.min(st.h, Math.floor(py + num1 * 0.5));
    const r = num1 * rng.int(80, 119) * 0.01;
    let top = py + 1;
    for (let x = x0; x < x1; x++) {
      if (rng.next() < 0.5) top += rng.int(-1, 1);
      top = Math.max(py, Math.min(py + 2, top));
      for (let y = y0; y < y1; y++) {
        if (y <= top || !st.inBounds(x, y)) continue;
        if (Math.hypot(x - px, (y - py) * 3) < r * 0.4) {
          const ti = st.idx(x, y);
          st.type[ti] = CLOUD; st.flags[ti] = 1;
          bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x);
          by0 = Math.min(by0, y); by1 = Math.max(by1, y);
        }
      }
    }
    px += vx; py += vy;
    vx += rng.int(-20, 20) * 0.05;
    vx = Math.max(-1, Math.min(1, vx));
    vy = Math.max(-0.2, Math.min(0.2, vy));
  }
  if (bx1 > bx0) rainBumps(st, rng, bx0, bx1, by0, by1);
}

/** CloudIsland（1456 cs:78618）1:1：扁平云盘（材质 189 云，纵压 3 + 顶面游走）
 *  → 雨云凸包 → 土芯（80-95，只把云 189 换土 0）→ 土芯云盖（小云团盖在土面上）
 *  → 内部云墙 73 → 逐列水池（10% 凹坑 + 1/5 单格）→ 岛上方 0-3 团带水云 puff。
 *  旧版盘体误用雨云 196（IslandHouse 的 num9）→ 土芯的 type==189 判定恒假、
 *  整芯死代码；本版对齐 CloudIsland 本体的 num8=189。 */
function cloudIsland(st: TileStore, rng: RNG, i: number, j: number): void {
  let num1 = rng.int(100, 149);
  let steps = rng.int(20, 29);
  let px = i + 0.0, py = j + 0.0;
  let vx = rng.int(-20, 20) * 0.2;
  while (vx > -2 && vx < 2) vx = rng.int(-20, 20) * 0.2;
  let vy = rng.int(-20, -11) * 0.02;
  let bboxX0 = i, bboxX1 = i, bboxY0 = j, bboxY1 = j;
  while (num1 > 0 && steps > 0) {
    num1 -= rng.int(0, 3);
    steps--;
    const x0 = Math.max(0, Math.floor(px - num1 * 0.5)), x1 = Math.min(st.w, Math.floor(px + num1 * 0.5));
    const y0 = Math.max(0, Math.floor(py - num1 * 0.5)), y1 = Math.min(st.h, Math.floor(py + num1 * 0.5));
    const r = num1 * rng.int(80, 119) * 0.01;
    let top = py + 1; // 每列顶面游走(钳 [py, py+2])
    for (let x = x0; x < x1; x++) {
      if (rng.next() < 0.5) top += rng.int(-1, 1);
      top = Math.max(py, Math.min(py + 2, top));
      for (let y = y0; y < y1; y++) {
        if (y <= top || !st.inBounds(x, y)) continue;
        if (Math.hypot(x - px, (y - py) * 3) < r * 0.4) {
          const ti = st.idx(x, y);
          st.type[ti] = CLOUD;   // cs:78754 num8=189（雨云只在凸包/上方 puff 1/4-1/2 概率出现）
          st.flags[ti] = 1;
          bboxX0 = Math.min(bboxX0, x); bboxX1 = Math.max(bboxX1, x);
          bboxY0 = Math.min(bboxY0, y); bboxY1 = Math.max(bboxY1, y);
        }
      }
    }
    px += vx;
    py += vy;
    vx += rng.int(-20, 20) * 0.05;
    vx = Math.max(-1, Math.min(1, vx));
    vy = Math.max(-0.2, Math.min(0.2, vy));
  }
  if (bboxX1 <= bboxX0) return;
  // ---- 阶段2:雨云凸包（cs:78785-78828） ----
  rainBumps(st, rng, bboxX0, bboxX1, bboxY0, bboxY1);
  // ---- 阶段3:土芯(80-95,只把云 189 换土 0；起点 y=bbox 顶)----
  let dR = rng.int(80, 94);
  let dSteps = rng.int(10, 14);
  let dx0 = i + 0.0, dy0 = bboxY0 + 0.0;
  let dvx = rng.int(-20, 20) * 0.2;
  while (dvx > -2 && dvx < 2) dvx = rng.int(-20, 20) * 0.2;
  let dvy = rng.int(-20, -11) * 0.02;
  while (dR > 0 && dSteps > 0) {
    dR -= rng.int(0, 3);
    dSteps--;
    const x0 = Math.max(0, Math.floor(dx0 - dR * 0.5)), x1 = Math.min(st.w, Math.floor(dx0 + dR * 0.5));
    const y0 = Math.max(0, Math.floor(bboxY0 - 1)), y1 = Math.min(st.h, Math.floor(dy0 + dR * 0.5));
    const r = dR * rng.int(80, 119) * 0.01;
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        if (st.type[ti] === CLOUD && Math.hypot(x - dx0, (y - dy0) * 3) < r * 0.4) {
          st.type[ti] = T.DIRT;
        }
      }
    }
    dx0 += dvx;
    dy0 += dvy;
    dvx += rng.int(-20, 20) * 0.05;
    dvx = Math.max(-1, Math.min(1, dvx));
    dvy = Math.max(-0.2, Math.min(0.2, dvy));
  }
  // ---- 阶段4:土芯云盖（cs:78872-78914）：自岛底向上找首个活性土格，上方盖小云团 ----
  {
    let cx = bboxX0 + rng.int(0, 4);                 // num29 = num4 + Next(5)
    while (cx < bboxX1) {
      let cy = bboxY1;                                // 自岛底向上
      let guard = 0;
      while ((!st.inBounds(cx, cy) || !st.flags[st.idx(cx, cy)] || st.type[st.idx(cx, cy)] !== T.DIRT)
        && cx < bboxX1 && guard++ < 4000) {
        cy--;
        if (cy < bboxY0) { cy = bboxY1; cx += rng.int(1, 3); }   // Next(1,4)
      }
      if (cx >= bboxX1) break;
      cy += rng.int(0, 3);                            // Next(0,4)
      const cr = rng.int(2, 4);                       // Next(2,5)
      for (let x = cx - cr; x <= cx + cr; x++) {
        for (let y = cy - cr; y <= cy + cr; y++) {
          if (y <= bboxY0 || !st.inBounds(x, y)) continue;
          if (Math.hypot(x - cx, (y - cy) * 2) < cr) {
            // 原版只写 type 不激活（空气格成幽灵、活性云格换云）
            if (st.flags[st.idx(x, y)]) st.type[st.idx(x, y)] = CLOUD;
          }
        }
      }
      cx += rng.int(cr, Math.floor(cr * 1.5));
    }
  }
  // ---- 阶段5:内部云墙（cs:78915-78971：3×3 全活性 且 本格 wall∈{0,73} → wall 73）----
  for (let x = bboxX0 - 20; x <= bboxX1 + 20; x++) {
    for (let y = bboxY0 - 20; y <= bboxY1 + 20; y++) {
      let all = true;
      for (let ax = -1; ax <= 1 && all; ax++) {
        for (let ay = -1; ay <= 1; ay++) {
          if (!st.inBounds(x + ax, y + ay) || !st.flags[st.idx(x + ax, y + ay)]) { all = false; break; }
          const wl = st.wall[st.idx(x + ax, y + ay)];
          if (wl !== 0 && wl !== 73) { all = false; break; }
        }
      }
      if (all && st.inBounds(x, y)) st.wall[st.idx(x, y)] = 73;
    }
  }
  // ---- 阶段6:水池（cs:78973-79021：逐列；10% 凹坑(宽 1-2 深 3) + 1/5 单格 + 恒 liquidType）----
  const stayPut = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y + 1) || !st.inBounds(x - 1, y) || !st.inBounds(x + 1, y)) return false;
    const hold = (xx: number, yy: number) => {
      const k = st.idx(xx, yy);
      return (st.flags[k] && !!TILE_DEFS[st.type[k]]?.solid && !TILE_DEFS[st.type[k]]?.platform)
        || (st.liquid[k] === 255);
    };
    return hold(x, y + 1) && hold(x - 1, y) && hold(x + 1, y);
  };
  for (let x = bboxX0; x <= bboxX1; x++) {
    let y = bboxY0 - 10;                              // num42 自 num6-10 向下找首个活性
    let guard = 0;
    while (st.inBounds(x, y) && !st.flags[st.idx(x, y + 1)] && guard++ < 4000) y++;
    if (y >= bboxY1) continue;
    if (!st.inBounds(x, y + 1) || st.type[st.idx(x, y + 1)] !== CLOUD) continue;
    if (rng.int(0, 9) === 0) {                        // Next(10)==0 → 凹坑水池
      const w2 = rng.int(1, 2);                       // Next(1,3)
      for (let xx = x - w2; xx <= x + w2; xx++) {
        for (const yy of [y, y + 1]) {
          if (st.inBounds(xx, yy) && st.type[st.idx(xx, yy)] === CLOUD && stayPut(xx, yy)) {
            const k = st.idx(xx, yy);
            st.type[k] = 0; st.flags[k] = 0;
            st.liquid[k] = 255; st.liquidType[k] = 1;
          }
        }
        if (xx > x - w2 && xx < x + 2 && st.inBounds(xx, y + 2)
          && st.type[st.idx(xx, y + 2)] === CLOUD && stayPut(xx, y + 2)) {
          const k = st.idx(xx, y + 2);
          st.type[k] = 0; st.flags[k] = 0;
          st.liquid[k] = 255; st.liquidType[k] = 1;
        }
      }
    }
    if (rng.int(0, 4) === 0 && stayPut(x, y)) {       // Next(5)==0 → 单格满水
      st.liquid[st.idx(x, y)] = 255;
    }
    if (st.inBounds(x, y)) st.liquidType[st.idx(x, y)] = 1;   // 恒置水型
  }
  // ---- 阶段7:岛上方带水云 puff（cs:79023-79066：Next(4) 团,1/2 雨云,中心注水）----
  {
    const puffs = rng.int(0, 3);                      // genRand.Next(4)
    for (let n = 0; n <= puffs; n++) {
      const cx = rng.int(bboxX0 - 5, bboxX1 + 4);     // Next(num4-5, num5+5)
      const cy = bboxY0 - rng.int(20, 39);            // num6 - Next(20,40)
      const cr = rng.int(4, 7);                       // Next(4,8)
      const mat = rng.int(0, 1) === 0 ? RAIN_CLOUD : CLOUD;   // Next(2)==0 → 196
      for (let x = cx - cr; x <= cx + cr; x++) {
        for (let y = cy - cr; y <= cy + cr; y++) {
          if (!st.inBounds(x, y)) continue;
          if (Math.hypot(x - cx, (y - cy) * 2) < cr + rng.int(-1, 1)) {   // num49 + Next(-1,2)
            const k = st.idx(x, y);
            st.type[k] = mat; st.flags[k] = 1;
          }
        }
      }
      for (let x = cx - cr + 2; x <= cx + cr - 2; x++) {   // 中心注水
        let y = cy - cr;
        let guard = 0;
        while (st.inBounds(x, y) && !st.flags[st.idx(x, y)] && guard++ < 200) y++;
        if (st.inBounds(x, y) && stayPut(x, y)) {
          const k = st.idx(x, y);
          st.type[k] = 0; st.flags[k] = 0;
          st.liquid[k] = 255; st.liquidType[k] = 1;
        }
      }
    }
  }
}

/** 生命水晶(pass 57):area×2e-5,岩层空腔地面 */
export function runLifeCrystalsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const yMin = Math.floor((gs.worldSurface * 2 + gs.rockLevel) / 3);
  const count = Math.floor(w * h * 0.00002);
  let placed = 0;
  for (let n = 0; n < count * 30 && placed < count; n++) {
    const x = rng.int(40, w - 41);
    const y = rng.int(yMin, Math.max(yMin + 1, h - 300));
    if (!st.inBounds(x, y + 1) || !st.inBounds(x + 1, y + 1)) continue;
    // 2×2 净空 + 下方实心
    let clear = true;
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        if (st.flags[st.idx(x + dx, y - dy)]) { clear = false; break; }
      }
    }
    if (!clear || !st.isSolid(x, y + 1) || !st.isSolid(x + 1, y + 1)) continue;
    // 原版 AddLifeCrystal(cs:16023-16038):顶行 frameY=0、底行 18
    st.setTileSilent(x, y - 1, HEART, 0, 0);
    st.setTileSilent(x + 1, y - 1, HEART, 18, 0);
    st.setTileSilent(x, y, HEART, 0, 18);
    st.setTileSilent(x + 1, y, HEART, 18, 18);
    placed++;
  }
}

/** 地表装饰:按生物群系种树/仙人掌/藤蔓/蘑菇(原版 pass 60+ 系列简化) */
export function runSurfaceDecorPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const isSoft = (t: number) => t === T.TALLGRASS || t === T.FLOWER || t === T.MUSHROOM || t === VINE;
  const ud = gs.undergroundDesert;
  const inDesert = (x: number) => !!ud && x >= ud.x0 && x <= ud.x1;
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
      // ---- 仙人掌(沙漠沙/邪恶沙面)----
      if ((ground === T.SAND || ground === EBONSAND || ground === CRIMSAND) && inDesert(x)
        && !st.flags[st.idx(x, sy - 1)] && rng.next() < 0.12) {
        const ch = rng.int(2, 5);
        let ok = true;
        for (let dy = 1; dy <= ch; dy++) if (st.flags[st.idx(x, sy - dy)]) { ok = false; break; }
        if (ok) {
          for (let dy = 1; dy <= ch; dy++) st.setTileSilent(x, sy - dy, CACTUS, 0, 0);
          x += rng.int(4, 9);
          sinceLast = 0;
          continue;
        }
      }
      // ---- 杂草/花/蘑菇 ----(藤蔓在下方统一扫描)
      // ---- 杂草/花/蘑菇 ----
      if (!st.flags[st.idx(x, sy - 1)] && (ground === T.GRASS || ground === JUNGLE_GRASS || ground === T.SNOW)) {
        const r = rng.next();
        if (r < 0.3) st.setTileSilent(x, sy - 1, T.TALLGRASS, [0, 18, 36, 54, 72, 90][rng.int(0, 5)], 0);
        else if (r < 0.42) st.setTileSilent(x, sy - 1, T.FLOWER, [108, 126, 162, 180, 216, 252, 342, 540, 594][rng.int(0, 8)], 0);
        else if (r < 0.45 && ground !== T.SNOW) st.setTileSilent(x, sy - 1, T.MUSHROOM, 144, 0);
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
const TORCH = TILE_BY_KEY['torch']!;
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
    // dungeonSide<Right 时须 num ≤ dungeonX-0.15w（任一不过即拒）
    const band = st.w * 0.15;
    if (!(gs.dungeonSide > -1 || !(num < gs.dungeonLocation + band))) continue;
    if (!(gs.dungeonSide < 1 || !(num > gs.dungeonLocation - band))) continue;
    let k = cand.y;
    while (k < st.h && st.inBounds(num, k) && !st.flags[st.idx(num, k)]) k++;
    if (k >= gs.worldSurface) continue;
    if (st.type[st.idx(num, k)] !== SAND) continue;   // cs:15455 沙列门禁
    // 与全部先序候选（PyrX[0..idx-1]）取最小距，须 ≥220（cs:15460-15472）
    let minDist = st.w;
    for (let l = 0; l < idx; l++) minDist = Math.min(minDist, Math.abs(num - gs.pyramidSpots[l].x));
    if (minDist >= 220) {
      k--;
      pyramid(st, rng, gs, chests, num, k, 75, 125, false);
      accepted.push({ x: num, y: k });
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
  // 入口掏空（cs:27903-27924）：自沙面斜向下切阶梯
  while (flag2) {
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
  while (flag2) {
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
        placeBuriedChest(st, rng, gs, chests, Math.floor((num23 + num24) / 2), num10, {
          style: 1, loot: lootKey,
        });
        const num26 = rng.int(1, 9);                    // Next(1,10)
        for (let n27 = 0; n27 < num26; n27++) {
          const i2 = rng.int(num23, num24);
          const j2 = num10 + num11;
          placeSmallPile(st, i2, j2, rng.int(16, 18), 1);   // Next(16,19)
        }
        placeTorch(st, num23 + 2, num10 - num17 + num11 + 1, rng.int(4, 6));   // Next(4,7)
        placeTorch(st, num23 + 3, num10 - num17 + num11, rng.int(4, 6));
        placeTorch(st, num24 - 2, num10 - num17 + num11 + 1, rng.int(4, 6));
        placeTorch(st, num24 - 3, num10 - num17 + num11, rng.int(4, 6));
        for (let n28 = num23; n28 <= num24; n28++) {
          placePotRow(st, rng, n28, num10 + num11, rng.int(25, 27));   // Next(25,28)
        }
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
    const lo = num9 - num32 - rng.int(0, 1);            // Next(0,2) 循环头各掷一次
    const hi = num9 + num31 + num32 + rng.int(0, 1);
    for (let n33 = lo; n33 <= hi; n33++) {
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

/** PlaceTile(91, style)（火把）：frameX=22*style */
function placeTorch(st: TileStore, x: number, y: number, style: number): void {
  if (!st.inBounds(x, y)) return;
  st.setTileSilent(x, y, TORCH, style * 22, 0);
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
