// 阶段 4 结构 pass:
// - FloatingIslands(pass 19,L5552 + CloudIsland L47397 简化):云岛(云 189 壳 + 土芯 + 草皮)
// - LifeCrystals(pass 55,L7828):area×2e-5 个生命水晶(岩层空腔地上)
// - HellHouses(L16085 AddHellHouses 简化):地狱中段黑曜石砖屋
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
const OBSIDIAN_BRICK = TILE_BY_KEY['v_75_obsidian_brick']!;
const HELL_BRICK = TILE_BY_KEY['v_76_obsidian_brick'] ?? OBSIDIAN_BRICK;

/** 浮空岛:数量 w×0.0008,避开中部 ±150(缩放)与其他岛 ±180 */
export function runFloatingIslandsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const van = w / 4200;
  const count = Math.max(1, Math.floor(w * 0.0008));
  const placed: number[] = [];
  for (let n = 0; n < count; n++) {
    let x = 0, ok = false;
    for (let attempt = 0; attempt < 200 && !ok; attempt++) {
      x = rng.int(Math.floor(w * 0.1), Math.floor(w * 0.9) - 1);
      while (x > w / 2 - 150 * Math.max(0.4, van) && x < w / 2 + 150 * Math.max(0.4, van)) {
        x = rng.int(Math.floor(w * 0.1), Math.floor(w * 0.9) - 1);
      }
      ok = placed.every((px) => Math.abs(px - x) >= 180 * Math.max(0.4, van));
    }
    // 该列地表
    let surf = 0;
    let found = false;
    for (let y = Math.floor(200 * Math.max(0.3, van)); y < gs.worldSurface; y++) {
      if (st.flags[st.idx(x, y)]) { surf = y; found = true; break; }
    }
    if (!found) continue;
    const y = Math.min(rng.int(90, Math.max(91, surf - 100)), gs.worldSurfaceLow - 50);
    cloudIsland(st, rng, x, y);
    placed.push(x);
    gs.floatingIslands.push({ x, y, style: 0, isLake: false });
  }
}

/** CloudIsland(L47397)七阶段移植(核心部分):扁平云盘(纵压3+顶面游走)→
 * 土芯只嵌云内 → 内部云墙 73 → 10% 水池。岛屋由独立 pass 处理(暂缺)。 */
function cloudIsland(st: TileStore, rng: RNG, i: number, j: number): void {
  const CLOUD = TILE_BY_KEY['v_189_cloud_block']!;
  // ---- 阶段1:云壳(随机走椭圆,纵压 3,顶面 ±1 游走)----
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
        if (y <= top) continue;
        if (!st.inBounds(x, y)) continue;
        if (Math.hypot(x - px, (y - py) * 3) < r * 0.4) {
          const ti = st.idx(x, y);
          st.type[ti] = CLOUD; st.flags[ti] = 1;
          bboxX0 = Math.min(bboxX0, x); bboxX1 = Math.max(bboxX1, x);
          bboxY0 = Math.min(bboxY0, y); bboxY1 = Math.max(bboxY1, y);
        }
      }
    }
    px += vx; py += vy;
    vx += rng.int(-20, 20) * 0.05;
    vx = Math.max(-1, Math.min(1, vx));
    vy = Math.max(-0.2, Math.min(0.2, vy));
  }
  if (bboxX1 <= bboxX0) return;
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
    dx0 += dvx; dy0 += dvy;
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

/** 生命水晶(pass 55):area×2e-5,岩层空腔地面 */
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
    // 原版 AddLifeCrystal(cs:16023-16038):顶行 frameY=0、底行 18(此前写反致贴图上下颠倒)
    st.setTileSilent(x, y - 1, HEART, 0, 0);
    st.setTileSilent(x + 1, y - 1, HEART, 18, 0);
    st.setTileSilent(x, y, HEART, 0, 18);
    st.setTileSilent(x + 1, y, HEART, 18, 18);
    placed++;
  }
}

