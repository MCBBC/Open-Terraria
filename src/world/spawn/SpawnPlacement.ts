// ★SW-BC1 2026-09-06：Player.Spawn 出生落位扫位链 1:1 移植（纯函数形态,tests/sw-bc1-spawn-embed 直测）。
//  用户实报「出生点放方块后重进/重生嵌墙」根因 = 本链整缺（respawnPlayer 原备案注释
//  「★1457 出生扫位链未移植」）。原版锚（Terarria1457/Terraria/Player.cs）：
//  · Spawn_GetPositionAtWorldSpawn        :38003-38006
//  · Spawn_GetPositionAtSpawn             :38008-38089（上 30 行 X±1 三列 → 下 30 行同式）
//  · Spawn_SetPositionAtWorldSpawn        :38091-38101（放置 + 全堵兜底 ForceClearArea）
//  · Spawn_DescendFromDefaultSpace        :38103-38114（二次重试 singleBlockAllowed）
//  · Spawn_DescendFromDefaultSpace_Inner  :38116-38179（50 行下探找地板）
//  · Spawn_ValidSpawnFloor                :38181-38197（地板判别：实心/平台/380）
//  · Spawn_ForceClearArea                 :38199-38220（3×3 破块排水兜底）
//  · Spawn_IsAreaValidSpawn               :38222-38259（3×3 净空：实心/压板/液/伤害底）
//  消费端 = Game.placePlayerAtSpawn（Player.Spawn :37908-37919 三分支的世界点臂）。
//  1458 对照：Player.cs:37905-37919 三分支与扫位函数族逐字同 1457,本域零差分。

import { TileStore } from '../TileStore';
import { TILE_DEFS } from '../../data/tiles';
import { canTileHurt } from '../../stats/TouchDamage';

// ── sheet id 表（内部 id 换算,与 ExtraSpawnsRoyale 同约定） ──────────────────

const SHEET_LUT: Int16Array = (() => {
  const lut = new Int16Array(TILE_DEFS.length);
  for (let t = 0; t < TILE_DEFS.length; t++) lut[t] = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  return lut;
})();
const sheetOf = (internalId: number): number => SHEET_LUT[internalId] ?? -1;

/** TileID.cs:243 `TileID.Sets.Platforms = Factory.CreateBoolSet(19,427,435,436,437,438,439)`——
 *  Spawn_ValidSpawnFloor 的平台腿（:38189）。★不可用 TILE_DEFS.platform 代之：本仓
 *  platform 旗是「可站顶」并族（含桌/工作台等 tileSolid=false 家具）,原版地板腿只认
 *  Platforms 集合 + tileSolid∩!tileSolidTop + 380 花盆箱三支并集 */
const VANILLA_PLATFORM_SHEETS = new Set([19, 427, 435, 436, 437, 438, 439]);

/** WorldGen.InWorld(x, y, 5)（WorldGen.cs:9642-9649）fluff=5 档——IsAreaValidSpawn/
 *  Descend 内的越界格按原版 `continue`（视为不碍事）处理,非拒真 */
function inWorld5(st: TileStore, x: number, y: number): boolean {
  return x >= 5 && y >= 5 && x < st.w - 5 && y < st.h - 5;
}

/** 实心障碍谓词（tileSolid && !tileSolidTop 同构）：本仓 SOLID_LUT=tileSolid,
 *  TILE_DEFS.platform 覆盖 tileSolidTop 可站族——致动位腿由 isActive 承担
 *  （nactive 语义,判例 G1/RD-F7：SolidTile 系 JS 副本必须带 nactive/平台两腿） */
function solidObstacle(st: TileStore, x: number, y: number): boolean {
  const i = st.idx(x, y);
  const tid = st.type[i];
  return TileStore.SOLID_LUT[tid] === 1 && !TILE_DEFS[tid]?.platform;
}

/** Spawn_ValidSpawnFloor（Player.cs:38181-38197）：落脚地板判别。
 *  · tile==null → false（越界同面）；active&&135 压板拒（:38185-38188）
 *  · nactive &&（实心非顶 ‖ Platforms 集 ‖ 380 花盆箱）→ 379 泡沫块再拒（:38189-38192）
 *  消费端 = DescendFromDefaultSpace_Inner 的候选地板步进门 */
