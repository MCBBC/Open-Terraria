// 火把锚定（TileObjectData tile 4 + TileObject.CanPlace 1:1）。
// 帧语义（TEdit Tiles_4 framing，22px 步长）：
//   frameX 0 = 底锚直立（地面/背景墙共用直立贴图）、22 = 左锚（贴左块倾斜）、44 = 右锚。
//   未点燃变体 = 点燃帧 +66（Wiring.ToggleTorch Wiring.cs:2922-2937 的 ±66 翻转；
//   frameX ≥ 66 判定见同函数/Player.cs:17654 的 TorchAttack 复燃）。重锚定与点亮态
//   互不干扰——TileFrame 重算时先剥掉 66 再选锚（WorldGen.cs:86860 num = frameX>=66 ? 66 : 0）。
// TileObjectData.cs:4584-4602 锚定义：
//   base      AnchorBottom = SolidTile | SolidSide
//   alt[1]    AnchorLeft   = SolidTile | SolidSide | Tree | AlternateTile(124,561,574-578)
//   alt[2]    AnchorRight  = 同上
//   alt[0]    AnchorWall   = 任意背景墙
// CanPlace（TileObject.cs:203 while 循环）按 base → alt[1] → alt[2] → alt[0] 顺序尝试，全过即取。
import type { TileStore } from './TileStore';
import { TILE_DEFS } from '../data/tiles';

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
 * 无任何锚点返回 -1（放置拒绝）。新放置火把恒为点燃态；既有火把重锚定时须用
 * torchLitFrame 剥偏移选锚、再把 TORCH_UNLIT_OFFSET 加回（WorldGen.cs:86860 语义）。
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
 * 未点燃变体（+66）先剥偏移再判锚——此前 88（22+66）/110（44+66）落进 default，
 * 侧锚丢失不掉、只剩侧锚却误判成立。
 */
export function torchStillAnchored(st: TileStore, tx: number, ty: number, frameX: number): boolean {
  if (!st.inBounds(tx, ty)) return false;
  switch (torchLitFrame(frameX)) {
    case 22: return anchorable(st, tx - 1, ty);
    case 44: return anchorable(st, tx + 1, ty);
    default: return st.isSolid(tx, ty + 1) || st.wall[st.idx(tx, ty)] !== 0;
  }
}
