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
  /** 玩家 ±60 交互盒内的全部晶塔（:149-177 遍历 _pylons 全表逐座尝试——
   *  ★SW-BD1 2026-09-06 前只取首座：玩家同时处于两塔范围内而首座 NPC 门/群系门
   *  败时，原版会继续尝试其余在范围内塔，本仓误拒） */
  currents: TeleportPylonInfo[];
  /** 入住城镇 NPC（家 + 现位，tile 单位） */
  npcs: NpcHomeLike[];
  downedPlantBoss: boolean;
  /** 塔位群系扫描（原版 _sceneMetrics.Scan，Scan 中心 = 锚点 ToWorldCoordinates，
   *  即锚点格左上角世界像素 x*16,y*16）。惰性求：目标塔先扫（:135），当前塔仅在
   *  该座 NPC 门通过后才扫（:167 同序） */
  scanAt: (p: TeleportPylonInfo) => SceneFlags;
}

/** HandleTeleportRequest 门禁五连（:100-205）。传送副作用由调用方执行（落位见文件头）。 */
export function checkPylonTeleport(world: World, g: PylonGateInput): PylonTeleportCheck {
  // 1) 玩家在晶塔旁（:105-112 IsPlayerNearAPylon = ±60 盒内 597 tile 扫描）——
  //  currents 由调用方按交互盒求出，空表即"不在任何晶塔旁"直接失败档
  if (g.currents.length === 0) {
    return { ok: false, fail: 'Net.CannotTeleportToPylonBecausePlayerIsNotNearAPylon' };
  }
  // 2) 目标塔 NPC 足量（:113-121）
  const needTarget = npcsNeeded(g.target.type);
  if (!positionHasEnoughNpcs(needTarget, g.target.x, g.target.y, g.npcs)) {
    return { ok: false, fail: 'Net.CannotTeleportToPylonBecauseNotEnoughNPCs' };
  }
  // 3) 蜥蜴神庙早入（:122-131）
  if (!g.downedPlantBoss && isInLihzahrdTempleEarly(world, g.target.x, g.target.y)) {
    return { ok: false, fail: 'Net.CannotTeleportToPylonBecauseAccessingLihzahrdTempleEarly' };
  }
  // 4) 目标塔群系要求（:132-143）
  if (!pylonAcceptsTeleportation(g.target.type, world, g.scanAt(g.target), g.target.x, g.target.y)) {
    return { ok: false, fail: 'Net.CannotTeleportToPylonBecauseNotMeetingBiomeRequirements' };
  }
  // 5) 玩家侧在范围内逐塔尝试 NPC + 群系门（:145-192，任一座全过即 flag2=true 放行）；
  //  全败时失败文案按 num 档（:180-187）：1=在范围内但 NPC 门全败 → AtCurrentPylon、
  //  2=NPC 过而群系门全败 → BiomeRequirements、0=范围外（step1 已拦，保守同文案）
  let num = 0;
  for (const p of g.currents) {
    if (num < 1) num = 1;
    if (positionHasEnoughNpcs(npcsNeeded(p.type), p.x, p.y, g.npcs)) {
      if (num < 2) num = 2;
      if (pylonAcceptsTeleportation(p.type, world, g.scanAt(p), p.x, p.y)) {
        return { ok: true, fail: null };
      }
    }
  }
  const fail = num === 1
    ? 'Net.CannotTeleportToPylonBecauseNotEnoughNPCsAtCurrentPylon'
    : num === 2
      ? 'Net.CannotTeleportToPylonBecauseNotMeetingBiomeRequirements'
      : 'Net.CannotTeleportToPylonBecausePlayerIsNotNearAPylon';
  return { ok: false, fail };
}

/** SpawnInWorldDust 配色表（TeleportPylonsSystem.cs:338-404）：塔型 → 尘 43
 *  颜色 (r,g,b)。SurfacePurity/Underworld/Shimmer 同色（:345-349/:390-399），
 *  Snow/GlowingMushroom 蓝分量 1.2（XNA 渲染钳 1 → 白/亮蓝） */
export const PYLON_DUST_RGB: Readonly<Record<number, readonly [number, number, number]>> = {
  0: [0.05, 0.8, 0.3], 1: [0.7, 0.8, 0.05], 2: [0.5, 0.3, 0.7], 3: [0.4, 0.4, 0.6],
  4: [0.2, 0.2, 0.95], 5: [0.85, 0.45, 0.1], 6: [1, 1, 1.2], 7: [0.4, 0.7, 1.2],
  8: [0.7, 0.7, 0.7], 9: [0.05, 0.8, 0.3], 10: [0.05, 0.8, 0.3],
};

/** 尘 43 颜色 → hex（NewDust color(r,g,b,1)；分量 >1 按渲染钳位 1） */
export function pylonDustHex(style: number): string {
  const [r, g, b] = PYLON_DUST_RGB[style] ?? PYLON_DUST_RGB[0];
  const ch = (v: number) => Math.round(Math.min(1, v) * 255).toString(16).padStart(2, '0');
  return `#${ch(r)}${ch(g)}${ch(b)}`;
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

/** 全屏地图晶塔图标命中（TeleportPylonsMapLayer.cs:77-89 IsMouseOver）：
 *  命中域 = 绘制精灵的屏幕包围盒（context.Draw 悬停判定），几何与
 *  Renderer.drawPylonMapLayer 逐字同源——图标中心 = 锚点 + (1.5, 2) 格
 *  （:56/63 PositionInTiles+(1.5,2)），尺寸 = Extra_182 帧 30×38 × scale
 *  （scale = max(1,min(2,zoom))——vanilla 基线 1×/悬停 2×，屏幕尺寸不随地图
 *  zoom 缩放）。屏幕→世界逆变换与 Game 地图点击链同式：
 *  cx0 = viewW/2 − worldW·zoom/2 + panX（Y 轴用 worldH）。
 *  ★SW-BD1 2026-09-06：此前 Game 侧用 tile 域 ±2 格判定——zoom 2 时仅图标中央
 *  8×8px 可点，图标外圈整片死区（用户实报"点晶塔没反应"第二断点）。
 *  多图标重叠时后写覆盖（:87 num2=j，与原版逐座覆写同序） */
export function pylonIconHit(
  pylons: TeleportPylonInfo[], mx: number, my: number,
  view: { worldW: number; worldH: number; viewW: number; viewH: number; zoom: number; panX: number; panY: number },
): TeleportPylonInfo | null {
  if (!pylons.length) return null;
  const cx0 = view.viewW / 2 - (view.worldW * view.zoom) / 2 + view.panX;
  const cy0 = view.viewH / 2 - (view.worldH * view.zoom) / 2 + view.panY;
  const scale = Math.max(1, Math.min(2, view.zoom));
  const hw = 15 * scale, hh = 19 * scale;   // Extra_182 帧 30×38 半宽/半高
  let hit: TeleportPylonInfo | null = null;
  for (const p of pylons) {
    const mxI = cx0 + (p.x + 1.5) * view.zoom, myI = cy0 + (p.y + 2) * view.zoom;
    if (Math.abs(mx - mxI) <= hw && Math.abs(my - myI) <= hh) hit = p;
  }
  return hit;
}
