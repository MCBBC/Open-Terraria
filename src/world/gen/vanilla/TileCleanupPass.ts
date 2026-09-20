// 原版 pass "TileCleanup"(1456 WorldGen.cs:21327-21751)1:1 移植。
//
// ── 建议接入位(协调者接线用) ──
//   原版注册序 cs:21327(Traps cs:18769 之后、LihzahrdAltar cs:21753 之前);
//   我方应在 runTrapsPass 之后、蜥蜴祭坛 pass 之前调用:
//     runTileCleanupPass(store, rng, gs);
//
// 12 个子项处置(审计裁决「补」):
//   ① tileSolid[379]=false 临时覆写(1456 cs:21329/1457 cs:21704)——本 pass 全程生效,
//      ⑫ 末尾还原(1456 cs:21750/1457 cs:22128)
//   ② 全图清坡(cs:21333-21343):非 SaveSlopes 类型一律 ClearSlope
//      (= slope(0)+halfBrick(false) 双清,Tile.cs:158-163)
//   ③ 坡接半砖修复(cs:21344-21353):坡面格朝半砖格一侧 → slope=0+halfBrick
//   ④ 液体中 SlowlyDiesInWater 方块 KillTile(cs:21354-21357)
//   ⑤ 滴水石笋(cs:21358-21435):上方 15-20 格内液体≥128 / 下方 3-10 格内液体≥200,
//      概率随距离衰减;墙 86(蜂巢)强制蜂蜜滴头
//   ⑥ 墙 13/14 液体清零;墙 87 普通世界液体清零(cs:21437-21458)
//   ⑦⑧⑨⑩ 帧规范化族(cs:21461-21741:137 邻半砖清除/162/31/12/639/箱 21·467/28/26
//      祭坛族)——跳过(审计裁决:我方放置端已保证帧);其中 137 邻格半砖清除
//      (cs:21461-21475)是几何修复而非纯帧,若后续发现雕像/陷阱贴半砖异常再补
//   ⑪ 祭坛 237 正下方 232 木刺 → 226 蜥蜴砖(cs:21743-21746)
//
// SaveSlopes(TileID.cs:425-429)= Main.tileSolid ∪ NonSolidSaveSlopes
//   (TileID.cs:179:{131,351,336,340,341,342,343,344})。
// SlowlyDiesInWater(1456 TileID.cs:249)={3,20,24,27,73,201,80,110,529,530,590,595,615,637}
//   ——⚠️ 审计清单曾写「采掘物 398/399/400/401/404/235 等」,以 1456 原文为准,
//   实为草本/树苗/盆栽族(植物 3、灌木 20/24/73/201、藤壶 80 等),与采掘物无关。
//
// RNG 消费清单(顺序敏感,缺一即流偏移):
//   ⑤ 门 Next(3)!=0(仅 !active && liquid==0 格消费)→ Next(15,21)
//     → 上扫每个 liquid>=128 && !shimmer 格 Next(l-n2)(n2 从 l-2 起)
//     → (未放置)Next(3,11) → 下扫每个 liquid>=200 && !shimmer 格 Next((m-l)*3)
//     → (仍未放置)Next(4)(不论沙岩判定是否命中都消费)
import type { TileStore } from '../../TileStore';
import { LIQUID_TYPE } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS, TILE_BY_KEY, PLATFORMS_SHEETS, IS_A_TREE_TRUNK_SHEETS, SOLID_TOP_SHEETS, CONV_SANDSTONE_IDS, CONV_HARDENED_SAND_IDS } from '../../../data/tiles';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } from '../../../data/items';
import { idsByVanillaSheet } from './TileRunner';
import { flipGenSolid, genSolidType } from './GenSolid';
import { genSquareTileFrame } from './FinalCleanupPass';   // SSSS：④ KillTile 尾部级联

/** sheet(=原版 tile id)→ 内部 id;未实装时 0(空格)安全退化 */
const SHEET_TO_INTERNAL = new Map<number, number>();
for (const d of TILE_DEFS) {
  const vs = d.vanilla?.sheet;
  if (vs !== undefined && !SHEET_TO_INTERNAL.has(vs)) SHEET_TO_INTERNAL.set(vs, TILE_BY_KEY[d.key]);
}
export function sheetId(sheet: number): number {
  return SHEET_TO_INTERNAL.get(sheet) ?? 0;
}

