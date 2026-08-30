// 原版 "Living Trees"(WorldGen.cs:15551-15791)+ "Living Tree Walls"(:15792-15824)
// 1:1 移植。核心树形 = GrowLivingTree(:28123-28759)：
//   主干锥形收窄循环(:28271-28345,左右交替向内吃 1 格) → 侧枝斜上(:28350-28420,
//   步进 ±1、10% 纵向抖动、间隔 2-4 格长枝) → 顶部收尖+枝头(:28421-28509) →
//   根系下扎+横向根走(:28510-28600,横向根步进带惯性) → 叶簇(:28601-28720,
//   曼哈顿椭圆 / 圆形两种、LargePiles2 187+SmallPiles 185 地被) →
//   树干贯通竖井 GrowLivingTree_MakePassage(:29019-29290)（宽干 flag 才走）。
// 通道房 GrowLivingTreePassageRoom(:29306-29510)：活木腔+生命木门 2 扇+椅子/
// 生命木织机 304+活木宝箱(style12,主件 832 生命木魔棒/1:3 4281 雀杖)。
// 横向迷宫隧道 GrowLivingTree_HorizontalTunnel(:28783-29017)。
// 排除区(:15621-15651)：50×50 内地牢砖 41/43/44/481-483 一票否决、云族
// 189/196/460/717-719 一票否决、与 mCaveX ±50 拒绝（cs:15653-15663）。
// 秘密种子分支（extraLivingTrees/skyblock/errorWorld/dualDungeons/shimmer 等）
// 不在常规生成路径,按约定不移植,行号保留在注释中。
//
// ★2026-08-18 s111/s777 对真服务器（x86 /tmp/vserver86）审计结论（438 残差清剿会话）：
//   ①本 pass JS≡oracle（LT_TRACE 流哈希逐段全等+链检查点绿）,但两者都偏离真服：
//     圆冠最外沿多放 ~87(s111)/38(s777) 格 192（纯超集方向 192>-1）——同锚点同 d²
//     的格"一半有一半无"（如 (1068,219) 缺 /(1072,215) 在,d²=170 同）,排除流漂移/
//     n44±1/0.9 精度(float/double)/墙门(全 0)/菱圆分派/FP 求值序——只能由**进入本
//     pass 时的输入态差**触发 canPlaceLeaves 门差。已实证输入态差：树1区域 x1066-
//     1078,y288-290 原版 grass 链 stone/air（早期 pass 地表差）。
//   ②s111 整棵 patch 树缺失（x1348-1406 ~1830 格,sky 192>-1 主力）：patch 锚
//     (1348,293) 的 r1 solid-foot 落在 185 小石堆上（链）,原版主树冠沿多 1 格使
//     num10 下扫落在叶上（pass 期 tileSolid[192]=true,cs:15789 才翻 false）→原版
//     长成。属①的连锁,非本文件可修。
//   ③下游症状：Vines(#89) 638 灰烬藤 ~6.6k 双向纯漂移（锚 633 全同位,总量
//     5735v/5729j）、Trees(#82) 5 树干 ~1.9k 位移、Pots 28、苔/石笋 51/165/62 等
//     全部是 42 号 pass 起流移位的级联——修各自 pass 无效。
//   ④前沿已推进到 ≤FloatingIslands(#23)：islands 检查点云族(189/196)已差 31 格
//     （x2480-2521 雨云帽 ±1 行等）。下一个收敛里程碑=逐早检查点对真服定位首分歧
//     pass（现链检查点仅证 JS≡oracle,均未对真服验证）。探针：tools/_p638*.test.ts。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { furnitureStyleBase } from '../../FurnitureStyle';
import { placeBuriedChest, type ChestSink } from './BuriedChestsPass';
import { flipGenSolid, genSolidType, vanGenSolidType } from './GenSolid';
import { genSquareTileFrame } from './FinalCleanupPass';
// ★YYYYYY（2026-08-23）：Check3x2 清除环 KillTile 头门（cs:63579）——HalfBrickPass 1:1 实现
import { checkTileBreakability } from './HalfBrickPass';

/** 世界树对拍探针开关（种子等价期临时；默认关闭零开销） */
const LT_TRACE = typeof process !== 'undefined' && !!process.env.LT_TRACE;
function ltStream(): string {
  if (!LT_TRACE) return '';
  const ur = (ltRngCache as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
  let h = 0x811c9dc5;
  const step = (b: number) => { h = Math.imul(h ^ (b & 0xff), 16777619) >>> 0; };
  for (let i = 0; i < ur.seedArray.length; i++) {
    const v = ur.seedArray[i] | 0;
    for (let b = 0; b < 4; b++) step(v >>> (8 * b));
  }
  const ix = ur.inext >>> 0;
  for (let b = 0; b < 4; b++) step(ix >>> (8 * b));
  return h.toString(16).padStart(8, '0');
}
let ltRngCache: unknown = null;

/** LT_TRACE 用：全网 active-typ(vanilla 映射)+act+wal 的 FNV-1a——与 oracle 侧
 *  GLTp 打印同算法，逐相位网格指纹（流一致≠写入一致，见 roots/leaves 免掷骰写） */
function ltGridHash(st: TileStore): string {
  let h = 0x811c9dc5;
  const step = (b: number) => { h = Math.imul(h ^ (b & 0xff), 16777619) >>> 0; };
  for (let i = 0; i < st.type.length; i++) {
    const v = st.flags[i] ? V_LT[st.type[i]] : 0;
    const t = v < 0 ? 0x7fff : v;
    step(t & 0xff); step(t >>> 8); step(st.flags[i] ? 1 : 0);
    step(st.wall[i] & 0xff); step(st.wall[i] >>> 8);
  }
  return h.toString(16).padStart(8, '0');
}
const V_LT = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') V_LT[i] = s;
}

const LIVING_WOOD = TILE_BY_KEY['v_191_living_wood_block']!;
const LEAF = TILE_BY_KEY['v_192_living_leaf_block']!;
const PLATFORM = TILE_BY_KEY['platform']!;
const CHAIR = TILE_BY_KEY['chair']!;
const LOOM = TILE_BY_KEY['v_304_living_loom']!;
const PILE2 = TILE_BY_KEY['v_187_decos_3x2_group_2']!;
const SMALL_PILE = TILE_BY_KEY['v_185_small_decos']!;

/** 活木墙（w244_livingwoodunsafe；原版墙 id 直存） */
const WALL_LIVING_WOOD = 244;
/** Main.wallDungeon（cs:10777 起）= 地牢墙族 */
const DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
/** TileID.Sets.Ore（TileID.cs:399）——GrowLivingTree 地面类型门禁用 */
const ORE_SHEETS = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);
/** TileID.Sets.Clouds（TileID.cs:197）——canPlaceLeaves 排除 */
const CLOUD_SHEETS = new Set([189, 196, 460, 717, 718, 719]);
/** LivingTrees 选址一票否决：地牢砖（cs:15627-15631） */
const EXCLUDE_BRICK = new Set([41, 43, 44, 481, 482, 483]);

// ---------- 读取辅助（生成期 wire 全 0，active = flags bit0） ----------
function sheetAt(st: TileStore, x: number, y: number): number {
  if (!st.inBounds(x, y)) return -1;
  return TILE_DEFS[st.type[st.idx(x, y)]]?.vanilla?.sheet ?? -1;
}
function typeAt(st: TileStore, x: number, y: number): number {
  return st.inBounds(x, y) ? st.type[st.idx(x, y)] : 0;
}
function activeAt(st: TileStore, x: number, y: number): boolean {
  return st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
}
function wallAt(st: TileStore, x: number, y: number): number {
  return st.inBounds(x, y) ? st.wall[st.idx(x, y)] : 0;
}
function solidAt(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  // 生成期实心查询（GenSolid）：GrowLivingTree 体内 48 尖刺已翻非实心（cs:28257），
  // 裸 TILE_DEFS.solid 会把尖刺当实心挡树（见 growLivingTree 内翻转注释）
  return st.flags[i] !== 0 && genSolidType(st.type[i]);
}

// ★IIIII73：Main.tileSolidTop 全表（Main.cs:6764-7841，78 项 sheet 集）。与
// DungeonPass.ts 的 DG_SOLID_TOP 同表拷贝（含桌14/工作台18/箱87/书架101/旗339 等
// solidTop 族）——SolidTile 判定的第二道门；两处定义勿各自漂移。
const LT_SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);

/** WorldGen.SolidTile(i,j)（Terarria1458 WorldGen.cs:70650-70666 **全项版**）：
 *  active ∧ tileSolid(genSolidType 生成期语义) ∧ !tileSolidTop ∧ !halfBrick() ∧
 *  slope()==0 ∧ !inActive()。GrowLivingTree 家族内全部 SolidTile 字面调用取此语义：
 *  cs:28287 足基门 / cs:28709 根系下探计数 / cs:28875 竖井预检 flag4 /
 *  cs:29362 终止扫描 flag5 / cs:29384 终止扫描 flag6 —— 坡帽/半砖/致动格一律【非实心】。
 *  ★IIIII73 定罪：DRUNK #42 树@(1784,310) 竖井终止扫描在洞缘 SL4 帽石带
 *  （(1787,402)/(1789,405) 等 396 洞缘坡帽，dump41 基座实证）——旧谓词 solidAt 缺
 *  half/slope/inActive 三判项把它们判成实心 ⇒ JS 比原版多下挖 2 行才退出
 *  （exit rc 43870↔x86 43868），patch/候选后续全序漂移 ⇒ A=15141 族。
 *  共享 solidAt 不动：家具支撑等其余读面是 s111/s777 oracle 认证域，翻转面不可证。 */
function ltSolid(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!(st.flags[i] & 1)) return false;                        // active()
  if ((st.wire[i] >>> 5) & 1) return false;                    // !inActive()
  const sheet = V_LT[st.type[i]] ?? -1;
  if (LT_SOLID_TOP.has(sheet)) return false;                   // !tileSolidTop
  if (!vanGenSolidType(st.type[i])) return false;              // tileSolid（平台双态族经 VAN_TILE_SOLID_EXTRA）
  if (st.half[i] !== 0 || st.slope[i] !== 0) return false;     // !halfBrick() && slope()==0
  return true;
}

/** WorldGen.SolidTile2(Tile)（Terarria1458 WorldGen.cs:70673）：active ∧ tileSolid ∧
 *  slope==0 ∧ !halfBrick ∧ !inActive——**不含** !tileSolidTop 判项（平台/桌箱等
 *  solidTop 族算实心支承；平台双态族 Main.tileSolid=true 经 vanGenSolidType 兑现）。
 *  本 pass 家具族支承门的原版语义：Place1x2 cs:47086（椅）、PlaceSmallPile
 *  cs:47266/47288、Place3x2 type186/187 支柱行 cs:52580。
 *  ★IIIII73 余案：树干腔内叶枝地被石堆落在生命木平台上——vanilla 以 SolidTile2
 *  放行平台支承，SW 数据 platform solid=false 且旧 solidAt 无 solidTop 豁免 ⇒ JS
 *  拒置 ⇒ 六格 A1>0 残差 (2660..2662)×(235..236)。 */
