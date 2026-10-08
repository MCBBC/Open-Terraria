// 植物支撑/换型规则单点（Game 运行时维护与 WorldEvolution 放置门/清整共用）。
//
// 原版标杆（Terarria1457）：
// · IsFitToPlaceFlowerIn（WorldGen.cs:58714-58734）：放置花族{3,24,110,201,637}时
//   支撑格必须 active+slope==0+非半砖，且类型严格配对——
//   {2,78,380,477,579}→3｜{23,661}→24｜{109,492}→110｜{199,662}→201｜633→637。
//   num==61 内联支（:60073）/num==71（:60142）：同坡/半砖门 + 地基 {60,226}/70。
// · PlaceTile 是唯一放置口 ⇒ 蔓延生成的新植物同样受门控。
// · PlantCheck（:81818，TileFrame Check 族 :86519 case {3,24,61,71,73,74,110,
//   113,201,637,703} 派发）：运行期支撑变化 → TryGetNewType 换型（腐化过境变型，
//   原版不杀）/ 无法变型即杀。
// 缺陷史：SW 蔓延放置端曾无门控（place1 直写不进 PlaceTile），斜面/半砖支撑上
// 长出蘑菇/高草、腐化地上残留森林草——写入监听只查上方格，新放的植物自身永不被
// 复检=粘滞（2026-08-26 用户实报，存档解码实证两案）。

import { MOSS_SHEETS, ASH_GROUND_SHEETS } from '../../data/tiles';

/** 花族类型配对表（IsFitToPlaceFlowerIn :58726-58733）；637 灰烬草基座——★BJ218 单源 ASH_GROUND_SHEETS（§6j） */
export const FLOWER_GROUND_SHEETS: Record<number, Set<number>> = {
  3: new Set([2, 78, 380, 477, 579]),
  24: new Set([23, 661]),
  110: new Set([109, 492]),
  201: new Set([199, 662]),
  637: new Set(ASH_GROUND_SHEETS),
};

/** 花族 placing sheets（PlantCheck 派发 case 表去掉 703 倒挂钟乳石——其地基允许坡面） */
export const PLANT_CHECK_SHEETS = [3, 24, 61, 71, 73, 74, 110, 113, 201, 637];

/**
 * 支撑格能否承载 want 植物（surface/underground 生长共用；等价
 * IsFitToPlaceFlowerIn + 61/71 内联锚支的坡/半砖门前置）。down 由调用方给出：
 * supportType(st 下格 sheet) 或 -1（非 active/slope≠0/半砖 → 一律 false）。
 */
export function flowerGroundOk(down: number, want: number): boolean {
  if (want === 61 || want === 74) return down === 60 || down === 226;
  if (want === 71) return down === 70;
  // 丛林株族（PlaceJunglePlant :48191 地基段 SolidTile(i,num+1)&&type==60）——
  // 233 小株单格锚；238 球茎/236 生命果为双列整平底，主列先过此门、副列由调用方逐列校验
  if (want === 233 || want === 238 || want === 236 || want === 702) return down === 60;
  const ok = FLOWER_GROUND_SHEETS[want];
  return !!ok && ok.has(down);
}

/** PlantCheck_IsBadTypeMatch（cs:81421）——运行期维护判定（Game 侧原实现迁入） */
export function plantBadMatch(down: number, type: number): boolean {
  if ((type !== 3 || down === 2 || down === 477 || down === 78 || down === 380 || down === 579)
    && (type !== 73 || down === 2 || down === 477 || down === 78 || down === 380 || down === 579)
    && (type !== 24 || down === 23 || down === 661)
    && (type !== 61 || down === 60 || down === 226)
    && (type !== 74 || down === 60 || down === 226)
    && (type !== 71 || down === 70)
    && (type !== 110 || down === 109 || down === 492)
    && (type !== 113 || down === 109 || down === 492)
    && (type !== 201 || down === 199 || down === 662)) {
    if (type === 637) return down !== 633;
    return false;
  }
  return true;
}

/** PlantCheck_TryGetNewType（cs:81886-81928）：按地基换型+帧折叠;
 *  spore=入口帧蘑菇株标记（回写 270/144） */