const NON_SOLID_SAVE_SLOPES = idsByVanillaSheet(131, 351, 336, 340, 341, 342, 343, 344);
const SLOWLY_DIES_IN_WATER = idsByVanillaSheet(3, 20, 24, 27, 73, 201, 80, 110, 529, 530, 590, 595, 615, 637);
/** TileID.Sets.Conversion.Sandstone/HardenedSand(TileID.cs:34/:32)——★BJ210 收编单源
 *  data/tiles.ts:CONV_SANDSTONE_IDS/CONV_HARDENED_SAND_IDS（内部 id 域,§6i） */
const CONV_SANDSTONE = CONV_SANDSTONE_IDS;
const CONV_HARDENED_SAND = CONV_HARDENED_SAND_IDS;

const BUBBLE = sheetId(379);            // ①/⑫ tileSolid[379] 翻转对象(气泡块,已并入 GenSolid)
const DRIP_WATER = sheetId(373);
const DRIP_LAVA = sheetId(374);
const DRIP_HONEY = sheetId(375);
const DRIP_SHIMMER = sheetId(709);      // 注:两处扫描的 !shimmer() 门使 709 不可达(原版同,cs:21373/21389 死分支)
const SAND_PILE = sheetId(461);         // 沙岩/硬沙正下方 1/4 概率的小沙堆
const LIHZARD_ALTAR = sheetId(237);
const WOODEN_SPIKE = sheetId(232);
const LIHZARD_BRICK = sheetId(226);
const BEE_WALL = 86;                    // 蜂巢墙 → 强制蜂蜜滴头(cs:21404)

const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let q = 0; q < TILE_DEFS.length; q++) {
  const s = TILE_DEFS[q]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[q] = s;
}
/** WallID.Sets.WallTypeToTerrainTileType（WallID.cs，CreateUshortSet(0, 成对索引值)）：
 *  40→147 雪 / 71→161 冰 / 15→59 泥 / 86→225 蜂巢 / 3→25 黑檀 / 83→203 猩红 /
 *  178→367 / 180→368，缺省 0（泥土） */
const WALL2TERRAIN: Record<number, number> = {
  40: 147, 71: 161, 15: 59, 86: 225, 3: 25, 83: 203, 178: 367, 180: 368,
};
/** JS 物品 id → 原版物品 id（⑦ 箱 style 反查 Chest.item[0] 用） */
const VAN_ID_OF_JS = new Map<number, number>();
for (const [vidStr, key] of Object.entries(VANILLA_ITEM_KEY_BY_ID)) {
  const jsId = ITEM_BY_KEY[key];
  if (jsId !== undefined && !VAN_ID_OF_JS.has(jsId)) VAN_ID_OF_JS.set(jsId, Number(vidStr));
}
/** Main.tileSolidTop（⑦ 26 祭坛下方补型门）——★BJ187 收编 data/tiles.ts:
 *  SOLID_TOP_SHEETS 单源（84 项逐值全等;旧 79 项漏 Main.cs:10125-10131 循环臂
 *  435-439 队伍平台,生成期不可达=行为零差） */
const SOLID_TOP_99 = SOLID_TOP_SHEETS;
/** TileID.Sets.Platforms（TileID.cs:243） */
// ★BJ182b 收编单源 data/tiles.ts:PLATFORMS_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const PLATFORM_99 = PLATFORMS_SHEETS;
/** SaveSlopes[t] = tileSolid[t] ∪ NonSolidSaveSlopes（TileID.cs:425-429 静态构造）。
 *  ★IIII 批勘误（2026-08-18）：SaveSlopes 数组在 TileID 静态构造时**一次性**从
 *  Main.tileSolid 拷贝——之后生成期的一切 tileSolid 翻转（含本 pass 头的 379=false）
 *  都不再影响它。曾用 genSolidType 叠加（379 等生成期翻非实心族被误清坡 →
 *  solidTile 门连锁放行 → #99 T0>373 滴水石笋族 + S1/S2 残坡双症状）。
 *  ★IIIII201（2026-09-03）再勘误：379 静态初值是 **true**（1456 Main.cs:9378 /
 *  1457 Main.cs:9607；曾误记 false——DoUpdateInWorld 的翻 false 是运行窗行为,
 *  静态构造在此之前）,故 SaveSlopes[379]=true,②清坡须保 379 带坡格（见下）。 */
