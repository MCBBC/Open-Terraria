// 原版 pass 28 "Corruption"(WorldGen.cs:6059)移植。
// 腐化:ChasmRunner 裂隙(黑檀石 25 壳 + 暗影之球 31 style0 + 恶魔祭坛 26 style0);
// 猩红:CrimStart 弹坑隧道(猩红石 203 墙 83 + 恶魔之心 31 style1 + 祭坛 style1)。
// 区域避开:出生点±200、地下沙漠、地牢±100、丛林/雪原带(±10 收缩)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { tileRunner } from './TileRunner';
import { spreadGrassOnce, grassSpreadState, setWorldSurfaceRef } from './MushroomPass';

const EBONSTONE = TILE_BY_KEY['v_25_ebonstone_block']!;
const CORRUPT_GRASS = TILE_BY_KEY['v_23_corrupt_grass_block']!;
const EBONSAND = TILE_BY_KEY['v_112_ebonsand_block']!;
const CRIMSTONE = TILE_BY_KEY['v_203_crimstone_block']!;
const CRIMSON_GRASS = TILE_BY_KEY['v_199_crimson_grass_block']!;
const CRIMSAND = TILE_BY_KEY['v_234_crimsand_block']!;
const CORRUPT_HARDSAND = TILE_BY_KEY['v_398_corrupt_hardened_sand_block']!;
const SNOW_BRICK = TILE_BY_KEY['ice']!;   // sheet 161=Ice Block（旧 key v_161_snow_brick 误名）
const CORRUPT_ICE = TILE_BY_KEY['v_163_purple_ice_block']!;   // 163=Purple Ice
const CRIMSON_ICE = TILE_BY_KEY['v_200_red_ice_block']!;   // 200=Red Ice
const CRIMSON_HARDSAND = TILE_BY_KEY['v_399_crimson_hardened_sand_block']!;
const CORRUPT_SANDSTONE = TILE_BY_KEY['v_400_corrupt_sandstone_block']!;
const CRIMSON_SANDSTONE = TILE_BY_KEY['v_401_crimson_sandstone_block']!;
const CORRUPT_JUNGLE_GRASS = TILE_BY_KEY['v_661_corrupt_jungle_grass_block']!;
const CRIMSON_JUNGLE_GRASS = TILE_BY_KEY['v_662_crimson_jungle_grass_block']!;
const ICE = TILE_BY_KEY['ice']!;
const MUD = TILE_BY_KEY['mud']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const SNOW = TILE_BY_KEY['snow']!;
const ALTAR = TILE_BY_KEY['v_26_altars']!;
/** TileID.Sets.Boulders（TileID.cs:195）——Place3x2 type=26 的底座巨石门 */
const BOULDERS = new Set<number>([
  'v_138_boulder', 'v_484_rolling_cactus', 'v_664_bouncy_boulder', 'v_665_life_crystal_boulder',
  'v_711_rainbow_boulder', 'v_712_poo_boulder', 'v_713_lava_boulder', 'v_714_spider_boulder',
  'v_715_ghoulder', 'v_716_friendly_boulder',
].map((k) => TILE_BY_KEY[k]).filter((v): v is number => v !== undefined));
/** CanEvilReplace(WorldGen.cs:76182-76197):地牢砖族(tileDungeon 41/43/44/677-679,Main.cs:7941-7946)
 *  /裂砖族(CrackedBricks 481-483)/地牢墙(wallDungeon 7-9/94-99,Main.cs:10507-10515)不可替换 */
const TILE_DUNGEON = new Set([41, 43, 44, 677, 678, 679]);
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
function canEvilReplace(st: TileStore, x: number, y: number): boolean {
  const i = st.idx(x, y);
  if (st.flags[i]) {
    const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
    if (TILE_DUNGEON.has(sheet) || (sheet >= 481 && sheet <= 483)) return false;  // tileDungeon ∪ CrackedBricks
  }
  return !WALL_DUNGEON.has(st.wall[i]);
}
const ORB = TILE_BY_KEY['v_31_orb_heart']!;
const SANDSTONE = TILE_BY_KEY['sandstone']!;
const HARDSAND = TILE_BY_KEY['hardened_sand']!;
const DEMONITE = TILE_BY_KEY['ore_demonite']!;   // tile 22（侧裂隙末端魔矿脉 + 挖空保护 :76191）
const CRIMTANE = TILE_BY_KEY['ore_crimtane']!;  // tile 204 猩红矿（挖空保护 :76191）

