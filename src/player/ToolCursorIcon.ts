// 手持工具/放置物悬停光标物品图标——置位条件纯函数（Terarria1457 反编译逐行转录）。
//
// 原版机制（1457）：
//   每帧 Main.DoUpdate :17213 MouseOversClear(:47279-47287) 清零 player 五字段
//   （cursorItemIconEnabled/ID/Push/Text + cursorItemIconReversed :17020）→
//   Player.Update 帧内先悬停扫描（LookForTileInteractions :27632 →
//   TileInteractionsMouseOver :33851：宝箱/床/梳妆台/告示牌等 hover 图标，写
//   cursorItemIconID）→ 后 ItemCheckWrapped(:28495 → ItemCheck :32066 →
//   ItemCheck_OwnerOnlyCode :43785) 在此按手持物品置 cursorItemIconEnabled
//   （+Main.ItemIconCacheUpdate(sItem.type) :47291-47297）。
//   绘制端 Main.DrawInterface_40_InteractItemIcon(:45792-45865)：num =
//   cursorItemIconID != 0 ? ID : heldItem.type（:45812-45814），在
//   mouse+(10+cursorItemIconPush, 同) 处以 cursorScale 缩放画物品图标
//   （Item.GetDrawHitbox 尺寸×cursorScale×0.5 计入中心锚，:45848-45850），
//   箭头光标照画（DrawInterface_36_Cursor :46010 在 36 层先画，本图标在 40 层）。
//   cursorScale = cursorAlpha×0.3+0.8（:53294，alpha 0.6..1 呼吸 :53277-53286）。
//   门（:45794/:45816-45817）：HoveringOverAnNPC/mouseInterface → 不画；
//   MouseDisplayItem.IsAir（鼠标上有拖拽物）→ flag 假；_itemIconCacheTime>0 且
//   mouseItem 空的余辉支（flag2）仍可画（ItemIconCacheVerification :47299-47313：
//   鼠标动了 time--、单帧 >4px 清零、所选物品变了清零）。
//
// ★五支置位条件都是【纯射程门，不读任何 tile】——"镐匹配可挖格 / 斧匹配
//   Main.tileAxe / 锤匹配 Main.tileHammer"是挖掘分派
//   ItemCheck_UseMiningTools_ActuallyUseMiningTool :46039-46046 的条件
//   （tile.active()/tileAxe/tileHammer 在那儿才登场），不属于图标。三代反编译
//   同义（1405 Player.cs:29478-29502 / 1456 :44975-45001 / 1457 :45971-46011）：
//   手持镐/斧/锤指向射程内【任意】目标格（含空气/幽灵格/已致动格）图标恒亮。
//   故本模块入参只有几何与物品语义，不接 TileStore（tile.active()=TileStore.hasTile
//   的口径只在挖掘/放置动作侧生效）。
//
// 射程 = IsInTileInteractionRange(:32264-32268) + TileReachCheckSettings.GetTileRegion
//   (TileReachCheckSettings.cs:53-62)：Simple 档（:16-20，multiplier=1 / 上限 20）
//   tileRangeX=5 / tileRangeY=3（Player.cs:2475-2481）钳 20 后加 TB，玩家盒四向
//   外扩的【矩形】判定（Collision.InTileBounds Collision.cs:3792-3797，含端点）。
//   TB 分档：挖掘/桶/小动物 = sItem.tileBoost（:45986→:46703-46706 / :46710 /
//   :43954）；放置块/墙/电路 = item.tileBoost + blockRange（:40035 / :39913 /
//   :47154）。tileTarget = int((mouse+screenPos)/16) 并钳 [5,maxTiles-5]
//   （Player.cs:25586-25607）。

/** 桶族 12 件（ItemCheck_UseBuckets :46710 的类型清单） */
export const BUCKET_VIDS: ReadonlySet<number> = new Set([
  205, 206, 207, 1128, 3031, 3032, 4820, 4872, 5302, 5303, 5304, 5364,
]);

/** 电路工具族（ItemCheck_UseWiringTools :47154 清单）——本仓以 def.wireTool 识别，
 *  本表供对账；族内件 SetDefaults tileBoost 恒 20（Item.cs:7444-7457 {509,510} /
 *  :11326-11362 {849,850,851} / :32529 {3612} / :32609 {3620} / :32670 {3625}） */
export const WIRE_TOOL_VIDS: ReadonlySet<number> = new Set([509, 510, 849, 850, 851, 3612, 3620, 3625]);
export const WIRE_TOOL_TILE_BOOST = 20;

