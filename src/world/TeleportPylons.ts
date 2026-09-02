// 传送晶塔网络 1:1 移植（Terarria1456：
//   Terraria.GameContent/TeleportPylonsSystem.cs —— 传送门禁 + 生物群系要求
//   Terraria.GameContent.Tile_Entities/TETeleportationPylon.cs —— 样式/物品映射
//   Terraria.GameContent/TeleportPylonType.cs —— 11 型枚举
//   Player.cs:31707-31747 —— 右键 597 开全屏地图并对焦全部晶塔包围盒
//   Terraria.Map/TeleportPylonsMapLayer.cs —— 地图图标/连线/左键点图标传送）
//
// 右键晶塔（Player.cs:31707-31747 1:1）：
//   TryOpeningFullscreenMap + MapPylonTile = 点击格按帧回推的 3×4 锚点；
//   视口对焦"本塔+全部晶塔"包围盒外扩 20 格的中心，缩放适配屏宽高。
//
// 点地图图标传送（TeleportPylonsMapLayer.cs:77-127 → HandleTeleportRequest :100-205）：
//   门禁五连（任一失败 → 聊天 Net.CannotTeleportToPylon* 文案，不传送）：
//   1) IsPlayerNearAPylon：玩家 ±60 格内有 597（TileReachCheckSettings.Pylons，
//      DataStructures/TileReachCheckSettings.cs:34-37）
//   2) 目标塔 NPC 足量：Victory 塔 0 只，其余 2 只（HowManyNPCsDoesPylonNeed :314-323）；
//      判定 = 塔心 169×124 窗内含入住 NPC 家，且 NPC 现位距家 <100 格
//      （DoesPositionHaveEnoughNPCs :224-247）
//   3) 蜥蜴神庙早入门禁：目标塔在 worldSurface 以下且墙 87 且 !downedPlantBoss（:145-152）
//   4) 目标塔生物群系要求（DoesPylonAcceptTeleportation :254-312）
//   5) 当前所在塔同样过 NPC+群系门（:155-192，失败文案按最接近的档位）
//   全过 → 落位 = 塔锚 ToWorldCoordinates()（玩家盒底贴塔顶，:194-200）。
import type { World } from './World';
import type { SceneFlags } from './SceneMetrics';
import { TILE_BY_KEY } from '../data/tiles';

/** TeleportPylonType.cs:3-16（枚举值 = 晶塔样式 = tile frameX/54） */
export const PYLON = {
  SurfacePurity: 0, Jungle: 1, Hallow: 2, Underground: 3, Beach: 4,
  Desert: 5, Snow: 6, GlowingMushroom: 7, Victory: 8, Underworld: 9, Shimmer: 10,
} as const;

/** 已放置晶塔（TeleportPylonInfo：锚点 = 3×4 左上格 + 类型） */
export interface TeleportPylonInfo {
  x: number;          // 锚点 tile X（TETeleportationPylon.IsTileValidForEntity :137-149）
  y: number;          // 锚点 tile Y
  type: number;       // TeleportPylonType（枚举直转，:161-163）
}

/** GetPylonStyleFromTile（TETeleportationPylon.cs:128-131）：frameX/54 */
export function pylonStyleFromFrame(frameX: number): number {
  return Math.floor(frameX / 54);
}

/** GetPylonItemTypeFromTileStyle（:133-152）：样式 → 放置物品（0 → 4876 纯净） */
export function pylonItemTypeFromStyle(style: number): number {
  switch (style) {
    case 1: return 4875;
    case 2: return 4916;
    case 3: return 4917;
    case 4: return 4918;
    case 5: return 4919;
    case 6: return 4920;
    case 7: return 4921;
    case 8: return 4951;
    case 9: return 5652;
    case 10: return 5653;
    default: return 4876;
  }
}

/** 全表扫描已放置晶塔（锚点判定 = IsTileValidForEntity :137-149：
 *  frameY===0 且 frameX%54===0——3×4 物件左上格）。
 *  UpdatePylonsListAndBroadcastChanges（TeleportPylonsSystem.cs:60-85）的等价：
 *  原版每 10s 冷却扫 TileEntity 表，此处按需整表扫（打开地图/放置/移除时调用） */
export function scanPylons(world: World): TeleportPylonInfo[] {
  const st = world.store;
  const tileId = TILE_BY_KEY['v_597_pylons'];
  if (!tileId) return [];
  const out: TeleportPylonInfo[] = [];
  for (let y = 0; y < st.h; y++) {
    const row = y * st.w;
    for (let x = 0; x < st.w; x++) {
      const i = row + x;
      // ★幽灵保域（2026-09-03）：active() 门（原版 TETeleportationPylon.cs:136
      //  `!Main.tile[x,y].active() || type != 597 …`）——幽灵晶塔残型不算已放置
      if (st.type[i] !== tileId || (st.flags[i] & 1) === 0) continue;
      if (st.frameY[i] !== 0 || st.frameX[i] % 54 !== 0) continue;
      out.push({ x, y, type: pylonStyleFromFrame(st.frameX[i]) });
    }
  }
  return out;
}

