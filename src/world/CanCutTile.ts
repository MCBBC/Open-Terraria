// WorldGen.CanCutTile 1:1 谓词（Terarria1457/Terraria/WorldGen.cs:88111-88124）。
// 唯一标杆全文：
//
//   public static bool CanCutTile(int x, int y, TileCuttingContext context)
//   {
//       if (Main.tile[x, y + 1] != null && Main.tile[x, y].wall != 350 && Main.tile[x, y + 1].type != 78
//           && Main.tile[x, y + 1].type != 380 && Main.tile[x, y + 1].type != 579)
//       {
//           if (Main.tile[x, y].type == 254)
//           {
//               return Main.tile[x, y].frameX >= 144;
//           }
//           return true;
//       }
//       return false;
//   }
//
// 拒切三族（红队 R2-F5,2026-09-03）：
//   · wall==350 —— 双地牢标记墙（skybuilder/remix 保护墙域）；
//   · 下格 type∈{78 陶盆, 380 花盆?, 579 石傀儡头} —— 种植基座/叠罐族：其上方的
//     tileCut 格（香草/藤蔓/叠罐本身）近战/弹幕/放置上下文一概不可割
//     （"陶盆上的香草挥击不割"即此支）；
//   · type==254 且 frameX<144 —— 未熟南瓜（成熟判定 frameX≥144）。
// context 形参（TileCuttingContext = Terraria.Enums/TileCuttingContext.cs:3-9
//   { Unknown, AttackMelee, AttackProjectile, TilePlacement }）原文【未消费】——
//   保留形参位照原文形态，由调用点自述上下文（Player.cs:45032 AttackMelee /
//   Projectile.cs:15395 AttackProjectile / Player.cs:41692 TilePlacement）。
//
// 仓内映射（TileStore 稠密数组 vs 原版懒分配 Tile[,]）：
//   · `Main.tile[x, y + 1] != null` = 数组元素存在性（Tile 引用型懒分配,未写格为
//     null；已分配未激活格 type 缺省 0 照样放行）——仓内唯一忠实对应 = inBounds
//     （世界内位置存在;type==0 空气 ≙ 已分配未激活,同判放行）；
//   · wall 350 直读 store.wall（原版 wall id 直存,TileStore.ts:25）；
//   · type 78/380/579/254 按 TILE_DEFS vanilla sheet 判（store.type 是仓内 tile id）；
//   · frameX 为原版 px 帧坐标直存（store.frameX）。
import { TILE_DEFS } from '../data/tiles';

/** TileCuttingContext 枚举形态（原文未消费,仅调用点自述用） */
export type TileCuttingContext = 'Unknown' | 'AttackMelee' | 'AttackProjectile' | 'TilePlacement';

/** 下格种植族豁免表：TileID.Pots=78 / 380 / 579（WorldGen.cs:88113-88115 逐项） */
const BELOW_SHEET_BLOCK = new Set([78, 380, 579]);

const vanSheet = (internalId: number): number => TILE_DEFS[internalId]?.vanilla?.sheet ?? -1;

/** WorldGen.CanCutTile（WorldGen.cs:88111-24）——CutTiles 类 Kill 面唯一门。
 *  store 形参取最小形状（TileStore 结构兼容）；context 原文未消费（保留形参位）。 */
export function canCutTile(
  st: {
    inBounds(x: number, y: number): boolean;
    idx(x: number, y: number): number;
    get(x: number, y: number): number;
    wall: Uint16Array;
    frameX: Uint16Array;
  },
  x: number,
  y: number,
  _context: TileCuttingContext,
): boolean {
  if (st.inBounds(x, y + 1) && st.wall[st.idx(x, y)] !== 350
    && vanSheet(st.get(x, y + 1)) !== 78 && vanSheet(st.get(x, y + 1)) !== 380
    && vanSheet(st.get(x, y + 1)) !== 579) {
    if (vanSheet(st.get(x, y)) === 254) {
      return st.frameX[st.idx(x, y)] >= 144;    // 未熟南瓜（:88117-88120）
    }
    return true;
  }
  return false;
}

