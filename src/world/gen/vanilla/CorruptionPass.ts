// 原版 pass 28 "Corruption"(WorldGen.cs:6059)移植。
// 腐化:ChasmRunner 裂隙(黑檀石 25 壳 + 暗影之球 31 style0 + 恶魔祭坛 26 style0);
// 猩红:CrimStart 弹坑隧道(猩红石 203 墙 83 + 恶魔之心 31 style1 + 祭坛 style1)。
// 区域避开:出生点±200、地下沙漠、地牢±100、丛林/雪原带(±10 收缩)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';

const EBONSTONE = TILE_BY_KEY['v_25_ebonstone_block']!;
const CORRUPT_GRASS = TILE_BY_KEY['v_23_corrupt_grass_block']!;
const EBONSAND = TILE_BY_KEY['v_112_ebonsand_block']!;
const CRIMSTONE = TILE_BY_KEY['v_203_crimstone_block']!;
const CRIMSON_GRASS = TILE_BY_KEY['v_199_crimson_grass_block']!;
const CRIMSAND = TILE_BY_KEY['v_234_crimsand_block']!;
const CORRUPT_HARDSAND = TILE_BY_KEY['v_398_corrupt_hardened_sand_block']!;
const CRIMSON_HARDSAND = TILE_BY_KEY['v_399_crimson_hardened_sand_block']!;
const ICE = TILE_BY_KEY['ice']!;
const MUD = TILE_BY_KEY['mud']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const SNOW = TILE_BY_KEY['snow']!;
const ALTAR = TILE_BY_KEY['v_26_altars']!;
const ORB = TILE_BY_KEY['v_31_orb_heart']!;
const SANDSTONE = TILE_BY_KEY['sandstone']!;
const HARDSAND = TILE_BY_KEY['hardened_sand']!;

export function runCorruptionPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const van = w / 4200;
  // 丛林/雪原横向范围(±10 回避)
  let jMin = w, jMax = 0, sMin = w, sMax = 0;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < gs.worldSurface; y++) {
      if (!st.flags[st.idx(x, y)]) continue;
      const t = st.type[st.idx(x, y)];
      if (t === JUNGLE_GRASS) { jMin = Math.min(jMin, x); jMax = Math.max(jMax, x); }
      else if (t === SNOW || t === ICE) { sMin = Math.min(sMin, x); sMax = Math.max(sMax, x); }
    }
  }
  const avoid = 10;
  const jLo = jMin - avoid, jHi = jMax + avoid, sLo = sMin - avoid, sHi = sMax + avoid;
  // 原版全部为固定常数(cs:4720-4731/6092-6095):beachAvoidance=275+5+40+60=380、
  // minCenter=500、中央回避=200、地牢回避=100、midFixer=50
  const beachAvoid = 380;
  const minCenter = 500;
  const midAvoid = 200;
  const dungeonAvoid = 100;
  const midFixer = 50;
  const groups = Math.max(1, Math.floor(w * 0.00045));

  for (let g = 0; g < groups; g++) {
    let jnLo = jLo, jnHi = jHi, snLo = sLo, snHi = sHi;
    let cx = 0, zLo = 0, zHi = 0;
    // 拒绝采样区域
    let ok = false;
    for (let attempt = 0; attempt < 4000 && !ok; attempt++) {
      ok = true;
      cx = rng.int(minCenter, w - 1 - minCenter);
      zLo = cx - rng.int(0, 199) - 100;
      zHi = cx + rng.int(0, 199) + 100;
      if (zLo < beachAvoid) zLo = beachAvoid;
      if (zHi > w - beachAvoid) zHi = w - beachAvoid;
      if (cx < zLo + midFixer) cx = zLo + midFixer;
      if (cx > zHi - midFixer) cx = zHi - midFixer;
      if (gs.dungeonSide < 0 && zLo < 400) zLo = 400;
      else if (gs.dungeonSide > 0 && zLo > w - 400) zLo = w - 400;
      const mid = w / 2;
      if (Math.abs(cx - mid) < midAvoid || Math.abs(zLo - mid) < midAvoid || Math.abs(zHi - mid) < midAvoid) ok = false;
      const ud = gs.undergroundDesert;
      if (ud && ((cx > ud.x0 && cx < ud.x1) || (zLo > ud.x0 && zLo < ud.x1) || (zHi > ud.x0 && zHi < ud.x1))) ok = false;
      if (zLo < gs.dungeonLocation + dungeonAvoid && zHi > gs.dungeonLocation - dungeonAvoid) ok = false;
      if (zLo < jnHi && zHi > jnLo) { jnLo++; jnHi--; ok = false; }
      if (zLo < snHi && zHi > snLo) { snLo++; snHi--; ok = false; }
    }
    gs.evilZones.push({ x0: zLo, x1: zHi });

    if (gs.crimson) {
      crimStart(st, rng, gs, cx, gs.worldSurfaceLow - 10);
      // 地表转换:猩红石/猩红草/猩红沙 + 墙 216→218、187→221;丛林泥/草清除
      convertSurface(st, rng, gs, zLo, zHi, true);
      // 祭坛 10-14 个(v_26 style 1)
      placeAltars(st, rng, gs, zLo, zHi, 1, CRIMSTONE);
    } else {
      // 腐化裂隙:主裂隙(cx, 150-300 步) + 35 分之一支裂隙(50-100 步带球)
      let cooldown = 0;
      for (let x = zLo; x < zHi; x++) {
        if (cooldown > 0) cooldown--;
        if (x !== cx && cooldown !== 0) continue;
        let sy = -1;
        for (let y = gs.worldSurfaceLow; y < gs.worldSurface - 1; y++) {
          if (st.flags[st.idx(x, y)] || st.wall[st.idx(x, y)] > 0) {
            if (x === cx) {
              cooldown = 20;
              chasmRunner(st, rng, gs, x, y, rng.int(0, 149) + 150, true);
            } else if (rng.int(0, 34) === 0) {
              cooldown = 30;
              chasmRunner(st, rng, gs, x, y, rng.int(0, 49) + 50, true);
            }
            break;
          }
        }
      }
      convertSurface(st, rng, gs, zLo, zHi, false);
      // 暗影之球周的黑檀石囊清理(原版 6416-6446)
      cleanOrbPockets(st, rng);
    }
  }
}