function ltSolid2(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!(st.flags[i] & 1)) return false;                        // active()
  if ((st.wire[i] >>> 5) & 1) return false;                    // !inActive()
  if (!vanGenSolidType(st.type[i])) return false;              // tileSolid
  if (st.half[i] !== 0 || st.slope[i] !== 0) return false;     // slope==0 && !halfBrick
  return true;
}

/** WorldGen.SolidTileAllowBottomSlope（cs:70706）：active ∧ (tileSolid ∨ tileSolidTop)
 *  ∧ [!topSlope() ∨ (平台 ∧ PlatformProperTopFrame)] ∧ !halfBrick ∧ !inActive——
 *  名为 AllowBottomSlope 实不查坡位 3/4（底坡）；顶坡(1/2)仅平台合法帧放行。
 *  ★IIIII73 第三案：Check3x2 type187 支撑行校验（cs:49708）用它读支柱——树干腔内
 *  石堆的支柱是生命木平台：SW platform 数据 solid=false 且旧 solidAt 平台=假实心
 *  缺失 ⇒ 置堆后自校验失败 → 自 KillTile 六格（watch 实证）⇒ 六格 A1>0。 */
function ltPlatformProperTopFrame(sheet: number, frameX: number): boolean {
  if (sheet !== 19) return false;
  const num = Math.trunc(frameX / 18);
  if ((num < 0 || num > 7) && (num < 12 || num > 16)) {
    if (num >= 25) return num <= 26;
    return false;
  }
  return true;
}
function ltSolidAllowBottomSlope(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!(st.flags[i] & 1)) return false;                                  // active()
  if ((st.wire[i] >>> 5) & 1) return false;                              // !inActive()
  const d = TILE_DEFS[st.type[i]];
  const sheet = d?.vanilla?.sheet ?? -1;
  if (!vanGenSolidType(st.type[i]) && !LT_SOLID_TOP.has(sheet)) return false; // tileSolid ∨ tileSolidTop
  const sl = st.slope[i];
  const topSlope = sl === 1 || sl === 2;
  if (topSlope && !(sheet === 19 && ltPlatformProperTopFrame(sheet, st.frameX[i]))) return false;
  if (st.half[i] !== 0) return false;                                    // !halfBrick
  return true;
}
function isDungeonWall(w: number): boolean { return DUNGEON_WALLS.has(w); }
function inWorld(st: TileStore, x: number, y: number, slack: number): boolean {
  return x >= slack && y >= slack && x < st.w - slack && y < st.h - slack;
}

/** WorldGen.IsTileNearby（cs:8828）:distance 方框内是否存在该 type */
function isTileNearby(st: TileStore, x: number, y: number, type: number, distance: number): boolean {
  for (let i = x - distance; i <= x + distance; i++) {
    for (let j = y - distance; j <= y + distance; j++) {
      if (st.inBounds(i, j) && st.flags[st.idx(i, j)] !== 0 && st.type[st.idx(i, j)] === type) return true;
    }
  }
  return false;
}
/** 同上，但入参是【原版 sheet id】（调用点传 vanilla 常量时用本仓内部 id 不换算）
 *  ——remix PassageRoom 随机箱的邻域门用原版常量 53 沙/147 雪/59 泥（cs:29613）。 */
function isTileNearbySheet(st: TileStore, x: number, y: number, sheet: number, distance: number): boolean {
  for (let i = x - distance; i <= x + distance; i++) {
    for (let j = y - distance; j <= y + distance; j++) {
      if (st.inBounds(i, j) && st.flags[st.idx(i, j)] !== 0 && sheetAt(st, i, j) === sheet) return true;
    }
  }
  return false;
}

/** 活木写入（cs 中 `type=191; active(true); halfBrick(false)` 三连） */
function setLivingWood(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.type[i] = LIVING_WOOD;
  st.flags[i] = 1;
  st.half[i] = 0;
}
function setLeaf(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.type[i] = LEAF;
  st.flags[i] = 1;
  st.half[i] = 0;
  st.frameX[i] = 0; st.frameY[i] = 0; // 清帧：防旧 framed tile（187 地被等）帧残留
}
function deactivate(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  // ★WWWWW 勘误：原版竖井/树屋腔掏空 = `Main.tile[...].active(false)`（cs:29096/29361/
  //  29393 等）——只清活性位，type/帧/half/slope 幽灵全保留。曾连 type/half/slope 一并
  //  清零 → 竖井+房间腔幽灵态与原版分叉 → 房间陈设 PlaceTile 读幽灵态的成败搜索循环
  //  掷数漂移（CONST 链 #42 patch 树相位整段位移的根因：主树逐字节同、patch 树
  //  JS=左 1217/vanilla=右 ~1307）。改 flags=0（与 JungleShrinePass 清腔同款幽灵语义）。
  st.flags[st.idx(x, y)] = 0;
}

/** WorldGen.PlaceTile(x, y, 19, …, style)（cs:28312/28741/29063/29103）：平台 1×1，
 *  变体竖排 Y 步 18（与 DungeonPass/HellFortPass 的平台帧一致——此前误写 X 轴）。
 *  ★AAAAAA：PlaceTile 成功尾 SquareTileFrame（cs:60281）——平台连接码写 frameX
 *  （引擎 framePlatformSweep；曾缺 = s19 帧债活木树支）。 */
function placePlatform(st: TileStore, rng: RNG, x: number, y: number, style: number): void {
  if (!st.inBounds(x, y)) return;
  st.setTileSilent(x, y, PLATFORM, 0, style * 18);
  genSquareTileFrame(st, rng, x, y);
}
/** TileID.Sets.Boulders（TileID.cs:195）——InvalidTileForPilesOrSpeleothems 用 */
const PILE_BOULDERS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
/** WorldGen.InvalidTileForPilesOrSpeleothems（cs:39005）：InWorld(2) 内 active 且 Boulders 族 */
function invalidForPiles(st: TileStore, x: number, y: number): boolean {
  if (!inWorld(st, x, y, 2)) return false;
  return activeAt(st, x, y) && PILE_BOULDERS.has(sheetAt(st, x, y));
}

/** WorldGen.Place3x2（cs:52097,经 PlaceTile case 187 cs:60016 派发）：3×2
 *  **底中锚** (x-1..x+1)×(y-1..y)——此前误按底左锚整体右移 1 列；足印全空 +
 *  下列实心 + 186/187 底禁滚石（InvalidTileForPilesOrSpeleothems）。 */
function place3x2(st: TileStore, x: number, y: number, style: number): boolean {
  if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return false;   // cs:52099
  let ok = true;
  for (let c = x - 1; c <= x + 1; c++) {
    for (let d = y - 1; d <= y; d++) if (activeAt(st, c, d)) ok = false;
    if (invalidForPiles(st, c, y + 1)) ok = false;                    // cs:52143
    if (!ltSolid2(st, c, y + 1)) ok = false;                          // ★IIIII73:cs:52580 SolidTile2 支柱行（原误 solidAt）
  }
  if (LT_TRACE && x >= 405 && x <= 430 && y >= 140 && y <= 175) {
    console.log(`P3x2? x=${x} y=${y} style=${style} ok=${ok} st=${ltStream()}`);
  }
  if (!ok) return false;
  const d0 = TILE_DEFS[PILE2];
  const [bx, by] = furnitureStyleBase(d0.vanilla?.sheet ?? -1, style, 3);
  for (let c = x - 1; c <= x + 1; c++) {
    for (let d = y - 1; d <= y; d++) {
      st.setTileSilent(c, d, PILE2, bx + (c - (x - 1)) * 18, by + (d - (y - 1)) * 18);
    }
  }
  return true;
}

// ---------- PlaceTile(187) 全链（cs:59366 头 + cs:60026 case + SquareTileFrame） ----------
// 2026-08-16 原版服务器探针裁决（/tmp/sw-num4 growtree 链 + 041 原版输入重放）：JS 此前
// 只移植了 Place3x2 本体,缺 PlaceTile 头的锚格 Clear 与 case 尾 SquareTileFrame(i,j)→
// TileFrame→Check3x2 一致性清除链。后果：叶簇逐簇推进时后写叶/邻簇石堆会部分覆写已放
// 石堆(187),原版下一次该区域的 SquareTileFrame 触发 Check3x2 校验失败 → KillTile 清除
// 残件；JS 残件永生 → 树冠多出 187 残格（对拍实锤 (414,154)/(511-513,140) 等）。

/** WorldGen.KillTile 生成期语义（cs:63559,cs:63955-63960 收尾）：active(false)+
 *  halfBrick(false)+frameX/frameY=-1+清漆；**type/slope 保留**（幽灵 187）；
 *  无掉落掷骰（isGeneratingOrLoadingWorld → noItem=true；type51/wall62 掷骰分支不触及）。
 *  ★YYYYYY（2026-08-23）：补 CheckTileBreakability 头门（cs:63579 num==2 拒毁,尘段
 *  之前零掷零写）——vanilla Check3x2 清除环（cs:49428-49432）走的就是带门 KillTile；
 *  本副本与 FCP 引擎同款只拒杀不加 fail 支。 */
function killTileGen(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (!st.flags[i]) return;
  if (checkTileBreakability(st, x, y) === 2) return;
  st.flags[i] = 0;

  st.half[i] = 0;
  st.frameX[i] = -1;
  st.frameY[i] = -1;
  st.paint[i] = 0;
}

/** WorldGen.Check3x2 type=187 分支（cs:49190-49438）：由 (i,j) 格帧重建 3×2 原点,
 *  校验六格 type+帧一致（frameX!=(k-num5)*18+num7 / frameY!=(l-num)*18+num3*36）与
 *  支撑行（default 档 !SolidTileAllowBottomSlope→flag;本阶段无 slope/half 等价
 *  solidAt）。失败 → KillTile 六格中仍为 187 的 active 格。帧重建算法与 place3x2
 *  的样式布局解耦（vanilla 54*style 平铺与本仓 35-wrap 帧均自洽重建）。
 *  187→186 草变体转化（cs:49382,frameX∈[756,900]）不移植：vanilla 帧平铺下仅
 *  style 14-16 可达,活树石堆 style 47-51 帧为 2538+ 恒出界。 */
