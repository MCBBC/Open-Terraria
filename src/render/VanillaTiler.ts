// 原版图块通用渲染器：TEdit TileFraming.SelfFrame8Way 移植（8 向 47 项查找表）
// 用于 TileDef.vanilla.frame === 'auto' 的 1x1 实心块（泥土/矿石/冰雪等同表系）。
// 位序（与游戏 neighborMask 不同！）：U=1 L=2 R=4 D=8 UL=16 UR=32 DL=64 DR=128
// 变体选择 (x*7 + y*11) % 3；无条目/越界回退默认帧 (1,1)
import type { SpriteAtlas, DrawRect } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';
import { TILE } from '../core/constants';

type Frame = [number, number];

// 47 项查找表（源：TEdit Render/TileFraming.cs BuildSelfFrame8WayLookup）
const LOOKUP: Record<number, Frame[]> = {
  0: [[9, 3], [10, 3], [11, 3]],
  1: [[6, 3], [7, 3], [8, 3]],
  2: [[12, 0], [12, 1], [12, 2]],
  3: [[15, 2]],
  4: [[9, 0], [9, 1], [9, 2]],
  5: [[13, 2]],
  6: [[6, 4], [7, 4], [8, 4]],
  7: [[14, 2]],
  8: [[6, 0], [7, 0], [8, 0]],
  9: [[5, 0], [5, 1], [5, 2]],
  10: [[15, 0]],
  11: [[15, 1]],
  12: [[13, 0]],
  13: [[13, 1]],
  14: [[14, 0]],
  15: [[14, 1]],
  19: [[1, 4], [3, 4], [5, 4]],
  23: [[16, 3]],
  27: [[17, 0]],
  31: [[13, 4]],
  37: [[0, 4], [2, 4], [4, 4]],
  39: [[17, 3]],
  45: [[16, 0]],
  47: [[12, 4]],
  55: [[1, 2], [2, 2], [3, 2]],
  63: [[6, 2], [7, 2], [8, 2]],
  74: [[1, 3], [3, 3], [5, 3]],
  75: [[17, 1]],
  78: [[16, 2]],
  79: [[13, 3]],
  91: [[4, 0], [4, 1], [4, 2]],
  95: [[11, 0], [11, 1], [11, 2]],
  111: [[17, 4]],
  127: [[14, 3]],
  140: [[0, 3], [2, 3], [4, 3]],
  141: [[16, 1]],
  142: [[17, 2]],
  143: [[12, 3]],
  159: [[16, 4]],
  173: [[0, 0], [0, 1], [0, 2]],
  175: [[10, 0], [10, 1], [10, 2]],
  191: [[15, 3]],
  206: [[1, 0], [2, 0], [3, 0]],
  207: [[6, 1], [7, 1], [8, 1]],
  223: [[14, 4]],
  239: [[15, 4]],
  255: [[1, 1], [2, 1], [3, 1]],
};

const DEFAULT_FRAME: Frame = [1, 1];

/** 8 向邻居掩码（vanilla 位序：U=1 L=2 R=4 D=8 UL=16 UR=32 DL=64 DR=128） */
export function mask8(st: TileStore, x: number, y: number, type: number, same: (t: number) => boolean): number {
  const at = (ax: number, ay: number) => st.inBounds(ax, ay) && same(st.type[st.idx(ax, ay)]);
  let m = 0;
  if (at(x, y - 1)) m |= 1;    // U
  if (at(x - 1, y)) m |= 2;    // L
  if (at(x + 1, y)) m |= 4;    // R
  if (at(x, y + 1)) m |= 8;    // D
  // 角：两相邻正交邻也在时角才计入（vanilla BlockStyle 语义的简化）
  if ((m & 3) === 3 && at(x - 1, y - 1)) m |= 16;    // UL
  if ((m & 5) === 5 && at(x + 1, y - 1)) m |= 32;    // UR
  if ((m & 10) === 10 && at(x - 1, y + 1)) m |= 64;  // DL
  if ((m & 12) === 12 && at(x + 1, y + 1)) m |= 128; // DR
  return m;
}

/** 'auto' 帧：查表 + 变体。返回 (col,row) 或 null（回退默认帧由调用方处理） */
export function frameFor(atlas: SpriteAtlas, sheet: number, st: TileStore, x: number, y: number, type: number, same: (t: number) => boolean): DrawRect | null {
  const entry = LOOKUP[mask8(st, x, y, type, same)];
  if (entry) {
    const v = entry[((x * 7) + (y * 11)) % 3 % entry.length];
    const r = atlas.vframe(sheet, v[0], v[1]);
    if (r) return r;
  }
  return atlas.vframe(sheet, DEFAULT_FRAME[0], DEFAULT_FRAME[1]);
}

/** 绘制一格原版图块。
 *  auto：现场算帧；style：显式 18px 帧偏移。
 *  重要修正：wld 里多格家具每格 frameX 往往全 0（不是 0/18 交错），
 *  直接用存储帧会让 2 格宽家具两格都画锚点帧（重复左侧贴图）。
 *  style 模式改为：若本格帧偏移为 0，向左/上扫描同类同物体格子，
 *  按到锚点的格距重算帧偏移（锚点=左侧或上方最近格） */
export function drawVanillaCell(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas,
  sheet: number, frame: 'auto' | 'style', fw: number, fh: number,
  st: TileStore, x: number, y: number, type: number,
  same: (t: number) => boolean, px: number, py: number, fx: number, fy: number,
): void {
  let r: DrawRect | null = null;
  if (frame === 'auto') {
    r = frameFor(atlas, sheet, st, x, y, type, same);
  } else {
    // 重建帧偏移：0 偏移且左边/上边是同类 → 该格是锚点，但可能是锚点在左的延伸格
    let ofx = fx, ofy = fy;
    if (ofx === 0 && ofy === 0 && (fw > 1 || fh > 1)) {
      // 向左扫描最多 fw-1 格找同物体（frameY 相同视为同一物体）
      let ax = 0;
      for (let k = 1; k < fw; k++) {
        if (st.inBounds(x - k, y) && st.type[st.idx(x - k, y)] === type && st.frameY[st.idx(x - k, y)] === fy) ax = k;
        else break;
      }
      ofx = ax * 18;
      // 向上扫描最多 fh-1 格
      let ay = 0;
      for (let k = 1; k < fh; k++) {
        if (st.inBounds(x, y - k) && st.type[st.idx(x, y - k)] === type && st.frameX[st.idx(x, y - k)] === ofx) ay = k;
        else break;
      }
      ofy = ay * 18;
    }
    // 宝箱表（Tiles_21）特判：3 组状态带高 38px（含 2px 边距），不是标准 18 stride
    if (sheet === 21) {
      r = atlas.vrect(sheet, ofx * 18, Math.floor(ofy / 18) * 38 + 2, 16, 16);
    }
    if (!r) r = atlas.vframeAt(sheet, ofx, ofy);
    if (!r) r = atlas.vframeAt(sheet, 0, 0);
  }
  if (!r) return;
  // 蜡烛类高格（grid 16×20）：底部对齐本格
  const dy = py + TILE - r.sh;
  ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, px, dy < py ? py : dy, r.sw, r.sh);
  void fw; void fh;
}
