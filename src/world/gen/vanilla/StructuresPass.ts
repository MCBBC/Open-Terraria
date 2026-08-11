// 阶段 4 结构 pass:
// - FloatingIslands(pass 19,L5552 + CloudIsland L47397 简化):云岛(云 189 壳 + 土芯 + 草皮)
// - LifeCrystals(pass 55,L7828):area×2e-5 个生命水晶(岩层空腔地上)
// - HellHouses 已由 HellFortPass.runHellFortPass 取代
// - SurfaceDecor:生物群系感知地表(丛林/雪原树密度、沙漠仙人掌、丛林藤蔓/蘑菇)
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';
import { ITEM_BY_KEY } from '../../../data/items';
import { digTunnel } from './TileRunner';

const CLOUD = TILE_BY_KEY['v_189_cloud_block']!;
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

/** CloudIsland(L47397)核心移植:扁平云盘(纵压3+顶面游走)→雨云凸包→
 * 土芯只嵌云内 → 内部云墙 73 → 10% 水池。岛屋由独立 pass 处理。 */
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
          st.type[ti] = CLOUD;
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
  // ---- 阶段2:雨云凸包（L47484-47522） ----
  rainBumps(st, rng, bboxX0, bboxX1, bboxY0, bboxY1);
  // ---- 阶段3:土芯(80-95,只把云换土)----
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
    const y0 = Math.max(0, Math.floor(dy0 - dR * 0.5)), y1 = Math.min(st.h, Math.floor(dy0 + dR * 0.5));
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
  // ---- 阶段5:内部云墙(3×3 全包裹 → wall 73)----
  for (let x = bboxX0; x <= bboxX1; x++) {
    for (let y = bboxY0; y <= bboxY1; y++) {
      let all = true;
      for (let ax = -1; ax <= 1 && all; ax++) {
        for (let ay = -1; ay <= 1; ay++) {
          if (!st.inBounds(x + ax, y + ay) || !st.flags[st.idx(x + ax, y + ay)]) { all = false; break; }
        }
      }
      if (all) st.wall[st.idx(x, y)] = 73;
    }
  }
  // ---- 阶段6:水池(每列 10% 在云顶凹处放水)----
  for (let x = bboxX0 + 2; x < bboxX1 - 2; x++) {
    if (rng.next() >= 0.1) continue;
    let y = Math.max(1, bboxY0 - 10);
    while (y < st.h - 1 && !st.flags[st.idx(x, y)]) y++;
    const below = st.idx(x, y + 1);
    if (y < bboxY1 && st.type[below] === CLOUD) {
      const ti = st.idx(x, y);
      st.type[ti] = 0; st.flags[ti] = 0;
      st.liquid[ti] = 255; st.liquidType[ti] = 1;
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
const CHEST = TILE_BY_KEY['chest']!;

/** 金字塔(pass 38 Pyramids 简化)：候选来自 DunesPass.runDunesPass（原版 DunesAndPyramidLocations
 *  WorldGen.cs:11570-11599 → GenVars.PyrX/PyrY，此处 = gs.pyramidSpots）；
 *  Pyramids pass(cs:15426-15489)再校验：x∈(300,w-300)、自 PyrY 下扫首个实心格 < worldSurface
 *  且为沙(cs:15455)、与既有金字塔距 ≥220(cs:15466)。gs.pyramidSpots 为空时回退旧自掷候选。 */
export function runPyramidPass(
  st: TileStore, rng: RNG, gs: GenState,
  chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>,
): void {
  const SAND = TILE_BY_KEY['sand'] ?? 0;
  let spots: Array<{ x: number; y: number }> = [];
  if (gs.pyramidSpots.length > 0) {
    // cs:15446-15489 消费 PyrX/PyrY：自候选 y 下扫到首个实心格，须在 worldSurface 上且为沙
    for (const cand of gs.pyramidSpots) {
      if (cand.x <= 300 || cand.x >= st.w - 300) continue;
      if (spots.some((s) => Math.abs(s.x - cand.x) < 220)) continue; // cs:15466 间距 ≥220
      let y = cand.y;
      while (y < gs.worldSurface && !(st.inBounds(cand.x, y) && st.flags[st.idx(cand.x, y)])) y++;
      if (y >= gs.worldSurface) continue;
      if (st.type[st.idx(cand.x, y)] !== SAND) continue; // cs:15455 沙列门禁
      spots.push({ x: cand.x, y: y - 1 }); // cs:15470 k--
    }
  } else {
    // 回退：旧自掷候选（沙丘 pass 未产出时的兜底，非原版路径）
    const van = st.w / 4200;
    for (let tries = 0; tries < 200 && spots.length < 2; tries++) {
      const ox = rng.int(500, st.w - 501);
      if (Math.abs(ox - gs.jungleX) < Math.floor(600 * van)) continue;
      if (Math.abs(ox - st.w / 2) < 300) continue;
      if (ox > gs.snowOriginLeft - 300 && ox < gs.snowOriginRight + 300) continue;
      const px = ox + (rng.next() < 0.5 ? -1 : 1) * rng.int(0, 200);
      let surf = -1;
      for (let y = 0; y < gs.worldSurface; y++) {
        if (st.flags[st.idx(px, y)]) { surf = y; break; }
      }
      if (surf < 0 || st.type[st.idx(px, surf)] !== SAND) continue;
      if (spots.some((s) => Math.abs(s.x - px) < 220)) continue;
      spots.push({ x: px, y: surf + 20 });
    }
  }
  for (const spot of spots) {
    const size = rng.int(14, 20); // 半宽
    const baseY = Math.min(st.h - 260, spot.y + rng.int(60, 90));
    if (spot.x < size + 5 || spot.x > st.w - size - 5) continue;
    // 金字塔主体(逐层收窄)
    for (let layer = 0; layer < size; layer++) {
      const halfW = size - layer;
      for (let x = spot.x - halfW; x <= spot.x + halfW; x++) {
        for (let y = baseY - layer; y <= baseY - layer; y++) {
          const i = st.idx(x, y);
          st.type[i] = SANDSTONE_BRICK; st.flags[i] = 1;
          st.wall[i] = 34; // SandstoneBrickUnsafe
        }
      }
    }
    // 内腔(倒阶梯掏空)
    for (let layer = 2; layer < size - 2; layer++) {
      const halfW = size - layer - 2;
      for (let x = spot.x - halfW; x <= spot.x + halfW; x++) {
        const i = st.idx(x, baseY - layer);
        st.type[i] = 0; st.flags[i] = 0;
      }
    }
    // 宝箱(内腔底部,cs L12417-12426):style1 金箱,战利品三选一
    // (857 沙暴瓶/848 法老面具/934 飞毯)
    const bx = spot.x, by = baseY - 2;
    st.setTileSilent(bx, by, CHEST, 1 * 36, 0);
    st.setTileSilent(bx + 1, by, CHEST, 1 * 36 + 18, 0);
    st.setTileSilent(bx, by + 1, CHEST, 1 * 36, 18);
    st.setTileSilent(bx + 1, by + 1, CHEST, 1 * 36 + 18, 18);
    const lootKeys = ['vi_857_sandstorm_in_a_bottle', 'vi_848_PharaohsMask', 'vi_934_FlyingCarpet'];
    const lootId = ITEM_BY_KEY[lootKeys[rng.int(0, 2)]];
    chests.push({
      x: bx, y: by,
      items: lootId !== undefined ? [{ id: lootId, stack: 1 }, ...Array(9).fill(null)] : Array(10).fill(null),
    });
  }
}

/** Wet Jungle(pass 43 简化):从丛林草 tile 起挖湿隧道(灌水) */
export function runWetJunglePass(st: TileStore, rng: RNG, gs: GenState): void {
  const core = (gs as any).jungleCoreX ?? gs.jungleX;
  const JG = JUNGLE_GRASS;
  const tunnels = Math.max(4, Math.floor(st.w / 500)); // C# (int)
  let dug = 0;
  for (let n = 0; n < tunnels * 60 && dug < tunnels; n++) {
    const x = core + rng.int(-Math.floor(st.w * 0.12), Math.floor(st.w * 0.12));
    const y = rng.int(gs.rockLevel, Math.max(gs.rockLevel + 1, st.h - 500));
    if (!st.inBounds(x, y) || st.type[st.idx(x, y)] !== JG || !st.flags[st.idx(x, y)]) continue;
    const dx = rng.int(-100, 100) * 0.01, dy = rng.int(-100, 100) * 0.01;
    digTunnel(st, rng, x, y, dx, dy, rng.int(30, 120), rng.int(3, 6), true);
    dug++;
  }
}