function isSaveSlope(t: number): boolean {
  // ★IIII 补：仓库 TILE_DEFS.solid 与原版 pristine Main.tileSolid 有四族差——
  // ⑴ 平台族 sheet{19,239,380,427,435-439}（原版 tileSolid=true、仓库碰撞语义
  //    solid=false；残坡 S1/S2×154 全是 t19 平台带坡被误清,实测定型）；
  // ⑵ 192 活树叶（Main.cs:10167 初值 true,仓库预翻 false）；
  // ⑶ 481-483 裂砖（Main.cs:7865 初值 true,仓库预翻 false）；
  // ⑷ ★IIIII201（2026-09-03）379 泡泡块（1456 Main.cs:9378 / 1457 Main.cs:9607
  //    静态初值 true,仓库 solid=false=运行时碰撞语义）——TileID.cs:429-432 静态
  //    构造 SaveSlopes=tileSolid∪NonSolidSaveSlopes 在任何生成期翻转之前,故
  //    SaveSlopes[379]=true,②清坡须保 379 带坡格。waterpark 实证：全世界恰 6 格
  //    活性 379 带坡(915,488)-(3340,1001),误清= mile8 #100 Sl=6 残量
  //    (S1>0×3/S2>0×1/S3>0×1/S4>0×1),并经 SolidTile(slope==0) 门级联
  //    #102 水生植物 56/#103 Stalac 208/#105 终清 6269。
  const sh = SHEET_OF[t] ?? -1;
  const pristineSolid = !!TILE_DEFS[t]?.solid
    || sh === 19 || sh === 239 || sh === 380 || sh === 427
    || (sh >= 435 && sh <= 439)
    || sh === 192 || sh === 481 || sh === 482 || sh === 483
    || sh === 379
    // ★IIIII107（2026-09-04）：原版 SaveSlopes[0]=true——Main.tileSolid[0]=true
    //   （1458 Main.cs:7995，与 1456 Main.cs:7759 同款）在 TileID.Sets.PostSetupContent
    //   （1458 TileID.cs:425-432 SaveSlopes=tileSolid∪NonSolidSaveSlopes）之前生效。
    //   残型格（岩浆烧除裸写 type=0 而 active/half/slope 全保留，III213 定谳域）的
    //   JS 镜像=活性 internal-0（sheet 无映射），在 REMIX 深带 3 格带 half/slope
    //   （(3482,851)/(3422,857) H、(3419,858) S）被误 ClearSlope（双清）⇒ mile8
    //   #100..#105 Hf=2/Sl=1 残量。活性 internal-0 须按 vanilla-0（泥土域）保坡。
    || t === 0;
  return pristineSolid || NON_SOLID_SAVE_SLOPES.has(t);
}

/** WorldGen.SolidTile(cs:1456 42370 / 1457 70682):active && tileSolid && !tileSolidTop
 *  && !halfBrick && slope==0 && !inActive。
 *  tileSolid 走 GenSolid（① 的 379 覆写 = pass 头 1456 cs:21331/1457 cs:21704 翻转）;tileSolidTop
 *  近似为 platform(与 HalfBrickPass 同口径)。
 *  ★QQQB 定罪（2026-08-26，s22222 链 #100 滴水石笋 28 格）：曾漏 **!inActive()**——
 *  被致动(inActive 位=wire bit5)的锚格在原版不算实心，⑤ 门应跳过该空格（仅耗
 *  Next(3)）；漏检导致 JS 多进块多掷(U/D/S4)，掷流自首个此类锚起整体错位，
 *  在 x∈[548,567] 洞穴带上游出 28 格滴头残差(T374>0×11/T373>0×7/T0>373×7/T0>374×3,
 *  首差 @(560,340))。离线重放加回该子句后对 rig dump#100 全世界零差(dA=dT=dL=0)。 */
function solidTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  if ((st.wire[i] >>> 5) & 1) return false; // inActive：被致动的格不算实心锚
  const t = st.type[i];
  const d = TILE_DEFS[t];
  return genSolidType(t) && !!d && d.solid && !d.platform && !st.half[i] && st.slope[i] === 0;
}

/** 生成期 KillTile(cs:63559,isGeneratingOrLoadingWorld → noItem=true):
 *  active(false)+half(false)+帧-1+漆清+type=0+inActive(false) → 尾部 SquareTileFrame(i,j)
 *  （cs:63967）级联（cs:63953）。★SSSS：④ 水死族击杀曾只静默清格——缺级联导致
 *  邻格装饰（仙人掌整列/藤/植物族 Check* 链）不被连带击杀 → 后续 ⑤ 滴头门的
 *  SolidTile 锚判定错位（首分叉掷位 251397：(606,683) 门 vanilla 进块 JS 跳过）。
 *  ★UUUU 尘掷勘误（span 流对拍首分叉 @343170 = kill(805,291)sh24 定罪）：
 *  SSSS"水死族零掷"结论有漏——**24（草族，cs:67016 Next(2)!=0?17:14）与 27
 *  （cs:67040 Next(2)!=0?19:3）每杀 10×Next(2)**（KillTile_GetTileDustAmount
 *  默认 10 × MakeTileDust 每调 1 掷）。曾零掷 → 每杀漏 10 掷 → 掷流位移 →
 *  ⑤ 滴头门全线错位（#99 滴头族 79 格残量的根因）。修后全 pass 掷流与 vanilla
 *  2,059,985 掷逐条全同。水死族其余成员（3/20/73/201/80/110/529/530/590/595/
 *  615/637）掷表确为零掷。58 地狱岩浆支（cs:63943）与 TruncatesWalls 族
 *  （{54,328,459,748}∩水死族=∅）不可达，不移植。 */
