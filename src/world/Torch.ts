// 火把放置/重锚定（★SW-BJ28 2026-09-08 重写为原版 legacy 放置路 1:1）。
// 原版火把【不走】TileObject.CanPlace：Player.PlaceThing_Tiles_TryPlacing :40084 显式
// 排除 `tileToCreate != 82 && != 227 && != 4` → 火把走 AssortedThings（Player.cs:41435-41485
// Torches 支 canPlace）+ WorldGen.PlaceTile case 4（:60289-60345 写入/复验），
// 重锚定 = TileFrame 火把支（WorldGen.cs:87413-87461）。旧实现误按 TileObjectData
// AnchorBottom=SolidTile|SolidSide 建模（tileSolidTop 平台两面全拒）→ 火把放不上平台
// （用户实报 2026-09-08）；原版底锚对平台显式放行：
//   PlaceTile :60326 `(Platforms[tile4.type] && TopEdgeCanBeAttachedTo(i, j + 1))`
//   AssortedThings :41477 `(!tileNoAttach[num3] || TileID.Sets.Platforms[num3])`。
// 帧语义（TEdit Tiles_4 framing，22px 步长）：
//   frameX 0 = 底锚直立（地面/平台/背景墙共用直立贴图）、22 = 左锚（贴左块倾斜）、44 = 右锚。
//   未点燃变体 = 点燃帧 +66（Wiring.ToggleTorch Wiring.cs:2922-2937 的 ±66 翻转；
//   frameX ≥ 66 判定见同函数/Player.cs:17654 的 TorchAttack 复燃）。重锚定与点亮态
//   互不干扰——TileFrame 重算时先剥掉 66 再选锚（WorldGen.cs:87416 num = frameX>=66 ? 66 : 0）。
// 帧选取优先序 = TileFrame :87440-87459：底(0) → 左(22) → 右(44) → 墙(0)。
import type { TileStore } from './TileStore';
import { TILE_DEFS, IS_A_TREE_TRUNK_SHEETS, PLATFORMS_SHEETS } from '../data/tiles';
import { VAN_TILE_SOLID_EXTRA } from './gen/vanilla/GenSolid';

/** 未点燃火把的帧偏移（Wiring.ToggleTorch：frameX ±= 66；判定 frameX >= 66） */
export const TORCH_UNLIT_OFFSET = 66;

/** 火把是否处于未点燃态（Torch God 熄灭/电路 ToggleTorch 后；Player.TorchAttack 复燃） */
export function isUnlitTorch(frameX: number): boolean {
  return frameX >= TORCH_UNLIT_OFFSET;
}

/** 剥掉未点燃偏移取锚帧（WorldGen.cs:86860 TileFrame 的 num 剥离语义） */
export function torchLitFrame(frameX: number): number {
  return isUnlitTorch(frameX) ? frameX - TORCH_UNLIT_OFFSET : frameX;
}

/** 翻转点亮态（Wiring.ToggleTorch Wiring.cs:2922-2937：< 66 则 +66，≥ 66 则 −66） */
export function toggleTorchFrame(frameX: number): number {
  return isUnlitTorch(frameX) ? frameX - TORCH_UNLIT_OFFSET : frameX + TORCH_UNLIT_OFFSET;
}

// ---- 原版旗表（火把放置/重锚定消费域；行号锚 1457） ----
/** TileID.Sets.IsATreeTrunk（TileID.cs:161）——侧锚三格连续树干支；★不含棕榈 323（1457 原表如此）。
 *  ★BJ168-债2（2026-09-19）：本地定义拆除,收编 data/tiles.ts 单源（本文件转出口,
 *  SW-BJ28 消费面 RenderAudit 的导入路径保持不变） */
export { IS_A_TREE_TRUNK_SHEETS };
/** TileID.Sets.IsBeam（TileID.cs:239）——侧锚梁木支（单格即可,无需三连） */
export const IS_BEAM_SHEETS = new Set([124, 561, 574, 575, 576, 577, 578]);
/** TileID.Sets.NotReallySolid（TileID.cs:359={387,388,10}）——PlaceTile 底/侧锚非平台实心支排除 */
export const NOT_REALLY_SOLID_SHEETS = new Set([387, 388, 10]);
/** Main.tileNoAttach 全表（Main.cs 逐条赋值提取：:7260-8331 盆景/树苗/火把与开门/可割植物
 *  家具/高门/:9890-9900 平台族 427+435-439/:10258 岩浆石）。与 player/SmartCursor.TILE_NO_ATTACH
 *  _SHEETS 同源副本（该表模块私有,此处复制为火把域单源;tests/sw-bj28 结构锁两表恒等,漂移爆红） */