function check3x2Pile(st: TileStore, i: number, j: number): void {
  if (!st.inBounds(i, j)) return;
  const ii = st.idx(i, j);
  if (!st.flags[ii] || st.type[ii] !== PILE2) return;
  const frameX = st.frameX[ii] | 0;
  const frameY = st.frameY[ii] | 0;
  const num3 = Math.trunc(frameY / 36);              // cs:49206
  const num4 = frameY % 36;
  let num = j - Math.trunc(num4 / 18);               // cs:49208
  let n5 = Math.trunc(frameX / 18);
  let n6 = 0;
  while (n5 > 2) { n5 -= 3; n6++; }                  // cs:49212-49216
  n5 = i - n5;
  const num7 = n6 * 54;
  const num8 = num + 2;
  let flag = false;
  for (let k = n5; k < n5 + 3; k++) {
    for (let l = num; l < num8; l++) {
      if (!st.inBounds(k, l)) { flag = true; continue; }
      const idx = st.idx(k, l);
      if (!st.flags[idx] || st.type[idx] !== PILE2
        || st.frameX[idx] !== (k - n5) * 18 + num7
        || st.frameY[idx] !== (l - num) * 18 + num3 * 36) {
        flag = true;                                 // cs:49235-49241 六格一致
      }
    }
    // ★IIIII73：cs:49708 SolidTileAllowBottomSlope 支撑行（原 solidAt——平台支承缺失案）
    if (!ltSolidAllowBottomSlope(st, k, num8)) flag = true;
  }
  if (!flag) return;                                 // cs:49416
  for (let k = n5; k < n5 + 3; k++) {
    for (let l = num; l < num8; l++) {
      if (!st.inBounds(k, l)) continue;
      const idx = st.idx(k, l);
      if (st.flags[idx] && st.type[idx] === PILE2) killTileGen(st, k, l);  // cs:49428-49432
    }
  }
}

/** WorldGen.SquareTileFrame（cs:80924）3×3 逐格 TileFrame 的活树语境子集：
 *  仅 187 → Check3x2（本 pass 区域内其余类型 TileFrame 分支无清除语义——185 的
 *  CheckPile 支撑为恒实心叶不触发；10/15/19/304 无后续破坏写;备案见审计文档）。 */
function squareTileFrameGen(st: TileStore, x: number, y: number): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      check3x2Pile(st, x + dx, y + dy);
    }
  }
}

/** PlaceTile(187) 全链等价：头部门槛（187 非实心 → !tileSolid[187] 恒过）+
 *  锚格 inactive 时 Clear(Tile|Paint|Slope)（cs:59497-59499,幽灵归零——对拍实证
 *  (415,153)g1→0g）+ Place3x2 + case 尾 SquareTileFrame(i,j)（成败都跑）。 */
function placeTilePile(st: TileStore, x: number, y: number, style: number): boolean {
  if (st.inBounds(x, y)) {
    const i = st.idx(x, y);
    if (!st.flags[i]) {
      // Tile.Clear(Tile|TilePaint|Slope)（Tile.cs:774-782/803-807）
      st.type[i] = 0;
      st.frameX[i] = 0;
      st.frameY[i] = 0;
      st.paint[i] = 0;
      st.slope[i] = 0;
      st.half[i] = 0;
    }
  }
  const ok = place3x2(st, x, y, style);
  squareTileFrameGen(st, x, y);
  return ok;
}

/** WorldGen.Place3x3 num=-2 分支（cs:53549,type 300-308 含织机 304）：3×3 底中锚
 *  (x-1..x+1)×(y-2..y) 足印全空 + 下列实心（经 PlaceTile case 304 派发）。 */
function place3x3(st: TileStore, x: number, y: number): boolean {
  let ok = true;
  for (let c = x - 1; c <= x + 1; c++) {
    for (let d = y - 2; d <= y; d++) {
      if (!st.inBounds(c, d) || activeAt(st, c, d)) ok = false;
    }
    if (!solidAt(st, c, y + 1)) ok = false;
  }
  if (!ok) return false;
  const d0 = TILE_DEFS[LOOM];
  const [bx, by] = furnitureStyleBase(d0.vanilla?.sheet ?? -1, 0, 3);
  for (let c = x - 1; c <= x + 1; c++) {
    for (let d = y - 2; d <= y; d++) {
      st.setTileSilent(c, d, LOOM, bx + (c - (x - 1)) * 18, by + (d - (y - 2)) * 18);
    }
  }
  return true;
}

/** WorldGen.Place1x2（cs:46665,经 PlaceTile case 15 派发）：占 (x,y-1)..(x,y)，
 *  仅要求下方 SolidTile2 + (x,y-1) 空（不查 (x,y) 本身——原版如此）。 */
function place1x2(st: TileStore, x: number, y: number, style: number): boolean {
  if (!st.inBounds(x, y - 1) || !st.inBounds(x, y + 1)) return false;
  // ★IIIII73:cs:47086 SolidTile2（原 solidAt——平台族支承语义修正）
  if (!ltSolid2(st, x, y + 1) || activeAt(st, x, y - 1)) return false;
  const d0 = TILE_DEFS[CHAIR];
  const [bx, by] = furnitureStyleBase(d0.vanilla?.sheet ?? -1, style, 1);
  st.setTileSilent(x, y - 1, CHAIR, bx, by);
  st.setTileSilent(x, y, CHAIR, bx, by + 18);
  return true;
}

/** WorldGen.PlaceTile case 10（cs:59870）→ PlaceDoor（cs:31938）：上行三格门框
 *  （j-1/j-2 空、j-3 实心）→ PlaceDoor(i,j-1)；否则下行（j+1/j+2 空、j+3 实心）
 *  → PlaceDoor(i,j+1)；否则失败。★PlaceDoor 成功放门 3 格各掷 Next(3) 帧变体
 *  （cs:31952/31959/31966——流相关，此前 JS 无条件直写 0 掷=流错位根源之一）。 */
function placeDoorTile(st: TileStore, rng: RNG, x: number, y: number, style: number): boolean {
  if (!st.inBounds(x, y - 3) || !st.inBounds(x, y + 3)) return false;
  if (!activeAt(st, x, y - 1) && !activeAt(st, x, y - 2)
    && activeAt(st, x, y - 3) && genSolidType(typeAt(st, x, y - 3))) {
    const ok = placeDoorCore(st, rng, x, y - 1, style);
    squareTileFrameGen(st, x, y);                     // cs:59889 上行支尾
    return ok;
  }
  if (activeAt(st, x, y + 1) || activeAt(st, x, y + 2)
    || !activeAt(st, x, y + 3) || !genSolidType(typeAt(st, x, y + 3))) return false;  // cs:59901-59904
  const ok = placeDoorCore(st, rng, x, y + 1, style);
  squareTileFrameGen(st, x, y);                       // cs:59907 下行支尾
  return ok;
}
/** PlaceDoor 本体：占 (x,j-1..j+1)；门框上 (x,j-2) 实心 + 下 (x,j+2) SolidTile */
function placeDoorCore(st: TileStore, rng: RNG, x: number, j: number, style: number): boolean {
  if (!st.inBounds(x, j - 2) || !st.inBounds(x, j + 2)) return false;
  if (!(activeAt(st, x, j - 2) && genSolidType(typeAt(st, x, j - 2)))) return false;
  if (!solidAt(st, x, j + 2)) return false;
  for (let dy = -1; dy <= 1; dy++) {
    const v = rng.int(0, 2);                        // 帧变体三掷（流相关）
    st.setTileSilent(x, j + dy, T.DOOR_CLOSED,
      54 * Math.floor(style / 36) + v * 18, 54 * (style % 36) + (dy + 1) * 18);
  }
  return true;
}

/** WorldGen.PlaceSmallPile（cs:46831）：size0 单格 / size1 2×1；
 *  锚 anyLava 拒绝（cs:46851）+ size1 底禁滚石（cs:46871）——2026-08-16 补齐 */
function placeSmallPile(st: TileStore, x: number, y: number, pileStyle: number, pileSize: number): boolean {
  if (!st.inBounds(x + 1, y + 1) || !st.inBounds(x, y + 1)) return false;
  const ai = st.idx(x, y);
  if (st.liquid[ai] === 255 && st.liquidType[ai] === 2) return false; // anyLava（本仓岩浆=2）
  if (pileSize === 1) {
    // cs:46853-46875:下方两格实心(SolidTile2) + 上方两格空 + 两侧底非滚石
    let ok = ltSolid2(st, x, y + 1) && ltSolid2(st, x + 1, y + 1)
      && !activeAt(st, x, y) && !activeAt(st, x + 1, y);
    if (ok && (invalidForPiles(st, x, y + 1) || invalidForPiles(st, x + 1, y + 1))) ok = false;
    if (!ok) return false;
    st.setTileSilent(x, y, SMALL_PILE, pileStyle * 36, 18);
    st.setTileSilent(x + 1, y, SMALL_PILE, pileStyle * 36 + 18, 18);
    return true;
  }
  if (ltSolid2(st, x, y + 1) && !activeAt(st, x, y)) {   // ★IIIII73:cs:47288 SolidTile2
    st.setTileSilent(x, y, SMALL_PILE, pileStyle * 18, 0);
    return true;
  }
  return false;
}

// ---------- GrowLivingTree_CanPlaceLeaves（cs:28761-28782） ----------
function canPlaceLeaves(st: TileStore, x: number, y: number): boolean {
  if (!inWorld(st, x, y, 5)) return false;
  const wl = wallAt(st, x, y);
  if (wl === WALL_LIVING_WOOD || wl === 78 || isDungeonWall(wl)) return false;
  if (!activeAt(st, x, y)) return true;
  const t = typeAt(st, x, y);
  if (t === LIVING_WOOD) return false;
  if (CLOUD_SHEETS.has(TILE_DEFS[t]?.vanilla?.sheet ?? -1)) return false;
  return true;
}

