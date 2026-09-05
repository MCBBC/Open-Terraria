// ★IIIII179 共享 helper：WorldGen.PlaceTile 受理序「惰性落点预清臂」1:1。
// 机制源（已锚,IIIRS176b/CL 章定谳）：Terarria1457/Terraria/WorldGen.cs:59966-59971
// （1458 同支 :59974-59979,1457→1458 零变更）——共享拒门（488 门→Count 门→界门→
// null 填→forced∨EmptyTile∨!tileSolid∨型特化析取→23/199/2/109/60/661/662/70/633/moss
// 拒→81 门→IsADripTile{373,374,375,461,709} 门→液体草植拒）全部走完之后、case 分派
// 之前：`if (!tile.active()) tile.Clear(TileDataType.Tile | TileDataType.TilePaint |
// TileDataType.Slope);`（IL_0528-0533,ldc.i4 131）。
// Clear(131) 掩码域（Tile.cs:746-779）：type=0 + active(false) + frameX=0 + frameY=0 +
// ClearBlockPaintAndCoating（color(0)/fullbrightBlock(f)/invisibleBlock(f),Tile.cs:906-911）
// + slope(0) + halfBrick(false)。**wall / wallColor / wallFrame / liquid / liquidType /
// wire / actuator / inActive 全部保留**。else-if 支（ResetsHalfBrickPlacementAttempt,
// TileID.cs:181）只打活性目标,世界生成调用型无一在集,不移植（备案）。
// 性质：零掷（不耗骰→全链骰位零位移）；仅改残型字节不改任何受理判定（惰性格本就不构成
// tileCut/BreakableWhenPlacing 阻挡,JS avBlocksAt 先读 flags 短路,vanilla flag5 同）
// →「已认证链守恒」；case 受理路径随后覆写 type/帧,预清被覆盖→差异只在「预清∧拒」格。
// 判别子：flags==0（bit0=active;bit1 framedDecor 系预留位,全仓从未置位,flags==0 ⟺
// !tile.active()——TileStore.ts:22 注释+Mounts.ts:654 同口径）。
import { TileStore } from '../../TileStore';   // IIII177b 解阻：vanilla/ 深度应为 ../../（src/world/TileStore），在途刃遗留坏路径

/** PlaceTile 序言惰性预清：落点 (x,y) 惰性（flags==0）时清五通道
 *  （type/帧X/帧Y/slope/half/块漆+块涂层方块侧四位包），wall/液/活性不动。
 *  调用位=各 placeTile 等价函数「共享拒门全部走完之后、case 分派（含其自有门禁）之前」
 *  = vanilla 序言位；各调用点须自带 vanilla 前置门可达性论证（见各调用点注释）。 */
export function placeTilePrologueClear(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const ti = st.idx(x, y);
  if (st.flags[ti] !== 0) return;
  st.type[ti] = 0;
  st.frameX[ti] = 0;
  st.frameY[ti] = 0;
  st.paint[ti] = 0;
  st.coat[ti] &= ~TileStore.COAT_BLOCK_MASK;   // ClearBlockPaintAndCoating 方块侧两位
  st.slope[ti] = 0;
  st.half[ti] = 0;
}