export const NO_ATTACH_SHEETS = new Set([
  568, 569, 570, 580, 620, 572, 564, 565, 593, 594,
  590, 595, 615, 110, 3, 4, 10, 50, 707,
  20, 19, 13, 14, 469, 486, 488, 704, 487, 489, 490, 15, 497, 16, 134, 17, 18, 21, 467, 441,
  468, 27, 114, 86, 87, 88, 89, 90, 101, 102, 94, 95, 96, 97, 98, 99, 91, 92, 93,
  387, 388, 427, 435, 436, 437, 438, 439, 390,
]);
/** TileID.Sets.Platforms（TileID.cs:243={19,427,435-439}）——底锚平台臂/,noAttach 豁免臂。
 *  ★BJ168-债2（2026-09-19）：本地定义拆除,收编 data/tiles.ts 单源 PLATFORMS_SHEETS;
 *  旧名 PLATFORM_SHEETS 保留为转出口别名（SW-BJ28 消费面 RenderAudit 导入路径不变） */
export { PLATFORMS_SHEETS as PLATFORM_SHEETS };
/** TileObjectData.PlatformFrameWidth()（TileObjectData.cs:5122-5126）= _data[19]
 *  .CoordinateFullWidth = 16+2 = 18 —— PlatformProperTopFrame 的连接档步长 */
const PLATFORM_FRAME_WIDTH = 18;

const sheetOf = (t: number): number => TILE_DEFS[t]?.vanilla?.sheet ?? -1;

/** 原版 Main.tileSolid 代理：def.solid（≈tileSolid&&!tileSolidTop）∪ 平台行为族九件套
 *  （19/239/380/427/435-439 = tileSolid∩tileSolidTop,VAN_TILE_SOLID_EXTRA 单源,GenSolid） */
const vanTileSolid = (t: number): boolean => {
  if (!t) return false;
  const d = TILE_DEFS[t];
  if (!d) return false;
  return d.solid || VAN_TILE_SOLID_EXTRA.has(d.vanilla?.sheet ?? -1);
};

/** 原版 Main.tileSolidTop 代理：def.platform（tiles.ts def 域=平台九件套+工作台/铁砧/
 *  桌柜笼等 tileSolidTop 家族） */
const vanTileSolidTop = (t: number): boolean => !!TILE_DEFS[t]?.platform;

/** WorldGen.PlatformProperTopFrame（:70684-70694）1:1：平台 frameX/18 连接档 ∈
 *  {0-7,12-16,25-26}（孤立/端点/横排与半坡档;斜坡档 8-11/17-24 不可附着） */
export function platformProperTopFrame(frameX: number): boolean {
  const n = Math.floor(frameX / PLATFORM_FRAME_WIDTH);
  if ((n < 0 || n > 7) && (n < 12 || n > 16)) {
    if (n >= 25) return n <= 26;
    return false;
  }
  return true;
}

/** WorldGen.TopEdgeCanBeAttachedTo（:70911-70924）1:1：格顶可附着（平台底锚臂）。
 *  active && (tileSolid∨tileSolidTop) && (!topSlope ∨ (Platforms∧ProperTopFrame))
 *  && !halfBrick && !inActive。GetTileSafely 域外=空砖（:426-431 不含 null 支可达）→ false。 */
export function topEdgeCanBeAttachedTo(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.hasTile(x, y)) return false;
  const t = st.type[i];
  if (!(vanTileSolid(t) || vanTileSolidTop(t))) return false;
  const slope = st.slope[i];
  const isTopSlope = slope === 1 || slope === 2;      // Tile.topSlope()（bits 1|2）
  if (isTopSlope && !(PLATFORMS_SHEETS.has(sheetOf(t)) && platformProperTopFrame(st.frameX[i]))) return false;
  if (st.half[i]) return false;
  if (st.isActuated(x, y)) return false;              // !tile.inActive()
  return true;
}