export function runCorruptionPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  setWorldSurfaceRef(() => gs.worldSurface);   // SpreadGrass 的 dirt==0 地表门禁
  // 丛林/雪原横向范围(±10 回避, cs:13936-13952)
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
  const beachAvoid = 380;   // evilBiomeBeachAvoidance = beachSandRandomCenter(320)+60
  const dungeonAvoid = 100;
  const midFixer = 50;      // evilBiomeAvoidanceMidFixer
  // ★裸 double：4200×0.00045 = 1.89 → 两组！（曾 floor 成 1 → 整片邪恶群系少一半）
  const groupCount = w * 0.00045;
  const hearts: Array<[number, number]> = [];
  for (let g = 0; g < groupCount; g++) {
    let snowLo = sLo, snowHi = sHi, jungLo = jLo, jungHi = jHi;
    let cx = 0, zLo = 0, zHi = 0;
    let ok = false;
    // 拒绝采样（cs:13979-14009）：地牢侧钳制 → 地牢 ±100 → 中央 ±200 → 沙漠 → 雪原 → 丛林
    while (!ok) {
      ok = true;
      cx = rng.int(beachAvoid, w - 1 - beachAvoid);            // Next(380, w-380)
      zLo = cx - rng.int(0, 199) - 100;                        // Next(200)
      zHi = cx + rng.int(0, 199) + 100;
      if (zLo < beachAvoid) zLo = beachAvoid;
      if (zHi > w - beachAvoid) zHi = w - beachAvoid;
      if (cx < zLo + midFixer) cx = zLo + midFixer;
      if (cx > zHi - midFixer) cx = zHi - midFixer;
      if (gs.dungeonSide < 0 && zLo < 400) zLo = 400;          // dungeonSide<=Left
      else if (gs.dungeonSide > 0 && zLo > w - 400) zLo = w - 400;
      if (zLo < gs.dungeonLocation + dungeonAvoid && zHi > gs.dungeonLocation - dungeonAvoid) ok = false;
      const mid = w / 2;
      if (Math.abs(cx - mid) < 200 || Math.abs(zLo - mid) < 200 || Math.abs(zHi - mid) < 200) ok = false;
      const ud = gs.undergroundDesert;
      if (ud && ((cx > ud.x0 && cx < ud.x1) || (zLo > ud.x0 && zLo < ud.x1) || (zHi > ud.x0 && zHi < ud.x1))) ok = false;
      if (zLo < snowHi && zHi > snowLo) { snowLo++; snowHi--; ok = false; }   // cs:14006-14010（先雪后林）
      if (zLo < jungHi && zHi > jungLo) { jungLo++; jungHi--; ok = false; }
    }
    gs.evilZones.push({ x0: zLo, x1: zHi });

    if (gs.crimson) {
      crimStart(st, rng, gs, cx, gs.worldSurfaceLow - 10, hearts);
      // 丛林草→猩红丛林草（cs:14110-14122：仅 type 60→662；曾误把泥也清成 0）
      for (let x = zLo; x < zHi; x++) {
        for (let y = gs.worldSurfaceLow; y < gs.worldSurface - 1; y++) {
          if (!st.flags[st.idx(x, y)]) continue;
          const depth = y + rng.int(10, 13);                  // Next(10,14)
          for (let y2 = y; y2 < depth; y2++) {
            if (st.flags[st.idx(x, y2)] && st.type[st.idx(x, y2)] === JUNGLE_GRASS
              && x >= zLo + rng.int(0, 4) && x < zHi - rng.int(0, 4)) {
              st.type[st.idx(x, y2)] = CRIMSON_JUNGLE_GRASS;
            }
          }
          break;
        }
      }
      convertSurface(st, rng, gs, zLo, zHi, true);
      placeAltars(st, rng, gs, zLo, zHi, 1, CRIMSTONE);
    } else {
      // 腐化裂隙（cs:14368-14390）+ 丛林草→腐化丛林草（cs:14392-14404）
      let cooldown = 0;
      for (let x = zLo; x < zHi; x++) {
        if (cooldown > 0) cooldown--;
        if (x === cx || cooldown === 0) {
          let sy = -1;
          for (let y = gs.worldSurfaceLow; y < gs.worldSurface - 1; y++) {
            if (st.flags[st.idx(x, y)] || st.wall[st.idx(x, y)] > 0) {
              sy = y;
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
          void sy;
        }
        for (let y = gs.worldSurfaceLow; y < gs.worldSurface - 1; y++) {
          if (!st.flags[st.idx(x, y)]) continue;
          const depth = y + rng.int(10, 13);
          for (let y2 = y; y2 < depth; y2++) {
            if (st.flags[st.idx(x, y2)] && st.type[st.idx(x, y2)] === JUNGLE_GRASS
              && x >= zLo + rng.int(0, 4) && x < zHi - rng.int(0, 4)) {
              st.type[st.idx(x, y2)] = CORRUPT_JUNGLE_GRASS;  // 60→661
            }
          }
          break;
        }
      }
      convertSurface(st, rng, gs, zLo, zHi, false);
      // 暗影球周黑檀石囊（cs:14546-14581，★仅本组区间；第二条件仅清 active 保 type 幽灵）
      cleanOrbPockets(st, rng, zLo, zHi);
    }
  }
  // CrimPlaceHearts（cs:14331）：全组结束后一次性（曾逐组内联 → 流序错位）
  if (gs.crimson) crimPlaceHearts(st, rng, hearts);
}

/** 地表转换带（cs:14131-14199 猩红 / cs:14406-14484 腐化）1:1。
 *  每格两道 Next(2) 边缘抖动门（内圈免骰）；53/1 的 ±Next(5) 门按类型各自独掷；
 *  首个活性格 SpreadGrass：0→199/23（递归）与 59→662/661（递归）双分支。 */
function convertSurface(st: TileStore, rng: RNG, gs: GenState, zLo: number, zHi: number, crimson: boolean): void {
  let bandY = gs.worldSurface + 40;
  for (let x = zLo; x < zHi; x++) {
    bandY += rng.int(-2, 2);                                    // Next(-2,3)
    if (bandY < gs.worldSurface + 30) bandY = gs.worldSurface + 30;
    if (bandY > gs.worldSurface + 50) bandY = gs.worldSurface + 50;
    let first = false;
    const bandStart = gs.worldSurfaceLow;                       // (int)num
    for (let y = bandStart; y < bandY; y++) {
      // 边缘抖动门（cs:14145-14147）：x/y 内圈免骰，外圈 Next(2)!=0 才过
      if (!((x > zLo + 1 && x < zHi - 2) || rng.int(0, 1) !== 0)) continue;
      if (!((y > bandStart + 1 && y < bandY - 2) || rng.int(0, 1) !== 0)) continue;
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      if (st.type[i] === T.SAND && x >= zLo + rng.int(0, 4) && x <= zHi - rng.int(0, 4)) {
        st.type[i] = crimson ? CRIMSAND : EBONSAND;             // 53→234/112
      }
      if (y < gs.worldSurface - 1 && !first) {
        if (st.type[i] === T.DIRT) {
          grassSpreadState.n = 0;
          spreadGrassOnce(st, x, y, 0, crimson ? CRIMSON_GRASS : CORRUPT_GRASS, true);  // SpreadGrass(0→199/23)
        } else if (st.type[i] === MUD) {
          grassSpreadState.n = 0;
          spreadGrassOnce(st, x, y, MUD, crimson ? CRIMSON_JUNGLE_GRASS : CORRUPT_JUNGLE_GRASS, true); // 59→662/661
        }
      }
      first = true;
      if (st.wall[i] === 216) st.wall[i] = crimson ? 218 : 217;
      else if (st.wall[i] === 187) st.wall[i] = crimson ? 221 : 220;
      if (st.type[i] === T.STONE) {
        if (x >= zLo + rng.int(0, 4) && x <= zHi - rng.int(0, 4)) {
          st.type[i] = crimson ? CRIMSTONE : EBONSTONE;         // 1→203/25
        }
      } else if (st.type[i] === T.GRASS) st.type[i] = crimson ? CRIMSON_GRASS : CORRUPT_GRASS;
      else if (st.type[i] === JUNGLE_GRASS) st.type[i] = crimson ? CRIMSON_JUNGLE_GRASS : CORRUPT_JUNGLE_GRASS;
      else if (st.type[i] === ICE) st.type[i] = crimson ? CRIMSON_ICE : CORRUPT_ICE;       // 161→200/163
      else if (st.type[i] === SANDSTONE) st.type[i] = crimson ? CRIMSON_SANDSTONE : CORRUPT_SANDSTONE;  // 396→401/400
      else if (st.type[i] === HARDSAND) st.type[i] = crimson ? CRIMSON_HARDSAND : CORRUPT_HARDSAND;      // 397→399/398
    }
  }
}

/** 恶魔祭坛（cs:14201-14239）：10-14 个。拒绝采样 x∈[zLo-widen,zHi+widen)、
 *  y∈[ws-widen/2, ws+100+widen)；tries>100 先 widen++ 再找面/落点（原版顺序）；
 *  落点门 = widen>10 || 下方活性邪恶石，且 IsTileNearby(26,3) 无邻坛。 */
function placeAltars(st: TileStore, rng: RNG, gs: GenState, zLo: number, zHi: number, style: number, stoneType: number): void {
  const count = rng.int(10, 14);                               // Next(10,15)
  for (let n = 0; n < count; n++) {
    let widen = 0, tries = 0, done = false;
    while (!done) {
      tries++;
      let x = rng.int(zLo - widen, zHi - 1 + widen);            // Next(zLo-widen, zHi+widen)
      let y = rng.int(Math.floor(gs.worldSurface - widen / 2), Math.floor(gs.worldSurface + 100 + widen) - 1);
      if (tries > 100) { widen++; tries = 0; }                  // ★原版先 widen 后找面
      if (!st.flags[st.idx(x, y)]) {
        while (y < st.h - 1 && !st.flags[st.idx(x, y)]) y++;
        y--;
      } else {
        while (y > 0 && st.flags[st.idx(x, y)] && y > gs.worldSurface) y--;
      }
      if ((widen > 10 || (st.flags[st.idx(x, y + 1)] && st.type[st.idx(x, y + 1)] === stoneType))
        && !isTileNearby(st, x, y, ALTAR, 3)) {
        place3x2(st, x, y, ALTAR, style);
        if (st.type[st.idx(x, y)] === ALTAR) done = true;
      }
      if (widen > 100) done = true;
    }
  }
}

/** IsTileNearby（cs:8828）：★须 active（曾漏 → 幽灵坛误判邻坛） */
function isTileNearby(st: TileStore, x: number, y: number, type: number, radius: number): boolean {
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (!st.inBounds(x + dx, y + dy)) continue;
      const i = st.idx(x + dx, y + dy);
      if (st.flags[i] && st.type[i] === type) return true;
    }
  }
  return false;
}