// ---------- GrowLivingTreePassageRoom（cs:29306-29510） ----------
function growLivingTreePassageRoom(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink, minl: number, minr: number, Y: number,
): void {
  const worldSurface = gs.worldSurface;
  let num = rng.int(0, 1);
  if (num === 0) num = -1;                                    // cs:29307
  let num2 = Y - 2;
  let num3 = Math.floor((minl + minr) / 2);
  if (num < 0) num3--;
  if (num > 0) num3++;
  const num4 = rng.int(15, 29);
  if (LT_TRACE) console.log(`R1 st=${ltStream()} num=${num} num3=${num3} num5num=${num4}`);
  let num5 = num3 + num4;
  if (num < 0) { num5 = num3; num3 -= num4; }
  // cs:29321-29330:候选矩形碰到露天（无墙空气+地表以上）直接放弃
  for (let i = num3; i < num5; i++) {
    for (let j = Y - 20; j < Y + 10; j++) {
      if (wallAt(st, i, j) === 0 && !activeAt(st, i, j) && j < worldSurface) return;
    }
  }
  // 第一腔（cs:29333-29360）：3×(Y+2-(Y-4)) 壳 + 内腔空心
  for (let k = num3; k <= num5; k++) {
    for (let l = num2 - 2; l <= Y + 2; l++) {
      // cs:29337-29344：四邻粘土(40)转泥土——原版只改 type=0(dirt)，保持 active
      if (sheetAt(st, k - 1, l) === 40) st.type[st.idx(k - 1, l)] = T.DIRT;
      if (sheetAt(st, k + 1, l) === 40) st.type[st.idx(k + 1, l)] = T.DIRT;
      if (sheetAt(st, k, l - 1) === 40) st.type[st.idx(k, l - 1)] = T.DIRT;
      if (sheetAt(st, k, l + 1) === 40) st.type[st.idx(k, l + 1)] = T.DIRT;
      // cs:29346：平台(19)格让位,其余实心化
      if (wallAt(st, k, l) !== WALL_LIVING_WOOD && sheetAt(st, k, l) !== 19) setLivingWood(st, k, l);
      if (l >= num2 && l <= Y) {
        const i = st.idx(k, l);
        st.liquid[i] = 0; st.liquidType[i] = 0;
        st.wall[i] = WALL_LIVING_WOOD;
        deactivate(st, k, l);
      }
    }
  }
  const door1 = placeDoorTile(st, rng, Math.floor((minl + minr) / 2) + 3 * num, Y, 7);   // cs:29363
  if (LT_TRACE) console.log(`R2door ok=${door1} st=${ltStream()}`);
  const num6 = rng.int(5, 8);
  const num7 = rng.int(4, 5);
  if (LT_TRACE) console.log(`R3 st=${ltStream()} num6=${num6} num7=${num7}`);
  if (num < 0) { num5 = num3 + num6; num3 -= num6; }
  else { num3 = num5 - num6; num5 += num6; }
  num2 = Y - num7;
  // 第二腔（cs:29369-29395）
  for (let m = num3 - 2; m <= num5 + 2; m++) {
    for (let n = num2 - 2; n <= Y + 2; n++) {
      if (wallAt(st, m, n) !== WALL_LIVING_WOOD && sheetAt(st, m, n) !== 19) setLivingWood(st, m, n);
      if (n >= num2 && n <= Y && m >= num3 && m <= num5) {
        const i = st.idx(m, n);
        st.liquid[i] = 0; st.liquidType[i] = 0;
        st.wall[i] = WALL_LIVING_WOOD;
        deactivate(st, m, n);
      }
    }
  }
  const door2 = placeDoorTile(st, rng, num < 0 ? num5 + 2 : num3 - 2, Y, 7);            // cs:29396
  if (LT_TRACE) console.log(`R4door ok=${door2} st=${ltStream()}`);
  let num8 = num < 0 ? num3 : num5;
  // 椅子（tile 15 style 5，1/2 概率）——vanilla frameX += 18 是面向翻转（num 方向）
  let num9 = 2;
  if (rng.int(0, 1) === 0) {
    num9 += 2;
    const ch1 = place1x2(st, num8, Y, 5);
    squareTileFrameGen(st, num8, Y);                 // cs:60063 case 15 尾
    if (LT_TRACE) console.log(`R5chair ok=${ch1} st=${ltStream()} num9=${num9}`);
    if (ch1 && num < 0) {
      for (let dy = -1; dy <= 0; dy++) {
        const i = st.idx(num8, Y + dy);
        st.frameX[i] += 18;                                       // cs:29404
      }
    }
  }
  num8 = num < 0 ? num3 + 2 : num5 - 2;
  const loomOk = place3x3(st, num8, Y);                           // 生命木织机 304（cs:29409）
  squareTileFrameGen(st, num8, Y);                   // cs:59964 case 106-308 组尾
  if (LT_TRACE) console.log(`R6loom ok=${loomOk} st=${ltStream()}`);
  num8 = num < 0 ? num3 + 4 : num5 - 4;
  if (rng.int(0, num9 - 1) === 0) {
    const ch2 = place1x2(st, num8, Y, 5);
    squareTileFrameGen(st, num8, Y);                 // cs:60063 case 15 尾
    if (LT_TRACE) console.log(`R7chair ok=${ch2} st=${ltStream()}`);
    if (ch2 && num > 0) {
      for (let dy = -1; dy <= 0; dy++) {
        const i = st.idx(num8, Y + dy);
        st.frameX[i] += 18;                                       // cs:29415
      }
    }
  }
  // 宝箱（cs:29418-29507）：主件 832 生命木魔棒 / 1:3 4281 雀杖；
  // AddBuriedChest(..., style 12) 在墙非 244 处降级木箱无主件（cs:36171-36186）。
  // loot 走 vi_ key：rollChestLoot 的 vid() 查 VANILLA_ITEM_KEY_BY_ID（vanilla.json
  // 全量 6059 条,与 vanilla-itemstats.json 盔甲/配饰表无关）,832/4281 裸 id 同样
  // 可入箱——key 路径只影响取用哪个注册键（见 BuriedChestsPass 尾段主件去重注释）
  num8 = num < 0 ? num3 + 8 : num5 - 7;
  const mainItemKey = rng.int(0, 2) === 0 ? 'vi_4281_finch_staff' : 'vi_832_living_wood_wand';
  // ★IIIII85（cs:29596-29632）：remix 世界箱位替换支——房内主件箱整体换形：
  //   ①Next(1,3) 只在世界随机点放 1..2 个 style12 主件箱（√避 沙53/雪147/泥59 ±20），
  //     每点位重试 ≤999 次，AddBuriedChest 失败（含 244 墙降档不成立=wooden 降级照常）
  //     不占用房间箱位；
  //   ②房内 num8 位必放一个无主件风格箱（crimson?14:7），loot 走标准埋箱池。
  //   非 remix 保持既有「墙非 244→木箱无主件」单箱路径（s111/s777 认证域,勿动）。
  if (gs.seedFlags.remix) {
    const v1 = Math.trunc(st.w / 8);
    const n10 = rng.int(1, 2);                                   // cs:29602 Next(1,3)
    for (let n11 = 0; n11 < n10; n11++) {
      let okc = false;
      let tries = 1000;                                          // cs:29604 num12=1000
      while (!okc) {
        tries--;
        if (tries <= 0) break;                                   // cs:29608
        const nx = rng.int(v1, st.w - v1 - 1);                   // cs:29611 Next(w/8, w-w/8)
        const ny = rng.int(gs.rockLevel, st.h - 351);            // cs:29612 Next((int)rockLayer, h-350)
        if (!isTileNearbySheet(st, nx, ny, 53, 20)
          && !isTileNearbySheet(st, nx, ny, 147, 20)
          && !isTileNearbySheet(st, nx, ny, 59, 20)) {
          okc = placeBuriedChest(st, rng, gs, chests, nx, ny, { style: 12, loot: mainItemKey });
        }
      }
    }
    placeBuriedChest(st, rng, gs, chests, num8, Y, { style: gs.crimson ? 14 : 7 });  // cs:29626/29630
    return;
  }
  // 落地行：房内 Y 行空心、Y+1 是活木地板。cs:36176 墙门读 (i-1, num7-1) =
  // 箱体**左列**底行（PlaceChest Origin(0,1) 语义，箱体 (i-1..i)）——曾读右列
  let gy = Y;
  while (gy < st.h - 1 && !activeAt(st, num8, gy)) gy++;
  const wallOk = wallAt(st, num8 - 1, gy - 1) === WALL_LIVING_WOOD;
  if (LT_TRACE) console.log(`R8pre st=${ltStream()} gy=${gy} wallOk=${wallOk}`);
  // ★flags 必须显式传：rollChestLoot 的 isSurface 分支看 flags.sky/wooden（原版
  //   cs:36171-36186 内部 fSky/fWood 等价物）——此前裸 style 12/0 掉进地下金箱
  //   分支=掷骰流错位（2026-08-16 对拍实锤，R8chest 分歧点）
  if (wallOk) {
    placeBuriedChest(st, rng, gs, chests, num8, Y, { style: 12, loot: mainItemKey, flags: { sky: true } });
  } else {
    placeBuriedChest(st, rng, gs, chests, num8, Y, { style: 0, flags: { wooden: true } });
  }
  if (LT_TRACE) console.log(`R8chest st=${ltStream()}`);
}