/** PlaceTile case 4 底锚臂（:60326 tile4 段）：下方平台走 TopEdge、其余走
 *  「!tileSolidTop ∨ (380∧slope0)」∧!NotReallySolid∧!halfBrick∧slope0（外门 tileSolid :60326 前置） */
const bottomArmPlace = (st: TileStore, tx: number, ty: number): boolean => {
  if (!st.inBounds(tx, ty + 1) || !st.hasTile(tx, ty + 1)) return false;   // tile4.active()
  const t = st.type[st.idx(tx, ty + 1)];
  if (!vanTileSolid(t)) return false;
  const sh = sheetOf(t);
  const i = st.idx(tx, ty + 1);
  if (PLATFORMS_SHEETS.has(sh)) return topEdgeCanBeAttachedTo(st, tx, ty + 1);
  return (!vanTileSolidTop(t) || (sh === 380 && st.slope[i] === 0))
    && !NOT_REALLY_SOLID_SHEETS.has(sh)
    && !st.half[i] && st.slope[i] === 0;
};

/** PlaceTile case 4 侧锚臂（:60326 tile2/tile3 段）：active ∧ 坡向门（左支排奇数坡
 *  :60326 `slope()==0||slope()%2!=1`、右支排偶数坡 `%2!=0`）∧（实心非 solidTop 非
 *  NotReallySolid ∨ 梁 ∨ 三格连续树干[本格+同侧上/下格,IsTreeType 读裸 type]） */
const sideArmPlace = (
  st: TileStore, tx: number, ty: number, dir: -1 | 1,
): boolean => {
  const sx = tx + dir;
  if (!st.inBounds(sx, ty) || !st.hasTile(sx, ty)) return false;
  const si = st.idx(sx, ty);
  const slope = st.slope[si];
  if (dir === -1 ? !(slope === 0 || slope % 2 !== 1) : !(slope === 0 || slope % 2 !== 0)) return false;
  const t = st.type[si];
  const sh = sheetOf(t);
  if (vanTileSolid(t) && !vanTileSolidTop(t) && !NOT_REALLY_SOLID_SHEETS.has(sh)) return true;
  if (IS_BEAM_SHEETS.has(sh)) return true;
  if (!IS_A_TREE_TRUNK_SHEETS.has(sh)) return false;
  const isTrunkTypeAt = (x: number, y: number): boolean =>
    st.inBounds(x, y) && IS_A_TREE_TRUNK_SHEETS.has(sheetOf(st.type[st.idx(x, y)]));   // 裸 type 读
  return isTrunkTypeAt(sx, ty - 1) && isTrunkTypeAt(sx, ty + 1);
};

/**
 * 计算放置锚点帧（PlaceTile case 4 :60289-60345 复验 1:1,帧序=TileFrame :87440-87459
 * 优先级：底(0) → 左(22) → 右(44) → 墙(0)；无任何锚返回 -1=放置拒绝）。
 * 新放置火把恒为点燃态；既有火把重锚定时须用 torchLitFrame 剥偏移选锚、再把
 * TORCH_UNLIT_OFFSET 加回（WorldGen.cs:87416 语义）。
 */
export function torchAnchorFrame(st: TileStore, tx: number, ty: number): number {
  if (!st.inBounds(tx, ty)) return -1;
  if (bottomArmPlace(st, tx, ty)) return 0;                   // 底锚（含平台 TopEdge 臂）
  if (sideArmPlace(st, tx, ty, -1)) return 22;                // 左锚
  if (sideArmPlace(st, tx, ty, 1)) return 44;                 // 右锚
  if (st.wall[st.idx(tx, ty)] !== 0) return 0;                // 墙锚
  return -1;
}