/** Place3x2（cs:52097）type=26 语义：界内 + 3×2 区域净空 + 三列底座实心（★active 实心，
 *  曾用 st.isSolid 不判 flags）+ 底座非巨石(523)。锚点=中下，帧 style*54+col*18。 */
function place3x2(st: TileStore, x: number, y: number, type: number, style: number): void {
  if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 0; dy++) {
      if (st.flags[st.idx(x + dx, y + dy)]) return;             // 区域须净空
    }
  }
  for (let dx = -1; dx <= 1; dx++) {
    const bi = st.idx(x + dx, y + 1);
    if (!st.flags[bi]) return;                                  // SolidTile2 = active+tileSolid
    if (!TILE_DEFS[st.type[bi]]?.solid) return;
    if (BOULDERS.has(st.type[bi])) return;  // TileID.Sets.Boulders（TileID.cs:195：138/484/664/665/711-716）
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

/** ChasmRunner（cs:76066-76340）1:1：竖直裂隙。挖空/双壳全带 CanEvilReplace 门；
 *  壳1 = 激活+type=25（非坛才写 type），壳2 = type=25+激活+墙3（y>j+Next(3,20)）。
 *  球只放一次；第二裂隙尾部祭坛 = 纯随机点+IsTileNearby+Place3x2 重试 ≤10000。 */
function chasmRunner(st: TileStore, rng: RNG, gs: GenState, i: number, j: number, steps: number, makeOrb: boolean): void {
  let sideways = false, orbPlaced = !makeOrb, altarPlaced = false;
  let num1 = steps + 0.0;
  let px = i + 0.0, py = j + 0.0;
  let vx = rng.int(-10, 10) * 0.1;                             // Next(-10,11)
  let vy = rng.int(0, 10) * 0.2 + 0.5;                         // Next(11)*0.2+0.5
  let radius = rng.int(0, 4) + 7;                              // Next(5)+7
  const num3 = 5;
  while (radius > 0) {
    if (num1 > 0) {
      radius += rng.int(0, 2) - rng.int(0, 2);                // Next(3) 两次
      if (radius < 7) radius = 7;
      if (radius > 20) radius = 20;
      if (num1 === 1 && radius < 10) radius = 10;
    } else if (py > gs.worldSurface + 45) {
      radius -= rng.int(0, 3);                                 // Next(4)
    }
    if (py > gs.rockLevel && num1 > 0) num1 = 0;
    num1--;
    if (!sideways && py > gs.worldSurface + 20) {
      sideways = true;
      chasmRunnerSideways(st, rng, gs, Math.floor(px), Math.floor(py), -1, rng.int(20, 39));  // Next(20,40)
      chasmRunnerSideways(st, rng, gs, Math.floor(px), Math.floor(py), 1, rng.int(20, 39));
    }
    // 挖空（cs:76110-76119：num2>5 才挖；CanEvilReplace+非坛/魔矿/猩红矿三门）
    if (num1 > 5) {
      const x0 = Math.max(0, Math.floor(px - radius * 0.5)), x1 = Math.min(st.w - 1, Math.floor(px + radius * 0.5));
      const y0 = Math.max(0, Math.floor(py - radius * 0.5)), y1 = Math.min(st.h, Math.floor(py + radius * 0.5));
      for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          const ti = st.idx(x, y);
          if (Math.abs(x - px) + Math.abs(y - py) < radius * 0.5 * (1 + rng.int(-10, 10) * 0.015)
            && canEvilReplace(st, x, y)
            && st.type[ti] !== ORB && st.type[ti] !== DEMONITE && st.type[ti] !== CRIMTANE) {
            st.flags[ti] = 0;   // 只清 active（type 保留=幽灵）
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
        // cs:76210-76240：纯随机点 → y>worldSurface 才试；IsTileNearby(26,3)+Place3x2，
        // 失败重试 ≤10000；y≤worldSurface 直接放弃。★无落点吸附（吸附是猩红散布专属）
        let tries = 0, done = false;
        while (!done) {
          let x = rng.int(Math.floor(px) - 25, Math.floor(px) + 24);   // Next(X-25, X+25)
          let y = rng.int(Math.floor(py) - 50, Math.floor(py) - 1);    // Next(Y-50, Y)
          x = Math.max(5, Math.min(st.w - 5, x));
          y = Math.max(5, Math.min(st.h - 5, y));
          if (y > gs.worldSurface) {
            if (!isTileNearby(st, x, y, ALTAR, 3)) place3x2(st, x, y, ALTAR, 0);
            if (st.type[st.idx(x, y)] === ALTAR) { done = true; continue; }
            if (++tries >= 10000) done = true;
          } else done = true;
        }
      }
    }
    px += vx; py += vy;
    vx += rng.int(-10, 10) * 0.01;
    vx = Math.max(-0.3, Math.min(0.3, vx));
    // 壳1（cs:76282-76296）：CanEvilReplace + 激活/type=25
    const x0 = Math.max(1, Math.floor(px - radius * 1.1)), x1 = Math.min(st.w - 1, Math.floor(px + radius * 1.1));
    const y0 = Math.max(0, Math.floor(py - radius * 1.1)), y1 = Math.min(st.h, Math.floor(py + radius * 1.1));
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const ti = st.idx(x, y);
        if (canEvilReplace(st, x, y)
          && Math.abs(x - px) + Math.abs(y - py) < radius * 1.1 * (1 + rng.int(-10, 10) * 0.015)) {
          if (st.type[ti] !== EBONSTONE && y > j + rng.int(3, 19)) st.flags[ti] = 1;  // Next(3,20)
          if (steps <= num3) st.flags[ti] = 1;
          if (st.type[ti] !== ORB) st.type[ti] = EBONSTONE;
        }
      }
    }
    // 壳2（cs:76309-76322）：type=25 + 激活 + 墙3
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const ti = st.idx(x, y);
        if (canEvilReplace(st, x, y)
          && Math.abs(x - px) + Math.abs(y - py) < radius * 1.1 * (1 + rng.int(-10, 10) * 0.015)) {
          if (st.type[ti] !== ORB) st.type[ti] = EBONSTONE;
          if (steps <= num3) st.flags[ti] = 1;
          if (y > j + rng.int(3, 19)) st.wall[ti] = 3;          // ebonStoneWall
        }
      }
    }
  }
}