/** HasPylonOfType（:41-44）：同型晶塔全图仅一座（放置门 PlacementPreviewHook_CheckIfCanPlace :158-166） */
export function hasPylonOfType(pylons: TeleportPylonInfo[], type: number): boolean {
  return pylons.some((p) => p.type === type);
}

/** 点击格 → 晶塔锚点（Player.cs:31713-31715：x - frameX/18%3, y - frameY/18%4） */
export function pylonAnchorAt(world: World, x: number, y: number): { x: number; y: number } | null {
  const st = world.store;
  const tileId = TILE_BY_KEY['v_597_pylons'];
  if (!tileId || !st.inBounds(x, y) || st.get(x, y) !== tileId) return null;
  const i = st.idx(x, y);
  return {
    x: x - Math.floor(st.frameX[i] / 18) % 3,
    y: y - Math.floor(st.frameY[i] / 18) % 4,
  };
}

/** IsPlayerNearAPylon（:209-212 → IsTileTypeInInteractionRange Player.cs:扫 ±60 盒内
 *  任意 597 格）。玩家盒 tile 尺寸：20×42px → 2×3（GetTileRegion Player.cs:48-58）。
 *  塔为 3×4 物件——按足迹与玩家 ±60 盒求交判定 */
export function isPlayerNearPylon(
  pylons: TeleportPylonInfo[], playerTileX: number, playerTileY: number,
  playerTileW = 2, playerTileH = 3,
): boolean {
  const LX = playerTileX - 60, HX = playerTileX + playerTileW - 1 + 60;
  const LY = playerTileY - 60, HY = playerTileY + playerTileH - 1 + 60;
  return pylons.some((p) =>
    p.x + 2 >= LX && p.x <= HX && p.y + 3 >= LY && p.y <= HY);
}

/** HowManyNPCsDoesPylonNeed（:314-323）：Victory 塔 0，其余 2 */
export function npcsNeeded(type: number): number {
  return type === PYLON.Victory ? 0 : 2;
}

export interface NpcHomeLike { homeX: number; homeY: number; x: number; y: number; }

/** DoesPositionHaveEnoughNPCs（:224-247）：塔心 169×124 窗（SceneMetrics.ZoneScanSize）
 *  内含入住 NPC 的家，且 NPC 现位距家 <100 格（tiles）即计数 -1 */
export function positionHasEnoughNpcs(
  need: number, centerX: number, centerY: number, npcs: NpcHomeLike[],
): boolean {
  if (need <= 0) return true;
  let left = need;
  const halfW = 84, halfH = 62;   // ZoneScanSize 169×124（中心对齐 scanScene 采样窗）
  for (const n of npcs) {
    if (Math.abs(n.homeX - centerX) > halfW || Math.abs(n.homeY - centerY) > halfH) continue;
    const d = Math.hypot(n.homeX - n.x, n.homeY - n.y);
    if (d < 100) {
      left--;
      if (left === 0) return true;
    }
  }
  return false;
}

/** 蜥蜴神庙早入门禁输入：目标塔格是否神庙墙 87 且在 worldSurface 以下 */
export function isInLihzahrdTempleEarly(world: World, x: number, y: number): boolean {
  const st = world.store;
  if (y <= world.groundLevel) return false;
  return st.inBounds(x, y) && st.wall[st.idx(x, y)] === 87;
}

/** DoesPylonAcceptTeleportation（:254-312）：按塔型的生物群系/深度要求。
 *  scene = 塔位 scanScene 结果（Zone 判定即原版 EnoughTilesFor* 阈值判定）；
 *  remixWorld 分支不适用（本作无颠倒世界）。 */
export function pylonAcceptsTeleportation(
  type: number, world: World, scene: SceneFlags, x: number, y: number,
): boolean {
  const w = world.store.w;
  const nearEdge = x >= w - 380 || x <= 380;   // Beach/纯净共用 380 门（:269/:289）
  switch (type) {
    case PYLON.SurfacePurity: {
      // :260-278：地表 + 非边缘 + 无任何主要群系 tile 达标
      const surface = y <= world.groundLevel;
      if (!surface || nearEdge) return false;
      return !(scene.zoneJungle || scene.zoneSnow || scene.zoneDesert
        || scene.zoneGlowshroom || scene.zoneHallow || scene.zoneCrimson || scene.zoneCorrupt);
    }
    case PYLON.Jungle:
      return scene.zoneJungle;                        // :280
    case PYLON.Hallow:
      return scene.zoneHallow;                        // :296
    case PYLON.Underground:
      return y >= world.groundLevel;                  // :298（worldSurface 含）
    case PYLON.Beach: {
      // :284-294：地表浅层（worldSurface*0.35 < y ≤ worldSurface）+ 世界边缘 380
      const depthOk = y <= world.groundLevel && y > world.groundLevel * 0.3499999940395355;
      return nearEdge && depthOk;
    }
    case PYLON.Desert:
      return scene.zoneDesert;                        // :282
    case PYLON.Snow:
      return scene.zoneSnow;                          // :278→case Snow
    case PYLON.GlowingMushroom:
      return scene.zoneGlowshroom;                    // :288（remix 深度门不适用）
    case PYLON.Victory:
      return true;                                    // :300
    case PYLON.Underworld:
      // Main.UnderworldLayer = maxTilesY-200（Main.cs:2886;System:305-306）——
      // ★R21-D2：曾用 GenVars.lavaLine（=waterLine+rng(50,79),gen 侧变量）当门 →
      // 中小世界提前数百格放行。SceneMetrics.ts:250 同款误用已修,此处补齐
      return y >= world.store.h - 200;
    case PYLON.Shimmer:
      // :304-306 EnoughTilesForShimmer：窗口微光液格计数 ≥300
      // （SceneMetrics.cs:37 ShimmerTileThreshold；曾以微光腔中心距 125 近似）
      return scene.shimmerTileCount >= 300;
    default:
      return true;                                    // :308
  }
}