// ---- TileFrame 火把支（WorldGen.cs:87413-87461）重锚定判定 ----
// num2（下方）定义 :87413 `tile3.active() && ((Platforms∧TopEdge) ∨ (!halfBrick∧!topSlope))`；
// num3/num4（左/右）定义 :87424/:87427 坡向门同 PlaceTile；接受面 :87440-87459：
// 底=tileSolid∧(!noAttach∨Platforms)、侧=tileSolid∧!noAttach∨梁∨树干三连、墙=wall>0。
const tileFrameBottomOk = (st: TileStore, tx: number, ty: number): boolean => {
  if (!st.inBounds(tx, ty + 1) || !st.hasTile(tx, ty + 1)) return false;
  const i = st.idx(tx, ty + 1);
  const t = st.type[i];
  const sh = sheetOf(t);
  const isPlat = PLATFORMS_SHEETS.has(sh);
  // SW-RB8a 2026-09-08：num2 门（:87413）是【并集】——`(Platforms∧TopEdge) ∨
  // (!halfBrick ∧ !topSlope)`，第二支不查 active/inActive/Platforms。旧码平台
  // 只走 TopEdge 单支 → 已致动平台（TopEdge 的 !inActive 拒）下火把被误判失撑
  // （原版第二支 `!halfBrick∧!topSlope` 对 slope 字节恒 0 的平台恒真 → 托炬）。
  // 非 platform 时第一支按 Platforms[]短路恒假，两支并集退化为原文第二支。
  const defined = (isPlat && topEdgeCanBeAttachedTo(st, tx, ty + 1))
    || (!st.half[i] && !(st.slope[i] === 1 || st.slope[i] === 2));
  if (!defined) return false;
  return vanTileSolid(t) && (!NO_ATTACH_SHEETS.has(sh) || isPlat);
};

const tileFrameSideOk = (
  st: TileStore, tx: number, ty: number, dir: -1 | 1,
): boolean => {
  const sx = tx + dir;
  if (!st.inBounds(sx, ty) || !st.hasTile(sx, ty)) return false;
  const si = st.idx(sx, ty);
  const slope = st.slope[si];
  if (dir === -1 ? !(slope === 0 || slope % 2 !== 1) : !(slope === 0 || slope % 2 !== 0)) return false;
  const t = st.type[si];
  const sh = sheetOf(t);
  if (vanTileSolid(t) && !NO_ATTACH_SHEETS.has(sh)) return true;
  if (IS_BEAM_SHEETS.has(sh)) return true;
  if (!IS_A_TREE_TRUNK_SHEETS.has(sh)) return false;
  const isTrunkTypeAt = (x: number, y: number): boolean =>
    // SW-RB8a 2026-09-08：TileFrame 侧锚的树干对角读有 active() 门（:87425-87440
    // `tile6..9.active()` 才赋 tree 族）——幽灵格（flags=0 残型）不算。旧裸 type 读
    // 会把"上/下邻已挖掉但残型还在"的树干判成三连=该掉不掉。PlaceTile 路的
    // sideArmPlace 仍保持裸读（:60326 tile5-8 无 active 门,原文两处语义本就不同）。
    st.inBounds(x, y) && st.hasTile(x, y)
    && IS_A_TREE_TRUNK_SHEETS.has(sheetOf(st.type[st.idx(x, y)]));
  return isTrunkTypeAt(sx, ty - 1) && isTrunkTypeAt(sx, ty + 1);
};

/**
 * TileFrame 火把支的重锚帧选取（:87440-87459 优先序：底(0) → 左(22) → 右(44) →
 * 墙(0)；全部失败 = -1 → KillTile）。与 torchAnchorFrame（PlaceTile case 4 接受面）
 * 臂定义不同：TileFrame 底锚平台走并集门（见 tileFrameBottomOk）、侧锚实心支只排
 * noAttach 不排 NotReallySolid/solidTop——重锚定必须按 TileFrame 口径,勿混用。
 * ★SW-RB8a 2026-09-08 新增：checkTorchDetach 的重锚写帧消费（原版 TileFrame 每次重算
 * 都按本序重写 frameX,未点燃偏移由调用域加回）。
 */
export function torchReanchorFrame(st: TileStore, tx: number, ty: number): number {
  if (!st.inBounds(tx, ty)) return -1;
  if (tileFrameBottomOk(st, tx, ty)) return 0;
  if (tileFrameSideOk(st, tx, ty, -1)) return 22;
  if (tileFrameSideOk(st, tx, ty, 1)) return 44;
  if (st.wall[st.idx(tx, ty)] !== 0) return 0;
  return -1;
}

/**
 * 已放置火把是否仍有任一可用锚（TileFrame 火把支存活判定 1:1）。
 * ★SW-RB8a 2026-09-08 翻案：原版 TileFrame（:87441-87459）每次重算按「底 → 左 →
 * 右 → 墙」优先序【重选】锚位,只在四臂全空才 KillTile（:87457-87459）——档位
 * （现 frameX）不影响存活,只决定帧。旧码按现存档位判死：左锚火把左边被挖但
 * 底/墙仍在 → 原版重锚成直立保留,旧码误判掉落（火烧已放火把家族）。
 * 未点燃变体（+66）不影响本判定（判定与点亮态正交,调用域剥/加偏移）。
 */