/** ChasmRunnerSideways（cs:75323-75523）1:1：水平裂隙。挖空三门同竖直版；
 *  壳 = 非31/22/204 才写 type、恒激活、墙2 清零；壳2 = 同门 + 墙3。
 *  末端 1/3 TileRunner 魔矿脉（Next(2,6)/Next(3,7), type 22）。 */
function chasmRunnerSideways(st: TileStore, rng: RNG, gs: GenState, i: number, j: number, direction: number, steps: number): void {
  let num1 = steps + 0.0;
  let px = i + 0.0, py = j + 0.0;
  let vx = rng.int(10, 20) * 0.1 * direction;                  // Next(10,21)
  let vy = rng.int(-10, -1) * 0.01;                            // Next(-10,10)
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
          && canEvilReplace(st, x, y)
          && st.type[ti] !== ORB && st.type[ti] !== DEMONITE && st.type[ti] !== CRIMTANE) {
          st.flags[ti] = 0;
        }
      }
    }
    px += vx; py += vy;
    vy += rng.int(-10, 9) * 0.1;                               // Next(-10,10)
    if (py < j - 20) vy += rng.int(0, 19) * 0.01;              // Next(20)
    if (py > j + 20) vy -= rng.int(0, 19) * 0.01;
    vy = Math.max(-0.5, Math.min(0.5, vy));
    vx += rng.int(-10, 10) * 0.01;
    if (direction === -1) { if (vx > -0.5) vx = -0.5; if (vx < -2) vx = -2; }
    else { if (vx < 0.5) vx = 0.5; if (vx > 2) vx = 2; }
    const x2 = Math.max(1, Math.floor(px - radius * 1.1)), x3 = Math.min(st.w - 1, Math.floor(px + radius * 1.1));
    const y2 = Math.max(0, Math.floor(py - radius * 1.1)), y3 = Math.min(st.h, Math.floor(py + radius * 1.1));
    // 壳1（cs:75477-75490）：墙≠3 门 + 三矿门 → type=25+激活+墙2 清零
    for (let x = x2; x < x3; x++) {
      for (let y = y2; y < y3; y++) {
        const ti = st.idx(x, y);
        if (canEvilReplace(st, x, y)
          && Math.abs(x - px) + Math.abs(y - py) < radius * 1.1 * (1 + rng.int(-10, 10) * 0.015)
          && st.wall[ti] !== 3) {
          if (!st.flags[ti] || (st.type[ti] !== ORB && st.type[ti] !== DEMONITE && st.type[ti] !== CRIMTANE)) {
            st.type[ti] = EBONSTONE;
          }
          st.flags[ti] = 1;
          if (st.wall[ti] === 2) st.wall[ti] = 0;
        }
      }
    }
    // 壳2（cs:75496-75508）：同门 → type=25+激活+墙3
    for (let x = x2; x < x3; x++) {
      for (let y = y2; y < y3; y++) {
        const ti = st.idx(x, y);
        if (canEvilReplace(st, x, y)
          && Math.abs(x - px) + Math.abs(y - py) < radius * 1.1 * (1 + rng.int(-10, 10) * 0.015)
          && st.wall[ti] !== 3) {
          if (!st.flags[ti] || (st.type[ti] !== ORB && st.type[ti] !== DEMONITE && st.type[ti] !== CRIMTANE)) {
            st.type[ti] = EBONSTONE;
          }
          st.flags[ti] = 1;
          st.wall[ti] = 3;
        }
      }
    }
  }
  // 末端 1/3 魔矿脉（cs:75512-75520）：列扫到首个活性 → TileRunner(22)
  if (rng.int(0, 2) === 0) {
    const x = Math.floor(px);
    let y = Math.floor(py);
    while (y < st.h - 1 && !st.flags[st.idx(x, y)]) y++;
    tileRunner(st, rng, gs, x, y, {
      strength: rng.int(2, 5), steps: rng.int(3, 6), type: DEMONITE,
    });
  }
  void gs;
}

