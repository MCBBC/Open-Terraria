// 读档修复：零帧地牢陈设按墙主题回填样式（2026-08-17，"不要再出现第二次"批）。
// 背景：dgWr 系放置历史上不写帧（并行"终清批"在生成端补），存量世界地牢家具/
// 旗帜/挂画全部零帧 → 渲染端重建只能按样式 0（默认木质家具）画。本修复按
// 物体所在格的墙推断主题回填（原版语义：陈设样式 = 物品 placeStyle 随主题墙）。
//
// 样式基准（Item.cs SetDefaults 提取，item → createTile/placeStyle）：
//   主题墙 7=蓝砖 / 8=绿砖 / 9=粉砖（经典三色）；94-105 = 1.4.4 新砖族（陈设
//   专列 46-51 档）。家具 sheet → [蓝, 绿, 粉, 新族]：
//     15 椅[13,14,15,17]  14 桌[10,11,12,14]  18 工作台[11,12,13,15]
//     33 蜡烛[1,2,3,46]   101 书架[1,2,3,5]   79 床[5,6,7,47]
//     87 钢琴[11,12,13,47] 88 梳妆台[5,6,7,47] 89 浴缸[6,7,8,51]
//     90 [21,22,23,47]    100 [22,23,24,47]   93 烛台[24,25,26,47]
//     104 时钟[30,31,32,48] 105 [46,47,48,—]
//   旗帜 91：style = 16 + variant*2 + roll（Next(16,22)，variant=墙族；WorldGen.cs
//   :32745-32752 array 表）。roll 不可复原 → 位置稳定散列。
//   挂画：240 同墙 {12,13,14,15,18,19,23} / 骨墙 {16,17}；241 骨墙 0-8；242 同墙
//   0-16（RandomDungeonPainting cs:364-385 / RandomBonePainting cs:387-410；原始
//   掷骰不可复原 → 位置稳定散列，按物体所在墙是否主砖族分流）。
// 幂等：整组全零帧才修（样式 0 族修后锚点格仍 (0,0)，只查锚点会每轮重修）。
// 未知墙/残缺组不动（渲染端零帧重建兜底）。返回修复格数。
import { TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../../../data/tiles';
import type { TileStore } from '../../TileStore';

/** 家具 sheet → [蓝7, 绿8, 粉9, 新族94-105]（-1 = 该墙族不放此件） */
const FURN_STYLE: Record<number, [number, number, number, number]> = {
  15: [13, 14, 15, 17],
  14: [10, 11, 12, 14],
  18: [11, 12, 13, 15],
  33: [1, 2, 3, 46],
  101: [1, 2, 3, 5],
  79: [5, 6, 7, 47],
  87: [11, 12, 13, 47],
  88: [5, 6, 7, 47],
  89: [6, 7, 8, 51],
  90: [21, 22, 23, 47],
  100: [22, 23, 24, 47],
  93: [24, 25, 26, 47],
  104: [30, 31, 32, 48],
  105: [46, 47, 48, -1],
};
/** 主砖墙（同墙画族）/ 新砖族 / 地牢墙全集（含骨墙族 191/192 由 DG 墙集外判） */
const WALL_CLASSIC = new Set([7, 8, 9]);
const WALL_NEW = new Set([94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105]);
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 191, 192]);

const hash = (x: number, y: number): number => (x * 73856093) ^ (y * 19349663);

