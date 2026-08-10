// 火把锚定（TileObjectData tile 4 + TileObject.CanPlace 1:1）。
// 帧语义（TEdit Tiles_4 framing，22px 步长）：
//   frameX 0 = 底锚直立（地面/背景墙共用直立贴图）、22 = 左锚（贴左块倾斜）、44 = 右锚。
//   +66 起为未点燃变体（Torch God 熄灭，未移植）。
// TileObjectData.cs:4584-4602 锚定义：
//   base      AnchorBottom = SolidTile | SolidSide
//   alt[1]    AnchorLeft   = SolidTile | SolidSide | Tree | AlternateTile(124,561,574-578)
//   alt[2]    AnchorRight  = 同上
//   alt[0]    AnchorWall   = 任意背景墙
// CanPlace（TileObject.cs:203 while 循环）按 base → alt[1] → alt[2] → alt[0] 顺序尝试，全过即取。
import type { TileStore } from './TileStore';
import { TILE_DEFS } from '../data/tiles';

/** 树干/棕榈干 sheet（AnchorLeft/Right 的 Tree|AlternateTile 项） */
const TRUNK_SHEETS = new Set([5, 72, 323, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634, 124, 561, 574, 575, 576, 577, 578]);

const isTrunk = (st: TileStore, x: number, y: number): boolean => {
  const i = st.idx(x, y);
  if (!st.flags[i] || st.type[i] === 0) return false;
  const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet;
  return sheet !== undefined && TRUNK_SHEETS.has(sheet);
};

/** 可锚定的支撑（AnchorLeft/Right 用：实心或树干） */
const anchorable = (st: TileStore, x: number, y: number): boolean =>
  st.isSolid(x, y) || isTrunk(st, x, y);

/**
 * 计算放置锚点帧。优先级 1:1 TileObject.CanPlace：底锚(0) → 左锚(22) → 右锚(44) → 墙锚(0)。
 * 无任何锚点返回 -1（放置拒绝）。
 */
export function torchAnchorFrame(st: TileStore, tx: number, ty: number): number {
  if (!st.inBounds(tx, ty)) return -1;
  if (st.isSolid(tx, ty + 1)) return 0;                       // base: AnchorBottom
  if (anchorable(st, tx - 1, ty)) return 22;                  // alt[1]: AnchorLeft
  if (anchorable(st, tx + 1, ty)) return 44;                  // alt[2]: AnchorRight
  if (st.wall[st.idx(tx, ty)] !== 0) return 0;                // alt[0]: AnchorWall
  return -1;
}

/**
 * 已放置火把的锚是否仍然成立（支撑被挖掉时判定掉落）。
 * frameX 0 的直立火把：底锚或墙锚任一在即成立（vanilla 行为：拆地板留墙不掉）。
 */
export function torchStillAnchored(st: TileStore, tx: number, ty: number, frameX: number): boolean {
  if (!st.inBounds(tx, ty)) return false;
  switch (frameX) {
    case 22: return anchorable(st, tx - 1, ty);
    case 44: return anchorable(st, tx + 1, ty);
    default: return st.isSolid(tx, ty + 1) || st.wall[st.idx(tx, ty)] !== 0;
  }
}