/** 地表转换(腐化/猩红通用):L6195-6232 / L6388-6414 */
function convertSurface(st: TileStore, rng: RNG, gs: GenState, zLo: number, zHi: number, crimson: boolean): void {
  // 丛林泥/草清除(地表 10-14 格深)
  for (let x = zLo; x < zHi; x++) {
    for (let y = gs.worldSurfaceLow; y < gs.worldSurface - 1; y++) {
      if (!st.flags[st.idx(x, y)]) continue;
      const depth = y + rng.int(10, 13);
      for (let y2 = y; y2 < depth; y2++) {
        const t = st.type[st.idx(x, y2)];
        if ((t === MUD || t === JUNGLE_GRASS) && x >= zLo + rng.int(0, 4) && x < zHi - rng.int(0, 4)) {
          st.type[st.idx(x, y2)] = 0;
        }
      }
      break;
    }
  }
  // 深度游走转换带
  let bandY = gs.worldSurface + 40;
  for (let x = zLo; x < zHi; x++) {
    bandY += rng.int(-2, 2);
    if (bandY < gs.worldSurface + 30) bandY = gs.worldSurface + 30;
    if (bandY > gs.worldSurface + 50) bandY = gs.worldSurface + 50;
    let first = true;
    for (let y = gs.worldSurfaceLow; y < bandY; y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const t = st.type[i];
      const inCore = x >= zLo + rng.int(0, 4) && x <= zHi - rng.int(0, 4);
      if (t === T.SAND && inCore) st.type[i] = crimson ? CRIMSAND : EBONSAND;
      if (t === T.DIRT && y < gs.worldSurface - 1 && first) {
        // 暴露泥土 → 邪恶草(原版 SpreadGrass(0→23/199))
        st.type[i] = crimson ? CRIMSON_GRASS : CORRUPT_GRASS;
      }
      first = false;
      if (st.wall[i] === 216) st.wall[i] = crimson ? 218 : 217;
      else if (st.wall[i] === 187) st.wall[i] = crimson ? 221 : 220;
      if (t === T.STONE) {
        if (inCore) st.type[i] = crimson ? CRIMSTONE : EBONSTONE;
      } else if (t === T.GRASS) st.type[i] = crimson ? CRIMSON_GRASS : CORRUPT_GRASS;
      else if (t === ICE) { /* 腐化冰 v_163 暂缺,保持冰 */ }
      else if (t === SANDSTONE) { /* 腐化沙岩 v_400/v_401 暂缺 */ }
      else if (t === HARDSAND) st.type[i] = crimson ? CRIMSON_HARDSAND : CORRUPT_HARDSAND;
    }
  }
}

