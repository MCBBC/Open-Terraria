// 原版 pass 81 "Piles"（1456 WorldGen.cs:18900-19599）1:1——七个子段全量移植。
// ① w*0.06 洞穴堆（cs:18924）② w*0.01 深层堆（cs:19049）③ w*0.03 地表堆（cs:19118）
// ④ w*0.0035 地表带墙堆（cs:19184）⑤ w*0.6 全洞穴 185 小堆（cs:19261）
// ⑥ w*0.02 地表 185 小堆（cs:19411）⑦ w*0.15 地表墙 2/40 小堆（cs:19472）
// （审计清单只列了 5 段——实读原版为 7 段，progress 权重 num=7 亦印证，全量移植。）
// 重试预算 GetPileGenerationAttempts()=w/2（cs:23873）；每段"成功即止"（flag）。
// 采样域 [25,w-25]；tile 187 装饰组链（多数群系走 187，186 仅默认/地牢/冰/蘑菇草）；
// 全部群系样式链逐 if 抄（非互斥、后命中覆盖、命中才掷）；小堆 scatter 掷骰
// Next(1,5)×Next(-10,11)×Next(5)×Next(12,36)。
// pass 头 tileSolid 覆写（cs:18906-18916）：379/229/190/196/189/717-719/202/460/484
// 期间置非实心（已迁移 GenSolid 统一翻转,pass 尾 cs:19591-19599 还原,见 runPilesPass）。
// ★IIIII192：TileStore 改值导入（COAT_INVISIBLE_BLOCK 位包常量——errorWorld 巨石
//  invisibleBlock 三连写面,Tile.cs:535-542 bTileHeader3 bit5(0x20) 的仓内单字节编码）
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS, PLATFORMS_SHEETS, BOULDERS_SHEETS, TILE_TABLE_SHEETS, TILE_DUNGEON_SHEETS, WALL_DUNGEON_SHEETS, TILE_MOSS_SHEETS } from '../../../data/tiles';
import { flipGenSolid, genSolidType, vanGenSolidType } from './GenSolid';
import { genSquareTileFrame, genKillTile, genRangeFrame } from './FinalCleanupPass';
import { setBoulderSolidity } from './TrapsPass';
import { placeTilePrologueClear } from './WorldGenTileHelpers';   // ★IIIII229 ⑪ place2x2Piles 序言收编

const PILE185 = TILE_BY_KEY['v_185_small_decos']!;
const PILE186 = TILE_BY_KEY['v_186_decos_3x2']!;
const PILE187 = TILE_BY_KEY['v_187_decos_3x2_group_2']!;

// 内部 tile id → 原版 sheet id 查找表（模块级一次构建）
const SHEET = new Int16Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

/** Main.wallDungeon（墙 7/8/9/94-99）——★BJ187 收编 data/tiles.ts:
 *  WALL_DUNGEON_SHEETS 单源（9 项逐值全等） */
const WALL_DUNGEON = WALL_DUNGEON_SHEETS;
/** Main.tileDungeon（tile 41/43/44/677-679，按 sheet id 存放）——★BJ187 收编
 *  data/tiles.ts:TILE_DUNGEON_SHEETS 单源（6 项逐值全等） */
const TILE_DUNGEON = TILE_DUNGEON_SHEETS;
/** Main.tileMoss（Main.cs:7146-7187,旧注 :6956-6996 系声明行,按 sheet id 存放）——★BJ210 收编单源（§6i） */
const TILE_MOSS = TILE_MOSS_SHEETS;
/** TileID.Sets.Boulders（TileID.cs:195）——PlaceSmallPile 的 InvalidTile 门 */
// ★BJ182b 收编单源 data/tiles.ts:BOULDERS_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const BOULDERS = BOULDERS_SHEETS;

/** 原版 `Main.tile[x,y].type ==` 直读（不查 active——击杀/放置失败后的残值 type
 *  仍会命中上游 flag 判定，cs:18989/19103/19177/19254） */
const rawSheetAt = (st: TileStore, x: number, y: number): number => {
  if (!st.inBounds(x, y)) return -1;
  return SHEET[st.type[st.idx(x, y)]] ?? -1;
};
const activeAt = (st: TileStore, x: number, y: number): boolean =>
  st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
/** 活性格的 sheet id（非 active 返回 -1）——原版 Main.tile[x,y].type 直比的 sheet 化 */
const sheetAt = (st: TileStore, x: number, y: number): number => {
  if (!st.inBounds(x, y)) return -1;
  const i = st.idx(x, y);
  return st.flags[i] ? SHEET[st.type[i]] : -1;
};

/** Main.tileSolid 平台族补真表（平台 tileSolid=true 且 tileSolidTop=true——
 *  本仓 TILE_DEFS.platform 格 solid=false，须按 sheet 集补；RRRR 实证：
 *  P3(1930,1090) 锚行 1931 列为平台 19，vanilla 放置成功、JS 曾拒） */
// ★BJ182b 收编单源 data/tiles.ts:PLATFORMS_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const PLATFORM_SOLID = PLATFORMS_SHEETS;

/** SolidTile2（cs:46862）：active && tileSolid && slope==0 && !halfBrick && !inActive。
 *  ★tileSolid 走 GenSolid：pass 头覆写（cs:18906-18916,runPilesPass 接线）把
 *  379/229/190/196/189/717-719/202/460/484 置非实心——原 PASS_NON_SOLID 局部表
 *  已迁移统一（仓库数据 v_189/v_196 等仍 solid:true,placePile3x2 会把堆锚在
 *  浮空岛云块(189)/荧光菇块(196)等装饰块上,原版这些格在 pass 期间不参与锚定） */
const solidTile2 = (st: TileStore, x: number, y: number): boolean => {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[st.type[i]];
  // ★SSSS 仲裁（织入探针 (212,923)/(3384,855) 实证 ST2=True 且 slope()==1）：
  //   坐标重载 SolidTile2(int,int)（cs:70497）带平台坡面豁免——
  //   `((Platforms[t] && (halfBrick || topSlope)) || slope()==0) && !halfBrick && !inActive`
  //   ——平台族 topSlope(1/2) 算实心（Tile 重载 cs:70178 无此支，两重载语义不同！）。
  //   #77 残 2 格 = 顶坡平台 19 上的 1x1 小堆被误拒（RRRR 备案疑金标编码差——实为
  //   本豁免缺失；2519-vs-2520 同案仲裁：GPA 实测 3669 = 252+42+126+15+2520+84+630
  //   → ⑤ 段迭代数确为 2520，IL 读数正确，RRRR 谷值 2519 系本 bug 的补偿假象）。
  const sh = SHEET[st.type[i]] ?? -1;
  const isPlatform = PLATFORM_SOLID.has(sh);
  const slopeOk = (isPlatform && (st.slope[i] === 1 || st.slope[i] === 2)) || st.slope[i] === 0;
  return !!d && (genSolidType(st.type[i]) || isPlatform)
    && slopeOk && !st.half[i]
    && ((st.wire[i]! >>> 5) & 1) === 0;
};

