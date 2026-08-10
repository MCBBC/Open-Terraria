// 原版 Main.AnimateTiles（Main.cs:18366-19155）竖直帧动画表：sheet → 每 N tick 推进一帧。
// 绘制语义 = TileDrawing addFrY：frameY += frameIdx * (fh*18)（18px padded 网格）。
// 帧数不写死，从素材行数推导：frames = floor(rows / fh)——制冰机 12 帧/骨焊机 7 帧/
// 自动锻造机 8 帧/固化机·玻璃窑 4 帧/磨刀站 4 帧/篝火 8 帧/熔炉 12 帧/锯木机 2 帧。
// 304 Living Loom 原版无动画（AnimateTiles 无 304 条目，素材 54×54 单帧）。
// rate 归一化：原版 counter>4 → 每 5 tick；counter>=5 → 每 5 tick；counter>5 → 每 6 tick。
export const TILE_ANIM_RATE: Record<number, number> = {
  17: 6,   // 熔炉
  106: 5,  // 锯木机
  215: 4,  // 篝火
  220: 5,  // 固化机 Solidifier
  247: 5,  // 自动锻造机 Autohammer
  300: 5,  // 骨焊机
  301: 5,  // 血肉克隆台
  302: 5,  // 玻璃窑
  303: 5,  // 蒸汽锅炉
  305: 5,  // 天空磨
  306: 5,  // 制冰机
  307: 5,  // 蜂蜜分配机
  308: 5,  // 液化机
  354: 5,  // 巫惑台
  355: 5,  // 炼金台
  377: 5,  // 磨刀站
  499: 5,  // 虚空保险箱
};

/** 全局动画时钟（Game 主循环每帧 +1；暂停时冻结） */
export const tileAnim = { tick: 0 };

/** 该 sheet 当前动画帧索引（无动画表项/单帧返回 0）。rows = 素材总行数（18px/行） */
export function animFrameIdx(sheet: number, fh: number, rows: number): number {
  const rate = TILE_ANIM_RATE[sheet];
  if (!rate || fh < 1) return 0;
  const frames = Math.floor(rows / fh);
  if (frames <= 1) return 0;
  return Math.floor(tileAnim.tick / rate) % frames;
}