/** 恶魔祭坛:10-14 个,落在邪恶石地表上(Place3x2) */
function placeAltars(st: TileStore, rng: RNG, gs: GenState, zLo: number, zHi: number, style: number, stoneType: number): void {
  const count = rng.int(10, 14);
  for (let n = 0; n < count; n++) {
    let widen = 0, tries = 0, done = false;
    while (!done) {
      tries++;
      let x = rng.int(zLo - widen, zHi - 1 + widen);
      // 原版 y 带(cs L6243-6244):worldSurface-widen/2 .. worldSurface+100+widen
      let y = rng.int(Math.max(2, Math.floor(gs.worldSurface - widen / 2)), Math.floor(gs.worldSurface + 100 + widen) - 1);
      if (x < 2) x = 2; if (x > st.w - 3) x = st.w - 3;
      if (!st.flags[st.idx(x, y)]) {
        while (!st.flags[st.idx(x, y)] && y < st.h - 2) y++;
        y--;
      } else {
        while (st.flags[st.idx(x, y)] && y > gs.worldSurface) y--;
      }
      if ((widen > 10 || (st.flags[st.idx(x, y + 1)] && st.type[st.idx(x, y + 1)] === stoneType)) && !isTileNearby(st, x, y, ALTAR, 3)) {
        place3x2(st, x, y, ALTAR, style);
        if (st.type[st.idx(x, y)] === ALTAR) done = true;
      }
      if (tries > 100) { widen++; tries = 0; }
      if (widen > 100) done = true;
    }
  }
}

function isTileNearby(st: TileStore, x: number, y: number, type: number, radius: number): boolean {
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (!st.inBounds(x + dx, y + dy)) continue;
      if (st.type[st.idx(x + dx, y + dy)] === type) return true;
    }
  }
  return false;
}

/** 3×2 物件放置(锚点=中下):帧 style*54 + col*18 / row*18 */
function place3x2(st: TileStore, x: number, y: number, type: number, style: number): void {
  if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return;
  for (let dx = -1; dx <= 1; dx++) {
    if (!st.isSolid(x + dx, y + 1)) return; // 底座须实心
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 0; dy++) {
      if (st.flags[st.idx(x + dx, y + dy)]) return; // 区域须净空
    }
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 0; dy++) {
      st.setTileSilent(x + dx, y + dy, type, style * 54 + (dx + 1) * 18, (dy + 1) * 18);
    }
  }
}

/** 暗影之球(AddShadowOrb L16035):2×2,猩红 style 偏移 +36 */
function addShadowOrb(st: TileStore, x: number, y: number, crimson: boolean): void {
  if (x < 10 || x > st.w - 10 || y < 10 || y > st.h - 10) return;
  for (let dx = -1; dx < 1; dx++) {
    for (let dy = -1; dy < 1; dy++) {
      if (st.flags[st.idx(x + dx, y + dy)] && st.type[st.idx(x + dx, y + dy)] === ORB) return;
    }
  }
  const fx = crimson ? 36 : 0;
  st.setTileSilent(x - 1, y - 1, ORB, fx, 0);
  st.setTileSilent(x, y - 1, ORB, 18 + fx, 0);
  st.setTileSilent(x - 1, y, ORB, fx, 18);
  st.setTileSilent(x, y, ORB, 18 + fx, 18);
}

