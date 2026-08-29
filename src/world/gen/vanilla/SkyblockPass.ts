// ★IIIII44（2026-08-29）：skyblock 加型生成器本体 1:1 实装。
// 权威源码 Terarria1457/Terraria/WorldGen.cs（1458 同段字节级一致——已 diff 实证）：
//   - WorldGen.Skyblock 类           cs:3029-3250
//   - AddPasses 注册位               cs:11539-11550（TerrainPass 之后紧接本 pass；仅
//     skyblockWorldGen 注册 ⇒ JS 条件插槽镜像，非 skyblock 管线零位移）
//   - GenerateSkyBlockWorld          cs:22725-23021 / SkyblockIsland cs:23022-23821
// mile8 八通道真值链：G2=/tmp/iii46-out/x86-skyblock（seed=20260829 evil=1 小图）。
// 布置面终态直证（x86 #105 直方图）：189 云块×4338 / 56 黑曜石×610（微光环）/
//   196×577 / 220 凝固器 3×3×1 / 658 以太单体 2×3×1 / 139 音乐盒(style87) 2×2×1。
// tile 表经 sheetId()（vanilla sheet→内部 id）；墙域为原版裸 id（全仓约定）。
import type { TileStore } from '../../TileStore';
import type { World } from '../../World';
import type { RNG } from '../../../core/rng';
import type { SeedFlags } from '../SeedEasterEggs';
import type { GenState } from './GenState';
import { sheetId } from './TileCleanupPass';
import { genSquareTileFrame } from './FinalCleanupPass';
import { squareWallFrameRoll } from './MarbleGranitePass';
import { genSolidType, vanSolidOrSloped } from './GenSolid';
import { doAdditionalChangesAroundSpawnCore } from './SecretSeedDoEndsPass';

/** Main.UnderworldLayer（Main.cs:2886，全仓约定 maxTilesY-200） */
const UW_OF = (h: number): number => h - 200;

/** WorldGen.Skyblock.denyAllGeneration（cs:3097）≡ Main.skyblockWorld */
export function sbDenyAll(sf: SeedFlags | undefined): boolean {
  return !!sf?.skyblock;
}

/**
 * denySomeGeneration 的降级旗清单（cs:3099 全枚举，单源）——sbDenySome 由本表
 * 程序化驱动,新增组合语义只改此一处（「常量表有/装配漏」教训条目落点：
 * SkyblockRuntime anchorSets 手写装配漏键案 2026-08-29 的同族预防）。
 * 隐藏种 worldIsInfected（"kbxny…"）本仓无 SeedFlags 项,不在表内=恒未开启（备案）。
 */
export const SB_DENYSOME_BREAKERS = [
  'worldIsFrozen', 'surfaceIsDesert', 'surfaceIsMushrooms',
  'hallowOnTheSurface', 'noInfection', 'extraFloatingIslands',
  'extraLiquid', 'extraLivingTrees',
] as const;

/** WorldGen.Skyblock.denySomeGeneration（cs:3099）：纯 skyblock=true；清单任一开启则 false */
export function sbDenySome(sf: SeedFlags | undefined): boolean {
  if (!sf?.skyblock) return false;
  return !SB_DENYSOME_BREAKERS.some((k) => !!(sf as Record<string, unknown>)[k]);
}

/** WorldGen.Skyblock.denyFloatingIslands（cs:3053）＝ skyblock && !extraFloatingIslands */
export function sbDenyFloatingIslands(sf: SeedFlags | undefined): boolean {
  return !!sf?.skyblock && !sf.extraFloatingIslands;
}

/** WorldGen.Skyblock.spawnSolidifier / spawnShimmerPool（cs:3065/3081，同式）：
 *  ＝ skyblock && (tenth ? true : !getGood)。 */
function spawnAddonProp(sf: SeedFlags | undefined): boolean {
  if (!sf?.skyblock) return false;
  if (!sf.tenthAnniversary) return !sf.getGoodWorld;
  return true;
}

// ---------------------------------------------------------------------------
// 放置件（PlaceTile 分派臂转写；三者内部均零 genRand 掷骰）
// ---------------------------------------------------------------------------

/** SolidTile2（cs:70665 近似：active && 生成期实心；空岛阶段无平台/致动器干扰） */
function solidTile2(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  return !!st.flags[i] && vanSolidOrSloped(st, x, y);
}

/** Place3x3 的 220 家族分支（cs:53995-54103）：num=-2 锚=占 y-2..y 三行 x-1..x+1，
 *  支撑=S(y+1) 三列；frameX=col*18、frameY=row*18。成功=true。 */
function place3x3AnchorUp(st: TileStore, x: number, y: number, internalId: number): boolean {
  let ok = true;
  for (let a = x - 1; a <= x + 1 && ok; a++) {
    for (let b = y - 2; b <= y; b++) {
      if (!st.inBounds(a, b)) { continue; }
      if (st.flags[st.idx(a, b)]) { ok = false; break; }
    }
  }
  for (let k = x - 1; k <= x + 1; k++) {
    if (!solidTile2(st, k, y + 1)) return false;      // (type!==753 门对本族不命中)
  }
  if (!ok) return false;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const i = st.idx(x - 1 + c, y - 2 + r);
      st.flags[i] = 1;
      st.frameX[i] = c * 18;
      st.frameY[i] = r * 18;
      st.type[i] = internalId;
    }
  }
  return true;
}