function killTile(st: TileStore, rng: RNG, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (!st.flags[i]) return;
  const sh = SHEET_OF[st.type[i]!]!;
  if (sh === 24 || sh === 27) {
    for (let k = 0; k < 10; k++) rng.nextInt(2);   // 尘掷：24（草族）/27 → 10×Next(2)
  }
  st.setTileSilent(x, y, 0);
  genSquareTileFrame(st, rng, x, y);   // cs:63967 尾部级联（RRRR 帧杀引擎）
}

/** 按液体类型选滴头(cs:21370-21378/21386-21394:先 lava 再 honey;shimmer 被 !shimmer() 门排除) */
function dripFor(liquidType: number): number {
  if (liquidType === LIQUID_TYPE.LAVA) return DRIP_LAVA;
  if (liquidType === LIQUID_TYPE.HONEY) return DRIP_HONEY;
  if (liquidType === LIQUID_TYPE.SHIMMER) return DRIP_SHIMMER;
  return DRIP_WATER;
}

/** TileID.Sets.IsATreeTrunk（TileID.cs:161）——CanKillTile 的树干保护门 */
// ★BJ182b 收编单源 data/tiles.ts:IS_A_TREE_TRUNK_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const IS_TREE_TRUNK = IS_A_TREE_TRUNK_SHEETS;
/** WorldGen.CanKillTile(i,j)（cs:62260+,162 薄冰语境可达子集）：
 *  上邻树干族（IsATreeTrunk/323,带帧位例外）→ false;wall350 → false;
 *  Boulders+CheckBoulderChest / 门/祭坛等族在 162 语境不可达,略。 */
/** cs:62308-62316 上邻保护族（switch：tile.type != type → false）——箱 21/祭坛 26/
 *  72 仙人掌籽? /77 席地垫? /88 梳妆台/467 宝箱变体/488 倒木（"在 162 语境不可达"
 *  论断对箱下金币堆不成立——12345 #99 (2447,588) 箱下 162 vanilla 存活实证） */
const UP_PROTECT_FAMILY = new Set([21, 26, 72, 77, 88, 467, 488]);
function canKillTile(st: TileStore, x: number, y: number): boolean {
  const i = st.idx(x, y);
  if (st.wall[i] === 350) return false;
  const up = st.idx(x, y - 1);
  if (st.flags[up]) {
    const sh = SHEET_OF[st.type[up]] ?? -1;
    if (UP_PROTECT_FAMILY.has(sh) && SHEET_OF[st.type[i]] !== sh) return false;
    if (IS_TREE_TRUNK.has(sh) || sh === 323) {
      // 帧位例外（cs:62282-84：fx∈{66,88} 的侧枝列与 fy≥198 干身放行）
      const fx = st.frameX[up]!, fy = st.frameY[up]!;
      const sideBranch = (fx === 66 && fy >= 0 && fy <= 44) || (fx === 44 && fy >= 198 && fy <= 242)
        || (fx === 88 && fy >= 66 && fy <= 110) || (fx === 66 && fy >= 198 && fy <= 242);
      if (!sideBranch && fy < 198) return false;
      if (sh === 323 && (fx === 66 || fx === 220)) return false;
    }
  }
  return true;
}