/** ChasmRunner(L45779)1:1:竖直裂隙,黑檀石壳 + 球/祭坛收尾 */
function chasmRunner(st: TileStore, rng: RNG, gs: GenState, i: number, j: number, steps: number, makeOrb: boolean): void {
  let sideways = false, orbPlaced = !makeOrb, altarPlaced = false;
  let num1 = steps;
  let px = i + 0.0, py = j + 0.0;
  let vx = rng.int(-10, 10) * 0.1;
  let vy = rng.int(0, 10) * 0.2 + 0.5;
  let radius = rng.int(0, 4) + 7;
  while (radius > 0) {
    if (num1 > 0) {
      radius += rng.int(0, 2) - rng.int(0, 2);
      if (radius < 7) radius = 7;
      if (radius > 20) radius = 20;
      if (num1 === 1 && radius < 10) radius = 10;
    } else if (py > gs.worldSurface + 45) {
      radius -= rng.int(0, 3);
    }
    if (py > gs.rockLevel && num1 > 0) num1 = 0;
    num1--;
    if (!sideways && py > gs.worldSurface + 20) {
      sideways = true;
      chasmRunnerSideways(st, rng, gs, Math.floor(px), Math.floor(py), -1, rng.int(20, 39));
      chasmRunnerSideways(st, rng, gs, Math.floor(px), Math.floor(py), 1, rng.int(20, 39));
    }
    // 挖空(中心)
    if (num1 > 5) {
      const x0 = Math.max(0, Math.floor(px - radius * 0.5)), x1 = Math.min(st.w - 1, Math.floor(px + radius * 0.5));
      const y0 = Math.max(0, Math.floor(py - radius * 0.5)), y1 = Math.min(st.h, Math.floor(py + radius * 0.5));
      for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          const ti = st.idx(x, y);
          if (Math.abs(x - px) + Math.abs(y - py) < radius * 0.5 * (1 + rng.int(-10, 10) * 0.015)
            && st.type[ti] !== ORB) {
            st.flags[ti] = 0; // 只清 active 保留 type(原版 KillTile)——壳层才不会回填隧道
          }
        }
      }
    }
    if (num1 <= 2 && py < gs.worldSurface + 45) num1 = 2;
    if (num1 <= 0) {
      if (!orbPlaced) {
        orbPlaced = true;
        addShadowOrb(st, Math.floor(px), Math.floor(py), false);
      } else if (!altarPlaced) {
        altarPlaced = true;
        let tries = 0, done = false;
        while (!done) {
          let x = rng.int(Math.floor(px) - 25, Math.floor(px) + 24);
          let y = rng.int(Math.floor(py) - 50, Math.floor(py) - 1);
          x = Math.max(5, Math.min(st.w - 5, x));
          y = Math.max(5, Math.min(st.h - 5, y));
          if (y > gs.worldSurface) {
            // 落点吸附(原版):空气则落到地面,实心则升到表面
            if (!st.flags[st.idx(x, y)]) {
              while (!st.flags[st.idx(x, y)] && y < st.h - 2) y++;
              y--;
            } else {
              while (st.flags[st.idx(x, y)] && y > 4) y--;
            }
            if (!isTileNearby(st, x, y, ALTAR, 3)) place3x2(st, x, y, ALTAR, 0);
            if (st.type[st.idx(x, y)] === ALTAR) done = true;
            else if (++tries >= 10000) done = true;
          } else if (++tries >= 10000) done = true; // 原版此处直接放弃;小世界采样带浅,改为重试
        }
      }
    }
    px += vx; py += vy;
    vx += rng.int(-10, 10) * 0.01;
    vx = Math.max(-0.3, Math.min(0.3, vx));
    // 黑檀石壳(外圈 1.1×)
    const x0 = Math.max(1, Math.floor(px - radius * 1.1)), x1 = Math.min(st.w - 1, Math.floor(px + radius * 1.1));
    const y0 = Math.max(0, Math.floor(py - radius * 1.1)), y1 = Math.min(st.h, Math.floor(py + radius * 1.1));
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const ti = st.idx(x, y);
        if (Math.abs(x - px) + Math.abs(y - py) < radius * 1.1 * (1 + rng.int(-10, 10) * 0.015)) {
          if (st.type[ti] !== EBONSTONE && y > j + rng.int(3, 19)) st.flags[ti] = 1;
          if (steps <= 5) st.flags[ti] = 1;
          if (st.type[ti] !== ORB) st.type[ti] = EBONSTONE;
        }
      }
    }
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const ti = st.idx(x, y);
        if (Math.abs(x - px) + Math.abs(y - py) < radius * 1.1 * (1 + rng.int(-10, 10) * 0.015)) {
          if (st.type[ti] !== ORB) st.type[ti] = EBONSTONE;
          if (steps <= 5) st.flags[ti] = 1;
          if (y > j + rng.int(3, 19)) st.wall[ti] = 3;
        }
      }
    }
  }
}