/** CrimStart（cs:75543-75852）1:1。SolidTile 扫面（★active 实心）；主通道椭圆走；
 *  终点囊群 50 球；血管 5-8 条（方向拒绝采样★原版 quirk：间距比较用主通道末速度
 *  val2 而非新采样——cs:75790-75797）；地表囊群 50 球+列填充；CrimEnt 入口。
 *  hearts 由调用方收集（原版 CrimPlaceHearts 全组后统一放）。 */
function crimStart(st: TileStore, rng: RNG, gs: GenState, i: number, j: number, hearts: Array<[number, number]>): void {
  const solidAt = (x: number, y: number) =>
    st.inBounds(x, y) && st.flags[st.idx(x, y)] && !!TILE_DEFS[st.type[st.idx(x, y)]]?.solid;  // SolidTile
  let py = Math.min(j, gs.worldSurface);
  while (py < st.h - 1 && !solidAt(i, py)) py++;
  const startY = py;
  let px = i + 0.0;
  let vx = rng.int(-20, 20) * 0.1;                             // Next(-20,21)
  let vy = rng.int(20, 200) * 0.01;                            // Next(20,201)
  let crimDir = 1;
  if (vx < 0) crimDir = -1;
  let radius = rng.int(15, 25);                                // Next(15,26)
  let recenter = 0;
  for (;;) {
    radius += rng.int(-50, 50) * 0.01;
    radius = Math.max(15, Math.min(25, radius));
    const x0 = Math.floor(px - radius / 2), x1 = Math.floor(px + radius / 2);
    const y0 = Math.floor(py - radius / 2), y1 = Math.floor(py + radius / 2);
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        if (!st.inBounds(x, y)) continue;
        if (!canEvilReplace(st, x, y)) continue;
        const d = Math.abs(x - px) + Math.abs(y - py);
        const ti = st.idx(x, y);
        if (y > startY) {
          if (d < radius * 0.3) {
            st.flags[ti] = 0; st.wall[ti] = 83;                // crimStoneWall
          } else if (d < radius * 0.8 && st.wall[ti] !== 83) {
            st.flags[ti] = 1; st.type[ti] = CRIMSTONE;
            if (d < radius * 0.6) st.wall[ti] = 83;
          }
        } else if (d < radius * 0.3 && st.flags[ti]) {
          st.flags[ti] = 0; st.wall[ti] = 83;
        }
      }
    }
    if (px > i + 50) recenter = -100;
    if (px < i - 50) recenter = 100;
    if (recenter < 0) vx -= rng.int(20, 50) * 0.01;            // Next(20,51)
    else if (recenter > 0) vx += rng.int(20, 50) * 0.01;
    else vx += rng.int(-50, 50) * 0.01;                        // Next(-50,51)
    vy += rng.int(-50, 50) * 0.01;
    vy = Math.max(0.25, Math.min(2, vy));
    vx = Math.max(-2, Math.min(2, vx));
    px += vx; py += vy;
    if (py > gs.worldSurface + 100) break;
  }
  // 终点囊群（cs:75700-75732）：50 个半径 40-54 椭球（x/y 独立 ±20% 缩放）
  let endR = rng.int(40, 54);                                  // Next(40,55)
  for (let n = 0; n < 50; n++) {
    const cx = Math.floor(px) + rng.int(-20, 20);
    const cy = Math.floor(py) + rng.int(-20, 20);
    for (let x = Math.floor(cx - endR / 2); x < cx + endR / 2; x++) {
      for (let y = Math.floor(cy - endR / 2); y < cy + endR / 2; y++) {
        if (!st.inBounds(x, y)) continue;
        if (!canEvilReplace(st, x, y)) continue;
        const ddx = Math.abs(x - cx) * (1 + rng.int(-20, 20) * 0.01);
        const ddy = Math.abs(y - cy) * (1 + rng.int(-20, 20) * 0.01);
        const d = Math.hypot(ddx, ddy);
        const ti = st.idx(x, y);
        if (d < endR * 0.25) {
          st.flags[ti] = 0; st.wall[ti] = 83;
        } else if (d < endR * 0.4 && st.wall[ti] !== 83) {
          st.flags[ti] = 1; st.type[ti] = CRIMSTONE;
          if (d < endR * 0.35) st.wall[ti] = 83;
        }
      }
    }
  }
  // 血管（cs:75735-75779）
  const veinCount = rng.int(5, 8);                             // Next(5,9)
  const usedV: Array<[number, number]> = [];
  for (let n = 0; n < veinCount; n++) {
    let dvx = 0, dvy = 0, tries = 0;
    for (;;) {
      dvx = rng.int(-20, 20) * 0.15;                           // 两次 ctor（首对是死代码骰）
      dvy = rng.int(0, 20) * 0.15;
      while (Math.abs(dvx) + Math.abs(dvy) < 1.5) {
        dvx = rng.int(-20, 20) * 0.15;
        dvy = rng.int(0, 20) * 0.15;
      }
      let clash = false;
      for (let p = 0; p < n; p++) {
        // ★原版 quirk（cs:75790-75797）：比较 val2（主通道末速度）——不是新采样的 dvx/dvy！
        if (vx > usedV[p]![0] - 0.75 && vx < usedV[p]![0] + 0.75
          && vy > usedV[p]![1] - 0.75 && vy < usedV[p]![1] + 0.75) {
          clash = true; tries++;
          break;
        }
      }
      if (!clash || tries > 10000) break;
    }
    usedV.push([dvx, dvy]);
    hearts.push(crimVein(st, rng, Math.floor(px), Math.floor(py), dvx, dvy));
  }
  // 地表囊群（cs:75781-75832）
  px = i; py = startY;
  endR = rng.int(25, 34);                                      // Next(25,35)
  let rise = rng.int(0, 5);                                    // Next(0,6)
  let shellMinX = st.w, shellMaxX = 0;
  for (let n = 0; n < 50; n++) {
    if (rise > 0) {
      const step = rng.int(10, 29) * 0.01;                     // Next(10,30)
      rise -= step;
      py -= step;
    }
    const cx = Math.floor(px) + rng.int(-2, 2);                // Next(-2,3)
    const cy = Math.floor(py) + rng.int(-2, 2);
    for (let x = Math.floor(cx - endR / 2); x < cx + endR / 2; x++) {
      for (let y = Math.floor(cy - endR / 2); y < cy + endR / 2; y++) {
        if (!st.inBounds(x, y)) continue;
        if (!canEvilReplace(st, x, y)) continue;
        const ddx = Math.abs(x - cx) * (1 + rng.int(-20, 20) * 0.005);
        const ddy = Math.abs(y - cy) * (1 + rng.int(-20, 20) * 0.005);
        const d = Math.hypot(ddx, ddy);
        const ti = st.idx(x, y);
        if (d < endR * 0.2 * (rng.int(90, 110) * 0.01)) {     // Next(90,111)
          st.flags[ti] = 0; st.wall[ti] = 83;
        } else if (d < endR * 0.45) {
          if (x < shellMinX) shellMinX = x;
          if (x > shellMaxX) shellMaxX = x;
          if (st.wall[ti] !== 83) {
            st.flags[ti] = 1; st.type[ti] = CRIMSTONE;
            if (d < endR * 0.35) st.wall[ti] = 83;
          }
        }
      }
    }
  }
  // 列填充（cs:75834-75848）：壳覆盖范围内每列向下补猩红石（★CanEvilReplace 才消耗）
  for (let x = shellMinX; x <= shellMaxX; x++) {
    let y = startY;
    while (y < st.h - 1 && ((st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] === CRIMSTONE) || st.wall[st.idx(x, y)] === 83)) y++;
    let fill = rng.int(15, 19);                                // Next(15,20)
    while (y < st.h - 1 && !st.flags[st.idx(x, y)] && fill > 0 && st.wall[st.idx(x, y)] !== 83) {
      if (canEvilReplace(st, x, y)) {
        fill--;
        st.type[st.idx(x, y)] = CRIMSTONE;
        st.flags[st.idx(x, y)] = 1;
        y++;
      }
    }
  }
  // CrimEnt（cs:75989-76030）：★入口锚 = (i, startY)（曾用上升后的 sy）；
  //   crimDir 语义 = vx<0 → -1，内部速度 = 2*-crimDir（曾方向取反）
  crimEnt(st, rng, i, startY, crimDir);
}