export interface ToolCursorIconEnv {
  /** sItem.pick / axe / hammer（>0 即有该力；Hamaxe/Drax 等双力件两支都算） */
  pick: number;
  axe: number;
  hammer: number;
  /** sItem.createTile >= 0（放置方块族：火把/绳/平台/块） */
  createTile: boolean;
  /** sItem.createWall >= 0（铺墙族） */
  createWall: boolean;
  /** 电路工具族（:47154 八件） */
  wireTool: boolean;
  /** 桶族（:46710 十二件） */
  bucket: boolean;
  /** sItem.makeNPC > 0（捕获小动物释放族） */
  makeNPC: boolean;
  /** GetRanges 钳 20 后的底数（不含 TB）——Game.tileReach(0) 同式 */
  reachBase: { x: number; y: number };
  /** item.tileBoost（本仓物品面未建模恒 0；电路工具 20 由调用侧传入） */
  tileBoost: number;
  /** Player.blockRange（Builder 药水/工具腰带，:2604 基 0） */
  blockRange: number;
  /** 玩家盒 position/width/height（px） */
  actor: { x: number; y: number; w: number; h: number };
  /** tileTarget（已钳界的鼠标格） */
  target: { x: number; y: number };
  /** Main.noBuilding（挖掘/桶两支的 :45987-45990 / :46710 门；本作无该态传 false） */
  noBuilding?: boolean;
  /** SmartCursorHelper.TileTargetDesired(:1400-1411)：智能光标连续性锁期内目标≠锁点
   *  → 只让【放置块】支让位（Wall/电路/工具支无此门） */
  tileTargetDesired?: boolean;
}

export interface ToolCursorIconResult {
  /** cursorItemIconEnabled（本轮手持支置位结果） */
  enabled: boolean;
  /** 是否伴随 Main.ItemIconCacheUpdate(sItem.type)——放置两支只置 enabled 不进缓存
   *  （:40040/:39917），其余三支进（:47164/:46717/:46010/:43955） */
  cacheUpdate: boolean;
}

/** C# `(int)(position.X/16f)` 对非负坐标 = floor；HX 用 Math.Ceiling；矩形含端点 */
function inTileBounds(
  actor: { x: number; y: number; w: number; h: number },
  rx: number, ry: number,
  target: { x: number; y: number },
): boolean {
  const LX = Math.floor(actor.x / 16) - rx;
  const HX = Math.ceil((actor.x + actor.w) / 16) - 1 + rx;
  const LY = Math.floor(actor.y / 16) - ry;
  const HY = Math.ceil((actor.y + actor.h) / 16) - 1 + ry;
  return target.x >= LX && target.x <= HX && target.y >= LY && target.y <= HY;
}

/** 逐支转录（执行序 = ItemCheck_OwnerOnlyCode 内原序；非 else-if，可多支同中，
 *  enabled/cacheUpdate 按或累积——原版各支同写 cursorItemIconEnabled=true） */
export function toolCursorIcon(env: ToolCursorIconEnv): ToolCursorIconResult {
  let enabled = false;
  let cacheUpdate = false;
  const noBuilding = env.noBuilding ?? false;
  const desired = env.tileTargetDesired ?? true;
  // 放置/电路档 TB（:39913/:40035/:47154）
  const hitPlace = (): boolean =>
    inTileBounds(env.actor, env.reachBase.x + env.tileBoost + env.blockRange,
      env.reachBase.y + env.tileBoost + env.blockRange, env.target);
  // 挖掘/桶/小动物档 TB（:46705/:46710/:43954）
  const hitTool = (): boolean =>
    inTileBounds(env.actor, env.reachBase.x + env.tileBoost,
      env.reachBase.y + env.tileBoost, env.target);

  // ItemCheck_UseWiringTools（:47152-47166）
  if (env.wireTool && hitPlace()) {
    enabled = true; cacheUpdate = true;
  }
  // ItemCheck_UseBuckets（:46708-46718）
  if (env.bucket && !noBuilding && hitTool()) {
    enabled = true; cacheUpdate = true;
  }
  // ItemCheck_UseMiningTools（:45971-46011）：
  //   :45982-45985 非工具早退 / :45986 IsTargetTileInItemRange / :45987-45990 noBuilding
  //   / :46003-46006 !flag 早退 / :46007-46011 置位+缓存（GamepadDisableCursorItemIcon
  //   键鼠恒 false，Main.cs:2686-2694，不接线）
  if (env.pick > 0 || env.axe > 0 || env.hammer > 0) {
    let flag = hitTool();
    if (noBuilding) flag = false;
    if (flag) {
      enabled = true; cacheUpdate = true;
    }
  }
  // PlaceThing_Tiles（:40033-40040，TileTargetDesired 门 :40035）/
  // PlaceThing_Walls（:39908-39919）
  if (env.createTile && desired && hitPlace()) {
    enabled = true;
  }
  if (env.createWall && hitPlace()) {
    enabled = true;
  }
  // makeNPC 小动物释放族（:43951-43956）
  if (env.makeNPC && hitTool()) {
    enabled = true; cacheUpdate = true;
  }
  return { enabled, cacheUpdate };
}