/** ChasmRunnerSideways(L45313)1:1:水平裂隙 */
function chasmRunnerSideways(st: TileStore, rng: RNG, gs: GenState, i: number, j: number, direction: number, steps: number): void {
  let num1 = steps;
  let px = i + 0.0, py = j + 0.0;
  let vx = rng.int(10, 20) * 0.1 * direction;
  // 原版初速 vy = Next(-10,10)*0.01 = -0.10..-0.01(恒向下,cs L45321)
  let vy = rng.int(-10, -1) * 0.01;
  let radius = rng.int(0, 4) + 7;
  while (radius > 0) {
    if (num1 > 0) {
      radius += rng.int(0, 2) - rng.int(0, 2);
      if (radius < 7) radius = 7;
      if (radius > 20) radius = 20;
      if (num1 === 1 && radius < 10) radius = 10;
    } else radius -= rng.int(0, 3);
    if (py > gs.rockLevel && num1 > 0) num1 = 0;
    num1--;
    const x0 = Math.max(0, Math.floor(px - radius * 0.5)), x1 = Math.min(st.w - 1, Math.floor(px + radius * 0.5));
    const y0 = Math.max(0, Math.floor(py - radius * 0.5)), y1 = Math.min(st.h, Math.floor(py + radius * 0.5));
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const ti = st.idx(x, y);
        if (Math.abs(x - px) + Math.abs(y - py) < radius * 0.5 * (1 + rng.int(-10, 10) * 0.015)
          && st.type[ti] !== ORB) {
          st.flags[ti] = 0; // 只清 active(原版 KillTile)——壳层不回填
        }
      }
    }
    px += vx; py += vy;
    vy += rng.int(-10, 9) * 0.1;
    if (py < j - 20) vy += rng.int(0, 19) * 0.01;
    if (py > j + 20) vy -= rng.int(0, 19) * 0.01;
    vy = Math.max(-0.5, Math.min(0.5, vy));
    vx += rng.int(-10, 10) * 0.01;
    if (direction === -1) { if (vx > -0.5) vx = -0.5; if (vx < -2) vx = -2; }
    else { if (vx < 0.5) vx = 0.5; if (vx > 2) vx = 2; }
    // 黑檀石壳 + 墙 3
    const x2 = Math.max(1, Math.floor(px - radius * 1.1)), x3 = Math.min(st.w - 1, Math.floor(px + radius * 1.1));
    const y2 = Math.max(0, Math.floor(py - radius * 1.1)), y3 = Math.min(st.h, Math.floor(py + radius * 1.1));
    for (let x = x2; x < x3; x++) {
      for (let y = y2; y < y3; y++) {
        const ti = st.idx(x, y);
        if (Math.abs(x - px) + Math.abs(y - py) < radius * 1.1 * (1 + rng.int(-10, 10) * 0.015) && st.wall[ti] !== 3) {
          if (st.type[ti] !== EBONSTONE && y > j + rng.int(3, 19)) st.flags[ti] = 1;
          st.flags[ti] = 1;
          if (st.type[ti] !== ORB && st.type[ti] !== EBONSTONE) st.type[ti] = EBONSTONE;
          if (st.wall[ti] === 2) st.wall[ti] = 0;
        }
      }
    }
    for (let x = x2; x < x3; x++) {
      for (let y = y2; y < y3; y++) {
        const ti = st.idx(x, y);
        if (Math.abs(x - px) + Math.abs(y - py) < radius * 1.1 * (1 + rng.int(-10, 10) * 0.015) && st.wall[ti] !== 3) {
          if (st.type[ti] !== ORB && st.type[ti] !== EBONSTONE) st.type[ti] = EBONSTONE;
          st.flags[ti] = 1;
          st.wall[ti] = 3;
        }
      }
    }
  }
  // 1/3 概率末端魔矿脉
  if (rng.int(0, 2) !== 0) return;
  const x = Math.floor(px);
  let y = Math.floor(py);
  while (!st.flags[st.idx(x, y)] && y < st.h - 2) y++;
  // 魔矿 22 缺独立 tile,用黑檀石小脉近似
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      if (dx * dx + dy * dy <= 4 && st.inBounds(x + dx, y + dy)) {
        st.flags[st.idx(x + dx, y + dy)] = 1;
        st.type[st.idx(x + dx, y + dy)] = EBONSTONE;
      }
    }
  }
}