/** CrimVein（cs:76035-76064）1:1：核心 0.2R 挖空(墙83)/壳 0.5R 猩红石(0.4R 墙)；
 *  速度 ±0.75 钳；曼哈顿行程 100-150（vy<0 减 25）。终点 = 心位。 */
function crimVein(st: TileStore, rng: RNG, sx: number, sy: number, ivx: number, ivy: number): [number, number] {
  let radius = rng.int(15, 25);
  let trip = rng.int(100, 149) - (ivy < 0 ? 25 : 0);           // Next(100,150)
  let px = sx + 0.0, py = sy + 0.0;
  let vx = ivx, vy = ivy;
  while (Math.abs(px - sx) + Math.abs(py - sy) <= trip) {
    radius += rng.int(-50, 50) * 0.02;
    radius = Math.max(15, Math.min(25, radius));
    const x0 = Math.floor(px - radius / 2), x1 = Math.floor(px + radius / 2);
    const y0 = Math.floor(py - radius / 2), y1 = Math.floor(py + radius / 2);
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        if (!st.inBounds(x, y)) continue;
        if (!canEvilReplace(st, x, y)) continue;
        const d = Math.hypot(x - px, y - py);
        const ti = st.idx(x, y);
        if (d < radius * 0.2) {
          st.flags[ti] = 0; st.wall[ti] = 83;
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
  }
  return [Math.floor(px), Math.floor(py)];
}

/** CrimEnt（cs:75989-76030）1:1：水平入口隧道，只贯穿活性猩红石，连续 20 步无肉即停 */
function crimEnt(st: TileStore, rng: RNG, x0: number, y0: number, crimDir: number): void {
  let misses = 0;
  let radius = rng.int(6, 10);                                 // Next(6,11)
  let vx = 2.0, vy = rng.int(-20, -1) * 0.01;                  // Next(-20,0)
  vx *= -crimDir;                                              // ★原版：向 crimDir 反向
  let px = x0 + 0.0, py = y0 + 0.0;
  let alive = true;
  while (alive) {
    misses++;
    if (misses >= 20) alive = false;
    radius += rng.int(-10, 10) * 0.02;                        // Next(-10,11)
    radius = Math.max(6, Math.min(10, radius));
    const bx0 = Math.floor(px - radius / 2), bx1 = Math.floor(px + radius / 2);
    const by0 = Math.floor(py - radius / 2), by1 = Math.floor(py + radius / 2);
    for (let x = bx0; x < bx1; x++) {
      for (let y = by0; y < by1; y++) {
        if (!st.inBounds(x, y)) continue;
        if (!canEvilReplace(st, x, y)) continue;
        const ti = st.idx(x, y);
        if (st.flags[ti] && st.type[ti] === CRIMSTONE && Math.hypot(x - px, y - py) < radius * 0.5) {
          st.flags[ti] = 0;
          alive = true;
          misses = 0;
        }
      }
    }
    px += vx; py += vy;
  }
}

/** CrimPlaceHearts（cs:75854-75881）1:1：壳(0.4R 猩红石+墙83)→空腔(0.3R)→心。
 *  ★原版全组 CrimStart 后一次性调用（曾逐组内联流序错位）。 */
function crimPlaceHearts(st: TileStore, rng: RNG, hearts: Array<[number, number]>): void {
  for (const [hx, hy] of hearts) {
    const r1 = rng.int(16, 20);                                // Next(16,21)
    for (let x = hx - Math.floor(r1 / 2); x < hx + r1 / 2; x++) {
      for (let y = hy - Math.floor(r1 / 2); y < hy + r1 / 2; y++) {
        if (!st.inBounds(x, y)) continue;
        if (Math.hypot(x - hx, y - hy) < r1 * 0.4) {
          const ti = st.idx(x, y);
          st.flags[ti] = 1; st.type[ti] = CRIMSTONE; st.wall[ti] = 83;
        }
      }
    }
  }
  for (const [hx, hy] of hearts) {
    const r2 = rng.int(10, 13);                                // Next(10,14)
    for (let x = hx - Math.floor(r2 / 2); x < hx + r2 / 2; x++) {
      for (let y = hy - Math.floor(r2 / 2); y < hy + r2 / 2; y++) {
        if (!st.inBounds(x, y)) continue;
        if (Math.hypot(x - hx, y - hy) < r2 * 0.3) {
          const ti = st.idx(x, y);
          st.flags[ti] = 0; st.wall[ti] = 83;                  // ★type 保留（原版只清 active）
        }
      }
    }
  }
  for (const [hx, hy] of hearts) addShadowOrb(st, hx, hy, true);
}

/** 暗影球周黑檀石囊（cs:14546-14581）1:1：★仅本组区间 [zLo,zHi)（曾全图扫描 →
 *  跨组重复处理流序错位）；第二条件仅清 active（type 保留为幽灵）。 */
function cleanOrbPockets(st: TileStore, rng: RNG, zLo: number, zHi: number): void {
  const { w, h } = st;
  for (let x = zLo; x < zHi; x++) {
    if (x < 0 || x >= w) continue;
    for (let y = 0; y < h - 50; y++) {
      if (!st.flags[st.idx(x, y)] || st.type[st.idx(x, y)] !== ORB) continue;
      for (let dx = -13; dx < 13; dx++) {
        if (x + dx <= 10 || x + dx >= w - 10) continue;
        for (let dy = -13; dy < 13; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          const ti = st.idx(x + dx, yy);
          if (Math.abs(dx) + Math.abs(dy) < 9 + rng.int(0, 10) && rng.int(0, 2) !== 0 && st.type[ti] !== ORB) {
            st.flags[ti] = 1; st.type[ti] = EBONSTONE;
            if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) st.flags[ti] = 0;
          }
          if (st.type[ti] !== ORB && Math.abs(dx) <= 2 + rng.int(0, 2) && Math.abs(dy) <= 2 + rng.int(0, 2)) {
            st.flags[ti] = 0;   // ★仅 active=false（type 保留=幽灵，原版 cs:14578）
          }
        }
      }
    }
  }
}
