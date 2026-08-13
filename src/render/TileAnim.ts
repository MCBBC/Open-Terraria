// 原版 Main.AnimateTiles（Main.cs:18366-19155）竖直帧动画表：sheet → 每 N tick 推进一帧。
// 绘制语义 = TileDrawing.GetTileDrawData addFrY：frameY += frameIdx * pitch。
// ★ pitch 有多组（TileDrawing.cs:4568+ 实证）：
//   默认 38px（2 格高物体的帧带 2px 额外间距——熔炉 17(456/38=12帧)/磨刀站 377 走默认；
//   篝火 215 走专属 36（TileDrawing.cs:6124 Campfires 覆盖，帧块 36px 无缝——勿并入默认 38！
//   曾致胶片滚动）；54 组（3 格高 3×18）：锯木机 106、固化机 220、自动锻造机 247、
//   300-308 制作台组、巫惑/炼金台 354/355、腐变室 499、水晶球 219、灌注台 243、吊火盆 592；
//   36 组（TileDrawing.cs:5524-5624 `frame*36`）：生命水晶 12/魔金球 31/魔力水晶 639、
//   混合机 217/绞肉机 218/染料缸 244；90 组（:4590-4594 `frame*90`）：水母砖 739/水砖 748；
//   72（:6002-6022 喷泉 207）。
// 帧数：默认 floor(素材像素高/pitch)（17→12、215→8、306→12、300→7、247→8 全吻合）；
//   个别素材高/pitch ≠ 原版回卷上限（12/639 表 396/36=11 但原版回卷 10）→
//   TILE_ANIM_FRAMES 显式指定。
// 304 Living Loom 原版无动画（AnimateTiles 无 304 条目，素材 54×54 单帧）。
// rate 归一化：原版 counter>N → 每 N+1 tick；counter>=N → 每 N tick。
export const TILE_ANIM_RATE: Record<number, number> = {
  17: 6,   // 熔炉（12 帧，pitch 38；counter>5）
  106: 5,  // 锯木机（2 帧，pitch 54；counter>4）
  215: 4,  // 篝火（8 帧；pitch 走 campfireYOffset 的 36，本表只管换帧节奏；counter>=4）
  220: 5,  // 固化机 Solidifier（4 帧，pitch 54）
  247: 5,  // 自动锻造机 Autohammer（8 帧，pitch 54）
  300: 5,  // 骨焊机（7 帧）
  301: 5,  // 血肉克隆台（8 帧）
  302: 5,  // 玻璃窑（4 帧）
  303: 5,  // 神庙熔炉（5 帧）
  305: 5,  // 天空磨（12 帧）
  306: 5,  // 制冰机（12 帧）
  307: 5,  // 蒸汽锅炉（2 帧，TEdit 实名）
  308: 5,  // 蜂蜜分配机（8 帧，TEdit 实名）
  354: 5,  // 巫惑台（8 帧）
  355: 5,  // 炼金台
  377: 5,  // 磨刀站（4 帧，pitch 38）
  499: 5,  // 腐变室 Decay Chamber（8 帧）
  // 矿车轨道加速带（Main.cs:18734-18741：5 帧循环）。★只用于 advanceAnim 重烘焙节奏；
  // 帧行偏移不走本表 pitch 语义（frameX/frameY 是轨道连接 ID）——由
  // MinecartTrack.sourceRectOf(frameID, boosterAnimFrame()) 处理，ChunkCache 已特判
  314: 10,
  // ---- 2026-08 缺表补齐（AnimateTiles 逐 id，Main.cs:18366-19155）----
  77: 6,    // 地狱熔炉（12 帧，pitch 38；counter>5 同 17，Main.cs:18539-18548）
  133: 4,  // 精金熔炉（6 帧，pitch 38；`if (++counter >= 4)` = 每 4 tick，Main.cs:18420-18427）
  207: 5,  // 喷泉（6 帧，pitch 72，Main.cs:18528-18535 counter>4）。
           //   ★原版逐列错相（TileDrawing.cs:6007-6014 addFrY=(frame+x%6)%6*72）未接——
           //   此处全池同步换带，视觉近似
  217: 5,  // 混合机 Blend-O-Matic（5 帧，pitch 36；Main.cs:18565-18572）
  218: 5,  // 绞肉机（2 帧，pitch 36；Main.cs:18575-18582）
  219: 5,  // 水晶球（10 帧，pitch 54；Main.cs:18585-18592）
  243: 5,  // 灌注台（6 帧，pitch 54；Main.cs:18609-18616）
  244: 5,  // 染料缸（6 帧，pitch 36；Main.cs:18619-18626。
           //   原版仅左样式列动（TileDrawing.cs:5583-5593 `tileFrameX<54` 门），
           //   本仓 dye vat 只出 placeStyle 0，恒过门）
  592: 5,  // 吊火盆（8 帧，pitch 54；Main.cs:18496-18503 counter>=5）
  12: 6,   // 生命水晶（回卷 10，pitch 36；Main.cs:18367-18376 counter>5——表 396/36=11，
           //   多出的末带是未用行，TILE_ANIM_FRAMES 钉 10）
  639: 6,  // 魔力水晶（回卷 10，pitch 36；Main.cs:18378-18387，同 12）
  31: 8,   // 魔金球（4 帧，pitch 36；Main.cs:18429-18437 counter>=8）
  739: 11, // 水母砖（4 帧，pitch 90；Main.cs:18389-18397 counter>10）
  748: 8,  // 水砖（8 帧，pitch 90；Main.cs:18399-18407 counter>7）
  171: 17, // 圣诞树串灯（Main.cs:18609-18618 counter>16 → 每 17 tick；4 帧回卷。
           //   ★只管重烘焙节奏：帧行偏移由 VanillaTiler.drawXmasTreeCell 按
           //   Xmas_4 的 130px 行距自取（不走本表 pitch 语义）
};