/** CrimStart(L45443):弹坑隧道 + CrimVein 血管(5-8 条,终点=恶魔之心) */
function crimStart(st: TileStore, rng: RNG, gs: GenState, i: number, j: number): void {
  const entryX = i, entryY0 = Math.min(j, gs.worldSurface);
  let py = entryY0;
  while (!st.isSolid(i, py) && py < st.h - 2) py++;
  let px = i + 0.0;
  const startY = py;
  let vx = rng.int(-20, 20) * 0.1;
  let vy = rng.int(20, 200) * 0.01;
  let radius = rng.int(15, 25);
  let recenter = 0;  // cs L45517 num4:X 回中状态(漂离入口 ±50 后反向修正)
  // 主通道随机走(向下椭圆隧道)
  while (true) {
    radius += rng.int(-50, 50) * 0.01;
    radius = Math.max(15, Math.min(25, radius));
    const x0 = Math.floor(px - radius / 2), x1 = Math.floor(px + radius / 2);
    const y0 = Math.floor(py - radius / 2), y1 = Math.floor(py + radius / 2);
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        if (!st.inBounds(x, y)) continue;
        const d = Math.abs(x - px) + Math.abs(y - py);
        const ti = st.idx(x, y);
        if (y > startY) {
          if (d < radius * 0.3) {
            st.type[ti] = 0; st.flags[ti] = 0; st.wall[ti] = 83;
          } else if (d < radius * 0.8 && st.wall[ti] !== 83) {
            st.flags[ti] = 1; st.type[ti] = CRIMSTONE;
            if (d < radius * 0.6) st.wall[ti] = 83;
          }
        } else if (d < radius * 0.3 && st.flags[ti]) {
          st.type[ti] = 0; st.flags[ti] = 0; st.wall[ti] = 83;
        }
      }
    }
    // X 回中(cs L45494-45503):漂离入口 ±50 后设反向偏置,未漂时正常随机走
    if (px > entryX + 50) recenter = -100;
    if (px < entryX - 50) recenter = 100;
    if (recenter < 0) vx -= rng.int(20, 50) * 0.01;
    else if (recenter > 0) vx += rng.int(20, 50) * 0.01;
    else vx += rng.int(-50, 50) * 0.01;
    vy += rng.int(-50, 50) * 0.01;
    vy = Math.max(0.25, Math.min(2, vy));
    vx = Math.max(-2, Math.min(2, vx));
    px += vx; py += vy;
    if (py > gs.worldSurface + 100) break;
    if (py > st.h - 10 || px < 5 || px > st.w - 5) break;
  }
  // ---- 隧道终点囊群(cs L45551-45585):50 个半径 40-54 球,核心 0.25R 清空、壳 0.4R 猩红石 ----
  const endR = rng.int(40, 54);
  for (let n = 0; n < 50; n++) {
    const cx = Math.floor(px) + rng.int(-20, 20);
    const cy = Math.floor(py) + rng.int(-20, 20);
    for (let x = Math.floor(cx - endR / 2); x < cx + endR / 2; x++) {
      for (let y = Math.floor(cy - endR / 2); y < cy + endR / 2; y++) {
        if (!st.inBounds(x, y)) continue;
        const d = Math.hypot(
          Math.abs(x - cx) * (1 + rng.int(-20, 20) * 0.01),
          Math.abs(y - cy) * (1 + rng.int(-20, 20) * 0.01),
        );
        const ti = st.idx(x, y);
        if (d < endR * 0.25) {
          st.type[ti] = 0; st.flags[ti] = 0; st.wall[ti] = 83;
        } else if (d < endR * 0.4 && st.wall[ti] !== 83) {
          st.flags[ti] = 1; st.type[ti] = CRIMSTONE;
          if (d < endR * 0.35) st.wall[ti] = 83;
        }
      }
    }
  }
  // ---- CrimVein:5-8 条血管从通道终点出发(Y 只向下/水平),终点记录为心位 ----
  const veinCount = rng.int(5, 8);
  const usedV: Array<[number, number]> = [];
  const hearts: Array<[number, number]> = [];
  for (let n = 0; n < veinCount; n++) {
    let vx2 = 0, vy2 = 0, tries2 = 0;
    for (;;) {
      vx2 = rng.int(-20, 20) * 0.15;
      vy2 = rng.int(0, 20) * 0.15;
      if (Math.abs(vx2) + Math.abs(vy2) >= 1.5
        && usedV.every(([ux, uy]) => Math.abs(ux - vx2) >= 0.75 || Math.abs(uy - vy2) >= 0.75)) break;
      if (++tries2 > 10000) break;
    }
    usedV.push([vx2, vy2]);
    hearts.push(crimVein(st, rng, px, py, vx2, vy2));
  }
  // ---- 地表囊群(CrimStart 末段:从入口点向上漂移的 25-35 半径球)----
  let sx = entryX + 0.0, sy = startY + 0.0;
  let rise = rng.int(0, 5);
  const pocketR = rng.int(25, 34);
  let shellMinX = st.w, shellMaxX = 0;  // 壳层覆盖范围(列填充用,cs L45587-45589)
  for (let n = 0; n < 50; n++) {
    if (rise > 0) {
      const step = rng.int(10, 29) * 0.01;
      rise -= step;
      sy -= step;
    }
    const cx = Math.floor(sx) + rng.int(-2, 2);
    const cy = Math.floor(sy) + rng.int(-2, 2);
    for (let x = Math.floor(cx - pocketR / 2); x < cx + pocketR / 2; x++) {
      for (let y = Math.floor(cy - pocketR / 2); y < cy + pocketR / 2; y++) {
        if (!st.inBounds(x, y)) continue;
        const d = Math.hypot(
          Math.abs(x - cx) * (1 + rng.int(-20, 20) * 0.005),
          Math.abs(y - cy) * (1 + rng.int(-20, 20) * 0.005),
        );
        const ti = st.idx(x, y);
        if (d < pocketR * 0.2 * (rng.int(90, 110) * 0.01)) {
          st.type[ti] = 0; st.flags[ti] = 0; st.wall[ti] = 83;
        } else if (d < pocketR * 0.45) {
          if (x < shellMinX) shellMinX = x;
          if (x > shellMaxX) shellMaxX = x;
          if (st.wall[ti] !== 83) {
            st.flags[ti] = 1; st.type[ti] = CRIMSTONE;
            if (d < pocketR * 0.35) st.wall[ti] = 83;
          }
        }
      }
    }
  }
  // ---- 列填充(cs L45629-45640):囊群覆盖范围内每列向下补 15-19 格猩红石 ----
  for (let x = shellMinX; x <= shellMaxX; x++) {
    if (x < 1 || x >= st.w - 1) continue;
    let y = startY;
    if (y < 0) y = 0;
    while (y < st.h - 1 && ((st.type[st.idx(x, y)] === CRIMSTONE && st.flags[st.idx(x, y)]) || st.wall[st.idx(x, y)] === 83)) y++;
    let fill = rng.int(15, 19);
    while (y < st.h - 1 && !st.flags[st.idx(x, y)] && fill > 0 && st.wall[st.idx(x, y)] !== 83) {
      fill--;
      st.type[st.idx(x, y)] = CRIMSTONE;
      st.flags[st.idx(x, y)] = 1;
      y++;
    }
  }
  // ---- CrimEnt:水平入口(半径 6-10,只挖猩红石,20 步无肉即停)----
  crimEnt(st, rng, entryX, Math.floor(sy), vx >= 0 ? -1 : 1);
  // ---- CrimPlaceHearts:心室(壳→空腔→心)----
  for (const [hx, hy] of hearts) {
    const r1 = rng.int(16, 20);
    for (let x = hx - Math.floor(r1 / 2); x < hx + r1 / 2; x++) {
      for (let y = hy - Math.floor(r1 / 2); y < hy + r1 / 2; y++) {
        if (!st.inBounds(x, y)) continue;
        if (Math.hypot(x - hx, y - hy) < r1 * 0.4) {
          const ti = st.idx(x, y);
          st.flags[ti] = 1; st.type[ti] = CRIMSTONE; st.wall[ti] = 83;
        }
      }
    }
    const r2 = rng.int(10, 13);
    for (let x = hx - Math.floor(r2 / 2); x < hx + r2 / 2; x++) {
      for (let y = hy - Math.floor(r2 / 2); y < hy + r2 / 2; y++) {
        if (!st.inBounds(x, y)) continue;
        if (Math.hypot(x - hx, y - hy) < r2 * 0.3) {
          const ti = st.idx(x, y);
          st.type[ti] = 0; st.flags[ti] = 0; st.wall[ti] = 83;
        }
      }
    }
    addShadowOrb(st, hx, hy, true);
  }
}

