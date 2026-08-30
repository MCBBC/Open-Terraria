// 原版 Main.AnimateTiles（Main.cs:18366-19155）竖直帧动画表：sheet → 每 N tick 推进一帧。
import { tileFrameCapture } from '../debug/TileFrameCapture';
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
  12 : 6,
  17 : 6,
  31 : 8,
  77 : 6,
  106: 5,
  129: 6,
  133: 4,
  171: 17,
  207: 5,
  215: 4,
  217: 5,
  218: 5,
  219: 5,
  220: 5,
  235: 4,
  238: 4,
  243: 5,
  244: 5,
  247: 5,
  272: 10,
  300: 5,
  301: 5,
  302: 5,
  303: 5,
  305: 5,
  306: 5,
  307: 5,
  308: 5,
  314: 10,
  326: 5,
  327: 10,
  328: 5,
  329: 5,
  336: 5,
  345: 10,
  351: 5,
  354: 5,
  355: 5,
  377: 5,
  379: 4,
  390: 7,
  405: 5,
  406: 8,
  410: 8,
  421: 4,
  422: 4,
  452: 15,
  453: 60,
  455: 6,
  456: 80,
  458: 10,
  459: 10,
  463: 6,
  464: 23,
  480: 8,
  485: 20,
  491: 40,
  499: 5,
  509: 8,
  564: 36,
  565: 5,
  572: 4,
  592: 5,
  593: 9,
  594: 9,
  597: 64,
  614: 6,
  639: 6,
  642: 6,
  657: 8,
  658: 10,
  708: 10,
  720: 16,
  721: 32,
  725: 4,
  739: 11,
  748: 8,
};

/** pitch 特例表（其余走默认 38，TileDrawing GetTileDrawData switch 实证）。
 *  36 组 = :5524（12/31/96/639/665/696）+ :5615-5624（217/218）；54 组见头注；
 *  72 = :6002（207 喷泉）；90 = :4590（739/748） */
/** 捕获系统读表用（生效 pitch 对照） */
export const TILE_ANIM_PITCH: Record<number, number> = {
  106: 54, 219: 54, 220: 54, 228: 54, 231: 54, 243: 54, 247: 54,
  300: 54, 301: 54, 302: 54, 303: 54, 305: 54, 306: 54, 307: 54, 308: 54,
  354: 54, 355: 54, 499: 54, 592: 54,
  12: 36, 31: 36, 217: 36, 218: 36, 244: 36, 639: 36,
  207: 72, 739: 90, 748: 90,
  326: 90, 327: 90, 345: 90, 458: 90, 459: 90,   // 瀑布族（TileDrawing.cs:6085-6094）
};

/** 回卷上限显式覆盖（默认 floor(素材高/pitch)；素材含未用行时以原版回卷为准） */
/** 回卷上限显式覆盖（默认 floor(素材高/pitch)；素材含未用行时以原版回卷为准） */
const TILE_ANIM_FRAMES_OVERRIDE: Record<number, number> = {
  12: 10, 129: 6, 171: 4, 207: 6, 215: 8, 235: 4, 238: 4, 272: 5,
  328: 19, 329: 19, 336: 9, 351: 7, 379: 4, 390: 7, 405: 8, 406: 6,
  410: 8, 421: 4, 422: 9, 452: 15, 453: 6, 455: 6, 456: 6, 463: 6,
  464: 23, 480: 8, 485: 4, 491: 1, 509: 8, 564: 36, 565: 5, 572: 4,
  593: 9, 594: 9, 597: 2, 614: 6, 639: 10, 642: 6, 657: 8, 658: 10,
  708: 19, 720: 16, 721: 32, 725: 4,
};

/** 捕获系统读表用（生效帧数对照） */
export const TILE_ANIM_FRAMES: Record<number, number> = {
  12  : 10,
  17  : 6,
  106 : 5,
  129 : 6,
  133 : 4,
  171 : 7,
  217 : 8,
  218 : 9,
  219 : 11,
  220 : 9,
  228 : 5,
  231 : 8,
  235 : 4,
  238 : 4,
  243 : 4,
  244 : 10,
  247 : 8,
  300 : 8,
  301 : 8,
  302 : 4,
  303 : 5,
  305 : 12,
  306 : 7,
  307 : 8,
  308 : 12,
  314 : 5,
  326 : 6,
  327 : 6,
  328 : 19,
  329 : 19,
  336 : 9,
  345 : 6,
  351 : 7,
  354 : 6,
  355 : 6,
  377 : 4,
  379 : 4,
  390 : 7,
  405 : 8,
  406 : 6,
  410 : 8,
  421 : 4,
  422 : 9,
  452 : 15,
  453 : 6,
  455 : 6,
  456 : 6,
  458 : 6,
  459 : 6,
  463 : 6,
  464 : 23,
  480 : 8,
  485 : 4,
  491 : 1,
  493 : 6,
  499 : 6,
  507 : 4,
  508 : 6,
  509 : 8,
  564 : 36,
  565 : 5,
  572 : 4,
  592 : 10,
  593 : 9,
  594 : 9,
  597 : 2,
  614 : 6,
  639 : 6,
  642 : 6,
  657 : 8,
  658 : 10,
  660 : 6,
  665 : 6,
  708 : 19,
  720 : 16,
  721 : 32,
  725 : 4,
  748 : 6,
};
;