// Main.tileTable 唯一权威表（DungeonPass.DG_TILE_TABLE=Main.cs:9900 段+:10131 循环族全量）——
// ★IIIII44 复核批：本处曾手写 {14,19} 子集冒充整表＝「常量表有/装配漏」同族缺陷
// （SkyblockRuntime anchorSets dungeonTile 漏键崩案的同型),改单源程序化消费。
import { DG_TILE_TABLE } from './DungeonPass';
const TILE_TABLE_SHEETS = DG_TILE_TABLE;

/** PlaceMB（cs:51729）：139 音乐盒 2×2，锚=cols X..X+1 × rows y-1..y，
 *  frameY=style*36、左列 frameX=0 右列 18。 */
function placeMB(st: TileStore, X: number, y: number, internalId: number, style: number): boolean {
  const num = X + 1;
  if (num < 5 || num > st.w - 5 || y < 5 || y > st.h - 5) return false;
  let ok = true;
  for (let i = num - 1; i <= num && ok; i++) {
    for (let j = y - 1; j <= y; j++) {
      if (st.inBounds(i, j) && st.flags[st.idx(i, j)]) { ok = false; break; }
    }
    const below = st.inBounds(i, y + 1) ? st.idx(i, y + 1) : -1;
    // cs:51740 支撑门逐字：!active || halfBrick || (!tileSolid && !tileTable) → 拒
    const shOk = below >= 0 && !!st.flags[below] && !st.half[below] &&
      (genSolidType(st.type[below]) || TILE_TABLE_SHEETS.has(sheetOfInternal(st.type[below])));
    if (!shOk) { ok = false; break; }
  }
  if (!ok) return false;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const i = st.idx(num - 1 + c, y - 1 + r);
      st.flags[i] = 1;
      st.type[i] = internalId;
      st.frameX[i] = c * 18;
      st.frameY[i] = style * 36;
    }
  }
  return true;
}

import { TILE_DEFS } from '../../../data/tiles';
function sheetOfInternal(id: number): number {
  return TILE_DEFS[id]?.vanilla?.sheet ?? -1;
}

/** Place2xX（cs:40056，默认 num3=3 高）：658 单体 2 宽×3 高，frameX=style*36(+18 右列)、
 *  frameY=row*18；支撑=下方两列 SolidTile2。 */
function place2xX(st: TileStore, x: number, y: number, internalId: number, style: number, hgt: number): boolean {
  let ok = true;
  for (let j = y - hgt + 1; j <= y && ok; j++) {
    if (st.inBounds(x, j) && st.flags[st.idx(x, j)]) ok = false;
    if (ok && st.inBounds(x + 1, j) && st.flags[st.idx(x + 1, j)]) ok = false;
  }
  if (!(solidTile2(st, x, y + 1) && solidTile2(st, x + 1, y + 1))) ok = false;
  if (!ok) return false;
  for (let j = 0; j < hgt; j++) {
    const il = st.idx(x, y - hgt + 1 + j);
    const ir = st.idx(x + 1, y - hgt + 1 + j);
    st.flags[il] = 1; st.type[il] = internalId; st.frameX[il] = style * 36; st.frameY[il] = j * 18;
    st.flags[ir] = 1; st.type[ir] = internalId; st.frameX[ir] = style * 36 + 18; st.frameY[ir] = j * 18;
  }
  return true;
}

/** SwitchMonolith 658 臂（cs:51451+，num=2/num2=3）：定位左上格后六格 frameY±54 mod162。 */
function switchMonolith658(st: TileStore, i: number, j: number): void {
  const type = sheetId(658);
  let colLocal = Math.trunc(st.frameX[st.idx(i, j)] / 18);   // cs:num5 迭代取余 [0,2)
  while (colLocal >= 2) colLocal -= 2;
  let rowLocal = Math.trunc(st.frameY[st.idx(i, j)] / 18);   // cs:num6 迭代取余 [0,3)
  while (rowLocal >= 3) rowLocal -= 3;
  const bx = i - colLocal, by = j - rowLocal;
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      const ax = bx + dx, ay = by + dy;
      if (!st.inBounds(ax, ay)) continue;
      const ii = st.idx(ax, ay);
      if (!st.flags[ii] || st.type[ii] !== type) continue;
      st.frameY[ii] += 54;
      if (st.frameY[ii] >= 54 * 3) st.frameY[ii] -= 54 * 3;
    }
  }
}

/** SwitchMB（cs:51405）：2×2 音乐盒 frameX<36 则 +36 否则 -36（含 35 变体门）。 */
function switchMB(st: TileStore, i: number, j: number): void {
  const t139 = sheetId(139), t35 = sheetId(35);
  let rowLocal = Math.trunc(st.frameY[st.idx(i, j)] / 18);   // num3 迭代 [0,2)
  while (rowLocal >= 2) rowLocal -= 2;
  let colLocal = Math.trunc(st.frameX[st.idx(i, j)] / 18);   // num4，≥2 减 2
  if (colLocal >= 2) colLocal -= 2;
  const bx = i - colLocal, by = j - rowLocal;
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      const ax = bx + dx, ay = by + dy;
      if (!st.inBounds(ax, ay)) continue;
      const ii = st.idx(ax, ay);
      if (!st.flags[ii] || (st.type[ii] !== t139 && st.type[ii] !== t35)) continue;
      if (st.frameX[ii] < 36) st.frameX[ii] += 36; else st.frameX[ii] -= 36;
    }
  }
}