/** CrimVein(L45724)1:1:血管走——核心 0.2R 挖空(墙83)/壳 0.5R 猩红石;曼哈顿行程 100-150 */
function crimVein(st: TileStore, rng: RNG, sx: number, sy: number, ivx: number, ivy: number): [number, number] {
  let radius = rng.int(15, 25);
  const trip = rng.int(100, 149) - (ivy < 0 ? 25 : 0);
  let px = sx, py = sy;
  let vx = ivx, vy = ivy;
  while (Math.abs(px - sx) + Math.abs(py - sy) <= trip) {
    radius += rng.int(-50, 50) * 0.02;
    radius = Math.max(15, Math.min(25, radius));
    const x0 = Math.floor(px - radius / 2), x1 = Math.floor(px + radius / 2);
    const y0 = Math.floor(py - radius / 2), y1 = Math.floor(py + radius / 2);
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        if (!st.inBounds(x, y)) continue;
        const d = Math.hypot(x - px, y - py);
        const ti = st.idx(x, y);
        if (d < radius * 0.2) {
          st.type[ti] = 0; st.flags[ti] = 0; st.wall[ti] = 83;
        } else if (d < radius * 0.5 && st.wall[ti] !== 83) {
          st.flags[ti] = 1; st.type[ti] = CRIMSTONE;
          if (d < radius * 0.4) st.wall[ti] = 83;
        }
      }
    }
    vx += rng.int(-50, 50) * 0.05;
    vy += rng.int(-50, 50) * 0.05;
    vx = Math.max(ivx - 0.75, Math.min(ivx + 0.75, vx));
    vy = Math.max(ivy - 0.75, Math.min(ivy + 0.75, vy));
    px += vx; py += vy;
    if (py > st.h - 30 || py < 5 || px < 5 || px > st.w - 5) break;
  }
  return [Math.floor(px), Math.floor(py)];
}