/** SolidTileAllowBottomSlope（cs:70211-70235）与 Check3x2 样式族表（SET_SNOW 等）
 *  已随 OOOO 本地窄链退役——RRRR 批起统一由 FinalCleanupPass 引擎的
 *  solidAllowBottom/check3x2Sweep 承担（GenSolid 实心+平台正帧全语义）。 */

/** PlaceSmallPile（cs:46831）1:1：size0=1×1（fx=style*18, fy=0）；size1=2×1（fx=style*36, fy=18）。
 *  anyLava 拒绝；type==185 时下方 Boulders 拒绝（InvalidTileForPilesOrSpeleothems）。 */
function placeSmallPile(st: TileStore, x: number, y: number, pileStyle: number, pileSize: number): boolean {
  (globalThis as { __swPilesCap?: (x: number, y: number, t: number, s: number, z: number, k: number) => void }).__swPilesCap?.(x, y, 185, pileStyle, pileSize, 1);
  const i = st.idx(x, y);
  if (st.liquid[i] > 0 && st.liquidType[i] === 2) return false;
  if (pileSize === 1) {
    if (!solidTile2(st, x, y + 1) || !solidTile2(st, x + 1, y + 1)) return false;
    if (activeAt(st, x, y) || activeAt(st, x + 1, y)) return false;
    if (BOULDERS.has(sheetAt(st, x, y + 1)) || BOULDERS.has(sheetAt(st, x + 1, y + 1))) return false;
    const fx = pileStyle * 36;
    st.setTileSilent(x, y, PILE185, fx, 18);
    st.setTileSilent(x + 1, y, PILE185, fx + 18, 18);
    return true;
  }
  if (!solidTile2(st, x, y + 1) || activeAt(st, x, y)) return false;
  st.setTileSilent(x, y, PILE185, pileStyle * 18, 0);
  return true;
}

/** InvalidTileForPilesOrSpeleothems（cs:39005）：active && TileID.Sets.Boulders。
 *  （InWorld(x,y,2) 越界 → false=放行） */
const invalidPiles = (st: TileStore, x: number, y: number): boolean => {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  return st.flags[i] !== 0 && BOULDERS.has(SHEET[st.type[i]] ?? -1);
};

/** TileID.Sets 家族表（SET_SNOW/ICE/MUD/SAND/...）已随本地窄链退役（见上注） */

/** ★RRRR 勘误备案：段迭代上界的 float32 语义（(float)w * 0.6f）与 JS double 在
 *  w=4200 全部同值（fround(2520.0001)按 float32 间距 2^-12 归 2520.0）——曾疑
 *  迭代数差，实测证伪；两语义对其他宽度亦需逐值核对后再动。 */

/** PlaceTile(186/187) → Place3x2(i,j,type,style)（cs:60018 case 路由 + cs:52097-52235）
 *  + 尾随 SquareTileFrame(i,j)（cs:60026 case 分支尾 + cs:60285 成功尾，成功时两次）
 *  → TileFrame 全分派 → 各 Check* 帧杀链。
 *  ★IIII 批（2026-08-18）修正三件：
 *  ① 几何 = **中心锚**（列 x-1..x+1 × 行 y-1..y，frameX 基 54*style 按列 +0/+18/+36，
 *    顶行 frameY=0 底行 18）——曾左对齐 x..x+2 整体右移一列（#77 首差 (2761,95)
 *    T0>186/T186>0 对称位移族根因）；
 *  ② 锚定 = SolidTile2（cs:70178：active && 生成期 tileSolid && slope==0 && !half
 *    && !inActive）+ InvalidTileForPilesOrSpeleothems（cs:52149：186/187 底座
 *    Boulders 拒）——曾用 SolidTileAllowBottomSlope（那是 Check3x2 的复核谓词，
 *    放宽了底坡/平台，错源=把 cs:49284/49300 误当放置门）；
 *  ③ Check3x2 样式族门复核（OOOO 批重写击杀链，探针实证 5339/5339 击杀格 type=0）。
 *  ★RRRR 批（2026-08-19）：本域窄分派（仅 186/187 Check3x2）退役，统一走
 *  FinalCleanupPass 的 genSquareTileFrame 全分派引擎（TileFrameImportant 全族 +
 *  KillTile 尘掷表 + Check3x2 掉落掷/5×5 扫 + GenSolid 实心）——杀 187 邻堆链与
 *  邻近装饰帧杀（罐 28/钟乳 165/倒木 485/门 10/祭坛 26/135，OOOO 探针普查）同源。
 *  放置成败皆跑 case 分支尾帧（cs:60026 无条件）；成功尾帧（cs:60279 `tile.active()`
 *  → cs:60285）以锚格 active 判（dropTo 落点恒非活，即放置成功）。 */
function placePile3x2(st: TileStore, rng: RNG, x: number, y: number, type: number, style: number): boolean {
  (globalThis as { __swPilesCap?: (x: number, y: number, t: number, s: number, z: number, k: number) => void }).__swPilesCap?.(x, y, SHEET[type] ?? -1, style, 0, 0);
  // PlaceTile 前置清（cs:59497-59500：目标 inactive → Clear(Tile|Paint|Slope)——type/帧
  // 归零、半砖/坡/油漆清）——在 case 门**之前**，放置失败也清（锚格残值 type 被抹，
  // 上游 rawSheetAt 命中判定随之失败 → 该 attempt 不算命中）。★OOOO 实证：首差
  // eff (3007,646) i0 vs i1 = 此清缺失
  if (st.inBounds(x, y)) {
    const ti = st.idx(x, y);
    if (!st.flags[ti]) {
      st.type[ti] = 0; st.frameX[ti] = 0; st.frameY[ti] = 0;
      st.half[ti] = 0; st.slope[ti] = 0; st.paint[ti] = 0;
      // ★IIIII229（⑪ copy-sweep B5）：补 coat 方块侧两位（Clear(131) TilePaint 支的
      //   ClearBlockPaintAndCoating;本地六通道镜像缺⑦,与 SurfaceDecor :2935 同病同治）。
      st.coat[ti] &= ~TileStore.COAT_BLOCK_MASK;
    }
  }
  if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return false;   // cs:52102 边距门
  // ★OOOO：vanilla 的 type 比较全在 sheet 空间（186/187），本函数形参 type 是内部 id
  //  （PILE186=150/PILE187=145）——曾直接 `type === 186/187` 恒假，InvalidTile 门与
  //  Check3x2 样式族击杀链整段死代码（#77 残 1227/1270 主根因；首例 = 沙漠化石 404
  //  地基 187-style32，vanilla Check3x2 沙族不含 404 → 击杀，JS 保留）
  const sheet = SHEET[type] ?? -1;
  const isPile = sheet === 186 || sheet === 187;
  let ok = true;
  for (let c = x - 1; c <= x + 1; c++) {
    for (let r = y - 1; r <= y; r++) {
      const i = st.idx(c, r);
      if (st.flags[i]) ok = false;                        // 占用净空（cs:52117）
    }
    if (isPile && invalidPiles(st, c, y + 1)) ok = false; // cs:52141+52149
    if (!solidTile2(st, c, y + 1)) ok = false;            // cs:52156
  }
  const base = style * 54;
  if (ok) {
    for (let c = x - 1; c <= x + 1; c++) {
      for (let r = y - 1; r <= y; r++) {
        const i = st.idx(c, r);
        st.type[i] = type; st.flags[i] = 1;
        st.frameX[i] = base + (c - (x - 1)) * 18;
        st.frameY[i] = r === y - 1 ? 0 : 18;
        // 原版 Place3x2 只写 active/frameX/frameY/type（cs:52200-52234）——不清坡/半砖/液体
      }
    }
  }
  // case 分支尾帧（cs:60026）：Place3x2 void——放置失败也跑；3×3 TileFrame 头清 +
  // 中心 Check3x2（自击杀/邻堆连杀）+ 邻域各族帧杀
  genSquareTileFrame(st, rng, x, y);
  pilesSupplementAfterSquareFrame(st, rng, x, y);      // ★IIII31：654 族补派发
  // 成功尾帧（cs:60279-60285）：锚格 active（=放置成功）再跑一次
  if (st.flags[st.idx(x, y)]) {
    genSquareTileFrame(st, rng, x, y);
    pilesSupplementAfterSquareFrame(st, rng, x, y);    // ★IIII31
  }
  return ok;
}