// ---------- GrowLivingTree_HorizontalTunnel（cs:28783-29017） ----------
function growLivingTreeHorizontalTunnel(st: TileStore, rng: RNG, gs: GenState, i: number, j: number): boolean {
  const worldSurface = gs.worldSurface;
  let left = i, right = i;
  const num3 = 80;                                               // cs:28786
  let num4 = 1;
  if (rng.int(0, 1) === 0) num4 *= -1;                           // cs:28793
  for (let k = 0; k < 2; k++) {
    // ---- 向右探测（cs:28796-28860） ----
    if (right === i && num4 > 0) {
      for (let l = i + 5; l < i + num3; l++) {
        if (!inWorld(st, l, j, 10)) return false;
        if (typeAt(st, l, j) === 48) break;                      // 荆棘阻挡
        if (typeAt(st, l, j) === LIVING_WOOD) {
          // cs:28827-28837：三行墙全 244（=邻树树干内腔）→ 从 l+2 接管
          let hit = true;
          for (let n = j - 2; n <= j; n++) if (wallAt(st, l + 2, n) !== WALL_LIVING_WOOD) hit = false;
          if (hit) { k = 2; right = l + 2; }
          break;
        }
        if (activeAt(st, l, j)) continue;
        let flag2 = true;
        for (let n5 = j - 2; n5 <= j; n5++) {
          if (j < worldSurface + 3
            && (wallAt(st, l + 1, n5) === 0 || wallAt(st, l + 2, n5) === 0 || wallAt(st, l + 3, n5) === 0)) {
            return false;                                        // cs:28851
          }
          if (activeAt(st, l, n5) || activeAt(st, l + 1, n5) || activeAt(st, l + 2, n5)) flag2 = false;
        }
        if (flag2) { k = 2; right = l; break; }
      }
    }
    // ---- 向左探测（cs:28861-28916） ----
    if (left === i && num4 < 0) {
      for (let l = i - 5; l > i - num3; l--) {
        if (!inWorld(st, l, j, 10)) return false;
        if (typeAt(st, l, j) === 48) break;
        if (typeAt(st, l, j) === LIVING_WOOD) {
          let hit = true;
          for (let n8 = j - 2; n8 <= j; n8++) if (wallAt(st, l - 3, n8) !== WALL_LIVING_WOOD) hit = false;
          if (hit) { k = 2; left = l - 2; }
          break;
        }
        if (!activeAt(st, l, j)) {
          let flag3 = true;
          for (let n9 = j - 2; n9 <= j; n9++) {
            if (j < worldSurface + 3
              && (wallAt(st, l - 1, n9) === 0 || wallAt(st, l - 2, n9) === 0 || wallAt(st, l - 3, n9) === 0)) {
              return false;
            }
            if (activeAt(st, l, n9) || activeAt(st, l - 1, n9) || activeAt(st, l - 2, n9)) flag3 = false;
          }
          if (flag3) { k = 2; left = l; break; }
        }
      }
    }
    num4 *= -1;
    if (k >= 2) break;
  }
  if (left === right) return false;                              // cs:28919
  // ---- 挖通（cs:28921-29015） ----
  let flag4 = false, flag5 = false;
  for (let n10 = j - 5; n10 <= j + 1; n10++) {
    for (let n11 = left; n11 <= right; n11++) {
      let n12 = 2;
      if (Math.abs(n11 - right) > 3 && Math.abs(n11 - left) > 3) n12 = 4;
      const topSheet = TILE_DEFS[typeAt(st, n11, n10)]?.vanilla?.sheet ?? -1;
      const is19 = topSheet === 19;
      if (wallAt(st, n11, n10) !== WALL_LIVING_WOOD && !is19 && topSheet !== 15 && topSheet !== 304 && topSheet !== 21 && topSheet !== 10) {
        const wl = wallAt(st, n11, n10);
        if (!isDungeonWall(wl)
          && (!activeAt(st, n11, n10)
            || (!isDungeonWall(wallAt(st, n11, n10 - 1)) && !isDungeonWall(wallAt(st, n11, n10 + 1))))
          && (activeAt(st, n11, n10) || wl !== 34)) {
          setLivingWood(st, n11, n10);
        }
        if (sheetAt(st, n11, n10 - 1) === 40) st.type[st.idx(n11, n10 - 1)] = T.DIRT;  // cs:28946 粘土→泥土
        if (sheetAt(st, n11, n10 + 1) === 40) st.type[st.idx(n11, n10 + 1)] = T.DIRT;
      }
      const tHere = sheetAt(st, n11, n10);
      const tAbove = sheetAt(st, n11, n10 - 1);
      const tBelow = sheetAt(st, n11, n10 + 1);
      const passable = tHere !== 19 && tHere !== 15 && tHere !== 304 && tHere !== 21 && tHere !== 10
        && tAbove !== 15 && tAbove !== 304 && tAbove !== 21 && tAbove !== 10 && tBelow !== 10;
      if (n10 >= j - n12 && n10 <= j && passable) {
        if (!isDungeonWall(wallAt(st, n11, n10))) st.wall[st.idx(n11, n10)] = WALL_LIVING_WOOD;
        const idx = st.idx(n11, n10);
        st.liquid[idx] = 0; st.liquidType[idx] = 0;
        deactivate(st, n11, n10);
      }
      if (n10 !== j) continue;
      let style = 7;
      if (isDungeonWall(wallAt(st, n11, n10)) || isDungeonWall(wallAt(st, n11, n10 - 1)) || isDungeonWall(wallAt(st, n11, n10 - 2))) {
        style = 13;
      }
      if (n11 <= left + 4 && !flag4) {
        if (typeAt(st, n11 - 1, n10) === T.DOOR_CLOSED || typeAt(st, n11 + 1, n10) === T.DOOR_CLOSED) flag4 = true;
        else if (rng.int(0, 2) === 0) {
          placeDoorTile(st, rng, n11, n10, style);
          if (typeAt(st, n11, n10) === T.DOOR_CLOSED) flag4 = true;
        }
      }
      if (n11 < right - 4 || flag5) continue;
      if (typeAt(st, n11 - 1, n10) === T.DOOR_CLOSED || typeAt(st, n11 + 1, n10) === T.DOOR_CLOSED) flag5 = true;
      else if (rng.int(0, 2) === 0) {
        placeDoorTile(st, rng, n11, n10, style);
        if (typeAt(st, n11, n10) === T.DOOR_CLOSED) flag5 = true;
      }
    }
  }
  return true;
}

// ---------- GrowLivingTree_MakePassage（cs:29019-29290） ----------
interface PassageRefs { minl: number; minr: number }
function growLivingTreeMakePassage(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink,
  j: number, W: number, refs: PassageRefs, noSecretRoom: boolean,
): void {
  const worldSurface = gs.worldSurface;
  // ★Main.UnderworldLayer = maxTilesY-200（Main.cs:2863）——曾误用 gs.lavaLine
  //   (=GenVars.lavaLine≈waterLine+50..79≈h-340±):竖井地狱截断门提前 ~60-140 行。
  //   9293480/SandboxWorld 两链种子树井均止于 y<400 未触及界,链对账绿掩盖了该错;
  //   caves-oracle.cs:8378 一直用 H-200（oracle 无需同步）。
  const underworldLayer = st.h - 200;
  let flag = noSecretRoom;
  const startL = refs.minl, startR = refs.minr;  // cs:29023-29024 存档,函数末恢复
  let flag2 = false;
  const num3 = 5;
  let num4 = j - 6;
  let num5 = 50;
  let num6 = rng.int(400, 699);                  // cs:29033 Next(400,700)
  let num8 = 0;
  let flag3 = true;
  let num9 = rng.int(5, 15);
  if (typeof process !== 'undefined' && process.env.SW_DG_LTMARK) console.log(`MARK|gpA|rc=${(globalThis as unknown as { __ltRc?: { n: number } }).__ltRc?.n ?? -1}`);
  let minl = refs.minl, minr = refs.minr;
  if (LT_TRACE) console.log(`MP enter st=${ltStream()} num6=${num6} num9=${num9}`);
  while (num6 > 0) {
    if (num4 > underworldLayer + rng.int(15, 30)) num6 = 0;   // cs:29053
    num4++;
    num6--;
    num5--;
    const num10 = Math.floor((minl + minr) / 2);
    // cs:29073-29077:两侧已是墙 244 空腔（打到天然洞穴）→ 停
    if (!activeAt(st, minl, num4) && wallAt(st, minl, num4) === WALL_LIVING_WOOD
      && !activeAt(st, minr, num4) && wallAt(st, minr, num4) === WALL_LIVING_WOOD) {
      num6 = 0;
      break;
    }
    let num11 = 1;
    if (num4 > j && W <= 4) num11++;
    for (let i = minl - num11; i <= minr + num11; i++) {
      if (isDungeonWall(wallAt(st, i, num4))) { flag = true; flag2 = true; }  // cs:29082
      if (i > num10 - 2 && i <= num10 + 1) {
        // 井筒核心 2-4 列（cs:29088-29113）
        if (num4 > j - 4) {
          let flag4 = true;
          if (!activeAt(st, i, num4 + 1) && wallAt(st, i, num4 + 1) === 34) flag4 = false;
          const sh = sheetAt(st, i, num4);
          if (sh !== 19 && sh !== 15 && sh !== 304 && sh !== 21 && sh !== 10
            && sheetAt(st, i, num4 - 1) !== 15 && sheetAt(st, i, num4 - 1) !== 304
            && sheetAt(st, i, num4 - 1) !== 21 && sheetAt(st, i, num4 - 1) !== 10
            && sheetAt(st, i, num4 + 1) !== 10) {
            deactivate(st, i, num4);
          }
          const wl = wallAt(st, i, num4);
          if (!isDungeonWall(wl) && wl !== 3 && wl !== 83) st.wall[st.idx(i, num4)] = WALL_LIVING_WOOD;
          const wlL = wallAt(st, i - 1, num4);
          if (!isDungeonWall(wlL) && (wlL > 0 || num4 >= worldSurface)) st.wall[st.idx(i - 1, num4)] = WALL_LIVING_WOOD;
          const wlR = wallAt(st, i + 1, num4);
          if (!isDungeonWall(wlR) && (wlR > 0 || num4 >= worldSurface)) st.wall[st.idx(i + 1, num4)] = WALL_LIVING_WOOD;
          if (num4 === j && flag4) {
            deactivate(st, i, num4 + 1);
            placePlatform(st, rng, i, num4 + 1, 23);   // 生命木平台（cs:29109）
          }
        }
      } else {
        // 井壁（cs:29115-29142）
        const sh = sheetAt(st, i, num4);
        if (sh !== 15 && sh !== 304 && sh !== 21 && sh !== 10
          && sheetAt(st, i - 1, num4) !== 10 && sheetAt(st, i + 1, num4) !== 10) {
          const wl = wallAt(st, i, num4);
          if (!isDungeonWall(wl) && wl !== 3 && wl !== 83 && (activeAt(st, i, num4) || wl !== 34)) {
            setLivingWood(st, i, num4);
          }
          if (sheetAt(st, i - 1, num4) === 40) st.type[st.idx(i - 1, num4)] = T.DIRT;  // cs:29136 粘土→泥土
          if (sheetAt(st, i + 1, num4) === 40) st.type[st.idx(i + 1, num4)] = T.DIRT;
        }
        if (num4 <= j && num4 > j - 4 && i > minl - num11 && i <= minr + num11 - 1) {
          st.wall[st.idx(i, num4)] = WALL_LIVING_WOOD;         // cs:29144
        }
      }
    }
    if (typeof process !== 'undefined' && process.env.SW_DG_LTMARK) console.log(`MARK|gw|y=${num4}|ml=${minl}|mr=${minr}|rc=${(globalThis as unknown as { __ltRc?: { n: number } }).__ltRc?.n ?? -1}`);
    num8++;
    if (num8 >= 6) {
      num8 = 0;
      let num12 = rng.int(0, 2);                  // cs:29149
      if (num12 === 0) num12 = -1;
      if (flag3) num12 = 2;                       // cs:29154 首个 6 步段必为井口平台
      if (num12 === -1 && wallAt(st, minl - num3, num4) === WALL_LIVING_WOOD) num12 = 1;
      else if (num12 === 1 && wallAt(st, minr + num3, num4) === WALL_LIVING_WOOD) num12 = -1;
      if (num12 === 2) {
        flag3 = false;
        let style = 23;
        if (isDungeonWall(wallAt(st, minl, num4 + 1))
          || isDungeonWall(wallAt(st, minl + 1, num4 + 1))
          || isDungeonWall(wallAt(st, minl + 2, num4 + 1))) {
          style = 12;                             // cs:29159
        }
        for (let k = minl; k <= minr; k++) {
          if (k > num10 - 2 && k <= num10 + 1) {
            deactivate(st, k, num4 + 1);
            placePlatform(st, rng, k, num4 + 1, style);
          }
        }
      } else {
        minl += num12;                            // cs:29177 井筒蛇形横移
        minr += num12;
      }
      if (LT_TRACE) console.log(`MP6 st=${ltStream()} num4=${num4} num12=${num12} minl=${minl} minr=${minr}`);
      if (noSecretRoom) {
        num9--;
        if (num9 <= 0) {
          if (typeof process !== 'undefined' && process.env.SW_DG_LTMARK) console.log(`MARK|gpB|rc=${(globalThis as unknown as { __ltRc?: { n: number } }).__ltRc?.n ?? -1}`);
          num9 = growLivingTreeHorizontalTunnel(st, rng, gs, num10, num4)
            ? rng.int(5, 20) : rng.int(2, 10);    // cs:29182-29186
          if (LT_TRACE) console.log(`MPt st=${ltStream()} num4=${num4}`);
        }
      }
      if (num5 <= 0 && !flag) {
        flag = true;
        growLivingTreePassageRoom(st, rng, gs, chests, minl, minr, num4);  // cs:29190
        if (typeof process !== 'undefined' && process.env.SW_DG_LTMARK) console.log(`MARK|gpC|rc=${(globalThis as unknown as { __ltRc?: { n: number } }).__ltRc?.n ?? -1}`);
        if (LT_TRACE) console.log(`MPr st=${ltStream()} num4=${num4}`);
      }
    }
    if (flag2) {
      let flag5 = true;
      for (let l = minl; l <= minr; l++) {
        for (let m = num4 + 1; m <= num4 + 2; m++) {
          if (ltSolid(st, l, m)) flag5 = false;   // cs:29362 SolidTile 全项版
        }
      }
      if (flag5) num6 = 0;                        // cs:29198
    } else {
      if (num5 > 0) continue;
      let flag6 = true;
      for (let n = minl; n <= minr; n++) {
        for (let n13 = num4 + 1; n13 <= num4 + 4; n13++) {
          if (ltSolid(st, n, n13)) flag6 = false; // cs:29384 SolidTile 全项版
        }
      }
      if (flag6) num6 = 0;                        // cs:29209
    }
  }
  if (LT_TRACE) console.log(`MP exit st=${ltStream()} num4=${num4}`);
  refs.minl = startL; refs.minr = startR;         // cs:29216-29217 恢复
  // 井口 j-3..j 贯通 + 墙补（cs:29219-29242）
  for (let n14 = refs.minl; n14 <= refs.minr; n14++) {
    for (let n15 = j - 3; n15 <= j; n15++) {
      deactivate(st, n14, n15);
      let flag7 = true;
      for (let n16 = n14 - 1; n16 <= n14 + 1; n16++) {
        for (let n17 = n15 - 1; n17 <= n15 + 1; n17++) {
          if (!activeAt(st, n16, n17) && wallAt(st, n16, n17) === 0) flag7 = false;
        }
      }
      if (flag7 && !isDungeonWall(wallAt(st, n14, n15))) {
        st.wall[st.idx(n14, n15)] = WALL_LIVING_WOOD;
      }
    }
  }
}