/** CrimEnt(L45689)1:1:水平入口隧道,只贯穿猩红石,连续 20 步无肉即停 */
function crimEnt(st: TileStore, rng: RNG, x0: number, y0: number, dir: number): void {
  let radius = rng.int(6, 10);
  const vx = 2 * -dir;
  let vy = rng.int(-20, -1) * 0.01;
  let px = x0 + 0.0, py = y0 + 0.0;
  let misses = 0;
  while (misses < 20) {
    misses++;
    radius += rng.int(-10, 10) * 0.02;
    radius = Math.max(6, Math.min(10, radius));
    const bx0 = Math.floor(px - radius / 2), bx1 = Math.floor(px + radius / 2);
    const by0 = Math.floor(py - radius / 2), by1 = Math.floor(py + radius / 2);
    for (let x = bx0; x < bx1; x++) {
      for (let y = by0; y < by1; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        if (st.flags[ti] && st.type[ti] === CRIMSTONE && Math.hypot(x - px, y - py) < radius * 0.5) {
          st.type[ti] = 0; st.flags[ti] = 0;
          misses = 0;
        }
      }
    }
    px += vx; py += vy;
  }
}

/** 暗影之球周的黑檀石囊(L6416-6446):球周 ±13 L1<9-19 处填黑檀石、球旁清空 */
function cleanOrbPockets(st: TileStore, rng: RNG): void {
  const { w, h } = st;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h - 50; y++) {
      if (!st.flags[st.idx(x, y)] || st.type[st.idx(x, y)] !== ORB) continue;
      for (let dx = -13; dx < 13; dx++) {
        if (x + dx <= 10 || x + dx >= w - 10) continue;
        for (let dy = -13; dy < 13; dy++) {
          if (y + dy < 0 || y + dy >= h) continue;
          const ti = st.idx(x + dx, y + dy);
          if (Math.abs(dx) + Math.abs(dy) < 9 + rng.int(0, 10) && rng.int(0, 2) !== 0 && st.type[ti] !== ORB) {
            st.flags[ti] = 1; st.type[ti] = EBONSTONE;
            if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) { st.flags[ti] = 0; st.type[ti] = 0; }
          }
          if (st.type[ti] !== ORB && Math.abs(dx) <= 2 + rng.int(0, 2) && Math.abs(dy) <= 2 + rng.int(0, 2)) {
            st.flags[ti] = 0; st.type[ti] = 0;
          }
        }
      }
    }
  }
}