export function spawnValidSpawnFloor(st: TileStore, tX: number, tY: number): boolean {
  if (!st.inBounds(tX, tY)) return false;                 // Main.tile[tX,tY]==null
  const i = st.idx(tX, tY);
  if (st.flags[i] === 0) return false;                    // 原版 tile.active() 隐含支
  const tid = st.type[i];
  const sh = sheetOf(tid);
  if (st.hasTile(tX, tY) && sh === 135) return false;     // :38185-38188（裸 active 位）
  if (st.isActive(tX, tY)) {                              // :38189 tile.nactive()
    if ((TileStore.SOLID_LUT[tid] === 1 && !TILE_DEFS[tid]?.platform)
      || VANILLA_PLATFORM_SHEETS.has(sh) || sh === 380) {
      return sh !== 379;                                  // :38190-38192
    }
  }
  return false;
}

/** Spawn_IsAreaValidSpawn（Player.cs:38222-38259）：落脚行上方 3×3 净空门。
 *  · InWorld(5)/tile null → continue（:38225-38228,越界格不碍事）
 *  · 底邻行（j==floorY-1）下方格压板 135 / CanTileHurt（player=null → 灼烧恒伤）
 *    → 拒（:38230-38239）
 *  · 格本体 nactive 压板 135 / 实心非顶 → 拒（:38242-38249）；liquid>0 → 拒（:38250-38252）
 *  · generatingSpawn 双地牢墙门（:38253-38257）运行时调用面无 true 调用方
 *    （vanilla 唯一 true 调用 = WorldGen.cs:19672 noSurface 生成期）→ 不移植（登记） */
export function spawnIsAreaValidSpawn(st: TileStore, floorX: number, floorY: number): boolean {
  for (let i = floorX - 1; i < floorX + 2; i++) {
    for (let j = floorY - 3; j < floorY; j++) {
      if (!inWorld5(st, i, j)) continue;
      const idx = st.idx(i, j);
      const tid = st.type[idx];
      const sh = sheetOf(tid);
      if (j === floorY - 1) {
        if (st.hasTile(i, j + 1)) {                        // tile2.active()
          const bsh = sheetOf(st.type[st.idx(i, j + 1)]);
          if (bsh === 135) return false;                   // :38233-38235
          // :38236-38238 Collision.CanTileHurt(type, i, j+1, null)——player 传 null,
          // TouchDamageHot 支恒伤（TouchDamage.ts canTileHurt 同闸,fireWalk=false）
          if (canTileHurt(st.type[st.idx(i, j + 1)], false)) return false;
        }
      }
      if (st.isActive(i, j)) {                             // :38242 tile.nactive()
        if (sh === 135) return false;                      // :38244-38246
        if (solidObstacle(st, i, j)) return false;         // :38247-38249
      }
      if (st.liquid[idx] > 0) return false;                // :38250-38252
    }
  }
  return true;
}

export interface DescendResult { x: number; y: number; validSpace: boolean }

/** Spawn_DescendFromDefaultSpace_Inner（Player.cs:38116-38179）：从 (x,y) 起 50 行内
 *  找「ValidSpawnFloor 地板 + IsAreaValidSpawn 净空」的站位行,X±1 三列独立记旗,
 *  单列立得住时按 singleBlockAllowed 折行;压板 135 在场即整轮中止（:38128-38131）。 */
function spawnDescendFromDefaultSpaceInner(
  st: TileStore, x: number, y: number, singleBlockAllowed: boolean,
): DescendResult {
  for (let i = 0; i < 50; i++) {
    let flag = false;    // 左列（j==-1）
    let flag2 = false;   // 中列（j==0）
    let flag3 = false;   // 右列（j==+1）
    const num = y + i;
    let num2 = 0;
    for (let j = -1; j <= 1; j++) {
      const num3 = x + j + num2;
      // :38124-38126 InWorld(num3,num,5) ‖ tile[num3,num]==null ‖ tile[num3,num-1]==null
      if (!inWorld5(st, num3, num) || !st.inBounds(num3, num - 1)) continue;
      if (st.isActive(num3, num) && sheetOf(st.type[st.idx(num3, num)]) === 135) {
        return { x, y, validSpace: false };                // :38128-38131 压板中止
      }
      if (spawnValidSpawnFloor(st, num3, num) && spawnIsAreaValidSpawn(st, num3, num)) {
        if (j === -1) flag = true;
        else if (j === 1) flag3 = true;
        else flag2 = true;
      }
    }
    if (!flag2 && (singleBlockAllowed || flag)
      && spawnValidSpawnFloor(st, x - 2, num) && spawnIsAreaValidSpawn(st, x - 1, num)) {
      flag = true; flag2 = true; flag3 = false; num2 = -1; // :38155-38160 左折
    } else if (!flag2 && (singleBlockAllowed || flag3)
      && spawnValidSpawnFloor(st, x + 2, num) && spawnIsAreaValidSpawn(st, x + 1, num)) {
      flag = false; flag2 = true; flag3 = true; num2 = 1;  // :38161-38166 右折
    }
    if (flag2 && (singleBlockAllowed || flag || flag3)) {
      return { x: x + num2, y: y + i, validSpace: true };  // :38167-38172
    }
  }
  return { x, y, validSpace: false };
}

