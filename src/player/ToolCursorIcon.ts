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

/** 桶族 12 件（ItemCheck_UseBuckets :46710 的类型清单）——全 12 vid 均已实装
 *  （使用链 Game.useBucket :23962 族表 :45706，205/206/207/1128 常规桶含内），
 *  图标支无需按实装面裁剪 */
export const BUCKET_VIDS: ReadonlySet<number> = new Set([
  205, 206, 207, 1128, 3031, 3032, 4820, 4872, 5302, 5303, 5304, 5364,
]);

/** 电路工具族（ItemCheck_UseWiringTools :47154 清单）——本仓以 def.wireTool 识别，
 *  本表供对账；族内件 SetDefaults tileBoost 恒 20（Item.cs:7444-7457 {509,510} /
 *  :11326-11362 {849,850,851} / :32529 {3612} / :32609 {3620} / :32670 {3625}），
 *  运行时统一从 TILE_BOOST_BY_VID 出（不再特判） */
export const WIRE_TOOL_VIDS: ReadonlySet<number> = new Set([509, 510, 849, 850, 851, 3612, 3620, 3625]);
export const WIRE_TOOL_TILE_BOOST = 20;

/** 溶液弹药族（Item.cs:10518-10540 `ammo = AmmoID.Solution` 五件 780-784 +
 *  DefaultToSolution :42774-42780 的 1015/1016/1017）——vanilla-itemfunc.json 提取缺
 *  `ammo` 字段（同 flare-gun 缺口家族，SmartSelect.ts FLARE_GUN_USE_AMMO 先例），
 *  按反编译补正：环境改造枪 779/Terraformer 5134 的溶液图标（:42946-42970）
 *  弹药匹配依赖本表（当前仓内溶液件未注册，支为待活代码——登记不裁剪） */
export const SOLUTION_AMMO_ITEMS: ReadonlySet<number> = new Set([780, 781, 782, 783, 784, 1015, 1016, 1017]);
/** AmmoID.cs:130 */
export const AMMO_ID_SOLUTION = 780;

/**
 * Item.cs SetDefaults tileBoost 全表（base 0；执行序 = ResetStats 清零 :49028 →
 * case 体逐条 → 尾段钻头/链锯修 :48902-48914）。提取 = Terarria1457 Item.cs 全量
 * tileBoost 赋值点逐条对 case 归属（2026-09-03）。未列出 = 0。
 * ★3509/3505/3506（铜镐/铜短剑/铜斧）与 196（木锤）为 -1——射程比无加成工具少 1 格，
 *   属原版刻意（铜系 1.4 重做档），勿"修正"回 0。
 */
