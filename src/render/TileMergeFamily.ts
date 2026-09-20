// 原版跨类型合并家族（WorldGen.TileFrameCosmetic 判定链的类型重写段）。
//
// 背景（用户实报"方块衔接处漏远景背景亮光"根因）：原版标准实心块分帧时并不只认
// 同类型邻居——TileFrameCosmetic 先把邻居类型按合并家族【改写成当前格类型】再
// 比对（WorldGen.cs:82129-82485）。地牢砖(41)与沙(53)同属 Main.tileBrick 家族
// → 双方互相按"已连接"取帧，衔接处用内部帧（全不透明）。我们此前只判同类型
// （ChunkCache 的 same 回调 / VanillaTiler mask8 的 at()），跨类型交界各选
// "边缘帧"——素材边缘自带圆角透明像素（实测 Tiles_53 右缘帧顶部 8×2 透明带 +
// 底部 4×2 缺角，Tiles_41 左缘帧 2×2 圆角）→ 交界处透出远景背景亮光。
//
// 本模块 = 该判定链中【纯类型对】可判定的部分（TileMergeAttempt 系列是邻居类型
// 重写，无几何递归）；dirt/mud/jungle/cloud 的 Frametest 双向同意分支不在其中
// （那部分视觉由 TEdit BlendRules 移植的 'blend' 路径承担，本模块对其返回 false
// 不扰动）。
//
// 锚点（Terarria1456 反编译）：
//   - Main.cs:1473/6892+    tileBrick[] 赋值（家族成员表）
//   - Main.cs tileStone[]   赋值（分帧归一：家族成员一律按 1=石 处理）
//   - Main.cs tilePile[]    赋值（干草垛族）
//   - TileID.cs:285-297     Sets.Dirt/Mud/Ash/Snow/IcesSnow
//   - TileID.cs:193         Sets.DontMergeWithSnow
//   - WorldGen.cs:82129-82171 tileStone 归一（中心/邻居读入时）
//   - WorldGen.cs:82250-82255 num==668→0 / num==697→51
//   - WorldGen.cs:82259     TileMergeAttempt(0, TileID.Sets.Dirt)
//   - WorldGen.cs:82260-82295 switch(num)：雪/冰/沙岩特例 + tileBrick/tilePile 家族
import { TILE_DEFS, CONV_SNOW_SHEETS, ICES_SNOW_SHEETS, SETS_DIRT_SHEETS, SETS_MUD_SHEETS, SETS_ASH_SHEETS, DONT_MERGE_WITH_SNOW_SHEETS } from '../data/tiles';

/** Main.tileStone（分帧归一族；≠ TEdit isStone 的转化族）：按 1=石参与分帧 */
const TILE_STONE = new Set([63, 64, 65, 66, 67, 68, 130, 131, 566]);

/** Main.tileBrick 家族（Main.cs:6758-6892+ 全部 `tileBrick[N] = true` 机械提取） */
const TILE_BRICK = new Set([
  1, 2, 23, 25, 30, 37, 38, 39, 41, 43, 44, 45, 46, 47, 53, 54, 57, 59, 60, 70,
  75, 76, 109, 112, 116, 117, 118, 119, 120, 121, 122, 140, 147, 148, 150, 151,
  152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 175, 176, 177,
  179, 180, 181, 182, 183, 188, 190, 191, 193, 194, 195, 198, 199, 200, 202, 203,
  206, 208, 225, 226, 229, 234, 248, 249, 250, 252, 253, 255, 256, 257, 258, 259,
  260, 261, 262, 263, 264, 265, 266, 267, 268, 273, 274, 311, 315, 321, 322, 326,
  327, 328, 329, 345, 346, 347, 348, 350, 357, 369, 370, 381, 383, 385, 408, 409,
  415, 416, 417, 418, 458, 459, 472, 473, 474, 477, 478, 479, 481, 482, 483, 492,
  495, 496, 498, 500, 501, 502, 503, 507, 508, 512, 513, 514, 515, 516, 517, 534,
  535, 536, 537, 539, 540, 562, 563, 625, 626, 627, 628, 633, 635, 641, 659, 661,
  662, 666, 667, 669, 670, 671, 672, 673, 674, 675, 676, 677, 678, 679, 680, 681,
  682, 683, 684, 685, 686, 687, 688, 689, 690, 691, 692, 708, 722, 734, 735, 736,
  737, 738, 740, 741, 742, 743, 744, 745, 746, 747, 748, 749, 750,
]);

/** Main.tilePile（干草垛族，330-333） */
const TILE_PILE = new Set([330, 331, 332, 333]);

/** TileID.Sets（TileID.cs:285-297/193）——★BJ221 收编单源 data/tiles.ts（§6k） */
const DIRT = SETS_DIRT_SHEETS;   // TileID.Sets.Dirt（:285={0,668}）
const MUD = SETS_MUD_SHEETS;     // TileID.Sets.Mud（:287={59}）
const ASH = SETS_ASH_SHEETS;     // TileID.Sets.Ash（:289={57}）
const SNOW = CONV_SNOW_SHEETS;   // ★BJ210 收编单源 data/tiles.ts:CONV_SNOW_SHEETS（TileID.cs:24,§6i）
const ICES_SNOW = ICES_SNOW_SHEETS;   // ★BJ218 收编单源 data/tiles.ts:ICES_SNOW_SHEETS（TileID.cs:297,§6j;cs:82806 TileMergeAttempt 排除表）
const DONT_MERGE_SNOW = DONT_MERGE_WITH_SNOW_SHEETS;   // ★BJ221 收编单源（TileID.cs:193,§6k）

