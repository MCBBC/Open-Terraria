// 指针物品/交互图标系统（Main.cs DrawInterface_40_InteractItemIcon :44474-44562）：
//   持有物品使用中/悬停可交互物/热键切换余辉三种态在鼠标旁画物品图标。
// 状态层（纯逻辑，供 Game 每帧驱动 + 单测）：
//   - Player 侧五字段（enabled/ID/Push/Text/Reversed，Player.cs:1730-1740 语义）；
//   - 余辉缓存（Main._itemIconCacheTime :2478 + ItemIconCacheUpdate/Verification :45922-45945）；
//   - 图标 id 解析序（held→群系火把/营火覆写→悬停 ID 覆写）。
// 绘制层在 Renderer.drawCursorItemIcon（屏幕空间尾段）。

/** 群系快照（SceneMetrics 直读;Underworld = y > UnderworldLayer×16,本仓恒 h-200） */
export interface BiomeZones {
  shimmer: boolean; dungeon: boolean; temple: boolean; underworld: boolean;
  glowshroom: boolean; hallow: boolean; corrupt: boolean; crimson: boolean;
  snow: boolean; jungle: boolean; desertSurface: boolean; undergroundDesert: boolean;
  desertRemix: boolean;
}

/** BiomeTorchHoldStyle(Player.cs:39635-39689):else-if 序 1:1。
 *  desertRemix 语义 = ZoneDesert && Main.remixWorld（调用侧预与,原版 :39661
 *  第三沙漠支在表面/地下沙漠两支未中时兜底）。temple = SceneMetrics.zoneTemple
 *  （wall==87,≡ ZoneLihzhardTemple SceneMetrics.cs:688）。 */
export function biomeTorchHoldStyle(vid: number, z: BiomeZones): number {
  if (vid !== 8) return vid;
  if (z.shimmer) return 5353;
  if (z.dungeon) return 3004;
  if (z.temple) return 4388;
  if (z.underworld) return 433;
  if (z.glowshroom) return 5293;
  if (z.hallow) return 4387;
  if (z.corrupt) return 4385;
  if (z.crimson) return 4386;
  if (z.snow) return 974;
  if (z.jungle) return 4388;
  if (z.desertSurface || z.undergroundDesert) return 4383;
  if (z.desertRemix) return 4383;
  return vid;
}

/** BiomeCampfireHoldStyle(Player.cs:39747-39801):else-if 序 1:1 */
export function biomeCampfireHoldStyle(vid: number, z: BiomeZones): number {
  if (vid !== 966) return vid;
  if (z.shimmer) return 5357;
  if (z.glowshroom) return 5299;
  if (z.temple) return 4694;
  if (z.dungeon) return 3724;
  if (z.underworld) return 3047;
  if (z.hallow) return 4693;
  if (z.corrupt) return 4691;
  if (z.crimson) return 4692;
  if (z.snow) return 3048;
  if (z.jungle) return 4694;
  if (z.desertSurface || z.undergroundDesert) return 4689;
  if (z.desertRemix) return 4689;
  return vid;
}

/** 余辉缓存状态机（Main.cs:45922-45945 1:1） */
export class ItemIconCache {
  time = 0;
  itemId = 0;
  private sx = 0;
  private sy = 0;

  /** ItemIconCacheUpdate(:45922-45927):记录当前物品与鼠标位置,time=10 */
  update(itemId: number, mx: number, my: number): void {
    this.sx = mx; this.sy = my;
    this.itemId = itemId;
    this.time = 10;
  }

  /** ItemIconCacheVerification(:45929-45945):每帧调用。
   *  鼠标移动距离 !=0 → time--;>4px → 0;所选 type 与缓存不符 → 0 */
  verify(mx: number, my: number, selectedItemId: number): void {
    if (this.time > 0) {
      const d = Math.hypot(mx - this.sx, my - this.sy);
      if (d !== 0) this.time--;
      if (d > 4) this.time = 0;
      if (this.itemId !== selectedItemId) this.time = 0;
    }
  }
}

/** 图标 id 解析（Main.cs:44481-44496）:
 *  heldVid → 群系覆写(可选) → hoverId != 0 覆写 */
export function resolveCursorIconId(
  heldVid: number, biomeOverrideVid: number | null, hoverIconId: number,
): number {
  let num = heldVid;
  if (biomeOverrideVid != null) num = biomeOverrideVid;
  if (hoverIconId !== 0) num = hoverIconId;
  return num;
}

/** TryGetAmmo 油漆分支(Main.cs:44555-44576):刷/滚 → 当前漆/涂层物品;
 *  offset 刷 (22,22) / 滚 (28,28),scale 0.8。FlexibleTileWand 分支未实装
 *  (碎块魔杖族 5324/5329/5330 放置系统缺,引擎级缺口登记) */
export const PAINT_TOOLS = new Set([1071, 1543, 1072, 1544]);
export function paintToolOffset(vid: number): { x: number; y: number } {
  return (vid === 1072 || vid === 1544) ? { x: 28, y: 28 } : { x: 22, y: 22 };
}

/** 悬停结果:iconVid=null 表示图标抑制(原版 cursorItemIconID=-1 语义,
 *  DrawInterface_40 num=-1 → 不画图标,只出 textKey 的 MouseText) */
export interface HoverIconResult { iconVid: number | null; textKey: string | null; }

/** 宝箱/二类箱悬停（TileInteractionsMouseOver_Containers :34301-34367）:
 *  无记录（FindChest<0）→ 默认类型名文本、无图标;有记录且未命名 → 类型图标。
 *  命名箱（chest.name != ""）→ 名字文本无图标——本仓 ChestData 无 name 字段
 *  且无重命名链,该支恒不进（引擎级缺口,勿误当悬停侧缺陷） */
export function containerHover(
  hasRecord: boolean, styleIconVid: number, defaultTextKey: string,
): HoverIconResult {
  return hasRecord
    ? { iconVid: styleIconVid, textKey: null }
    : { iconVid: null, textKey: defaultTextKey };
}

/** 梳妆台悬停（:33278-33315）:下半格（frameY>0）恒 icon 269（:33311-33314）;
 *  上半格无记录 → 默认类型名文本;有记录 → 样式图标（现代档梳妆台开更衣界面,
 *  基本无 chest 记录 → 实际常态是文本支） */
export function dresserHover(
  hasRecord: boolean, styleIconVid: number, frameY: number,
): HoverIconResult {
  if (frameY > 0) return { iconVid: 269, textKey: null };
  return hasRecord
    ? { iconVid: styleIconVid, textKey: null }
    : { iconVid: null, textKey: 'LegacyDresserType.0' };
}