export const TILE_BOOST_BY_VID: Readonly<Record<number, number>> = {
  85: 3,             // case 85 :2399（createTile 214 地雷，+= 3）
  196: -1,           // 木锤 :3806
  509: 20, 510: 20, 850: 20, 851: 20,   // 电线钳/蓝扳手/绿扳手 :7444/:7457/:11349/:11362
                     // ★849 致动器 :11326-11339 自有函数体【无 tileBoost】=0——曾误读
                     // :11326 为落穿 850 支落 20（红蓝对抗 C-F1,已逐行核实 case 体到 break）
  965: 3,            // :12522
  1230: 1, 1231: 0, 1232: 0, 1233: 1, 1234: 1,   // :15211-15287 各 ++；1231/1232 属钻头族尾修 -1
  1262: 0,           // :15673 ++ → 尾修 :48902 明列 type==1262 再 -- → 0
  1294: 1,           // :16005
  1305: 1,           // Drax :16141
  1506: 3, 1507: 3, 1521: 3,   // :18411/:18430/:18606
  2176: -1,          // :22212
  2340: 5, 2492: 2, 2739: 2,   // 矿车轨道 :23515/:24211/:26162
  2772: 4, 2773: 3, 2774: 2, 2775: 4, 2776: 4,   // :26485-26564；★2773(锯,IsChainsaw)
                     // += 4(:26506)→尾修-1=3、2774(钻,IsDrill)+= 3(:26527)→-1=2——曾互换
                     // （红蓝对抗 C-F2）
  2798: 11,          // 钻头控制装置 DCU :26740
  2996: 3,           // :27575
  3032: 2,           // 超吸海绵 :28084
  3077: 3, 3078: 3,  // :28461/:28474
  3505: -1, 3506: -1, 3509: -1,   // 铜短剑/铜斧/铜镐 :31425/:31436/:31395
  3525: 4,           // The Axe :31251
  3612: 20, 3620: 20, 3625: 20,   // 电路族 :32539/:32619/:32680
  3738: 3,           // :33117
  4820: 2, 4872: 2,  // 无底岩浆桶/岩浆海绵 :39479/:39674
  5302: 2, 5303: 2, 5304: 3,   // :42071/:42083/:42095
  5324: 3, 5329: 3, 5330: 3,   // :42252-42259 三连 label 共用体；★5321/5322/5323 自有体
                     // （:42231/:42238/:42248）无 tileBoost=0——曾误落 3（红蓝对抗 C-F3）
  5364: 2,           // :42563
  5464: 3, 5481: 3,  // :43119/:43197
  // 尾段钻头/链锯修（:48902-48914）后为 -1 的成员（IsDrill {388,1231,385,386,2779,
  // 1196,1189,2784,3464,1203,2774,579} ∪ IsChainsaw {387,3098,1232,383,384,2778,
  // 1197,1190,2783,3463,1204,2773,2342,579}，无 per-case 值者）：
  383: -1, 384: -1, 385: -1, 386: -1, 387: -1, 388: -1, 579: -1,
  1189: -1, 1190: -1, 1196: -1, 1197: -1, 1203: -1, 1204: -1, 2342: -1,
  2778: -1, 2779: -1, 2783: -1, 2784: -1, 3098: -1, 3463: -1, 3464: -1,
};

/** sItem.tileBoost 查表（Item.cs SetDefaults；未注册/未列出 → 0） */
export function tileBoostOfVid(vid: number): number {
  return TILE_BOOST_BY_VID[vid] ?? 0;
}

/** 背包槽语义窗（Player.ItemCheck :42938-42970 直读 inventory[i]，此处收窄为四字段：
 *  stack/bait(Item.bait)/ammo(Item.ammo)/vid(原版 id)；null = 空槽） */
export interface ToolSlotSem { stack: number; bait: number; ammo: number; vid: number; }
export type SlotSemArray = Array<ToolSlotSem | null>;

/** Fishing_GetBait（Player.cs:42578-42599）1:1：弹药位 54-58 先、背包 0-50 后，
 *  首个 stack>0 && bait>0 的槽 → 其原版 id（0=无） */
export function fishingGetBait(slots: SlotSemArray): number {
  for (let i = 54; i < 58; i++) {
    const s = slots[i];
    if (s && s.stack > 0 && s.bait > 0) return s.vid;
  }
  for (let j = 0; j < 50; j++) {
    const s = slots[j];
    if (s && s.stack > 0 && s.bait > 0) return s.vid;
  }
  return 0;
}

/** ItemCheck 溶液支取弹药（Player.cs:42946-42970）1:1：弹药位 54-58 先、背包 0-54 后，
 *  首个 stack>0 且 ammo==useAmmo 的槽 → 其原版 id（0=无） */