// ============================================================
// ★IIII31（2026-08-28）：Check2x2 补臂——case 654 派发缺口（notraps #77）
// vanilla TileFrameImportant 深层默认链：type∈{172,360,505-527,543,568-570,580,
// 598,620,652,**654**,713-716,751,752} 落空支 break（cs:86945-86972）后经外层
// `goto case 132`（cs:87208）并入 cs:87209-87226 的 Check2x2 调用列——即 654 与
// 132/138/142/143/288-295/484/664/665/711/712 同走 Check2x2（巨石族走 Boulders 支，
// 其余走非巨石通用支）。FinalCleanupPass 引擎此前只派发 {138,411,484,752,751}
// （CCCCC/VVVVV/YYYYY 批"生成期在场成员均为零掷族，未实证不派发"备案）——
// notraps #77 卡面正是该备案债现形：三对 TNT 桶（654）坐于巨石叠支之上，
// Piles 头 SetBoulderSolidity(false)（cs:18937,noTraps 支）令下层 138 系失去
//   Main.tileSolid → 654 走非巨石逐列地面门 cs:48460-71 判失 → destroyObject 整组杀；
//   正下方第二块 138 叠层由桶死的 KillTile 尾九宫帧（cs:49245-56）触发 Check2x2
//   Boulders 支（cs:48473-90：底两格 SolidTileAllowBottomSlope 读翻转后 LUT）
//   死亡 —— x86 077_Piles dump 实证 T654->E×3 组 + T138->E×32（其中恰一块
//   (2280,634)/(2281,635) 只经由桶死级联被帧到，故 J 侧缺失发派时整层存活）。
 //
// 触发面等价性论证（本文件域内补臂合法性）：① 本族谓词在 Piles 槽内为静态
//   （tileSolid 翻转集于槽头 cs:18906-18941 定态，尾 cs:19591-19620 才还原；
//    成败只依赖当下 flags/type/LUT/组完整性）；② 五链 x86 dump 扫描（见批章
//   IIIII31）：{654 预存在格 ∪ 巨石叠支死亡格} 仅 notraps 链非零，
//   const/s22222/m/ntb/g 五链恒零（noTraps=false 时巨石实心期无叠支失效面；
//   654 仅 traps 有旗世界产出 cs:8852）⇒ 全局单次求值 ≡ 原版帧事件可达集；
// ③ 族内尘掷全零（killTileDustAmount cs:66654：654/138/484 等→0）⇒ RNG 流位
//   无移。引擎对已派发成员（138/484 等）的帧杀语义与本臂全同（同源自
//   cs:48405-48807），重复求值幂等。
 // ============================================================

/** TileID.Sets.Boulders（本地副本，与上方 BOULDERS 同集——补臂独立可读性） */
// ★BJ182b 收编单源 data/tiles.ts:BOULDERS_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const SUP_BOULDERS = BOULDERS_SHEETS;
/** 本臂受理族 = **SetBoulderSolidity 翻转列（138/484/664/711-716）∪ {654}**。
 *  失效面恰由翻转列失去 Main.tileSolid 而生；654 坐于其上走非巨石支。665 不在
 *  翻转列（cs:11036 无此 id）恒实心、失效面空；其余 case132 列/exotic 成员
 *  （132/142/143/288-295/172/360/…/411/751/752）尘掷非零或不涉翻转面，
 *  未实证不纳入（守引擎"未派发备案"口径）。受理族全部落在
 *  killTileDustAmount 零档（cs:66654 fail=false：654/138/484/664/≥711≤716）⇒ 补臂零掷。 */
const SUP_CHECK2X2_FAMILY = new Set([654, 138, 484, 664, 711, 712, 713, 714, 715, 716]);
/** Check2x2 上方箱族豁免（cs:48483-85） */
const SUP_CHEST_2X2 = new Set([21, 467, 441, 468, 88, 470, 475]);
/** Main.tileTable（cs:48463 通用支地面门 ∪ 集；FinalCleanupPass TILE_TABLE 同源副本） */
// ★BJ182b 收编单源 data/tiles.ts:TILE_TABLE_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const SUP_TILE_TABLE = TILE_TABLE_SHEETS;
/** 平台族（TileID.Sets.Platforms 引擎同款） */
// ★BJ182b 收编单源 data/tiles.ts:PLATFORMS_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const SUP_PLATFORMS = PLATFORMS_SHEETS;

/** SolidTileAllowBottomSlope（cs:70211-70235）副本——bs 步进已在调用侧处理。 */
const supSolidAllowBottom = (st: TileStore, x: number, y: number): boolean => {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  if (!st.flags[i] || (st.wire[i]! & 32)) return false;
  const ti = st.type[i];
  const d = TILE_DEFS[ti];
  if (!d || !(genSolidType(ti) || d.platform)) return false;
  const sl = st.slope[i];
  const sh = SHEET[ti] ?? -1;
  const topSlope = sl === 1 || sl === 2;
  if (topSlope && !(SUP_PLATFORMS.has(sh) && ((): boolean => {
    const n = Math.floor((st.frameX[i] ?? 0) / 18);
    return (n >= 0 && n <= 7) || (n >= 12 && n <= 16) || (n >= 25 && n <= 26);
  })())) return false;
  return !st.half[i];
};

/** 单格组评估（镜像 FinalCleanupPass.check2x2Sweep 内核，cs:48405-48807）：
 *  返回该 2×2 组是否判死；判死则 destroyObject 循环 genKillTile 整组 +
 *  尾 4×4 RangeFrame（cs:48801-07，genRangeFrame 导出复用）。返回实际杀数。 */