/** 篝火族（TileDrawing.cs:6124-6133 Campfires 覆盖）：pitch=36（非默认 38！素材帧块
 *  36px 无缝排布——曾按默认 38 导致每帧 +2px 漂移，火焰像胶片滚动）；
 *  frameY≥36 的行（熄灭/灰烬变体）恒取静止帧 252 */
export function campfireYOffset(frameY: number): number {
  // ★原版语义（TileDrawing.cs:6132-6140）:frameY 本身即状态位——
  //   点燃 = 0/18（<36）:addFrY = tileFrame×36（4 帧火动画,y 0-143 带循环）
  //   熄灭 = 36/54（≥36）:addFrY = 252 固定（绘制 y=288/306 熄灭带,静止）
  //   线控 ToggleCampFire = frameY ±36 翻转（Wiring.cs:1003-1020）;
  //   SceneMetrics :380 frameY<36=点燃（篝火增益计数）。
  // 曾 <288 门:熄灭件（36/54）被误判点燃去动画+扫过点燃带=双态动画同放/
  // 上下行错缝（2026-08-25 用户报,存档帧恰为 36/54 熄灭态）。曾 <36 光照门
  // 反而是对的（熄灭本就无光）。
  if (frameY < 36) { const off = frameY + animFrameIdx(215, 144) * 36; tileFrameCapture.yoff('c215', String(frameY), off); return off; }
  tileFrameCapture.yoff('c215', String(frameY), frameY + 252);
  return frameY + 252;
}

/** 喷泉族（TileDrawing.cs:6007-6028 case 207 1:1）：sheet 7 带 = 第 0 带关态整图 +
 *  6 帧开态水流动画带（SwitchFountain WorldGen.cs:51624-51631 frameY±72 切换）。
 *  关态（frameY<72，放置默认）addFrY=0 静止；开态（frameY≥72）
 *  addFrY = ((全局帧 + 左列世界x%6) % 6) × 72 —— 逐喷泉按 x 错相（:6012-6022），
 *  右列归左列判据 frameX%36!==0。由 ChunkCache 预加（相位需世界 x，与 215 同款），
 *  drawVanillaCell 通用 animYOffset 叠加须排除 207 防双加。 */
export function fountainYOffset(frameY: number, x: number, frameX: number): number {
  if (frameY < 72) { tileFrameCapture.yoff('f207', `${frameY}|off`, 0); return frameY; }
  const leftX = frameX % 36 !== 0 ? x - 1 : x;
  const idx = (animFrameIdx(207, 504) + (leftX % 6)) % 6;
  tileFrameCapture.yoff('f207', `fy${frameY}x${x}`, frameY + idx * 72);
  return frameY + idx * 72;
}

/** 烟囱族（TileDrawing.cs:5448-5462 case 406 verbatim）：
 *  num55 = tileFrame[406](6 帧循环)；按存储带折算：
 *    fy≥108 → 6-floor(fy/54)(高样式静态带)、54≤fy<108 → idx-1、fy<54 → idx；
 *  addFrY = num55×56 + floor(fy/54)×2（pitch 56，Tiles_406.png 54×392=7×56 实测）。
 *  露天默认档（fy=18/36，本案）即循环 6 帧烟雾明暗 */
export function chimneyAddFrY(frameY: number): number {
  const idx = animFrameIdx(406, 392);
  let n = idx;
  if (frameY >= 108) n = 6 - Math.floor(frameY / 54);
  else if (frameY >= 54) n = idx - 1;
  const off = n * 56 + Math.floor(frameY / 54) * 2;
  tileFrameCapture.yoff('ch406', String(frameY), off);
  if (off < 0 || off > 392 - 54 + 18) tileFrameCapture.anom('yoff-dup', 406, -1, -1, 0, frameY, `off=${off}`);
  return off;
}

/** 壁炉族（TileDrawing.cs:5514-5529 case 405 verbatim）：addFrY = tileFrame[405]×38
 *  （pitch 38 与篝火/家具火焰族同款——Tiles_405.png 108×306 实测 8×38−2 带）；
 *  ★例外：frameX≥54 的列静止（num37=0，cs:5524-5526 烟囱列门）。返回 addFrY 增量 */
export function fireplaceAddFrY(frameX: number): number {
  if (frameX >= 54) { tileFrameCapture.yoff('fp405', `x${frameX}:s`, 0); return 0; }
  const off = animFrameIdx(405, 306) * 38;
  tileFrameCapture.yoff('fp405', String(frameX), off);
  return off;
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