export function firstAmmoVidFor(slots: SlotSemArray, useAmmo: number): number {
  for (let i = 54; i < 58; i++) {
    const s = slots[i];
    if (s && s.ammo === useAmmo && s.stack > 0) return s.vid;
  }
  for (let j = 0; j < 54; j++) {
    const s = slots[j];
    if (s && s.ammo === useAmmo && s.stack > 0) return s.vid;
  }
  return 0;
}

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
  /** Main.noBuilding（挖掘/桶两支的 :45987-45990 / :46710 门）——唯一置位点 =
   *  Player.cs:26164-26170 DD2Event.Ongoing && ShouldBlockBuilding(Center)（旧日军团
   *  竞技场内禁建，AddBuff 199）；调用侧经 world.oldOnesArmy.shouldBlockBuilding 接线 */
  noBuilding?: boolean;
  /** SmartCursorHelper.TileTargetDesired(:1400-1411)：智能光标连续性锁期内目标≠锁点
   *  → 只让【放置块】支让位（Wall/电路/工具支无此门） */
  tileTargetDesired?: boolean;
  // ---- ItemCheck 头两支（:42938-42970；帧序 = 悬停扫描后、OwnerOnlyCode 各支前，
  //      !cursorItemIconEnabled 让位门读悬停支结果）----
  /** sItem.fishingPole（>0 才进鱼饵支；本仓 = itemFuncOfVid(vid).fishingPole） */
  fishingPole?: number;
  /** 手持 779 环境改造枪 / 5134 Terraformer → true（:42946 字面 type 表） */
  clentaminator?: boolean;
  /** sItem.useAmmo（溶液支 = AmmoID.Solution 780，AmmoID.cs:130） */
  useAmmo?: number;
  /** sItem.stack（:42939/:42947 `item.stack > 0` 门） */
  heldStack?: number;
  /** 悬停支已置位的 cursorItemIconEnabled（让位门实参） */
  hoverEnabled?: boolean;
  /** 背包槽语义窗 0-57（54-58 弹药位；Game 侧复用缓冲逐 tick 重填） */
  slotSem?: SlotSemArray;
  /** 手持物原版 id（油漆四支/兔炮支按 vid 分派,红蓝对抗 C-F4） */
  vid?: number;
  /** 手持火把族（ItemID.Sets.Torches——兔炮支 :42112 门;Game 侧查表传入） */
  isTorch?: boolean;
  /** 铲 4711（:45974-45979 specialToolUsageSettings.IsAValidTool=true,无
   *  UsageCondition → 挖掘图标支=纯射程门;红蓝对抗 C-F6） */
  shovel?: boolean;
  /** 目标格 tile 语境（油漆四支/兔炮支的 tile 条件门;Game 侧从 TileStore 目标格现读）。
   *  painted/paintedWall = 逐支 `color()>0 ∪ invisibleBlock/ fullbrightBlock`（含涂层位）
   *  的并集预算；sheet/frameX 供 LongMoss 184 与大炮 209 frameX/72<3 */
  targetTile?: {
    active: boolean; sheet: number; frameX: number; wall: number;
    painted: boolean; paintedWall: boolean;
  };
}