/** 地狱屋(L16085 简化):地狱中段黑曜石砖小屋(空心 + 砖墙背景) */
export function runHellHousesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const hellTop = h - 200; // 地狱层顶部(Underworld 边界 h-190..h-160)
  if (hellTop >= h - 60) return;
  const count = Math.max(2, Math.round(w / 4200 * 6));
  for (let n = 0; n < count; n++) {
    const hx = rng.int(Math.floor(w * 0.15), Math.floor(w * 0.85) - 14);
    const hy = rng.int(hellTop + 20, h - 90);
    const rw = rng.int(10, 16), rh = rng.int(5, 7);
    // 空心 + 墙
    for (let x = hx; x < hx + rw; x++) {
      for (let y = hy; y < hy + rh; y++) {
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        st.type[i] = 0; st.flags[i] = 0;
        st.wall[i] = 14; // HellstoneBrickUnsafe
      }
    }
    // 砖壳
    for (let x = hx - 1; x <= hx + rw; x++) {
      for (let y = hy - 1; y <= hy + rh; y++) {
        if (!st.inBounds(x, y)) continue;
        const border = x === hx - 1 || x === hx + rw || y === hy - 1 || y === hy + rh;
        if (border) {
          const i = st.idx(x, y);
          st.type[i] = rng.next() < 0.8 ? OBSIDIAN_BRICK : HELL_BRICK;
          st.flags[i] = 1;
          st.liquid[i] = 0;
        }
      }
    }
    // 开口(左右各去 2 砖)
    for (let y = hy + rh - 3; y <= hy + rh; y++) {
      for (const dx of [hx - 1, hx + rw]) {
        if (st.inBounds(dx, y)) {
          const i = st.idx(dx, y);
          st.type[i] = 0; st.flags[i] = 0;
        }
      }
    }
    // 灰烬基座(原版房屋坐落在地狱灰烬地表上,我们补一座墩)
    const ash = T.ASH;
    for (let x = hx - 1; x <= hx + rw; x++) {
      for (let y = hy + rh + 1; y < Math.min(st.h, hy + rh + 30); y++) {
        const i = st.idx(x, y);
        if (st.flags[i]) break;
        st.type[i] = ash; st.flags[i] = 1;
      }
    }
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
      // ---- 树(草/丛林草/雪)----
      if ((ground === T.GRASS || ground === JUNGLE_GRASS || ground === T.SNOW)
        && (!st.flags[st.idx(x, sy - 1)] || isSoft(st.type[st.idx(x, sy - 1)]))) {
        const jungle = ground === JUNGLE_GRASS;
        const th = jungle ? rng.int(8, 16) : rng.int(7, 14);
        let ok = true;
        for (let dy = 1; dy <= th; dy++) {
          if (st.flags[st.idx(x, sy - dy)] && !(dy === 1 && isSoft(st.type[st.idx(x, sy - dy)]))) { ok = false; break; }
        }
        const range = relaxed ? 1 : 2;
        for (let dx = -range; dx <= range && ok; dx++) {
          if ((st.flags[st.idx(x + dx, sy - 1)] && !isSoft(st.type[st.idx(x + dx, sy - 1)]))
            || !st.flags[st.idx(x + dx, sy)]) { ok = false; break; }
        }
        if (ok) {
          if (isSoft(st.type[st.idx(x, sy - 1)])) st.setTileSilent(x, sy - 1, 0);
          for (let dy = 1; dy <= th; dy++) {
            st.setTileSilent(x, sy - dy, T.TREE, dy === th ? 22 : 0, dy === th ? 198 : 0);
          }
          const maxBranches = rng.int(2, 4);
          let branchCount = 0;
          for (let dy = 2; dy <= th - 3 && branchCount < maxBranches; dy++) {
            for (const side of [-1, 1]) {
              if (branchCount >= maxBranches) break;
              if (rng.int(0, 99) >= 40) continue;
              const bx = x + side, by = sy - dy;
              if ((!st.flags[st.idx(bx, by)] || isSoft(st.type[st.idx(bx, by)])) && st.type[st.idx(bx, by + 1)] !== T.TREE) {
                st.setTileSilent(bx, by, T.TREE, side < 0 ? 44 : 66, 198);
                branchCount++;
              }
            }
          }
          x += jungle ? rng.int(5, 10) : rng.int(6, 14);
          sinceLast = 0;
          continue;
        }
      }
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

/** 金字塔(pass 38 Pyramids 简化):gs.pyramidSpots 候选 → 地下沙岩砖金字塔 + 宝箱 */
export function runPyramidPass(
  st: TileStore, rng: RNG, gs: GenState,
  chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>,
): void {
  for (const spot of gs.pyramidSpots.slice(0, 2)) {
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
  const tunnels = Math.max(4, Math.round(st.w / 500));
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

const HIVE = TILE_BY_KEY['v_225_hive_block']!;
const HONEY = TILE_BY_KEY['v_229_honey_block']!;
const COBWEB = TILE_BY_KEY['v_51_cobweb']!;