export function runTileCleanupPass(
  st: TileStore, rng: RNG, gs: GenState,
  chests?: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>,
  gp?: import('../GenProgress').GenProgress,
): void {
  // ★① pass 头 tileSolid 翻转（1456 cs:21331 / 1457 cs:21704 `Main.tileSolid[379] = false`）：
  //   泡泡块非实心——原 solidTile/isSaveSlope 内的 BUBBLE 特判已并入 GenSolid
  //   （genSolidType）。pass 尾 ⑫ 还原 true（1456 cs:21750 / 1457 cs:22128,见函数尾）。
  flipGenSolid([379], false);
  const { w, h } = st;

  // ② 全图清坡(cs:21333-21343,全图含边缘,先于内层 40 收缩圈)
  for (let i = 0; i < w; i++) {
    gp?.set3(i / w, 0, 0.1);   // 进度锚：清坡扫≈窗前 10%（估；主体在内层收缩圈）
    for (let j = 0; j < h; j++) {
      const t = st.idx(i, j);
      if (!st.flags[t] || !isSaveSlope(st.type[t])) {
        st.slope[t] = 0;
        st.half[t] = 0; // 原版 ClearSlope = slope(0)+halfBrick(false)(Tile.cs:158-163)
      }
    }
  }

  for (let k = 40; k < w - 40; k++) {
    gp?.set3((k - 40) / Math.max(1, w - 80), 0.1, 1);   // 进度锚：主收缩圈扫
    for (let l = 40; l < h - 40; l++) {
      const i = st.idx(k, l);

      // ③ 坡接半砖修复(cs:21344-21353):topSlope(1/2) 且左坡(2/4)接右邻半砖、
      //    或右坡(1/3)接左邻半砖 → slope=0 + halfBrick=true
      if (st.flags[i] && (st.slope[i] === 1 || st.slope[i] === 2)) {
        const s: number = st.slope[i]; // 显式 number:后续 3/4 比较是全坡面表(外层门只到 1/2)
        const leftSlope = s === 2 || s === 4;
        const rightSlope = s === 1 || s === 3;
        const r = st.idx(k + 1, l);
        const lf = st.idx(k - 1, l);
        if ((leftSlope && st.flags[r] && st.half[r] === 1) || (rightSlope && st.flags[lf] && st.half[lf] === 1)) {
          st.slope[i] = 0;
          st.half[i] = 1;
        }
      }

      // ④ 液体中的 SlowlyDiesInWater 方块清除(cs:21354-21357)
      if (st.flags[i] && st.liquid[i] > 0 && SLOWLY_DIES_IN_WATER.has(st.type[i])) {
        killTile(st, rng, k, l);
      }

      // ⑤ 滴水石笋(cs:21358-21435):空格+无液+上方实心才进
      //   ★IIIII201：落位写侧改直写（type/frameX/frameY/active 四件,照 cs:21393-21397
      //   原文字段集）——曾走 setTileSilent,其 PlaceTile 式 ClearBlockPaintAndCoating
      //   （Tile.cs:934-939 同构位）把格上**生成期涂层位**抹掉：waterpark 泡泡方块
      //   （cs:1788-1794 全方格 fullbrightBlock(true)）内落位的滴头失去亮涂层 →
      //   DoExtraLiquidFinish 的 fullbright 支（cs:1852-1860,type∈{375,373,374,709}
      //   →active(false) 留 ghost）不触发 → mile8 #105 T0>373×244/T0>374×196。
      if (!st.flags[i] && st.liquid[i] === 0 && rng.int(0, 2) !== 0 && solidTile(st, k, l - 1)) {
        // 上扫(cs:21360-21411):l-2 起向上 num(15-20) 格,液体>=128
        let num = rng.int(15, 20); // Next(15,21)
        for (let n2 = l - 2; n2 >= l - num; n2--) {
          const up = st.idx(k, n2);
          if (st.liquid[up] >= 128 && st.liquidType[up] !== LIQUID_TYPE.SHIMMER) {
            const maxValue = l - n2; // 距离,最小 2
            if (rng.int(0, maxValue - 1) <= 1) { // Next(maxValue)
              let drip = dripFor(st.liquidType[up]);
              if (st.wall[i] === BEE_WALL) drip = DRIP_HONEY; // cs:21404
              st.type[i] = drip; st.frameX[i] = 0; st.frameY[i] = 0; st.flags[i] = 1;
              break;
            }
          }
        }
        // 下扫(cs:21413-21429):l+1 起向下 num(3-10) 格,液体>=200
        if (!st.flags[i]) {
          num = rng.int(3, 10); // Next(3,11)
          for (let m = l + 1; m <= l + num; m++) {
            const dn = st.idx(k, m);
            if (st.liquid[dn] >= 200 && st.liquidType[dn] !== LIQUID_TYPE.SHIMMER) {
              const dist = m - l;
              if (rng.int(0, dist * 3 - 1) <= 1) { // Next(dist*3)
                st.type[i] = dripFor(st.liquidType[dn]); st.frameX[i] = 0; st.frameY[i] = 0; st.flags[i] = 1;
                break;
              }
            }
          }
        }
        // 小沙堆(cs:21431-21441):上方是沙岩/硬沙 → 1/4 概率放 461
        if (!st.flags[i] && rng.int(0, 3) === 0) { // Next(4)
          const above = st.idx(k, l - 1);
          if (CONV_SANDSTONE.has(st.type[above]) || CONV_HARDENED_SAND.has(st.type[above])) {
            st.type[i] = SAND_PILE; st.frameX[i] = 0; st.frameY[i] = 0; st.flags[i] = 1;
          }
        }
      }

      // ⑥ 墙 13/14 液体清零(cs:21437-21439)
      if (st.wall[i] === 13 || st.wall[i] === 14) {
        st.liquid[i] = 0; // 原版只清液量,liquidType 位保留
      }
      // ⑥ 墙 87(1456 cs:21441-21458 / 1457 cs:21814-21829)——★IIIII201（2026-09-03）
      //    extraLiquid(waterpark) 分支补接线：曾整臂缺失恒走普通世界清零支。
      //    vanilla extraLiquid 窗口内：liquid>0 → liquidType(0)=清水**液量保留**
      //    （Tile.cs:218-236 清 lava/honey 位）+ 裸 type 374/709/375→373（对非活性
      //    ghost 同样生效）；否则清零。waterpark 定罪：神庙(墙87=LihzahrdBrickUnsafe)
      //    4062 格水(全是 lty=0)被 JS 清空而 vanilla 保留 → mile8 #100 L/Lt=Y1>0×4062；
      //    且池底正下方实心锚(226×173 等)的 ⑤ 上扫读液分歧 → 掷流自神庙列错位 →
      //    滴头族 T373/374/375 位移 1054 格同源（首差 (1418,248) 上窗 y243 水 255）。
      if (st.wall[i] === 87) {
        if (gs.seedFlags.extraLiquid) {
          if (st.liquid[i] > 0) st.liquidType[i] = LIQUID_TYPE.WATER; // liquidType(0)，液量保留
          const sh87 = SHEET_OF[st.type[i]!] ?? -1;
          if (sh87 === 374 || sh87 === 709 || sh87 === 375) st.type[i] = sheetId(373);
        } else {
          st.liquid[i] = 0;
        }
      }

      // ⑦ 137/162 击杀族（cs:21461-21478——★IIII 批补：非纯帧,含 activity 写）
      //    137（雕像,frameY/18 ≤2 或 ==5 时其朝向邻格半砖/坡 → 邻格失活）
      //    162（薄冰,下方无液体且 CanKillTile → 失活——T0>162×387 根因）
      if (st.flags[i] && st.type[i] === sheetId(137)) {
        const fy = Math.floor(st.frameY[i]! / 18);
        if (fy <= 2 || fy === 5) {
          const dir = st.frameX[i]! >= 18 ? 1 : -1;
          const ni2 = st.idx(k + dir, l);
          if (st.half[ni2] === 1 || st.slope[ni2] !== 0) {
            st.flags[ni2] = 0;   // 原版 active(false)——type 残留（八通道不可见）
          }
        }
      } else if (st.flags[i] && st.type[i] === sheetId(162)
        // ★R12-19（2026-08-24）：补双邻门（cs:21851-21857 `!tile3.active() &&
        //  !tile4.active() && tile4.liquid == 0`，tile3=(k,l-1)/tile4=(k,l+1)）——
        //  原版只杀"上下格都空且下方无液"的**孤立悬空**薄冰;曾缺双邻腿 → 贴冰岸/
        //  叠层薄冰被误失活,finalize 幽灵净化后成可见冰面破洞（162 生成量 ~10³ 格）。
        && !st.flags[st.idx(k, l - 1)] && !st.flags[st.idx(k, l + 1)]
        && st.liquid[st.idx(k, l + 1)] === 0 && canKillTile(st, k, l)) {
        st.flags[i] = 0;
      }
      // ⑦ 31/12/639/箱 21·467/28/26 帧规范化重建段（cs:21484-21741，UUUU 批落地：
      //    曾裁"纯帧跳过"有漏——①箱 style 需注册表 item0 反查（Chest.FindChest，
      //    地狱/地牢上锁箱 style23-27 覆写）；②12/639/箱/28/26 底行 WallTypeToTerrain
      //    补格（T0>1/T0>625 残量）；③26 祭坛 3×2 重写+邻列 28/12/639 清理
      //    （T26>25 祭坛重写/T26>0 邻清）；④31 魔珠/猩红心 2×2 重写）
      if (st.flags[i]) {
        const t = st.type[i]!;
        const fx = st.frameX[i]!, fy = st.frameY[i]!;
        // ---- 31 魔珠/猩红心（cs:21484-21512）----
        if (t === sheetId(31)) {
          let num8 = Math.floor(fx / 18);
          let num9 = Math.floor(num8 / 2);
          // 非 drunk 分支覆写（cs:21494）；★IIIII14（1457 cs:21865）：drunk 按本格
          // 背墙判侧——crimstone 墙 83 → 猩红心 style，否则魔珠 style（半侧共存）。
          num9 = gs.seedFlags.drunkWorld
            ? (st.wall[i] === 83 ? 1 : 0)
            : (gs.crimson ? 1 : 0);
          num8 %= 2;
          const num10 = k - num8;
          let num11 = Math.floor(fy / 18);
          const num12 = Math.floor(num11 / 2);
          num11 %= 2;
          const num13 = l - num11;
          for (let n = 0; n < 2; n++) {
            for (let num14 = 0; num14 < 2; num14++) {
              const ni = st.idx(num10 + n, num13 + num14);
              st.flags[ni] = 1; st.slope[ni] = 0; st.half[ni] = 0;
              st.type[ni] = sheetId(31);
              st.frameX[ni] = n * 18 + 36 * num9;
              st.frameY[ni] = num14 * 18 + 36 * num12;
            }
          }
        }
        // ---- 12 水晶之心 / 639 魔力水晶（cs:21513-21570）----
        if (t === sheetId(12) || t === sheetId(639)) {
          let num17 = Math.floor(fx / 18);
          let num18 = Math.floor(num17 / 2);
          num17 %= 2;
          const num19 = k - num17;
          let num20 = Math.floor(fy / 18);
          let num21 = Math.floor(num20 / 2);
          num20 %= 2;
          const num22 = l - num20;
          for (let n = 0; n < 2; n++) {
            for (let num24 = 0; num24 < 2; num24++) {
              const ni = st.idx(num19 + n, num22 + num24);
              st.flags[ni] = 1; st.slope[ni] = 0; st.half[ni] = 0;
              st.type[ni] = t;
              st.frameX[ni] = n * 18 + 36 * num18;
              st.frameY[ni] = num24 * 18 + 36 * num21;
            }
            const bi = st.idx(num19 + n, num22 + 2);
            if (!st.flags[bi]) {
              st.flags[bi] = 1;
              st.type[bi] = sheetId(WALL2TERRAIN[st.wall[bi]] ?? 0);
            }
            st.slope[bi] = 0; st.half[bi] = 0;
          }
        }
        // ---- 箱 21/467（cs:21571-21646）----
        if (t === sheetId(21) || t === sheetId(467)) {
          const ctype = t === sheetId(467) ? sheetId(467) : sheetId(21);
          let num37 = Math.floor(fx / 18);
          let num38 = 0;
          while (num37 >= 2) { num38++; num37 -= 2; }
          const num39 = k - num37;
          const num40 = l - Math.floor(fy / 18);
          if (chests) {
            const fc = chests.find((c) => c && c.x === num39 && c.y === num40);
            const it0 = fc?.items?.[0];
            const van = it0 ? VAN_ID_OF_JS.get(it0.id) : undefined;
            if (van === 1156) num38 = 23;
            else if (van === 1571) num38 = 24;
            else if (van === 1569) num38 = 25;
            else if (van === 1260) num38 = 26;
            else if (van === 1572) num38 = 27;
          }
          for (let n = 0; n < 2; n++) {
            for (let num43 = 0; num43 < 2; num43++) {
              const ni = st.idx(num39 + n, num40 + num43);
              st.flags[ni] = 1; st.slope[ni] = 0; st.half[ni] = 0;
              st.type[ni] = ctype;
              st.frameX[ni] = n * 18 + 36 * num38;
              st.frameY[ni] = num43 * 18;
            }
            const bi = st.idx(num39 + n, num40 + 2);
            if (!st.flags[bi]) {
              st.flags[bi] = 1;
              st.type[bi] = sheetId(WALL2TERRAIN[st.wall[bi]] ?? 0);
            }
            st.slope[bi] = 0; st.half[bi] = 0;
          }
        }
        // ---- 28 瓦罐（cs:21647-21690）----
        if (t === sheetId(28)) {
          let num46 = Math.floor(fx / 18);
          let num47 = 0;
          while (num46 >= 2) { num47++; num46 -= 2; }
          const num48 = k - num46;
          let num49 = Math.floor(fy / 18);
          let num50 = 0;
          while (num49 >= 2) { num50++; num49 -= 2; }
          const num51 = l - num49;
          for (let n = 0; n < 2; n++) {
            for (let num53 = 0; num53 < 2; num53++) {
              const ni = st.idx(num48 + n, num51 + num53);
              st.flags[ni] = 1; st.slope[ni] = 0; st.half[ni] = 0;
              st.type[ni] = sheetId(28);
              st.frameX[ni] = n * 18 + 36 * num47;
              st.frameY[ni] = num53 * 18 + 36 * num50;
            }
            const bi = st.idx(num48 + n, num51 + 2);
            if (!st.flags[bi]) {
              st.flags[bi] = 1;
              st.type[bi] = sheetId(WALL2TERRAIN[st.wall[bi]] ?? 0);
            }
            st.slope[bi] = 0; st.half[bi] = 0;
          }
        }
        // ---- 26 祭坛（cs:21691-21741）----
        if (t === sheetId(26)) {
          let num56 = Math.floor(fx / 18);
          const num58 = k - (num56 % 3);
          const num59 = l - Math.floor(fy / 18);
          // 非 drunk 分支（cs:21713）；★IIIII14（1457 cs:22076）：drunk 按本格背墙
          // 83 判侧（猩红坛/恶魔坛 style 半侧规则，重帧不换族仅校正左右帧带）。
          const num57 = gs.seedFlags.drunkWorld
            ? (st.wall[i] === 83 ? 1 : 0)
            : (gs.crimson ? 1 : 0);
          for (let num60 = 0; num60 < 3; num60++) {
            for (let num61 = 0; num61 < 2; num61++) {
              const ni = st.idx(num58 + num60, num59 + num61);
              st.flags[ni] = 1; st.slope[ni] = 0; st.half[ni] = 0;
              st.type[ni] = sheetId(26);
              st.frameX[ni] = num60 * 18 + 54 * num57;
              st.frameY[ni] = num61 * 18;
            }
            const bi = st.idx(num58 + num60, num59 + 2);
            if (!st.flags[bi]) {
              st.flags[bi] = 1;
              st.type[bi] = sheetId(WALL2TERRAIN[st.wall[bi]] ?? 0);
            }
            // cs:21724-21727：(!tileSolid[t] || tileSolidTop[t]) && !Platforms[t]
            //   → 墙映射补型（tileSolid 生成期=genSolidType，含 379=false 翻转）
            {
              const bs = SHEET_OF[st.type[bi]!] ?? -1;
              if ((!genSolidType(st.type[bi]!) || SOLID_TOP_99.has(bs)) && !PLATFORM_99.has(bs)) {
                st.type[bi] = sheetId(WALL2TERRAIN[st.wall[bi]] ?? 0);
              }
            }
            st.slope[bi] = 0; st.half[bi] = 0;
            // cs:21733-21736：正下 2 行的 28 罐底半 → 清
            const ui = st.idx(num58 + num60, num59 + 3);
            if (st.type[ui] === sheetId(28) && st.frameY[ui]! % 36 >= 18) {
              st.type[ui] = 0; st.flags[ui] = 0;
            }
          }
          // cs:21737-21741：左右邻列 28/12/639 半边清（★右列 639 读的是**左列**
          //   ——原版 num58-1 笔误，bug-for-bug 保留）
          for (let num64 = 0; num64 < 3; num64++) {
            const li = st.idx(num58 - 1, num59 + num64);
            const lSheet = SHEET_OF[st.type[li]!] ?? -1;
            if ((lSheet === 28 || lSheet === 12 || lSheet === 639) && st.frameX[li]! % 36 < 18) {
              st.type[li] = 0; st.flags[li] = 0;
            }
            const ri = st.idx(num58 + 3, num59 + num64);
            const rSheet = SHEET_OF[st.type[ri]!] ?? -1;
            if ((rSheet === 28 || rSheet === 12 || lSheet === 639) && st.frameX[ri]! % 36 >= 18) {
              st.type[ri] = 0; st.flags[ri] = 0;
            }
          }
        }
      }

      // ⑪ 祭坛 237 正下方 232 木刺 → 226 蜥蜴砖(cs:21743-21746)
      if (st.flags[i] && st.type[i] === LIHZARD_ALTAR && st.type[st.idx(k, l + 1)] === WOODEN_SPIKE) {
        st.type[st.idx(k, l + 1)] = LIHZARD_BRICK;
      }
    }
  }

  // ⑫ tileSolid[379] 还原 true(1456 cs:21750 / 1457 cs:22128)——GenSolid 统一还原（① 的 pass 头翻转配对）
  flipGenSolid([379], true);
}