export interface ToolCursorIconResult {
  /** cursorItemIconEnabled（本轮手持支置位结果） */
  enabled: boolean;
  /** 是否伴随 Main.ItemIconCacheUpdate(sItem.type)——放置两支只置 enabled 不进缓存
   *  （:40040/:39917），挖掘/桶/电路/makeNPC 支进（:46010/:46717/:47164/:43955），
   *  鱼饵/溶液两支不进（:42941-42944/:42953-42967 无该调用） */
  cacheUpdate: boolean;
  /** cursorItemIconID（仅鱼饵/溶液两支非 0：鱼饵件/溶液件原版 id；其余支恒 0 = 画手持物） */
  iconVid: number;
  /** cursorItemIconPush（鱼饵 6 / 溶液 10；其余支 0） */
  push: number;
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

/** 逐支转录（执行序 = Player.ItemCheck 原序：头两支 :42938-42970 → OwnerOnlyCode
 *  内五支；非 else-if，可多支同中，enabled/cacheUpdate 按或累积——原版各支同写
 *  cursorItemIconEnabled=true；鱼饵/溶液支另写 cursorItemIconID/Push） */
export function toolCursorIcon(env: ToolCursorIconEnv): ToolCursorIconResult {
  let enabled = false;
  let cacheUpdate = false;
  let iconVid = 0;
  let push = 0;
  const noBuilding = env.noBuilding ?? false;
  const desired = env.tileTargetDesired ?? true;
  const hoverEnabled = env.hoverEnabled ?? false;
  const heldStack = env.heldStack ?? 1;
  const slots = env.slotSem;

  // ItemCheck 头两支（:42938-42970，Main.myPlayer 门 = 本仓恒本地）。让位门
  // `!cursorItemIconEnabled` 读到的 enabled = 悬停扫描（LookForTileInteractions
  // :27632）结果——告示牌 ID=-1 抑制也会被放行的鱼饵支覆写（原版同相）。
  // 两支均不进缓存；鱼饵支 push=6、溶液支 push=10。
  if (!hoverEnabled && heldStack > 0 && (env.fishingPole ?? 0) > 0) {
    const bait = fishingGetBait(slots ?? []);            // Fishing_GetBait :42578-42599
    if (bait > 0) {
      enabled = true; iconVid = bait; push = 6;
    }
  }
  if (!hoverEnabled && heldStack > 0 && env.clentaminator === true) {
    const ammo = firstAmmoVidFor(slots ?? [], env.useAmmo ?? -1);   // :42948-42970
    if (ammo > 0) {
      enabled = true; iconVid = ammo; push = 10;
    }
  }
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
  //   :45974-45982 非工具早退（铲 4711 = IsAValidTool 也放行,红蓝对抗 C-F6）/
  //   :45986 IsTargetTileInItemRange / :45987-45990 noBuilding
  //   / :46003-46006 !flag 早退 / :46007-46011 置位+缓存（GamepadDisableCursorItemIcon
  //   键鼠恒 false，Main.cs:2686-2694，不接线）
  if (env.pick > 0 || env.axe > 0 || env.hammer > 0 || env.shovel === true) {
    let flag = hitTool();
    if (noBuilding) flag = false;
    if (flag) {
      enabled = true; cacheUpdate = true;
    }
  }
  // PlaceThing_Tiles（:40033-40040，TileTargetDesired 门 :40035）/
  // PlaceThing_Walls（:39908-39919）——调用点 :39904-39907
  // `if (!noBuilding) { PlaceThing_Tiles; PlaceThing_Walls; }` 整支封死
  //（红蓝对抗 C-F5：曾无门且测试把反相钉成"正确"）
  if (env.createTile && desired && !noBuilding && hitPlace()) {
    enabled = true;
  }
  if (env.createWall && !noBuilding && hitPlace()) {
    enabled = true;
  }
  // makeNPC 小动物释放族（:43951-43956）
  if (env.makeNPC && hitTool()) {
    enabled = true; cacheUpdate = true;
  }
  // 油漆四支 + 兔炮支（红蓝对抗 C-F4 补齐,渲染层油漆子图标因此由死代码转活）：
  //   Paintbrush :42230-42240（1071/1543 + 射程 + tile.active()）/
  //   PaintRoller :42212-42222（1072/1544 + 射程 + tile.wall>0）/
  //   PaintScraper :42129-42146（IsPaintScraper + 射程;TryScraping :42194-42201
  //   `(wall>0&&墙彩) ∨ (active&&块彩)`、LongMoss :42143-42149 type==184）/
  //   CannonBall :42112-42126（火把 + 大炮 209 frameX/72<3）。TB=tileBoost+blockRange;
  //   四支均不进缓存（缓存归面:Player.cs 全文仅 4 处 CacheUpdate,无油漆/兔炮）
  const tt = env.targetTile;
  if (tt) {
    const hitPaint = inTileBounds(env.actor, env.reachBase.x + env.tileBoost + env.blockRange,
      env.reachBase.y + env.tileBoost + env.blockRange, env.target);
    if (hitPaint) {
      const vid = env.vid ?? 0;
      if ((vid === 1071 || vid === 1543) && tt.active) enabled = true;
      if ((vid === 1072 || vid === 1544) && tt.wall > 0) enabled = true;
      if ((vid === 1100 || vid === 1545)
        && ((tt.wall > 0 && tt.paintedWall) || (tt.active && tt.painted))) enabled = true;
      // ★G1谓词批(2026-09-04)：LongMoss 原版裸 type 读（Player.cs:42142
      //  `if (Main.tile[x,y].type != 184) return;`无 active 门）——去 tt.active 门
      if ((vid === 1100 || vid === 1545) && tt.sheet === 184) enabled = true;
      if (env.isTorch === true && tt.active && tt.sheet === 209
        && Math.floor(tt.frameX / 72) < 3) enabled = true;
    }
  }
  return { enabled, cacheUpdate, iconVid, push };
}