export function plantNewType(sheet: number, down: number, fx: number): { type: number; fx: number; spore: boolean } {
  let type = sheet, nfx = fx;
  let spore = false;
  if (type === 3 || type === 61 || type === 110 || type === 24) spore = nfx === 144;
  if (type === 201) spore = nfx === 270;
  if ((type === 3 || type === 73) && down !== 2 && down !== 477 && nfx >= 162) nfx = 126;
  if (type === 74 && down !== 60 && down !== 226 && nfx >= 162) nfx = 126;
  switch (down) {
    case 23: case 661: type = 24; if (nfx >= 162) nfx = 126; break;
    case 2: case 477: type = type === 113 ? 73 : 3; break;
    case 109: case 492: type = type === 73 ? 113 : 110; break;
    case 199: case 662: type = 201; break;
    case 60: case 226: type = 61; while (nfx > 126) nfx -= 126; break;
    case 70: type = 71; while (nfx > 72) nfx -= 72; break;
  }
  return { type, fx: nfx, spore };
}

/** 换型目标内部键（tile key by target sheet）——Game.setTileConvert 用 */
export const PLANT_CONVERT_KEY: Record<number, string> = {
  3: 'v_3_forest_short_plants', 24: 'v_24_corruption_short_plants', 61: 'v_61_jungle_short_plants',
  71: 'v_71_mushroom_plant', 73: 'v_73_forest_tall_plants', 74: 'v_74_jungle_tall_plants',
  110: 'v_110_hallow_short_plants', 113: 'v_113_hallow_tall_plants', 201: 'v_201_crimson_short_plants',
};

/** 草族种子/法杖放置门（Player.cs:41362-41440 BlockPlacementForAssortedThings 纯函数化）。
 *  staff=手持 213/5295：★BJ562 定谳（2026-10-08）——AssortedThings staff 支 canPlace 读裸
 *  type∈{0,1,38}（:41364-41370,无 nactive 门）,但后续 PlaceIt→PlaceTile(2) 内门
 *  `num==2 && (tile.type!=0 || !tile.active())`（WorldGen.cs:59876）恒拒空格/石/灰砖
 *  ⇒ 净效应=仅【活跃泥土→草】；"石/灰砖→苔藓"只存在于
 *  PlaceThing_Tiles_PlaceIt_StaffOfRegrowthCheck——1457 反编译零调用点=死代码
 *  （1456 :40247 / 1458 :41222 同谳）,旧注"凭空种草/石转草"系把 canPlace 面误当净效应。
 *  种子族只转对应基座——草种/圣种(2/109)→泥土(0)、腐化/猩红(23/199)→泥土或泥(59)、
 *  丛林(60)/蘑菇(70)/红蓝蘑菇苔(661/662)→泥、灰烬草种(633)→灰烬块(57)。
 *  命中=canPlace true（原位转化）；未命中=false=原版整链终点
 *  （TileObjectData.CustomPlace 对草块族 legacy tile 恒 false ⇒ 绝无"铺进空格"回落）。
 *  调用方必须把族内物品的 false 当作"终止"而非"回落"（2026-09-01 神圣种子叠块 bug）。
 *  @param empty 目标格为空气（独立入参承载 nactive() 门语义；staff 促草净面另配
 *    plain-active 门承载 PlaceTile 内门,Game.tryGrassConvert BJ562 前置门） */
export function assortedPlaceOk(staff: boolean, gsheet: number, tsheet: number, empty: boolean): boolean {
  // staff 净效应=活跃泥土（Game 侧 hasTile 门承载 PlaceTile plain-active 内门 :59876）
  if (staff) return !empty && tsheet === 0;
  // 非法杖族全部分支带 nactive()（:41372/:41378/:41390/:41403/:41416）——空格恒 false
  if (empty) return false;
  switch (gsheet) {
    case 2: case 109: return tsheet === 0;
    case 23: case 199: return tsheet === 0 || tsheet === 59;
    case 60: case 70: case 661: case 662: return tsheet === 59;
    case 633: return tsheet === 57;
    default: return false;
  }
}

/** 草族"转化"放置路由域（Game.tryPlace 路由判据用）。= assortedPlaceOk 非法杖分支
 *  覆盖的 createTile 全集（Player.cs:41372/:41378/:41390/:41403/:41416 各支受理面）。
 *  ★单源化：Game.ts 不再持字面量副本；AssortedThings 其余分支不在此集——
 *  staff(213/5295 特权随 vid 判)、tileMoss 族（MOSS_CONVERT_SHEETS 单模专路）、
 *  227 染料植物（专用路由,见 dyePlaceOk）、滴水族/火把族各有专路 —— 见 assortedPlaceOk 注释档 */
export const GRASS_CONVERT_SHEETS: ReadonlySet<number> = new Set([2, 23, 60, 70, 109, 199, 633, 661, 662]);