// ---------- GrowLivingTree（cs:28123-28759） ----------
export function growLivingTree(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink, i: number, j0: number, patch = false,
): boolean {
  const j = j0;
  const worldSurface = gs.worldSurface;
  if (LT_TRACE) ltRngCache = rng;
  // 前置门禁（cs:28158-28180）：脚下实心、锚点空、地面类型 dirt/grass/stone/clay/ore
  // ★IIIII73：SolidTile 全项版（cs:28287，见 ltSolid 注）
  if (!ltSolid(st, i, j + 1)) {
    if (LT_TRACE) {
      const gi = st.idx(i, j + 1);
      console.log(`GLT r1 x=${i} j=${j} !solid-foot act=${st.flags[gi]} sheet=${TILE_DEFS[st.type[gi]]?.vanilla?.sheet} key=${TILE_DEFS[st.type[gi]]?.key}`);
    }
    return false;
  }
  if (activeAt(st, i, j)) { if (LT_TRACE) console.log(`GLT r2 x=${i} j=${j} anchor-active`); return false; }
  const gSheet = sheetAt(st, i, j + 1);
  // ★YYYYYY（2026-08-23）NTB #42：cs:28163-28174 脚基门——非 NTB 脚基 ∉
  //   {0,2,1,40,Ore} 即拒；**NTB 追加放行 60 丛林草/59 泥**（`(!notTheBees ||
  //   (foot!=60 && foot!=59))` 反式）。JS 曾缺 NTB 析取 → 蜂罐丛林带树全拒。
  //   （cs:28167-28173 的 tenthAnniversary 存活支=191/192/383/384 脚基拒——
  //   celebrationmk10 组合,常规路径不可达,不移植。）
  const ntbFoot = gs.seedFlags.notTheBees && (gSheet === 60 || gSheet === 59);
  if (gSheet !== 0 && gSheet !== 2 && gSheet !== 1 && gSheet !== 40 && !ORE_SHEETS.has(gSheet) && !ntbFoot) { if (LT_TRACE) console.log(`GLT r3 x=${i} j=${j} ground=${gSheet}`); return false; }
  if (j < 150) { if (LT_TRACE) console.log(`GLT r4 x=${i} j=${j} <150`); return false; }

  // ★YYYYYY（2026-08-23）NTB #42：cs:28186-28192 干宽三连——skyblock/extraLivingTrees
  //   之后的 **`else if (notTheBees && !drunkWorldGen)`** 支：num3-=Next(0,2)/
  //   num4+=Next(0,2)（2 掷+加宽）。JS 曾整支缺 → NTB 干窄 1 格+流移 2 掷。
  const ntbWiden = gs.seedFlags.notTheBees && !gs.seedFlags.drunkWorld;
  let num3 = i - rng.int(2, 2);   // cs:28182 Next(2,3) 恒 2（保留掷骰消耗）
  let num4 = i + rng.int(2, 2);   // cs:28183
  if (ntbWiden) {
    num3 -= rng.int(0, 1);        // cs:28189-28190 Next(0,2)
    num4 += rng.int(0, 1);        // cs:28191-28192
  }
  if (rng.int(0, 4) === 0) {      // cs:28200 Next(5)
    if (rng.int(0, 1) === 0) num3--;
    else num4++;
  }
  const num5 = num4 - num3;       // cs:28199（patch 覆写前定宽,后续全用此值）
  let flag = num5 >= 4;
  let num6 = i - 50, num7 = i + 50;
  if (patch) {
    num6 = i - 20; num7 = i + 20;
    num3 = i - rng.int(1, 2);
    num4 = i + rng.int(1, 2);
    // ★YYYYYY（2026-08-23）NTB #42：cs:28214-28218 patch 干宽同款加宽支
    if (ntbWiden) {
      num3 -= rng.int(0, 1);      // cs:28215-28216 Next(0,2)
      num4 += rng.int(0, 1);      // cs:28217-28218
    }
    flag = num5 >= 4;
  }
  // 净空检查（cs:28232-28255）：树冠投影内(上方到 j-5)不得有实心物
  {
    const num8 = 5;
    for (let k = num6; k <= num7; k++) {
      for (let l = num8; l < j - 5; l++) {
        if (activeAt(st, k, l)) {
          if (!patch) { if (LT_TRACE) console.log(`GLT r5 x=${i} j=${j} clear-hit (${k},${l})`); return false; }
          const sh = sheetAt(st, k, l);
          if (sh !== 2 && sh !== 0 && sh !== 1 && sh !== 191 && sh !== 192 && sh !== 383 && sh !== 384) { if (LT_TRACE) console.log(`GLT r6 x=${i} j=${j} patch-badtype (${k},${l}) sh=${sh}`); return false; }
        }
      }
    }
  }
  // ★cs:28257 `Main.tileSolid[48] = false`：净空检查之后、主干生长之前翻 48 尖刺为
  //   非实心——根系下扎/竖井探测（solidAt）不再被尖刺挡住。函数尾 cs:28757 还原
  //   true（28257-28757 之间无 return 路径,已核实,作用域闭合无泄漏）。
  flipGenSolid([48], false);
  let num9 = num3, num10 = num4;
  let minl = num3, minr = num4;
  let num11 = j;
  let flag2 = true;
  let num12 = rng.int(-8, -5);    // cs:28264
  let num13 = rng.int(0, 1);      // cs:28265
  let num14 = rng.int(5, 14);     // cs:28266
  const maxValue = 2;             // cs:28267（extraLivingTrees 才会 >2）
  const ax = new Int32Array(1000), ax2 = new Int32Array(1000), ax3 = new Int32Array(1000), ax4 = new Int32Array(1000);
  let num = 0;
  const ax5 = new Int32Array(2000), ax6 = new Int32Array(2000), ax7 = new Uint8Array(2000);
  let num2 = 0;
  if (LT_TRACE) console.log(`GLTp head st=${ltStream()} g=${ltGridHash(st)} num3=${num3} num4=${num4} num5=${num5}`);
  if (typeof process !== 'undefined' && process.env.SW_DG_LTMARK) console.log(`MARK|gt0|rc=${(globalThis as unknown as { __ltRc?: { n: number } }).__ltRc?.n ?? -1}`);; (globalThis as unknown as { __ltSnapBox?: (t: string) => void }).__ltSnapBox?.('gt0')
  // ---- 主干收窄循环（cs:28271-28345） ----
  while (flag2) {
    num12++;
    if (num12 > num14) {
      num14 = rng.int(5, 14);
      num12 = 0;
      ax2[num] = num11 + rng.int(0, 4);
      if (rng.int(0, 4) === 0) num13 = num13 === 0 ? 1 : 0;
      if (num13 === 0) {
        ax3[num] = -1;
        ax[num] = num3;
        ax4[num] = num4 - num3;
        if (rng.int(0, maxValue - 1) === 0) num3++;      // cs:28294 Next(maxValue)
        num9++;                                          // cs:28301（flag3 恒 false）
        num13 = 1;
      } else {
        ax3[num] = 1;
        ax[num] = num4;
        ax4[num] = num4 - num3;
        if (rng.int(0, maxValue - 1) === 0) num4--;      // cs:28313
        num10--;                                         // cs:28320
        num13 = 0;
      }
      if (num9 === num10) flag2 = false;
      num++;
    }
    for (let m = num3; m <= num4; m++) {
      if (!isDungeonWall(wallAt(st, m, num11))) setLivingWood(st, m, num11);   // cs:28343
    }
    num11--;
  }
  if (LT_TRACE) console.log(`GLTp trunk st=${ltStream()} g=${ltGridHash(st)} num=${num}`);
  if (typeof process !== 'undefined' && process.env.SW_DG_LTMARK) console.log(`MARK|gtB|rc=${(globalThis as unknown as { __ltRc?: { n: number } }).__ltRc?.n ?? -1}`);; (globalThis as unknown as { __ltSnapBox?: (t: string) => void }).__ltSnapBox?.('gtB')
  // ---- 侧枝（cs:28347-28420） ----
  for (let n15 = 0; n15 < num - 1; n15++) {
    let n16 = ax[n15] + ax3[n15];
    let n17 = ax2[n15];
    let n18 = Math.trunc(ax4[n15] * (1 + rng.int(20, 29) * 0.1));  // cs:28352
    if (!isDungeonWall(wallAt(st, n16, n17 + 1))) setLivingWood(st, n16, n17 + 1);
    let n19 = rng.int(3, 4);                              // cs:28360
    while (n18 > 0) {
      n18--;
      if (!isDungeonWall(wallAt(st, n16, n17))) setLivingWood(st, n16, n17);
      if (rng.int(0, 9) === 0) {                          // cs:28365 10% 纵向抖动
        n17 = rng.int(0, 1) !== 0 ? n17 + 1 : n17 - 1;
      } else {
        n16 += ax3[n15];
      }
      if (n19 > 0) {
        n19--;
      } else if (rng.int(0, 1) === 0) {                   // cs:28371 长枝
        n19 = rng.int(2, 4);
        if (!isDungeonWall(wallAt(st, n16, n17))) {
          if (rng.int(0, 1) === 0) {
            setLivingWood(st, n16, n17);
            setLivingWood(st, n16, n17 - 1);
            ax5[num2] = n16; ax6[num2] = n17; num2++;
          } else {
            setLivingWood(st, n16, n17);
            setLivingWood(st, n16, n17 + 1);
            ax5[num2] = n16; ax6[num2] = n17; num2++;
          }
        }
      }
      if (n18 === 0) {
        ax5[num2] = n16; ax6[num2] = n17; num2++;
      }
    }
  }
  if (LT_TRACE) console.log(`GLTp branches st=${ltStream()} g=${ltGridHash(st)}`);
  if (typeof process !== 'undefined' && process.env.SW_DG_LTMARK) console.log(`MARK|gtC|rc=${(globalThis as unknown as { __ltRc?: { n: number } }).__ltRc?.n ?? -1}`);; (globalThis as unknown as { __ltSnapBox?: (t: string) => void }).__ltSnapBox?.('gtC')
  // ---- 顶部收尖 + 枝头（cs:28421-28509） ----
  let n20 = Math.floor((num3 + num4) / 2);
  let n21 = num11;
  let n22 = rng.int(num5 * 3, num5 * 5 - 1);              // cs:28424
  let n23 = 0, n24 = 0;
  while (n22 > 0 && n21 >= 30) {
    if (!isDungeonWall(wallAt(st, n20, n21))) setLivingWood(st, n20, n21);
    if (n23 > 0) n23--;
    if (n24 > 0) n24--;
    for (let n25 = -1; n25 < 2; n25++) {
      if (n25 === 0 || ((n25 >= 0 || n23 !== 0) && (n25 <= 0 || n24 !== 0)) || rng.int(0, 1) !== 0) continue;
      let n26 = n20, n27 = n21;
      let n28 = rng.int(num5, num5 * 3 - 1);              // cs:28446
      if (n25 < 0) n23 = rng.int(3, 4);
      if (n25 > 0) n24 = rng.int(3, 4);
      let n29 = 0;
      while (n28 > 0) {
        n28--;
        n26 += n25;
        if (!isDungeonWall(wallAt(st, n26, n27))) setLivingWood(st, n26, n27);
        if (n28 === 0) { ax5[num2] = n26; ax6[num2] = n27; ax7[num2] = 1; num2++; }
        if (rng.int(0, 4) === 0) {
          n27 = rng.int(0, 1) !== 0 ? n27 + 1 : n27 - 1;
          if (!isDungeonWall(wallAt(st, n26, n27))) setLivingWood(st, n26, n27);
        }
        if (n29 > 0) {
          n29--;
        } else if (rng.int(0, 2) === 0) {
          n29 = rng.int(2, 3);
          const n30 = n26;
          let n31 = n27;
          n31 = rng.int(0, 1) !== 0 ? n31 + 1 : n31 - 1;
          if (!isDungeonWall(wallAt(st, n30, n31))) setLivingWood(st, n30, n31);
          ax5[num2] = n30; ax6[num2] = n31; ax7[num2] = 1; num2++;
          ax5[num2] = n30 + rng.int(-5, 5); ax6[num2] = n31 + rng.int(-5, 5); ax7[num2] = 1; num2++;
        }
      }
    }
    ax5[num2] = n20; ax6[num2] = n21; num2++;
    if (rng.int(0, 3) === 0) {
      n20 = rng.int(0, 1) !== 0 ? n20 + 1 : n20 - 1;
      if (!isDungeonWall(wallAt(st, n20, n21))) setLivingWood(st, n20, n21);
    }
    n21--;
    n22--;
  }
  if (LT_TRACE) console.log(`GLTp top st=${ltStream()} g=${ltGridHash(st)}`);
  if (typeof process !== 'undefined' && process.env.SW_DG_LTMARK) console.log(`MARK|gtD|rc=${(globalThis as unknown as { __ltRc?: { n: number } }).__ltRc?.n ?? -1}`);; (globalThis as unknown as { __ltSnapBox?: (t: string) => void }).__ltSnapBox?.('gtD')
  // ---- 根系（cs:28511-28600） ----
  for (let n32 = minl; n32 <= minr; n32++) {
    let n33 = rng.int(1, 5);                              // cs:28514
    let n34 = j + 1;
    while (n33 > 0) {
      if (ltSolid(st, n32, n34)) n33--;              // cs:28709 SolidTile 全项版
      setLivingWood(st, n32, n34);
      n34++;
    }
    const n35 = n34;
    const n36 = rng.int(2, num5);                         // cs:28525 Next(2, num5+1)
    for (let n37 = 0; n37 < n36; n37++) {
      n34 = n35;
      const n38 = Math.floor((minl + minr) / 2);
      let n39 = n32 >= n38 ? 1 : -1;
      let n40 = 1;
      if (n32 === n38 || (num5 > 6 && (n32 === n38 - 1 || n32 === n38 + 1))) n39 = 0;
      const n41 = n39;
      let n42 = n32;
      n33 = rng.int(Math.trunc(num5 * 3.5), num5 * 6 - 1); // cs:28538
      while (n33 > 0) {
        n33--;
        n42 += n39;
        // 1456 cs:28606/28619 两次主步写门 = `wall != 244`（活木墙挡写；地牢墙不挡——
        // 1405:12796/12803 同）。★2026-08-16 对拍裁决：此前 JS 双门(wall≠244&&!wallDungeon)
        // /oracle 单 wallDungeon 门均非原版语义；步进 cs:28612 `num34 += num40`（0=平移
        // 不降,同格二次写幂等）此前两侧均误写死 1——n40 翻转一直被掷但从未生效。
        if (wallAt(st, n42, n34) !== WALL_LIVING_WOOD) setLivingWood(st, n42, n34);
        n34 += n40;
        if (wallAt(st, n42, n34) !== WALL_LIVING_WOOD) setLivingWood(st, n42, n34);
        if (!activeAt(st, n42, n34 + 1)) { n39 = 0; n40 = 1; }   // cs:28547 悬空改竖直下扎
        if (rng.int(0, 2) === 0) {
          n39 = n41 < 0 ? (n39 === 0 ? -1 : 0) : (n41 <= 0 ? rng.int(-1, 1) : (n39 === 0 ? 1 : 0));
        }
        if (rng.int(0, 2) === 0) {
          n40 = n40 === 0 ? 1 : 0;
        }
      }
    }
  }
  if (LT_TRACE) console.log(`GLTp roots st=${ltStream()} g=${ltGridHash(st)}`);
  // ---- 叶簇（cs:28603-28720） ----
  // ★IIIII70 REMIX（1457 WorldGen.cs:28888-28891）：叶簇簇数 num2 在 remix 下**清零**
  //   （`if (remixWorldGen) { num2 = 0; }`）——反向体世界树只长活木不长叶/地被，
  //   簇循环连同其内部掷骰整段跳过。此前缺失 → REMIX 树全冠错写（mile8 #42 首差
  //   T191>0×3333/T0>192×8543 等），并把本 pass 内主流掷位整体前移。
  num2 = gs.seedFlags.remix ? 0 : num2;
  for (let n43 = 0; n43 < num2; n43++) {
    let n44 = rng.int(5, 7);
    n44 = Math.trunc(n44 * (1 + num5 * 0.05));
    if (ax7[n43]) n44 = rng.int(6, 11) + num5;
    if (LT_TRACE) console.log(`ANCH n43=${n43} x=${ax5[n43]} y=${ax6[n43]} round=${ax7[n43] ? 1 : 0} n44=${n44}`);
    const n45 = ax5[n43] - n44 * 2;
    const n46 = ax5[n43] + n44 * 2;
    const n47 = ax6[n43] - n44 * 2;
    const n48 = ax6[n43] + n44 * 2;
    const n49 = 2.0 - rng.int(0, 4) * 0.1;                // cs:28618
    for (let n50 = n45; n50 <= n46; n50++) {
      for (let n51 = n47; n51 <= n48; n51++) {
        if (!canPlaceLeaves(st, n50, n51)) continue;
        if (ax7[n43]) {
          // 枝头圆冠（cs:28633-28645）
          const dx = ax5[n43] - n50, dy = ax6[n43] - n51;
          if (Math.sqrt(dx * dx + dy * dy) < n44 * 0.9) setLeaf(st, n50, n51);
        } else if (Math.abs(ax5[n43] - n50) + Math.abs(ax6[n43] - n51) * n49 < n44) {
          setLeaf(st, n50, n51);                            // cs:28648
        }
      }
      if (rng.int(0, 29) === 0) {                           // cs:28653 叶顶大石堆
        let n52 = n47;
        if (inWorld(st, n50, n52, 5) && !activeAt(st, n50, n52)) {
          while (!activeAt(st, n50, n52 + 1) && n52 < n48) n52++;
          if (sheetAt(st, n50, n52 + 1) === 192) {
            placeTilePile(st, n50, n52, rng.int(50, 51));
          }
        }
      }
      if (ax7[n43] || rng.int(0, 14) !== 0) continue;
      // cs:28666-28691 叶下地被（LargePiles2 47-49 / SmallPiles 59-61,72）
      let n53 = n48;
      const n54 = n53 + 100;
      if (activeAt(st, n50, n53)) continue;
      while (!activeAt(st, n50, n53 + 1) && n53 < n54) n53++;
      if (sheetAt(st, n50, n53 + 1) === 192) continue;
      if (rng.int(0, 1) === 0) {
        placeTilePile(st, n50, n53, rng.int(47, 49));
        continue;
      }
      const n55 = rng.int(0, 1);
      let pileStyle = 72;
      if (n55 === 1) pileStyle = rng.int(59, 61);
      placeSmallPile(st, n50, n53, pileStyle, n55);
    }
  }
  if (LT_TRACE) console.log(`GLTp leaves st=${ltStream()} g=${ltGridHash(st)} num2=${num2}`);
  // ---- 树干贯通竖井（cs:28722-28754）：宽干(num5>=4)且地表下无既有空腔时 ----
  if (flag) {
    let flag4 = false;
    const n56 = j;
    const n57 = j + 20;
    for (let n58 = n56; n58 < n57 && n58 < worldSurface - 2; n58++) {
      for (let n59 = minl; n59 <= minr; n59++) {
        // ★IIIII73：cs:28875 `wall==0 && !SolidTile` 全项版
        if (wallAt(st, n59, n58) === 0 && !ltSolid(st, n59, n58)) {
          flag4 = true;
          break;
        }
      }
      if (flag4) break;
    }
    if (!flag4) {
      const refs: PassageRefs = { minl, minr };
      if (typeof process !== 'undefined' && process.env.SW_DG_LTMARK) {
        console.log(`MARK|gp0|rc=${(globalThis as unknown as { __ltRc?: { n: number } }).__ltRc?.n ?? -1}`);
        (globalThis as unknown as { __ltSnapBox?: (t: string) => void }).__ltSnapBox?.('gp0');
      }
      growLivingTreeMakePassage(st, rng, gs, chests, j, num5, refs, patch);
      minl = refs.minl; minr = refs.minr;
    }
  }
  // ★cs:28757 `Main.tileSolid[48] = true`：函数尾还原（对应头部的 cs:28257 翻转）
  flipGenSolid([48], true);
  return true;
}