function supCheck2x2Group(st: TileStore, rng: RNG, x: number, y: number): number {
  const i0 = st.idx(x, y);
  let num2 = -Math.trunc(st.frameX[i0]! / 18);
  let num = 0;
  if (num2 < -1) { num2 += 2; num = 36; }
  num2 += x;
  let num4 = st.frameY[i0]!;
  let num5 = 0;
  while (num4 >= 36) { num4 -= 36; num5++; }
  const num6 = y - Math.trunc(num4 / 18);
  const sheet = SHEET[st.type[i0]] ?? -1;
  const isBoulder = SUP_BOULDERS.has(sheet);
  const inW = (k: number, l: number): boolean => k >= 0 && l >= 0 && k < st.w && l < st.h;
  let flag = false;
  for (let k = num2; k < num2 + 2; k++) {
    for (let l = num6; l < num6 + 2; l++) {
      if (!inW(k, l)) { flag = true; break; }
      const q = st.idx(k, l);
      if (!st.flags[q] || (SHEET[st.type[q]] ?? -1) !== sheet
        || st.frameX[q] !== (k - num2) * 18 + num
        || st.frameY[q] !== (l - num6) * 18 + num5 * 36) { flag = true; break; }
    }
    if (flag) break;
    // 非巨石通用支（cs:48460-71）：654 走此——逐列 (k,num6+2) 地面门
    if (!isBoulder) {
      if (!inW(k, num6 + 2)) { flag = true; }
      else {
        const gi = st.idx(k, num6 + 2);
        const gt = st.type[gi];
        if (!st.flags[gi] || !(genSolidType(gt) || SUP_TILE_TABLE.has(SHEET[gt] ?? -1))) flag = true;
        if (st.half[gi]) flag = true;
      }
    }
  }
  if (!flag && isBoulder) {
    // cs:48473-90：上两格箱族豁免（裸 type 读不查 active）+ 底两格 AllowBottomSlope 联合门
    const chestAbove = (cx: number, cy: number): boolean =>
      inW(cx, cy) && SUP_CHEST_2X2.has(SHEET[st.type[st.idx(cx, cy)]] ?? -1);
    if (!chestAbove(num2, num6 - 1) && !chestAbove(num2 + 1, num6 - 1)
      && !supSolidAllowBottom(st, num2, num6 + 2)
      && !supSolidAllowBottom(st, num2 + 1, num6 + 2)) flag = true;
  }
  if (!flag) return 0;
  let killed = 0;
  for (let k = num2; k < num2 + 2; k++) {
    for (let l = num6; l < num6 + 2; l++) {
      if (!inW(k, l)) continue;
      const q = st.idx(k, l);
      if (st.flags[q] && (SHEET[st.type[q]] ?? -1) === sheet) { genKillTile(st, rng, k, l); killed++; }
    }
  }
  if (killed > 0) genRangeFrame(st, rng, num2 - 1, num6 - 1, num2 + 2, num6 + 2);   // cs:48800-07
  return killed;
}

/** Piles 域内帧事件补臂（IIII31）：对一次 genSquareTileFrame(cx,cy) 扫过的九宫，
 *  补做引擎未派发成员（654 等，见 SUP_CHECK2X2_FAMILY 注）的 TileFrameImportant
 *  分派等价物——原版在每次 TileFrame 访问时按 type 路由进 Check2x2；引擎跳过
 *  该族后此处以同谓词重放。仅受理组锚首次命中（单事件内去重）。 */
function pilesSupplementAfterSquareFrame(st: TileStore, rng: RNG, cx: number, cy: number): void {
  const seen = new Set<number>();
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const px = cx + dx, py = cy + dy;
      if (!st.inBounds(px, py)) continue;
      const i = st.idx(px, py);
      if (!st.flags[i]) continue;
      const sh = SHEET[st.type[i]] ?? -1;
      if (!SUP_CHECK2X2_FAMILY.has(sh)) continue;
      let num2 = -Math.trunc(st.frameX[i]! / 18);
      if (num2 < -1) num2 += 2;
      const ax = px + num2;
      let fy = st.frameY[i]!;
      while (fy >= 36) fy -= 36;
      const ay = py - Math.trunc(fy / 18);
      const key = ay < 0 || ax < 0 ? -1 : ay * st.w + ax;
      if (key >= 0 && seen.has(key)) continue;
      if (ax <= 5 || ay <= 5 || ax >= st.w - 5 || ay >= st.h - 5) continue;
      if (key >= 0) seen.add(key);
      supCheck2x2Group(st, rng, ax, ay);
    }
  }
}

/** WorldGen.Place2x2（cs:51780）Piles 语境副本（同源副本禁 import 惯例；与
 *  MicroBiomesPass.place2x2Direct / TrapsPass.place2x2Traps 同构）。 */
// ★BJ182b 收编单源 data/tiles.ts:TILE_TABLE_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const PILES_PLACE2X2_TABLE = TILE_TABLE_SHEETS;
function place2x2Piles(st: TileStore, x: number, y: number, type: number): boolean {
  if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return false;
  // ★PlaceTile 头（cs:59494+59500）：138/711 实心 → 头门=EmptyTile(锚)（生成期
  //   ≡!active，玩家/NPC 域空）；过门后 inactive 锚 Clear(Tile|TilePaint|Slope)
  //   （ghost type/帧/坡/半砖/块漆清零——Place2x2 后续拒绝也保留此清）
  if (st.flags[st.idx(x, y)]) return false;
  // ★IIIII229（⑪ copy-sweep B3）：setTileSilent(0) 多清 wire inActive 位——收编共享
  //   helper（Clear(131) 全语义,保留 inActive;与 TrapsPass.place2x2Traps 同批同治）。
  placeTilePrologueClear(st, x, y);
  for (let i = x - 1; i <= x; i++) {
    for (let j = y - 1; j <= y; j++) {
      if (st.flags[st.idx(i, j)]) return false;
    }
    const gi = st.idx(i, y + 1);
    const gt = st.type[gi]!;
    const solid2 = st.flags[gi] !== 0 && vanGenSolidType(gt)
      && st.slope[gi] === 0 && st.half[gi] === 0
      && ((st.wire[gi] >>> 5) & 1) === 0;
    if (!st.flags[gi] || (!solid2 && !PILES_PLACE2X2_TABLE.has(SHEET[gt]))) return false;
  }
  for (let k = x - 1; k <= x; k++) {
    for (let l = y - 1; l <= y; l++) {
      st.setTileSilent(k, l, type, (k - x + 1) * 18, (l - y + 1) * 18);
    }
  }
  return true;
}