/** ItemID.Sets.GrassSeeds（1457 ItemID.cs:84：62 草种/59 腐化种/2171 猩红种/369 神圣种/
 *  195 丛林种/194 蘑菇种/5214 灰烬草种）＋ 再生法杖 213/再生之斧 5295 特权族。
 *  ★定位=原版集合备忘与测试锚。运行时路由（Game.tryPlace 三修后）按「createTile
 *  ∈GRASS_CONVERT_SHEETS（meta 推导）× 非 place_v_* 前缀」判族，staff 特权由
 *  vid∈{213,5295} 细分——本集合不再参与路由判别（曾按它误拦 place_v_109 草块）。 */
export const GRASS_SEED_STAFF_VIDS: ReadonlySet<number> = new Set([62, 59, 2171, 369, 195, 194, 5214, 213, 5295]);

// ============================================================
// GAP-A：tileMoss 苔藓族（2026-09-01 清偿）
// ============================================================
/** tileMoss 族 createTile 全集（Main.cs:7146 起 tileSolid/tileBrick/tileBlockLight/
 *  tileMoss 四联置位的 moss 面；物品面 11 件=vanilla.json meta createTile——
 *  4349-4353→179..183、4354→381、4377→534、4378→536、4389→539、5127→625、5128→627，
 *  Item.cs:37164/37270/41088 DefaultToPlaceableTile 直查）。
 *
 *  ★AssortedThings moss 分支（Player.cs:41377-41383）受理面 = 目标格 nactive() 且
 *  type∈{1 石块,38 灰砖}。
 *
 *  ★【单模】定谳（2026-09-01,登记 GAP-A 原"双模"描述系误读）：else-if 链互斥,
 *  moss 物品命中本支后对空格/其他目标【不置 canPlace】→ PlaceIt 不运行 ⇒
 *  外门 Player.cs:40058 的 `|| Main.tileMoss[tileToCreate]` 只是把活跃目标放行进
 *  TryPlacing 门口,不是空格铺设的通行证（TryPlacing :40086 canPlace 初值 false,
 *  moss 支是唯一可翻真的分支；TileObjectData 无 227 无 moss=CustomPlace 恒 false）。
 *  官方 wiki 同口径："Collected moss can be placed on Stone Blocks and Gray Bricks"
 *  （terraria.wiki.gg/wiki/Moss）。调用方须把族内物品当【无论成败终止】处理
 *  （同草种族）；苔砖变体(512-517/535/537/540/626/628)是普通 legacy 块走通用链，
 *  其放置物品 vid(4710+ 族)不在本判域。 */
export const MOSS_CONVERT_SHEETS: ReadonlySet<number> = MOSS_SHEETS;   // ★BJ210 收编单源 data/tiles.ts:MOSS_SHEETS（Conversion.Moss :38,§6i）

/** moss→灰砖上的苔砖变体映射（WorldGen.PlaceTile 内 num 重写 cs:59902-59912：
 *  `if (tile.type == 38) num = num switch { 381=>517, 534=>535, 536=>537, 539=>540,
 *  625=>626, 627=>628, _ => 512 + num - 179 }`；WorldGen.MossConversion cs:72000 的
 *  正反双向表同构。石块(1)目标不改型——moss 原样落） */
export const MOSS_TO_BRICK_SHEET: Readonly<Record<number, number>> = {
  179: 512, 180: 513, 181: 514, 182: 515, 183: 516,
  381: 517, 534: 535, 536: 537, 539: 540, 625: 626, 627: 628,
};

/** AssortedThings moss 分支纯函数化（Player.cs:41377-41383）。
 *  @param gsheet 手持放置物 createTile（vanilla sheet）
 *  @param tsheet 目标格 sheet（调用方保证非空格才进来；空格在原版即 false） */
export function mossPlaceOk(gsheet: number, tsheet: number): boolean {
  return MOSS_CONVERT_SHEETS.has(gsheet) && (tsheet === 1 || tsheet === 38);
}

// ============================================================
// GAP-B：tile 227 染料植物族（2026-09-01 定谳实装）
// ============================================================
/** PlaceDye 上/下邻豁免植物族（WorldGen.cs:54459/:54467 两处字面同表：type∈
 *  {3 短草,51 长草芽,697 蛛网,61 丛林短草,703 丛林垂藤,73 高草,74 丛林高草,
 *  184 苔藓植物}） */
export const DYE_PLANT_PLANT_FAMILY: ReadonlySet<number> = new Set([3, 51, 697, 61, 703, 73, 74, 184]);

/** 帧步长（PlaceDye cs:54489 `frameX = 34 * style`；CheckDye cs:54260
 *  `frameX / 34` 同步⇒破坏/失撑掉落按此带反推，GetItemDrop case227 cs:65563 同式） */