/** pitch 特例表（其余走默认 38，TileDrawing GetTileDrawData switch 实证）。
 *  36 组 = :5524（12/31/96/639/665/696）+ :5615-5624（217/218）；54 组见头注；
 *  72 = :6002（207 喷泉）；90 = :4590（739/748） */
const TILE_ANIM_PITCH: Record<number, number> = {
  106: 54, 219: 54, 220: 54, 228: 54, 231: 54, 243: 54, 247: 54,
  300: 54, 301: 54, 302: 54, 303: 54, 305: 54, 306: 54, 307: 54, 308: 54,
  354: 54, 355: 54, 499: 54, 592: 54,
  12: 36, 31: 36, 217: 36, 218: 36, 244: 36, 639: 36,
  207: 72, 739: 90, 748: 90,
};

/** 回卷上限显式覆盖（默认 floor(素材高/pitch)；素材含未用行时以原版回卷为准） */
const TILE_ANIM_FRAMES: Record<number, number> = {
  12: 10, 639: 10,   // 表 396px=11 带，AnimateTiles 回卷 10（Main.cs:18375/18385）
  171: 4,            // 圣诞树串灯：Xmas_4 四帧行（Main.cs:18614-18616 >3 回卷）
};

/** 篝火族（TileDrawing.cs:6124-6133 Campfires 覆盖）：pitch=36（非默认 38！素材帧块
 *  36px 无缝排布——曾按默认 38 导致每帧 +2px 漂移，火焰像胶片滚动）；
 *  frameY≥36 的行（熄灭/灰烬变体）恒取静止帧 252 */
export function campfireYOffset(frameY: number): number {
  return frameY < 36 ? animFrameIdx(215, 324) * 36 : 252;
}

/** 全局动画时钟（Game 主循环每帧 +1；暂停时冻结） */
export const tileAnim = { tick: 0 };

/** animFrameIdx/animYOffset 共用的 pitch 取值（无动画表项返回 0 表示不适用） */
export function tileAnimPitch(sheet: number): number {
  return TILE_ANIM_PITCH[sheet] ?? 38;
}

/** 该 sheet 当前动画帧索引（无动画表项/单帧返回 0）。
 *  sheetHeightPx = 素材总像素高（rows×18）；帧数 = TILE_ANIM_FRAMES 覆盖
 *  或 floor(sheetHeightPx / pitch) */
export function animFrameIdx(sheet: number, sheetHeightPx: number): number {
  const rate = TILE_ANIM_RATE[sheet];
  if (!rate) return 0;
  const frames = TILE_ANIM_FRAMES[sheet] ?? Math.floor(sheetHeightPx / tileAnimPitch(sheet));
  if (frames <= 1) return 0;
  return Math.floor(tileAnim.tick / rate) % frames;
}

/** 绘制时的 frameY 偏移（= 帧索引 × pitch） */
export function animYOffset(sheet: number, sheetHeightPx: number): number {
  const rate = TILE_ANIM_RATE[sheet];
  if (!rate) return 0;
  return animFrameIdx(sheet, sheetHeightPx) * tileAnimPitch(sheet);
}