// ---------- LivingTrees pass（cs:15551-15791） ----------
export function runLivingTreesPass(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink,
): void {
  // 一次性探针钩（同 WebsPass 模式）：LivingTrees 入口快照（债时间线用）
  const g0 = globalThis as { __swLtCap?: (gs: GenState, st: TileStore) => void };
  try { g0.__swLtCap?.(gs, st); } catch { /* probe */ }
  const { w } = st;
  const num = 200;                        // cs:15560 与世界中心 ±200 排除带
  const num2 = 0;                         // cs:15561（extraFloatingIslands 才 >0）
  const num3 = w / 4200;                  // cs:15563
  let num4 = rng.int(0, Math.floor(2 * num3));   // cs:15564 Next(0, (int)(2*num3)+1)
  if (num4 === 0 && rng.int(0, 1) === 0) num4++; // cs:15565 genRand.Next(2)==0（int(0,1) ≡ Next(2) 位级一致）
  // ★SSS-CELEB（1458 cs:15576-15602 else-if 阶梯）：活树数量种子加成。
  //   梯序：SecretSeed.extraLivingTrees → ntb&&tenth&&!drunk(+10·num3) →
  //   drunk(+2) → **tenth(+3)** → remix(+2)。前两支是组合域（按惯例不移植），
  //   drunk/remix/tenth 三支照 1458 补齐——各自独立线的既有缺口同框清偿。
  const sfT = !!gs.seedFlags?.tenthAnniversary;
  if (gs.seedFlags.notTheBees && sfT && !gs.seedFlags.drunkWorld) {
    num4 += Math.trunc(10 * num3);            // cs:15579-15581
  } else if (gs.seedFlags.drunkWorld) {
    num4 += Math.trunc(2 * num3);             // cs:15582-15584
  } else if (sfT) {
    num4 += Math.trunc(3 * num3);             // cs:15585-15587 十周年活树+3（小世界 num3=1.0）
  } else if (gs.seedFlags.remix) {
    num4 += Math.trunc(2 * num3);             // cs:15588-15590
  }
  if (LT_TRACE) { ltRngCache = rng; console.log(`LT count num4=${num4}`); }
  for (let i = 0; i < num4; i++) {
    let flag = false;
    let num5 = 0;
    while (!flag) {
      num5++;
      if (num5 > w / 2) flag = true;      // cs:15608
      const num6b = rng.int(gs.beachDistance, w - gs.beachDistance - 1); // cs:15610 基掷（恒消耗）
      // ★SSS-CELEB（1458 cs:15619-15622）：tenth&&!remix → 候选 X 改走 [0.15w,0.85w)
      //   （基掷被覆写但**照常消耗**——两次 Next 都执行，小世界终值 (int)((float)4200*0.85f)=3570）
      const celbBand = sfT && !gs.seedFlags.remix;
      let num6: number;
      if (celbBand) {
        num6 = rng.nextIntRange(Math.trunc(w * 0.15), Math.trunc(Math.fround(Math.fround(w) * Math.fround(0.85))));
      } else {
        num6 = num6b;
      }
      if (num6 <= Math.floor(w / 2) - num || num6 >= Math.floor(w / 2) + num) {
        let j = num2;
        // cs:15622-15629：自顶向下找首个实心格（超过 worldSurface 放弃）
        for (; !activeAt(st, num6, j) && j < gs.worldSurface; j++) { /* 空转 */ }
        if (j >= gs.worldSurface) continue;
        // ★YYYYYY（2026-08-23）NTB #42：cs:15629 锚基门 `type==0 || (notTheBees &&
        //   type==60) || (notTheBees && tenthAnniversary && !drunk)`——蜂罐世界锚基
        //   放行丛林草 60（第三析取 tenthAnniversary 系 celebrationmk10 组合,不在
        //   常规路径,按约定不移植）。JS 曾只认 0 → NTB 丛林草带活树锚全拒。
        const baseSheet = sheetAt(st, num6, j);
        // ★IIIII70 对账仪：与 rig MARK|ltA/ltR 同位同格式（SW_DG_LTMARK 门控）
        if (typeof process !== 'undefined' && process.env.SW_DG_LTMARK) console.log(`MARK|ltA|${num6},${j}|rc=${(globalThis as unknown as { __ltRc?: { n: number } }).__ltRc?.n ?? -1}`);
        if (baseSheet === 0 || (gs.seedFlags.notTheBees && baseSheet === 60)) {   // cs:15629
          j--;
          if (j > 150) {
            let flag2 = true;
            if (isTileNearby(st, num6, j, LIVING_WOOD, 10) || isTileNearby(st, num6, j, LEAF, 10)) {
              flag2 = false;                // cs:15639-15642
            }
            if (flag2) {
              // cs:15645-15671：候选点周围 100×100 排除区
              outer:
              for (let k = num6 - 50; k < num6 + 50; k++) {
                for (let l = j - 50; l < j + 50; l++) {
                  if (!activeAt(st, k, l)) continue;
                  const sh = sheetAt(st, k, l);
                  if (EXCLUDE_BRICK.has(sh)) { flag2 = false; break outer; }
                  if (CLOUD_SHEETS.has(sh)) { flag2 = false; break outer; }
                }
              }
            }
            // cs:15674-15682：与 Mount Caves 锚点 ±50 拒绝
            for (let m = 0; m < gs.numMCaves; m++) {
              if (num6 > gs.mCaveX[m] - 50 && num6 < gs.mCaveX[m] + 50) {
                flag2 = false;
                break;
              }
            }
            if (flag2) {
              if (LT_TRACE) console.log(`LT try x=${num6} j=${j} st=${ltStream()}`);
              flag = growLivingTree(st, rng, gs, chests, num6, j);
              if (typeof process !== 'undefined' && process.env.SW_DG_LTMARK) console.log(`MARK|ltR|${num6},${j}|${flag ? 1 : 0}|rc=${(globalThis as unknown as { __ltRc?: { n: number } }).__ltRc?.n ?? -1}`);
              if (LT_TRACE) console.log(`LT result x=${num6} ok=${flag} st=${ltStream()}`);
              if (flag) {
                // cs:15692-15763：左右两侧补种 patch 小树
                for (let n = -1; n <= 1; n++) {
                  if (n === 0) continue;
                  let num7 = num6;
                  let num8 = rng.int(0, 3);          // cs:15728 基掷（恒消耗）
                  // ★SSS-CELEB（1458 cs:15730-15744 else-if 阶梯）：patch 小树清带宽加成
                  //   ntb&&tenth&&!drunk +Next(3,7)/drunk||tenth +Next(2,5)/remix +Next(1,6)
                  if (gs.seedFlags.notTheBees && sfT && !gs.seedFlags.drunkWorld) {
                    num8 += rng.int(3, 6);
                  } else if (gs.seedFlags.drunkWorld || sfT) {
                    num8 += rng.int(2, 4);
                  } else if (gs.seedFlags.remix) {
                    num8 += rng.int(1, 5);
                  }
                  for (let n9 = 0; n9 < num8; n9++) {
                    num7 += rng.int(13, 30) * n;
                    if (num7 <= Math.floor(w / 2) - num || num7 >= Math.floor(w / 2) + num) {
                      let num10 = j;
                      if (activeAt(st, num7, num10)) {
                        while (num10 > 0 && activeAt(st, num7, num10)) num10--;
                      } else {
                        for (; num10 < st.h - 1 && !activeAt(st, num7, num10); num10++) { /* 空转 */ }
                        num10--;
                      }
                      flag2 = true;
                      outer2:
                      for (let n11 = num6 - 50; n11 < num6 + 50; n11++) {
                        for (let n12 = j - 50; n12 < j + 50; n12++) {
                          if (!activeAt(st, n11, n12)) continue;
                          const sh = sheetAt(st, n11, n12);
                          if (EXCLUDE_BRICK.has(sh)) { flag2 = false; break outer2; }
                          if (CLOUD_SHEETS.has(sh)) { flag2 = false; break outer2; }
                        }
                      }
                      if (flag2) { if (LT_TRACE) console.log(`LT patch x=${num7} j=${num10} st=${ltStream()}`); const okP = growLivingTree(st, rng, gs, chests, num7, num10, true); if (LT_TRACE) console.log(`LT patchDone x=${num7} ok=${okP} st=${ltStream()}`); }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  // ★pass 尾 tileSolid 翻转（cs:15789 `Main.tileSolid[192] = false`）：活树叶自此
  //   生成期恒非实心（中途 cs:16324 沙上清水翻 true → cs:16694 SmoothWorld 尾翻回
  //   false → cs:19592 Piles 尾翻 true,各接线点见 GenSolid.ts 头注）。
  //   本仓 TILE_DEFS 已把 192 预翻为 solid:false（数据不可动）——此翻转在数据基线上
  //   为 no-op,接线仅为时间线存档。
  flipGenSolid([192], false);
}

// ---------- LivingTreeWalls pass（cs:15792-15824，零掷骰） ----------
export function runLivingTreeWallsPass(st: TileStore, gs: GenState): void {
  for (let i = 25; i < st.w - 25; i++) {
    for (let j = 25; j < gs.worldSurface; j++) {
      // cs:15805：自身或四邻为活木 → 候选
      if (typeAt(st, i, j) === LIVING_WOOD || typeAt(st, i, j - 1) === LIVING_WOOD
        || typeAt(st, i - 1, j) === LIVING_WOOD || typeAt(st, i + 1, j) === LIVING_WOOD
        || typeAt(st, i, j + 1) === LIVING_WOOD) {
        // cs:15807-15816：八邻中 4 个斜角必须全为活木(实心)或已有墙 244
        let flag = true;
        for (let k = i - 1; k <= i + 1; k++) {
          for (let l = j - 1; l <= j + 1; l++) {
            if (k !== i && l !== j
              && (!activeAt(st, k, l) || typeAt(st, k, l) !== LIVING_WOOD)
              && wallAt(st, k, l) !== WALL_LIVING_WOOD) {
              flag = false;
            }
          }
        }
        if (flag) st.wall[st.idx(i, j)] = WALL_LIVING_WOOD;   // cs:15819
      }
    }
  }
}