/** Spawn_DescendFromDefaultSpace（Player.cs:38103-38114）：inner 常规一探,
 *  validSpace=false 时以 singleBlockAllowed=true 重试（单列地板也收）。 */
export function spawnDescendFromDefaultSpace(st: TileStore, x: number, y: number): DescendResult {
  let r = spawnDescendFromDefaultSpaceInner(st, x, y, false);
  if (!r.validSpace) r = spawnDescendFromDefaultSpaceInner(st, x, y, true);
  return r;
}

export interface SpawnFloorPlacement { floorX: number; floorY: number; moved: boolean }

/** Spawn_GetPositionAtSpawn（Player.cs:38008-38089）：落位扫位主链。
 *  起点即净空 → Descend 落板, moved=false；起点被堵 → 上 30 行（每行 X±1 三列）
 *  → 下 30 行同式；找到 → Descend 落板, moved=true；全堵 → 返回原点, moved=true
 *  （原版 ref 参数不动而 return true——消费端 Spawn_SetPositionAtWorldSpawn
 *  :38095-38099 据 moved∧终点仍非法走 Spawn_ForceClearArea 兜底）。
 *  原版 `bool flag = true` 死变量（:38010 恒真,X±1 探测恒开）已按语义展开。 */
export function spawnGetPositionAtSpawn(st: TileStore, spawnX: number, spawnY: number): SpawnFloorPlacement {
  let num = spawnX;
  let num2 = spawnY;
  if (!spawnIsAreaValidSpawn(st, num, num2)) {
    let found = false;
    // 上移扫（:38016-38041）——i=0 行同时探测水平 ±1 邻列
    for (let i = 0; i < 30 && !found; i++) {
      if (spawnIsAreaValidSpawn(st, num, num2 - i)) { num2 -= i; found = true; break; }
      if (spawnIsAreaValidSpawn(st, num - 1, num2 - i)) { num--; num2 -= i; found = true; break; }
      if (spawnIsAreaValidSpawn(st, num + 1, num2 - i)) { num++; num2 -= i; found = true; break; }
    }
    // 下移扫（:38044-38069）——仅上移全空时跑（flag2 门）,x 沿用上移可能折过的 num
    for (let j = 0; j < 30 && !found; j++) {
      if (spawnIsAreaValidSpawn(st, num, num2 + j)) { num2 += j; found = true; break; }
      if (spawnIsAreaValidSpawn(st, num - 1, num2 + j)) { num--; num2 += j; found = true; break; }
      if (spawnIsAreaValidSpawn(st, num + 1, num2 + j)) { num++; num2 += j; found = true; break; }
    }
    if (found) {
      const p = spawnDescendFromDefaultSpace(st, num, num2);
      return { floorX: p.x, floorY: p.y, moved: true };
    }
    return { floorX: spawnX, floorY: spawnY, moved: true };  // 全堵兜底锚（:38074-38078）
  }
  const p = spawnDescendFromDefaultSpace(st, num, num2);
  return { floorX: p.x, floorY: p.y, moved: false };
}

/** Spawn_ForceClearArea（Player.cs:38199-38220）：全堵兜底——落脚行上方 3×3 内
 *  实心非顶格 KillTile（默认参 = 掉落开,经注入回调走 Game.breakTile=KillTile 移植面）
 *  + 液格排空（lava 旗清除+liquid=0+SquareTileFrame,注入回调走 setLiquid 通道）。
 *  注入形态供纯测（killTile/clearLiquid 假件断言写面）。 */
export function spawnForceClearArea(
  st: TileStore, floorX: number, floorY: number,
  killTile: (x: number, y: number) => void,
  clearLiquid: (x: number, y: number) => void,
): void {
  for (let i = floorX - 1; i < floorX + 2; i++) {
    for (let j = floorY - 3; j < floorY; j++) {
      if (!st.inBounds(i, j)) continue;                    // WorldGen.InWorld(i,j) fluff=0
      const idx = st.idx(i, j);
      if (st.isActive(i, j) && solidObstacle(st, i, j)) {
        killTile(i, j);                                    // WorldGen.KillTile(i, j)
      }
      if (st.liquid[idx] > 0) clearLiquid(i, j);           // :38212-38217
    }
  }
}