export function torchStillAnchored(st: TileStore, tx: number, ty: number, frameX: number): boolean {
  if (!st.inBounds(tx, ty)) return false;
  void frameX;
  return tileFrameBottomOk(st, tx, ty) || tileFrameSideOk(st, tx, ty, -1)
    || tileFrameSideOk(st, tx, ty, 1) || st.wall[st.idx(tx, ty)] !== 0;
}

// ---- 水炬（TileObjectData :4604-4616 addSubTile 8/11/17）：水中不死、可水中放置 ----
/** 水炬 torchId 集（普通火把 WaterDeath=true；水炬三色 false + WaterPlacement Allowed） */
export const WATER_TORCH_STYLES = new Set([8, 11, 17]);

/** 该火把 tile（frameY）是否水炬样式——液体冲毁豁免/水中放置门 */
export function isWaterTorchStyle(frameY: number): boolean {
  return WATER_TORCH_STYLES.has(Math.floor(frameY / 22));
}

// ---- 群系火把样式（TorchGodsFlavor 自动转换链，2026-08-22 补 C 审计 5573 效果端）----

/** TorchID.Sets.IsABiomeTorch（Terraria.ID/TorchID.cs:12）：
 *  false 兜底 + {0 普通炬,18 腐化,19 猩红,20 神圣,21 丛林,23 微光,13 骨,7 恶魔,9 冰雪,
 *  22 蘑菇,16 沙漠}——TorchGodsFlavor 只转换该集内的样式（彩炬/诅咒等不属"群系炬"） */
export const IS_BIOME_TORCH_STYLE = new Set([0, 18, 19, 20, 21, 23, 13, 7, 9, 22, 16]);

/** TorchID.Dust（TorchID.cs:77-81）：样式 0-23 → 转换弹 1084 尾迹/落点尘埃 id */
export const TORCH_DUST_BY_STYLE: readonly number[] = [
  6, 59, 60, 61, 62, 63, 64, 65, 75, 135,
  158, 169, 156, 234, 66, 242, 293, 294, 295, 296,
  297, 298, 307, 310,
];

/** BiomeTorchPlaceStyle 的群系输入（Player.Zone* 位 + 深度/世界旗） */
export interface BiomeTorchZones {
  shimmer: boolean; dungeon: boolean; temple: boolean; underworld: boolean;
  glowshroom: boolean; hallow: boolean; corrupt: boolean; crimson: boolean;
  snow: boolean; jungle: boolean; desert: boolean; undergroundDesert: boolean;
  /** 玩家 tileY ≤ worldSurface（地表沙漠门 :39626 `position.Y < worldSurface*16`） */
  aboveSurface: boolean;
  /** Main.remixWorld（:39631 don't dig up 沙漠补支） */
  remixWorld: boolean;
}

/**
 * BiomeTorchPlaceStyle（Player.cs:40550-40585 [1457] 1:1 提取）：当期群系 → 应使用的火把样式。
 * 消费端①TorchGodsFlavor（:39529，buff 376 火把神药水每 tick 1/10 扫屏把**异群系群系炬**
 * 转成本表样式）；②放置自动转换（PlaceThing_Tiles_PlaceIt :40447 门 `UsingBiomeTorches
 * && tileToCreate==4 && style==0`）——★SW-FX37 落地（Game.ts 火把放置支,普通炬解锁后
 * 按当期群系转换）。无命中群系 = 0（普通炬，不触发转换）。
 * ★SW-FX19：UsingBiomeTorches 真形（Player.cs:3934-3941）= `unlockedBiomeTorches &&
 * builderAccStatus[11]==0`——Game.usingBiomeTorches() 并读两域（背包左群系炬图标
 * Main.cs:43282 翻 [11],FX35 开关 UI 已建）。
 */