export const DYE_PLANT_FRAME_STEP = 34;

/** PlaceDye 门纯函数（WorldGen.cs:54451-54502 1:1）。全部入参由调用方预读：
 *  - style：Item.placeStyle（1107-1112→0..5 / 1114 血橙根→7 / 3385-3388 异奇株→8..11；
 *    style 6 仙人掌寄生株无玩家物品,仅世界生成 plantDye 使用）
 *  - above/below 邻格读数（aboveSheet=-1 表上格非 active）
 *  - belowSolid：WorldGen.SolidTile(x,y+1)（严格实心,仓内 solidTileStrictAt 口径）
 *  - selfLiquid/selfLiquidType/selfWall：目标格自身液体量/类型(TileStore +1 编码)/墙
 *  失败=canPlace 进了 PlaceIt 但 PlaceTile case227 写不出帧 → result=false：
 *  原版静默无动作不消耗（ApplyItemTime 只在 flag 后） */
export interface DyePlantSpot {
  style: number;
  aboveActive: boolean; aboveSheet: number;
  aboveSolid: boolean;            // SolidTile(x,y-1)——style 7 吊顶档的锚（上邻严格实心）
  belowActive: boolean; belowSheet: number;
  /** ★A-3（2026-09-04）：style6 下邻 nactive() 专位（cs:54472）——与 belowActive
   *  （裸 active(),cs:54459/:54464）分位：两种活性位仅在邻格带致动器时分歧 */
  belowNactive: boolean;
  sideLeftActive: boolean; sideRightActive: boolean;   // 仅 style 6 用（x±1,y+1,裸 active）
  belowSolid: boolean;            // SolidTile(x,y+1)
  selfLiquidFullWater: boolean;   // liquid==255 && !lava() && !honey() && !shimmer()
  selfHasLiquid: boolean;         // Main.tile[x,y].liquid != 0
  selfWall: number;               // Main.tile[x,y].wall
}
export function dyePlaceOk(sp: DyePlantSpot): boolean {
  if (sp.style === 7) {
    // 吊顶档（cs:54458-54466）：下邻(裸读 active+type,未过 nactive 门)要么 inactive
    // 要么植物族；立足条件=上邻 SolidTile(x,y-1)+下邻非 active
    if (sp.belowActive && !DYE_PLANT_PLANT_FAMILY.has(sp.belowSheet)) return false;
    return sp.aboveSolid && !sp.belowActive;
  }
  if (sp.aboveActive && !DYE_PLANT_PLANT_FAMILY.has(sp.aboveSheet)) return false;
  if (sp.style === 6) {
    // 仙人掌寄生档（cs:54472-54478）：下邻 nactive+80,且左右两侧(y+1 行)非 active
    //（左右=裸 active(),cs:54473-54474——★A-3 分位后勿并 nactive）
    return sp.belowNactive && sp.belowSheet === 80
      && !sp.sideLeftActive && !sp.sideRightActive;
  }
  if (!sp.belowSolid || sp.aboveActive) return false;
  switch (sp.style) {
    case 5:
      // 水中档（Lime Kelp,cs:54488-54492）：满水且非岩浆/蜂蜜/微光
      return sp.selfLiquidFullWater;
    case 8: case 9: case 10: case 11:
      // 异奇株（Strange Plant,cs:54493-54497）：立地即可,液/墙无视
      return true;
    default:
      // 0/1/2 常规立地档 + 3/4 地表档（Marigold/BlueBerries 要求【无】背景墙,cs:54498-54507）
      if (sp.selfHasLiquid) return false;
      if (sp.style === 3 || sp.style === 4) return sp.selfWall === 0;
      return true;
  }
}

// ============================================================
// 道具搜索器「功能件豁免」判据（2026-09-02 神圣种子第三案）
// ============================================================
/** createTile 落在功能转化面的 vi_ 物品不得被 place_v 覆盖去重滤掉。
 *  覆盖去重本意=滤「唯一职能是铺那格 tile」的死条目；草种/法杖（AssortedThings
 *  转化）与苔藓族（点石/灰砖转化）在 place_v 面板块存在时仍是独立功能件——
 *  圣种全家+法杖+苔藓曾被整族滤出背包道具搜索（UI.ts openItemSearchPanel）。
 *  UI 侧消费见 UI.ts 条目过滤；本函数即唯一判据源。 */
export function isFunctionalTileItem(ct: number | undefined): boolean {
  return ct !== undefined && (GRASS_CONVERT_SHEETS.has(ct) || MOSS_CONVERT_SHEETS.has(ct));
}