/** ★IIIII192：WorldGen.PlaceTile(i, j, 138|711, mute:true) 生成期全语义
 *  （1457 cs:59833≡1458 同号——巨石臂 cs:18160/18179/18189 三连的完整载体）。
 *  place2x2Piles 只覆盖了头门+锚 Clear(Tile|TilePaint|Slope)（cs:59966-59969）
 *  与 Place2x2 分派（cs:60232→51780）；**尾支整缺**——cs:60746-60753
 *  `if (tile.active()) { TruncatesWalls?SquareWallFrame; SquareTileFrame(i, j); result = true; }`
 *  与 if/else 链【同级】（花括号深度定谳：链体 depth4/尾支 depth3 同在门块内），
 *  对 Place2x2 支同样生效 ⇒ 两债：
 *  ①SquareTileFrame(i,j)（cs:81462）九宫 TileFrame（中心 resetFrame=true）——
 *    frameImportant Check* 击杀链（残型 484 滚刺/165 钟乳石邻簇被杀=iamerror #71
 *    T0>484×3+T0>165×1 实证）+击杀尘掷流；
 *  ②result=true ⇒ errorWorld invisibleBlock 三连（cs:18165-18197）**可达**
 *    （旧结论「Place2x2 支不置 result=死代码」系误读）：Placement 成功且级联后
 *    锚 type==num4 → 本格 2×2=(x-1..x, y-1..y) 全簇 coat|=INV_B（Tile.cs:535-542
 *    bTileHeader3 |= 0x20 ↔ TileStore.COAT_INVISIBLE_BLOCK，cbt 位包 INV_B 通道）。
 *  mute:true 无声零掷；TruncatesWalls[138/711]=false（TileID.cs:365 集合{54,328,459,748}）。
 *  返回值=PlaceTile 返回（Place2x2 写入成功即真——尾支 result 无条件置位）。 */
function placeTileBoulder(st: TileStore, rng: RNG, x: number, y: number, type: number, errorWorld: boolean): boolean {
  if (!place2x2Piles(st, x, y, type)) return false;
  genSquareTileFrame(st, rng, x, y);   // cs:60752 尾支九宫级联（尘掷/击杀流同源）
  if (errorWorld && st.type[st.idx(x, y)] === type) {
    for (let k = x - 1; k <= x; k++) {
      for (let l = y - 1; l <= y; l++) {
        st.coat[st.idx(k, l)] |= TileStore.COAT_INVISIBLE_BLOCK;   // invisibleBlock(true)
      }
    }
  }
  return true;
}

/** ★SSSSSS-NOTRAPS（cs:18921-18190→1457 cs:18135-18204）：noTraps/errorWorld 巨石
 *  三角堆——W*H*0.0004 次（remix ÷2）：全域掷点下扫首个活性格上一格，anyShimmer 拒，
 *  三连 PlaceTile(138)（tenth 1/5 用 711）= (x,y)/(x+2,y)/(x+1,y-2) 三角。段首
 *  SetBoulderSolidity(true)（巨石须实心才过 Place2x2 地面门）+ 段尾 false。
 *  ★QQQQQQQQ（2026-08-27）位次勘误：1457 该段真身在 **PotsGraveyardsAndBoulderPiles
 *  pass 内**（cs:18135-18204，teleporters/墓园段之后、瓦罐主循环之前）——Piles pass
 *  只有头置非实心（cs:18936-18941）。旧实现错挂 PilesPass 头 → notraps 链 #71 起全流
 *  位漂移（pots/boulder 族 T28/T138 双向 ~15k 格）。现整体迁回 potPass 调用点
 *  （WorldGen.potPass），执行序=原版注册序；本文件仅存留 Piles 头翻非实心一行。 */
export function runBoulderPileSection(st: TileStore, rng: RNG, gs: GenState): void {
  const nf = gs.seedFlags;
  if (!(nf.noTraps || nf.errorWorld) || nf.actuallyNoTraps) return;
  const { w, h } = st;
  const ws = Math.floor(gs.worldSurface);
  const b138 = TILE_BY_KEY['v_138_boulder']!;
  const b711 = TILE_BY_KEY['v_711_rainbow_boulder']!;
  setBoulderSolidity(true);
  const tries = Math.trunc(w * h * 0.0004);
  const count = nf.remix ? Math.trunc(tries / 2) : tries;
  for (let i = 0; i < count; i++) {
    let x = rng.int(50, w - 51);                                      // Next(50, w-50)
    let y = rng.int(ws, h - 251);                                     // Next(ws, h-250)
    if (nf.theConstant && !nf.remix && i < Math.trunc(count / 10)) {
      y = rng.int(100, h - 251);                                      // Next(100, h-250)
      while (x > w * 0.4 && x < w * 0.6) x = rng.int(50, w - 51);     // 侧域重掷
    }
    let j = y;
    for (; !st.flags[st.idx(x, j)] && j < h - 250; j++) { /* 下扫 */ }
    j--;
    const ji = st.idx(x, j);
    if (st.liquid[ji] > 0 && st.liquidType[ji] === 4) continue;       // anyShimmer 拒
    let boulder = b138;
    if (nf.tenthAnniversary && rng.int(0, 4) === 0) boulder = b711;   // tenth 1/5 彩虹巨石
    // ★IIIII192：place2x2Piles → placeTileBoulder——PlaceTile 全语义（尾支
    //   SquareTileFrame 九宫级联 + result/errorWorld invisibleBlock 三连），见下注。
    const ew = nf.errorWorld === true;
    placeTileBoulder(st, rng, x, j, boulder, ew);          // cs:18160  (num3,   j)
    placeTileBoulder(st, rng, x + 2, j, boulder, ew);      // cs:18179  (num3+2, j)
    placeTileBoulder(st, rng, x + 1, j - 2, boulder, ew);  // cs:18189  (num3+1, j-2)
  }
  setBoulderSolidity(false);
}