/** 门禁判定结果（HandleTeleportRequest :100-205）。fail = Net.* 文案键，null = 通过 */
export interface PylonTeleportCheck {
  ok: boolean;
  fail: string | null;
}

export interface PylonGateInput {
  /** 玩家 tile 坐标（position.X/16 取整） */
  playerTileX: number; playerTileY: number;
  /** 目标塔 */
  target: TeleportPylonInfo;
  /** 当前所在塔（玩家 ±60 格内可达且过门的那座；无则 fail=NotNearAPylon 档） */
  current: TeleportPylonInfo | null;
  /** 入住城镇 NPC（家 + 现位，tile 单位） */
  npcs: NpcHomeLike[];
  /** 目标塔位的群系扫描 */
  targetScene: SceneFlags;
  /** 当前塔位的群系扫描（无 current 时可传 EMPTY_SCENE） */
  currentScene: SceneFlags;
  downedPlantBoss: boolean;
}

/** HandleTeleportRequest 门禁五连（:100-205）。传送副作用由调用方执行（落位见文件头）。 */
export function checkPylonTeleport(world: World, g: PylonGateInput): PylonTeleportCheck {
  // 1) 玩家在晶塔旁（:105-109）——current 由调用方按"最近可达塔"求出，无则直接失败档
  if (!g.current) {
    return { ok: false, fail: 'Net.CannotTeleportToPylonBecausePlayerIsNotNearAPylon' };
  }
  // 2) 目标塔 NPC 足量（:111-118）
  const needTarget = npcsNeeded(g.target.type);
  if (!positionHasEnoughNpcs(needTarget, g.target.x, g.target.y, g.npcs)) {
    return { ok: false, fail: 'Net.CannotTeleportToPylonBecauseNotEnoughNPCs' };
  }
  // 3) 蜥蜴神庙早入（:120-128）
  if (!g.downedPlantBoss && isInLihzahrdTempleEarly(world, g.target.x, g.target.y)) {
    return { ok: false, fail: 'Net.CannotTeleportToPylonBecauseAccessingLihzahrdTempleEarly' };
  }
  // 4) 目标塔群系要求（:130-136）
  if (!pylonAcceptsTeleportation(g.target.type, world, g.targetScene, g.target.x, g.target.y)) {
    return { ok: false, fail: 'Net.CannotTeleportToPylonBecauseNotMeetingBiomeRequirements' };
  }
  // 5) 当前塔同样过 NPC + 群系门（:138-192；失败文案按最接近档位）
  const needCurrent = npcsNeeded(g.current.type);
  const npcOk = positionHasEnoughNpcs(needCurrent, g.current.x, g.current.y, g.npcs);
  const biomeOk = pylonAcceptsTeleportation(g.current.type, world, g.currentScene, g.current.x, g.current.y);
  if (!npcOk || !biomeOk) {
    const fail = !npcOk
      ? 'Net.CannotTeleportToPylonBecauseNotEnoughNPCsAtCurrentPylon'
      : 'Net.CannotTeleportToPylonBecauseNotMeetingBiomeRequirements';
    return { ok: false, fail };
  }
  return { ok: true, fail: null };
}

/** 地图对焦包围盒（Player.cs:31717-31747）：本塔 + 全部已揭示塔的包围盒外扩 20 格。
 *  IsRevealed（TeleportPylonsMapLayer.cs:138-146）：单人恒揭示（teamBasedSpawnsSeed
 *  专属种分页）→ 全表纳入。返回中心 + 适配缩放（屏宽高 -40 / 盒宽高 的较小值） */
export function mapFocusRect(
  pylons: TeleportPylonInfo[], origin: { x: number; y: number },
  viewW: number, viewH: number,
): { cx: number; cy: number; scale: number } {
  let x0 = origin.x, y0 = origin.y, x1 = origin.x, y1 = origin.y;
  for (const p of pylons) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  x0 -= 20; y0 -= 20; x1 += 20; y1 += 20;   // rect.Inflate(20,20)（:31726）
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const scale = Math.min((viewW - 40) / w, (viewH - 40) / h);
  return { cx, cy, scale };
}