export function biomeTorchPlaceStyle(z: BiomeTorchZones): number {
  if (z.shimmer) return 23;          // :39592-39594
  if (z.dungeon) return 13;          // :39596-39598
  if (z.temple) return 21;           // :39600-39602 ZoneLihzhardTemple
  if (z.underworld) return 7;        // :39604-39606 position.Y > UnderworldLayer*16
  if (z.glowshroom) return 22;       // :39608-39610
  if (z.hallow) return 20;           // :39612-39614
  if (z.corrupt) return 18;          // :39616-39618
  if (z.crimson) return 19;          // :39620-39622
  if (z.snow) return 9;              // :39624-39626
  if (z.jungle) return 21;           // :39628-39630
  if ((z.desert && z.aboveSurface) || z.undergroundDesert) return 16;  // :39632-39634
  if (z.desert && z.remixWorld) return 16;                             // :39636-39638
  return 0;
}

/**
 * BiomeCampfirePlaceStyle（Player.cs:40666-40721 [1457] 1:1 提取）——BiomeTorchPlaceStyle
 * 同域同构的营火版（消费面①FigureOutWhatToPlace :43759-43762 放置解析——普通+智能光标
 * 放置同路;②PlaceThing_TryReplacingTiles :40214-40217 块换写面;③
 * PlaceThing_ValidTileForReplacement :40240-40243 块换 verdict）。门 = UsingBiomeTorches
 * ∧ style==0（:40668,调用位 :43759 再前置 style==0 检查）——仅普通营火（item 966,
 * placeStyle 0）转换,显式群系营火（3046-3050/3723-3724/4689-4694/5299/5357,placeStyle
 * 1-15,items.ts SW-BJ50 补列表）不动。
 * ★与火把查表【两处差异】（逐字比对）：
 *   ①优先序不同——glowshroom/temple 提前到 dungeon 之前（火把序 dungeon→temple→…→
 *     glowshroom,营火序 glowshroom→temple→dungeon）,地牢/神庙同挤 13 时归属随序翻转;
 *   ②值域不同——{15 微光,14 蘑菇,13 丛林/神庙,7 地牢,2 地狱,12 神圣,10 腐化,11 猩红,
 *     3 雪原,8 沙漠}（对照火把 {23,13,21,7,22,20,18,19,9,16}）。
 * 无命中群系 = 0（普通营火,不触发转换）。与火把共用 BiomeTorchZones 单源。
 */
export function biomeCampfirePlaceStyle(z: BiomeTorchZones): number {
  if (z.shimmer) return 15;          // :40670-40672
  if (z.glowshroom) return 14;       // :40674-40676
  if (z.temple) return 13;           // :40678-40680 ZoneLihzhardTemple
  if (z.dungeon) return 7;           // :40682-40684
  if (z.underworld) return 2;        // :40686-40688 position.Y > UnderworldLayer*16
  if (z.hallow) return 12;           // :40690-40692
  if (z.corrupt) return 10;          // :40694-40696
  if (z.crimson) return 11;          // :40698-40700
  if (z.snow) return 3;              // :40702-40704
  if (z.jungle) return 13;           // :40706-40708
  if ((z.desert && z.aboveSurface) || z.undergroundDesert) return 8;   // :40710-40712
  if (z.desert && z.remixWorld) return 8;                              // :40714-40716
  return 0;
}

/** 物品 key → 放置火把样式 torchId（Item.cs SetDefaults placeStyle + 生物群系火把显式表）。
 *  彩色火把 427-433 = id-426（1-7）；群系火把 BIOME 表；水炬 = 8（咒火 523）/11（灵液 1333）
 *  /17（珊瑚 4384）；legacy 'torch' 与其余 → 0 */
const BIOME_TORCH_ITEM: Record<number, number> = {
  523: 8, 974: 9, 1245: 10, 1333: 11, 2274: 12, 3004: 13, 3045: 14, 3114: 15,
  4383: 16, 4384: 17, 4385: 18, 4386: 19, 4387: 20, 4388: 21, 5293: 22, 5353: 23,
};
export function torchStyleOfItemKey(key: string): number {
  // 本地 'torch'→style0 支已随退役移除:vi_8_Torch 由下方 BIOME_TORCH_ITEM[8] 命中 style0
  const m = /^vi_(\d+)_/.exec(key);
  if (!m) return 0;
  const id = Number(m[1]);
  if (id >= 427 && id <= 433) return id - 426;
  return BIOME_TORCH_ITEM[id] ?? 0;
}