/** Piles pass 主体（cs:18900-19599） */
export function runPilesPass(st: TileStore, rng: RNG, gs: GenState): void {
  // ★pass 头 tileSolid 翻转（cs:18906-18916,逐条 1:1）：379/229/190/196/189/
  //   717/718/719/202/460/484 全部置非实心——原 PASS_NON_SOLID 局部表迁移至此。
  flipGenSolid([379, 229, 190, 196, 189, 717, 718, 719, 202, 460, 484], false);
  // ★QQQQQQQQ 补挂（cs:18936-18941）：noTraps → SetBoulderSolidity(false)——
  //   Traps 尾回实心的还原窗到此结束（巨石三角段本体在 Pots pass，见
  //   WorldGen.potPass 调用点勘误注）。
  if (gs.seedFlags.noTraps) setBoulderSolidity(false);
  const w = st.w, h = st.h;
  const ws = Math.floor(gs.worldSurface);
  /** GetPileGenerationAttempts（cs:23873）：w/2（skyblock ÷10 分支不触发） */
  const attempts = (): number => Math.floor(w / 2);
  /** oceanDepths（cs:10979）：y > oceanLevel=(ws+rl)/2+40 直接 false */
  const ocean = (x: number, y: number): boolean => {
    if (y > (gs.worldSurface + gs.rockLevel) / 2 + 40) return false;
    return x < gs.beachDistance || x > w - gs.beachDistance;
  };
  const shimmerAt = (x: number, y: number): boolean => {
    const i = st.idx(x, y);
    return st.liquid[i] > 0 && st.liquidType[i] === 4;
  };
  /** 原版空 for 下落：到 (x,y+1) 变 active 为止（上界 h-5） */
  const dropTo = (x: number, y: number): number => {
    let j = y;
    let __n = 0;
    while (!st.flags[st.idx(x, j + 1)] && j < h - 5) { j++; if (++__n % 300 === 0) console.log(`[dropTo] x=${x} j=${j} n=${__n}`); }
    return j;
  };
  /** 小堆 scatter（cs:18996-19010 同型四处）：Next(1,5)×Next(-10,11)×Next(5)×Next(12,36) */
  const scatter = (x: number, y: number): void => {
    const n = rng.int(1, 4);
    for (let k = 0; k < n; k++) {
      const sx = x + rng.int(-10, 10);
      const sy0 = y - rng.int(0, 4);
      if (!st.flags[st.idx(sx, sy0)]) {
        const sy = dropTo(sx, sy0);
        placeSmallPile(st, sx, sy, rng.int(12, 35), 0);
      }
    }
  };
  const pick = (type: number): number => (type === 186 ? PILE186 : PILE187);

  // ===== ① 洞穴堆（cs:18924-19044）：w*0.06 =====
  console.log('[piles] seg1 begin');
  {
    const total = w * 0.06;
    for (let i = 0; i < total; i++) {
      let budget = attempts();
      let flag = false;
      while (!flag && budget > 0) {
        budget--;
        let x = rng.int(25, w - 26);          // Next(25, w-25)
        let y = rng.int(ws, h - 301);         // Next((int)worldSurface, h-300)
        // ★IIIII159 OT 钩（oceanDepths 入口镜像,无钩零开销）
        (globalThis as { __swI159OT?: (x: number, y: number) => void }).__swI159OT?.(x, y);
        while (ocean(x, y)) {
          x = rng.int(25, w - 26); y = rng.int(ws, h - 301);
          (globalThis as { __swI159OT?: (x: number, y: number) => void }).__swI159OT?.(x, y);
        }
        if (!st.flags[st.idx(x, y)]) {
          let type = 186;
          y = dropTo(x, y);
          const wall = st.wall[st.idx(x, y)];
          const below = sheetAt(st, x, y + 1);
          // ★IIIII108c 一次性仪（env 门,缺省零开销）：segment① attempt 级追踪
          (globalThis as { __swI148Att?: (x: number, y: number, bl: number, wl: number) => void }).__swI148Att?.(x, y, below, wall);
          if (below >= 0) {
            let style = rng.int(0, 21);       // Next(22)
            if (style >= 16 && style <= 22) style = rng.int(0, 21);
            if ((below === 0 || below === 1 || TILE_MOSS.has(below)) && rng.int(0, 4) === 0) {
              style = rng.int(23, 28);        // Next(23,29)
              type = 187;
            }
            if (y > h - 300 || WALL_DUNGEON.has(wall) || below === 30 || below === 19 || below === 25 || below === 203) {
              style = rng.int(0, 6);          // Next(7)
              type = 186;
            }
            if (below === 147 || below === 161 || below === 162) { style = rng.int(26, 31); type = 186; }
            if (below === 60) { type = 187; style = rng.int(0, 5); }
            if ((below === 57 || below === 58) && rng.int(0, 2) < 2) { type = 187; style = rng.int(6, 8); }
            if (below === 226) { type = 187; style = rng.int(18, 22); }
            if (below === 70) { style = rng.int(32, 34); type = 186; }
            if (below === 396 || below === 397 || below === 404) { style = rng.int(29, 34); type = 187; }
            if (below === 368) { style = rng.int(35, 40); type = 187; }
            if (below === 367) { style = rng.int(41, 46); type = 187; }
            if (type === 186 && style >= 7 && style <= 15 && rng.int(0, 74) === 0) { type = 187; style = 17; }
            if (WALL_DUNGEON.has(wall) && rng.int(0, 2) !== 0) {
              flag = true;                    // 地牢墙 2/3 直接视为命中
            } else {
              // ★IIIII159：ok 捕获仅仪用（返回值原版 void 等价,行为零变）
              const okP = !shimmerAt(x, y) ? placePile3x2(st, rng, x, y, pick(type), style) : false;
              // ★IIIII159 attempt 级裁决钩（无钩零开销）：seg/m/budget/ok/残值/flag
              (globalThis as { __swI159Ver?: (seg: number, m: number, budget: number, x: number, y: number, t: number, s: number, ok: boolean, raw: number, flag: boolean, wall: number, below: number) => void }).__swI159Ver?.(1, i, budget, x, y, SHEET[type] ?? -1, style, okP, rawSheetAt(st, x, y), flag, wall, below);
              // cs:18989：残值 type==186||187 即命中（shimmer 拒置后残值同样可命中）
              if (rawSheetAt(st, x, y) === 186 || rawSheetAt(st, x, y) === 187) flag = true;
              if (flag && type === 186 && style <= 7) scatter(x, y);
            }
          }
        }
      }
    }
  }

  // ===== ② 深层堆（cs:19049-19116）：w*0.01，y∈[h-300,h-10) =====
  console.log('[piles] seg2 begin');
  {
    const total = w * 0.01;
    for (let i = 0; i < total; i++) {
      let budget = attempts();
      let flag = false;
      while (!flag && budget > 0) {
        budget--;
        const x = rng.int(25, w - 26);
        let y = rng.int(h - 300, h - 11);     // Next(h-300, h-10)
        if (!st.flags[st.idx(x, y)]) {
          let type = 186;
          y = dropTo(x, y);
          const wall = st.wall[st.idx(x, y)];
          const below = sheetAt(st, x, y + 1);
          if (below >= 0) {
            let style = rng.int(0, 21);
            if (style >= 16 && style <= 22) style = rng.int(0, 21);
            if (y > h - 300 || WALL_DUNGEON.has(wall) || below === 30 || below === 19) style = rng.int(0, 6);
            if ((below === 57 || below === 58) && rng.int(0, 2) < 2) { type = 187; style = rng.int(6, 8); }
            if (below === 147 || below === 161 || below === 162) style = rng.int(26, 31);
            const okP2 = placePile3x2(st, rng, x, y, pick(type), style);   // ★IIIII159 ok 捕获仅仪用
            (globalThis as { __swI159Ver?: (seg: number, m: number, budget: number, x: number, y: number, t: number, s: number, ok: boolean, raw: number, flag: boolean, wall: number, below: number) => void }).__swI159Ver?.(2, i, budget, x, y, SHEET[type] ?? -1, style, okP2, rawSheetAt(st, x, y), flag, wall, below);
            if (rawSheetAt(st, x, y) === 186 || rawSheetAt(st, x, y) === 187) flag = true;  // cs:19103
            if (flag && type === 186 && style <= 7) scatter(x, y);
          }
        }
      }
    }
  }

  // ===== ③ 地表堆（cs:19118-19182）：w*0.03 =====
  console.log('[piles] seg3 begin');
  {
    const total = w * 0.03;
    for (let i = 0; i < total; i++) {
      let budget = attempts();
      let flag = false;
      while (!flag && budget > 0) {
        budget--;
        let type = 186;
        let x = rng.int(25, w - 26);
        let y = rng.int(10, ws - 1);          // Next(10, (int)worldSurface)
        while (ocean(x, y)) { x = rng.int(25, w - 26); y = rng.int(10, ws - 1); }
        if (!st.flags[st.idx(x, y)]) {
          y = dropTo(x, y);
          const wall = st.wall[st.idx(x, y)];
          const below = sheetAt(st, x, y + 1);
          if (below >= 0) {
            let style = rng.int(7, 12);       // Next(7,13)
            if (y > h - 300 || WALL_DUNGEON.has(wall) || below === 30 || below === 19
              || below === 25 || below === 204 || below === 234 || below === 112
              || TILE_DUNGEON.has(below)) style = -1;
            if (below === 147 || below === 161 || below === 162) style = rng.int(26, 31);
            if (below === 53) { type = 187; style = rng.int(52, 54); }
            if (below === 2 || (activeAt(st, x - 1, y + 1) && sheetAt(st, x - 1, y + 1) === 2)
              || (activeAt(st, x + 1, y + 1) && sheetAt(st, x + 1, y + 1) === 2)) { type = 187; style = rng.int(14, 16); }
            if (below === 151 || below === 274) { type = 186; style = rng.int(0, 6); }
            if (style >= 0) placePile3x2(st, rng, x, y, pick(type), style);
            if (rawSheetAt(st, x, y) === type) flag = true;   // cs:19177：残值 type == num23
          }
        }
      }
    }
  }

  // ===== ④ 地表带墙堆（cs:19184-19259）：w*0.0035，起始格须有墙 =====
  console.log('[piles] seg4 begin');
  {
    const total = w * 0.0035;
    for (let i = 0; i < total; i++) {
      let budget = attempts();
      let flag = false;
      while (!flag && budget > 0) {
        budget--;
        let type = 186;
        const x = rng.int(25, w - 26);
        let y = rng.int(10, ws - 1);
        if (!st.flags[st.idx(x, y)] && st.wall[st.idx(x, y)] > 0) {
          y = dropTo(x, y);
          const wall = st.wall[st.idx(x, y)];
          const below = sheetAt(st, x, y + 1);
          if (below >= 0) {
            let style = rng.int(7, 12);
            if (y > h - 300 || WALL_DUNGEON.has(wall) || below === 30 || below === 19
              || TILE_DUNGEON.has(below)) style = -1;
            if (below === 25) style = rng.int(0, 6);
            if (below === 147 || below === 161 || below === 162) style = rng.int(26, 31);
            if (below === 2 || (activeAt(st, x - 1, y + 1) && sheetAt(st, x - 1, y + 1) === 2)
              || (activeAt(st, x + 1, y + 1) && sheetAt(st, x + 1, y + 1) === 2)) { type = 187; style = rng.int(14, 16); }
            if (below === 151 || below === 274) { type = 186; style = rng.int(0, 6); }
            if (style >= 0) placePile3x2(st, rng, x, y, pick(type), style);
            if (rawSheetAt(st, x, y) === type) flag = true;   // cs:19254
            if (flag && style <= 7) scatter(x, y);
          }
        }
      }
    }
  }

  // ===== ⑤ 全洞穴 185 小堆（cs:19261-19409）：w*0.6 =====
  console.log('[piles] seg5 begin');
  {
    // ★SSSS 仲裁终案（2026-08-19）：⑤ 段迭代数 = **2520**。织入 GPA 头计数实测
    // Piles 全程 3669 次 = 252(×0.06f)+42(×0.01f)+126(×0.03f)+15(×0.0035f)+
    // **2520(×0.6f)**+84(×0.02f)+630(×0.15f)——七段算术和与实测精确相等，IL 读数
    // 正确。RRRR 谷值 2519 系 SolidTile2 平台坡面豁免缺失（见 solidTile2 注）的
    // 补偿假象——残 2 格正是 (3384,854)/(212,922) 两顶坡平台锚。
    // ★YYYYY（2026-08-20）：迭代数改 float32 语义（cs:19260 `num3=(float)w*0.6f`
    // + cs:19261 `(float)num38 < num3`）——Math.ceil(double) 在 w=4200 偶然同值，
    // w=6400 时 fround(6400×0.6f)=3840.0002441 → vanilla 3841 迭代 vs JS 3840
    // （m #77 残 17 根因：⑤ 少 16 attempt 起手=掷流 251,225 处分叉，段⑥全漂）。
    const total = Math.ceil(Math.fround(w * Math.fround(0.6)));
    for (let i = 0; i < total; i++) {
      let budget = attempts();
      let flag = false;
      while (!flag && budget > 0) {
        budget--;
        let x = rng.int(25, w - 26);
        let y = rng.int(ws, h - 21);          // Next((int)worldSurface, h-20)
        if (st.wall[st.idx(x, y)] === 87 && rng.int(0, 1) === 0) {
          x = rng.int(25, w - 26);            // 神庙墙 1/2 重掷
          y = rng.int(ws, h - 21);
        }
        while (ocean(x, y)) { x = rng.int(25, w - 26); y = rng.int(ws, h - 21); }
        if (!st.flags[st.idx(x, y)]) {
          y = dropTo(x, y);
          const wall = st.wall[st.idx(x, y)];
          const below = sheetAt(st, x, y + 1);
          if (below >= 0) {
            const size = rng.int(0, 1);       // Next(2)：0=大 1=小
            let style = rng.int(0, 35);       // Next(36)
            if (style >= 28 && style <= 35) style = rng.int(0, 35);
            if (size === 1) {
              style = rng.int(0, 24);         // Next(25)
              if (style >= 16 && style <= 24) style = rng.int(0, 24);
            }
            if (y > h - 300) {
              if (size === 0) style = rng.int(12, 27);   // Next(12,28)
              if (size === 1) style = rng.int(6, 15);    // Next(6,16)
            }
            if (WALL_DUNGEON.has(wall) || wall === 87 || below === 30 || below === 19 || below === 25 || below === 203) {
              if (size === 0 && style < 12) style += 12;
              if (size === 1 && style < 6) style += 6;
              if (size === 1 && style >= 17) style -= 10;
            }
            if (below === 147 || below === 161 || below === 162) {
              if (size === 0 && style < 12) style += 36;
              if (size === 1 && style >= 20) style += 6;
              if (size === 1 && style < 6) style += 25;
            }
            if (st.liquid[st.idx(x, y)] <= 0 && (below === 53 || below === 397 || below === 396)) {
              if (size === 0) style = rng.int(73, 77);   // Next(73,78)
              if (size === 1) style = rng.int(62, 64);   // Next(62,65)
            }
            if (below === 151 || below === 274) {
              if (size === 0) style = rng.int(12, 27);
              if (size === 1) style = rng.int(12, 18);   // Next(12,19)
            }
            if (below === 368) {
              if (size === 0) style = rng.int(60, 65);   // Next(60,66)
              if (size === 1) style = rng.int(47, 52);   // Next(47,53)
            }
            if (below === 367) {
              if (size === 0) style = rng.int(66, 71);   // Next(66,72)
              if (size === 1) style = rng.int(53, 58);   // Next(53,59)
            }
            if (TILE_DUNGEON.has(below)) {
              flag = false;                   // tileDungeon 族落点恒不命中
            } else if (WALL_DUNGEON.has(wall) && rng.int(0, 2) !== 0) {
              flag = true;
            } else if (!shimmerAt(x, y)) {
              flag = placeSmallPile(st, x, y, style, size);
            }
            if (flag && size === 1 && style >= 6 && style <= 15) scatter(x, y);
          }
        }
      }
    }
  }

  // ===== ⑥ 地表 185 小堆（cs:19411-19470）：w*0.02 =====
  console.log('[piles] seg6 begin');
  {
    const total = w * 0.02;
    for (let i = 0; i < total; i++) {
      let budget = attempts();
      let flag = false;
      while (!flag && budget > 0) {
        budget--;
        let x = rng.int(25, w - 26);
        let y = rng.int(15, ws - 1);          // Next(15, (int)worldSurface)
        while (ocean(x, y)) { x = rng.int(25, w - 26); y = rng.int(15, ws - 1); }
        if (!st.flags[st.idx(x, y)]) {
          y = dropTo(x, y);
          const wall = st.wall[st.idx(x, y)];
          const below = sheetAt(st, x, y + 1);
          if (below >= 0) {
            const size = rng.int(0, 1);
            let style = rng.int(0, 10);       // Next(11)
            if (size === 1) style = rng.int(0, 4);        // Next(5)
            if (below === 147 || below === 161 || below === 162) {
              if (size === 0 && style < 12) style += 36;
              if (size === 1 && style >= 20) style += 6;
              if (size === 1 && style < 6) style += 25;
            }
            if (st.liquid[st.idx(x, y)] <= 0 && (below === 53 || below === 397 || below === 396)) {
              if (size === 0) style = rng.int(73, 76);    // Next(73,77)
              if (size === 1) style = rng.int(62, 64);
            }
            if (below === 2 && size === 1) style = rng.int(38, 40);   // Next(38,41)
            if (below === 151 || below === 274) {
              if (size === 0) style = rng.int(12, 27);
              if (size === 1) style = rng.int(12, 18);
            }
            const bad = WALL_DUNGEON.has(wall) || below === 30 || below === 19 || below === 41
              || below === 43 || below === 44 || below === 481 || below === 482 || below === 483
              || below === 45 || below === 46 || below === 47 || below === 175 || below === 176
              || below === 177 || below === 25 || below === 203 || TILE_DUNGEON.has(below);
            if (!bad) flag = placeSmallPile(st, x, y, style, size);
          }
        }
      }
    }
  }

  // ===== ⑦ 地表墙 2/40 小堆（cs:19472-19566）：w*0.15 =====
  console.log('[piles] seg7 begin');
  {
    // ★YYYYY：同 ⑤ 的 float32 语义（fround(6400×0.15f)=960.0000610 → 961 迭代）
    const total = Math.ceil(Math.fround(w * Math.fround(0.15)));
    for (let i = 0; i < total; i++) {
      let budget = attempts();
      let flag = false;
      while (!flag && budget > 0) {
        budget--;
        const x = rng.int(25, w - 26);
        let y = rng.int(15, ws - 1);
        if (!st.flags[st.idx(x, y)] && (st.wall[st.idx(x, y)] === 2 || st.wall[st.idx(x, y)] === 40)) {
          y = dropTo(x, y);
          const wall = st.wall[st.idx(x, y)];
          const below = sheetAt(st, x, y + 1);
          if (below >= 0) {
            const size = rng.int(0, 1);
            let style = rng.int(0, 10);
            if (size === 1) style = rng.int(0, 4);
            if (below === 147 || below === 161 || below === 162) {
              if (size === 0 && style < 12) style += 36;
              if (size === 1 && style >= 20) style += 6;
              if (size === 1 && style < 6) style += 25;
            }
            if (st.liquid[st.idx(x, y)] <= 0 && (below === 53 || below === 397 || below === 396)) {
              if (size === 0) style = rng.int(73, 76);
              if (size === 1) style = rng.int(62, 64);
            }
            if (below === 2 && size === 1) style = rng.int(38, 40);
            if (below === 151 || below === 274) {
              if (size === 0) style = rng.int(12, 27);
              if (size === 1) style = rng.int(12, 18);
            }
            // cs:19583 门：`(liquid!=255 || type!=53 || wall!=0) && !wallDungeon && type!=30 && …`
            // ——水 255+沙 53+无墙（special）使首析取为假 → **整门为假 → 不放**。
            //  ★IIII 批勘误：曾把 special 写成"放行"（方向反了，JS 多放 T0>185 族）
            const specialFail = st.liquid[st.idx(x, y)] === 255 && below === 53 && wall === 0;
            const bad = specialFail || WALL_DUNGEON.has(wall) || below === 30 || below === 19
              || below === 41 || below === 43 || below === 44 || below === 481 || below === 482
              || below === 483 || below === 45 || below === 46 || below === 47 || below === 175
              || below === 176 || below === 177 || below === 25 || below === 203 || TILE_DUNGEON.has(below);
            if (!bad) flag = placeSmallPile(st, x, y, style, size);
          }
        }
      }
    }
  }
  // ★pass 尾 tileSolid 还原族（cs:19591-19602,逐条 1:1）：190/192/196/189/717/
  //   718/719/202/225/460/379 回实心 + SetBoulderSolidity(true)。★229 不在本列：
  //   等 BeeLarva 头（cs:21022）才回 true。旧注「巨石族生成期从未翻非实心/484 无
  //   还原点」系误判——484 自 DesertBiome 头（cs:12537）/Gems 头（cs:14766）/
  //   Altars 头（cs:15541）/SettleLiquids 尾（cs:16292）/SpreadingGrass LavaCleanup
  //   （cs:17686 条件支）多次翻 false,本尾 SetBoulderSolidity(true) 是其唯一
  //   还原点（IIIII11 批 x86 ATOMIC 探针实证 call6 时 lut=True;漏挂曾使 NTB
  //   掷流节奏 ±2/格错位 → #98 蜂巢↔泥互补翻转 T225>59×721 全族伪签名）。
  flipGenSolid([190, 192, 196, 189, 717, 718, 719, 202, 225, 460, 379], true);
  setBoulderSolidity(true);
}

