// 原版 Main.AnimateTiles（Main.cs:18366-19155）竖直帧动画表：sheet → 每 N tick 推进一帧。
// 绘制语义 = TileDrawing.GetTileDrawData addFrY：frameY += frameIdx * pitch。
// ★ pitch 有两组（TileDrawing.cs:4568+ 实证）：**默认 38px**（2 格高物体的帧带 2px 额外
//   间距——熔炉 17(456/38=12帧)/篝火 215(324/38=8帧)/磨刀站 377(152/38=4帧) 全部走默认）；
//   特例组 *54（3 格高 3×18）：锯木机 106、固化机 220、自动锻造机 247、300-308 制作台组、
//   巫惑/炼金台 354/355、腐变室 499。
// 帧数不写死：frames = floor(素材像素高 / pitch)，与 AnimateTiles 的回卷上限互证
// （17→12、215→8、306→12、300→7、247→8 全吻合）。
// 304 Living Loom 原版无动画（AnimateTiles 无 304 条目，素材 54×54 单帧）。
// rate 归一化：原版 counter>N → 每 N+1 tick；counter>=N → 每 N tick。
export const TILE_ANIM_RATE: Record<number, number> = {
  17: 6,   // 熔炉（12 帧，pitch 38）
  106: 5,  // 锯木机（2 帧，pitch 54）
  215: 4,  // 篝火（8 帧，pitch 38）
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
};

/** pitch 54 特例组（其余走默认 38，TileDrawing GetTileDrawData switch 实证） */
const PITCH_54 = new Set([106, 219, 220, 228, 231, 243, 247, 300, 301, 302, 303, 305, 306, 307, 308, 354, 355, 499, 592]);

/** 全局动画时钟（Game 主循环每帧 +1；暂停时冻结） */
export const tileAnim = { tick: 0 };

/** 该 sheet 当前动画帧索引（无动画表项/单帧返回 0）。
 *  sheetHeightPx = 素材总像素高（rows×18）；pitch 54 特例组外默认 38 */
export function animFrameIdx(sheet: number, sheetHeightPx: number): number {
  const rate = TILE_ANIM_RATE[sheet];
  if (!rate) return 0;
  const pitch = PITCH_54.has(sheet) ? 54 : 38;
  const frames = Math.floor(sheetHeightPx / pitch);
  if (frames <= 1) return 0;
  return Math.floor(tileAnim.tick / rate) % frames;
}

/** 绘制时的 frameY 偏移（= 帧索引 × pitch） */
export function animYOffset(sheet: number, sheetHeightPx: number): number {
  const rate = TILE_ANIM_RATE[sheet];
  if (!rate) return 0;
  const pitch = PITCH_54.has(sheet) ? 54 : 38;
  return animFrameIdx(sheet, sheetHeightPx) * pitch;
}
