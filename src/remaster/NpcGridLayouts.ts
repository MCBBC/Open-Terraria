// 2D 网格贴图 NPC 布局表(重制管线单一真源)。
// 数据从 Renderer.drawNpcGrid 各调用处提取(Main.cs Frame(cols,rows,…) 1:1);
// Renderer 帧态状态机(queenSlimeNextFrame 等)不在此——这里只描述【贴图几何】。
// 帧矩形公式 = drawNpcGrid(:5287-5292)同式:
//   col = floor(idx/perRow); row = idx%perRow
//   sx = col*cellW+padX; sy = row*cellH+padY
//   sw = cellW-2*padX;   sh = cellH-2*padY
//   inflateY: sy += inflateY>>1; sh -= inflateY
export interface NpcGridDef {
  cols: number; rows: number;
  cellW: number; cellH: number;
  /** 渲染侧 idx→(col,row) 折行除数(drawNpcGrid 语义;696 为 9 而非 rows)。
   *  ★与帧枚举无关:npcGridFrames 按【行优先网格序】枚举 sheet 全部格子,
   *  frameIdx 只是工作台导航序号,不等于渲染动画 idx。 */
  perRow?: number;
  padX?: number; padY?: number;
  inflateY?: number;
}

/** NPC id → 2D 网格布局。走 vnpc 纵条的 NPC 不在此表。 */
export const NPC_GRIDS: Record<number, NpcGridDef> = {
  // 657 史莱姆皇后:NPC_657.png 360×1952 = 2 列×16 行(180×122/格),Inflate(0,-2)
  657: { cols: 2, rows: 16, cellW: 180, cellH: 122, perRow: 16, inflateY: 2 },
  // 576/577 DD2 食人魔:1162×1740 = 5 列×10 行(232×174/格)
  576: { cols: 5, rows: 10, cellW: 232, cellH: 174, perRow: 10 },
  577: { cols: 5, rows: 10, cellW: 232, cellH: 174, perRow: 10 },
  // 696:384×1242 = 6 列×27 行(64×46/格),渲染索引每 9 折行(row+18 为投影层)
  696: { cols: 6, rows: 27, cellW: 64, cellH: 46, perRow: 9 },
  // 564/565 暗黑魔法师 T1/T2:600×972 = 5 列×9 行(120×108/格)
  564: { cols: 5, rows: 9, cellW: 120, cellH: 108, perRow: 9 },
  565: { cols: 5, rows: 9, cellW: 120, cellH: 108, perRow: 9 },
  // 668 鹿角怪:1090×1200 = 5 列×5 行(218×240/格),Frame(5,5,idx/5,idx%5,2,2) 2px padding
  // (Renderer 里 drawDeerclopsGrid 手写切格未走 drawNpcGrid,几何等价此处入表)
  668: { cols: 5, rows: 5, cellW: 218, cellH: 240, perRow: 5, padX: 2, padY: 2 },
};

/** 依布局定义枚举 sheet 全部格子矩形(行优先网格序,总格数 = cols×rows)。
 *  切格公式与 drawNpcGrid 一致(pad/inflateY 同式),但【不消费 perRow】——
 *  渲染动画 idx 的折行映射是渲染侧语义,重制管线枚举的是"sheet 上的格子"。 */
export function npcGridFrames(def: NpcGridDef, sheetW: number, sheetH: number): Array<{ x: number; y: number; w: number; h: number }> {
  const out: Array<{ x: number; y: number; w: number; h: number }> = [];
  const padX = def.padX ?? 0, padY = def.padY ?? 0;
  for (let row = 0; row < def.rows; row++) {
    for (let col = 0; col < def.cols; col++) {
      let x = col * def.cellW + padX, y = row * def.cellH + padY;
      let w = def.cellW - padX * 2, h = def.cellH - padY * 2;
      if (def.inflateY) { y += def.inflateY >> 1; h -= def.inflateY; }
      // 越界钳制(drawNpcGrid :5293-5296 同款防御;正常表不触发)
      if (x + w > sheetW || y + h > sheetH) {
        if (x >= sheetW || y >= sheetH) continue;   // 整格出表:丢弃
        w = Math.min(w, sheetW - x); h = Math.min(h, sheetH - y);
      }
      if (w > 0 && h > 0) out.push({ x, y, w, h });
    }
  }
  return out;
}