/** IsTileNearby（cs:8812）：±distance 盒活性同型扫描（零掷骰）。sheet=原版 tile 表值。 */
function isTileNearbySheet(st: TileStore, x: number, y: number, sheet: number, distance: number): boolean {
  const type = sheetId(sheet);
  if (!type) return false;
  for (let a = x - distance; a <= x + distance; a++) {
    for (let b = y - distance; b <= y + distance; b++) {
      if (!st.inBounds(a, b)) continue;
      const ii = st.idx(a, b);
      if (st.flags[ii] && st.type[ii] === type) return true;
    }
  }
  return false;
}

/** isTileSurroundedBySolidTiles（cs:23922）＝3×3 全 SolidTile3（vanSolidOrSloped 同语义）。 */
function surroundedBySolid3(st: TileStore, x: number, y: number): boolean {
  for (let k = x - 1; k <= x + 1; k++) {
    for (let l = y - 1; l <= y + 1; l++) {
      if (!vanSolidOrSloped(st, k, l)) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// SkyblockIsland（cs:23022-23821）
// ---------------------------------------------------------------------------

export function skyblockIsland(
  st: TileStore, rng: RNG, gs: GenState,
  i: number, j: number, islandStyle: number, extraData = -1, forceProximityCheck = false,
): boolean {
  const w = st.w, h = st.h;
  const ws = gs.worldSurface;
  const uw = UW_OF(h);
  const ntb = !!gs.seedFlags.notTheBees;
  /** Next-exclusive 直通（C# genRand.Next(min,max)） */
  const NX = (a: number, b: number): number => rng.nextIntRange(a, b);
  const N1 = (a: number): number => rng.nextInt(a);        // Next(max)

  // ---- 近邻门（cs:23044-23055）----
  if (forceProximityCheck || islandStyle > 1) {
    for (let k = i - 200; k <= i + 200; k++) {
      for (let l = j - 100; l <= j + 100; l++) {
        if (st.inBounds(k, l) && st.flags[st.idx(k, l)]) return false;
      }
    }
  }

  // ---- 初值段（cs:23056-23262）----
  let radius = NX(220, 250);                          // num=Next(220,250)
  let ryA = 4.5;                                      // num2（4.5f 精确可表）
  let ryB = 4;                                        // num3
  let n4sheet = 0;                                    // num4 重涂型（dirt）
  let liquidKind = -1;                                // num5 ≥0⇒液芯
  let recolorTo = -1;                                 // num6 重染目标
  let n7sheet = 189;                                  // num7 岛体基块
  let n8sheet = 189;                                  // num8 上浮团块主型
  let n9sheet = 196;                                  // num9 掺杂型
  let wallId = 73;                                    // num10 衬墙（墙域裸 id）
  const T11sheet = 56;                                // num11 微光环型（黑曜石）

  if (islandStyle <= 1 || islandStyle === 13) {
    if (j > uw) n4sheet = 57;
    else if (ntb && (islandStyle === 0 || islandStyle === 13)) {
      n4sheet = 59;
      n7sheet = 225;
      wallId = 86;
    }
  }
  // switch（cs:23100-23111）：除 0/13 外重掷半径
  if (islandStyle === 1) { radius = NX(145, 156); ryA = 2.25; ryB = 1.75; }
  else if (islandStyle !== 0 && islandStyle !== 13) { radius = NX(145, 156); ryA = 2.5; ryB = 2.5; }

  if (islandStyle === 2) { n4sheet = !(j > ws) ? 147 : 161; n9sheet = 460; }
  if (islandStyle === 3) { n4sheet = 53; n9sheet = 189; }
  if (islandStyle === 4) {
    if (j > uw) { n4sheet = 57; recolorTo = 633; n9sheet = 717; }
    else if (j > ws) n4sheet = 1;
    else recolorTo = 2;
  }
  if (islandStyle === 5) { if (j > ws) n4sheet = 117; else recolorTo = 109; }
  if (islandStyle === 6) { if (j > ws) n4sheet = 25; else recolorTo = 23; }
  if (islandStyle === 7) { if (j > ws) n4sheet = 203; else recolorTo = 199; }
  if (islandStyle === 8) { n4sheet = 59; recolorTo = 70; }
  if (islandStyle === 9) { liquidKind = 0; n7sheet = 196; n8sheet = 196; n9sheet = 189; }
  if (islandStyle === 10) { liquidKind = 1; n9sheet = 189; n7sheet = 717; }
  if (islandStyle === 11) { liquidKind = 2; n9sheet = 189; }
  if (islandStyle === 12) { liquidKind = 3; n9sheet = 189; }

  const deepAccent = n9sheet === 196 && j > (gs.rockLevel + uw) / 2 ? 717 : n9sheet; // cs:23250-23252
  const T7 = sheetId(n7sheet);
  const T8 = sheetId(n8sheet);
  const T9 = sheetId(deepAccent);
  const N4 = sheetId(n4sheet);
  const T11 = sheetId(T11sheet);
  const W10 = wallId;

  // ---- stage1 主体塑形（cs:23264-23379）----
  const radius0 = radius;
  radius = radius0;                                   // num14 备份即本值
  let steps = NX(20, 30);                             // Next(20,30)
  let vx = i, vy = j;                                 // val
  let nvx = NX(-20, 21) * 0.2;                        // *0.2（双精度字面量）
  while (nvx > -2.0 && nvx < 2.0) nvx = NX(-20, 21) * 0.2;
  let nvy = NX(-20, -10) * 0.02;
  let minL = i, maxR = i, minT = j, maxB = j;         // num15..num18
  while (radius > 0.0 && steps > 0.0) {
    radius -= N1(4);                                  // Next(4)
    steps--;
    let lo = Math.trunc(vx - radius * 0.5);           // num19
    let hi = Math.trunc(vx + radius * 0.5);           // num20
    let bt = Math.trunc(vy - radius * 0.5);           // num21
    let bb = Math.trunc(vy + radius * 0.5);           // num22
    if (lo < 0) lo = 0;
    if (hi > w) hi = w;
    if (bt < 0) bt = 0;
    if (bb > h) bb = h;
    const scale = radius * NX(80, 120) * 0.01;        // num12
    let surf = vy + 1.0;                              // 波动面
    for (let m = lo; m < hi; m++) {
      if (N1(2) === 0) surf += NX(-1, 2);
      if (surf < vy) surf = vy;
      if (surf > vy + 2.0) surf = vy + 2.0;
      for (let n = bt; n < bb; n++) {
        if (!st.inBounds(m, n) || !(n > surf + 1.0)) continue;
        const dxv = Math.abs(m - vx);
        const dyv = Math.abs(n - vy) * ryA;
        if (Math.sqrt(dxv * dxv + dyv * dyv) < scale * 0.4) {
          if (m < minL) minL = m;
          if (m > maxR) maxR = m;
          if (n < minT) minT = n;
          if (n > maxB) maxB = n;
          const ti = st.idx(m, n);
          st.flags[ti] = 1;
          st.type[ti] = T7;
          genSquareTileFrame(st, rng, m, n);
        }
      }
    }
    vx += nvx; vy += nvy;
    nvx += NX(-20, 21) * 0.05;
    if (nvx > 1.0) nvx = 1.0;
    if (nvx < -1.0) nvx = -1.0;
    if (nvy > 0.2) nvy = -0.2;
    if (nvy < -0.2) nvy = -0.2;
  }

  // ---- 下缘台阶团（cs:23381-23435）----
  let cur = minL + N1(5);                             // num26 += Next(5)
  while (cur < maxR) {
    let drop = maxB + 10;                             // num27
    let dead = false;
    while (!st.flags[st.idx(cur, drop)]) {
      drop--;
      if (drop <= 0) { dead = true; break; }
    }
    if (dead) {
      cur += N1(5);
      continue;                                       // cs 分支内 num27 重置为本轮 maxB 后回环等价
    }
    drop += NX(-3, 4);
    const rad = NX(4, 8);                             // num28
    let stamp = T7;                                   // num29
    if (N1(4) === 0) stamp = T9;
    for (let a = cur - rad; a <= cur + rad; a++) {
      for (let b = drop - rad; b <= drop + rad; b++) {
        if (!st.inBounds(a, b) || b <= minT) continue;
        const da = Math.abs(a - cur);
        const db = Math.abs(b - drop) * 2;
        if (Math.sqrt(da * da + db * db) < rad + N1(2)) {
          const ti = st.idx(a, b);
          st.flags[ti] = 1;
          st.type[ti] = stamp;
          genSquareTileFrame(st, rng, a, b);
        }
      }
    }
    cur += NX(rad, Math.trunc(rad * 1.5));            // Next(num28,(int)(num28*1.5))
  }

  // ---- stage2 内芯重涂（cs:23437-23529）----
  radius = radius0 * 0.800000011920929;               // 0.8f 十进制展开
  let steps2 = NX(10, 15);
  vx = i; vy = minT;
  nvx = NX(-20, 21) * 0.2;
  while (nvx > -2.0 && nvx < 2.0) nvx = NX(-20, 21) * 0.2;
  nvy = NX(-20, -10) * 0.02;
  while (radius > 0.0 && steps2 > 0.0) {
    radius -= N1(4);
    steps2--;
    let lo = Math.trunc(vx - radius * 0.5);
    let hi = Math.trunc(vx + radius * 0.5);
    const bt = minT - 1;
    let bb = Math.trunc(vy + radius * 0.5);
    if (lo < 0) lo = 0;
    if (hi > w) hi = w;
    if (bb > h) bb = h;
    const scale = radius * NX(80, 120) * 0.01;
    let surf = vy + 1.0;
    for (let m = lo; m < hi; m++) {
      if (N1(2) === 0) surf += NX(-1, 2);
      if (surf < vy) surf = vy;
      if (surf > vy + 2.0) surf = vy + 2.0;
      for (let n = bt; n < bb; n++) {
        if (!st.inBounds(m, n) || !(n > surf)) continue;
        const dxv = Math.abs(m - vx);
        const dyv = Math.abs(n - vy) * ryB;
        if (Math.sqrt(dxv * dxv + dyv * dyv) < scale * 0.4 && st.type[st.idx(m, n)] === T7) {
          const ti = st.idx(m, n);
          if (liquidKind >= 0) {
            st.liquid[ti] = 255;
            st.liquidType[ti] = liquidKind + 1;      // 原 0 基水/岩浆/蜜/微光→仓 +1
            st.flags[ti] = 0;
          } else {
            st.type[ti] = N4;
          }
          genSquareTileFrame(st, rng, m, n);
        }
      }
    }
    if (liquidKind >= 0) { vx += nvx; vy -= 0.5; }
    else {
      vx += nvx; vy += nvy;
      nvx += NX(-20, 21) * 0.05;
    }
    if (nvx > 1.0) nvx = 1.0;
    if (nvx < -1.0) nvx = -1.0;
    if (nvy > 0.2) nvy = -0.2;
    if (nvy < -0.2) nvy = -0.2;
  }

  // ---- 液芯盖顶/换块上缘扫描（cs:23531-23594）----
  {
    let cur2 = minL + N1(5);                          // num39
    while (cur2 < maxR) {
      let probe = maxB;                               // num40
      if (liquidKind >= 0) {
        while (cur2 < maxR && st.liquid[st.idx(Math.min(Math.max(cur2, 0), w - 1), probe)] === 0) {
          probe--;
          if (probe < minT) { probe = maxB; cur2 += NX(1, 4); }
        }
      } else {
        while (cur2 < maxR &&
               (!st.flags[st.idx(cur2, probe)] || st.type[st.idx(cur2, probe)] !== N4)) {
          probe--;
          if (probe < minT) { probe = maxB; cur2 += NX(1, 4); }
        }
      }
      if (cur2 >= maxR) break;
      probe += NX(0, 4);
      const rad = NX(2, 8);                           // num41
      for (let a = cur2 - rad; a <= cur2 + rad; a++) {
        for (let b = probe - rad; b <= probe + rad; b++) {
          if (!st.inBounds(a, b) || b <= minT) continue;
          const da = Math.abs(a - cur2);
          const db = Math.abs(b - probe) * 2;
          if (Math.sqrt(da * da + db * db) < rad) {
            const ti = st.idx(a, b);
            st.type[ti] = T7;
            if (liquidKind >= 0) st.flags[ti] = 1;
            genSquareTileFrame(st, rng, a, b);
          }
        }
      }
      cur2 += NX(rad, Math.trunc(rad * 1.5));
    }
  }

  // ---- 微光池壳（cs:23596-23699，仅 style 1）----
  if (islandStyle === 1) {
    radius = NX(40, 51);                              // Next(40,51)
    let steps3 = NX(3, 5);
    vx = i; vy = minT;
    nvx = NX(-20, 21) * 0.2;
    while (nvx > -2.0 && nvx < 2.0) nvx = NX(-20, 21) * 0.2;
    while (radius > 0.0 && steps3 > 0.0) {
      radius -= N1(4);
      steps3--;
      let lo = Math.trunc(vx - radius * 0.5);
      let hi = Math.trunc(vx + radius * 0.5);
      const bt = minT - 1;
      let bb = Math.trunc(vy + radius * 0.5);
      if (lo < 0) lo = 0;
      if (hi > w) hi = w;
      if (bb > h) bb = h;
      const scale = radius * NX(80, 120) * 0.01;
      let surf = vy + 1.0;                            // num47（此循环无逐列抖动掷！）
      for (let m = lo; m < hi; m++) {
        if (surf < vy) surf = vy;
        if (surf > vy + 2.0) surf = vy + 2.0;
        for (let n = bt; n < bb; n++) {
          if (!st.inBounds(m, n)) continue;
          const ta = st.idx(m, n);
          if (n > surf) {
            const dxv = Math.abs(m - vx);
            const dyv = Math.abs(n - vy) * 1.3;
            const dist = Math.sqrt(dxv * dxv + dyv * dyv);
            if (dist < scale * 0.4) {
              const shA = st.liquid[ta] > 0 && st.liquidType[ta] === 4;
              if (!shA) { st.type[ta] = T11; st.flags[ta] = 1; }
              if (st.inBounds(m, n + 1)) {
                const tb = st.idx(m, n + 1);
                const shB = st.liquid[tb] > 0 && st.liquidType[tb] === 4;
                if (!shB) { st.type[tb] = T11; st.flags[tb] = 1; }
              }
              genSquareTileFrame(st, rng, m, n);
            }
            if (dist < scale * 0.3) {
              st.flags[ta] = 0;
              st.liquid[ta] = 255;
              st.liquidType[ta] = 4;
              if (st.inBounds(m, n - 1)) {
                const tc = st.idx(m, n - 1);
                if (st.flags[tc]) {
                  st.flags[tc] = 0;
                  st.liquid[tc] = 255;
                  st.liquidType[tc] = 4;
                }
              }
              genSquareTileFrame(st, rng, m, n);
            }
          }
          if (n > surf - 5.0 && n <= surf) {
            st.flags[ta] = 0;
          }
        }
      }
      vx += nvx;
      nvx += NX(-20, 21) * 0.05;
      if (nvx > 1.0) nvx = 1.0;
      if (nvx < -1.0) nvx = -1.0;
    }
  }

  // ---- 衬墙涂布（cs:23701-23727）：满空九邻刷 W10 后 SquareWallFrame 9 邻 ----
  for (let a = minL - 20; a <= maxR + 20; a++) {
    for (let b = minT - 20; b <= maxB + 20; b++) {
      if (!st.inBounds(a, b)) continue;
      let alone = true;
      for (let k = a - 1; k <= a + 1 && alone; k++) {
        for (let l = b - 1; l <= b + 1 && alone; l++) {
          if (!st.inBounds(k, l)) continue;
          const ti = st.idx(k, l);
          if (!st.flags[ti] || (st.wall[ti] > 0 && st.wall[ti] !== W10)) alone = false;
        }
      }
      if (alone) {
        st.wall[st.idx(a, b)] = W10;
        // ★IIIII44 关键修正：Framing.WallFrame 仅在 resetFrame=true（=中心）且
        //   非大帧型时掷 1×Next(0,3)（Framing.cs:384-392）；邻居八调 wall==0 早退、
        //   已涂邻格默认 resetFrame=false 同零掷 ⇒ SquareWallFrame 每格恰【一次】掷。
        //   x86 标签流 WallFrame 计数=7544=墙格数一比一实证；曾按九邻逐调=3×过掷。
        squareWallFrameRoll(st, rng, a, b);
      }
    }
  }

  // ---- 凝固器投撒（cs:23728-23767，style 0/13 且 spawnSolidifier）----
  if ((islandStyle === 0 || islandStyle === 13) && spawnAddonProp(gs.seedFlags)) {
    let going = true;
    let tries = 10000;                                 // num57
    let spread = 20;                                   // num58
    const SOLIDIFIER = sheetId(220);
    while (going && tries > 0) {
      tries--;
      if (tries % 20 === 0) spread++;
      let col = NX(i - spread, i + spread);            // Next(value 上界开)
      col = Math.min(Math.max(col, minL), maxR);       // Utils.Clamp
      let yy = 6;                                      // num60=num59+1
      if (!st.inBounds(col, yy)) continue;             // InWorld(col,yy,5) 近似为界内
      while (!st.flags[st.idx(col, yy)] && yy < h - 10) yy++;
      if (yy >= h - 10 && !st.flags[st.idx(col, yy)]) continue;
      if (st.type[st.idx(col, yy)] === N4) {
        yy--;
        const placedOK = place3x3AnchorUp(st, col, yy, SOLIDIFIER);
        if (placedOK) genSquareTileFrame(st, rng, col, yy);   // PlaceTile 分派尾框架
        // 成功与否按原版以放置结果定（PlaceTile 内 flag 门），此处按位置查证
        if (st.type[st.idx(col, yy)] === SOLIDIFIER && st.flags[st.idx(col, yy)]) {
          if (st.inBounds(col, yy - 1) && st.type[st.idx(col, yy - 1)] === SOLIDIFIER) going = false;
        }
      }
    }
  }

  // ---- 以太单体 + 音乐盒（cs:23768-23807，仅 style 1）----
  if (islandStyle === 1) {
    const MONO = sheetId(658), MB = sheetId(139);
    for (let attempt = 0; attempt < 2; attempt++) {
      let placed = false;
      let tries = 10000;                               // num62
      let spread = 10;                                 // num63
      while (!placed && tries > 0) {
        tries--;
        if (tries % 50 === 0) spread++;
        let col = NX(i - spread, i + spread);
        col = Math.min(Math.max(col, minL), maxR);
        let yy = minT - 30;                            // num64
        if (!st.inBounds(col, yy)) continue;
        while (!st.flags[st.idx(col, yy)] && yy < h - 10) yy++;
        const here = st.type[st.idx(col, yy)];
        if (here !== N4 && here !== T11) continue;
        yy--;
        const lc = st.idx(col, yy);
        if (st.liquid[lc] !== 0) continue;
        const r1 = st.inBounds(col + 2, yy + 1) ? st.liquid[st.idx(col + 2, yy + 1)] : 255;
        const r2 = st.inBounds(col - 1, yy + 1) ? st.liquid[st.idx(col - 1, yy + 1)] : 255;
        if (r1 !== 0 || r2 !== 0) continue;
        if (attempt === 0) {
          if (!place2xX(st, col, yy, MONO, 0, 3)) continue;
          genSquareTileFrame(st, rng, col, yy);
          if (st.type[lc] === MONO) { switchMonolith658(st, col, yy); placed = true; }
        } else {
          if (tries <= 2000 || !isTileNearbySheet(st, col, yy, 658, 10)) {
            if (!placeMB(st, col, yy, MB, 87)) continue;
            genSquareTileFrame(st, rng, col, yy);
            if (st.type[lc] === MB) { switchMB(st, col, yy); placed = true; }
          }
        }
      }
      void placed;
    }
  }

  // ---- 上浮小团（cs:23809-23852）----
  {
    const blobCount = N1(4);                           // num65
    for (let bl = 0; bl <= blobCount; bl++) {
      const bx = NX(minL - 5, maxR + 5);               // num67
      const by = minT - NX(20, 40);                    // num68（负向 Next(20,40)）
      const brad = NX(4, 8);                           // num69
      let stamp = T8;
      if (N1(2) === 0) stamp = T9;
      for (let a = bx - brad; a <= bx + brad; a++) {
        for (let b = by - brad; b <= by + brad; b++) {
          if (!st.inBounds(a, b)) continue;            // InWorld 双参（无 margin）
          const da = Math.abs(a - bx);
          const db = Math.abs(b - by) * 2;
          if (Math.sqrt(da * da + db * db) < brad + NX(-1, 2)) {
            const ti = st.idx(a, b);
            st.flags[ti] = 1;
            st.type[ti] = stamp;
            genSquareTileFrame(st, rng, a, b);
          }
        }
      }
    }
  }

  // ---- 矿脉重染（cs:23854-23877，num6>0 才走）----
  if (recolorTo > 0) {
    let counterpart = 0;                               // num75
    if (recolorTo === 60 || recolorTo === 70) counterpart = 59;
    if (recolorTo === 633) counterpart = 57;
    const TC = counterpart ? sheetId(counterpart) : -999;
    const T6 = sheetId(recolorTo);
    for (let a = minL - 20; a <= maxR + 20; a++) {
      for (let b = j - 50; b <= j + 50; b++) {
        if (!st.inBounds(a, b)) continue;
        const ti = st.idx(a, b);
        if (st.flags[ti] && st.type[ti] === TC && !surroundedBySolid3(st, a, b)) {
          st.type[ti] = T6;
        }
      }
    }
  }

  // LandmassData 登记（cs:23806-23816 语义，GSB 尾）——团队落点查询备用
  gs.skyblockIslands.push({ x: i, y: j, style: islandStyle, extraData });
  return true;
}

// ---------------------------------------------------------------------------
// GenerateSkyBlockWorld（cs:22725-23021）
// ---------------------------------------------------------------------------

export function runSkyblockPass(st: TileStore, rng: RNG, gs: GenState, world: World): void {
  const w = st.w, h = st.h;
  const sf = gs.seedFlags;
  const ws = gs.worldSurface;
  const uw = UW_OF(h);
  const BD = 380;
  const NX = (a: number, b: number): number => rng.nextIntRange(a, b);
  const N1 = (a: number): number => rng.nextInt(a);        // Next(max)
  // （0.3f/0.7f 十进制展开）
  const F03 = 0.300000011920929;
  const F07 = 0.699999988079071;

  // cs:22726-22738：flag 编译期恒 false；flag2 仅组合种子置位
  const flag = false;
  const biomeLoopN = Math.trunc(w / 420);
  let flag2 = false;
  if (flag || sf.extraLiquid || sf.noInfection || sf.surfaceIsDesert ||
      sf.worldIsFrozen || sf.hallowOnTheSurface || sf.infectedSeed || sf.surfaceIsMushrooms) {
    flag2 = true;
  }

  // 全图抹平（cs:22742-22749 active(false)+type=0；此时序先行于一切岛写）
  st.type.fill(0);
  st.flags.fill(0);
  // 防御清残留（Terrain 阶段无液体/坡/半砖；导入复跑安全）
  st.liquid.fill(0); st.liquidType.fill(0);
  st.half.fill(0); st.slope.fill(0); st.wall.fill(0);

  // 出生带抽取（cs:22768-22812）
  let sx: number, sy: number;
  if (sf.randomSpawn || sf.vampireSeed) {
    sx = NX(Math.trunc(w * 0.2), Math.trunc(w * 0.8));
    sy = NX(Math.trunc(ws + 200.0), h - 400);
  } else if (sf.remix) {
    sx = NX(Math.trunc(w * 0.45), Math.trunc(w * 0.55));
    sy = NX(uw + 80, uw + 120);
  } else if (sf.noSurface) {
    sx = NX(Math.trunc(w * 0.45), Math.trunc(w * 0.55));
    sy = NX(Math.trunc(gs.rockLevel * 0.3), Math.trunc(gs.rockLevel * 0.8));
  } else if (sf.surfaceIsInSpace) {
    sx = NX(Math.trunc(w * 0.45), Math.trunc(w * 0.55));
    let lo = Math.trunc(h * 0.05); if (lo < 100) lo = 100;
    let hi = Math.trunc(h * 0.08); if (hi < 130) hi = 130;
    sy = NX(lo, hi);
  } else {
    sx = NX(Math.trunc(w * 0.45), Math.trunc(w * 0.55));
    sy = NX(Math.trunc(ws * 0.6), Math.trunc(ws * 0.8));
  }

  // 主岛（style 0）
  skyblockIsland(st, rng, gs, sx, sy, 0);

  // 团队出生岛支（cs:22816-22830）：teamBasedSpawns 为多人设置，单机链不进（备案）

  // 微光池岛（cs:22834-22876）
  if (flag || spawnAddonProp(sf)) {
    let done = false;
    for (let att = 200; att > 0; att--) {
      let yy = sy + NX(-50, 50);
      if (att < 25) yy = 90 + N1(30);
      let xx = sx >= w / 2
        ? NX(BD + 200, Math.trunc(w * F03))
        : NX(Math.trunc(w * F07), w - BD - 200);
      xx = Math.min(Math.max(xx, BD + 200), w - BD - 200);
      yy = Math.min(Math.max(yy, 80), h - 80);
      if (att < 100) {
        let pick = rng.next();
        pick = pick < 0.5
          ? 0.0499999988824129 + pick * (0.5 - 0.0499999988824129) / 0.5
          : 0.550000011920929 + (pick - 0.5) * (0.95 - 0.550000011920929) / 0.5;
        xx = Math.trunc(w * pick);
      }
      if (skyblockIsland(st, rng, gs, xx, yy, 1)) { done = true; break; }
    }
    if (!done) {
      const xx = sx >= w / 2
        ? NX(BD + 200, Math.trunc(w * F03))
        : NX(Math.trunc(w * F07), w - BD - 200);
      skyblockIsland(st, rng, gs, xx, 90, 1);
    }
  }

  // 出生扫描（cs:22878-22901）
  let sscan = sy;
  while ((!st.flags[st.idx(sx, sscan)] || st.type[st.idx(sx, sscan)] === 0) && sscan < h - 1) sscan++;
  if (sscan > h - 10) {
    sscan = 0;
    while (sscan < h && !st.flags[st.idx(sx, sscan)]) sscan++;
  }
  if (sscan > h - 10) sscan = sy;
  world.spawnX = sx; world.spawnX0 = sx;
  world.spawnY = sscan; world.spawnY0 = sscan;

  // 组合种子 BIOME 岛带（cs:22903-22996；num23 基线在循环外算好）
  if (flag2) {
    const num23 = ws < 200 ? Math.trunc((Math.trunc(200 + gs.rockLevel / 2)) / 2) : ws;
    for (let l = 0; l < biomeLoopN; l++) {
      if (flag || sf.extraLiquid) {
        if (l === 0) {
          skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(100, num23 - 50), 9);
        } else if (l === 1) {
          skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(num23 + 200, h - 70), 10);
        } else {
          if (sf.notTheBees && l === 2) {
            skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(100, uw - 100), 11);
          } else if (sf.tenthAnniversary && sf.drunkWorld && l === 3) {
            skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(num23 + 200, uw - 100), 11);
          } else {
            let pick = N1(4);
            while ((pick === 2 && !sf.notTheBees) || (pick === 3 && (!sf.tenthAnniversary || !sf.drunkWorld))) {
              pick = N1(4);
            }
            const py = NX(100, uw - 100);
            if (pick <= 1) pick = py > (gs.rockLevel + uw) / 2 ? 1 : 0;
            skyblockIsland(st, rng, gs, NX(BD, w - BD), py, 9 + pick);
          }
        }
      }
      if (flag || sf.noInfection) {
        if (l === 0) skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(100, num23 - 50), 4);
        else if (l <= biomeLoopN / 5 + 1) skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(uw + 30, h - 70), 4);
        else skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(100, h - 100), 4);
      }
      if (flag || sf.surfaceIsDesert) {
        if (l === 0) skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(100, num23 - 50), 3);
        else skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(100, uw - 100), 3);
      }
      if (flag || sf.worldIsFrozen) {
        if (l === 0) skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(100, num23 - 50), 2);
        else skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(100, uw - 100), 2);
      }
      if (flag || sf.hallowOnTheSurface) {
        if (l === 0) skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(100, num23 - 50), 5);
        else skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(100, uw - 100), 5);
      }
      if (flag || sf.infectedSeed) {
        const rollEvil = (): number => (sf.drunkWorld ? NX(6, 8) : (gs.crimson ? 7 : 6));
        if (l === 0) skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(100, num23 - 50), rollEvil());
        else skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(100, uw - 100), rollEvil());
      }
      if (flag || sf.surfaceIsMushrooms) {
        skyblockIsland(st, rng, gs, NX(BD, w - BD), NX(num23 + 200, uw - 100), 8);
      }
    }
  }

  // 地牢清除（cs:22998-22999）
  gs.dungeonX = -1; gs.dungeonY = -1;

  // 活树附岛登记（cs:23000-23007，extraLivingTrees 组合；GrowLivingTree 调用在管线接线处）
  if (sf.extraLivingTrees) {
    let dxo = NX(40, 80);
    if (N1(2) === 0) dxo = -dxo;
    gs.skyblockExtraTreeAt = { x: sx + dxo, y: sy };
  }

  // poo/errorWorld 直调支（cs:23008-23013）——DoPooEverywhere/DoErrorWorldShuffleBlocks
  //   未在本仓 DoEnds 落地（组合种子专用），备案 GAP-IIII44。

  gs.worldSpawnHasBeenRandomized = true;               // cs:23015
  if (sy > ws && sy < uw) {
    doAdditionalChangesAroundSpawnCore(st, rng, gs, world);  // cs:23016-23019
  }
}