/** 内部 tile id → 原版 tile id（vanilla.sheet；非原版类型 = -1）。
 *  TILE_DEFS 是数组（id=下标），线性缓存避免每格重复属性链 */
const vidCache: number[] = [];
// ★三域契约(2026-08-30 收口备案,防再犯):
//   ①运行时 store.type = 当前构建 TILE_DEFS 的数组下标(def 注册序;装载器按 key 换算,
//     同会话内自洽——vanillaIdOf 本函数即唯一权威换算);
//   ②磁盘存档 v3 起 = stable-id 双表(data/tiles.ts 尾部,'sheet'+私有段方案),**不是**
//     数组下标域——外部文件(marks 工具/旧脚本)给出的 typeId 可能属于此域或更老 v2 域,
//     与①比对前必须经装载链换算,禁止裸比;
//   ③vanilla sheet id = 官方 TileID.cs 域,全部分帧集合(MERGE_DIRT 等)按下标域即本表。
//   血案:2026-08-30 第三批曾把 marks 的外部 id 直接当①用引发方向性误判。
export function vanillaIdOf(t: number): number {
  const c = vidCache[t];
  if (c !== undefined) return c;
  const v = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  vidCache[t] = v;
  return v;
}

/** 分帧归一 id（= frameMergesWith 首段的 tileStone/668/697 归一；供半砖邻接门对拍） */
export function normalizedVidOf(t: number): number {
  let num = vanillaIdOf(t);
  if (num < 0) return num;
  if (TILE_STONE.has(num)) num = 1;
  if (num === 668) num = 0;
  if (num === 697) num = 51;
  return num;
}

/** 半砖邻接覆写（WorldGen.cs:82398-82426,TileFrameCosmetic 家族链【之后】执行）:
 *  U: 上邻半砖(非平台) → 强制连(:82398);中心是半砖 → 恒断(:82424 up=-1)
 *  L/R: 邻居半砖 → 中心也是半砖=连(任意型,:82405/:82416);中心整砖 → 仅邻
 *       【原始 type == 中心归一 type】才连(:82408/:82419 tile3.type != num 即断,
 *       家族链结果被覆写——地牢砖整砖|异型半砖交界是【边缘帧】)
 *  D: 下邻半砖 → 恒断(:82428 down=-1,任何中心)
 *  其余 = 家族链(同型/跨族)结果原样放行 */
export function halfNeighborConnects(
  dir: 'U' | 'L' | 'R' | 'D',
  centerHalf: boolean, centerNum: number,
  nbHalf: boolean, nbVid: number, nbPlatform: boolean,
  chainConnected: boolean,
): boolean {
  switch (dir) {
    case 'U':
      if (centerHalf) return false;
      if (nbHalf && !nbPlatform) return true;
      return chainConnected;
    case 'L':
    case 'R':
      if (nbHalf) {
        if (centerHalf) return true;
        return nbVid === centerNum;
      }
      return chainConnected;
    case 'D':
      if (nbHalf) return false;
      return chainConnected;
  }
}

/** 原版 TileFrameCosmetic 的类型对合并判定：当前格 myType 分帧时是否把
 *  otherType 邻居按"同类型"（已连接）处理。逐分支 1:1（如冰族不并雪、雪
 *  不并冰族——两侧判定互为镜像；合并方向不对称处按原版逐行照抄） */
export function frameMergesWith(myType: number, otherType: number): boolean {
  // :82129-82171 中心/邻居 tileStone 归一（63-68/130/131/566 → 1=石）
  let num = vanillaIdOf(myType);
  let other = vanillaIdOf(otherType);
  if (num < 0 || other < 0) return false;
  if (TILE_STONE.has(num)) num = 1;
  if (TILE_STONE.has(other)) other = 1;
  // :82250-82255
  if (num === 668) num = 0;
  if (num === 697) num = 51;
  // :82259 泥土族邻居先改写为 0（泥土 0 不在 tileBrick → 家族块不并土）
  if (DIRT.has(other)) other = 0;
  // :82260-82295 switch(num)。注意三 bool 参重载 (int,bool[],bool[]) 在 :81882:
  // 条件 = lookfor[other] && !exclude[other] —— 第二张表是【排除表】不是包含表!
  if (num === 147) {
    // 雪：并全家族，排除冰族等 DontMergeWithSnow
    return TILE_BRICK.has(other) && !DONT_MERGE_SNOW.has(other);
  }
  if (num === 161 || num === 163 || num === 164 || num === 200 || num === 738) {
    // 冰族：并全家族【除雪 147】(TileMergeAttempt(num, tileBrick, Snow) 排除语义)
    return TILE_BRICK.has(other) && !SNOW.has(other);
  }
  if (num === 162) {
    // 162：并全家族除冰族+雪(IcesSnow 排除表)
    return TILE_BRICK.has(other) && !ICES_SNOW.has(other);
  }
  if (num === 747) {
    // 747：并全家族除沙 53((int,bool[],int) 重载 :81846 排除语义)
    return TILE_BRICK.has(other) && other !== 53;
  }
  if (TILE_BRICK.has(num)) {
    // 泥草地不并泥、灰烬地不并灰（:82279-82290 例外表）
    if (num === 60 || num === 70 || num === 661 || num === 662) {
      return TILE_BRICK.has(other) && !MUD.has(other);
    }
    if (num === 633) return TILE_BRICK.has(other) && !ASH.has(other);
    return TILE_BRICK.has(other);
  }
  if (TILE_PILE.has(num)) return TILE_PILE.has(other);
  return false;
}