export function repairZeroFrameDungeonDecor(st: TileStore): number {
  // 目标 sheet 集：家具 + 旗帜 91 + 挂画 240/241/242
  const sheetToType = new Map<number, number>();
  for (const t of [91, 240, 241, 242, ...Object.keys(FURN_STYLE).map(Number)]) {
    const type = TILE_INTERNAL_BY_SHEET.get(t) ?? -1;
    if (type > 0) sheetToType.set(t, type);
  }
  let fixed = 0;
  for (const [sheet, type] of sheetToType) {
    const def = TILE_DEFS[type];
    if (!def?.vanilla || def.vanilla.frame !== 'style') continue;
    const fw = def.vanilla.fw ?? 1, fh = def.vanilla.fh ?? 1;
    if (fw < 2 && fh < 2) continue;   // 单格装饰无帧语义问题
    const objW = fw * 18;
    const zeroCell = (x: number, y: number): boolean => {
      if (!st.inBounds(x, y)) return false;
      const i = st.idx(x, y);
      return st.type[i] === type && st.frameX[i] === 0 && st.frameY[i] === 0;
    };
    const writeGroup = (x: number, y: number, style: number): void => {
      for (let dx = 0; dx < fw; dx++) {
        for (let dy = 0; dy < fh; dy++) {
          const ii = st.idx(x + dx, y + dy);
          st.frameX[ii] = style * objW + dx * 18;
          st.frameY[ii] = dy * 18;
          fixed++;
        }
      }
    };
    const styleFor = (x: number, y: number): number | null => {
      // 墙采样 = 足迹中心格的墙
      const wx = x + (fw >> 1), wy = y + (fh >> 1);
      if (!st.inBounds(wx, wy)) return null;
      const wall = st.wall[st.idx(wx, wy)];
      if (FURN_STYLE[sheet]) {
        const col = WALL_NEW.has(wall) ? 3 : wall === 7 ? 0 : wall === 8 ? 1 : wall === 9 ? 2 : -1;
        if (col < 0) return null;
        const s = FURN_STYLE[sheet][col];
        return s >= 0 ? s : null;
      }
      if (sheet === 91) {
        // 旗帜：16 + variant*2 + 散列 roll（variant 0/1/2，新族/经典蓝=0 族系）
        if (!WALL_DUNGEON.has(wall)) return null;
        const variant = WALL_NEW.has(wall) ? 0
          : wall === 94 || wall === 96 || wall === 98 ? 1
          : wall === 95 || wall === 97 || wall === 99 ? 2 : 0;
        return 16 + variant * 2 + (Math.abs(hash(x, y)) % 2);
      }
      // 挂画：原版 paintingEntry 以「墙==本世界主砖墙」分流（探针实证骨画房
      // 用变体墙 94 族，非 191/192）——修复按 wall 家族近似：
      //   经典三色墙 {7,8,9} = 主砖族；其余地牢墙（94-105/191/192）= 骨墙族
      if (sheet === 240) {
        if (!WALL_DUNGEON.has(wall)) return null;
        const set = WALL_CLASSIC.has(wall) ? [12, 13, 14, 15, 18, 19, 23] : [16, 17];
        return set[Math.abs(hash(x, y)) % set.length];
      }
      if (sheet === 241) {
        if (!WALL_DUNGEON.has(wall) || WALL_CLASSIC.has(wall)) return null;   // 骨墙专属
        return Math.abs(hash(x, y)) % 9;
      }
      if (sheet === 242) {
        if (!WALL_CLASSIC.has(wall) && !WALL_NEW.has(wall)) return null;
        return Math.abs(hash(x, y)) % 17;
      }
      return null;
    };
    for (let y = 0; y < st.h - fh; y++) {
      for (let x = 0; x < st.w - fw; x++) {
        if (!zeroCell(x, y)) continue;
        // run 左上角（左/上无同型零帧格）→ 按 fw×fh 切块
        if (zeroCell(x - 1, y) || zeroCell(x, y - 1)) continue;
        let whole = true;
        for (let dx = 0; dx < fw && whole; dx++) {
          for (let dy = 0; dy < fh; dy++) {
            const ii = st.idx(x + dx, y + dy);
            if (!st.flags[ii] || st.type[ii] !== type
              || st.frameX[ii] !== 0 || st.frameY[ii] !== 0) { whole = false; break; }
          }
        }
        if (!whole) continue;
        const style = styleFor(x, y);
        if (style == null) continue;
        writeGroup(x, y, style);
      }
    }
  }
  return fixed;
}

